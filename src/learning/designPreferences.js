// Design preference learner.
//
// Turns structured Teach Builder feedback (dials, per-aspect ratings, style verdicts,
// section thumbs, quick issues) into a numeric profile the studio engine reads directly:
// which design directions / section layouts to favour or avoid, and how to tune motion,
// colour strength, text size, spacing, theme, hero height and contrast.
//
// Lessons from the same industry count fully; lessons saved with scope "all sites" count
// for every industry at a lower weight. Older lessons fade (45-day half-life) so the
// engine follows current taste rather than the first piece of feedback it ever got.

import { db } from '../db/database.js';
import { DIRECTIONS } from '../generator/studio/directions.js';

export const ASPECTS = [
  ['layout', 'Layout & structure'],
  ['colours', 'Colours'],
  ['typography', 'Typography'],
  ['images', 'Images'],
  ['copy', 'Copy & wording'],
  ['animation', 'Animation & motion'],
  ['mobile', 'Mobile'],
  ['brief', 'Followed my brief']
];

export const DIALS = {
  motion: { label: 'Animation', options: ['Less', 'Just right', 'More'] },
  colour: { label: 'Colour strength', options: ['Calmer', 'Just right', 'Bolder'] },
  textSize: { label: 'Text size', options: ['Smaller', 'Just right', 'Bigger'] },
  spacing: { label: 'Spacing', options: ['Tighter', 'Just right', 'Roomier'] },
  theme: { label: 'Light / dark', options: ['Lighter', 'Just right', 'Darker'] },
  heroHeight: { label: 'Hero height', options: ['Shorter', 'Just right', 'Taller'] }
};

export const ISSUES = {
  images_irrelevant: { label: "Images don't match the business", image: 'Every image must literally show this business\'s own subject (its products, place, services and customers) - nothing generic or unrelated.' },
  images_corporate: { label: 'Images feel stock / corporate', image: 'Avoid corporate stock-photo looks (offices, handshakes, laptops, posed smiling staff). Use candid, specific, characterful photography.' },
  text_hard_to_read: { label: 'Text hard to read', tune: { contrast: 1, textSize: 0.4 } },
  looks_generic: { label: 'Looks generic / template-like', tune: { variety: 1 }, copy: 'Write specific, distinctive copy for this exact business; no generic marketing filler.' },
  pages_same: { label: 'Pages look too similar', tune: { variety: 1 } },
  hero_too_tall: { label: 'Hero too big', tune: { heroHeight: -1 } },
  too_much_text: { label: 'Too much text', tune: { spacing: 0.3 }, copy: 'Keep copy short and scannable: tight paragraphs, fewer words per section.' },
  too_little_text: { label: 'Too little detail', copy: 'Give fuller, more informative copy with concrete details, prices, steps and facts from the brief.' },
  missing_brief: { label: 'Missed things from my brief', copy: 'Use every specific detail in the brief (names, services, prices, locations, features, pages). Never drop or replace requested items.' },
  unclear_cta: { label: 'Buttons / next step unclear', copy: 'Every section needs one clear, specific call to action that says exactly what happens next.' },
  too_much_motion: { label: 'Too much animation', tune: { motion: -1 } },
  too_static: { label: 'Feels static / boring', tune: { motion: 1, variety: 0.5 } },
  colours_off_brand: { label: 'Colours wrong for the brand', tune: { colour: -0.3 }, copy: '' },
  mobile_broken: { label: 'Problems on mobile', tune: { textSize: -0.3 } }
};

const HALF_LIFE_DAYS = 45;
const TUNE_KEYS = ['motion', 'colour', 'textSize', 'spacing', 'theme', 'heroHeight', 'contrast', 'variety'];

export function normalizeDetails(raw = {}) {
  const source = typeof raw === 'string' ? safeJson(raw) : raw || {};
  const aspects = {};
  for (const [key] of ASPECTS) {
    const value = Number(source.aspects?.[key]);
    if (value >= 1 && value <= 5) aspects[key] = Math.round(value);
  }
  const dials = {};
  for (const key of Object.keys(DIALS)) {
    const value = Number(source.dials?.[key]);
    if (value === -1 || value === 1) dials[key] = value;
  }
  const sections = {};
  for (const [key, value] of Object.entries(source.sections || {})) {
    const n = Number(value);
    if (/^[a-zA-Z]{2,30}$/.test(key) && (n === 1 || n === -1)) sections[key] = n;
  }
  const issues = [...new Set((Array.isArray(source.issues) ? source.issues : []).filter((id) => ISSUES[id]))];
  const style = ['love', 'ok', 'avoid'].includes(source.style) ? source.style : null;
  const scope = source.scope === 'global' ? 'global' : 'industry';
  const missed = String(source.missed || '').trim().replace(/\s+/g, ' ').slice(0, 1200);
  const imageNotes = String(source.imageNotes || '').trim().replace(/\s+/g, ' ').slice(0, 800);
  return { aspects, dials, sections, issues, style, scope, missed, imageNotes };
}

export function detailsAreEmpty(details) {
  return !Object.keys(details.aspects).length && !Object.keys(details.dials).length && !Object.keys(details.sections).length
    && !details.issues.length && !details.style && !details.missed && !details.imageNotes;
}

/** Plain-English lines describing one piece of structured feedback (used in logs and lessons). */
export function describeDetails(details, design = {}) {
  const lines = [];
  for (const [key, value] of Object.entries(details.dials)) lines.push(`${DIALS[key].label}: ${DIALS[key].options[value + 1]}`);
  const aspectLine = ASPECTS.filter(([key]) => details.aspects[key]).map(([key, label]) => `${label} ${details.aspects[key]}/5`).join(', ');
  if (aspectLine) lines.push(`Scores: ${aspectLine}`);
  if (details.style && design.directionName) lines.push(`Style "${design.directionName}": ${details.style === 'love' ? 'use more for this industry' : details.style === 'avoid' ? 'do not use for this industry' : 'fine'}`);
  const thumbs = Object.entries(details.sections).map(([key, value]) => `${key}${design.variants?.[key] ? ` (${design.variants[key]})` : ''} ${value > 0 ? 'liked' : 'disliked'}`);
  if (thumbs.length) lines.push(`Sections: ${thumbs.join(', ')}`);
  if (details.issues.length) lines.push(`Issues: ${details.issues.map((id) => ISSUES[id].label).join('; ')}`);
  if (details.missed) lines.push(`Missed from brief: ${details.missed}`);
  if (details.imageNotes) lines.push(`Image notes: ${details.imageNotes}`);
  lines.push(`Applies to: ${details.scope === 'global' ? 'all future sites' : 'this industry'}`);
  return lines;
}

/**
 * Learned design profile for an industry. Every field is optional for the engine:
 * tune values are in [-1, 1], directionBias / variantBias are additive scores.
 */
export function getDesignPreferences({ industry = '' } = {}) {
  const empty = { industry, samples: 0, tune: {}, directionBias: {}, variantBias: {}, imageGuidance: '', copyGuidance: '', summary: [] };
  let rows = [];
  try {
    rows = db.prepare(`SELECT f.rating, f.category, f.details_json, f.created_at, s.industry, s.design_json
      FROM site_feedback f JOIN generated_sites s ON s.id = f.site_id
      WHERE f.details_json IS NOT NULL OR f.rating IS NOT NULL
      ORDER BY f.created_at DESC LIMIT 400`).all();
  } catch {
    return empty;
  }
  const target = String(industry || '').toLowerCase();
  const now = Date.now();
  const sums = Object.fromEntries(TUNE_KEYS.map((key) => [key, 0]));
  const weights = Object.fromEntries(TUNE_KEYS.map((key) => [key, 0]));
  const directionBias = {};
  const variantBias = {};
  const imageNotes = new Map();
  const copyNotes = new Map();
  let samples = 0;

  for (const row of rows) {
    const details = normalizeDetails(row.details_json || {});
    const sameIndustry = String(row.industry || '').toLowerCase() === target;
    const scopeWeight = sameIndustry ? 1 : details.scope === 'global' ? 0.6 : 0;
    if (!scopeWeight) continue;
    const ageDays = Math.max(0, (now - Date.parse(`${String(row.created_at).replace(' ', 'T')}Z`)) / 86400000) || 0;
    const w = scopeWeight * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    const design = safeJson(row.design_json) || {};
    samples += 1;

    const add = (key, value, weight = w) => { sums[key] += value * weight; weights[key] += weight; };
    for (const [key, value] of Object.entries(details.dials)) add(key, value);
    for (const id of details.issues) for (const [key, value] of Object.entries(ISSUES[id].tune || {})) add(key, value, w * 0.8);
    // A poorly rated animation with no dial set most often means "too much".
    if (details.aspects.animation <= 2 && details.dials.motion === undefined && !details.issues.includes('too_static')) add('motion', -0.5, w * 0.5);
    if (details.aspects.typography <= 2 || details.aspects.mobile <= 2) add('contrast', 0.5, w * 0.5);

    // Style verdicts and overall ratings move the design direction for this industry only.
    if (design.direction && sameIndustry) {
      const fromStyle = details.style === 'love' ? 1.2 : details.style === 'avoid' ? -2.5 : 0;
      const fromRating = (Number(row.rating || 3) - 3) * 0.35;
      directionBias[design.direction] = (directionBias[design.direction] || 0) + (fromStyle + fromRating) * w;
    }
    // Section thumbs (and a low layout score) move individual section layouts.
    for (const [kind, value] of Object.entries(details.sections)) {
      const variant = design.variants?.[kind];
      if (!variant) continue;
      variantBias[kind] ||= {};
      variantBias[kind][variant] = (variantBias[kind][variant] || 0) + value * w * (sameIndustry ? 1 : 0.6);
    }
    if (details.aspects.layout <= 2 && design.variants?.hero && sameIndustry) {
      variantBias.hero ||= {};
      variantBias.hero[design.variants.hero] = (variantBias.hero[design.variants.hero] || 0) - 0.5 * w;
    }

    for (const id of details.issues) {
      if (ISSUES[id].image) bump(imageNotes, ISSUES[id].image, w);
      if (ISSUES[id].copy) bump(copyNotes, ISSUES[id].copy, w);
    }
    if (details.imageNotes) bump(imageNotes, details.imageNotes, w);
    if (details.missed) bump(copyNotes, `Previously missed from similar briefs, so include it when relevant: ${details.missed}`, w);
    if (details.aspects.images <= 2) bump(imageNotes, 'Earlier images for this kind of business were rated poorly: make every image specific to the subject, authentic and on-theme.', w * 0.7);
    if (details.aspects.copy <= 2) bump(copyNotes, 'Earlier copy for this kind of business was rated poorly: be concrete, specific and benefit-led.', w * 0.7);
    if (details.aspects.brief <= 2) bump(copyNotes, 'Earlier sites did not follow the brief closely enough: treat every stated requirement as mandatory.', w * 0.7);
  }

  // Bayesian-style damping: a single lesson moves a dial about two thirds of the way.
  const tune = {};
  for (const key of TUNE_KEYS) {
    if (!weights[key]) continue;
    const value = clamp(sums[key] / (weights[key] + 0.5), -1, 1);
    if (Math.abs(value) >= 0.15) tune[key] = round(value);
  }
  for (const id of Object.keys(directionBias)) directionBias[id] = round(directionBias[id]);
  for (const kind of Object.keys(variantBias)) for (const v of Object.keys(variantBias[kind])) variantBias[kind][v] = round(variantBias[kind][v]);

  const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([text]) => text);
  const profile = {
    industry,
    samples,
    tune,
    directionBias,
    variantBias,
    imageGuidance: top(imageNotes, 3).join(' '),
    copyGuidance: top(copyNotes, 4).join(' ')
  };
  profile.summary = summarizeProfile(profile);
  return profile;
}

export function summarizeProfile(profile) {
  const out = [];
  const words = {
    motion: ['less animation', 'more animation'],
    colour: ['calmer colours', 'bolder colours'],
    textSize: ['smaller text', 'bigger text'],
    spacing: ['tighter spacing', 'roomier spacing'],
    theme: ['lighter theme', 'darker theme'],
    heroHeight: ['shorter hero', 'taller hero'],
    contrast: ['', 'higher text contrast'],
    variety: ['', 'more layout variety']
  };
  for (const [key, value] of Object.entries(profile.tune || {})) {
    const word = words[key]?.[value > 0 ? 1 : 0];
    if (word) out.push(`${word} (${Math.round(Math.abs(value) * 100)}%)`);
  }
  for (const [id, value] of Object.entries(profile.directionBias || {})) {
    const name = DIRECTIONS[id]?.name || id;
    if (value <= -0.8) out.push(`avoid the "${name}" style`);
    else if (value >= 0.6) out.push(`favour the "${name}" style`);
  }
  for (const [kind, map] of Object.entries(profile.variantBias || {})) {
    for (const [variant, value] of Object.entries(map)) {
      if (value <= -0.5) out.push(`avoid ${kind} layout "${variant}"`);
      else if (value >= 0.5) out.push(`favour ${kind} layout "${variant}"`);
    }
  }
  if (profile.imageGuidance) out.push('image direction from feedback');
  if (profile.copyGuidance) out.push('copy rules from feedback');
  return out;
}

function bump(map, text, weight) {
  const key = String(text).trim();
  if (key) map.set(key, (map.get(key) || 0) + weight);
}

function safeJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value) => Math.round(value * 100) / 100;
