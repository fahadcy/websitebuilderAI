import express from 'express';
import bcrypt from 'bcrypt';
import fs from 'node:fs/promises';
import { db, getSettings, setSetting } from '../db/database.js';
import { ensureAuth, requireCsrf } from '../middleware/security.js';
import { learningDashboard } from '../learning/feedbackMemory.js';

export const adminRouter = express.Router();

const loginAttempts = new Map();

adminRouter.get('/login', (req, res) => {
  res.send(adminLayout('Login', `<form method="post" class="panel form"><input type="hidden" name="_csrf" value="${res.locals.csrfToken}"><label>Email<input type="email" name="email" required></label><label>Password<input type="password" name="password" required></label><button>Log in</button></form>`));
});

adminRouter.post('/login', requireCsrf, async (req, res) => {
  const email = String(req.body.email || '').toLowerCase();
  const key = `${email}:${req.ip}`;
  const attempt = loginAttempts.get(key);
  if (attempt?.lockedUntil > Date.now()) return res.status(429).send('Locked for 15 minutes.');
  const user = db.prepare('SELECT * FROM builder_users WHERE email = ?').get(email);
  if (user && await bcrypt.compare(req.body.password || '', user.password_hash)) {
    loginAttempts.delete(key);
    req.session.user = { id: user.id, email: user.email, role: user.role };
    return res.redirect('/admin');
  }
  const count = (attempt?.count || 0) + 1;
  loginAttempts.set(key, { count, lockedUntil: count >= 5 ? Date.now() + 15 * 60 * 1000 : 0 });
  res.status(401).send('Invalid login');
});

adminRouter.post('/logout', requireCsrf, (req, res) => req.session.destroy(() => res.redirect('/admin/login')));

adminRouter.get('/', ensureAuth, (req, res) => {
  const sites = db.prepare('SELECT * FROM generated_sites ORDER BY created_at DESC').all();
  const stats = db.prepare('SELECT COUNT(*) total, COALESCE(SUM(api_tokens),0) tokens FROM generated_sites').get();
  const industries = db.prepare('SELECT industry, COUNT(*) count FROM generated_sites GROUP BY industry ORDER BY count DESC LIMIT 5').all();
  res.send(adminLayout('Dashboard', `<section class="metrics"><article><strong>${stats.total}</strong><span>Total sites</span></article><article><strong>${stats.tokens}</strong><span>Tracked API tokens</span></article></section><h2>Generated Sites</h2><table><thead><tr><th>Site</th><th>Industry</th><th>Status</th><th>Reality Check</th><th>Created</th><th>Actions</th></tr></thead><tbody>${sites.map((s) => `<tr><td>${escapeHtml(s.business_name)}<br><small>${escapeHtml(s.prompt)}</small></td><td>${escapeHtml(s.industry)}</td><td>${s.status}</td><td>${s.reality_check_score == null ? 'Not run' : `${s.reality_check_score}/100`}<br><small>${escapeHtml(s.reality_check_verdict || '')}</small></td><td>${s.created_at}</td><td><a href="/preview/${s.id}">Preview</a> <a href="/editor/${s.id}">Edit</a> <a href="/download/${s.id}">Download</a> <form method="post" action="/admin/sites/${s.id}/delete"><input type="hidden" name="_csrf" value="${res.locals.csrfToken}"><button>Delete</button></form></td></tr>`).join('')}</tbody></table><h2>Top Industries</h2><p>${industries.map((i) => `${escapeHtml(i.industry)} (${i.count})`).join(', ') || 'No data yet'}</p><p><a class="button" href="/admin/settings">Global settings</a> <a class="button" href="/admin/learning">Learning dashboard</a></p>`));
});

adminRouter.get('/learning', ensureAuth, (req, res) => {
  const data = learningDashboard();
  res.send(adminLayout('Learning Dashboard', `<section class="metrics"><article><strong>${data.summary.total || 0}</strong><span>Feedback items</span></article><article><strong>${data.summary.average_rating || 'n/a'}</strong><span>Average rating</span></article><article><strong>${data.summary.positive_count || 0}</strong><span>Positive signals</span></article><article><strong>${data.summary.negative_count || 0}</strong><span>Negative signals</span></article></section><h2>Learning Rules</h2><table><thead><tr><th>Scope</th><th>Signal</th><th>Instruction</th><th>Weight</th></tr></thead><tbody>${data.rules.map((rule) => `<tr><td>${escapeHtml(rule.scope)}<br><small>${escapeHtml(rule.industry || 'Global')}</small></td><td>${escapeHtml(rule.signalType)}<br><small>${escapeHtml(rule.title)}</small></td><td>${escapeHtml(rule.instruction)}</td><td>${rule.weight}</td></tr>`).join('') || '<tr><td colspan="4">No learning rules yet. Submit feedback from a preview.</td></tr>'}</tbody></table><h2>Feedback by Industry</h2><table><thead><tr><th>Industry</th><th>Feedback</th><th>Average rating</th></tr></thead><tbody>${data.byIndustry.map((row) => `<tr><td>${escapeHtml(row.industry || 'Unknown')}</td><td>${row.total}</td><td>${row.average_rating || 'n/a'}</td></tr>`).join('') || '<tr><td colspan="3">No feedback yet.</td></tr>'}</tbody></table><h2>Latest Feedback</h2><table><thead><tr><th>Site</th><th>Rating</th><th>Area</th><th>Notes</th></tr></thead><tbody>${data.feedback.map((item) => `<tr><td>${escapeHtml(item.business_name || item.site_id)}<br><small>${escapeHtml(item.industry || '')}</small></td><td>${item.rating}/5</td><td>${escapeHtml(item.category)}</td><td><strong>Liked:</strong> ${escapeHtml(item.positives || '')}<br><strong>Improve:</strong> ${escapeHtml(item.negatives || '')}<br><strong>Next:</strong> ${escapeHtml(item.suggested_changes || item.feedback_text || '')}</td></tr>`).join('') || '<tr><td colspan="4">No feedback submitted yet.</td></tr>'}</tbody></table>`));
});

adminRouter.post('/sites/:siteId/delete', ensureAuth, requireCsrf, async (req, res) => {
  const site = db.prepare('SELECT * FROM generated_sites WHERE id = ?').get(req.params.siteId);
  if (site) {
    await fs.rm(site.output_path, { recursive: true, force: true });
    if (site.zip_path) await fs.rm(site.zip_path, { force: true });
    db.prepare('DELETE FROM generated_sites WHERE id = ?').run(site.id);
  }
  res.redirect('/admin');
});

adminRouter.get('/settings', ensureAuth, (req, res) => {
  const settings = getSettings();
  res.send(adminLayout('Settings', `<form method="post" class="panel form"><input type="hidden" name="_csrf" value="${res.locals.csrfToken}">${['openai_api_key','google_maps_api_key','smtp_host','smtp_port','smtp_user','smtp_from','pricing_heading','pricing_body'].map((k) => `<label>${k}<input name="${k}" value="${escapeHtml(settings[k] || '')}"></label>`).join('')}<button>Save settings</button></form>`));
});

adminRouter.post('/settings', ensureAuth, requireCsrf, (req, res) => {
  for (const [key, value] of Object.entries(req.body)) if (key !== '_csrf') setSetting(key, String(value));
  res.redirect('/admin/settings');
});

function adminLayout(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Builder Admin</title><link rel="stylesheet" href="/assets/css/builder.css"></head><body><header class="topbar"><a href="/admin">Builder Admin</a><nav><a href="/">Builder</a><form method="post" action="/admin/logout"><button>Logout</button></form></nav></header><main class="shell"><h1>${title}</h1>${body}</main></body></html>`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
