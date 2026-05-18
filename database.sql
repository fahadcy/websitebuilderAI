PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS builder_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS generated_sites (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL,
  output_path TEXT NOT NULL,
  zip_path TEXT,
  domain_name TEXT,
  logo_path TEXT,
  reality_check_score INTEGER,
  reality_check_report TEXT,
  reality_check_verdict TEXT,
  deployment_status TEXT NOT NULL DEFAULT 'not_started',
  deployment_target TEXT,
  api_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id TEXT PRIMARY KEY,
  site_id TEXT,
  prompt TEXT NOT NULL,
  metadata TEXT,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  current_step TEXT,
  error TEXT,
  created_ip TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS builder_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS api_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,
  model TEXT,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  feedback_text TEXT,
  positives TEXT,
  negatives TEXT,
  suggested_changes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(site_id) REFERENCES generated_sites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS learning_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL DEFAULT 'global',
  industry TEXT,
  signal_type TEXT NOT NULL,
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 1,
  source_count INTEGER NOT NULL DEFAULT 1,
  last_feedback_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
