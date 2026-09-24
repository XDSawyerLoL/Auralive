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

export const config = Object.freeze({
  host: process.env.AURA_HOST || '0.0.0.0',
  // Hostinger Node.js Web Apps proxy vers le port 3000. On ignore PORT pour éviter
  // qu'une variable injectée par l'environnement détourne le listener.
  port: int('AURA_PORT', 3000, 1, 65535),
  publicBaseUrl: String(process.env.AURA_PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  logLevel: process.env.LOG_LEVEL || 'info',

  cloudToken: process.env.AURA_CLOUD_TOKEN || '',
  canaryToken: process.env.AURA_EVOLUTION_CANARY_TOKEN || '',

  dbUrl: process.env.DATABASE_URL || '',
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: int('DB_PORT', 3306, 1, 65535),
  dbUser: process.env.DB_USER || '',
  dbPassword: process.env.DB_PASSWORD || '',
  dbName: process.env.DB_NAME || '',
  dbConnectionLimit: int('DB_CONNECTION_LIMIT', 10, 1, 30),

  aiMode: String(process.env.AI_MODE || 'off').toLowerCase(),
  aiBaseUrl: String(process.env.AI_BASE_URL || 'http://localhost:11434').replace(/\/$/, ''),
  aiModel: process.env.AI_MODEL || 'gemma3:12b',
  aiApiKey: process.env.AI_API_KEY || '',
  aiTimeoutMs: int('AI_TIMEOUT_MS', 45000, 1000, 180000),
  aiTemperature: Number(process.env.AI_TEMPERATURE || 0.65),

  cognitiveEnabled: bool('AURA_COGNITIVE_ENABLED', true),
  cognitiveTickSeconds: int('AURA_COGNITIVE_TICK_SECONDS', 30, 5, 86400),
  cognitiveReflectionSeconds: int('AURA_COGNITIVE_REFLECTION_SECONDS', 300, 30, 86400),
  cognitiveMaxReflectionsPerHour: int('AURA_COGNITIVE_MAX_REFLECTIONS_PER_HOUR', 6, 1, 60),

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
  evolutionCanaryMinObservations: int('AURA_EVOLUTION_CANARY_MIN_OBSERVATIONS', 3, 1, 1000),
  evolutionAutoSubmit: false,
  evolutionAutoMerge: false,

  cloudOperatorMode: 'plan-only',
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
  if (process.env.NODE_ENV === 'production' && config.evolutionCanaryRequired && !config.canaryToken) {
    issues.push({
      code: 'canary_token_missing',
      message: 'AURA_EVOLUTION_CANARY_TOKEN est absent. Le canary indépendant reste verrouillé.',
    });
  }
  return issues;
}

export function databaseConfigured() {
  return Boolean(config.dbUrl || (config.dbUser && config.dbName));
}
