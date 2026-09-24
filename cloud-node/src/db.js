import mysql from 'mysql2/promise';
import { config } from './config.js';

let pool;

export function getDb() {
  if (pool) return pool;
  pool = config.dbUrl
    ? mysql.createPool({ uri: config.dbUrl, connectionLimit: config.dbConnectionLimit, charset: 'utf8mb4' })
    : mysql.createPool({
        host: config.dbHost,
        port: config.dbPort,
        user: config.dbUser,
        password: config.dbPassword,
        database: config.dbName,
        connectionLimit: config.dbConnectionLimit,
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

export async function initSchema() {
  const db = getDb();
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
  ];
  for (const sql of statements) await db.query(sql);
}

export async function dbHealth() {
  const row = await one('SELECT 1 AS ok');
  return Boolean(row?.ok);
}
