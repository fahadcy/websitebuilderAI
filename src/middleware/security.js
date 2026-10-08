import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';

export const generationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.GENERATION_LIMIT_PER_HOUR || 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Generation limit reached. Try again in an hour.' }
});

export function ensureAuth(req, res, next) {
  if (req.session?.user) return next();
  return res.redirect('/admin/login');
}

export function injectCsrf(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

export function requireCsrf(req, res, next) {
  const token = req.body?._csrf || req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrfToken) return res.status(403).send('Invalid CSRF token');
  next();
}
