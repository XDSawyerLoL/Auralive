import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from './config.js';

let pool;

export const LATEST_SCHEMA_VERSION = 2;

export function getDb() {
  if (pool) return pool;
  pool = config.dbUrl
    ? mysql.createPool({ uri: config.dbUrl, connectionLimit: config.dbConnectionLimit, connectTimeout: config.dbConnectTimeoutMs, charset: 'utf8mb4' })
    : mysql.createPool({
        host: config.dbHost,
        port: config.dbPort,
        user: config.dbUser,
        password: config.dbPassword,
        database: config.dbName,
        connectionLimit: config.dbConnectionLimit,
        connectTimeout: config.dbConnectTimeoutMs,
        charset: 'utf8mb4',
        timezone: 'Z',
      });
  return pool;
}

export async function query(sql, params = []) {
  const [rows] = await getDb().execute(sql, params);
  return rows;
}

export async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

async function ensureMigrationTable(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS aura_schema_migrations (
    version INT PRIMARY KEY,
    name VARCHAR(240) NOT NULL,
    applied_at VARCHAR(40) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

async function applyMigrations(db) {
  await ensureMigrationTable(db);
  const [rows] = await db.query('SELECT COALESCE(MAX(version), 0) AS version FROM aura_schema_migrations');
  let current = Number(rows?.[0]?.version || 0);

  if (current < 1) {
    await db.query(
      'INSERT IGNORE INTO aura_schema_migrations(version,name,applied_at) VALUES(1,?,?)',
      ['baseline-cloud-schema', new Date().toISOString()],
    );
    current = 1;
  }

  if (current < 2) {
    await db.query(`CREATE TABLE IF NOT EXISTS aura_state_snapshots (
      id CHAR(36) PRIMARY KEY,
      reason VARCHAR(120) NOT NULL,
      schema_version INT NOT NULL,
      payload LONGTEXT NOT NULL,
      payload_bytes BIGINT NOT NULL DEFAULT 0,
      created_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_state_snapshots_created(created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS aura_runtime_metric_rollups (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      payload LONGTEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_metric_rollups_created(created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(
      'INSERT INTO aura_schema_migrations(version,name,applied_at) VALUES(2,?,?)',
      ['resilience-snapshots-and-metrics', new Date().toISOString()],
    );
  }
}

export async function initSchema() {
  const db = getDb();
  await ensureMigrationTable(db);
  const statements = [
    `CREATE TABLE IF NOT EXISTS aura_soul_state (
      id TINYINT PRIMARY KEY,
      state LONGTEXT NOT NULL,
      updated_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS aura_cognitive_traces (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      kind VARCHAR(80) NOT NULL,
      title VARCHAR(240) NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      context LONGTEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_cognitive_traces_created(created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS aura_reflections (
      id CHAR(36) PRIMARY KEY,
      trigger_name VARCHAR(160) NOT NULL,
      title VARCHAR(240) NOT NULL,
      summary TEXT NOT NULL,
      hypothesis TEXT NOT NULL,
      next_action TEXT NOT NULL,
      confidence DOUBLE NOT NULL DEFAULT 0,
      context LONGTEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_reflections_created(created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS aura_intentions (
      id CHAR(36) PRIMARY KEY,
      statement TEXT NOT NULL,
      priority DOUBLE NOT NULL DEFAULT 0.5,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      source VARCHAR(100) NOT NULL DEFAULT 'aura',
      context LONGTEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_intentions_status(status, priority, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS aura_lessons (
      id CHAR(36) PRIMARY KEY,
      lesson_key VARCHAR(260) NOT NULL UNIQUE,
      content TEXT NOT NULL,
      confidence DOUBLE NOT NULL DEFAULT 0.5,
      evidence_count INT NOT NULL DEFAULT 1,
      source VARCHAR(100) NOT NULL DEFAULT 'experience',
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS aura_routines (
      id CHAR(36) PRIMARY KEY,
      name VARCHAR(160) NOT NULL UNIQUE,
      prompt TEXT NOT NULL,
      every_seconds INT NOT NULL,
      mode VARCHAR(32) NOT NULL DEFAULT 'reflect',
      enabled TINYINT NOT NULL DEFAULT 1,
      last_run_at BIGINT NOT NULL DEFAULT 0,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS aura_outcomes (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      automation_id VARCHAR(220) NOT NULL,
      event_type VARCHAR(220) NOT NULL,
      ok TINYINT NOT NULL,
      signature VARCHAR(500) NOT NULL,
      report LONGTEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_outcomes_automation(automation_id, ok, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS aura_improvement_proposals (
      id CHAR(36) PRIMARY KEY,
      target VARCHAR(500) NOT NULL,
      diagnosis TEXT NOT NULL,
      proposal TEXT NOT NULL,
      validation_plan TEXT NOT NULL,
      risk VARCHAR(80) NOT NULL DEFAULT 'review',
      status VARCHAR(40) NOT NULL DEFAULT 'proposed',
      evidence_count INT NOT NULL DEFAULT 0,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_improvements_status(status, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS aura_cloud_messages (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      author VARCHAR(120) NOT NULL,
      role ENUM('user','assistant') NOT NULL,
      content TEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS aura_organism_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      kind VARCHAR(80) NOT NULL,
      reason VARCHAR(500) NOT NULL DEFAULT '',
      payload LONGTEXT NOT NULL,
      state LONGTEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_organism_events_created(created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS aura_surprise_events (
      kind VARCHAR(240) PRIMARY KEY,
      count BIGINT NOT NULL DEFAULT 0,
      last_surprise DOUBLE NOT NULL DEFAULT 0,
      updated_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS aura_surprise_memory (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      kind VARCHAR(240) NOT NULL,
      content TEXT NOT NULL,
      surprise DOUBLE NOT NULL,
      context LONGTEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_surprise_memory_score(surprise,created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS horizon_bridge_seen (
      signal_id VARCHAR(220) PRIMARY KEY,
      entity_key VARCHAR(300) NOT NULL,
      aura_event VARCHAR(120) NOT NULL,
      observed_at VARCHAR(40) NOT NULL,
      first_seen_at VARCHAR(40) NOT NULL,
      INDEX idx_horizon_seen_first(first_seen_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS aura_evolution_cycles (
      id CHAR(36) PRIMARY KEY,
      trigger_name VARCHAR(80) NOT NULL,
      objective TEXT NOT NULL,
      status VARCHAR(40) NOT NULL,
      research LONGTEXT NOT NULL,
      diagnosis LONGTEXT NOT NULL,
      candidate LONGTEXT NOT NULL,
      validation LONGTEXT NOT NULL,
      promotion LONGTEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_evolution_status(status, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS aura_evolution_canary (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      cycle_id CHAR(36) NOT NULL,
      passed TINYINT NOT NULL,
      observations INT NOT NULL DEFAULT 0,
      metrics LONGTEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_evolution_canary_cycle(cycle_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS aura_execution_jobs (
      id CHAR(36) PRIMARY KEY,
      kind VARCHAR(40) NOT NULL,
      payload LONGTEXT NOT NULL,
      requested_risks LONGTEXT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'queued',
      attempts INT NOT NULL DEFAULT 0,
      lease_owner VARCHAR(160) NOT NULL DEFAULT '',
      lease_until BIGINT NOT NULL DEFAULT 0,
      result LONGTEXT NOT NULL,
      error TEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_execution_jobs_status(status, created_at),
      INDEX idx_aura_execution_jobs_lease(lease_until)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS aura_execution_workers (
      worker_id VARCHAR(160) PRIMARY KEY,
      capabilities LONGTEXT NOT NULL,
      model VARCHAR(240) NOT NULL DEFAULT '',
      voice VARCHAR(240) NOT NULL DEFAULT '',
      version VARCHAR(120) NOT NULL DEFAULT '',
      last_seen_at VARCHAR(40) NOT NULL,
      last_seen_ms BIGINT NOT NULL DEFAULT 0,
      INDEX idx_aura_execution_workers_seen(last_seen_ms)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ];
  for (const sql of statements) await db.query(sql);
  await applyMigrations(db);
}

export async function schemaStatus() {
  await ensureMigrationTable(getDb());
  const row = await one('SELECT COALESCE(MAX(version), 0) AS version FROM aura_schema_migrations');
  return {
    current: Number(row?.version || 0),
    latest: LATEST_SCHEMA_VERSION,
    ready: Number(row?.version || 0) === LATEST_SCHEMA_VERSION,
  };
}

export async function createLogicalBackup(reason = 'scheduled') {
  const timestamp = new Date().toISOString();
  const [soul, intentions, lessons, routines, improvements, evolution] = await Promise.all([
    query('SELECT id,state,updated_at FROM aura_soul_state ORDER BY id'),
    query('SELECT * FROM aura_intentions ORDER BY updated_at DESC LIMIT 200'),
    query('SELECT * FROM aura_lessons ORDER BY updated_at DESC LIMIT 300'),
    query('SELECT * FROM aura_routines ORDER BY updated_at DESC LIMIT 200'),
    query('SELECT * FROM aura_improvement_proposals ORDER BY updated_at DESC LIMIT 150'),
    query('SELECT * FROM aura_evolution_cycles ORDER BY updated_at DESC LIMIT 100'),
  ]);
  const payload = JSON.stringify({
    format: 'aura-cognitive-snapshot-v1',
    created_at: timestamp,
    schema_version: LATEST_SCHEMA_VERSION,
    soul,
    intentions,
    lessons,
    routines,
    improvements,
    evolution,
  });
  const id = randomUUID();
  await query(
    `INSERT INTO aura_state_snapshots(
      id,reason,schema_version,payload,payload_bytes,created_at
    ) VALUES(?,?,?,?,?,?)`,
    [id, String(reason).slice(0, 120), LATEST_SCHEMA_VERSION, payload, Buffer.byteLength(payload), timestamp],
  );
  const keep = Math.max(3, Number(config.backupRetentionCount || 28));
  await query(
    `DELETE FROM aura_state_snapshots
     WHERE id NOT IN (
       SELECT id FROM (
         SELECT id FROM aura_state_snapshots ORDER BY created_at DESC LIMIT ?
       ) AS recent_snapshots
     )`,
    [keep],
  );
  return { id, reason: String(reason), bytes: Buffer.byteLength(payload), created_at: timestamp };
}

export async function listLogicalBackups(limit = 20) {
  return query(
    'SELECT id,reason,schema_version,payload_bytes,created_at FROM aura_state_snapshots ORDER BY created_at DESC LIMIT ?',
    [Math.max(1, Math.min(Number(limit) || 20, 100))],
  );
}

export async function getLogicalBackup(id) {
  return one(
    'SELECT id,reason,schema_version,payload,payload_bytes,created_at FROM aura_state_snapshots WHERE id=?',
    [String(id)],
  );
}

export async function recordMetricRollup(name, payload) {
  await query(
    'INSERT INTO aura_runtime_metric_rollups(name,payload,created_at) VALUES(?,?,?)',
    [String(name).slice(0, 120), JSON.stringify(payload || {}).slice(0, 64000), new Date().toISOString()],
  );
}

export async function dbHealth() {
  const row = await one('SELECT 1 AS ok');
  return Boolean(row?.ok);
}
