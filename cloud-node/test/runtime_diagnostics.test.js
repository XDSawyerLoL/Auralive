import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {classifyRuntimeFailure,publicRuntimeDiagnostic} from '../src/runtime_diagnostics.js';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';

const attempt='2026-11-08T20:30:00.000Z';
const base={runtimeReady:false,dbConfigured:true,dbReady:false,
 starting:false,lastAttemptAt:attempt,lastReadyAt:''};

test('public diagnostics identify missing credentials but leak no connection details',()=>{
 const d=publicRuntimeDiagnostic({...base,dbConfigured:false,
  startupError:'mysql://owner:SUPER_SECRET@private-db.example.net/x',
  failureCode:'database-unconfigured'});
 assert.equal(d.code,'database-unconfigured');
 assert.equal(d.ready,false);
 assert.equal(d.db_ready,false);
 assert.match(d.action,/DATABASE_URL|DB_HOST/);
 assert.doesNotMatch(JSON.stringify(d),/SUPER_SECRET|private-db|example.net|owner:|mysql:\/\//);
});

test('public diagnostics distinguish gateway-only mode from failed DB and startup',()=>{
 const off=publicRuntimeDiagnostic({...base,phase:'not-started'},{gatewayOnly:true});
 assert.equal(off.code,'gateway-only');
 assert.equal(off.auto_retry_enabled,false);
 assert.match(off.action,/AURA_GATEWAY_ONLY/);
 const starting=publicRuntimeDiagnostic({...base,starting:true,phase:'database'});
 assert.equal(starting.code,'starting');
 const ready=publicRuntimeDiagnostic({...base,runtimeReady:true,dbReady:true,phase:'ready'});
 assert.equal(ready.code,'ready');
 assert.equal(ready.auto_retry_enabled,false);
});

test('classifications recognize common MySQL errors without publishing raw messages',()=>{
 for(const [error,expected] of [
  ['ER_ACCESS_DENIED_ERROR: user=secret password=secret','database-authentication'],
  ['ER_BAD_DB_ERROR: Unknown database','database-missing'],
  ['connect ECONNREFUSED 10.0.0.1:3306','database-connection'],
  ['getaddrinfo ENOTFOUND db.internal','database-dns'],
  ['connect ETIMEDOUT','database-timeout'],
  ['ER_NO_SUCH_TABLE: SELECT ...','database-schema'],
  ['JavaScript heap out of memory','memory-exhausted'],
  ['Failed to initialize unrelated feature','unclassified-startup-failure'],
 ])assert.equal(classifyRuntimeFailure(new Error(error)),expected);
 const publicError=publicRuntimeDiagnostic({...base,phase:'database-failed',
   failureCode:'database-authentication',startupError:'password=LEAK_ME'});
 assert.equal(publicError.code,'database-authentication');
 assert.doesNotMatch(JSON.stringify(publicError),/LEAK_ME/);
});

test('runtime outage UI is integrated, honest and offers owner-only retry',()=>{
 for(const id of ['runtimeIncident','runtimeTitle','runtimeMessage','runtimeMeta',
  'runtimeFeedback','runtimeCheck','runtimeRetry']){
  assert.match(BRAIN_OPERATIONS_HTML,new RegExp('id="'+id+'"'),id);
 }
 assert.match(BRAIN_OPERATIONS_SCRIPT,/function renderRuntimeIncident\(/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/runtime_diagnostic/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/database_observations_available===false\?'—'/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/fetch\('\/api\/auth\/session'/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/fetch\('\/api\/bootstrap\/retry'/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/credentials:'same-origin'/);
 assert.doesNotThrow(()=>new Function(BRAIN_OPERATIONS_SCRIPT));
});

test('server does not let optional CapabilityFabric block a healthy kernel',()=>{
 const source=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const a=source.indexOf('async function startRuntime()');
 const b=source.indexOf('function requireRuntime(',a);
 const init=source.slice(a,b);
 assert.match(init,/await initSchema\(\)/);
 assert.match(init,/try\s*\{\s*await fabric\.start\(\);\s*\} catch/);
 assert.match(init,/await kernel\.start\(\)/);
 assert.match(init,/bootstrap\.runtimeReady = true/);
 assert.match(init,/bootstrap\.failureCode = classifyRuntimeFailure/);
 assert.match(init,/kernel\.stop\(\)/);
 const retry=source.slice(source.indexOf("app.post('/api/bootstrap/retry'"),
  source.indexOf("app.get('/api/kernel/status'"));
 assert.match(retry,/if \(!requirePrivate\(request, reply\)\) return/);
 assert.doesNotMatch(retry,/if \(config\.cloudToken && !requirePrivate/);
 const graph=source.slice(source.indexOf("app.get('/api/brain/graph'"),
  source.indexOf("app.get('/api/language/embedded/status'"));
 assert.match(graph,/publicRuntimeDiagnostic/);
 assert.doesNotMatch(graph,/startup_error:bootstrap\.startupError/);
});

test('recovery from unavailable runtime is not false evidence of working cognition',()=>{
 const d=publicRuntimeDiagnostic({...base,phase:'kernel-failed',failureCode:'kernel-failed'});
 assert.equal(d.ready,false);
 assert.equal(d.code,'kernel-failed');
 assert.equal(d.restart_requires_owner,true);
 assert.equal(d.auto_retry_enabled,true);
 assert.equal(d.stage,'kernel-failed');
});
