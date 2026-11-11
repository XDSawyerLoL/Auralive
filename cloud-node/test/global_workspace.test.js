import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  WORKSPACE_CAPACITY,WORKSPACE_MAX_CANDIDATES,workspaceInput,
  competeInWorkspace,workspaceSnapshot,broadcastAblation,
} from '../src/global_workspace.js';
import {HistoryLedger} from '../src/history_provenance.js';
import {BRAIN_NODES,buildBrainFlowGraph} from '../src/brain_flow.js';

const now=Date.parse('2026-11-11T12:20:00.000Z');
const at=new Date(now).toISOString();
const organism=(pressure=.9,error=.8)=>({
  homeostasis:{sensor:{source:'node-process',sampled_at:at,
    compute_pressure:pressure},failure_ema:error},
});
const proposals=()=>workspaceInput({
  userPresent:true,nowMs:now,plan:{act:'respond'},organism:organism(),
  history:{changed:true,eligible:true,action:'clarify'},metacognition:{verify:true},
});
test('thalamic competition has a fixed cap, distinct opponents and no raw texts',()=>{
 const c=proposals();
 assert.equal(WORKSPACE_CAPACITY,3);
 assert.equal(WORKSPACE_MAX_CANDIDATES,12);
 assert.equal(c.length,6);
 const selected=competeInWorkspace(c,{nowMs:now});
 assert.equal(selected.selected.length,3);
 assert.equal(selected.suppressed,3);
 assert.equal(selected.selected[0].label,'user-request');
 assert.deepEqual(selected.broadcasts.map(x=>x.recipient),
  ['prefrontal','hippocampus','insula','basal_ganglia','metacognition']);
 assert.deepEqual(selected.received.prefrontal,selected.received.hippocampus);
 assert.equal(selected.decision.control,'verify');
 assert.equal(selected.decision.optional_compute_deferred,true);
 assert.equal(selected.subjective_experience_proven,false);
});
test('GWT mechanism must alter actual decision fields when broadcast is ablated',()=>{
 const comparison=broadcastAblation(proposals(),{nowMs:now});
 assert.equal(comparison.withBroadcast.decision.verification_required,true);
 assert.equal(comparison.withoutBroadcast.decision.verification_required,false);
 assert.equal(comparison.withoutBroadcast.received.basal_ganglia.length,0);
 assert.equal(comparison.withoutBroadcast.decision.control,'normal');
 assert.equal(comparison.broadcast_causal,true);
 assert.equal(comparison.oneSlot.decision.verification_required,false);
 assert.equal(comparison.capacity_causal,true);
});
test('hippocampal candidate is excluded by competition under pressure, but selected at rest',()=>{
 const busy=competeInWorkspace(proposals(),{nowMs:now,capacity:3});
 assert.equal(busy.received.basal_ganglia.some(x=>x.source==='memory'),false);
 const quiet=competeInWorkspace(workspaceInput({
   userPresent:true,nowMs:now,plan:{act:'respond'},organism:organism(0,0),
   history:{changed:true,eligible:true,action:'clarify'},
 }),{nowMs:now});
 assert.equal(quiet.received.basal_ganglia.some(x=>x.source==='memory'),true);
});
test('unverified feedback must also win the workspace before it can select a strategy',()=>{
 const candidates=workspaceInput({userPresent:true,nowMs:now,
   plan:{act:'respond'},organism:organism(0,0),
   experience:{changed:true,strategy:'attentive'},
 });
 const normal=competeInWorkspace(candidates,{nowMs:now,capacity:3});
 assert.equal(normal.received.basal_ganglia.some(x=>x.label==='reported-feedback-policy'),true);
 const narrow=competeInWorkspace(candidates,{nowMs:now,capacity:1});
 assert.equal(narrow.received.basal_ganglia.some(x=>x.label==='reported-feedback-policy'),false);
 const ablated=competeInWorkspace(candidates,{nowMs:now,broadcast:false});
 assert.equal(ablated.received.basal_ganglia.some(x=>x.label==='reported-feedback-policy'),false);
});
test('stale interoception cannot force resource scarcity',()=>{
 const stale=workspaceInput({userPresent:false,nowMs:now,
   organism:{homeostasis:{sensor:{source:'node-process',
   sampled_at:new Date(now-3*60_000).toISOString(),compute_pressure:1}}}});
 assert.equal(stale.some(x=>x.source==='interoception'),false);
});
test('reentrant selection exists only as bounded receipt; no private prompt stored',()=>{
 const c=competeInWorkspace(proposals(),{nowMs:now});
 const stored=workspaceSnapshot(c);
 assert.equal(stored.revision,1);
 assert.equal(stored.capacity,3);
 assert.ok(stored.selected.length<=3);
 assert.equal(JSON.stringify(stored).includes('content'),false);
 assert.equal(JSON.stringify(stored).includes('synthetic-private-utterance'),false);
 const followup=workspaceInput({previous:stored,nowMs:now+30_000,
   organism:organism(.1,.1)});
 assert.ok(followup.some(x=>x.source==='reentry')===false);
});
function mockLedger(){
 const decisions=[];
 const rows=[{policy_id:7,hypothesis_id:8,rule_action:'clarify',
   active:1,hypothesis_status:'promoted',context_tag:'dialogue_correction',
   expected_success:1,confidence:.9}];
 const evidences=[{hypothesis_id:8,episode_id:41,source:'machine-verified',
   polarity:'support',ablated:0},
   {hypothesis_id:8,episode_id:42,source:'machine-verified',
   polarity:'support',ablated:0}];
 const db={execute:async(sql)=>{
  if(sql.includes('FROM aura_history_policies'))return [rows];
  if(sql.includes('FROM aura_history_hypothesis_evidence'))return [evidences];
  throw Error('Unexpected external SQL '+sql);
 },getConnection:async()=>({
  beginTransaction:async()=>{},query:async()=>[[]],release:()=>{},
  execute:async(sql,args)=>{
   if(sql.includes('INSERT INTO aura_history_decisions')){
     decisions.push({action:args[3],snapshot:JSON.parse(args[5])});
     return [{insertId:19}];
   }
   if(sql.includes('INSERT INTO aura_history_decision_provenance'))
     return [{}];
   throw Error('Unexpected transaction SQL '+sql);
  },commit:async()=>{},rollback:async()=>{},
 })};
 return {history:new HistoryLedger({db,clock:()=>at}),decisions};
}
test('basal-ganglia gate commits chosen action, never a rejected memory proposal',async()=>{
 const {history,decisions}=mockLedger();
 const rejected=await history.decide({context_tag:'dialogue_correction',
  baseline:'respond',run_id:'run-1',situation_id:'situation-1',
  workspacePolicyAllowed:false});
 assert.equal(rejected.action,'respond');
 assert.equal(rejected.provenance.length,0);
 assert.equal(decisions[0].action,'respond');
 assert.equal(decisions[0].snapshot.workspace_policy_allowed,false);
 const accepted=await history.decide({context_tag:'dialogue_correction',
  baseline:'respond',run_id:'run-2',situation_id:'situation-2',
  workspacePolicyAllowed:true});
 assert.equal(accepted.action,'clarify');
 assert.equal(decisions[1].action,'clarify');
 assert.ok(accepted.provenance.length>0);
});
test('existing single brain graph contains functional thalamo-cortical routes',()=>{
 const ids=BRAIN_NODES.map(x=>x[0]);
 for(const id of ['thalamus','workspace','prefrontal','hippocampus',
    'insula','basal_ganglia','metacognition'])assert.ok(ids.includes(id),id);
 const graph=buildBrainFlowGraph({telemetry:{runtime_ready:true},traceRows:[]},now);
 const has=(a,b)=>graph.edges.some(e=>e.from===a&&e.to===b);
 assert.ok(has('cognition','thalamus'));
 assert.ok(has('thalamus','workspace'));
 assert.ok(has('workspace','prefrontal'));
 assert.ok(has('workspace','hippocampus'));
 assert.ok(has('workspace','basal_ganglia'));
 assert.ok(has('workspace','insula'));
 assert.ok(has('metacognition','thalamus'));
 assert.equal(graph.edges.filter(x=>x.signal_recent).length,0,
   'A declared circuit must not fake active neuronal pulses');
 const kernel=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 assert.match(kernel,/workspacePolicyAllowed:historyPermitted&&memoryBroadcast/);
 assert.match(kernel,/const chosenBaseline=learnedFeedbackBroadcast\?advice\.strategy:'respond'/);
 assert.match(kernel,/this\.soulCache\.global_workspace=workspaceSnapshot/);
 assert.match(kernel,/type:'aura.workspace.control_change'/);
});
