import { timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import { AiClient } from './ai.js';
import { assertProductionConfig, config } from './config.js';
import { closeDb, dbHealth, initSchema } from './db.js';
import { EvolutionLab } from './evolution.js';
import { HorizonBridge } from './horizon.js';
import { CognitiveKernel } from './kernel.js';

function tokenEquals(actual, expected) {
  if (!actual || !expected) return false;
  const a = Buffer.from(String(actual));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

function bearer(request) {
  const header = String(request.headers.authorization || '');
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

function isPrivate(request) {
  return tokenEquals(bearer(request), config.cloudToken);
}

function requirePrivate(request, reply) {
  if (!isPrivate(request)) {
    reply.code(401).send({ error: 'Accès privé AURA requis' });
    return false;
  }
  return true;
}

function requireCanary(request, reply) {
  const allowed = tokenEquals(bearer(request), config.canaryToken);
  if (!allowed) {
    reply.code(401).send({ error: 'Validation canary indépendante requise' });
    return false;
  }
  return true;
}

assertProductionConfig();
await initSchema();
const ai = new AiClient();
let kernel;
const horizon = new HorizonBridge(async (type, payload, source) => kernel.observeEvent(type, payload, source));
kernel = new CognitiveKernel(ai, horizon);
const evolution = new EvolutionLab(ai, kernel);
await kernel.start();
await horizon.start();
await evolution.start();

const app = Fastify({ logger: { level: config.logLevel }, bodyLimit: 1_048_576, trustProxy: true });

app.addHook('onSend', async (_request, reply, payload) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('Cache-Control', 'no-store');
  return payload;
});

app.get('/', async () => ({
  product: 'AURA Cloud',
  runtime: 'Node.js/Fastify',
  version: '1.0.0',
  kernel: (await kernel.status()).version,
  evolution: (await evolution.status()).phase,
}));

app.get('/healthz', async () => ({
  ok: true,
  db: await dbHealth(),
  kernel_started: kernel.started,
  horizon: horizon.status().enabled,
  evolution: (await evolution.status()).enabled,
}));

app.get('/api/kernel/status', async () => kernel.status());
app.get('/api/kernel/soul', async (request) => kernel.soul({ privateView: isPrivate(request) }));

app.post('/api/kernel/tick', async (request, reply) => {
  if (!requirePrivate(request, reply)) return;
  return kernel.tick({
    trigger: String(request.body?.trigger || 'manual'),
    text: String(request.body?.text || ''),
    force: true,
  });
});

app.get('/api/kernel/reflections', async (request, reply) =>
  requirePrivate(request, reply) ? kernel.reflections(request.query?.limit) : undefined);

app.get('/api/kernel/lessons', async (request, reply) =>
  requirePrivate(request, reply) ? kernel.lessons(request.query?.limit) : undefined);

app.get('/api/kernel/intentions', async (request, reply) =>
  requirePrivate(request, reply) ? kernel.intentions(request.query?.limit) : undefined);

app.post('/api/kernel/intentions', async (request, reply) => {
  if (!requirePrivate(request, reply)) return;
  const statement = String(request.body?.statement || '').trim();
  if (!statement) return reply.code(422).send({ error: 'Intention vide' });
  return kernel.addIntention(statement, {
    priority: request.body?.priority ?? 0.5,
    source: String(request.body?.source || 'api'),
    context: request.body?.context || {},
  });
});

app.post('/api/kernel/intentions/:id/complete', async (request, reply) =>
  requirePrivate(request, reply) ? { ok: await kernel.completeIntention(request.params.id) } : undefined);

app.get('/api/kernel/routines', async (request, reply) =>
  requirePrivate(request, reply) ? kernel.routines() : undefined);

app.post('/api/kernel/routines', async (request, reply) => {
  if (!requirePrivate(request, reply)) return;
  const name = String(request.body?.name || '').trim();
  const prompt = String(request.body?.prompt || '').trim();
  if (!name || !prompt) return reply.code(422).send({ error: 'Nom et mission requis' });
  return kernel.addRoutine(
    name,
    prompt,
    request.body?.every_seconds ?? 3600,
    request.body?.mode || 'reflect',
  );
});

app.get('/api/kernel/improvements', async (request, reply) =>
  requirePrivate(request, reply) ? kernel.improvements(request.query?.limit) : undefined);

app.post('/api/kernel/agents/run', async (request, reply) => {
  if (!requirePrivate(request, reply)) return;
  try {
    return await kernel.runAgent(String(request.body?.name || ''), String(request.body?.task || ''));
  } catch (error) {
    return reply.code(422).send({ error: String(error?.message || error) });
  }
});

app.post('/api/kernel/agents/swarm', async (request, reply) => {
  if (!requirePrivate(request, reply)) return;
  const task = String(request.body?.task || '').trim();
  if (!task) return reply.code(422).send({ error: 'Mission vide' });
  return kernel.swarm(task, request.body?.names);
});

app.post('/api/kernel/operator', async (request, reply) => {
  if (!requirePrivate(request, reply)) return;
  const task = String(request.body?.task || '').trim();
  if (!task) return reply.code(422).send({ error: 'Mission vide' });
  return kernel.operate(task);
});

app.post('/api/chat', async (request, reply) => {
  const text = String(request.body?.text || '').trim();
  if (!text) return reply.code(422).send({ error: 'Message vide' });
  return kernel.chat(text, String(request.body?.author || 'Utilisateur'), isPrivate(request));
});

app.post('/api/cloud/events', async (request, reply) => {
  if (!requirePrivate(request, reply)) return;
  const type = String(request.body?.type || '').trim();
  if (!type) return reply.code(422).send({ error: 'type requis' });
  return kernel.observeEvent(type, request.body?.payload || {}, String(request.body?.source || 'quantic-studio'));
});

app.post('/api/cloud/outcomes', async (request, reply) =>
  requirePrivate(request, reply) ? kernel.recordOutcome(request.body || {}) : undefined);

app.get('/api/horizon/status', async (request) => {
  const status = horizon.status();
  if (isPrivate(request)) return status;
  return {
    enabled: status.enabled,
    started: status.started,
    bridge: status.bridge,
    last_success_at: status.last_success_at,
    last_error: status.last_error ? 'unavailable' : '',
    epistemic_guard: true,
  };
});

app.post('/api/horizon/sync', async (request, reply) =>
  requirePrivate(request, reply) ? horizon.syncOnce() : undefined);

app.post('/api/horizon/context/facts', async (request, reply) =>
  requirePrivate(request, reply) ? horizon.pushFact(request.body || {}) : undefined);

app.post('/api/horizon/context/intents', async (request, reply) =>
  requirePrivate(request, reply) ? horizon.pushIntent(request.body || {}) : undefined);

app.get('/api/evolution/status', async (request, reply) =>
  requirePrivate(request, reply) ? evolution.status() : undefined);

app.get('/api/evolution/cycles', async (request, reply) =>
  requirePrivate(request, reply) ? evolution.cycles(request.query?.limit) : undefined);

app.post('/api/evolution/run', async (request, reply) => {
  if (!requirePrivate(request, reply)) return;
  const objective = String(
    request.body?.objective || 'Chercher une optimisation faible risque du noyau AURA Cloud Node.',
  );
  return evolution.runCycle(objective, String(request.body?.trigger || 'private-api'));
});

app.get('/api/evolution/canary/:cycleId', async (request, reply) =>
  requirePrivate(request, reply) ? evolution.canaryStatus(request.params.cycleId) : undefined);

app.post('/api/evolution/canary/:cycleId', async (request, reply) =>
  requireCanary(request, reply)
    ? evolution.recordCanary(request.params.cycleId, request.body || {})
    : undefined);

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  const status = Number(error?.statusCode || 500);
  reply
    .code(status >= 400 && status < 600 ? status : 500)
    .send({ error: status >= 500 ? 'Erreur interne AURA Cloud' : String(error?.message || 'Requête invalide') });
});

async function shutdown(signal) {
  app.log.info({ signal }, 'Arrêt AURA Cloud');
  evolution.stop();
  horizon.stop();
  kernel.stop();
  await app.close();
  await closeDb();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await app.listen({ host: config.host, port: config.port });
