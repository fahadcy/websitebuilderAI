import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import fs from 'node:fs';
import path from 'node:path';
import { migrateMysqlTrainingStore, mysqlTrainingConfigured } from './mysqlTrainingStore.js';

const root = process.cwd();
const dataDir = path.join(root, 'data');
const dbPath = path.join(dataDir, 'builder.sqlite');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

export async function migrate() {
  const schema = fs.readFileSync(path.join(root, 'database.sql'), 'utf8');
  db.exec(schema);
  ensureColumn('generated_sites', 'domain_name', 'TEXT');
  ensureColumn('generated_sites', 'logo_path', 'TEXT');
  ensureColumn('generated_sites', 'reality_check_score', 'INTEGER');
  ensureColumn('generated_sites', 'reality_check_report', 'TEXT');
  ensureColumn('generated_sites', 'reality_check_verdict', 'TEXT');
  ensureColumn('generated_sites', 'deployment_status', "TEXT NOT NULL DEFAULT 'not_started'");
  ensureColumn('generated_sites', 'deployment_target', 'TEXT');
  ensureColumn('generation_jobs', 'metadata', 'TEXT');
  ensureColumn('site_feedback', 'positives', 'TEXT');
  ensureColumn('site_feedback', 'negatives', 'TEXT');
  ensureColumn('site_feedback', 'suggested_changes', 'TEXT');

  const adminEmail = process.env.BUILDER_ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.BUILDER_ADMIN_PASSWORD || 'admin123';
  const existing = db.prepare('SELECT id FROM builder_users WHERE email = ?').get(adminEmail);
  if (!existing) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    db.prepare('INSERT INTO builder_users (email, password_hash, role) VALUES (?, ?, ?)').run(adminEmail, passwordHash, 'admin');
  }

  if (mysqlTrainingConfigured()) {
    try {
      await migrateMysqlTrainingStore();
    } catch (error) {
      console.warn(`MySQL training store migration skipped: ${error.message}`);
    }
  }
}

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM builder_settings').all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function setSetting(key, value) {
  db.prepare('INSERT INTO builder_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
