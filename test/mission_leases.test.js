import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MissionLeaseManager } from '../src/mission_leases.js';
import { missionRotation } from '../src/mission_scheduler.js';
import fs from 'node:fs';

const horizon = fs.readFileSync(new URL('../src/long_horizon.js', import.meta.url), 'utf8');
const command = fs.readFileSync(new URL('../src/command_center.js', import.meta.url), 'utf8');
const db = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');

function memoryStorage() {
  const records = new Map();
  return {
    records,
    async query(sql, args) {
      if (sql.startsWith('INSERT IGNORE')) {
        const id = args[0];
        if (!records.has(id)) records.set(id, { token: '', expiration: 0 });
        return { affectedRows: 1 };
      }
      if (sql.startsWith('UPDATE') && sql.includes('lease_owner=?') && sql.includes('AND lease_until<=UTC_TIMESTAMP')) {
        const rec = records.get(args[3]);
        if (rec.expiration > Date.now()) return { affectedRows: 0 };
        rec.token = args[0];
        rec.expiration = Date.now() + args[1] * 1000;
        return { affectedRows: 1 };
      }
      if (sql.startsWith('UPDATE') && sql.includes('AND lease_until>UTC_TIMESTAMP')) {
        const rec = records.get(args[2]);
        if (rec.token !== args[3] || rec.expiration <= Date.now()) return { affectedRows: 0 };
        rec.expiration = Date.now() + args[0] * 1000;
        return { affectedRows: 1 };
      }
      if (sql.startsWith('UPDATE') && sql.includes("lease_owner=''")) {
        const rec = records.get(args[1]);
        if (rec.token !== args[2]) return { affectedRows: 0 };
        rec.expiration = 0;
        rec.token = '';
        return { affectedRows: 1 };
      }
      throw new Error('Unexpected SQL: ' + sql);
    },
  };
}
test('unique mission tokens exclude concurrent claimants and recover after release', async () => {
  const storage = memoryStorage();
  const a = new MissionLeaseManager({storage});
  const b = new MissionLeaseManager({storage});
  const id = randomUUID();
  const [one, two] = await Promise.all([a.claim(id), b.claim(id)]);
  assert.equal([one,two].filter(Boolean).length,1);
  assert.equal(await a.release({mission_id:id,token:randomUUID()}),false);
  assert.equal(await b.renew({mission_id:id,token:randomUUID()}),false);
  assert.equal(await a.release(one || two),true);
  assert.ok(await b.claim(id));
});
test('mission selection visits waiting and planning projects without starvation', () => {
  const rows = [
    {id:randomUUID(),status:'running',priority:0.9},
    {id:randomUUID(),status:'waiting',priority:0.8},
    {id:randomUUID(),status:'planning',priority:0.6},
  ];
  const first = missionRotation(rows);
  assert.equal(first.length,3);
  assert.deepEqual(missionRotation(rows,first[0].id).map(x=>x.id),[first[1].id,first[2].id,first[0].id]);
});
test('mission dispatch keeps token through bind and releases it in finally', () => {
  assert.match(horizon,/await this.leases.claim\(row.id\)/);
  assert.match(horizon,/evaluateMissionCandidate\(row\)/);
  assert.match(horizon,/AND initiative_id='' AND status='pending'/);
  assert.match(command,/finally \{[\s\S]*?releaseLease\(missionAdvance.lease\)/);
  assert.match(db,/CREATE TABLE IF NOT EXISTS aura_mission_leases/);
});
