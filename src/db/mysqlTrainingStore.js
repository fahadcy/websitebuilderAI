import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';

let pool;
let migrated = false;
let lastError = null;

export function mysqlTrainingConfigured() {
  return Boolean(mysqlConfig());
}

export function mysqlTrainingStatus() {
  return {
    configured: mysqlTrainingConfigured(),
    migrated,
    lastError: lastError ? lastError.message : null
  };
}

export async function migrateMysqlTrainingStore() {
  const db = await getPool();
  if (!db || migrated) return false;
  await db.query(`
    CREATE TABLE IF NOT EXISTS builder_generation_runs (
      site_id VARCHAR(160) PRIMARY KEY,
      business_name VARCHAR(255) NOT NULL,
      industry VARCHAR(255) NOT NULL,
      prompt_text MEDIUMTEXT NOT NULL,
      status VARCHAR(80) NOT NULL,
      output_path TEXT,
      zip_path TEXT,
      domain_name VARCHAR(255),
      logo_path TEXT,
      brief_json LONGTEXT,
      content_json LONGTEXT,
      tokens_json LONGTEXT,
      blueprint_json LONGTEXT,
      metadata_json LONGTEXT,
      learning_context_json LONGTEXT,
      template_profile_json LONGTEXT,
      design_intelligence_json LONGTEXT,
      reality_check_score INT,
      reality_check_verdict VARCHAR(120),
      reality_check_json LONGTEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS builder_generation_pages (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      site_id VARCHAR(160) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      title VARCHAR(500),
      html LONGTEXT,
      text_content LONGTEXT,
      word_count INT NOT NULL DEFAULT 0,
      section_count INT NOT NULL DEFAULT 0,
      form_count INT NOT NULL DEFAULT 0,
      image_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_generation_page (site_id, file_path),
      KEY idx_generation_pages_site (site_id),
      CONSTRAINT fk_generation_pages_site FOREIGN KEY (site_id) REFERENCES builder_generation_runs(site_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS builder_generation_assets (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      site_id VARCHAR(160) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      asset_type VARCHAR(80) NOT NULL,
      content LONGTEXT,
      metadata_json LONGTEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_generation_asset (site_id, file_path),
      KEY idx_generation_assets_site (site_id),
      CONSTRAINT fk_generation_assets_site FOREIGN KEY (site_id) REFERENCES builder_generation_runs(site_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS builder_quality_reports (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      site_id VARCHAR(160) NOT NULL,
      score INT,
      verdict VARCHAR(120),
      summary TEXT,
      blockers INT NOT NULL DEFAULT 0,
      warnings INT NOT NULL DEFAULT 0,
      report_json LONGTEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_quality_site (site_id),
      CONSTRAINT fk_quality_site FOREIGN KEY (site_id) REFERENCES builder_generation_runs(site_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS builder_feedback_signals (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      site_id VARCHAR(160) NOT NULL,
      sqlite_feedback_id BIGINT,
      rating INT NOT NULL,
      category VARCHAR(120) NOT NULL DEFAULT 'general',
      feedback_text MEDIUMTEXT,
      positives MEDIUMTEXT,
      negatives MEDIUMTEXT,
      suggested_changes MEDIUMTEXT,
      reward_delta DECIMAL(6,4) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_feedback_site (site_id),
      KEY idx_feedback_rating (rating),
      UNIQUE KEY uniq_feedback_sqlite (site_id, sqlite_feedback_id),
      CONSTRAINT fk_feedback_site FOREIGN KEY (site_id) REFERENCES builder_generation_runs(site_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS builder_learning_rules (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      scope VARCHAR(80) NOT NULL,
      industry VARCHAR(255),
      signal_type VARCHAR(80) NOT NULL,
      title VARCHAR(255) NOT NULL,
      instruction MEDIUMTEXT NOT NULL,
      weight INT NOT NULL DEFAULT 1,
      source_count INT NOT NULL DEFAULT 1,
      source_site_id VARCHAR(160),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_learning_rule (scope, industry, signal_type, title, instruction(255))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS builder_training_examples (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      site_id VARCHAR(160) NOT NULL,
      example_type VARCHAR(80) NOT NULL DEFAULT 'site_generation',
      input_json LONGTEXT NOT NULL,
      output_json LONGTEXT NOT NULL,
      reward_score DECIMAL(6,4) NOT NULL DEFAULT 0,
      reward_source VARCHAR(120) NOT NULL DEFAULT 'reality_check',
      reward_reason TEXT,
      status VARCHAR(80) NOT NULL DEFAULT 'candidate',
      split_name VARCHAR(40) NOT NULL DEFAULT 'train',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_training_site (site_id),
      KEY idx_training_reward (reward_score),
      KEY idx_training_status (status),
      CONSTRAINT fk_training_site FOREIGN KEY (site_id) REFERENCES builder_generation_runs(site_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS builder_rl_events (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      site_id VARCHAR(160) NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      reward DECIMAL(6,4) NOT NULL DEFAULT 0,
      state_json LONGTEXT,
      action_json LONGTEXT,
      outcome_json LONGTEXT,
      notes MEDIUMTEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_rl_site (site_id),
      KEY idx_rl_type (event_type),
      CONSTRAINT fk_rl_site FOREIGN KEY (site_id) REFERENCES builder_generation_runs(site_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureMysqlUniqueKey(db, 'builder_feedback_signals', 'uniq_feedback_sqlite', '(site_id, sqlite_feedback_id)');
  await createReportingViews(db);
  migrated = true;
  return true;
}

export async function recordGenerationForTraining({ site, prompt, outDir, zipPath, audit }) {
  return safeMysql('record generation training data', async (db) => {
    await upsertGenerationRun(db, { site, prompt, outDir, zipPath, audit });
    await recordPagesAndAssets(db, site.siteId, outDir);
    await insertQualityReport(db, site.siteId, audit);
    await upsertTrainingExample(db, { site, prompt, audit, outDir });
    await insertRlEvent(db, {
      siteId: site.siteId,
      eventType: 'generation_completed',
      reward: rewardFromAudit(audit),
      state: generationInput(site, prompt),
      action: generationOutput(site, outDir),
      outcome: { score: audit?.score ?? null, verdict: audit?.verdict || null },
      notes: audit?.summary || ''
    });
  });
}

export async function recordFeedbackForTraining({ site, feedback, learningRules = [] }) {
  return safeMysql('record feedback training data', async (db) => {
    await ensureGeneratedSiteStub(db, site);
    const reward = rewardFromRating(feedback.rating);
    await db.execute(`
      INSERT INTO builder_feedback_signals
        (site_id, sqlite_feedback_id, rating, category, feedback_text, positives, negatives, suggested_changes, reward_delta)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        rating = VALUES(rating),
        category = VALUES(category),
        feedback_text = VALUES(feedback_text),
        positives = VALUES(positives),
        negatives = VALUES(negatives),
        suggested_changes = VALUES(suggested_changes),
        reward_delta = VALUES(reward_delta)
    `, [
      site.id,
      feedback.id || null,
      feedback.rating,
      feedback.category || 'general',
      feedback.feedbackText || '',
      feedback.positives || '',
      feedback.negatives || '',
      feedback.suggestedChanges || '',
      reward
    ]);
    for (const rule of learningRules) await upsertMysqlLearningRule(db, rule, site.id);
    await db.execute(`
      INSERT INTO builder_rl_events (site_id, event_type, reward, state_json, action_json, outcome_json, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      site.id,
      'human_feedback',
      reward,
      json({ prompt: site.prompt, industry: site.industry }),
      json({ generatedSiteId: site.id }),
      json(feedback),
      [feedback.positives, feedback.negatives, feedback.suggestedChanges, feedback.feedbackText].filter(Boolean).join(' | ')
    ]);
  });
}

export async function recordRealityCheckForTraining({ site, audit }) {
  return safeMysql('record reality check training data', async (db) => {
    await ensureGeneratedSiteStub(db, site);
    await insertQualityReport(db, site.id, audit);
    await db.execute(`
      UPDATE builder_generation_runs
      SET reality_check_score = ?, reality_check_verdict = ?, reality_check_json = ?
      WHERE site_id = ?
    `, [audit?.score ?? null, audit?.verdict || null, json(audit), site.id]);
    await db.execute(`
      INSERT INTO builder_rl_events (site_id, event_type, reward, outcome_json, notes)
      VALUES (?, ?, ?, ?, ?)
    `, [site.id, 'reality_check_rerun', rewardFromAudit(audit), json(audit), audit?.summary || '']);
  });
}

export async function recordManualEditForTraining({ site, file, html, audit }) {
  return safeMysql('record manual edit training data', async (db) => {
    await ensureGeneratedSiteStub(db, site);
    await db.execute(`
      INSERT INTO builder_rl_events (site_id, event_type, reward, state_json, action_json, outcome_json, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      site.id,
      'manual_edit',
      rewardFromAudit(audit),
      json({ file, beforeSiteId: site.id }),
      json({ file, html }),
      json({ auditScore: audit?.score ?? null, auditVerdict: audit?.verdict || null }),
      `Manual editor saved ${file}`
    ]);
  });
}

export async function recordGeneratedSiteRecordForTraining({ site }) {
  return safeMysql('record generated site mirror data', async (db) => {
    await ensureGeneratedSiteStub(db, site);
    if (site.output_path && await pathExists(site.output_path)) await recordPagesAndAssets(db, site.id, site.output_path);
    const audit = parseJson(site.reality_check_report);
    if (audit) {
      await db.execute(`
        UPDATE builder_generation_runs
        SET reality_check_score = ?, reality_check_verdict = ?, reality_check_json = ?
        WHERE site_id = ?
      `, [audit?.score ?? site.reality_check_score ?? null, audit?.verdict || site.reality_check_verdict || null, json(audit), site.id]);
    }
  });
}

export async function getMysqlBuilderOverview() {
  const status = mysqlTrainingStatus();
  const db = await getPool();
  if (!db) return { status, configured: status.configured, connected: false, metrics: {}, sites: [], feedback: [], tables: [] };
  try {
    await migrateMysqlTrainingStore();
    const [[metrics]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM builder_generation_runs) AS generated_sites,
        (SELECT COUNT(*) FROM builder_generation_pages) AS generated_pages,
        (SELECT COUNT(*) FROM builder_feedback_signals) AS feedback_items,
        (SELECT COUNT(*) FROM builder_learning_rules) AS learning_rules,
        (SELECT COUNT(*) FROM builder_training_examples) AS training_examples,
        (SELECT COUNT(*) FROM builder_rl_events) AS reward_events
    `);
    const [sites] = await db.query(`
      SELECT site_id, business_name, industry, status, domain_name, reality_check_score, reality_check_verdict, output_path, zip_path, created_at, updated_at
      FROM builder_generated_sites
      ORDER BY updated_at DESC
      LIMIT 50
    `);
    const [feedback] = await db.query(`
      SELECT id, site_id, business_name, industry, rating, category, positives, negatives, suggested_changes, reward_delta, created_at
      FROM builder_teach_builder_feedback
      ORDER BY created_at DESC
      LIMIT 50
    `);
    const [tables] = await db.query(`
      SELECT TABLE_NAME AS table_name, TABLE_TYPE AS table_type
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME LIKE 'builder\\_%'
      ORDER BY TABLE_TYPE, TABLE_NAME
    `);
    return {
      status: mysqlTrainingStatus(),
      configured: true,
      connected: true,
      metrics,
      sites,
      feedback,
      tables
    };
  } catch (error) {
    lastError = error;
    return { status: mysqlTrainingStatus(), configured: true, connected: false, error: error.message, metrics: {}, sites: [], feedback: [], tables: [] };
  }
}

export async function exportTrainingData({ outputDir = path.join(process.cwd(), 'data', 'training') } = {}) {
  const db = await getPool();
  if (!db) throw new Error('MySQL training store is not configured. Set BUILDER_MYSQL_URL or BUILDER_MYSQL_HOST/BUILDER_MYSQL_DATABASE.');
  await migrateMysqlTrainingStore();
  await fs.mkdir(outputDir, { recursive: true });
  const [examples] = await db.query(`
    SELECT id, site_id, example_type, input_json, output_json, reward_score, reward_source, reward_reason, status, split_name, created_at
    FROM builder_training_examples
    ORDER BY id ASC
  `);
  const [events] = await db.query(`
    SELECT id, site_id, event_type, reward, state_json, action_json, outcome_json, notes, created_at
    FROM builder_rl_events
    ORDER BY id ASC
  `);
  const examplesPath = path.join(outputDir, 'website-training-examples.jsonl');
  const eventsPath = path.join(outputDir, 'website-rl-events.jsonl');
  await fs.writeFile(examplesPath, examples.map((row) => JSON.stringify({
    id: row.id,
    site_id: row.site_id,
    type: row.example_type,
    input: parseJson(row.input_json),
    output: parseJson(row.output_json),
    reward: Number(row.reward_score || 0),
    reward_source: row.reward_source,
    reward_reason: row.reward_reason,
    status: row.status,
    split: row.split_name,
    created_at: row.created_at
  })).join('\n') + (examples.length ? '\n' : ''), 'utf8');
  await fs.writeFile(eventsPath, events.map((row) => JSON.stringify({
    id: row.id,
    site_id: row.site_id,
    event_type: row.event_type,
    reward: Number(row.reward || 0),
    state: parseJson(row.state_json),
    action: parseJson(row.action_json),
    outcome: parseJson(row.outcome_json),
    notes: row.notes,
    created_at: row.created_at
  })).join('\n') + (events.length ? '\n' : ''), 'utf8');
  return {
    outputDir,
    examplesPath,
    eventsPath,
    examples: examples.length,
    events: events.length
  };
}

async function safeMysql(label, action) {
  const db = await getPool();
  if (!db) return false;
  try {
    await migrateMysqlTrainingStore();
    await action(db);
    return true;
  } catch (error) {
    lastError = error;
    console.warn(`MySQL training store skipped ${label}: ${error.message}`);
    return false;
  }
}

async function ensureMysqlUniqueKey(db, table, keyName, columnsSql) {
  const [rows] = await db.query(`SHOW INDEX FROM ${table} WHERE Key_name = ?`, [keyName]);
  if (rows.length) return;
  await db.query(`ALTER TABLE ${table} ADD UNIQUE KEY ${keyName} ${columnsSql}`);
}

async function createReportingViews(db) {
  await db.query(`
    CREATE OR REPLACE VIEW builder_generated_sites AS
    SELECT
      site_id,
      business_name,
      industry,
      prompt_text,
      status,
      domain_name,
      output_path,
      zip_path,
      logo_path,
      reality_check_score,
      reality_check_verdict,
      created_at,
      updated_at
    FROM builder_generation_runs
  `);
  await db.query(`
    CREATE OR REPLACE VIEW builder_teach_builder_feedback AS
    SELECT
      f.id,
      f.site_id,
      g.business_name,
      g.industry,
      f.sqlite_feedback_id,
      f.rating,
      f.category,
      f.feedback_text,
      f.positives,
      f.negatives,
      f.suggested_changes,
      f.reward_delta,
      f.created_at
    FROM builder_feedback_signals f
    LEFT JOIN builder_generation_runs g ON g.site_id = f.site_id
  `);
}

async function getPool() {
  if (pool) return pool;
  const config = mysqlConfig();
  if (!config) return null;
  try {
    pool = mysql.createPool(config);
    return pool;
  } catch (error) {
    lastError = error;
    console.warn(`MySQL training store unavailable: ${error.message}`);
    return null;
  }
}

function mysqlConfig() {
  const url = process.env.BUILDER_MYSQL_URL || process.env.TRAINING_MYSQL_URL || process.env.MYSQL_URL;
  if (url) {
    return {
      uri: url,
      waitForConnections: true,
      connectionLimit: Number(process.env.BUILDER_MYSQL_CONNECTION_LIMIT || 5),
      namedPlaceholders: false
    };
  }
  const database = process.env.BUILDER_MYSQL_DATABASE || process.env.TRAINING_MYSQL_DATABASE || process.env.MYSQL_DATABASE;
  const host = process.env.BUILDER_MYSQL_HOST || process.env.TRAINING_MYSQL_HOST || process.env.MYSQL_HOST;
  if (!database || !host) return null;
  return {
    host,
    port: Number(process.env.BUILDER_MYSQL_PORT || process.env.TRAINING_MYSQL_PORT || process.env.MYSQL_PORT || 3306),
    user: process.env.BUILDER_MYSQL_USER || process.env.TRAINING_MYSQL_USER || process.env.MYSQL_USER || 'root',
    password: process.env.BUILDER_MYSQL_PASSWORD || process.env.TRAINING_MYSQL_PASSWORD || process.env.MYSQL_PASSWORD || '',
    database,
    waitForConnections: true,
    connectionLimit: Number(process.env.BUILDER_MYSQL_CONNECTION_LIMIT || 5),
    charset: 'utf8mb4'
  };
}

async function upsertGenerationRun(db, { site, prompt, outDir, zipPath, audit }) {
  await db.execute(`
    INSERT INTO builder_generation_runs
      (site_id, business_name, industry, prompt_text, status, output_path, zip_path, domain_name, logo_path,
       brief_json, content_json, tokens_json, blueprint_json, metadata_json, learning_context_json,
       template_profile_json, design_intelligence_json, reality_check_score, reality_check_verdict, reality_check_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      business_name = VALUES(business_name),
      industry = VALUES(industry),
      prompt_text = VALUES(prompt_text),
      status = VALUES(status),
      output_path = VALUES(output_path),
      zip_path = VALUES(zip_path),
      domain_name = VALUES(domain_name),
      logo_path = VALUES(logo_path),
      brief_json = VALUES(brief_json),
      content_json = VALUES(content_json),
      tokens_json = VALUES(tokens_json),
      blueprint_json = VALUES(blueprint_json),
      metadata_json = VALUES(metadata_json),
      learning_context_json = VALUES(learning_context_json),
      template_profile_json = VALUES(template_profile_json),
      design_intelligence_json = VALUES(design_intelligence_json),
      reality_check_score = VALUES(reality_check_score),
      reality_check_verdict = VALUES(reality_check_verdict),
      reality_check_json = VALUES(reality_check_json)
  `, [
    site.siteId,
    site.brief?.businessName || site.businessName || 'Unknown',
    site.brief?.industry || site.industry || 'General',
    prompt || site.metadata?.prompt || '',
    'complete',
    outDir || '',
    zipPath || '',
    site.domain || site.metadata?.domainName || null,
    site.logoFile || null,
    json(site.brief),
    json(site.content),
    json(site.tokens),
    json(site.blueprint),
    json(site.metadata),
    json(site.learningContext),
    json(site.templateProfile),
    json(site.designIntelligence),
    audit?.score ?? null,
    audit?.verdict || null,
    json(audit)
  ]);
}

async function ensureGeneratedSiteStub(db, site) {
  await db.execute(`
    INSERT INTO builder_generation_runs (site_id, business_name, industry, prompt_text, status, output_path, zip_path, reality_check_score, reality_check_verdict, reality_check_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE business_name = VALUES(business_name), industry = VALUES(industry), prompt_text = VALUES(prompt_text)
  `, [
    site.id,
    site.business_name || site.businessName || 'Unknown',
    site.industry || 'General',
    site.prompt || '',
    site.status || 'complete',
    site.output_path || '',
    site.zip_path || '',
    site.reality_check_score ?? null,
    site.reality_check_verdict || null,
    site.reality_check_report || null
  ]);
}

async function recordPagesAndAssets(db, siteId, outDir) {
  const names = await fs.readdir(outDir);
  const htmlFiles = names.filter((name) => name.endsWith('.html') && name !== 'style-guide.html');
  for (const file of htmlFiles) {
    const html = await readOptional(path.join(outDir, file));
    await db.execute(`
      INSERT INTO builder_generation_pages (site_id, file_path, title, html, text_content, word_count, section_count, form_count, image_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title), html = VALUES(html), text_content = VALUES(text_content),
        word_count = VALUES(word_count), section_count = VALUES(section_count),
        form_count = VALUES(form_count), image_count = VALUES(image_count)
    `, [
      siteId,
      file,
      titleFromHtml(html),
      html,
      stripTags(html),
      wordCount(stripTags(html)),
      count(html, /<section\b/gi),
      count(html, /<form\b/gi),
      count(html, /<img\b/gi)
    ]);
  }
  const css = await readOptional(path.join(outDir, 'assets', 'css', 'styles.css'));
  const js = await readOptional(path.join(outDir, 'assets', 'js', 'app.js'));
  if (css) await upsertAsset(db, siteId, 'assets/css/styles.css', 'css', css, {});
  if (js) await upsertAsset(db, siteId, 'assets/js/app.js', 'js', js, {});
}

async function upsertAsset(db, siteId, filePath, assetType, content, metadata) {
  await db.execute(`
    INSERT INTO builder_generation_assets (site_id, file_path, asset_type, content, metadata_json)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE asset_type = VALUES(asset_type), content = VALUES(content), metadata_json = VALUES(metadata_json)
  `, [siteId, filePath, assetType, content, json(metadata)]);
}

async function insertQualityReport(db, siteId, audit) {
  await db.execute(`
    INSERT INTO builder_quality_reports (site_id, score, verdict, summary, blockers, warnings, report_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    siteId,
    audit?.score ?? null,
    audit?.verdict || null,
    audit?.summary || '',
    (audit?.checks || []).filter((check) => !check.passed && check.severity === 'blocker').length,
    (audit?.checks || []).filter((check) => !check.passed && check.severity !== 'blocker').length,
    json(audit)
  ]);
}

async function upsertTrainingExample(db, { site, prompt, audit, outDir }) {
  const status = audit?.score >= 88 ? 'approved_candidate' : 'needs_review';
  await db.execute(`
    INSERT INTO builder_training_examples
      (site_id, example_type, input_json, output_json, reward_score, reward_source, reward_reason, status, split_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    site.siteId,
    'site_generation',
    json(generationInput(site, prompt)),
    json(generationOutput(site, outDir)),
    rewardFromAudit(audit),
    'reality_check',
    audit?.summary || '',
    status,
    splitForSite(site.siteId)
  ]);
}

async function upsertMysqlLearningRule(db, rule, siteId) {
  await db.execute(`
    INSERT INTO builder_learning_rules
      (scope, industry, signal_type, title, instruction, weight, source_count, source_site_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      weight = weight + VALUES(weight),
      source_count = source_count + VALUES(source_count),
      source_site_id = VALUES(source_site_id)
  `, [
    rule.scope || 'global',
    rule.industry || null,
    rule.signalType || rule.signal_type || 'request',
    rule.title || 'Learning signal',
    rule.instruction || '',
    rule.weight || 1,
    rule.sourceCount || rule.source_count || 1,
    siteId
  ]);
}

async function insertRlEvent(db, { siteId, eventType, reward, state, action, outcome, notes }) {
  await db.execute(`
    INSERT INTO builder_rl_events (site_id, event_type, reward, state_json, action_json, outcome_json, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [siteId, eventType, reward, json(state), json(action), json(outcome), notes || '']);
}

function generationInput(site, prompt) {
  return {
    prompt,
    brief: site.brief,
    metadata: site.metadata,
    learningContext: site.learningContext,
    blueprint: site.blueprint
  };
}

function generationOutput(site, outDir) {
  return {
    siteId: site.siteId,
    outputPath: outDir,
    content: site.content,
    tokens: site.tokens,
    templateProfile: site.templateProfile,
    designIntelligence: site.designIntelligence,
    imagePlan: site.imagePlan,
    generatedImages: site.generatedImages
  };
}

function rewardFromAudit(audit) {
  return Number(((audit?.score || 0) / 100).toFixed(4));
}

function rewardFromRating(rating) {
  return Number(((Math.max(1, Math.min(5, Number(rating) || 3)) - 3) / 2).toFixed(4));
}

function splitForSite(siteId) {
  const bucket = Math.abs(hash(siteId)) % 10;
  if (bucket === 0) return 'test';
  if (bucket === 1) return 'validation';
  return 'train';
}

function json(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return value;
  }
}

async function readOptional(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return '';
  }
}

async function pathExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function titleFromHtml(html) {
  return (html.match(/<title>([^<]+)<\/title>/i)?.[1] || '').trim().slice(0, 500);
}

function stripTags(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordCount(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

function count(text, pattern) {
  return (String(text || '').match(pattern) || []).length;
}

function hash(value) {
  let h = 0;
  for (const char of String(value || '')) h = ((h << 5) - h + char.charCodeAt(0)) | 0;
  return h;
}
