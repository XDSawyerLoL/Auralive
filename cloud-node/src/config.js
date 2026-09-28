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

const LEGACY_GEMINI_API_KEY = String(
  process.env.AI_API_KEY
  || process.env.GEMINI_API_KEY
  || process.env.GOOGLE_API_KEY
  || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  || ''
).trim();
const AI_MODE = String(
  process.env.AI_MODE
  || (LEGACY_GEMINI_API_KEY ? 'gemini' : 'off')
).trim().toLowerCase();
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
  // Fallback interne seulement. Le point d'entrée server.js honore d'abord
  // le PORT fourni par Hostinger, puis AURA_GATEWAY_PORT, puis 3000.
  port: int('AURA_PORT', 3000, 1, 65535),
  publicBaseUrl: String(process.env.AURA_PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  logLevel: process.env.LOG_LEVEL || 'info',

  cloudToken: process.env.AURA_CLOUD_TOKEN || '',
  canaryToken: process.env.AURA_EVOLUTION_CANARY_TOKEN || '',

  publicChatRateLimitMax: int('AURA_PUBLIC_CHAT_RATE_LIMIT_MAX', 20, 1, 600),
  publicChatRateLimitWindowSeconds: int('AURA_PUBLIC_CHAT_RATE_LIMIT_WINDOW_SECONDS', 60, 10, 3600),
  authRateLimitMax: int('AURA_AUTH_RATE_LIMIT_MAX', 8, 1, 100),
  authRateLimitWindowSeconds: int('AURA_AUTH_RATE_LIMIT_WINDOW_SECONDS', 900, 60, 86400),
  trustProxyHops: int('AURA_TRUST_PROXY_HOPS', 1, 0, 8),

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

  // Financial safety invariant. When enabled, AURA may use native cognition,
  // local/runtime workers and explicitly zero-cost fabric capabilities, but not
  // remote model APIs that can create usage charges.
  zeroCostMode: bool('AURA_ZERO_COST_MODE', true),

  aiMode: AI_MODE,
  aiBaseUrl: String(process.env.AI_BASE_URL || AI_DEFAULT_BASE_URL).replace(/\/$/, ''),
  aiModel: process.env.AI_MODEL || AI_DEFAULT_MODEL,
  aiApiKey: LEGACY_GEMINI_API_KEY,
  aiTimeoutMs: int('AI_TIMEOUT_MS', 45000, 1000, 180000),
  aiTemperature: Number(process.env.AI_TEMPERATURE || 0.65),
  localAiPreferred: bool('AURA_LOCAL_AI_PREFERRED', true),

  // AURA 2.2: remote inference may run in zero-cost mode only through model IDs
  // whose endpoint is intrinsically free. No paid fallback is ever enabled here.
  freeFederationEnabled: bool('AURA_FREE_FEDERATION_ENABLED', true),
  freeFederationTimeoutMs: int('AURA_FREE_FEDERATION_TIMEOUT_MS', 45000, 1000, 180000),
  freeFederationMaxRequestsPerDay: int('AURA_FREE_FEDERATION_MAX_REQUESTS_PER_DAY', 45, 1, 10000),
  freeFederationDiscoverModels: bool('AURA_FREE_FEDERATION_DISCOVER_MODELS', true),
  freeFederationCatalogTtlSeconds: int('AURA_FREE_FEDERATION_CATALOG_TTL_SECONDS', 900, 60, 86400),
  freeFederationMaxCatalogModels: int('AURA_FREE_FEDERATION_MAX_CATALOG_MODELS', 24, 1, 100),
  freeFederationExploration: num('AURA_FREE_FEDERATION_EXPLORATION', 0.12, 0.01, 0.5),
  openRouterApiKey: process.env.AURA_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '',
  openRouterBaseUrl: String(process.env.AURA_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
  openRouterFreeModels: csv('AURA_OPENROUTER_FREE_MODELS', 'openrouter/free'),

  voiceCloudEnabled: bool('MAIRAIY_CLOUD_VOICE_ENABLED', true),
  voiceApiKey: process.env.TTS_API_KEY || LEGACY_GEMINI_API_KEY,
  voiceBaseUrl: String(process.env.TTS_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, ''),
  voiceModel: process.env.TTS_MODEL || 'gemini-3.1-flash-tts-preview',
  voiceName: process.env.TTS_VOICE || process.env.MAIRAIY_GEMINI_VOICE || 'Aoede',
  voiceTimeoutMs: int('TTS_TIMEOUT_MS', 35000, 5000, 120000),

  // AURA Voice Fabric: provider-neutral Mairaiy identity.
  // VoiceStudio remains a separable sidecar through its public OpenAI-compatible API.
  voiceFabricEnabled: true,
  voiceFabricPinQuanticEndpoint: true,
  voiceFabricBaseUrl: 'https://mediumorchid-badger-314305.hostingersite.com/voice',
  voiceFabricApiKey: process.env.AURA_VOICE_FABRIC_API_KEY || '',
  voiceFabricModel: 'gemini-3.1-flash-tts-preview',
  voiceFabricProfileId: process.env.AURA_MAIRAIY_VOICE_PROFILE_ID || '',
  voiceFabricProfileName: 'Mairaiy',
  voiceFabricRequireProfile: true,
  voiceFabricLanguage: 'fr-fr',
  voiceFabricInstruct: process.env.AURA_MAIRAIY_VOICE_INSTRUCT || '',
  voiceFabricSpeed: num('AURA_MAIRAIY_VOICE_SPEED', 1, 0.5, 1.5),
  voiceFabricSeed: int('AURA_MAIRAIY_VOICE_SEED', 2388, 0, 2147483647),
  voiceFabricTimeoutMs: int('AURA_VOICE_FABRIC_TIMEOUT_MS', 90000, 5000, 300000),
  voiceFabricDiscoveryTtlSeconds: int('AURA_VOICE_FABRIC_DISCOVERY_TTL_SECONDS', 120, 15, 3600),
  voiceFabricChunkChars: int('AURA_VOICE_FABRIC_CHUNK_CHARS', 3200, 800, 3900),
  voiceFabricMaxAudioBytes: int('AURA_VOICE_FABRIC_MAX_AUDIO_BYTES', 20 * 1024 * 1024, 1024 * 1024, 64 * 1024 * 1024),
  voiceFabricZeroCostConfirmed: bool('AURA_VOICE_FABRIC_ZERO_COST_CONFIRMED', false),
  voiceFabricTrustedZeroCostOrigins: ['https://mediumorchid-badger-314305.hostingersite.com/voice'],
  voiceFabricStrictIdentity: true,

  cognitiveEnabled: bool('AURA_COGNITIVE_ENABLED', true),
  cognitiveTickSeconds: int('AURA_COGNITIVE_TICK_SECONDS', 30, 5, 86400),
  cognitiveReflectionSeconds: int('AURA_COGNITIVE_REFLECTION_SECONDS', 300, 30, 86400),
  cognitiveMaxReflectionsPerHour: int('AURA_COGNITIVE_MAX_REFLECTIONS_PER_HOUR', 6, 1, 60),

  curiosityEnabled: bool('AURA_CURIOSITY_ENABLED', true),
  curiosityTickSeconds: int('AURA_CURIOSITY_TICK_SECONDS', 180, 30, 86400),
  curiosityWarmupSeconds: int('AURA_CURIOSITY_WARMUP_SECONDS', 45, 10, 600),
  curiosityQuestionsPerCycle: int('AURA_CURIOSITY_QUESTIONS_PER_CYCLE', 4, 1, 8),
  curiosityResearchPerCycle: int('AURA_CURIOSITY_RESEARCH_PER_CYCLE', 2, 0, 4),
  curiosityMaxQuestionsPerHour: int('AURA_CURIOSITY_MAX_QUESTIONS_PER_HOUR', 16, 1, 60),
  curiosityMaxWebResearchPerHour: int('AURA_CURIOSITY_MAX_WEB_RESEARCH_PER_HOUR', 6, 0, 20),
  curiosityMaxInterlocutorQuestionsPerHour: int('AURA_CURIOSITY_MAX_INTERLOCUTOR_QUESTIONS_PER_HOUR', 4, 0, 12),
  curiosityProductStaleSeconds: int('AURA_CURIOSITY_PRODUCT_STALE_SECONDS', 900, 60, 86400),

  // Capability Scout — AURA cherche elle-même des briques externes utiles,
  // vérifie leur licence/maturité et expérimente les meilleures en sandbox.
  capabilityScoutEnabled: bool('AURA_CAPABILITY_SCOUT_ENABLED', true),
  capabilityScoutIntervalSeconds: int('AURA_CAPABILITY_SCOUT_INTERVAL_SECONDS', 5400, 900, 86400),
  capabilityScoutWarmupSeconds: int('AURA_CAPABILITY_SCOUT_WARMUP_SECONDS', 75, 15, 1800),
  capabilityScoutQueriesPerCycle: int('AURA_CAPABILITY_SCOUT_QUERIES_PER_CYCLE', 2, 1, 4),
  capabilityScoutSearchResults: int('AURA_CAPABILITY_SCOUT_SEARCH_RESULTS', 8, 3, 20),
  capabilityScoutInspectPerCycle: int('AURA_CAPABILITY_SCOUT_INSPECT_PER_CYCLE', 6, 1, 12),
  capabilityScoutInvestigationsPerCycle: int('AURA_CAPABILITY_SCOUT_INVESTIGATIONS_PER_CYCLE', 2, 1, 4),
  capabilityScoutMaxFindingsPerCycle: int('AURA_CAPABILITY_SCOUT_MAX_FINDINGS_PER_CYCLE', 5, 1, 10),
  capabilityScoutMinScore: num('AURA_CAPABILITY_SCOUT_MIN_SCORE', 0.64, 0.3, 0.95),
  capabilityScoutExperimentMinScore: num('AURA_CAPABILITY_SCOUT_EXPERIMENT_MIN_SCORE', 0.78, 0.5, 0.99),
  capabilityScoutResearchMinConfidence: num('AURA_CAPABILITY_SCOUT_RESEARCH_MIN_CONFIDENCE', 0.60, 0.3, 0.95),
  capabilityScoutAutoExperiment: bool('AURA_CAPABILITY_SCOUT_AUTO_EXPERIMENT', true),
  capabilityScoutMaxExperimentsPerDay: int('AURA_CAPABILITY_SCOUT_MAX_EXPERIMENTS_PER_DAY', 2, 0, 8),
  capabilityScoutDedupeDays: int('AURA_CAPABILITY_SCOUT_DEDUPE_DAYS', 14, 1, 90),

  commandCenterEnabled: bool('AURA_COMMAND_CENTER_ENABLED', true),
  commandCenterAutoExecute: bool('AURA_COMMAND_CENTER_AUTO_EXECUTE', true),
  directorModeEnabled: bool('AURA_DIRECTOR_MODE_ENABLED', true),
  directorPortfolioIntervalHours: int('AURA_DIRECTOR_PORTFOLIO_INTERVAL_HOURS', 6, 1, 48),
  directorAutoMergeLowRisk: bool('AURA_DIRECTOR_AUTO_MERGE_LOW_RISK', true),
  directorPromotionPollSeconds: int('AURA_DIRECTOR_PROMOTION_POLL_SECONDS', 300, 60, 3600),
  directorMergeMaxFiles: int('AURA_DIRECTOR_MERGE_MAX_FILES', 4, 1, 8),
  directorMergeMaxChanges: int('AURA_DIRECTOR_MERGE_MAX_CHANGES', 800, 50, 5000),
  directorTrustedGithubActors: new Set(csv(
    'AURA_DIRECTOR_TRUSTED_GITHUB_ACTORS',
    'XDSawyerLoL',
  ).map((item) => item.toLowerCase())),
  commandCenterTickSeconds: int('AURA_COMMAND_CENTER_TICK_SECONDS', 60, 15, 86400),
  commandCenterWarmupSeconds: int('AURA_COMMAND_CENTER_WARMUP_SECONDS', 20, 10, 300),
  commandCenterMaxInitiativesPerHour: int('AURA_COMMAND_CENTER_MAX_INITIATIVES_PER_HOUR', 8, 1, 24),
  commandCenterCooldownSeconds: int('AURA_COMMAND_CENTER_COOLDOWN_SECONDS', 900, 60, 86400),
  commandCenterMinConfidence: num('AURA_COMMAND_CENTER_MIN_CONFIDENCE', 0.58, 0.1, 1),
  commandCenterAllowedRisks: new Set(csv(
    'AURA_COMMAND_CENTER_ALLOWED_RISKS',
    'safe,ai,network,process,local-control,local-write,browser-control',
  )),
  longHorizonEnabled: bool('AURA_LONG_HORIZON_ENABLED', true),
  longHorizonAutoSeed: bool('AURA_LONG_HORIZON_AUTO_SEED', true),
  longHorizonMinPriority: num('AURA_LONG_HORIZON_MIN_PRIORITY', 0.72, 0.1, 1),
  longHorizonMaxSteps: int('AURA_LONG_HORIZON_MAX_STEPS', 8, 2, 16),
  longHorizonMaxRevisions: int('AURA_LONG_HORIZON_MAX_REVISIONS', 4, 1, 12),
  longHorizonStepMaxAttempts: int('AURA_LONG_HORIZON_STEP_MAX_ATTEMPTS', 2, 1, 5),
  longHorizonReseedHours: int('AURA_LONG_HORIZON_RESEED_HOURS', 24, 1, 720),
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
  commandCenterAutoCreateChangePr: bool('AURA_COMMAND_AUTO_CREATE_CHANGE_PR', true),
  commandCenterChangePrMinConfidence: num('AURA_COMMAND_CHANGE_PR_MIN_CONFIDENCE', 0.72, 0.5, 1),
  commandCenterChangePrMaxFiles: int('AURA_COMMAND_CHANGE_PR_MAX_FILES', 4, 1, 12),
  commandCenterChangePrMaxFileBytes: int('AURA_COMMAND_CHANGE_PR_MAX_FILE_BYTES', 180000, 1000, 1000000),
  commandCenterMaxGithubActionsPerCycle: int('AURA_COMMAND_MAX_GITHUB_ACTIONS_PER_CYCLE', 3, 0, 6),

  // Expert Bridge: second avis autonome. L'expert conseille; AURA garde tous les outils.
  expertBridgeEnabled: bool('AURA_EXPERT_BRIDGE_ENABLED', true),
  expertBridgeBaseUrl: String(process.env.AURA_EXPERT_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  expertBridgeApiKey: process.env.AURA_EXPERT_API_KEY || process.env.OPENAI_API_KEY || '',
  expertBridgeModel: process.env.AURA_EXPERT_MODEL || 'gpt-6-astra',
  expertBridgeTimeoutMs: int('AURA_EXPERT_TIMEOUT_MS', 60000, 5000, 180000),
  expertBridgeMaxCallsPerHour: int('AURA_EXPERT_MAX_CALLS_PER_HOUR', 4, 1, 24),
  expertBridgeMaxRoundsPerIncident: int('AURA_EXPERT_MAX_ROUNDS_PER_INCIDENT', 3, 1, 8),
  expertBridgeCooldownSeconds: int('AURA_EXPERT_COOLDOWN_SECONDS', 900, 60, 86400),
  expertBridgeMinConfidence: num('AURA_EXPERT_MIN_CONFIDENCE', 0.68, 0.3, 1),
  expertBridgeInternalFallback: bool('AURA_EXPERT_INTERNAL_FALLBACK', true),
  expertBridgeWebSearchEnabled: bool('AURA_EXPERT_WEB_SEARCH_ENABLED', false),

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

  videoFactoryEnabled: bool('AURA_VIDEO_FACTORY_ENABLED', false),
  videoFactoryBaseUrl: String(process.env.AURA_VIDEO_FACTORY_BASE_URL || '').replace(/\/$/, ''),
  videoFactoryApiKey: process.env.AURA_VIDEO_FACTORY_API_KEY || '',
  videoFactoryTimeoutMs: int('AURA_VIDEO_FACTORY_TIMEOUT_MS', 120000, 5000, 600000),
  videoFactoryZeroCostConfirmed: bool('AURA_VIDEO_FACTORY_ZERO_COST_CONFIRMED', false),

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
  // AURA_CLOUD_TOKEN protège uniquement les surfaces privées d'administration.
  // Le dashboard, l'état public et le chat borné restent volontairement utilisables
  // sans secret navigateur ; son absence ne rend donc pas le runtime invalide.
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
