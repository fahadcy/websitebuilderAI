// Plain-text audit log of every Teach Builder submission.
//
// Each entry records the full prompt the site was generated from, what the builder
// produced (business, industry, quality score) and exactly what the reviewer entered,
// so the history can be read, searched or downloaded later.
// File: data/teach-builder-log.txt (override with TEACH_LOG_PATH).

import fs from 'node:fs/promises';
import path from 'node:path';

const LOG_PATH = process.env.TEACH_LOG_PATH || path.join(process.cwd(), 'data', 'teach-builder-log.txt');
const RULE = '='.repeat(80);

export function teachLogPath() {
  return LOG_PATH;
}

export async function appendTeachLog({ feedbackId, site, feedback, learningRules = [], siteUrl = '' }) {
  const audit = parseJson(site.reality_check_report);
  const block = [
    RULE,
    `TEACH BUILDER FEEDBACK #${feedbackId}`,
    `Saved:            ${new Date().toISOString()}`,
    RULE,
    '',
    '--- SITE ---',
    `Site ID:          ${site.id}`,
    `Business:         ${site.business_name || ''}`,
    `Industry:         ${site.industry || ''}`,
    `Domain:           ${site.domain_name || ''}`,
    `Generated:        ${site.created_at || ''}`,
    siteUrl ? `Preview:          ${siteUrl}` : '',
    `Quality score:    ${site.reality_check_score == null ? 'not run' : `${site.reality_check_score}/100`} (${site.reality_check_verdict || 'n/a'})`,
    audit?.summary ? `Quality summary:  ${audit.summary}` : '',
    '',
    '--- PROMPT GIVEN ---',
    String(site.prompt || '').trim(),
    '',
    '--- TEACH BUILDER INPUT ---',
    `Rating:           ${feedback.rating}/5`,
    `Area:             ${feedback.category}`,
    `What worked well: ${feedback.positives || '(blank)'}`,
    `Avoid / improve:  ${feedback.negatives || '(blank)'}`,
    `Specific change:  ${feedback.suggestedChanges || '(blank)'}`,
    feedback.feedbackText ? `Other notes:      ${feedback.feedbackText}` : '',
    '',
    '--- LEARNING RULES CREATED FROM THIS FEEDBACK ---',
    ...(learningRules.length
      ? learningRules.map((rule) => `- [${rule.scope}${rule.industry ? `: ${rule.industry}` : ''} | ${rule.signalType}] ${rule.instruction}`)
      : ['(none - add notes or a specific change to create rules)']),
    '',
    ''
  ].filter((line) => line !== null).join('\n').replace(/\n{3,}/g, '\n\n');

  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
  await fs.appendFile(LOG_PATH, `${block}\n`, 'utf8');
  return LOG_PATH;
}

export async function readTeachLog() {
  try {
    return await fs.readFile(LOG_PATH, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

function parseJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}
