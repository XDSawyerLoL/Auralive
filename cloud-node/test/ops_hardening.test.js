import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dbSource = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');
const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

test('database schema uses explicit migrations and resilience tables', () => {
  assert.match(dbSource, /LATEST_SCHEMA_VERSION = 3/);
  assert.match(dbSource, /aura_schema_migrations/);
  assert.match(dbSource, /aura_state_snapshots/);
  assert.match(dbSource, /aura_runtime_metric_rollups/);
  assert.match(dbSource, /aura_command_services/);
  assert.match(dbSource, /aura_initiatives/);
  assert.match(dbSource, /action_type VARCHAR\(120\)/);
  assert.match(dbSource, /action_payload LONGTEXT/);
  assert.match(dbSource, /aura_command_events/);
  assert.match(dbSource, /autonomous-command-center/);
  assert.match(dbSource, /createLogicalBackup/);
});

test('operations endpoints expose private backup and metrics controls', () => {
  assert.match(serverSource, /\/api\/ops\/status/);
  assert.match(serverSource, /\/api\/ops\/backup/);
  assert.match(serverSource, /\/api\/ops\/backups/);
  assert.match(serverSource, /requirePrivate/);
});
