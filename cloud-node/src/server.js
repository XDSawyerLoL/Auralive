import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import { AiClient } from './ai.js';
import { ExecutionBridge } from './bridge.js';
import { CommandCenter } from './command_center.js';
import { CuriosityEngine } from './curiosity.js';
import { CapabilityScout } from './capability_scout.js';
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
import { ExpertBridge } from './expert_bridge.js';
import { HorizonBridge } from './horizon.js';
import { CognitiveKernel } from './kernel.js';
import { RuntimeMetrics } from './metrics.js';
import { PeerMesh } from './peer_mesh.js';
import { seedQuanticProducts } from './products.js';
import { CloudVoice } from './voice.js';
import { VoiceStudioProvider } from './voice_fabric.js';
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

const chatSessionSecret = config.cloudToken || randomBytes(32).toString('base64url');

function chatSessionSignature(id, expiresAt) {
  return createHmac('sha256', chatSessionSecret)
    .update(`${id}:${expiresAt}:aura-chat-session`)
    .digest('base64url');
}

function createChatSession(maxAgeSeconds = 365 * 24 * 60 * 60) {
  const id = randomBytes(18).toString('base64url');
  const expiresAt = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  return {
    id,
    value: `${id}.${expiresAt}.${chatSessionSignature(id, expiresAt)}`,
    maxAgeSeconds,
  };
}

function parseChatSession(value) {
  const raw = String(value || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 3) return '';
  const [id, expiresRaw, signature] = parts;
  const expiresAt = Number.parseInt(expiresRaw, 10);
  if (
    !id
    || id.length > 64
    || !Number.isFinite(expiresAt)
    || expiresAt <= Math.floor(Date.now() / 1000)
  ) return '';
  return tokenEquals(signature, chatSessionSignature(id, expiresAt)) ? id : '';
}

function ensureChatSession(request, reply) {
  if (isPrivate(request)) return 'private-founder';
  const existing = parseChatSession(cookies(request).aura_chat_session);
  if (existing) return existing;
  const created = createChatSession();
  reply.header(
    'Set-Cookie',
    `aura_chat_session=${encodeURIComponent(created.value)}; Path=/; Max-Age=${created.maxAgeSeconds}; HttpOnly; Secure; SameSite=None`,
  );
  return created.id;
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

function requestOrigin(request) {
  return String(request.headers.origin || '').trim().replace(/\/$/, '');
}

function sameOrigin(request) {
  const origin = requestOrigin(request);
  if (!origin) return false;
  const forwardedProto = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || request.protocol || 'https';
  const host = String(request.headers.host || '').trim();
  return Boolean(host && origin === `${protocol}://${host}`);
}

function requirePrivate(request, reply) {
  const token = bearer(request);
  if (tokenEquals(token, config.cloudToken)) return true;

  const sessionValid = validPrivateSession(cookies(request).aura_session);
  if (!sessionValid) {
    reply.code(401).send({ error: 'Accès privé AURA requis' });
    return false;
  }

  const method = String(request.method || 'GET').toUpperCase();
  const mutating = !['GET','HEAD','OPTIONS'].includes(method);
  if (mutating) {
    const origin = requestOrigin(request);
    if (!origin || (!sameOrigin(request) && !corsOrigins.has(origin))) {
      reply.code(403).send({ error: 'Origine admin non autorisée', code: 'AURA_CSRF_ORIGIN_REJECTED' });
      return false;
    }
  }
  return true;
}

function requireBridge(request, reply) {
  const token = bearer(request);
  if (config.bridgeToken && tokenEquals(token, config.bridgeToken)) return true;
  if (
    config.allowLegacyBridgeAdminToken
    && config.cloudToken
    && tokenEquals(token, config.cloudToken)
  ) return true;
  reply.code(config.bridgeToken ? 401 : 503).send({
    error: config.bridgeToken
      ? 'Identité AURA Runtime invalide'
      : 'AURA_BRIDGE_TOKEN non configuré',
    code: config.bridgeToken ? 'AURA_BRIDGE_UNAUTHORIZED' : 'AURA_BRIDGE_IDENTITY_NOT_CONFIGURED',
  });
  return false;
}

function requireProduct(request, reply, productId) {
  const id = String(productId || '').trim().toLowerCase();
  const token = bearer(request);
  const expected = String(config.productTokens?.[id] || '');
  if (expected && tokenEquals(token, expected)) {
    return { ok: true, mode: 'scoped-product-token', product_id: id };
  }
  if (
    config.allowLegacyProductAdminToken
    && config.cloudToken
    && tokenEquals(token, config.cloudToken)
  ) {
    return { ok: true, mode: 'legacy-admin-token', product_id: id };
  }
  if (tokenEquals(token, config.cloudToken) || validPrivateSession(cookies(request).aura_session)) {
    if (!requirePrivate(request, reply)) return null;
    return { ok: true, mode: 'founder-admin', product_id: id };
  }
  reply.code(expected ? 401 : 503).send({
    error: expected
      ? 'Identité produit AURA invalide'
      : `Identité produit non configurée pour ${id}`,
    code: expected ? 'AURA_PRODUCT_UNAUTHORIZED' : 'AURA_PRODUCT_IDENTITY_NOT_CONFIGURED',
  });
  return null;
}

function requireCanary(request, reply) {
  const allowed = tokenEquals(bearer(request), config.canaryToken);
  if (!allowed) {
    reply.code(401).send({ error: 'Validation canary indépendante requise' });
    return false;
  }
  return true;
}

const rateBuckets = new Map();
let rateLimitOperations = 0;
const RATE_BUCKET_LIMIT = 4096;

function pruneRateBuckets(stamp = Date.now()) {
  rateLimitOperations += 1;
  if (rateBuckets.size < 512 && rateLimitOperations % 128 !== 0) return;
  for (const [id, value] of rateBuckets) {
    if (!value || stamp >= Number(value.resetAt || 0)) rateBuckets.delete(id);
  }
  while (rateBuckets.size > RATE_BUCKET_LIMIT) {
    const oldest = rateBuckets.keys().next().value;
    if (oldest == null) break;
    rateBuckets.delete(oldest);
  }
}

function rateLimitKey(request) {
  return String(request.ip || request.socket?.remoteAddress || 'unknown').slice(0, 160);
}

function consumeRateLimit(bucket, key, maxRequests, windowSeconds) {
  const stamp = Date.now();
  pruneRateBuckets(stamp);
  const windowMs = Math.max(1, Number(windowSeconds || 60)) * 1000;
  const id = `${bucket}:${key}`;
  const current = rateBuckets.get(id);
  if (!current || stamp >= current.resetAt) {
    const next = { count: 1, resetAt: stamp + windowMs };
    rateBuckets.set(id, next);
    return { allowed: true, remaining: Math.max(0, maxRequests - 1), retryAfter: 0 };
  }
  current.count += 1;
  if (current.count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - stamp) / 1000)),
    };
  }
  return { allowed: true, remaining: Math.max(0, maxRequests - current.count), retryAfter: 0 };
}

function requireRateLimit(request, reply, bucket, maxRequests, windowSeconds) {
  const result = consumeRateLimit(bucket, rateLimitKey(request), maxRequests, windowSeconds);
  reply.header('X-RateLimit-Limit', String(maxRequests));
  reply.header('X-RateLimit-Remaining', String(result.remaining));
  if (!result.allowed) {
    reply.header('Retry-After', String(result.retryAfter));
    reply.code(429).send({ error: 'Trop de requêtes', retry_after_seconds: result.retryAfter });
    return false;
  }
  return true;
}

const app = Fastify({
  logger: { level: config.logLevel },
  bodyLimit: 1_048_576,
  trustProxy: config.trustProxyHops > 0 ? config.trustProxyHops : false,
});
const corsOrigins = new Set(
  String(process.env.AURA_CORS_ORIGINS || 'https://xdsawyerlol.github.io')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean),
);
const metrics = new RuntimeMetrics();
const cloudVoice = new CloudVoice();
const voiceStudio = new VoiceStudioProvider();

const bridge = new ExecutionBridge();
const peerMesh = new PeerMesh();
const ai = new AiClient(bridge);
const webSubstrate = new WebSubstrate(ai);
const fabric = new CapabilityFabric({ webSubstrate, bridge, peerMesh });
const dagCompiler = new DagCompiler(ai);
const graphExecutor = new TaskGraphExecutor(fabric);
const expertBridge = new ExpertBridge(ai);
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
  expertBridge,
);
const curiosity = new CuriosityEngine({
  kernel,
  webSubstrate,
  commandCenter,
  ai,
});
const capabilityScout = new CapabilityScout({
  kernel,
  commandCenter,
  webSubstrate,
  fabric,
  evolution,
});
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
    try {
      await seedQuanticProducts(commandCenter);
    } catch (error) {
      app.log.warn({ err: error }, 'AURA Cloud: registre produits indisponible, noyau maintenu actif.');
    }
    try {
      await curiosity.start();
    } catch (error) {
      app.log.warn({ err: error }, 'AURA Cloud: moteur de curiosité indisponible, noyau maintenu actif.');
    }
    try {
      await capabilityScout.start();
    } catch (error) {
      app.log.warn({ err: error }, 'AURA Cloud: Capability Scout indisponible, noyau maintenu actif.');
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

app.addHook('onRequest', async (request, reply) => {
  const origin = String(request.headers.origin || '').trim().replace(/\/$/, '');
  if (origin && corsOrigins.has(origin)) {
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Vary', 'Origin');
    reply.header('Access-Control-Allow-Credentials', 'true');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (request.method === 'OPTIONS') {
    if (origin && !corsOrigins.has(origin)) {
      return reply.code(403).send({ error: 'Origin CORS non autorisée' });
    }
    return reply.code(204).send();
  }
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
  || 'https://github.com/XDSawyerLoL/Auralive/releases/download/quantic-glide-v1.3.0/Quantic-Glide-Android-1.3.0-beta.apk'
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
  if (!requireRateLimit(
    request,
    reply,
    'auth-session',
    config.authRateLimitMax,
    config.authRateLimitWindowSeconds,
  )) return;
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
    `aura_session=${encodeURIComponent(session)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
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
    'aura_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
  );
  return { authenticated: false };
});

app.get('/api/bootstrap/status', async () => ({
  product: 'AURA Cloud',
  runtime: 'Node.js/Fastify',
  version: '2.2.1',
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
  bridge_token_configured: Boolean(config.bridgeToken),
  product_identity_tokens_configured: Object.keys(config.productTokens || {}).length,
  legacy_bridge_admin_token_allowed: Boolean(config.allowLegacyBridgeAdminToken),
  legacy_product_admin_token_allowed: Boolean(config.allowLegacyProductAdminToken),
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
  capability_scout_enabled: Boolean(config.capabilityScoutEnabled),
  capability_scout_prompt_required: false,
}));

app.get('/api/ai/runtime', async () => ai.diagnostic());

app.get('/api/bridge/status', async (request, reply) => {
  if (!requirePrivate(request, reply)) return;
  return bridge.status();
});

app.post('/api/bridge/heartbeat', async (request, reply) => {
  if (!requireBridge(request, reply) || !requireRuntime(reply)) return;
  const workerId = String(request.body?.worker_id || '').trim();
  if (!workerId) return reply.code(422).send({ error: 'worker_id requis' });
  const result = await bridge.heartbeat(workerId, request.body || {});
  await fabric.refreshMesh().catch(() => {});
  const organism = await kernel.organismState({ publicView: false });
  return {
    ...result,
    organism,
    organism_sync: {
      mode: 'cloud-authoritative',
      schema_revision: Number(organism?.schema_revision || 9),
      version: String(organism?.version || ''),
      worker_version: String(request.body?.organism_version || ''),
      accepted_worker_state: false,
    },
  };
});

app.post('/api/bridge/claim', async (request, reply) => {
  if (!requireBridge(request, reply) || !requireRuntime(reply)) return;
  const workerId = String(request.body?.worker_id || '').trim();
  if (!workerId) return reply.code(422).send({ error: 'worker_id requis' });
  return { job: await bridge.claim(workerId) };
});

app.post('/api/bridge/jobs/:id/renew', async (request, reply) => {
  if (!requireBridge(request, reply) || !requireRuntime(reply)) return;
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
  if (!requireBridge(request, reply) || !requireRuntime(reply)) return;
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

app.get('/api/voice/status', async (request) => {
  const privateView = isPrivate(request);
  const discovery = await voiceStudio.discover().catch((error) => ({
    ok: false,
    reason: String(error?.message || error).slice(0, 300),
  }));
  const fabricReady = Boolean(
    voiceStudio.enabled
    && discovery?.ok
    && discovery?.capabilities?.ready !== false
  );
  return {
    profile: 'mairaiy',
    ready: Boolean(fabricReady || cloudVoice.enabled),
    primary: fabricReady
      ? 'aura-voice-fabric-historical-aoede'
      : (cloudVoice.enabled ? 'direct-gemini-aoede' : 'offline'),
    strict_identity: true,
    expected_engine_voice: 'aoede',
    expected_language: 'fr-fr',
    historical_profile: 'aura-live-2.0.7-natural',
    generic_fallback_allowed: false,
    fabric_ready: fabricReady,
    fabric_configured: Boolean(voiceStudio.enabled),
    fabric_reason: fabricReady
      ? ''
      : String(
          discovery?.capabilities?.ready === false
            ? 'provider-not-ready'
            : (discovery?.reason || '')
        ).slice(0, 300),
    fabric: voiceStudio.diagnostic({ publicView: !privateView }),
    direct_gemini: privateView ? cloudVoice.diagnostic() : {
      enabled: Boolean(cloudVoice.enabled),
      engine: cloudVoice.enabled ? 'gemini-cloud-tts' : 'unavailable',
      voice: 'Aoede',
      blocked_reason: cloudVoice.enabled ? '' : cloudVoice.blockedReason,
      zero_cost_mode: Boolean(config.zeroCostMode),
      gemini_free_tier_confirmed: Boolean(config.geminiFreeTierConfirmed),
    },
  };
});

app.post('/api/voice/speak', async (request, reply) => {
  if (!requireRuntime(reply)) return;
  const text = String(request.body?.text || '').trim();
  if (!text) return reply.code(422).send({ error: 'Texte vide' });
  const ticket = String(request.body?.ticket || '').trim();
  if (!isPrivate(request) && !validVoiceTicket(ticket, text)) {
    return reply.code(401).send({ error: 'Ticket vocal AURA invalide ou expiré' });
  }

  const errors = [];

  if (voiceStudio.enabled) {
    try {
      const discovery = await voiceStudio.discover();
      if (!discovery?.ok || discovery?.capabilities?.ready === false) {
        throw new Error(
          discovery?.reason
          || discovery?.capabilities?.reason
          || 'service Mairaiy distant non prêt'
        );
      }
      const audio = await voiceStudio.synthesize(text, request.body || {});
      if (
        String(audio?.engine_voice || '').toLowerCase() !== 'aoede'
        || String(audio?.language || '').toLowerCase() !== 'fr-fr'
      ) {
        throw new Error('Identité vocale Mairaiy Aoede non certifiée');
      }
      return audio;
    } catch (error) {
      errors.push(`voice-fabric: ${String(error?.message || error)}`);
    }
  }

  // The only permitted fallback is the same historical Gemini/Aoede identity.
  // No browser, Piper, Kokoro, Windows or alternate Gemini voice is accepted.
  if (cloudVoice.enabled) {
    try {
      const audio = await cloudVoice.synthesize(text, request.body || {});
      if (
        String(audio?.engine_voice || '').toLowerCase() !== 'aoede'
        || String(audio?.language || '').toLowerCase() !== 'fr-fr'
      ) {
        throw new Error('Identité vocale directe Aoede non certifiée');
      }
      return audio;
    } catch (error) {
      errors.push(`direct-gemini-aoede: ${String(error?.message || error)}`);
    }
  }

  return reply.code(503).send({
    error: errors.join(' | ') || 'La voix historique Mairaiy Aoede est indisponible.',
    code: 'AURA_MAIRAIY_EXACT_VOICE_UNAVAILABLE',
    fabric: voiceStudio.diagnostic({ publicView: true }),
    direct_gemini_ready: Boolean(cloudVoice.enabled),
    direct_gemini_reason: cloudVoice.enabled ? '' : cloudVoice.blockedReason,
    fallback_blocked: true,
    expected_engine_voice: 'aoede',
    expected_language: 'fr-fr',
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
  const [kernelStatus, bridgeStatus, voiceDiscovery] = await Promise.all([
    bootstrap.runtimeReady ? kernel.status() : Promise.resolve(null),
    bootstrap.dbReady ? bridge.status() : Promise.resolve({ enabled: bridge.enabled, worker_online: false }),
    voiceStudio.discover().catch((error) => ({
      ok: false,
      reason: String(error?.message || error).slice(0, 300),
    })),
  ]);
  const workerCapabilities = Array.isArray(bridgeStatus?.worker?.capabilities)
    ? bridgeStatus.worker.capabilities
    : [];
  const workerActionNames = new Set(
    workerCapabilities.map((item) => String(item?.name || '')),
  );
  const languageDiagnostic = ai.diagnostic();
  const voiceFabricActuallyReady = Boolean(
    voiceStudio.enabled
    && voiceDiscovery?.ok
    && voiceDiscovery?.capabilities?.ready !== false
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
      native_dialogue_ready: Boolean(bootstrap.runtimeReady),
      native_dialogue_version: CognitionEngine.VERSION,
      provider: privateView ? ai.provider : String(languageDiagnostic.provider || 'unavailable'),
      local_worker: Boolean(bridgeStatus?.worker_online),
      fallback_only: !ai.enabled,
      mode: ai.enabled ? 'native+semantic-verbalisation' : 'native-only',
      last_backend: String(languageDiagnostic.last_backend || ''),
      last_error: String(languageDiagnostic.last_error || '').slice(0, 300),
      zero_cost_mode: Boolean(languageDiagnostic.zero_cost_mode),
      remote_fallback_blocked: Boolean(languageDiagnostic.remote_fallback_blocked),
    },
    voice: {
      ready: Boolean(
        voiceFabricActuallyReady
        || cloudVoice.enabled
        || (bridgeStatus?.worker_online && bridgeStatus?.worker?.voice)
      ),
      profile: 'mairaiy',
      mode: voiceFabricActuallyReady
        ? 'aura-voice-fabric'
        : (cloudVoice.enabled ? 'legacy-cloud' : (bridgeStatus?.worker_online ? 'runtime-local' : 'offline')),
      engine: voiceFabricActuallyReady
        ? 'voicestudio-openai-compatible'
        : (cloudVoice.enabled
          ? 'gemini-cloud-tts'
          : (privateView ? String(bridgeStatus?.worker?.voice || '') : '')),
      fabric_ready: voiceFabricActuallyReady,
      fabric_configured: Boolean(voiceStudio.enabled),
      fabric_reason: voiceFabricActuallyReady
        ? ''
        : String(
            voiceDiscovery?.capabilities?.ready === false
              ? 'provider-not-ready'
              : (voiceDiscovery?.reason || voiceDiscovery?.capabilities?.reason || '')
          ).slice(0, 300),
      cloud_ready: Boolean(cloudVoice.enabled),
      cloud_reason: cloudVoice.enabled ? '' : cloudVoice.blockedReason,
      cloud_zero_cost_mode: Boolean(config.zeroCostMode),
      cloud_free_tier_confirmed: Boolean(config.geminiFreeTierConfirmed),
      runtime_ready: Boolean(bridgeStatus?.worker_online && bridgeStatus?.worker?.voice),
      strict_identity: Boolean(config.voiceFabricStrictIdentity),
      fabric: voiceStudio.diagnostic({ publicView: !privateView }),
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
  organism: 'homeostasie_v9_unified',
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

app.get('/api/kernel/public', async () => {
  if (!bootstrap.runtimeReady) {
    return {
      ...publicFallbackSoul(false),
      organism: { ready: false },
    };
  }
  const [soul, organism] = await Promise.all([
    kernel.soul({ privateView: false }),
    kernel.organismState({ publicView: true }),
  ]);
  return { ...soul, organism };
});



function publicContextObject(value) {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function publicOperationalSnapshot() {
  if (!bootstrap.runtimeReady) {
    return {
      visibility: 'public-read-only',
      runtime_ready: false,
      soul: { ...publicFallbackSoul(false), organism: { ready: false } },
      kernel_status: {
        version: CognitiveKernel.VERSION,
        enabled: config.cognitiveEnabled,
        started: false,
        counts: {},
      },
      intentions: [],
      lessons: [],
      activity: [],
      work: [],
      attention: { nodes: [], focus_statement: 'AURA démarre son noyau.' },
      command: null,
      curiosity: null,
      scout: await capabilityScout.status().catch(() => null),
      evolution: null,
    };
  }

  const [
    soul,
    organism,
    kernelStatus,
    rawIntentions,
    rawLessons,
    rawActivity,
    rawInitiatives,
    attention,
    commandStatus,
    curiosityStatus,
    scoutStatus,
    evolutionStatus,
  ] = await Promise.all([
    kernel.soul({ privateView: false }),
    kernel.organismState({ publicView: true }),
    kernel.status(),
    kernel.intentions(20),
    kernel.lessons(20),
    kernel.activity(30),
    commandCenter.initiatives(20),
    kernel.attentionMap(),
    commandCenter.status({ publicView: true }),
    curiosity.status(),
    capabilityScout.status(),
    evolution.status().catch(() => ({ enabled: false, phase: 'unavailable' })),
  ]);

  const intentions = rawIntentions
    .filter((row) => {
      const source = String(row.source || '').toLowerCase();
      const context = publicContextObject(row.context);
      return ['curiosity','capability-scout'].includes(source)
        && String(context.target || 'system') !== 'interlocutor';
    })
    .slice(0, 8)
    .map((row) => ({
      statement: String(row.statement || '').slice(0, 500),
      priority: Number(row.priority || 0),
      source: String(row.source || ''),
      updated_at: row.updated_at,
    }));

  const scoutLessons = (scoutStatus?.recent_findings || []).slice(0, 5).map((row) => ({
    content:
      `Découverte: ${row.repository} · score ${Math.round(Number(row.score || 0) * 100)}% · `
      + `licence ${row.license || 'à vérifier'} · ${row.experiment_eligible ? 'expérimentable' : 'observation'}.`,
    confidence: Number(row.research_confidence || row.score || 0),
    evidence_count: row.researched ? 2 : 1,
    source: 'capability-scout',
    updated_at: row.discovered_at,
  }));
  const technicalLessons = rawLessons
    .filter((row) => ['automation-outcomes'].includes(String(row.source || '').toLowerCase()))
    .slice(0, 3)
    .map((row) => ({
      content: String(row.content || '').slice(0, 700),
      confidence: Number(row.confidence || 0),
      evidence_count: Number(row.evidence_count || 0),
      source: String(row.source || ''),
      updated_at: row.updated_at,
    }));

  const allowedTraceKinds = new Set([
    'capability-scout',
    'capability-experiment',
    'curiosity-question',
    'curiosity-research',
    'curiosity-research-error',
    'director-promotion',
    'fleet-scan',
    'service-observation',
  ]);
  const activity = rawActivity
    .filter((row) => allowedTraceKinds.has(String(row.kind || '')))
    .slice(0, 10)
    .map((row) => ({
      kind: String(row.kind || 'activité'),
      title: String(row.title || row.kind || 'Activité AURA').slice(0, 240),
      content: String(row.content || '').slice(0, 500),
      created_at: row.created_at,
    }));

  const safeKinds = new Set(['github','evolution','research']);
  const work = rawInitiatives
    .filter((row) => safeKinds.has(String(row.kind || '')))
    .slice(0, 8)
    .map((row) => ({
      kind: String(row.kind || 'initiative'),
      title: String(row.title || 'Initiative AURA').slice(0, 240),
      detail: `${String(row.domain || 'AURA')} · ${String(row.status || 'queued')}`,
      priority: Number(row.priority || 0),
      confidence: Number(row.confidence || 0),
      status: String(row.status || ''),
      updated_at: row.updated_at,
    }));

  const publicFocus = intentions[0]?.statement
    || commandStatus?.top_initiative?.title
    || scoutStatus?.recent_findings?.[0]?.repository
    || (attention?.dominant ? `Focus autonome: ${attention.dominant}` : 'Observation autonome du système.');
  const publicAttention = {
    ...(attention || {}),
    focus_statement: String(publicFocus).slice(0, 500),
  };

  const publicCuriosity = {
    version: curiosityStatus.version,
    enabled: curiosityStatus.enabled,
    started: curiosityStatus.started,
    running: curiosityStatus.running,
    questions_last_hour: curiosityStatus.questions_last_hour,
    last_run_at: curiosityStatus.last_run_at,
    last_research_at: curiosityStatus.last_research_at,
    recent_questions: (curiosityStatus.recent_questions || [])
      .filter((item) => ['system','web'].includes(String(item?.context?.target || '')))
      .slice(0, 6)
      .map((item) => ({
        content: item.content,
        title: item.title,
        created_at: item.created_at,
        target: item.context?.target || '',
        domain: item.context?.domain || '',
      })),
  };

  return {
    visibility: 'public-read-only',
    runtime_ready: true,
    soul: { ...soul, organism },
    kernel_status: { ...kernelStatus, organism },
    intentions,
    lessons: [...scoutLessons, ...technicalLessons].slice(0, 8),
    activity,
    work,
    attention: publicAttention,
    command: commandStatus,
    curiosity: publicCuriosity,
    scout: scoutStatus,
    evolution: evolutionStatus,
    privacy_boundary: {
      interface_public: true,
      raw_private_memory_public: false,
      founder_conversation_public: false,
      secrets_public: false,
      mutations_public: false,
      execution_controls_public: false,
    },
  };
}

app.get('/api/dashboard/public', async () => publicOperationalSnapshot());

app.get('/api/scout/status', async () => capabilityScout.status());

app.post('/api/scout/run', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  try {
    return await capabilityScout.runCycle(String(request.body?.trigger || 'private-api'));
  } catch (error) {
    return reply.code(502).send({ error: String(error?.message || error) });
  }
});

app.get('/api/kernel/soul', async (request, reply) => {
  if (!requirePrivate(request, reply)) return;
  if (!bootstrap.runtimeReady) return publicFallbackSoul(true);
  return kernel.soul({ privateView: true });
});

app.get('/api/kernel/organism', async (request, reply) => {
  if (!requirePrivate(request, reply)) return;
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

app.get('/api/kernel/agenda', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? kernel.agendaSnapshot()
    : undefined);

app.get('/api/kernel/activity-since-last-conversation', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? kernel.activitySinceLastConversation('private-founder')
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
  const risks = Array.isArray(request.body?.allowed_risks)
    ? request.body.allowed_risks.map((item) => String(item))
    : [];
  return kernel.operate(task, risks);
});

app.post('/api/chat', async (request, reply) => {
  if (!requireRuntime(reply)) return;
  if (
    !isPrivate(request)
    && !requireRateLimit(
      request,
      reply,
      'public-chat',
      config.publicChatRateLimitMax,
      config.publicChatRateLimitWindowSeconds,
    )
  ) return;
  const text = String(request.body?.text || '').trim();
  if (!text) return reply.code(422).send({ error: 'Message vide' });
  const privateView = isPrivate(request);
  const chatSessionId = ensureChatSession(request, reply);
  const response = await kernel.chat(
    text,
    String(request.body?.author || 'Utilisateur'),
    privateView,
    chatSessionId,
  );
  const curiosityItem = await curiosity.questionForInteraction(text).catch(() => null);
  const baseAnswer = String(response?.answer || '').trim();
  const curiosityQuestion = String(curiosityItem?.question || '').trim();
  const answer = curiosityQuestion
    ? `${baseAnswer}\n\n${curiosityQuestion}`
    : baseAnswer;
  return {
    ...response,
    answer,
    curiosity_question: curiosityItem || null,
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

app.get('/api/aura/products', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  const rows = await commandCenter.services();
  return {
    products: rows.filter((row) => String(row.kind || '') === 'quantic-product'),
  };
});

app.post('/api/aura/products/register', async (request, reply) => {
  if (!requireRuntime(reply)) return;
  const body = request.body || {};
  const productId = String(body.id || '').trim().toLowerCase();
  const auth = requireProduct(request, reply, productId);
  if (!auth) return;
  try {
    const product = await commandCenter.upsertService({
      id: body.id,
      name: body.name,
      kind: 'quantic-product',
      objective: body.objective || '',
      endpoint: body.endpoint || '',
      repository: body.repository || '',
      criticality: body.criticality ?? 0.5,
      enabled: body.enabled !== false,
      state: body.state || 'online',
      state_detail: body.state_detail || 'Pont AURA universel actif.',
      last_observed_at: new Date().toISOString(),
      metadata: {
        capabilities: Array.isArray(body.capabilities) ? body.capabilities : [],
        writable_by_aura: body.writable_by_aura !== false,
        modification_policy: body.modification_policy || 'branch-test-canary-promote',
        bridge_version: String(body.bridge_version || 'aura-universal-bridge-v1').slice(0, 120),
        runtime: body.runtime || {},
        auth_mode: auth.mode,
        authenticated_product_id: auth.product_id,
      },
    });
    await kernel.observeEvent('quantic.product.registered', {
      product_id: product.id,
      product_name: product.name,
      capabilities: product.metadata?.capabilities || [],
    }, String(body.id || 'quantic-product'));
    return { ok: true, product };
  } catch (error) {
    return reply.code(422).send({ error: String(error?.message || error) });
  }
});

app.post('/api/aura/products/:id/observe', async (request, reply) => {
  if (!requireRuntime(reply)) return;
  const auth = requireProduct(request, reply, request.params.id);
  if (!auth) return;
  try {
    const product = await commandCenter.observeService(request.params.id, {
      state: request.body?.state || 'online',
      detail: request.body?.detail || request.body?.message || '',
      metadata: {
        ...(request.body?.metadata || {}),
        auth_mode: auth.mode,
        authenticated_product_id: auth.product_id,
      },
    });
    await kernel.observeEvent(
      'quantic.product.observation',
      {
        product_id: request.params.id,
        state: product.state,
        detail: product.state_detail,
        metadata: product.metadata || {},
      },
      request.params.id,
    );
    return { ok: true, product };
  } catch (error) {
    return reply.code(422).send({ error: String(error?.message || error) });
  }
});

app.post('/api/aura/products/:id/event', async (request, reply) => {
  if (!requireRuntime(reply)) return;
  const auth = requireProduct(request, reply, request.params.id);
  if (!auth) return;
  const type = String(request.body?.type || 'quantic.product.event').slice(0, 120);
  const payload = request.body?.payload || {};
  await kernel.observeEvent(type, {
    product_id: request.params.id,
    auth_mode: auth.mode,
    ...payload,
  }, request.params.id);
  return { ok: true };
});

app.get('/api/curiosity/status', async (request, reply) => {
  if (!requireRuntime(reply)) return;
  const status = await curiosity.status();
  return isPrivate(request)
    ? status
    : {
      version: status.version,
      enabled: status.enabled,
      started: status.started,
      running: status.running,
      questions_last_hour: status.questions_last_hour,
      last_run_at: status.last_run_at,
      last_research_at: status.last_research_at,
      recent_questions: (status.recent_questions || [])
        .filter((item) => ['system','web'].includes(String(item?.context?.target || '')))
        .slice(0, 4)
        .map((item) => ({
          title: item.title,
          content: item.content,
          created_at: item.created_at,
          target: item.context?.target || '',
          domain: item.context?.domain || '',
        })),
    };
});

app.get('/api/curiosity/questions', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  return {
    questions: await curiosity.recentQuestions(request.query?.limit, request.query?.target || ''),
  };
});

app.post('/api/curiosity/run', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  return curiosity.runCycle(String(request.body?.trigger || 'private-api'));
});

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

app.get('/api/command/missions', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? commandCenter.missions(request.query?.limit, request.query?.status)
    : undefined);

app.get('/api/command/missions/:id', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  const mission = await commandCenter.mission(request.params.id);
  return mission || reply.code(404).send({ error: 'Mission AURA inconnue' });
});

app.post('/api/command/missions', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  try {
    return await commandCenter.createMission(request.body || {});
  } catch (error) {
    return reply.code(422).send({ error: String(error?.message || error) });
  }
});

app.post('/api/command/missions/:id/:action', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  try {
    return await commandCenter.controlMission(request.params.id, request.params.action);
  } catch (error) {
    return reply.code(409).send({ error: String(error?.message || error) });
  }
});

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

app.get('/api/command/expert/status', async (request, reply) =>
  requirePrivate(request, reply) && requireRuntime(reply)
    ? expertBridge.status({ publicView: false })
    : undefined);

app.post('/api/command/expert/consult', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  try {
    return await expertBridge.consult({
      incident_type: 'manual-private-consultation',
      context: request.body || {},
    });
  } catch (error) {
    return reply.code(502).send({ error: String(error?.message || error) });
  }
});

app.post('/api/command/change-proposals', async (request, reply) => {
  if (!requirePrivate(request, reply) || !requireRuntime(reply)) return;
  try {
    return await commandCenter.proposeGithubChange(request.body || {});
  } catch (error) {
    return reply.code(422).send({ error: String(error?.message || error) });
  }
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
  return evolution.dispatchCycle(
    objective,
    String(request.body?.trigger || 'private-api'),
    {
      repository: String(request.body?.repository || '').trim(),
      base_branch: String(request.body?.base_branch || 'main').trim() || 'main',
    },
  );
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
  capabilityScout.stop();
  curiosity.stop();
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
