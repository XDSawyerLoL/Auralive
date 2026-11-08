import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePublicResearchQuery,
  createPublicResearchRequest,
  normalizePublicResearchResults,
  searchPublicResources,
} from '../src/toolbox_research.js';

test('rejects private or suspicious queries before any request', () => {
  for(const unsafe of ['prenom@example.org', 'https://intranet.example', 'token secret', 'mot de passe abc', '000000000000', 'ab']) {
    assert.throws(()=>validatePublicResearchQuery(unsafe), /invalide|sensible/);
  }
  assert.equal(validatePublicResearchQuery('Les Misérables'), 'Les Misérables');
});

test('allows only two fixed official API hosts', () => {
  assert.throws(()=>createPublicResearchRequest('https://evil.example','public books'), /non autorisé/);
  assert.equal(new URL(createPublicResearchRequest('openlibrary','Victor Hugo').url).hostname,'openlibrary.org');
  assert.equal(new URL(createPublicResearchRequest('internetarchive','Victor Hugo').url).hostname,'archive.org');
});

test('normalizes Open Library results to safe official work links', () => {
  const items=normalizePublicResearchResults('openlibrary', {docs:[
    {key:'/works/OL123W',title:'Livre',author_name:['A. Exemple'],first_publish_year:1890},
    {key:'https://evil.example/pwn',title:'Mauvaise URL'},
  ]});
  assert.deepEqual(items,[{title:'Livre',author:'A. Exemple',year:1890,url:'https://openlibrary.org/works/OL123W'}]);
});

test('normalizes Internet Archive metadata without claiming download rights', () => {
  const items=normalizePublicResearchResults('internetarchive', {response:{docs:[
    {identifier:'public_material_123',title:'Archive',mediatype:'texts'},
    {identifier:'../private',title:'invalide'},
  ]}});
  assert.equal(items.length,1);
  assert.equal(items[0].url,'https://archive.org/details/public_material_123');
});

test('requires opt-in and cannot call a mocked network otherwise', async () => {
  let calls=0;
  const fetchFn=async()=>{calls++;return {ok:true,json:async()=>({docs:[]})};};
  await assert.rejects(()=>searchPublicResources('openlibrary','histoire publique',{fetchFn}), /Consentement/);
  assert.equal(calls,0);
});

test('performs an explicit, bounded public book search when authorized', async () => {
  let received;
  const fetchFn=async(url,options)=>{
    received={url,options};
    return {ok:true,json:async()=>({docs:[
      {key:'/works/OL123W',title:'Livre exemple',author_name:['Autrice']},
    ]})};
  };
  const result=await searchPublicResources('openlibrary','Recherche livres publics 2026',{allowExternal:true,fetchFn});
  assert.equal(result.count,1);
  assert.equal(result.external_request,true);
  assert.equal(new URL(received.url).hostname,'openlibrary.org');
  assert.equal(received.options.redirect,'error');
  assert.equal(result.results[0].url,'https://openlibrary.org/works/OL123W');
});

test('performs an explicit, bounded public archive search when authorized', async () => {
  const result=await searchPublicResources('internetarchive','histoires anciennes',
    {allowExternal:true,fetchFn:async()=>({ok:true,json:async()=>({response:{docs:[
      {identifier:'history123',title:'Document ancien',mediatype:'texts'},
    ]}})})});
  assert.equal(result.results[0].url,'https://archive.org/details/history123');
  assert.match(result.warning,/droits de téléchargement/);
});
