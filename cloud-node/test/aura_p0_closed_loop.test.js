import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {initialVerifiedLoop,runVerifiedProbe,replayVerifiedLoop,
 verifiedLoopDecision,verifiedLoopAblation} from '../src/verified_tool_loop.js';
import {nextAutonomousAllowance,centralActionAdmission} from '../src/central_action_gate.js';
import {workspaceInput,competeInWorkspace,workspaceSnapshot} from '../src/global_workspace.js';
import {selectBroadcastMemories,languageWorkspaceProjection,
 semanticWorkspaceContext} from '../src/workspace_boundary.js';
import {HistoryLedger} from '../src/history_provenance.js';

const at='2026-11-11T14:00:00Z',atMs=Date.parse(at);
test('P0: a caller cannot mint its own executive workspace or act without a fresh prior broadcast',()=>{
 const candidates=workspaceInput({userPresent:false,nowMs:atMs});
 const workspace=competeInWorkspace(candidates,{nowMs:atMs});
 const snapshot=workspaceSnapshot(workspace);
 const allowance=nextAutonomousAllowance(workspace,{sequence:0},atMs);
 const valid=centralActionAdmission({source:'command-center',workspace:snapshot,
  allowance,nowMs:atMs});
 assert.equal(valid.allowed,true);
 assert.equal(centralActionAdmission({source:'evolution',workspace:snapshot,
  allowance,nowMs:atMs}).allowed,false);
 assert.equal(centralActionAdmission({source:'command-center',workspace:null,
  allowance,nowMs:atMs}).allowed,false);
 assert.equal(centralActionAdmission({source:'command-center',workspace:snapshot,
  allowance,nowMs:atMs+121000}).allowed,false);
 assert.equal(centralActionAdmission({source:'command-center',workspace:snapshot,
  allowance:{...allowance,issued_by:'CuriosityEngine'},nowMs:atMs}).allowed,false);
 assert.equal(centralActionAdmission({source:'command-center',workspace:snapshot,
  allowance,nowMs:atMs,viability:{optional_work_allowed:false}}).allowed,false);
 const src=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 assert.match(src,/const receipt=this\.soulCache\?\.global_workspace\|\|\{\}/);
 assert.doesNotMatch(src,/executionWorkspace\(\)\{\s*const proposals=workspaceInput/);
 for(const name of ['command_center','curiosity','evolution','capability_scout']){
  const code=readFileSync(new URL('../src/'+name+'.js',import.meta.url),'utf8');
  assert.match(code,/authorizeAutonomous\(/,name+' must call kernel gate');
 }
});
test('P0: only individually selected memory IDs can enter language or semantic context',()=>{
 const workspace=competeInWorkspace(workspaceInput({
  userPresent:true,nowMs:atMs,memoryProposals:[{ref:'note:12',salience:.85}],
 }),{nowMs:atMs});
 const selected=selectBroadcastMemories(workspace,{
  notes:[{id:12,body:'correct record',title:'selected'},
    {id:13,body:'private unrelated record',title:'other'}],
  messages:[{id:40,content:'private recent chat'}],
  founderProfile:[{id:12,detail:'selected'}, {id:13,detail:'unselected'}],
 });
 assert.deepEqual(selected.refs,['note:12']);
 assert.deepEqual(selected.notes.map(x=>x.id),[12]);
 assert.deepEqual(selected.messages,[]);
 assert.deepEqual(selected.founderProfile.map(x=>x.id),[12]);
 const projection=languageWorkspaceProjection({
  act:'respond',
  founder_profile:[{id:12,detail:'selected'},{id:13,detail:'secret'}],
  experiential_memory:[{id:13,note:'private unrelated record'}],
  conversation_context:[{id:40,role:'user',content:'private recent chat'}],
 },workspace,{privateView:true});
 assert.equal(projection.memory_included,true);
 assert.deepEqual(projection.plan.founder_profile.map(x=>x.id),[12]);
 assert.doesNotMatch(JSON.stringify(projection.plan),/secret|private unrelated record|private recent chat/);
 assert.equal(semanticWorkspaceContext('legacy raw private context',workspace),'');
 assert.equal(semanticWorkspaceContext([
   {kind:'note',id:12,content:'allowed'},
   {kind:'note',id:13,content:'forbidden'},
 ],workspace).includes('forbidden'),false);
 const noMemory=competeInWorkspace(workspaceInput({
   userPresent:true,nowMs:atMs,
   history:{eligible:true,changed:true,action:'verify'},
 }),{nowMs:atMs});
 assert.equal(selectBroadcastMemories(noMemory,{notes:[{id:12}]}).notes.length,0);
 const kernel=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 assert.ok(kernel.indexOf("plan=this.cognition.planReply")>
  kernel.indexOf("const workspace=competeInWorkspace("));
});
test('P0: verified local tool failure makes the next unrelated attempt in same context verify first; restart and ablation reverse it',async()=>{
 const root=await mkdtemp(join(tmpdir(),'aura-verified-loop-'));
 try{
  await mkdir(join(root,'docs'));
  let state=initialVerifiedLoop();
  const context='docs_readability';
  for(let i=0;i<3;i++){
   const result=await runVerifiedProbe(state,{root,context,
    relativePath:'docs/missing-'+i+'.md',runId:'distinct-'+i,at});
   assert.equal(result.receipt.prediction_fixed_before_action,true);
   assert.equal(result.receipt.exit_code,1);
   assert.equal(result.receipt.verification,'fs-syscall');
   assert.equal(result.decision.verifies_first,false);
   assert.equal(result.receipt.outcome,'failed');
   state=result.state;
  }
  assert.equal(replayVerifiedLoop(state,context).verified,true);
  const afterRestart=JSON.parse(JSON.stringify(state));
  const learned=verifiedLoopDecision(afterRestart,context);
  assert.equal(learned.verifies_first,true);
  assert.equal(learned.evidence_ids.length,3);
  const ablation=verifiedLoopAblation(afterRestart,context);
  assert.equal(ablation.actual.verifies_first,true);
  assert.equal(ablation.ablated.verifies_first,false);
  assert.equal(ablation.absolute_effect,1);
  assert.equal(ablation.noise_floor,0);
  const newFailure=await runVerifiedProbe(afterRestart,{root,context,
   relativePath:'docs/new-situation.md',runId:'different-test',at});
  assert.equal(newFailure.decision.verifies_first,true);
  assert.equal(newFailure.action_was_preflighted,true);
  assert.equal(newFailure.execution.reason,'preflight-blocked');
  await writeFile(join(root,'docs','real.md'),'verified read only');
  const passing=await runVerifiedProbe(newFailure.state,{root,context,
   relativePath:'docs/real.md',runId:'distinct-success',at});
  assert.equal(passing.action_was_preflighted,true);
  assert.equal(passing.receipt.outcome,'succeeded');
  assert.equal(passing.execution.code,0);
  assert.equal((await readFile(join(root,'docs','real.md'),'utf8')),
   'verified read only');
  assert.equal(replayVerifiedLoop(passing.state,context).verified,true);
  assert.equal(replayVerifiedLoop({...passing.state,
   episodes:[{...passing.state.episodes[0],exit_code:0},...passing.state.episodes.slice(1)]},context).verified,false);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('P0: 100 deterministic resamplings produce zero noise and 100% episode ablation effect',async()=>{
 const root=await mkdtemp(join(tmpdir(),'aura-effect-measure-'));
 try{
  let changed=0;
  for(let draw=0;draw<100;draw++){
   let state=initialVerifiedLoop();
   const context='replay_'+draw;
   for(let i=0;i<3;i++){
    const result=await runVerifiedProbe(state,{root,context,
     relativePath:'docs/missing-'+i+'.md',
     runId:context+'-'+i,at});
    state=result.state;
   }
   changed+=verifiedLoopAblation(JSON.parse(JSON.stringify(state)),context).absolute_effect;
  }
  assert.equal(changed,100);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('P0: HistoryLedger refuses uncorrelated machine success even with valid-looking receipt',async()=>{
 const called=[];
 const expected=new Map([[17,{outcome:'verified-fs-probe:abcd',success:1}]]);
 const ledger=new HistoryLedger({
  db:{execute:async(sql,args)=>{called.push(args);return [{insertId:1}]}},
  verifyOutcome:async({episodeId,outcome,success})=>{
   const row=expected.get(Number(episodeId));
   return row?.outcome===outcome&&row?.success===success;
  },
  clock:()=>at,
 });
 await assert.rejects(ledger.recordOutcome(17,{
  outcome:'verified-fs-probe:FAKE',success:1,source:'machine-verified',
 }),/Independent machine verification required/);
 assert.equal(called.length,0);
 const ok=await ledger.recordOutcome(17,{
  outcome:'verified-fs-probe:abcd',success:1,source:'machine-verified',
 });
 assert.equal(ok.calibrated,true);
 assert.equal(called.length,1);
});


test('P0: private-owner canary needs a one-use broadcast and records verified syscall outcome in history',async()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const route=server.match(/app\.post\('\/api\/kernel\/verified-probe'[\s\S]*?\n\}\);/);
 assert.ok(route,'hosted owner-only canary must have a registered endpoint');
 assert.match(route[0],/requirePrivate\(request, reply\)/);
 assert.match(route[0],/requireRuntime\(reply\)/);
 assert.match(route[0],/admitAuthenticatedLocalProbe/);
 assert.doesNotMatch(route[0],/body\?\.root/);
 assert.doesNotMatch(route[0],/exec\(|spawn\(|shell/);
 const {CognitiveKernel}=await import('../src/kernel.js');
 const root=await mkdtemp(join(tmpdir(),'aura-auth-probe-'));
 try{
  await mkdir(join(root,'docs'));
  const seen=[];
  const k=Object.create(CognitiveKernel.prototype);
  k.soulCache={verified_probe_loop:initialVerifiedLoop(),
   global_workspace:null,viability:{capacity:3},cycles:0};
  k.organism={migrate:()=>({})};
  k.pendingOwnerProbePermit=null;
  k.pendingMachineReceipts=new Map();
  k.saveSoul=async()=>{};
  k.trace=async(...args)=>seen.push({trace:args});
  let episodes=0;
  k.history={
    beginEpisode:async args=>{
      assert.equal(args.prediction,'local-probe-readable');
      assert.ok(args.confidence>0&&args.confidence<1);
      return {id:++episodes};
    },
    recordOutcome:async (id,row)=>{
      const permit=k.pendingMachineReceipts.get(id);
      assert.equal(row.source,'machine-verified');
      assert.equal(permit.source,'fs-syscall');
      assert.equal(permit.outcome,row.outcome);
      assert.equal(permit.success,row.success);
      seen.push({id,row});
    },
  };
  await assert.rejects(k.verifiedLocalProbe({
    context:'docs_readability',relativePath:'docs/missing.md',root,permit:'forged',
  }),/requires-private-owner-broadcast/);
  for(let i=0;i<3;i++){
    const permit=await k.admitAuthenticatedLocalProbe();
    assert.equal(typeof permit,'string');
    const outcome=await k.verifiedLocalProbe({
      context:'docs_readability',relativePath:'docs/missing-'+i+'.md',root,permit,
    });
    assert.equal(outcome.verified,true);
    assert.equal(outcome.receipt.exit_code,1);
    assert.equal(outcome.preflighted,false);
    await assert.rejects(k.verifiedLocalProbe({
      context:'docs_readability',relativePath:'docs/missing.md',root,permit,
    }),/requires-private-owner-broadcast/);
  }
  assert.equal(episodes,3);
  assert.equal(seen.filter(x=>x.row).length,3);
  // Simulate the persisted snapshot being reloaded into a new kernel process.
  const saved=JSON.parse(JSON.stringify(k.soulCache));
  const next=Object.create(CognitiveKernel.prototype);
  Object.assign(next,{soulCache:saved,organism:k.organism,
    pendingOwnerProbePermit:null,pendingMachineReceipts:new Map(),
    history:k.history,saveSoul:async()=>{},trace:async()=>{}});
  const permit=await next.admitAuthenticatedLocalProbe();
  next.history.recordOutcome=async()=>{};
  const after=await next.verifiedLocalProbe({
    context:'docs_readability',relativePath:'docs/new-failure.md',root,permit,
  });
  assert.equal(after.decision.verifies_first,true);
  assert.equal(after.preflighted,true);
  assert.equal(after.receipt.exit_code,1);
 }finally{await rm(root,{recursive:true,force:true});}
});
