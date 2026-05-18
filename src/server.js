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
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }
}));
app.use(injectCsrf);
app.use(express.static(path.join(root, 'public'), { maxAge: '1h' }));
app.use('/generated-sites', express.static(path.join(root, 'generated-sites')));
app.use(publicRouter);
app.use('/admin', adminRouter);

const port = Number(process.env.PORT || 3000);

async function startServer() {
  await migrate();
  app.listen(port, () => {
    console.log(`Website Builder running at http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start Website Builder:', error);
  process.exit(1);
});
