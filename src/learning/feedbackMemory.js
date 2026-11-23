import fs from 'node:fs';
import path from 'node:path';
import { DIRECTIONS } from '../generator/studio/directions.js';
import { db } from '../db/database.js';
import { recordFeedbackForTraining } from '../db/mysqlTrainingStore.js';
import { appendTeachLog } from './teachLog.js';
import { normalizeDetails, detailsAreEmpty, describeDetails, getDesignPreferences, DIALS, ISSUES } from './designPreferences.js';

const MAX_NOTE = 1200;

export async function recordSiteFeedback(siteId, payload = {}, options = {}) {
  const site = db.prepare('SELECT id, industry, business_name, prompt, status, output_path, zip_path, domain_name, created_at, reality_check_score, reality_check_report, reality_check_verdict, design_json FROM generated_sites WHERE id = ?').get(siteId);
  if (!site) return null;
  const feedback = normalizeFeedback(payload);
  const design = siteDesign(site);
  const details = normalizeDetails(payload.details || {});
  const hasDetails = !detailsAreEmpty(details);
  const detailLines = hasDetails ? describeDetails(details, design || {}) : [];
  // Keep a snapshot of the design next to the feedback so lessons stay tied to what was rated.
  const detailsRecord = hasDetails ? { ...details, design: design ? { direction: design.direction, directionName: design.directionName, mode: design.mode, variants: design.variants } : null } : null;
  const result = db.prepare(`INSERT INTO site_feedback
    (site_id, rating, category, feedback_text, positives, negatives, suggested_changes, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(site.id, feedback.rating, feedback.category, feedback.feedbackText, feedback.positives, feedback.negatives, feedback.suggestedChanges, detailsRecord ? JSON.stringify(detailsRecord) : null);

  const signals = [...feedbackToSignals(feedback, site.industry), ...detailsToSignals(details, site.industry, design)];
  for (const signal of signals) upsertLearningRule(signal);
  const profile = getDesignPreferences({ industry: site.industry });
  const saved = { id: result.lastInsertRowid, ...feedback, details: detailsRecord, detailLines, site, signalsCreated: signals.length + (hasDetails ? 1 : 0), profile };
  saved.mysqlSaved = await recordFeedbackForTraining({ site, feedback: saved, learningRules: signals.map(publicSignal) });
  try {
    saved.logPath = await appendTeachLog({ feedbackId: saved.id, site, feedback, learningRules: signals, siteUrl: options.siteUrl, design, detailLines, profile });
  } catch (error) {
    console.warn(`Teach Builder text log not written: ${error.message}`);
  }
  return saved;
}

export function getLearningContext({ industry = '', prompt = '' } = {}) {
  const detected = normalizeIndustry(industry || inferIndustry(prompt));
  const industryRows = db.prepare(`SELECT * FROM learning_rules
    WHERE scope = 'industry' AND lower(industry) = lower(?)
    ORDER BY weight DESC, updated_at DESC LIMIT 8`).all(detected);
  const globalRows = db.prepare(`SELECT * FROM learning_rules
    WHERE scope = 'global'
    ORDER BY weight DESC, updated_at DESC LIMIT 6`).all();
  const rows = [...industryRows, ...globalRows];
  const positives = rows.filter((row) => row.signal_type === 'positive').slice(0, 5);
  const negatives = rows.filter((row) => row.signal_type === 'negative').slice(0, 5);
  const requests = rows.filter((row) => row.signal_type === 'request').slice(0, 5);
  const promptGuidance = [
    positives.length ? `Repeat what users liked: ${positives.map((row) => row.instruction).join(' ')}` : '',
    negatives.length ? `Avoid known disappointments: ${negatives.map((row) => row.instruction).join(' ')}` : '',
    requests.length ? `Prioritise requested improvements: ${requests.map((row) => row.instruction).join(' ')}` : ''
  ].filter(Boolean).join('\n');
  return {
    industry: detected,
    rules: rows.map(publicRule),
    promptGuidance,
    hasLearning: rows.length > 0
  };
}

export function learningDashboard() {
  const summary = db.prepare(`SELECT
      COUNT(*) total,
      ROUND(AVG(rating), 1) average_rating,
      SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) positive_count,
      SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) negative_count
    FROM site_feedback`).get();
  const rules = db.prepare('SELECT * FROM learning_rules ORDER BY weight DESC, updated_at DESC LIMIT 40').all().map(publicRule);
  const feedback = db.prepare(`SELECT f.*, s.business_name, s.industry
    FROM site_feedback f
    LEFT JOIN generated_sites s ON s.id = f.site_id
    ORDER BY f.created_at DESC LIMIT 40`).all();
  const byIndustry = db.prepare(`SELECT s.industry, COUNT(*) total, ROUND(AVG(f.rating), 1) average_rating
    FROM site_feedback f
    LEFT JOIN generated_sites s ON s.id = f.site_id
    GROUP BY s.industry
    ORDER BY total DESC, average_rating DESC`).all();
  return { summary, rules, feedback, byIndustry };
}

function normalizeFeedback(payload) {
  const rating = Math.max(1, Math.min(5, Number(payload.rating || 0) || 3));
  return {
    rating,
    category: clean(payload.category || 'general', 80),
    feedbackText: clean(payload.feedbackText || payload.feedback || '', MAX_NOTE),
    positives: clean(payload.positives || '', MAX_NOTE),
    negatives: clean(payload.negatives || '', MAX_NOTE),
    suggestedChanges: clean(payload.suggestedChanges || payload.suggestions || '', MAX_NOTE)
  };
}

function feedbackToSignals(feedback, industry) {
  // Every filled-in box becomes a lesson, whatever the rating. (Previously "worked well"
  // only counted for 4-5 stars and "avoid" only for 1-3 stars, so mixed feedback was lost.)
  const signals = [];
  const scope = 'industry';
  const targetIndustry = normalizeIndustry(industry);
  if (feedback.positives) {
    signals.push(rule(scope, targetIndustry, 'positive', 'User liked this direction', `Keep doing this when relevant: ${feedback.positives}`));
  }
  if (feedback.negatives) {
    signals.push(rule(scope, targetIndustry, 'negative', 'User disliked this issue', `Avoid or improve this: ${feedback.negatives}`));
  }
  if (feedback.suggestedChanges) {
    signals.push(rule(scope, targetIndustry, 'request', 'User requested improvement', `Add or improve: ${feedback.suggestedChanges}`));
  }
  if (feedback.feedbackText) {
    signals.push(rule(scope, targetIndustry, feedback.rating >= 4 ? 'positive' : 'negative', feedback.rating >= 4 ? 'User liked this direction' : 'User disliked this issue', `${feedback.rating >= 4 ? 'Keep doing this when relevant' : 'Avoid or improve this'}: ${feedback.feedbackText}`));
  }
  if (feedback.rating <= 2 && feedback.category) {
    signals.push(rule('global', '', 'negative', `Low rating: ${feedback.category}`, `For future sites, pay extra attention to ${feedback.category}.`));
  }
  return signals;
}

export function siteDesign(site) {
  if (site?.design_json) {
    try { return JSON.parse(site.design_json); } catch { /* fall through */ }
  }
  // Sites generated before design tracking: the chosen style is still on the <html> tag.
  try {
    const head = fs.readFileSync(path.join(site.output_path || '', 'index.html'), 'utf8').slice(0, 1500);
    const direction = head.match(/data-direction="([a-z]+)"/)?.[1];
    if (!direction) return null;
    return { direction, directionName: DIRECTIONS[direction]?.name || direction, mode: head.match(/data-theme="(light|dark)"/)?.[1] || '', variants: {}, sections: [] };
  } catch {
    return null;
  }
}

/** Text lessons from the structured options, so the AI copywriter hears them too. */
function detailsToSignals(details, industry, design) {
  const signals = [];
  const scope = details.scope === 'global' ? 'global' : 'industry';
  const target = scope === 'global' ? '' : normalizeIndustry(industry);
  for (const id of details.issues) {
    signals.push(rule(scope, target, 'negative', `Issue: ${ISSUES[id].label}`, `Avoid: ${ISSUES[id].label.toLowerCase()}.${ISSUES[id].copy ? ` ${ISSUES[id].copy}` : ''}`));
  }
  if (details.missed) signals.push(rule(scope, target, 'request', 'Missed from brief', `Do not miss details like this from the brief: ${details.missed}`));
  if (details.imageNotes) signals.push(rule(scope, target, 'request', 'Image direction', `Images: ${details.imageNotes}`));
  for (const [key, value] of Object.entries(details.dials)) {
    signals.push(rule(scope, target, 'request', `Tuning: ${DIALS[key].label}`, `${DIALS[key].label}: ${DIALS[key].options[value + 1].toLowerCase()} than before.`));
  }
  if (details.style === 'love' && design?.directionName) signals.push(rule('industry', normalizeIndustry(industry), 'positive', 'Liked design style', `The "${design.directionName}" style suits ${normalizeIndustry(industry)} sites.`));
  if (details.style === 'avoid' && design?.directionName) signals.push(rule('industry', normalizeIndustry(industry), 'negative', 'Rejected design style', `The "${design.directionName}" style does not suit ${normalizeIndustry(industry)} sites.`));
  return signals;
}

function rule(scope, industry, signalType, title, instruction) {
  return {
    scope,
    industry,
    signalType,
    title: clean(title, 120),
    instruction: clean(instruction, 600)
  };
}

function upsertLearningRule(signal) {
  const existing = db.prepare(`SELECT id, weight, source_count FROM learning_rules
    WHERE scope = ? AND COALESCE(industry, '') = COALESCE(?, '') AND signal_type = ? AND title = ? AND instruction = ?`)
    .get(signal.scope, signal.industry || null, signal.signalType, signal.title, signal.instruction);
  if (existing) {
    db.prepare(`UPDATE learning_rules
      SET weight = ?, source_count = ?, last_feedback_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(existing.weight + 1, existing.source_count + 1, existing.id);
    return;
  }
  db.prepare(`INSERT INTO learning_rules
    (scope, industry, signal_type, title, instruction, weight, source_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(signal.scope, signal.industry || null, signal.signalType, signal.title, signal.instruction, 1, 1);
}

function publicRule(row) {
  return {
    id: row.id,
    scope: row.scope,
    industry: row.industry,
    signalType: row.signal_type,
    title: row.title,
    instruction: row.instruction,
    weight: row.weight,
    sourceCount: row.source_count,
    updatedAt: row.updated_at
  };
}

function publicSignal(signal) {
  return {
    scope: signal.scope,
    industry: signal.industry,
    signalType: signal.signalType,
    title: signal.title,
    instruction: signal.instruction,
    weight: 1,
    sourceCount: 1
  };
}

function clean(value, max) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function normalizeIndustry(value) {
  return clean(value || 'General', 120) || 'General';
}

function inferIndustry(prompt = '') {
  const text = String(prompt).toLowerCase();
  if (/shoe|footwear|trainer|sneaker|shop|sale/.test(text)) return 'Shoe Retail';
  if (/insolvency|restructuring|business advisory|finance|accountant|law|legal/.test(text)) return 'Professional Services';
  if (/dental|clinic|health|physio|therapy/.test(text)) return 'Healthcare';
  if (/restaurant|menu|reservation|cafe|food/.test(text)) return 'Hospitality';
  if (/software|saas|app|platform|dashboard/.test(text)) return 'Software Platform';
  if (/tutor|tuition|school|course|education/.test(text)) return 'Education';
  return 'General';
}
