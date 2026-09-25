import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dbSource = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');
const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

test('database schema uses explicit migrations and resilience tables', () => {
  assert.match(dbSource, /LATEST_SCHEMA_VERSION = 6/);
  assert.match(dbSource, /aura_schema_migrations/);
  assert.match(dbSource, /aura_state_snapshots/);
  assert.match(dbSource, /aura_runtime_metric_rollups/);
  assert.match(dbSource, /aura_command_services/);
  assert.match(dbSource, /aura_initiatives/);
  assert.match(dbSource, /action_type VARCHAR\(120\)/);
  assert.match(dbSource, /action_payload LONGTEXT/);
  assert.match(dbSource, /aura_command_events/);
  assert.match(dbSource, /autonomous-command-center/);
  assert.match(dbSource, /aura_external_memory/);
  assert.match(dbSource, /aura_reasoning_sessions/);
  assert.match(dbSource, /aura_reasoning_evidence/);
  assert.match(dbSource, /web-substrate-external-memory-and-evidence/);
  assert.match(dbSource, /aura_fabric_capabilities/);
  assert.match(dbSource, /aura_fabric_graphs/);
  assert.match(dbSource, /aura_fabric_node_runs/);
  assert.match(dbSource, /capability-fabric-routing-and-graph-ledger/);
  assert.match(dbSource, /aura_mesh_peers/);
  assert.match(dbSource, /aura_mesh_tasks/);
  assert.match(dbSource, /aura_mesh_assignments/);
  assert.match(dbSource, /aura_wasm_kernels/);
  assert.match(dbSource, /compute-mesh-and-signed-wasm-kernels/);
  assert.match(dbSource, /createLogicalBackup/);
});

test('operations endpoints expose private backup and metrics controls', () => {
  assert.match(serverSource, /\/api\/ops\/status/);
  assert.match(serverSource, /\/api\/ops\/backup/);
  assert.match(serverSource, /\/api\/ops\/backups/);
  assert.match(serverSource, /requirePrivate/);
});
