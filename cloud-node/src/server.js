import { timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import { AiClient } from './ai.js';
import {
  config,
  databaseConfigured,
  productionConfigIssues,
} from './config.js';
import { closeDb, dbHealth, initSchema } from './db.js';
import { DASHBOARD_HTML } from './dashboard.js';
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

const app = Fastify({
  logger: { level: config.logLevel },
  bodyLimit: 1_048_576,
  trustProxy: true,
});

const ai = new AiClient();
let kernel;
const horizon = new HorizonBridge(async (type, payload, source) => {
  if (bootstrap.runtimeReady) {
    await kernel.observeEvent(type, payload, source);
  }
});
kernel = new CognitiveKernel(ai, horizon);
const evolution = new EvolutionLab(ai, kernel);
const fallbackSoul = kernel.defaultSoul();

const bootstrap = {
  serverReady: true,
  dbConfigured: databaseConfigured(),
  dbReady: false,
  runtimeReady: false,
  starting: false,
  startupError: '',
  issues: productionConfigIssues(),
  lastAttemptAt: '',
  lastReadyAt: '',
};

function safeError(error) {
  const text = String(error?.message || error || '').replace(/\s+/g, ' ').trim();
  return text.slice(0, 500);
}

async function startRuntime() {
  if (bootstrap.starting || bootstrap.runtimeReady) return;
  bootstrap.starting = true;
  bootstrap.lastAttemptAt = new Date().toISOString();
  bootstrap.dbConfigured = databaseConfigured();
  bootstrap.issues = productionConfigIssues();
  bootstrap.startupError = '';

  if (!bootstrap.dbConfigured) {
    bootstrap.dbReady = false;
    bootstrap.runtimeReady = false;
    bootstrap.starting = false;
    app.log.warn('AURA Cloud démarre en mode diagnostic: MySQL non configuré.');
    return;
  }

  try {
    await initSchema();
    bootstrap.dbReady = true;
    await kernel.start();
    await horizon.start();
    await evolution.start();
    bootstrap.runtimeReady = true;
    bootstrap.lastReadyAt = new Date().toISOString();
    app.log.info('AURA Cloud: noyau persistant démarré.');
  } catch (error) {
    bootstrap.runtimeReady = false;
    bootstrap.dbReady = false;
    bootstrap.startupError = safeError(error);
    app.log.error({ err: error }, 'AURA Cloud: démarrage du noyau impossible, serveur maintenu en mode diagnostic.');
  } finally {
    bootstrap.starting = false;
  }
}

function requireRuntime(reply) {
  if (bootstrap.runtimeReady) return true;
  reply.code(503).send({
    error: 'Le serveur AURA Cloud est actif, mais le noyau persistant attend sa configuration.',
    code: 'AURA_RUNTIME_NOT_READY',
    issues: bootstrap.issues,
    startup_error: bootstrap.startupError,
  });
  return false;
}

function publicFallbackSoul(privateView) {
  if (privateView) return { ...fallbackSoul };
  const {
    current_intention: _intention,
    dominant_thought: _thought,
    ...safe
  } = fallbackSoul;
  return safe;
}

app.addHook('onSend', async (_request, reply, payload) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('Cache-Control', 'no-store');
  return payload;
});

app.get('/', async (_request, reply) => {
  reply.type('text/html; charset=utf-8');
  return DASHBOARD_HTML;
});

app.get('/api/bootstrap/status', async () => ({
  product: 'AURA Cloud',
  runtime: 'Node.js/Fastify',
  version: '1.1.0',
  node: process.version,
  server_ready: true,
  db_configured: bootstrap.dbConfigured,
  db_ready: bootstrap.dbReady,
  runtime_ready: bootstrap.runtimeReady,
  starting: bootstrap.starting,
  issues: bootstrap.issues,
  startup_error: bootstrap.startupError,
  last_attempt_at: bootstrap.lastAttemptAt,
  last_ready_at: bootstrap.lastReadyAt,
  cloud_token_configured: Boolean(config.cloudToken),
  canary_token_configured: Boolean(config.canaryToken),
  ai_mode: config.aiMode,
  ai_enabled: ai.enabled,
  ai_provider: ai.provider,
  ai_api_key_configured: Boolean(config.aiApiKey),
  horizon_configured: Boolean(config.horizonEnabled && config.horizonBaseUrl),
}));

app.get('/api/ai/runtime', async () => ai.diagnostic());

app.get('/healthz', async () => {
  let databaseAlive = false;
  if (bootstrap.dbReady) {
    try {
      databaseAlive = await dbHealth();
    } catch (error) {
      bootstrap.dbReady = false;
      bootstrap.runtimeReady = false;
      bootstrap.startupError = safeError(error);
    }
  }
  return {
    ok: true,
    ready: bootstrap.runtimeReady && databaseAlive,
    status: bootstrap.runtimeReady && databaseAlive ? 'ready' : 'diagnostic',
    db: databaseAlive,
    kernel_started: Boolean(kernel.started && bootstrap.runtimeReady),
    horizon: horizon.status().enabled,
    evolution: config.evolutionEnabled,
    issues: bootstrap.issues.map((item) => item.code),
    startup_error: bootstrap.startupError,
  };
});

app.post('/api/bootstrap/retry', async (request, reply) => {
  if (config.cloudToken && !requirePrivate(request, reply)) return;
  await startRuntime();
  return {
    ok: true,
    runtime_ready: bootstrap.runtimeReady,
    db_ready: bootstrap.dbReady,
    issues: bootstrap.issues,
    startup_error: bootstrap.startupError,
  };
});

app.get('/api/kernel/status', async () => {
  if (!bootstrap.runtimeReady) {
    return {
      version: CognitiveKernel.VERSION,
      runtime: 'node-hostinger',
      enabled: config.cognitiveEnabled,
      started: false,
      phase: 'configuration',
      ai_enabled: ai.enabled,
      last_error: bootstrap.startupError,
      counts: {
        reflections: 0,
        intentions: 0,
        lessons: 0,
        routines: 0,
        outcomes: 0,
        improvements: 0,
      },
    };
  }
  const status = await kernel.status();
  return { ...status, phase: (await kernel.soul()).phase };
});

app.get('/api/kernel/soul', async (request) => {
  if (!bootstrap.runtimeReady) return publicFallbackSoul(isPrivate(request));
  return kernel.soul({ privateView: isPrivate(request) });
});

app.post('/api/kernel/tick', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  return kernel.tick({
    trigger: String(request.body?.trigger || 'manual'),
    text: String(request.body?.text || ''),
    force: true,
  });
});

app.get('/api/kernel/reflections', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? kernel.reflections(request.query?.limit)
    : undefined);

app.get('/api/kernel/lessons', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? kernel.lessons(request.query?.limit)
    : undefined);

app.get('/api/kernel/intentions', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? kernel.intentions(request.query?.limit)
    : undefined);

app.post('/api/kernel/intentions', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  const statement = String(request.body?.statement || '').trim();
  if (!statement) return reply.code(422).send({ error: 'Intention vide' });
  return kernel.addIntention(statement, {
    priority: request.body?.priority ?? 0.5,
    source: String(request.body?.source || 'api'),
    context: request.body?.context || {},
  });
});

app.post('/api/kernel/intentions/:id/complete', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? { ok: await kernel.completeIntention(request.params.id) }
    : undefined);

app.get('/api/kernel/routines', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? kernel.routines()
    : undefined);

app.post('/api/kernel/routines', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
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
  requirePrivate(request, reply) && requireRuntime(reply)
    ? kernel.improvements(request.query?.limit)
    : undefined);

app.get('/api/kernel/activity', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? kernel.activity(request.query?.limit)
    : undefined);

app.get('/api/kernel/work', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? kernel.workItems(request.query?.limit)
    : undefined);

app.get('/api/kernel/attention', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? kernel.attentionMap()
    : undefined);

app.post('/api/kernel/agents/run', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  try {
    return await kernel.runAgent(String(request.body?.name || ''), String(request.body?.task || ''));
  } catch (error) {
    return reply.code(422).send({ error: String(error?.message || error) });
  }
});

app.post('/api/kernel/agents/swarm', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  const task = String(request.body?.task || '').trim();
  if (!task) return reply.code(422).send({ error: 'Mission vide' });
  return kernel.swarm(task, request.body?.names);
});

app.post('/api/kernel/operator', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  const task = String(request.body?.task || '').trim();
  if (!task) return reply.code(422).send({ error: 'Mission vide' });
  return kernel.operate(task);
});

app.post('/api/chat', async (request, reply) => {
  if (!requireRuntime(reply)) return;
  const text = String(request.body?.text || '').trim();
  if (!text) return reply.code(422).send({ error: 'Message vide' });
  return kernel.chat(text, String(request.body?.author || 'Utilisateur'), isPrivate(request));
});

app.post('/api/cloud/events', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  const type = String(request.body?.type || '').trim();
  if (!type) return reply.code(422).send({ error: 'type requis' });
  return kernel.observeEvent(type, request.body?.payload || {}, String(request.body?.source || 'quantic-studio'));
});

app.post('/api/cloud/outcomes', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? kernel.recordOutcome(request.body || {})
    : undefined);

app.get('/api/horizon/status', async (request) => {
  const status = horizon.status();
  if (isPrivate(request)) {
    return { ...status, runtime_ready: bootstrap.runtimeReady };
  }
  return {
    enabled: status.enabled,
    started: status.started && bootstrap.runtimeReady,
    bridge: status.bridge,
    last_success_at: status.last_success_at,
    last_error: status.last_error ? 'unavailable' : '',
    epistemic_guard: true,
    runtime_ready: bootstrap.runtimeReady,
  };
});

app.post('/api/horizon/sync', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? horizon.syncOnce()
    : undefined);

app.post('/api/horizon/context/facts', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? horizon.pushFact(request.body || {})
    : undefined);

app.post('/api/horizon/context/intents', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? horizon.pushIntent(request.body || {})
    : undefined);

app.get('/api/evolution/status', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? evolution.status()
    : undefined);

app.get('/api/evolution/cycles', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? evolution.cycles(request.query?.limit)
    : undefined);

app.post('/api/evolution/run', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  const objective = String(
    request.body?.objective || 'Chercher une optimisation faible risque du noyau AURA Cloud Node.',
  );
  return evolution.runCycle(objective, String(request.body?.trigger || 'private-api'));
});

app.get('/api/evolution/canary/:cycleId', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? evolution.canaryStatus(request.params.cycleId)
    : undefined);

app.post('/api/evolution/canary/:cycleId', async (request, reply) =>
  requireCanary(request, reply) && requireRuntime(reply)
    ? evolution.recordCanary(request.params.cycleId, request.body || {})
    : undefined);

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  const status = Number(error?.statusCode || 500);
  reply
    .code(status >= 400 && status < 600 ? status : 500)
    .send({
      error: status >= 500 ? 'Erreur interne AURA Cloud' : String(error?.message || 'Requête invalide'),
    });
});

let retryTimer = null;

export function startRuntimeLoop() {
  startRuntime().catch((error) => {
    bootstrap.startupError = safeError(error);
  });
  if (retryTimer) return;
  retryTimer = setInterval(() => {
    if (!bootstrap.runtimeReady && databaseConfigured()) {
      startRuntime().catch((error) => {
        bootstrap.startupError = safeError(error);
      });
    }
  }, 60_000);
  retryTimer.unref?.();
}

export async function stopAura() {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
  evolution.stop();
  horizon.stop();
  kernel.stop();
  await app.close();
  if (bootstrap.dbReady) {
    try {
      await closeDb();
    } catch {}
  }
}

export { app, bootstrap, startRuntime };
