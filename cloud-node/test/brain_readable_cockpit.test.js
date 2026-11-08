import test from 'node:test';
import assert from 'node:assert/strict';

import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';
import {BRAIN_READABLE_CSS} from '../src/brain_readable_theme.js';
import {compactFrenchPrompt,compactFrenchSystem,validateNucleusSpeech} from '../src/french_language.js';

test('dialogue, neural map and homeostasis share one readable primary workspace',()=>{
  const html=BRAIN_OPERATIONS_HTML;
  assert.ok(html.indexOf('id="conversation-panel"')<html.indexOf('id="graphCanvas"'));
  assert.ok(html.indexOf('id="graphCanvas"')<html.indexOf('id="homeostasis-panel"'));
  assert.ok(html.indexOf('id="chatHistory"')<html.indexOf('id="chatInput"'));
  assert.ok(html.indexOf('id="chatInput"')<html.indexOf('id="graphCanvas"'));
  assert.equal((html.match(/id="chatHistory"/g)||[]).length,1);
  assert.equal((html.match(/id="chatDock"/g)||[]).length,1);
  assert.equal((html.match(/id="homeostasis-panel"/g)||[]).length,1);
  assert.equal((html.match(/<details\b/g)||[]).length,(html.match(/<\/details>/g)||[]).length);
  assert.match(html,/class="module-drawer"/);
  assert.match(html,/class="side-details"/);
  assert.match(html,/class="diagnostics-details"/);
  assert.match(html,/class="intro-details"/);
  assert.doesNotMatch(html,/class="detail-card live-conversation"/);
});

test('reference appearance is overridden by a final accessible typography layer',()=>{
  const html=BRAIN_OPERATIONS_HTML;
  const last=html.lastIndexOf('<style>');
  const start=html.indexOf(BRAIN_READABLE_CSS.slice(0,65));
  assert.ok(start>last,'readability CSS should appear in last stylesheet');
  assert.ok(BRAIN_READABLE_CSS.includes('.workspace{display:grid;grid-template-columns:'));
  assert.match(BRAIN_READABLE_CSS,/body\{font-size:15px/);
  assert.match(BRAIN_READABLE_CSS,/#chatHistory \.chat-message[^{}]*\{[^}]*font-size:15px/);
  assert.match(BRAIN_READABLE_CSS,/#chatInput\{[^}]*font-size:15px/);
  assert.match(BRAIN_READABLE_CSS,/\.neural-inspector\{display:none!important\}/);
  assert.match(BRAIN_READABLE_CSS,/@media\(max-width:899px\)/);
  assert.match(BRAIN_READABLE_CSS,/@media\(max-width:599px\)/);
  assert.match(BRAIN_READABLE_CSS,/focus-visible/);
});

test('disclosures are opened by explicit navigation and module inspections',()=>{
  const script=BRAIN_OPERATIONS_SCRIPT;
  assert.match(script,/node\.tagName==='DETAILS'/);
  assert.match(script,/node\.closest\('details'\)/);
  assert.match(script,/detail\.open=true/);
  assert.match(script,/const font=13/);
  assert.match(script,/initialRouteSelected/);
  assert.match(script,/state\.replayStarted=0/);
  assert.doesNotThrow(()=>new Function(script));
});

test('short curiosity conversation cannot invent a CI repair underway',()=>{
  const plan={
    act:'report_internal_state',
    user_text:'Alors tu es intrigué?',
    mood:'intriguée',
    facts:[],
    activity_evidence:{execution_verified:false,live_ci_verified:false},
  };
  const invented='Oui, un peu. Je suis en train de vérifier l’état du CI défaillant de AURA.';
  assert.deepEqual(validateNucleusSpeech(plan,invented),{
    accepted:false,code:'unverified-work-in-social-reply',
  });
  const grounded='Oui, plutôt. Je suis curieuse de comprendre ce qui se passe.';
  assert.equal(validateNucleusSpeech(plan,grounded).accepted,true);
  assert.match(compactFrenchPrompt(plan),/N.injecte pas un rapport de CI/);
  assert.match(compactFrenchSystem(),/ne déclenche jamais un compte rendu de CI/);
});
