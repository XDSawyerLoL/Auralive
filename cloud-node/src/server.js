import { createHmac, timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import { AiClient } from './ai.js';
import { ExecutionBridge } from './bridge.js';
import { CommandCenter } from './command_center.js';
import { CapabilityFabric } from './capability_fabric.js';
import {
  config,
  databaseConfigured,
  productionConfigIssues,
} from './config.js';
import {
  closeDb,
  createLogicalBackup,
  dbHealth,
  getLogicalBackup,
  initSchema,
  listLogicalBackups,
  recordMetricRollup,
  schemaStatus,
} from './db.js';
import { DASHBOARD_HTML } from './dashboard.js';
import { EvolutionLab } from './evolution.js';
import { HorizonBridge } from './horizon.js';
import { CognitiveKernel } from './kernel.js';
import { RuntimeMetrics } from './metrics.js';
import { PeerMesh } from './peer_mesh.js';
import { CloudVoice } from './voice.js';
import { WebSubstrate } from './web_substrate.js';
import { DagCompiler, TaskGraphExecutor } from './task_graph.js';

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

function cookies(request) {
  const raw = String(request.headers.cookie || '');
  const result = {};
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

function sessionSignature(expiresAt) {
  if (!config.cloudToken) return '';
  return createHmac('sha256', config.cloudToken)
    .update(`${expiresAt}:aura-dashboard-session`)
    .digest('base64url');
}

function createPrivateSession(maxAgeSeconds = 30 * 24 * 60 * 60) {
  const expiresAt = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  return `${expiresAt}.${sessionSignature(expiresAt)}`;
}

function validPrivateSession(value) {
  const raw = String(value || '').trim();
  const dot = raw.indexOf('.');
  if (dot <= 0 || !config.cloudToken) return false;
  const expiresAt = Number.parseInt(raw.slice(0, dot), 10);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  return tokenEquals(raw.slice(dot + 1), sessionSignature(expiresAt));
}

function voiceSignature(expiresAt, text) {
  if (!config.cloudToken) return '';
  return createHmac('sha256', config.cloudToken)
    .update(`${expiresAt}:aura-voice:`)
    .update(String(text || '').trim())
    .digest('base64url');
}

function createVoiceTicket(text, maxAgeSeconds = 120) {
  if (!config.cloudToken) return '';
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(10, Math.min(maxAgeSeconds, 300));
  return `${expiresAt}.${voiceSignature(expiresAt, text)}`;
}

function validVoiceTicket(value, text) {
  const raw = String(value || '').trim();
  const dot = raw.indexOf('.');
  if (dot <= 0 || !config.cloudToken) return false;
  const expiresAt = Number.parseInt(raw.slice(0, dot), 10);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  if (expiresAt > Math.floor(Date.now() / 1000) + 300) return false;
  return tokenEquals(raw.slice(dot + 1), voiceSignature(expiresAt, text));
}

function isPrivate(request) {
  if (tokenEquals(bearer(request), config.cloudToken)) return true;
  return validPrivateSession(cookies(request).aura_session);
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
const metrics = new RuntimeMetrics();
const cloudVoice = new CloudVoice();

const bridge = new ExecutionBridge();
const peerMesh = new PeerMesh();
const ai = new AiClient(bridge);
const webSubstrate = new WebSubstrate(ai);
const fabric = new CapabilityFabric({ webSubstrate, bridge, peerMesh });
const dagCompiler = new DagCompiler(ai);
const graphExecutor = new TaskGraphExecutor(fabric);
let kernel;
const horizon = new HorizonBridge(async (type, payload, source) => {
  if (bootstrap.runtimeReady) {
    await kernel.observeEvent(type, payload, source);
  }
});
kernel = new CognitiveKernel(ai, horizon, bridge, webSubstrate, fabric);
const evolution = new EvolutionLab(ai, kernel, bridge);
const commandCenter = new CommandCenter(
  kernel,
  evolution,
  bridge,
  webSubstrate,
  fabric,
  dagCompiler,
  graphExecutor,
);
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
    await fabric.start();

    // Le noyau AURA est le cœur critique. Les services optionnels ne doivent
    // jamais empêcher l'organisme, la mémoire et le chat de démarrer.
    await kernel.start();
    bootstrap.runtimeReady = true;
    bootstrap.lastReadyAt = new Date().toISOString();
    app.log.info('AURA Cloud: noyau persistant démarré.');

    try {
      await horizon.start();
    } catch (error) {
      app.log.warn({ err: error }, 'AURA Cloud: HORIZON indisponible, noyau maintenu actif.');
    }
    try {
      await evolution.start();
    } catch (error) {
      app.log.warn({ err: error }, 'AURA Cloud: Evolution indisponible, noyau maintenu actif.');
    }
    try {
      await commandCenter.start();
    } catch (error) {
      app.log.warn({ err: error }, 'AURA Cloud: centre de commande indisponible, noyau maintenu actif.');
    }
    startMaintenance();
  } catch (error) {
    bootstrap.runtimeReady = false;
    bootstrap.dbReady = false;
    bootstrap.startupError = safeError(error);
    try {
      await closeDb();
    } catch {}
    app.log.error({ err: error }, 'AURA Cloud: démarrage du noyau impossible, reconnexion automatique programmée.');
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

app.addHook('onRequest', async (request) => {
  metrics.begin(request);
});

app.addHook('onResponse', async (request, reply) => {
  metrics.observe(request, reply);
});

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

const GLIDE_WINDOWS_DOWNLOAD = String(
  process.env.AURA_GLIDE_WINDOWS_URL
  || 'https://github.com/XDSawyerLoL/Auralive/releases/download/quantic-glide-v1.3.0/Quantic-Glide-1.3.0-x64.exe'
).trim();

const GLIDE_ANDROID_DOWNLOAD = String(
  process.env.AURA_GLIDE_ANDROID_URL
  || 'https://raw.githubusercontent.com/XDSawyerLoL/Auralive/main/downloads/Quantic-Glide-Android-1.3.0-beta.apk'
).trim();

app.get('/downloads/glide/windows', async (_request, reply) => {
  return reply.redirect(GLIDE_WINDOWS_DOWNLOAD);
});

app.get('/downloads/glide/android', async (_request, reply) => {
  return reply.redirect(GLIDE_ANDROID_DOWNLOAD);
});

app.get('/api/downloads/glide', async () => ({
  product: 'Quantic Glide',
  windows: {
    version: '1.3.0',
    channel: 'stable',
    url: '/downloads/glide/windows',
  },
  android: {
    version: '1.3.0-beta.1',
    channel: 'beta',
    url: '/downloads/glide/android',
  },
}));

app.get('/api/auth/session', async (request) => ({
  authenticated: isPrivate(request),
  method: validPrivateSession(cookies(request).aura_session)
    ? 'cookie'
    : tokenEquals(bearer(request), config.cloudToken)
      ? 'bearer'
      : 'none',
}));

app.post('/api/auth/session', async (request, reply) => {
  const supplied = String(request.body?.token || bearer(request) || '').trim();
  if (!tokenEquals(supplied, config.cloudToken)) {
    return reply.code(401).send({
      authenticated: false,
      error: 'Token privé AURA invalide',
    });
  }
  const maxAge = 30 * 24 * 60 * 60;
  const session = createPrivateSession(maxAge);
  reply.header(
    'Set-Cookie',
    `aura_session=${encodeURIComponent(session)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`,
  );
  return {
    authenticated: true,
    method: 'cookie',
    expires_in_seconds: maxAge,
  };
});

app.delete('/api/auth/session', async (_request, reply) => {
  reply.header(
    'Set-Cookie',
    'aura_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict',
  );
  return { authenticated: false };
});

app.get('/api/bootstrap/status', async () => ({
  product: 'AURA Cloud',
  runtime: 'Node.js/Fastify',
  version: '2.0.0',
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
  canary_required: Boolean(config.evolutionCanaryRequired),
  canary_token_configured: Boolean(config.canaryToken),
  ai_mode: config.aiMode,
  ai_enabled: ai.enabled,
  ai_provider: ai.provider,
  ai_api_key_configured: Boolean(config.aiApiKey),
  local_bridge_configured: bridge.enabled,
  cognition_native: true,
  cognition_independent_from_language_model: true,
  language_role: 'semantic-support-and-verbalisation-only',
  horizon_configured: Boolean(config.horizonEnabled && config.horizonBaseUrl),
  command_center_enabled: Boolean(config.commandCenterEnabled),
  command_center_auto_execute: Boolean(config.commandCenterAutoExecute),
  web_substrate_enabled: Boolean(config.webSubstrateEnabled),
  web_search_gateway_configured: Boolean(config.webSearchUrl),
  fabric_enabled: Boolean(config.fabricEnabled),
  fabric_started: Boolean(fabric.started),
  fabric_capabilities: fabric.list().length,
  fabric_discovery_configured: Boolean(config.fabricDiscoveryUrls.length),
  peer_mesh_enabled: Boolean(config.meshP2pEnabled),
}));

app.get('/api/ai/runtime', async () => ai.diagnostic());

app.get('/api/bridge/status', async (request, reply) => {
  if (!requirePrivate(request, reply)) return;
  return bridge.status();
});

app.post('/api/bridge/heartbeat', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  const workerId = String(request.body?.worker_id || '').trim();
  if (!workerId) return reply.code(422).send({ error: 'worker_id requis' });
  const result = await bridge.heartbeat(workerId, request.body || {});
  await fabric.refreshMesh().catch(() => {});
  if (request.body?.organism && typeof request.body.organism === 'object') {
    await kernel.importOrganismState(request.body.organism);
  }
  return {
    ...result,
    organism: await kernel.organismState({ publicView: false }),
  };
});

app.post('/api/bridge/claim', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  const workerId = String(request.body?.worker_id || '').trim();
  if (!workerId) return reply.code(422).send({ error: 'worker_id requis' });
  return { job: await bridge.claim(workerId) };
});

app.post('/api/bridge/jobs/:id/renew', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  const workerId = String(request.body?.worker_id || '').trim();
  if (!workerId) return reply.code(422).send({ error: 'worker_id requis' });
  try {
    return await bridge.renew(request.params.id, workerId);
  } catch (error) {
    return reply.code(409).send({ error: String(error?.message || error) });
  }
});

app.post(
  '/api/bridge/jobs/:id/complete',
  { bodyLimit: 24 * 1024 * 1024 },
  async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  const workerId = String(request.body?.worker_id || '').trim();
  if (!workerId) return reply.code(422).send({ error: 'worker_id requis' });
  try {
    const job = await bridge.complete(request.params.id, workerId, request.body || {});
    if (job?.kind === 'operator') {
      const resultPayload = job.result && typeof job.result === 'object' ? job.result : {};
      const ok = String(job.status || '') === 'completed' && resultPayload.ok !== false;
      await kernel.recordOutcome({
        automation_id: `cloud-worker:${job.id}`,
        event_type: 'aura.bridge.operator',
        ok,
        signature: ok ? 'success' : String(job.error || resultPayload.error || 'worker-failure'),
        report: resultPayload,
        created_at: job.updated_at || new Date().toISOString(),
      });
    }
    return job;
  } catch (error) {
    return reply.code(409).send({ error: String(error?.message || error) });
  }
});

app.post('/api/voice/speak', async (request, reply) => {
  if (!requireRuntime(reply)) return;
  const text = String(request.body?.text || '').trim();
  if (!text) return reply.code(422).send({ error: 'Texte vide' });
  const ticket = String(request.body?.ticket || '').trim();
  if (!isPrivate(request) && !validVoiceTicket(ticket, text)) {
    return reply.code(401).send({ error: 'Ticket vocal AURA invalide ou expiré' });
  }

  const preferLocal = request.body?.prefer_local === true;
  const localOnline = await bridge.workerOnline().catch(() => false);
  const attempts = preferLocal && localOnline ? ['local', 'cloud'] : ['cloud', 'local'];
  const errors = [];

  for (const mode of attempts) {
    if (mode === 'cloud' && cloudVoice.enabled) {
      try {
        return await cloudVoice.synthesize(text, request.body || {});
      } catch (error) {
        errors.push(`cloud: ${String(error?.message || error)}`);
      }
    }
    if (mode === 'local' && localOnline) {
      try {
        return await bridge.synthesize(text, request.body || {});
      } catch (error) {
        errors.push(`studio: ${String(error?.message || error)}`);
      }
    }
  }

  return reply.code(503).send({
    error: errors.join(' | ') || 'Voix Mairaiy indisponible',
    code: 'AURA_VOICE_UNAVAILABLE',
    cloud_ready: cloudVoice.enabled,
    studio_ready: localOnline,
  });
});

app.post('/api/image/generate', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  const prompt = String(request.body?.prompt || '').trim();
  if (!prompt) return reply.code(422).send({ error: 'Prompt image vide' });
  try {
    return await bridge.generateImage(request.body || {});
  } catch (error) {
    return reply.code(503).send({
      error: String(error?.message || error),
      code: 'AURA_LOCAL_IMAGE_UNAVAILABLE',
    });
  }
});

app.get('/api/capabilities', async (request) => {
  const privateView = isPrivate(request);
  const [kernelStatus, bridgeStatus] = await Promise.all([
    bootstrap.runtimeReady ? kernel.status() : Promise.resolve(null),
    bootstrap.dbReady ? bridge.status() : Promise.resolve({ enabled: bridge.enabled, worker_online: false }),
  ]);
  const workerCapabilities = Array.isArray(bridgeStatus?.worker?.capabilities)
    ? bridgeStatus.worker.capabilities
    : [];
  const workerActionNames = new Set(
    workerCapabilities.map((item) => String(item?.name || '')),
  );
  return {
    cognition: { ready: Boolean(bootstrap.runtimeReady), native: true },
    organism: {
      ready: Boolean(bootstrap.runtimeReady),
      version: bootstrap.runtimeReady ? (await kernel.organismState({ publicView: true })).version : '',
    },
    memory: { ready: Boolean(bootstrap.dbReady) },
    language: {
      ready: Boolean(ai.enabled),
      provider: privateView ? ai.provider : (bridgeStatus?.worker_online ? 'local-or-fallback' : 'configured'),
      local_worker: Boolean(bridgeStatus?.worker_online),
    },
    voice: {
      ready: Boolean(cloudVoice.enabled || (bridgeStatus?.worker_online && bridgeStatus?.worker?.voice)),
      profile: 'mairaiy',
      mode: cloudVoice.enabled ? 'cloud-primary' : (bridgeStatus?.worker_online ? 'studio-local' : 'offline'),
      engine: cloudVoice.enabled
        ? 'gemini-cloud-tts'
        : (privateView ? String(bridgeStatus?.worker?.voice || '') : ''),
      cloud_ready: Boolean(cloudVoice.enabled),
      studio_ready: Boolean(bridgeStatus?.worker_online && bridgeStatus?.worker?.voice),
      cloud: privateView ? cloudVoice.diagnostic() : undefined,
    },
    image: {
      ready: Boolean(
        bridgeStatus?.worker_online
        && workerActionNames.has('aura.image.generate')
      ),
      mode: bridgeStatus?.worker_online ? 'local-worker' : 'offline',
    },
    hands: {
      ready: Boolean(bridgeStatus?.worker_online),
      mode: bridgeStatus?.worker_online ? 'quantic-studio-real' : 'offline',
      capabilities: privateView ? workerCapabilities : [],
    },
    horizon: { ready: Boolean(horizon.status().enabled) },
    web_substrate: webSubstrate.status(),
    evolution: {
      ready: Boolean(bridgeStatus?.worker_online),
      cloud_enabled: Boolean(config.evolutionEnabled),
      delegated_to_local: Boolean(bridgeStatus?.worker_online),
    },
    command_center: bootstrap.runtimeReady
      ? await commandCenter.status({ publicView: !privateView })
      : { enabled: config.commandCenterEnabled, started: false, auto_execute: config.commandCenterAutoExecute },
    fabric: {
      ready: Boolean(config.fabricEnabled),
      version: CapabilityFabric.VERSION,
      capabilities: fabric.list().length,
      remote_side_effects: false,
    },
    kernel: privateView ? kernelStatus : undefined,
  };
});

app.get('/api/kernel/architecture', async () => ({
  identity_owner: 'AURA Soul + homeostatic organism + persistent memory + intentions',
  organism: 'homeostasie_v7_streamlined',
  cognition_owner: 'AURA native cognitive kernel + active-inference allocator',
  language_model_role: 'replaceable specialist constellation for semantic-support-and-verbalisation-only',
  cognition_independent_from_language_model: true,
  language_provider_replaceable: true,
  command_center: 'continuous native initiative engine with bounded autonomous execution',
  initiative_owner: 'AURA command center',
  meta_reasoning: 'hypothesis -> external retrieval -> source criticism -> deterministic evidence gate -> revised conclusion',
  external_memory: 'Web substrate + persisted evidence ledger + distributed capability topology',
  distributed_compute: 'typed DAG -> Capability Fabric -> parallel Node/Rust swarm -> edge/API/local capabilities',
  capability_router: 'trust + observed reliability + latency + cost + task tags',
  network_action_model: 'typed authenticated capabilities; no arbitrary remote shell; remote edge side effects disabled',
  execution_arm: 'Quantic Studio authenticated bridge for bounded side effects; edge fabric for read/compute',
  autonomous_risk_envelope: [...config.commandCenterAllowedRisks],
  provider: ai.provider,
  provider_enabled: ai.enabled,
}));

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
    cognition_native: true,
    cognition_independent_from_language_model: true,
    horizon: horizon.status().enabled,
    bridge: bootstrap.dbReady
      ? await bridge.status()
      : { enabled: bridge.enabled, worker_online: false, mode: bridge.enabled ? 'waiting-for-runtime' : 'disabled' },
    evolution: config.evolutionEnabled,
    command_center: bootstrap.runtimeReady
      ? await commandCenter.status({ publicView: true })
      : { enabled: config.commandCenterEnabled, started: false },
    fabric: fabric.status(),
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

app.get('/api/kernel/soul', async () => {
  if (!bootstrap.runtimeReady) return publicFallbackSoul(true);
  return kernel.soul({ privateView: true });
});

app.get('/api/kernel/organism', async () => {
  if (!bootstrap.runtimeReady) return { ready: false };
  return kernel.organismState({ publicView: false });
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
  requireRuntime(reply) ? kernel.lessons(request.query?.limit) : undefined);

app.get('/api/kernel/intentions', async (request, reply) =>
  requireRuntime(reply) ? kernel.intentions(request.query?.limit) : undefined);

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
  requireRuntime(reply) ? kernel.activity(request.query?.limit) : undefined);

app.get('/api/kernel/work', async (request, reply) =>
  requireRuntime(reply) ? kernel.workItems(request.query?.limit) : undefined);

app.get('/api/kernel/attention', async (_request, reply) =>
  requireRuntime(reply) ? kernel.attentionMap() : undefined);

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
  const risks = Array.isArray(request.body?.allowed_risks)
    ? request.body.allowed_risks.map((item) => String(item))
    : [];
  return kernel.operate(task, risks);
});

app.post('/api/chat', async (request, reply) => {
  if (!requireRuntime(reply)) return;
  const text = String(request.body?.text || '').trim();
  if (!text) return reply.code(422).send({ error: 'Message vide' });
  const response = await kernel.chat(text, String(request.body?.author || 'Utilisateur'), true);
  const answer = String(response?.answer || '').trim();
  return {
    ...response,
    voice_ticket: answer ? createVoiceTicket(answer) : '',
    voice_profile: 'mairaiy',
  };
});

app.post('/api/cloud/events', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  const type = String(request.body?.type || '').trim();
  if (!type) return reply.code(422).send({ error: 'type requis' });
  const payload = request.body?.payload || {};
  if (type === 'quantic.service.state' && payload?.service_id) {
    await commandCenter.observeService(payload.service_id, {
      state: payload.state,
      detail: payload.detail || payload.message || '',
      metadata: payload.metadata || {},
    }).catch(() => {});
  }
  return kernel.observeEvent(type, payload, String(request.body?.source || 'quantic-studio'));
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

app.get('/api/reasoning/status', async () => webSubstrate.status());

app.get('/api/reasoning/sessions', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? webSubstrate.sessions(request.query?.limit)
    : undefined);

app.post('/api/reasoning/research', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  const question = String(request.body?.question || request.body?.objective || '').trim();
  if (!question) return reply.code(422).send({ error: 'Question de recherche requise' });
  try {
    const result = await webSubstrate.research(question, {
      trigger: String(request.body?.trigger || 'private-api'),
    });
    await kernel.observeEvent(
      'aura.web.research',
      {
        question: question.slice(0, 1000),
        epistemic_status: result.epistemic_status,
        confidence: result.confidence,
        evidence_count: result.evidence_count,
      },
      'web-substrate',
    );
    return result;
  } catch (error) {
    return reply.code(502).send({ error: String(error?.message || error) });
  }
});

app.get('/api/mesh/status', async () => {
  const status = await bridge.status();
  return {
    version: status.mesh?.version || 'aura-compute-mesh-v0.1',
    enabled: Boolean(status.enabled),
    consenting_online_nodes: Number(status.mesh?.consenting_online_nodes || 0),
    capabilities: status.mesh?.capabilities || [],
    best_reputation: Number(status.mesh?.best_reputation || 0),
    max_quorum: Number(status.mesh?.max_quorum || 1),
  };
});

app.get('/api/mesh/p2p/status', async () => ({
  ...(await peerMesh.status()),
  fabric_capability: fabric.list({ includeDisabled: true })
    .find((item) => item.id === 'mesh.webgpu') || null,
}));

app.post('/api/mesh/peer/register', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  try {
    const result = await peerMesh.register(request.body || {});
    await fabric.refreshPeers().catch(() => {});
    return result;
  } catch (error) {
    return reply.code(422).send({ error: String(error?.message || error) });
  }
});

app.post('/api/mesh/peer/signal', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  try {
    return await peerMesh.signal(request.body || {});
  } catch (error) {
    return reply.code(422).send({ error: String(error?.message || error) });
  }
});

app.post('/api/mesh/peer/poll', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  try {
    return await peerMesh.poll(
      request.body?.peer_id,
      request.body?.worker_id,
      request.body?.after_id || 0,
    );
  } catch (error) {
    return reply.code(422).send({ error: String(error?.message || error) });
  }
});

app.post('/api/mesh/peer/complete', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  try {
    const result = await peerMesh.completeSession(request.body || {});
    await fabric.refreshPeers().catch(() => {});
    return result;
  } catch (error) {
    return reply.code(422).send({ error: String(error?.message || error) });
  }
});

app.post('/api/mesh/p2p/execute', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  try {
    await fabric.refreshPeers().catch(() => {});
    return await peerMesh.execute(
      String(request.body?.capability || 'webgpu'),
      request.body?.task || {},
      {
        timeoutMs: request.body?.timeout_ms,
        quorum: request.body?.quorum || 1,
      },
    );
  } catch (error) {
    return reply.code(422).send({ error: String(error?.message || error) });
  }
});

app.get('/api/mesh/workers', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? { workers: await bridge.workers({ onlineOnly: true, computeOnly: true }) }
    : undefined);

app.post('/api/mesh/execute', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  const kind = String(request.body?.kind || 'compute').trim().toLowerCase();
  if (!['compute', 'inference', 'moa'].includes(kind)) {
    return reply.code(422).send({ error: 'kind Compute Mesh non autorisé' });
  }
  try {
    if (kind === 'moa') {
      return await bridge.executeMoA(request.body?.payload || {}, {
        maxAgents: request.body?.max_agents || request.body?.payload?.max_agents,
        timeoutMs: request.body?.timeout_ms,
      });
    }
    return await bridge.executeMesh(kind, request.body?.payload || {}, {
      capability: kind,
      quorum: request.body?.quorum || 1,
      verification: String(request.body?.verification || 'none'),
      timeoutMs: request.body?.timeout_ms,
    });
  } catch (error) {
    return reply.code(422).send({ error: String(error?.message || error) });
  }
});

app.get('/api/fabric/status', async () => ({
  ...fabric.status(),
  dag_compiler: DagCompiler.VERSION,
  graph_executor: TaskGraphExecutor.VERSION,
}));

app.get('/api/fabric/capabilities', async (request, reply) =>
  requirePrivate(request, reply)
    ? { capabilities: fabric.list({ includeDisabled: true }) }
    : undefined);

app.post('/api/fabric/discover', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  try {
    const discovered = await fabric.discoverRemote();
    return { ok: true, discovered, status: fabric.status() };
  } catch (error) {
    return reply.code(502).send({ error: String(error?.message || error) });
  }
});

app.post('/api/fabric/plan', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  const objective = String(request.body?.objective || '').trim();
  if (!objective) return reply.code(422).send({ error: 'Objectif Fabric requis' });
  try {
    await fabric.refreshMesh().catch(() => {});
    await fabric.refreshPeers().catch(() => {});
    return await dagCompiler.compile(objective, fabric.list(), {
      maxNodes: config.fabricMaxGraphNodes,
      maxParallel: config.fabricMaxParallel,
      budgetMicrounits: config.fabricDefaultBudgetMicrounits,
    });
  } catch (error) {
    return reply.code(422).send({ error: String(error?.message || error) });
  }
});

app.post('/api/fabric/execute', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  try {
    await fabric.refreshMesh().catch(() => {});
    await fabric.refreshPeers().catch(() => {});
    const graph = request.body?.graph || await dagCompiler.compile(
      String(request.body?.objective || ''),
      fabric.list(),
      {
        maxNodes: config.fabricMaxGraphNodes,
        maxParallel: config.fabricMaxParallel,
        budgetMicrounits: config.fabricDefaultBudgetMicrounits,
      },
    );
    return await graphExecutor.execute(graph, {
      trigger: String(request.body?.trigger || 'private-api'),
    });
  } catch (error) {
    return reply.code(422).send({ error: String(error?.message || error) });
  }
});

app.get('/api/command/status', async (request, reply) =>
  requireRuntime(reply)
    ? commandCenter.status({ publicView: !isPrivate(request) })
    : undefined);

app.get('/api/command/initiatives', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? commandCenter.initiatives(request.query?.limit, request.query?.status)
    : undefined);

app.get('/api/command/services', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? commandCenter.services()
    : undefined);

app.post('/api/command/services', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  try {
    return await commandCenter.upsertService(request.body || {});
  } catch (error) {
    return reply.code(422).send({ error: String(error?.message || error) });
  }
});

app.post('/api/command/services/:id/state', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  try {
    return await commandCenter.observeService(request.params.id, request.body || {});
  } catch (error) {
    return reply.code(422).send({ error: String(error?.message || error) });
  }
});

app.post('/api/command/run', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  return commandCenter.runCycle(String(request.body?.trigger || 'private-api'));
});

app.post('/api/command/initiatives/:id/retry', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  try {
    return await commandCenter.retryInitiative(request.params.id);
  } catch (error) {
    return reply.code(409).send({ error: String(error?.message || error) });
  }
});

app.get('/api/evolution/status', async (_request, reply) =>
  requireRuntime(reply) ? evolution.status() : undefined);

app.get('/api/evolution/cycles', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? evolution.cycles(request.query?.limit)
    : undefined);

app.post('/api/evolution/run', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  const objective = String(
    request.body?.objective || 'Chercher une optimisation faible risque du noyau AURA Cloud Node.',
  );
  return evolution.dispatchCycle(objective, String(request.body?.trigger || 'private-api'));
});

app.get('/api/evolution/canary/:cycleId', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? evolution.canaryStatus(request.params.cycleId)
    : undefined);

app.post('/api/evolution/canary/:cycleId', async (request, reply) =>
  requireCanary(request, reply) && requireRuntime(reply)
    ? evolution.recordCanary(request.params.cycleId, request.body || {})
    : undefined);

async function runtimeMetricsSnapshot() {
  const [evolutionStatus, schema] = await Promise.all([
    bootstrap.runtimeReady ? evolution.status().catch(() => ({ last_error: 'unavailable' })) : Promise.resolve(null),
    bootstrap.dbReady ? schemaStatus().catch(() => ({ current: 0, latest: 0, ready: false })) : Promise.resolve(null),
  ]);
  return {
    ...metrics.snapshot({
      runtimeReady: bootstrap.runtimeReady,
      dbReady: bootstrap.dbReady,
      ai: ai.diagnostic(),
      evolution: evolutionStatus,
    }),
    schema,
  };
}

app.get('/api/ops/status', async (request, reply) => {
  if (!requirePrivate(request, reply)) return;
  return {
    metrics: await runtimeMetricsSnapshot(),
    backups: bootstrap.dbReady ? await listLogicalBackups(10) : [],
  };
});

app.post('/api/ops/backup', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  return createLogicalBackup(String(request.body?.reason || 'manual'));
});

app.get('/api/ops/backups', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  return listLogicalBackups(request.query?.limit);
});

app.get('/api/ops/backups/:id', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  const row = await getLogicalBackup(request.params.id);
  if (!row) return reply.code(404).send({ error: 'Snapshot AURA introuvable' });
  let snapshot = {};
  try { snapshot = JSON.parse(row.payload || '{}'); } catch {}
  return {
    id: row.id,
    reason: row.reason,
    schema_version: row.schema_version,
    payload_bytes: row.payload_bytes,
    created_at: row.created_at,
    snapshot,
  };
});

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
let backupTimer = null;
let metricsTimer = null;

function startMaintenance() {
  if (!backupTimer) {
    const runBackup = () => {
      if (!bootstrap.runtimeReady) return;
      createLogicalBackup('scheduled').catch((error) => {
        app.log.warn({ err: error }, 'AURA Cloud: snapshot logique impossible.');
      });
    };
    backupTimer = setInterval(runBackup, config.backupIntervalSeconds * 1000);
    backupTimer.unref?.();
  }
  if (!metricsTimer) {
    const rollup = async () => {
      if (!bootstrap.runtimeReady) return;
      try {
        await recordMetricRollup('runtime', await runtimeMetricsSnapshot());
      } catch (error) {
        app.log.warn({ err: error }, 'AURA Cloud: rollup métrique impossible.');
      }
    };
    metricsTimer = setInterval(rollup, config.metricsRollupSeconds * 1000);
    metricsTimer.unref?.();
  }
}

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
  }, 15_000);
  retryTimer.unref?.();
}

export async function stopAura() {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
  if (metricsTimer) {
    clearInterval(metricsTimer);
    metricsTimer = null;
  }
  commandCenter.stop();
  fabric.stop();
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
