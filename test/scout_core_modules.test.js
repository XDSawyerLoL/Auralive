import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { licenseAssessment } from '../src/capability_scout.js';

const source=fs.readFileSync(new URL('../src/capability_scout.js', import.meta.url), 'utf8');
test('AURA discovers dedicated organization, engineering, diagrams and geo domains', () => {
  for (const id of ['agent-organization','engineering-skills','document-diagrams','reverse-engineering','geo-reasoning']) {
    assert.ok(source.includes("id: '"+id+"'"),id);
  }
});
test('references stay gated by licence and experiment eligibility', () => {
  assert.match(source,/PaperclipAI\/paperclip/);
  assert.match(source,/thedotmack\/claude-mem/);
  assert.match(source,/if \(OWN_REPOSITORIES\.has\(key\) \|\| found\.has\(key\)\) continue/);
  assert.equal(licenseAssessment('').policy,'unknown');
  assert.equal(licenseAssessment('GPL-3.0').policy,'review');
  assert.equal(licenseAssessment('MIT').policy,'compatible');
  assert.match(source,/experiment_eligible/);
});
