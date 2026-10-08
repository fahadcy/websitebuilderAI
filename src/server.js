import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import path from 'node:path';
import { migrate } from './db/database.js';
import { BetterSqliteSessionStore } from './db/sessionStore.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin.js';
import { injectCsrf } from './middleware/security.js';

const app = express();
const root = process.cwd();
const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);

// Render (and most PaaS hosts) sit behind a reverse proxy that sets X-Forwarded-For.
// Trusting the first proxy hop lets express-rate-limit see the real client IP and lets
// express-session issue `secure` cookies over the proxied HTTPS connection.
// Override with TRUST_PROXY (e.g. "2", "true", "loopback") if your topology differs.
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY, isProduction ? 1 : false));
app.disable('x-powered-by');

app.set('view engine', 'ejs');
app.set('views', path.join(root, 'src', 'views'));
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(session({
  store: new BetterSqliteSessionStore(),
  secret: process.env.SESSION_SECRET || 'dev-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: 1000 * 60 * 60 * 12 }
}));
app.get('/healthz', (req, res) => res.json({ status: 'ok', uptime: Math.round(process.uptime()) }));
app.use(injectCsrf);
app.use(express.static(path.join(root, 'public'), { maxAge: '1h' }));
app.use('/generated-sites', express.static(path.join(root, 'generated-sites')));
app.use(publicRouter);
app.use('/admin', adminRouter);

app.use((error, req, res, next) => {
  console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, error);
  if (res.headersSent) return next(error);
  const status = error.status || error.statusCode || 500;
  const message = status >= 500 ? 'Something went wrong. Please try again.' : error.message;
  if (req.accepts(['json', 'html']) === 'json') return res.status(status).json({ error: message });
  return res.status(status).send(message);
});

const port = Number(process.env.PORT || 3000);

function parseTrustProxy(value, fallback) {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const asNumber = Number(value);
  return Number.isInteger(asNumber) ? asNumber : value;
}

async function startServer() {
  await migrate();
  const server = app.listen(port, () => {
    console.log(`Website Builder running at http://localhost:${port}`);
    if (!process.env.OPENAI_API_KEY) console.log('OPENAI_API_KEY not set: using the local fallback generator.');
    else console.log(`OpenAI text model: ${process.env.OPENAI_TEXT_MODEL || 'gpt-4o'}`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, closing server...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((error) => {
  console.error('Failed to start Website Builder:', error);
  process.exit(1);
});
