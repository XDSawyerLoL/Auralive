import test from 'node:test';
import assert from 'node:assert/strict';
import {activityEvidence,groundAgenda,ACTIVE_STATUS_WINDOW_MS} from '../src/activity_truth.js';
import {CognitionEngine} from '../src/cognition.js';
import {compactFrenchPrompt,validateNucleusSpeech} from '../src/french_language.js';

const nowMs=Date.UTC(2026,10,8,13,11);
function agenda(input={}){
 return groundAgenda({
   current:'Relancer le CI défaillant d’AURA',
   next_action:'Réévaluer le blocage public',
   status:'waiting',
   source:'initiative-record',
   since:'2026-10-13T20:00:00.000Z',
   last_updated_at:'2026-10-13T20:00:00.000Z',
   blocker:'En attente d’une dépendance ou d’un signal.',
   ...input,
 },{nowMs});
}
function plan(text,recentMessages=[],status=agenda()){
 return new CognitionEngine().planReply({
   text,
   soul:{current_intention:'Faire avancer AURA',organism:{mood:'satisfaite',relationship:{},executive:{}}},
   work:[{title:'Relancer le CI défaillant d’AURA'}],
   agenda:status,recentMessages,privateView:true,
 });
}

test('October 13 CI waiting status in November is stale and NEVER evidence of a live block',()=>{
 const current=agenda();
 assert.equal(current.status,'stale');
 assert.equal(current.source_status,'waiting');
 assert.equal(current.execution_verified,false);
 assert.equal(current.live_ci_verified,false);
 assert.equal(current.blocker,'');
 assert.match(current.last_recorded_blocker,/En attente/);
 assert.equal(current.evidence_status,'stale-record');
});

test('even a recent running DB row is not proof of execution without verified receipt',()=>{
 const current=agenda({status:'running',last_updated_at:new Date(nowMs-30_000).toISOString(),blocker:''});
 assert.equal(current.status,'running');
 assert.equal(current.recorded_status_current,true);
 assert.equal(current.execution_verified,false);
 assert.equal(current.evidence_status,'recorded-status-only');
 const receipt=activityEvidence({status:'running',
  updated_at:new Date(nowMs-30_000).toISOString(),
  execution_receipt:{ok:true,evidence_id:'success-1',verified_at:new Date(nowMs-12_000).toISOString()}},
  {nowMs});
 assert.equal(receipt.execution_verified,true);
 assert.equal(receipt.source_of_execution,'verified-execution-receipt');
});

test('old or missing timestamps do not acquire a fake updated-now date',()=>{
 assert.equal(activityEvidence({status:'waiting'},{nowMs}).stale,true);
 assert.equal(activityEvidence({status:'waiting',updated_at:'2026-10-13'},{nowMs}).stale,true);
 assert.equal(ACTIVE_STATUS_WINDOW_MS,86400000);
});

test('greeting never injects a state-of-mood report',()=>{
 const p=plan('salut');
 assert.equal(p.act,'greet');
 assert.equal(p.facts.some(f=>/Humeur interne actuelle|mon état interne|100 %/.test(f)),false);
 assert.equal(new CognitionEngine().deterministicReply(p),'Salut.');
 assert.equal(validateNucleusSpeech(p,'Salut. Je suis en ligne et mon état interne est satisfait.').accepted,false);
 assert.equal(validateNucleusSpeech(p,'Salut !').accepted,true);
});

test('the user correction "j’ai rien demandé" is understood as an objection',()=>{
 const p=plan("j'ai rien demandé",[{role:'assistant',content:'Salut. Mon humeur est satisfaite.'}]);
 assert.equal(p.act,'acknowledge_unrequested');
 assert.match(new CognitionEngine().deterministicReply(p),/Tu as raison/);
 assert.equal(validateNucleusSpeech(p,'Je suis en présence silencieuse.').accepted,false);
});

test('why did you say that? asks for explanation, not more self-state',()=>{
 const p=plan('pourquoi tu dis ça ?',[
  {role:'assistant',content:'Je suis en présence silencieuse.'},
 ]);
 assert.equal(p.act,'explain_previous_claim');
 assert.match(p.facts.join(' '),/Affirmation précédente/);
 assert.match(new CognitionEngine().deterministicReply(p),/pas suffisamment justifiée/);
});

test('doing nothing challenge never becomes a philosophical presence speech',()=>{
 const p=plan('en gros tu fais rien quoi');
 assert.equal(p.act,'clarify_real_activity');
 assert.match(p.facts.join(' '),/Aucune exécution en cours/);
 assert.doesNotMatch(new CognitionEngine().deterministicReply(p),/présence silencieuse/);
});

test('request for actual work says what was recorded and what is NOT verified',()=>{
 const p=plan('Faudrai que ça soit plus clair tu fait quoi?');
 assert.equal(p.act,'report_current_activity');
 assert.match(p.facts.join(' '),/Objectif enregistré/);
 assert.match(p.facts.join(' '),/Statut du suivi : stale/);
 assert.doesNotMatch(p.facts.join(' '),/Blocage actuel/);
 assert.equal(p.activity_evidence.execution_verified,false);
 const text=new CognitionEngine().deterministicReply(p);
 assert.match(text,/Mon suivi mentionne/);
 assert.match(text,/Ce n’est pas une preuve/);
 const speech=compactFrenchPrompt(p,{maxChars:4500});
 const payload=JSON.parse(speech.split('\n').at(-1));
 assert.equal(payload.activity_evidence.execution_verified,false);
 assert.equal(payload.activity_evidence.evidence_status,'stale-record');
 assert.match(payload.factual_constraints.join(' '),/Aucune exécution active/);
});

test('claiming 100% effort and exact old CI blockage is rejected',()=>{
 const p=plan('tu fait quoi?');
 const bad='Je suis Directrice de Quantic Sillage et mobilisée à 100 % sur la relance du CI. Je suis bloquée depuis le 13 octobre 2026.';
 assert.equal(validateNucleusSpeech(p,bad).accepted,false);
 assert.equal(validateNucleusSpeech(p,'Mon suivi mentionne une tâche CI datée, mais je ne sais pas si elle est encore bloquée.').accepted,true);
});

test('offered help and "où ça bloque" ask for logs rather than assert an old failure',()=>{
 const help=plan("Est-ce que je peux t'aider à débloquer le problème ?");
 const why=plan('bah ca depends ou ca bloque ?');
 assert.equal(help.act,'request_verifiable_help');
 assert.equal(why.act,'clarify_blocker_evidence');
 assert.match(new CognitionEngine().deterministicReply(why),/journaux GitHub Actions/);
 assert.equal(validateNucleusSpeech(why,"Le blocage est précis : la relance du CI est défaillante depuis le 13 octobre.").accepted,false);
 assert.equal(validateNucleusSpeech(why,"Je n’ai pas vérifié les derniers logs CI ; je ne peux pas localiser la panne.").accepted,true);
});


test('chat label does not mistake nucleus expression for actual CI execution proof',async()=>{
 const fs=await import('node:fs');
 const js=fs.readFileSync(new URL('../src/dashboard-runtime.js',import.meta.url),'utf8');
 const kernel=fs.readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 assert.match(kernel,/activity_evidence: \{/);
 assert.match(kernel,/execution_verified: Boolean\(plan\.activity_evidence\?\.execution_verified\)/);
 assert.match(js,/AURA · formulation contrôlée · statut non vérifié/);
 assert.match(js,/out\?\.activity_evidence\?\.execution_verified!==true/);
});
