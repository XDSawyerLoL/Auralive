import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from './config.js';

let pool;

export const LATEST_SCHEMA_VERSION = 9;

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

async function ensureColumn(db, table, column, definition) {
  const [rows] = await db.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  if (!rows.length) {
    await db.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  }
}

async function ensureIndex(db, table, indexName, definition) {
  const [rows] = await db.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name=?`, [indexName]);
  if (!rows.length) {
    await db.query(`ALTER TABLE \`${table}\` ADD INDEX ${definition}`);
  }
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
    current = 2;
  }

  if (current < 3) {
    await db.query(`CREATE TABLE IF NOT EXISTS aura_command_services (
      id VARCHAR(80) PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      kind VARCHAR(80) NOT NULL DEFAULT 'service',
      objective TEXT NOT NULL,
      endpoint VARCHAR(1000) NOT NULL DEFAULT '',
      repository VARCHAR(300) NOT NULL DEFAULT '',
      criticality DOUBLE NOT NULL DEFAULT 0.5,
      enabled TINYINT NOT NULL DEFAULT 1,
      state VARCHAR(40) NOT NULL DEFAULT 'unknown',
      state_detail TEXT NOT NULL,
      last_observed_at VARCHAR(40) NOT NULL DEFAULT '',
      metadata LONGTEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_command_services_state(state,criticality)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS aura_initiatives (
      id CHAR(36) PRIMARY KEY,
      fingerprint VARCHAR(64) NOT NULL,
      domain VARCHAR(80) NOT NULL,
      kind VARCHAR(40) NOT NULL,
      title VARCHAR(240) NOT NULL,
      objective TEXT NOT NULL,
      rationale TEXT NOT NULL,
      priority DOUBLE NOT NULL DEFAULT 0.5,
      confidence DOUBLE NOT NULL DEFAULT 0.5,
      requested_risks LONGTEXT NOT NULL,
      action_type VARCHAR(120) NOT NULL DEFAULT '',
      action_payload LONGTEXT NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'queued',
      execution_mode VARCHAR(80) NOT NULL DEFAULT '',
      result LONGTEXT NOT NULL,
      error TEXT NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      last_attempt_at VARCHAR(40) NOT NULL DEFAULT '',
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_initiatives_status(status,priority,updated_at),
      INDEX idx_aura_initiatives_fingerprint(fingerprint,updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS aura_command_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      initiative_id CHAR(36) NULL,
      kind VARCHAR(80) NOT NULL,
      payload LONGTEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_command_events_initiative(initiative_id,created_at),
      INDEX idx_aura_command_events_kind(kind,created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(
      'INSERT INTO aura_schema_migrations(version,name,applied_at) VALUES(3,?,?)',
      ['autonomous-command-center', new Date().toISOString()],
    );
    current = 3;
  }

  if (current < 4) {
    await db.query(`CREATE TABLE IF NOT EXISTS aura_external_memory (
      id VARCHAR(40) PRIMARY KEY,
      query_text TEXT NOT NULL,
      url VARCHAR(1800) NOT NULL,
      host VARCHAR(300) NOT NULL,
      title VARCHAR(500) NOT NULL DEFAULT '',
      excerpt LONGTEXT NOT NULL,
      content_hash VARCHAR(64) NOT NULL,
      source_quality DOUBLE NOT NULL DEFAULT 0.5,
      published_at VARCHAR(80) NOT NULL DEFAULT '',
      fetched_at VARCHAR(40) NOT NULL,
      expires_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_external_memory_host(host,fetched_at),
      INDEX idx_aura_external_memory_expiry(expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS aura_reasoning_sessions (
      id CHAR(36) PRIMARY KEY,
      trigger_name VARCHAR(120) NOT NULL,
      question TEXT NOT NULL,
      hypotheses LONGTEXT NOT NULL,
      plan LONGTEXT NOT NULL,
      conclusion LONGTEXT NOT NULL,
      confidence DOUBLE NOT NULL DEFAULT 0,
      epistemic_status VARCHAR(40) NOT NULL DEFAULT 'unverified',
      evidence_count INT NOT NULL DEFAULT 0,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_reasoning_status(epistemic_status,updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS aura_reasoning_evidence (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      session_id CHAR(36) NOT NULL,
      source_url VARCHAR(1800) NOT NULL,
      source_title VARCHAR(500) NOT NULL DEFAULT '',
      source_host VARCHAR(300) NOT NULL DEFAULT '',
      stance VARCHAR(40) NOT NULL DEFAULT 'neutral',
      relevance DOUBLE NOT NULL DEFAULT 0,
      reliability DOUBLE NOT NULL DEFAULT 0,
      excerpt LONGTEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_reasoning_evidence_session(session_id,created_at),
      INDEX idx_aura_reasoning_evidence_host(source_host,created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(
      'INSERT INTO aura_schema_migrations(version,name,applied_at) VALUES(4,?,?)',
      ['web-substrate-external-memory-and-evidence', new Date().toISOString()],
    );
    current = 4;
  }

  if (current < 5) {
    await db.query(`CREATE TABLE IF NOT EXISTS aura_fabric_capabilities (
      id VARCHAR(180) PRIMARY KEY,
      manifest LONGTEXT NOT NULL,
      manifest_hash VARCHAR(64) NOT NULL,
      transport VARCHAR(80) NOT NULL,
      provider VARCHAR(180) NOT NULL DEFAULT '',
      trust DOUBLE NOT NULL DEFAULT 0.5,
      observed_reliability DOUBLE NOT NULL DEFAULT 0.5,
      latency_ms DOUBLE NOT NULL DEFAULT 0,
      cost_microunits BIGINT NOT NULL DEFAULT 0,
      side_effects TINYINT NOT NULL DEFAULT 0,
      last_seen_at VARCHAR(40) NOT NULL DEFAULT '',
      updated_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_fabric_caps_transport(transport,provider),
      INDEX idx_aura_fabric_caps_quality(observed_reliability,trust)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS aura_fabric_graphs (
      id VARCHAR(120) PRIMARY KEY,
      objective TEXT NOT NULL,
      graph LONGTEXT NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'planned',
      result LONGTEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_fabric_graphs_status(status,updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS aura_fabric_node_runs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      graph_id VARCHAR(120) NOT NULL,
      node_id VARCHAR(120) NOT NULL,
      capability_id VARCHAR(180) NOT NULL,
      ok TINYINT NOT NULL,
      elapsed_ms BIGINT NOT NULL DEFAULT 0,
      result LONGTEXT NOT NULL,
      error TEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_fabric_node_graph(graph_id,created_at),
      INDEX idx_aura_fabric_node_capability(capability_id,created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(
      'INSERT INTO aura_schema_migrations(version,name,applied_at) VALUES(5,?,?)',
      ['capability-fabric-routing-and-graph-ledger', new Date().toISOString()],
    );
    current = 5;
  }

  if (current < 6) {
    await ensureColumn(
      db,
      'aura_execution_jobs',
      'target_worker_id',
      "target_worker_id VARCHAR(160) NOT NULL DEFAULT '' AFTER requested_risks",
    );
    await ensureColumn(
      db,
      'aura_execution_jobs',
      'required_capabilities',
      "required_capabilities LONGTEXT NULL AFTER target_worker_id",
    );
    await ensureColumn(
      db,
      'aura_execution_jobs',
      'verification_mode',
      "verification_mode VARCHAR(40) NOT NULL DEFAULT 'none' AFTER required_capabilities",
    );
    await ensureColumn(
      db,
      'aura_execution_jobs',
      'quorum',
      "quorum INT NOT NULL DEFAULT 1 AFTER verification_mode",
    );
    await ensureColumn(
      db,
      'aura_execution_jobs',
      'assigned_at',
      "assigned_at BIGINT NOT NULL DEFAULT 0 AFTER lease_until",
    );
    await ensureColumn(
      db,
      'aura_execution_workers',
      'compute_consent',
      "compute_consent TINYINT NOT NULL DEFAULT 0 AFTER version",
    );
    await ensureColumn(
      db,
      'aura_execution_workers',
      'mesh_capabilities',
      "mesh_capabilities LONGTEXT NULL AFTER compute_consent",
    );
    await ensureColumn(
      db,
      'aura_execution_workers',
      'resources',
      "resources LONGTEXT NULL AFTER mesh_capabilities",
    );
    await ensureColumn(
      db,
      'aura_execution_workers',
      'reputation',
      "reputation DOUBLE NOT NULL DEFAULT 0.5 AFTER resources",
    );
    await ensureColumn(
      db,
      'aura_execution_workers',
      'jobs_completed',
      "jobs_completed BIGINT NOT NULL DEFAULT 0 AFTER reputation",
    );
    await ensureColumn(
      db,
      'aura_execution_workers',
      'jobs_failed',
      "jobs_failed BIGINT NOT NULL DEFAULT 0 AFTER jobs_completed",
    );
    await ensureColumn(
      db,
      'aura_execution_workers',
      'avg_latency_ms',
      "avg_latency_ms DOUBLE NOT NULL DEFAULT 0 AFTER jobs_failed",
    );
    await ensureIndex(
      db,
      'aura_execution_jobs',
      'idx_aura_execution_jobs_target',
      'idx_aura_execution_jobs_target(target_worker_id,status,created_at)',
    );
    await ensureIndex(
      db,
      'aura_execution_workers',
      'idx_aura_execution_workers_mesh',
      'idx_aura_execution_workers_mesh(compute_consent,reputation,last_seen_ms)',
    );
    await db.query(
      'INSERT INTO aura_schema_migrations(version,name,applied_at) VALUES(6,?,?)',
      ['compute-mesh-worker-routing-and-reputation', new Date().toISOString()],
    );
    current = 6;
  }

  if (current < 7) {
    await db.query(`CREATE TABLE IF NOT EXISTS aura_mesh_peers (
      peer_id VARCHAR(80) PRIMARY KEY,
      worker_id VARCHAR(160) NOT NULL,
      public_jwk LONGTEXT NOT NULL,
      capabilities LONGTEXT NOT NULL,
      resources LONGTEXT NOT NULL,
      reputation DOUBLE NOT NULL DEFAULT 0.5,
      enabled TINYINT NOT NULL DEFAULT 1,
      last_seen_at VARCHAR(40) NOT NULL,
      last_seen_ms BIGINT NOT NULL DEFAULT 0,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_mesh_peers_seen(enabled,last_seen_ms),
      INDEX idx_aura_mesh_peers_worker(worker_id,last_seen_ms),
      INDEX idx_aura_mesh_peers_reputation(reputation,last_seen_ms)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS aura_mesh_signals (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      session_id VARCHAR(80) NOT NULL,
      from_peer_id VARCHAR(80) NOT NULL,
      to_peer_id VARCHAR(80) NOT NULL,
      signal_type VARCHAR(40) NOT NULL,
      payload LONGTEXT NOT NULL,
      signature LONGTEXT NOT NULL,
      nonce VARCHAR(100) NOT NULL UNIQUE,
      created_at VARCHAR(40) NOT NULL,
      created_ms BIGINT NOT NULL DEFAULT 0,
      consumed TINYINT NOT NULL DEFAULT 0,
      INDEX idx_aura_mesh_signals_target(to_peer_id,id),
      INDEX idx_aura_mesh_signals_session(session_id,id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS aura_mesh_sessions (
      id CHAR(36) PRIMARY KEY,
      capability VARCHAR(80) NOT NULL,
      initiator_peer_id VARCHAR(80) NOT NULL,
      target_peer_id VARCHAR(80) NOT NULL,
      task LONGTEXT NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'negotiating',
      result LONGTEXT NOT NULL,
      error TEXT NOT NULL,
      verification LONGTEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_mesh_sessions_status(status,updated_at),
      INDEX idx_aura_mesh_sessions_peers(initiator_peer_id,target_peer_id,updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(
      'INSERT INTO aura_schema_migrations(version,name,applied_at) VALUES(7,?,?)',
      ['peer-mesh-webrtc-signaling-and-cryptographic-identity', new Date().toISOString()],
    );
    current = 7;
  }

  if (current < 8) {
    await ensureColumn(
      db,
      'aura_mesh_peers',
      'jobs_completed',
      "jobs_completed BIGINT NOT NULL DEFAULT 0 AFTER reputation",
    );
    await ensureColumn(
      db,
      'aura_mesh_peers',
      'jobs_failed',
      "jobs_failed BIGINT NOT NULL DEFAULT 0 AFTER jobs_completed",
    );
    await ensureColumn(
      db,
      'aura_mesh_peers',
      'avg_latency_ms',
      "avg_latency_ms DOUBLE NOT NULL DEFAULT 0 AFTER jobs_failed",
    );
    await ensureColumn(
      db,
      'aura_mesh_sessions',
      'started_ms',
      "started_ms BIGINT NOT NULL DEFAULT 0 AFTER status",
    );
    await ensureIndex(
      db,
      'aura_mesh_peers',
      'idx_aura_mesh_peers_quality',
      'idx_aura_mesh_peers_quality(enabled,reputation,avg_latency_ms,last_seen_ms)',
    );
    await db.query(
      'INSERT INTO aura_schema_migrations(version,name,applied_at) VALUES(8,?,?)',
      ['peer-mesh-quorum-replay-protection-and-quality-routing', new Date().toISOString()],
    );
    current = 8;
  }

  if (current < 9) {
    await db.query(`CREATE TABLE IF NOT EXISTS aura_products (
      id VARCHAR(100) PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      version VARCHAR(120) NOT NULL DEFAULT '',
      repository VARCHAR(300) NOT NULL DEFAULT '',
      endpoint VARCHAR(1000) NOT NULL DEFAULT '',
      capabilities LONGTEXT NOT NULL,
      permissions LONGTEXT NOT NULL,
      surfaces LONGTEXT NOT NULL,
      state VARCHAR(40) NOT NULL DEFAULT 'unknown',
      instance_id VARCHAR(160) NOT NULL DEFAULT 'default',
      fingerprint VARCHAR(64) NOT NULL DEFAULT '',
      last_seen_at VARCHAR(40) NOT NULL DEFAULT '',
      last_seen_ms BIGINT NOT NULL DEFAULT 0,
      metadata LONGTEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_products_state(state,last_seen_ms),
      INDEX idx_aura_products_seen(last_seen_ms)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS aura_curiosity_questions (
      id CHAR(36) PRIMARY KEY,
      source VARCHAR(120) NOT NULL DEFAULT 'self',
      domain VARCHAR(120) NOT NULL DEFAULT 'general',
      question TEXT NOT NULL,
      why_now TEXT NOT NULL,
      novelty DOUBLE NOT NULL DEFAULT 0.5,
      uncertainty DOUBLE NOT NULL DEFAULT 0.5,
      impact DOUBLE NOT NULL DEFAULT 0.5,
      relevance DOUBLE NOT NULL DEFAULT 0.5,
      repetition DOUBLE NOT NULL DEFAULT 0,
      score DOUBLE NOT NULL DEFAULT 0.5,
      status VARCHAR(40) NOT NULL DEFAULT 'queued',
      evidence LONGTEXT NOT NULL,
      result LONGTEXT NOT NULL,
      error TEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      INDEX idx_aura_curiosity_status(status,score,created_at),
      INDEX idx_aura_curiosity_domain(domain,created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(
      'INSERT INTO aura_schema_migrations(version,name,applied_at) VALUES(9,?,?)',
      ['aura-everywhere-product-registry-and-curiosity', new Date().toISOString()],
    );
    current = 9;
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
  const [soul, intentions, lessons, routines, improvements, evolution, commandServices, initiatives, reasoningSessions, fabricCapabilities, fabricGraphs] = await Promise.all([
    query('SELECT id,state,updated_at FROM aura_soul_state ORDER BY id'),
    query('SELECT * FROM aura_intentions ORDER BY updated_at DESC LIMIT 200'),
    query('SELECT * FROM aura_lessons ORDER BY updated_at DESC LIMIT 300'),
    query('SELECT * FROM aura_routines ORDER BY updated_at DESC LIMIT 200'),
    query('SELECT * FROM aura_improvement_proposals ORDER BY updated_at DESC LIMIT 150'),
    query('SELECT * FROM aura_evolution_cycles ORDER BY updated_at DESC LIMIT 100'),
    query('SELECT * FROM aura_command_services ORDER BY criticality DESC,name ASC'),
    query('SELECT * FROM aura_initiatives ORDER BY updated_at DESC LIMIT 200'),
    query('SELECT id,trigger_name,question,conclusion,confidence,epistemic_status,evidence_count,created_at,updated_at FROM aura_reasoning_sessions ORDER BY updated_at DESC LIMIT 100'),
    query('SELECT id,manifest_hash,transport,provider,trust,observed_reliability,latency_ms,cost_microunits,side_effects,last_seen_at,updated_at FROM aura_fabric_capabilities ORDER BY observed_reliability DESC LIMIT 200'),
    query('SELECT id,objective,status,created_at,updated_at FROM aura_fabric_graphs ORDER BY updated_at DESC LIMIT 100'),
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
    command_services: commandServices,
    initiatives,
    reasoning_sessions: reasoningSessions,
    fabric_capabilities: fabricCapabilities,
    fabric_graphs: fabricGraphs,
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
