import session from 'express-session';
import { db } from './database.js';

db.exec(`CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expired_at INTEGER NOT NULL
)`);

export class BetterSqliteSessionStore extends session.Store {
  get(sid, callback) {
    try {
      const row = db.prepare('SELECT sess, expired_at FROM sessions WHERE sid = ?').get(sid);
      if (!row || row.expired_at < Date.now()) return callback(null, null);
      callback(null, JSON.parse(row.sess));
    } catch (error) {
      callback(error);
    }
  }

  set(sid, sess, callback) {
    try {
      const maxAge = sess.cookie?.maxAge || 24 * 60 * 60 * 1000;
      db.prepare('INSERT INTO sessions (sid, sess, expired_at) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired_at = excluded.expired_at')
        .run(sid, JSON.stringify(sess), Date.now() + maxAge);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  destroy(sid, callback) {
    try {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }
}
