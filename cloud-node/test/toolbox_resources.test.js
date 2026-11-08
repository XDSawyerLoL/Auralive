import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESOURCE_CATALOG,
  foldResourceQuery,
  discoverResources,
  isToolDiscoveryRequest,
  resourceContext,
} from '../src/toolbox_resources.js';

test('normalizes French accents and discovers an offline directory', () => {
  assert.equal(foldResourceQuery('SCHÉMAS & DIAGRAMMES'), 'schemas diagrammes');
  assert.equal(RESOURCE_CATALOG.length, 52);
  assert.equal(new Set(RESOURCE_CATALOG.map((item)=>item.id)).size, 52);
});

test('catalog is curated: no duplicate remove.bg and no automated actions', () => {
  assert.equal(RESOURCE_CATALOG.filter((item)=>item.id==='removebg').length, 1);
  assert.equal(RESOURCE_CATALOG.every((item)=>item.can_execute_automatically === false),true);
  const blocked=RESOURCE_CATALOG.find((item)=>item.id==='scihub');
  assert.equal(blocked.blocked,true);
  assert.equal(discoverResources('article scientifique piratage', {limit:20}).some((item)=>item.id==='scihub'), false);
});

test('prioritizes useful local file transfers', () => {
  const names=discoverResources('transfert fichier local ordinateur téléphone', {limit:6}).map(x=>x.id);
  assert.ok(names.includes('localsend'));
});

test('prefers private on-device PDF tooling for a precise request', () => {
  const results=discoverResources('compresser un PDF confidentiel', {limit:6});
  assert.ok(results.some((item)=>item.id==='pdfcpu'));
  assert.ok(results.some((item)=>item.id==='qpdf'));
  assert.equal(results.some((item)=>item.id==='handbrake'),false);
});

test('returns no results without matching words or a sensitive blocked category', () => {
  assert.deepEqual(discoverResources(''),[]);
  assert.equal(discoverResources('anticonstitutionnellement', {limit:5}).length,0);
});

test('never treats an external uploader as autonomous or private', () => {
  const removebg=RESOURCE_CATALOG.find((item)=>item.id==='removebg');
  assert.equal(removebg.consent_required,true);
  assert.equal(removebg.privacy,'file-transfer');
  assert.equal(removebg.can_execute_automatically,false);
});

test('private suggestion context explicitly denies execution or transfer', () => {
  assert.equal(isToolDiscoveryRequest('Quel outil pour compresser un PDF ?'),true);
  assert.equal(isToolDiscoveryRequest('Bonsoir AURA'),false);
  const context=resourceContext('Quel outil pour compresser un PDF ?');
  assert.match(context,/AUCUNE consultation, exécution ou transmission/);
  assert.match(context,/consentement=/);
});
