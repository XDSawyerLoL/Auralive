import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentRunLedger, AGENT_ROLES } from '../src/agent_runs.js';

function storage() {
  const entries=[];
  return { entries, async query(sql, args=[]) {
    if (sql.startsWith('INSERT INTO aura_agent_runs')) { entries.push(args); return { affectedRows:1 }; }
    if (sql.startsWith('SELECT role,status,COUNT(*)')) {
      const counts=new Map();
      for (const row of entries) {const key=row[2]+'|'+row[3];counts.set(key,(counts.get(key)||0)+1);}
      return [...counts.entries()].map(([key,total])=>({role:key.split('|')[0],status:key.split('|')[1],total}));
    }
    throw new Error('Unexpected SQL: '+sql);
  }};
}
test('specialized team roles persist metadata without raw prompt or response',async () => {
  const db=storage();const ledger=new AgentRunLedger({storage:db});
  const result=await ledger.execute({role:'research',task:'SECRET: private text',missionId:'mission-one',invoke:async()=> 'Research completed',provider:()=> 'zero-cost:test'});
  assert.equal(result.status,'completed');
  assert.equal(db.entries.length,1);
  assert.equal(db.entries[0][2],'research');
  assert.match(db.entries[0][4],/^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(db.entries),/SECRET|Research completed/);
  assert.equal((await ledger.status()).counts.research.completed,1);
});
test('an unavailable model reports blocked, never completed',async () => {
  const db=storage();const ledger=new AgentRunLedger({storage:db});
  const result=await ledger.execute({role:'planner',task:'plan',invoke:async()=> ''});
  assert.equal(result.status,'blocked');
  assert.equal((await ledger.status()).counts.planner.blocked,1);
});
test('failed agents have durable failure records without error details',async () => {
  const db=storage();const ledger=new AgentRunLedger({storage:db});
  await assert.rejects(ledger.execute({role:'security',task:'audit',invoke:async()=>{throw new Error('secret failure')}}),/secret failure/);
  assert.equal(db.entries[0][3],'failed');
  assert.doesNotMatch(JSON.stringify(db.entries),/secret failure/);
  assert.ok(AGENT_ROLES.includes('critic'));
});
