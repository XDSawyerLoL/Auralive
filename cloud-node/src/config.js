import 'dotenv/config';

function bool(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'oui', 'on'].includes(String(value).trim().toLowerCase());
}

function int(name, fallback, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, value));
}

function csv(name, fallback = '') {
  return String(process.env[name] ?? fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeIceServer(row) {
  const raw = typeof row === 'string' ? { urls: row } : (row && typeof row === 'object' ? row : {});
  const sourceUrls = Array.isArray(raw.urls) ? raw.urls : [raw.urls];
  const urls = sourceUrls
    .map((item) => String(item || '').trim())
    .filter((item) => /^(stun|stuns|turn|turns):/i.test(item))
    .slice(0, 8);
  if (!urls.length) return null;
  const normalized = {
    urls: urls.length === 1 ? urls[0] : urls,
  };
  const usesTurn = urls.some((item) => /^turns?:/i.test(item));
  if (usesTurn && raw.username != null) {
    normalized.username = String(raw.username).slice(0, 512);
  }
  if (usesTurn && raw.credential != null) {
    normalized.credential = String(raw.credential).slice(0, 2048);
  }
  if (usesTurn && raw.credentialType === 'password') {
    normalized.credentialType = 'password';
  }
  return normalized;
}

export function configuredIceServers() {
  const json = String(process.env.AURA_MESH_ICE_SERVERS_JSON || '').trim();
  if (json) {
    try {
      const parsed = JSON.parse(json);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      const normalized = rows.map(normalizeIceServer).filter(Boolean).slice(0, 12);
      if (normalized.length) return normalized;
    } catch {
      // Invalid optional JSON falls back to the safe comma-separated STUN list.
    }
  }
  return csv('AURA_MESH_ICE_SERVERS', 'stun:stun.cloudflare.com:3478')
    .map(normalizeIceServer)
    .filter(Boolean)
    .slice(0, 12);
}

function iceTransportPolicy() {
  const value = String(process.env.AURA_MESH_ICE_TRANSPORT_POLICY || 'all').trim().toLowerCase();
  return value === 'relay' ? 'relay' : 'all';
}

function num(name, fallback, min = -Infinity, max = Infinity) {
  const parsed = Number.parseFloat(process.env[name] ?? '');
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, value));
}

const AI_MODE = String(process.env.AI_MODE || 'off').trim().toLowerCase();
const AI_DEFAULT_BASE_URL = AI_MODE === 'gemini'
  ? 'https://generativelanguage.googleapis.com/v1beta'
  : 'http://localhost:11434';
const AI_DEFAULT_MODEL = AI_MODE === 'gemini'
  ? 'gemini-3.5-flash-lite'
  : 'gemma3:12b';

function configBridgeMode() {
  return (process.env.AURA_BRIDGE_TOKEN || process.env.AURA_CLOUD_TOKEN)
    ? 'remote-execute'
    : 'plan-only';
}

export const config = Object.freeze({
  host: process.env.AURA_HOST || '0.0.0.0',
  // Hostinger Node.js Web Apps proxy vers le port 3000. On ignore PORT pour éviter
  // qu'une variable injectée par l'environnement détourne le listener.
  port: int('AURA_PORT', 3000, 1, 65535),
  publicBaseUrl: String(process.env.AURA_PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  logLevel: process.env.LOG_LEVEL || 'info',

  cloudToken: process.env.AURA_CLOUD_TOKEN || '',
  canaryToken: process.env.AURA_EVOLUTION_CANARY_TOKEN || '',

  dbUrl: process.env.DATABASE_URL || process.env.MYSQL_URL || '',
  dbHost: process.env.DB_HOST || process.env.DATABASE_HOST || process.env.MYSQL_HOST || 'localhost',
  dbPort: Number.parseInt(
    process.env.DB_PORT || process.env.DATABASE_PORT || process.env.MYSQL_PORT || '3306',
    10,
  ) || 3306,
  dbUser: process.env.DB_USER || process.env.DATABASE_USER || process.env.MYSQL_USER || '',
  dbPassword: process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD || process.env.MYSQL_PASSWORD || '',
  dbName: process.env.DB_NAME || process.env.DB_DATABASE || process.env.DATABASE_NAME || process.env.MYSQL_DATABASE || '',
  dbConnectionLimit: int('DB_CONNECTION_LIMIT', 10, 1, 30),
  dbConnectTimeoutMs: int('DB_CONNECT_TIMEOUT_MS', 5000, 1000, 30000),
  backupIntervalSeconds: int('AURA_BACKUP_INTERVAL_SECONDS', 21600, 900, 604800),
  backupRetentionCount: int('AURA_BACKUP_RETENTION_COUNT', 28, 3, 365),
  metricsRollupSeconds: int('AURA_METRICS_ROLLUP_SECONDS', 300, 60, 86400),

  aiMode: AI_MODE,
  aiBaseUrl: String(process.env.AI_BASE_URL || AI_DEFAULT_BASE_URL).replace(/\/$/, ''),
  aiModel: process.env.AI_MODEL || AI_DEFAULT_MODEL,
  aiApiKey: process.env.AI_API_KEY || '',
  aiTimeoutMs: int('AI_TIMEOUT_MS', 45000, 1000, 180000),
  aiTemperature: Number(process.env.AI_TEMPERATURE || 0.65),
  localAiPreferred: bool('AURA_LOCAL_AI_PREFERRED', true),

  voiceCloudEnabled: bool('MAIRAIY_CLOUD_VOICE_ENABLED', true),
  voiceApiKey: process.env.TTS_API_KEY || process.env.AI_API_KEY || '',
  voiceBaseUrl: String(process.env.TTS_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, ''),
  voiceModel: process.env.TTS_MODEL || 'gemini-3.1-flash-tts-preview',
  voiceName: process.env.TTS_VOICE || process.env.MAIRAIY_GEMINI_VOICE || 'Leda',
  voiceTimeoutMs: int('TTS_TIMEOUT_MS', 35000, 5000, 120000),

  cognitiveEnabled: bool('AURA_COGNITIVE_ENABLED', true),
  cognitiveTickSeconds: int('AURA_COGNITIVE_TICK_SECONDS', 30, 5, 86400),
  cognitiveReflectionSeconds: int('AURA_COGNITIVE_REFLECTION_SECONDS', 300, 30, 86400),
  cognitiveMaxReflectionsPerHour: int('AURA_COGNITIVE_MAX_REFLECTIONS_PER_HOUR', 6, 1, 60),

  curiosityEnabled: bool('AURA_CURIOSITY_ENABLED', true),
  curiosityTickSeconds: int('AURA_CURIOSITY_TICK_SECONDS', 180, 30, 86400),
  curiosityWarmupSeconds: int('AURA_CURIOSITY_WARMUP_SECONDS', 45, 10, 600),
  curiosityQuestionsPerCycle: int('AURA_CURIOSITY_QUESTIONS_PER_CYCLE', 3, 1, 8),
  curiosityResearchPerCycle: int('AURA_CURIOSITY_RESEARCH_PER_CYCLE', 1, 0, 4),
  curiosityMaxQuestionsPerHour: int('AURA_CURIOSITY_MAX_QUESTIONS_PER_HOUR', 10, 1, 60),
  curiosityMaxWebResearchPerHour: int('AURA_CURIOSITY_MAX_WEB_RESEARCH_PER_HOUR', 3, 0, 20),
  curiosityMaxInterlocutorQuestionsPerHour: int('AURA_CURIOSITY_MAX_INTERLOCUTOR_QUESTIONS_PER_HOUR', 2, 0, 12),
  curiosityProductStaleSeconds: int('AURA_CURIOSITY_PRODUCT_STALE_SECONDS', 900, 60, 86400),

  commandCenterEnabled: bool('AURA_COMMAND_CENTER_ENABLED', true),
  commandCenterAutoExecute: bool('AURA_COMMAND_CENTER_AUTO_EXECUTE', true),
  commandCenterTickSeconds: int('AURA_COMMAND_CENTER_TICK_SECONDS', 60, 15, 86400),
  commandCenterWarmupSeconds: int('AURA_COMMAND_CENTER_WARMUP_SECONDS', 20, 10, 300),
  commandCenterMaxInitiativesPerHour: int('AURA_COMMAND_CENTER_MAX_INITIATIVES_PER_HOUR', 4, 1, 24),
  commandCenterCooldownSeconds: int('AURA_COMMAND_CENTER_COOLDOWN_SECONDS', 1800, 60, 86400),
  commandCenterMinConfidence: num('AURA_COMMAND_CENTER_MIN_CONFIDENCE', 0.66, 0.1, 1),
  commandCenterAllowedRisks: new Set(csv(
    'AURA_COMMAND_CENTER_ALLOWED_RISKS',
    'safe,ai,local-control,local-write',
  )),
  commandCenterFleetPollSeconds: int('AURA_COMMAND_CENTER_FLEET_POLL_SECONDS', 1200, 300, 86400),
  commandCenterRequestTimeoutMs: int('AURA_COMMAND_CENTER_REQUEST_TIMEOUT_MS', 9000, 1000, 60000),
  commandCenterGithubToken:
    process.env.AURA_COMMAND_GITHUB_TOKEN
    || process.env.AURA_EVOLUTION_GITHUB_MACHINE_TOKEN
    || process.env.GITHUB_TOKEN
    || '',
  commandCenterGithubRepos: csv(
    'AURA_COMMAND_GITHUB_REPOS',
    [
      'XDSawyerLoL/Auralive',
      'XDSawyerLoL/QuanticSillage',
      'XDSawyerLoL/QuanticMail',
      'XDSawyerLoL/QUANTIC-OS',
      'XDSawyerLoL/Quantic-Browser',
      'XDSawyerLoL/Human-Agency-Engine',
    ].join(','),
  ),
  commandCenterAutoRerunFailedCi: bool('AURA_COMMAND_AUTO_RERUN_FAILED_CI', true),
  commandCenterAutoCreateFailureIssue: bool('AURA_COMMAND_AUTO_CREATE_FAILURE_ISSUE', true),
  commandCenterMaxGithubActionsPerCycle: int('AURA_COMMAND_MAX_GITHUB_ACTIONS_PER_CYCLE', 2, 0, 6),

  webSubstrateEnabled: bool('AURA_WEB_SUBSTRATE_ENABLED', true),
  webSearchUrl: String(process.env.AURA_WEB_SEARCH_URL || '').trim(),
  webSearchApiKey: process.env.AURA_WEB_SEARCH_API_KEY || '',
  webSearchLanguage: process.env.AURA_WEB_SEARCH_LANGUAGE || 'fr-FR',
  webSearchResults: int('AURA_WEB_SEARCH_RESULTS', 8, 2, 20),
  webMaxQueries: int('AURA_WEB_MAX_QUERIES', 3, 1, 8),
  webMaxSources: int('AURA_WEB_MAX_SOURCES', 8, 2, 20),
  webMaxSourceBytes: int('AURA_WEB_MAX_SOURCE_BYTES', 240000, 20000, 1000000),
  webRequestTimeoutMs: int('AURA_WEB_REQUEST_TIMEOUT_MS', 12000, 1000, 60000),
  webMemoryTtlSeconds: int('AURA_WEB_MEMORY_TTL_SECONDS', 604800, 3600, 2592000),
  webAllowedDomains: new Set(csv('AURA_WEB_ALLOWED_DOMAINS', '')),
  webBlockedDomains: new Set(csv(
    'AURA_WEB_BLOCKED_DOMAINS',
    'localhost,metadata.google.internal,169.254.169.254',
  )),

  fabricEnabled: bool('AURA_FABRIC_ENABLED', true),
  fabricDiscoveryUrls: csv('AURA_FABRIC_DISCOVERY_URLS', ''),
  fabricToken: process.env.AURA_FABRIC_TOKEN || '',
  fabricRequestTimeoutMs: int('AURA_FABRIC_REQUEST_TIMEOUT_MS', 15000, 1000, 120000),
  fabricDiscoverySeconds: int('AURA_FABRIC_DISCOVERY_SECONDS', 900, 60, 86400),
  fabricMaxRemoteCapabilities: int('AURA_FABRIC_MAX_REMOTE_CAPABILITIES', 64, 1, 256),
  fabricRemoteTrustCeiling: num('AURA_FABRIC_REMOTE_TRUST_CEILING', 0.78, 0.1, 0.95),
  fabricMaxGraphNodes: int('AURA_FABRIC_MAX_GRAPH_NODES', 32, 1, 128),
  fabricMaxParallel: int('AURA_FABRIC_MAX_PARALLEL', 12, 1, 64),
  fabricDefaultBudgetMicrounits: int('AURA_FABRIC_DEFAULT_BUDGET_MICROUNITS', 0, 0, 1_000_000_000),

  meshP2pEnabled: bool('AURA_MESH_P2P_ENABLED', true),
  meshPeerOnlineMs: int('AURA_MESH_PEER_ONLINE_MS', 45_000, 5_000, 300_000),
  meshPeerClockSkewMs: int('AURA_MESH_PEER_CLOCK_SKEW_MS', 300_000, 30_000, 900_000),
  meshP2pTimeoutMs: int('AURA_MESH_P2P_TIMEOUT_MS', 45_000, 5_000, 180_000),
  meshIceServers: configuredIceServers(),
  meshIceTransportPolicy: iceTransportPolicy(),

  horizonEnabled: bool('HORIZON_ENABLED', false),
  horizonBaseUrl: String(process.env.HORIZON_BASE_URL || '').replace(/\/$/, ''),
  horizonApiKey: process.env.HORIZON_API_KEY || '',
  horizonExternalId: process.env.HORIZON_EXTERNAL_ID || 'aura-cloud',
  horizonPollSeconds: int('HORIZON_POLL_SECONDS', 60, 15, 86400),
  horizonRequestTimeoutMs: int('HORIZON_REQUEST_TIMEOUT_MS', 8000, 1000, 60000),
  horizonEventLimit: int('HORIZON_EVENT_LIMIT', 100, 1, 200),
  horizonCandidateLimit: int('HORIZON_CANDIDATE_LIMIT', 100, 1, 200),
  horizonForecastLimit: int('HORIZON_FORECAST_LIMIT', 100, 1, 200),
  horizonAiContextSignals: int('HORIZON_AI_CONTEXT_SIGNALS', 10, 1, 30),
  horizonCountry: process.env.HORIZON_COUNTRY || 'FR',
  horizonCurrency: process.env.HORIZON_CURRENCY || 'EUR',
  horizonTimezone: process.env.HORIZON_TIMEZONE || 'Europe/Paris',

  evolutionEnabled: bool('AURA_EVOLUTION_ENABLED', true),
  evolutionIntervalSeconds: int('AURA_EVOLUTION_INTERVAL_SECONDS', 21600, 3600, 604800),
  evolutionRepository: process.env.AURA_EVOLUTION_GITHUB_REPOSITORY || 'XDSawyerLoL/Auralive',
  evolutionBaseBranch: process.env.AURA_EVOLUTION_GITHUB_BASE_BRANCH || 'main',
  evolutionAllowedDomains: new Set(csv('AURA_EVOLUTION_ALLOWED_DOMAINS', 'api.github.com,registry.npmjs.org')),
  evolutionResearchUrls: csv('AURA_EVOLUTION_RESEARCH_URLS', ''),
  evolutionCanaryRequired: bool('AURA_EVOLUTION_CANARY_REQUIRED', true),
  evolutionCanaryMode: String(process.env.AURA_EVOLUTION_CANARY_MODE || 'automatic').trim().toLowerCase(),
  evolutionCanaryMinObservations: int('AURA_EVOLUTION_CANARY_MIN_OBSERVATIONS', 3, 1, 1000),
  evolutionAutoSubmit: false,
  evolutionAutoMerge: false,

  cloudOperatorMode: configBridgeMode(),
});

export function productionConfigIssues() {
  const issues = [];
  if (!config.dbUrl && (!config.dbUser || !config.dbName)) {
    issues.push({
      code: 'database_not_configured',
      message: 'MySQL n’est pas encore configuré. Renseigne DATABASE_URL ou DB_USER + DB_NAME.',
    });
  }
  if (process.env.NODE_ENV === 'production' && !config.cloudToken) {
    issues.push({
      code: 'cloud_token_missing',
      message: 'AURA_CLOUD_TOKEN est absent. Les fonctions privées restent verrouillées.',
    });
  }
  if (process.env.NODE_ENV === 'production' && config.evolutionCanaryRequired && config.evolutionCanaryMode === 'manual' && !config.canaryToken) {
    issues.push({
      code: 'canary_token_missing',
      message: 'AURA_EVOLUTION_CANARY_TOKEN est absent alors que le canary manuel est activé.',
    });
  }
  if (config.aiMode === 'gemini' && !config.aiApiKey) {
    issues.push({
      code: 'gemini_api_key_missing',
      message: 'AI_MODE=gemini exige AI_API_KEY.',
    });
  }
  if (config.aiMode === 'bridge' && !config.cloudToken && !process.env.AURA_BRIDGE_TOKEN) {
    issues.push({
      code: 'bridge_token_missing',
      message: 'AI_MODE=bridge exige AURA_CLOUD_TOKEN ou AURA_BRIDGE_TOKEN.',
    });
  }
  if (process.env.NODE_ENV === 'production' && config.fabricDiscoveryUrls.length && !config.fabricToken) {
    issues.push({
      code: 'fabric_token_missing',
      message: 'AURA_FABRIC_DISCOVERY_URLS est configuré mais AURA_FABRIC_TOKEN est absent.',
    });
  }
  if (config.meshIceTransportPolicy === 'relay' && !config.meshIceServers.some((row) => {
    const urls = Array.isArray(row?.urls) ? row.urls : [row?.urls];
    return urls.some((url) => /^turns?:/i.test(String(url || '')));
  })) {
    issues.push({
      code: 'mesh_turn_missing',
      message: 'AURA_MESH_ICE_TRANSPORT_POLICY=relay exige au moins un serveur TURN/TURNS.',
    });
  }
  return issues;
}

export function databaseConfigured() {
  return Boolean(config.dbUrl || (config.dbUser && config.dbName));
}
