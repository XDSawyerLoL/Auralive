import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DASHBOARD_HTML} from '../src/dashboard.js';
import {DASHBOARD_SCRIPT} from '../src/dashboard-runtime.js';
import {
  validateAuditUrl,isPublicIPv4,evaluateHomepage,auditPublicHomepage,
} from '../src/revenue_audit.js';

test('chat remains pinned in a viewport dock, with independent messages scrolling',()=>{
  assert.match(DASHBOARD_HTML,/\.chat\{position:sticky;top:96px;height:calc\(100dvh - 260px\)/);
  assert.match(DASHBOARD_HTML,/grid-template-rows:auto minmax\(0,1fr\) auto auto auto/);
  assert.match(DASHBOARD_HTML,/\.messages\{flex:initial;min-height:0;/);
  assert.match(DASHBOARD_HTML,/@media\(max-width:640px\)[\s\S]*?\.chat\{top:72px;height:calc\(100dvh - 79px\)/);
  assert.match(DASHBOARD_HTML,/id="message"/);
  assert.match(DASHBOARD_HTML,/id="send"/);
});

test('unavailable language renders a technical retry notice, never fabricated chat speech',()=>{
  assert.match(DASHBOARD_SCRIPT,/out\?\.language_unavailable/);
  assert.match(DASHBOARD_SCRIPT,/response_kind==='model-unavailable'/);
  assert.match(DASHBOARD_SCRIPT,/addChatServiceNotice/);
  assert.match(DASHBOARD_SCRIPT,/data-aura-action="retry-language"/);
  assert.match(DASHBOARD_SCRIPT,/data-aura-action="diagnose-language"/);
  assert.match(DASHBOARD_SCRIPT,/if\(!repeated\)\{/);
  const expression=fs.readFileSync(new URL('../src/expression.js',import.meta.url),'utf8');
  assert.match(expression,/this\.lastMode = 'natural-language-unavailable'/);
  assert.doesNotMatch(expression,/Je conserve le contexte de notre conversation pour la reprise/);
  const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(server,/service_status: unavailable/);
  assert.match(server,/const curiosityItem = unavailable \? null/);
});

test('revenue module is a functional audit with transparent disabled sales status',()=>{
  assert.match(DASHBOARD_HTML,/id="auditUrl"/);
  assert.match(DASHBOARD_HTML,/id="auditRun"/);
  assert.match(DASHBOARD_HTML,/id="auditExport"/);
  assert.match(DASHBOARD_HTML,/Recettes confirmées par AURA/);
  assert.match(DASHBOARD_SCRIPT,/auditRun'\)\.onclick/);
  assert.match(DASHBOARD_SCRIPT,/revenue\/audit\/preview/);
  assert.match(DASHBOARD_SCRIPT,/auditReport=report/);
  assert.match(DASHBOARD_SCRIPT,/text\/markdown;charset=utf-8/);
  const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(server,/app\.post\('\/api\/revenue\/audit\/preview'/);
  assert.match(server,/app\.get\('\/api\/revenue\/readiness'/);
  assert.match(server,/payment_processing_connected:false/);
  assert.match(server,/verified_aura_receipts_eur:null/);
  const block=server.slice(server.indexOf("app.post('/api/revenue/audit/preview'"),
    server.indexOf('// Founder-only knowledge endpoints.'));
  assert.match(block,/requirePrivate\(request, reply\)/);
  assert.match(block,/auditPublicHomepage/);
  assert.doesNotMatch(block,/payment_intent|checkout\.sessions|charge\(/);
});

test('audit only accepts well-formed public HTTPS root URLs',()=>{
  assert.equal(validateAuditUrl('https://www.example.fr/').toString(),'https://www.example.fr/');
  for(const bad of [
    'http://example.fr/','https://localhost/','https://127.0.0.1/',
    'https://10.0.0.1/','https://example.fr:3000/','https://example.fr/private',
    'https://example.fr/?token=abc','https://user:pass@example.fr/',
    'https://example.fr/#fragment',
  ]) assert.throws(()=>validateAuditUrl(bad),/HTTPS publique|Adresse HTTPS/);
  for(const ip of ['10.1.1.1','127.0.0.1','169.254.169.254','172.16.2.3','192.168.0.10'])
    assert.equal(isPublicIPv4(ip),false,ip);
  assert.equal(isPublicIPv4('1.1.1.1'),true);
});

test('audit observations come from initial HTML, no SEO or security certification',()=>{
  const result=evaluateHomepage(`<html><head><title>Exemple</title><meta name="description" content="Un site"></head>
  <body><h1>Titre</h1><img src="a.png"><img src="b.png" alt="Illustration"></body></html>`,
  {status:200,headers:{'x-content-type-options':'nosniff'},duration_ms:123,url:'https://www.example.fr/'});
  assert.equal(result.title,'Exemple');
  assert.equal(result.images_missing_alt,1);
  assert.equal(result.checks.length,10);
  assert.equal(result.duration_ms,123);
  assert.match(result.scope,/pas un audit de sécurité/);
  assert.equal(result.paid_api_calls,0);
});

test('audit uses injected request only after public-url validation',async()=>{
  let calls=0;
  const result=await auditPublicHomepage('https://www.example.fr/',{
    request:async()=>{calls++;return {html:'<html><title>OK</title><h1>Hello</h1></html>',
      status:200,headers:{'content-type':'text/html'},duration_ms:40};},
  });
  assert.equal(calls,1);
  assert.equal(result.status_code,200);
  assert.equal(result.paid_api_calls,0);
  assert.equal(result.checked_at.length>0,true);
  await assert.rejects(()=>auditPublicHomepage('http://169.254.169.254/',{
    request:async()=>{calls++;throw Error('NETWORK_MUST_NOT_RUN');},
  }),/HTTPS publique|Adresse HTTPS/);
  assert.equal(calls,1);
});


test('safe operator missions are private, use empty additional risk permissions and expose real execution state',()=>{
  assert.match(DASHBOARD_HTML,/id="autonomyTask"/);
  assert.match(DASHBOARD_HTML,/id="autonomyRun"/);
  assert.match(DASHBOARD_HTML,/id="autonomyResult"/);
  assert.match(DASHBOARD_SCRIPT,/api\/kernel\/operator/);
  assert.match(DASHBOARD_SCRIPT,/allowed_risks:\[\]/);
  assert.match(DASHBOARD_SCRIPT,/result\?\.executed===true/);
  assert.match(DASHBOARD_SCRIPT,/Seul un plan ou un refus a été retourné/);
  const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  const start=server.indexOf("app.post('/api/kernel/operator'");
  const end=server.indexOf("app.post('/api/chat'",start);
  assert.ok(start>=0&&end>start);
  assert.match(server.slice(start,end),/requirePrivate\(request, reply\)/);
  assert.doesNotMatch(server.slice(start,end),/default[\s\S]*allowed_risks:\['financial'/);
});

test('full AURA UI includes autonomy first, revenue second, and no simulated collected-income claim',()=>{
  const autonomy=DASHBOARD_HTML.indexOf('class="panel autonomy-panel"');
  const revenue=DASHBOARD_HTML.indexOf('class="panel revenue-panel"');
  const trading=DASHBOARD_HTML.indexOf('class="panel trading-lab"');
  assert.ok(autonomy>0&&revenue>autonomy&&trading>revenue);
  assert.match(DASHBOARD_HTML,/Non connectées/);
  assert.match(DASHBOARD_HTML,/Non activées/);
  assert.match(DASHBOARD_HTML,/PAPER ONLY/);
});


test('owner authentication uses existing secure cookie session, never stores the secret',()=>{
  assert.match(DASHBOARD_HTML,/id="ownerSessionToken"/);
  assert.match(DASHBOARD_HTML,/id="ownerConnect"/);
  assert.match(DASHBOARD_HTML,/id="ownerDisconnect"/);
  assert.match(DASHBOARD_SCRIPT,/api\('\/api\/auth\/session'/);
  assert.match(DASHBOARD_SCRIPT,/ownerSessionAuthenticated/);
  assert.match(DASHBOARD_SCRIPT,/input\.value=''/);
  assert.doesNotMatch(DASHBOARD_SCRIPT,/localStorage\.setItem\('aura_token'/);
  assert.doesNotMatch(DASHBOARD_SCRIPT,/sessionStorage\.setItem\('aura_token'/);
  const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(server,/app\.post\('\/api\/auth\/session'/);
  assert.match(server,/HttpOnly; Secure; SameSite=Lax/);
  assert.match(server,/app\.delete\('\/api\/auth\/session'/);
});
