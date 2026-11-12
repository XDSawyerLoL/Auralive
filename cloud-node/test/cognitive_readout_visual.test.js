import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';
import {BRAIN_SCIENCE_LAB_HTML,BRAIN_SCIENCE_LAB_CSS,BRAIN_SCIENCE_LAB_SCRIPT} from '../src/brain_science_lab_ui.js';
import {COGNITIVE_ATLAS_HTML,COGNITIVE_ATLAS_CSS} from '../src/cognitive_atlas_ui.js';
import {COGNITIVE_ATLAS_SCRIPT} from '../src/cognitive_atlas_runtime.js';

test('one cockpit, no always-open second dashboard: introspection requires the laboratory disclosure',()=>{
 const html=BRAIN_OPERATIONS_HTML;
 assert.equal((html.match(/id="science-lab"/g)||[]).length,1);
 assert.equal((html.match(/id="graphCanvas"/g)||[]).length,1);
 assert.equal((html.match(/id="chatHistory"/g)||[]).length,1);
 assert.equal((html.match(/id="scienceMindThought"/g)||[]).length,1);
 assert.equal((html.match(/id="scienceMindIntention"/g)||[]).length,1);
 assert.equal((html.match(/id="scienceMindChoice"/g)||[]).length,1);
 assert.ok(html.indexOf('id="neuro-lab-details"')<html.indexOf('id="science-mind"')||
           html.includes('class="science-mind"'));
 assert.equal(html.includes('<details class="v5-lab-details" id="neuro-lab-details" open'),false);
 assert.ok(html.includes('id="scienceGenomeCanvas"'));
 assert.ok(html.includes('id="scienceGeneSequence"'));
 assert.ok(html.includes('id="scienceGeneWiring"'));
});

test('the intentions readout never generates a fictional inner monologue or exposes secret values',()=>{
 const script=BRAIN_SCIENCE_LAB_SCRIPT;
 assert.match(script,/fetch\('\/api\/brain\/introspection'/);
 assert.match(script,/credentials:'same-origin'/);
 assert.match(script,/response\.status===401\|\|response\.status===403/);
 assert.match(script,/privateForbidden=true/);
 assert.match(script,/item\.statement\|\|''/);
 assert.match(script,/\.textContent=/);
 assert.doesNotMatch(script,/innerHTML\s*=/);
 assert.doesNotMatch(script,/fetch\(['"]https?:/);
 assert.doesNotMatch(script,/Math\.random\(/);
 assert.doesNotThrow(()=>new Script(script));
});

test('genome sequence exposes actual six-base locus and distinguishes 3 wired from 5 unwired genes',()=>{
 assert.match(BRAIN_SCIENCE_LAB_SCRIPT,/slice\(selectedGene\*6,selectedGene\*6\+6\)/);
 assert.match(BRAIN_SCIENCE_LAB_SCRIPT,/Plage : /);
 assert.match(BRAIN_SCIENCE_LAB_SCRIPT,/NON RELIÉ AU PROTOCOLE/);
 assert.match(BRAIN_SCIENCE_LAB_SCRIPT,/geneMeaning\[selectedGene\]/);
 assert.ok((BRAIN_SCIENCE_LAB_SCRIPT.match(/role:'Utilisé dans l’expérience P0'/g)||[]).length===3);
 assert.ok((BRAIN_SCIENCE_LAB_SCRIPT.match(/role:'NON RELIÉ AU PROTOCOLE'/g)||[]).length===5);
 assert.doesNotMatch(BRAIN_SCIENCE_LAB_SCRIPT,/\['Référence S0',0,'baseline'\]/);
 assert.match(BRAIN_SCIENCE_LAB_SCRIPT,/valid\?Math\.round\(val\*100\)\+' %':'—'/);
 assert.match(BRAIN_SCIENCE_LAB_CSS,/\.science-mind-grid/);
 assert.match(BRAIN_SCIENCE_LAB_CSS,/@media\(max-width:630px\)/);
});

test('atlas stages readable observations, not fabricated thought quotes; navigation is functional',()=>{
 assert.match(COGNITIVE_ATLAS_HTML,/id="cogReadableSummary"/);
 assert.match(COGNITIVE_ATLAS_HTML,/id="cogReadIntents"/);
 assert.match(COGNITIVE_ATLAS_SCRIPT,/cogReadableSummary/);
 assert.match(COGNITIVE_ATLAS_SCRIPT,/lastSignificant/);
 assert.match(COGNITIVE_ATLAS_CSS,/\.cog-reading/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/\$\('cogReadIntents'\)\.onclick/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/lab\.open=true/);
 assert.doesNotThrow(()=>new Script(COGNITIVE_ATLAS_SCRIPT));
 assert.doesNotThrow(()=>new Script(BRAIN_OPERATIONS_SCRIPT));
});
