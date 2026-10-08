import { db } from '../db/database.js';
import { recordFeedbackForTraining } from '../db/mysqlTrainingStore.js';
import { appendTeachLog } from './teachLog.js';

const MAX_NOTE = 1200;

export async function recordSiteFeedback(siteId, payload = {}, options = {}) {
  const site = db.prepare('SELECT id, industry, business_name, prompt, status, output_path, zip_path, domain_name, created_at, reality_check_score, reality_check_report, reality_check_verdict FROM generated_sites WHERE id = ?').get(siteId);
  if (!site) return null;
  const feedback = normalizeFeedback(payload);
  const result = db.prepare(`INSERT INTO site_feedback
    (site_id, rating, category, feedback_text, positives, negatives, suggested_changes)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(site.id, feedback.rating, feedback.category, feedback.feedbackText, feedback.positives, feedback.negatives, feedback.suggestedChanges);

  const signals = feedbackToSignals(feedback, site.industry);
  for (const signal of signals) upsertLearningRule(signal);
  const saved = { id: result.lastInsertRowid, ...feedback, site };
  saved.mysqlSaved = await recordFeedbackForTraining({ site, feedback: saved, learningRules: signals.map(publicSignal) });
  try {
    saved.logPath = await appendTeachLog({ feedbackId: saved.id, site, feedback, learningRules: signals, siteUrl: options.siteUrl });
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
  const signals = [];
  const scope = 'industry';
  const targetIndustry = normalizeIndustry(industry);
  if (feedback.rating >= 4 && (feedback.positives || feedback.feedbackText)) {
    signals.push(rule(scope, targetIndustry, 'positive', 'User liked this direction', `Keep doing this when relevant: ${feedback.positives || feedback.feedbackText}`));
  }
  if (feedback.rating <= 3 && (feedback.negatives || feedback.feedbackText)) {
    signals.push(rule(scope, targetIndustry, 'negative', 'User disliked this issue', `Avoid or improve this: ${feedback.negatives || feedback.feedbackText}`));
  }
  if (feedback.suggestedChanges) {
    signals.push(rule(scope, targetIndustry, 'request', 'User requested improvement', `Add or improve: ${feedback.suggestedChanges}`));
  }
  if (feedback.rating <= 2 && feedback.category) {
    signals.push(rule('global', '', 'negative', `Low rating: ${feedback.category}`, `For future sites, pay extra attention to ${feedback.category}.`));
  }
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
