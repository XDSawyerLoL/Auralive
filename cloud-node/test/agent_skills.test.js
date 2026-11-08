import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AURA_PLAYBOOKS, SKILLS_POLICY, SKILLS_VERSION,
  selectAgentSkills, planAgentSkills, agentSkillsGuidance,
} from '../src/agent_skills.js';

test('AURA Skills has six versioned deterministic playbooks',()=>{
  assert.equal(SKILLS_VERSION,'aura-native-playbooks-v1');
  assert.deepEqual(AURA_PLAYBOOKS.map((p)=>p.id),
    ['planning','diagnostic','tdd','code-review','research','validation']);
  assert.equal(new Set(AURA_PLAYBOOKS.map((p)=>p.id)).size,6);
  assert.equal(AURA_PLAYBOOKS.every((p)=>p.steps.length===4),true);
});

test('absolute 0 euro budget and no dynamic execution in new module',()=>{
  assert.equal(SKILLS_POLICY.monetary_budget_eur,0);
  assert.equal(SKILLS_POLICY.cost_microunits,0);
  assert.equal(SKILLS_POLICY.external_api_calls,false);
  assert.equal(SKILLS_POLICY.external_model_calls,false);
  assert.equal(SKILLS_POLICY.remote_execution,false);
  assert.equal(SKILLS_POLICY.shell_execution,false);
  assert.equal(SKILLS_POLICY.new_dependencies,false);
  assert.equal(SKILLS_POLICY.automatically_deploy,false);
  assert.equal(SKILLS_POLICY.evidence_required_before_success,true);
});

test('diagnostic selects reproducibility before declaring a fix',()=>{
  const selected=selectAgentSkills('Réparer un écran noir HLS SWAPP avec erreur 403',{role:'dev'});
  assert.equal(selected[0].id,'diagnostic');
});

test('security agent selects review and budget gates',()=>{
  const selected=selectAgentSkills('Audit des permissions et secrets de cette pull request',{role:'security'});
  assert.equal(selected[0].id,'code-review');
  assert.equal(selected[0].steps.some((s)=>s.id==='budget'),true);
});

test('research agent prefers traceable research',()=>{
  const selected=selectAgentSkills('Recherche documentaire et sources sur le traitement des images',{role:'research'});
  assert.equal(selected[0].id,'research');
});

test('trivial and unrelated chat does not load procedures',()=>{
  assert.deepEqual(selectAgentSkills('Bonjour AURA'),[]);
  assert.deepEqual(selectAgentSkills(''),[]);
});

test('offline skills return pending checklist, never fabricated evidence',()=>{
  const plan=planAgentSkills('Déployer le correctif sur Hostinger',{
    skills:['validation','code-review'],
  });
  assert.equal(plan.skills.length,2);
  assert.equal(plan.checklist.length,8);
  assert.equal(plan.completed,false);
  assert.equal(plan.executed,false);
  assert.equal(plan.proof_collected,false);
  assert.equal(plan.monetary_cost_eur,0);
  assert.equal(plan.external_calls,0);
  assert.ok(plan.checklist.every((s)=>s.status==='pending'&&s.verified===false));
  assert.ok(plan.checklist.every((s)=>s.evidence_required.length>4));
});

test('no arbitrary skill IDs can be supplied by caller',()=>{
  assert.throws(()=>planAgentSkills('Faire une tâche',{
    skills:['../../remote-command'],
  }),/Compétence non autorisée/);
});

test('user cannot exceed bounded skill selection',()=>{
  const plan=planAgentSkills('Planifier une mission', {
    skills:['planning','diagnostic','tdd','code-review','research','validation'],
  });
  assert.equal(plan.skills.length,3);
});

test('guidance explicitly refuses claims without evidence',()=>{
  const guidance=agentSkillsGuidance('Corriger le lecteur HLS SWAPP',{role:'dev'});
  assert.match(guidance,/budget 0 €/);
  assert.match(guidance,/aucun shell ni déploiement automatique/);
  assert.match(guidance,/EN ATTENTE/);
});

test('private-only context insertion: public chat cannot receive AURA Skills instructions',()=>{
  const kernel=fs.readFileSync(new URL('../src/kernel.js', import.meta.url),'utf8');
  assert.match(kernel,/if \(privateView && focus\)/);
  assert.match(kernel,/privateView && selectAgentSkills\(content/);
  assert.match(kernel,/evidence_status: 'local-playbook-not-executed'/);
  assert.match(kernel,/proposed_skills: selectedSkills\.map/);
  assert.match(kernel,/skills_executed: false/);
});

test('playbook routes are private and provide no execution endpoint',()=>{
  const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(server,/app\.get\('\/api\/skills\/playbooks'[\s\S]*?requirePrivate\(request, reply\)/);
  assert.match(server,/app\.post\('\/api\/skills\/plan'[\s\S]*?requirePrivate\(request, reply\)/);
  assert.doesNotMatch(server,/\/api\/skills\/execute/);
});
