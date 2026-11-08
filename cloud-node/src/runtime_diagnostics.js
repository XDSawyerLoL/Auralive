// Public failure taxonomy. This deliberately never includes raw exception
// messages, host names, account names, SQL, paths, passwords or connection URLs.
const KNOWN_STAGES = new Set([
  'not-started','starting','configuration','database','fabric',
  'kernel','ready','database-failed','kernel-failed',
]);
const stamp = value => {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

export function classifyRuntimeFailure(error) {
  const msg = String(error?.message || error || '');
  if (/ER_ACCESS_DENIED_ERROR|access denied for user|SQLSTATE\s*28000/i.test(msg))
    return 'database-authentication';
  if (/ER_BAD_DB_ERROR|unknown database/i.test(msg))
    return 'database-missing';
  if (/ECONNREFUSED|PROTOCOL_CONNECTION_LOST|ECONNRESET/i.test(msg))
    return 'database-connection';
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg))
    return 'database-dns';
  if (/ETIMEDOUT|connect timeout|timeout exceeded/i.test(msg))
    return 'database-timeout';
  if (/ER_NO_SUCH_TABLE|ER_BAD_FIELD_ERROR|ER_PARSE_ERROR|ER_DUP_FIELDNAME|ER_TABLE_EXISTS_ERROR/i.test(msg))
    return 'database-schema';
  if (/ENOMEM|heap out of memory|ERR_OUT_OF_MEMORY/i.test(msg))
    return 'memory-exhausted';
  return 'unclassified-startup-failure';
}

const DIAGNOSES = Object.freeze({
  'ready': ['Noyau opérationnel', 'Les états du noyau peuvent être consultés.'],
  'starting': ['Démarrage en cours', 'Initialisation de MySQL et du noyau persistant. Actualisation automatique.'],
  'gateway-only': ['Mode passerelle uniquement', 'Désactiver AURA_GATEWAY_ONLY dans la configuration Hostinger, puis redémarrer le processus Node.'],
  'database-unconfigured': ['Configuration MySQL absente', 'Configurer DATABASE_URL ou les variables DB_HOST, DB_USER, DB_PASSWORD et DB_NAME sur Hostinger.'],
  'database-authentication': ['Connexion MySQL refusée', 'Vérifier les identifiants MySQL du service Node dans Hostinger, sans les saisir dans cette page.'],
  'database-missing': ['Base MySQL introuvable', 'Vérifier que DB_NAME correspond à une base existante et autorisée sur Hostinger.'],
  'database-connection': ['Connexion MySQL interrompue', 'Vérifier que le serveur MySQL est accessible depuis le service Node et que son adresse est correcte.'],
  'database-dns': ['Hôte MySQL introuvable', 'Vérifier la valeur de DB_HOST ou DATABASE_URL dans les paramètres Hostinger.'],
  'database-timeout': ['Connexion MySQL trop lente', 'Vérifier la disponibilité MySQL et les limitations réseau de l’hébergement.'],
  'database-schema': ['Schéma MySQL incompatible', 'Consulter les migrations et les droits SQL ; ne pas effacer la base de données.'],
  'memory-exhausted': ['Mémoire serveur insuffisante', 'Vérifier la limite mémoire Node et désactiver le préchauffage du modèle local si nécessaire.'],
  'kernel-failed': ['Échec de démarrage du noyau', 'Consulter le journal serveur AURA pour identifier le module en échec.'],
  'database-failed': ['Échec de connexion ou migration MySQL', 'Contrôler les identifiants, la disponibilité de MySQL et les migrations sur Hostinger.'],
  'not-started': ['Noyau non lancé', 'Vérifier le point d’entrée server.js et le mode AURA_GATEWAY_ONLY dans Hostinger.'],
  'unclassified-startup-failure': ['Démarrage impossible', 'Consulter les journaux Node.js dans Hostinger : les détails techniques restent privés.'],
});

/** Strict public subset of bootstrap state; safe for an anonymous /cerveau. */
export function publicRuntimeDiagnostic(bootstrap = {}, { gatewayOnly = false } = {}) {
  const ready = bootstrap.runtimeReady === true;
  const configured = bootstrap.dbConfigured === true;
  const hasAttempt = Boolean(stamp(bootstrap.lastAttemptAt));
  const failure = String(bootstrap.failureCode || '');
  const stage = KNOWN_STAGES.has(bootstrap.phase) ? bootstrap.phase : 'not-started';
  const code = ready ? 'ready'
    : gatewayOnly ? 'gateway-only'
    : !configured ? 'database-unconfigured'
    : bootstrap.starting ? 'starting'
    : failure && Object.hasOwn(DIAGNOSES, failure) ? failure
    : stage === 'database' ? 'starting'
    : stage === 'database-failed' ? 'database-failed'
    : stage === 'kernel-failed' ? 'kernel-failed'
    : stage === 'kernel' || stage === 'fabric' ? 'starting'
    : !hasAttempt ? 'not-started'
    : 'unclassified-startup-failure';
  const [title, action] = DIAGNOSES[code] || DIAGNOSES['unclassified-startup-failure'];
  return {
    ready,
    code,
    stage: ready ? 'ready' : stage,
    title,
    action,
    db_ready: bootstrap.dbReady === true,
    db_configured: configured,
    restart_requires_owner: true,
    auto_retry_enabled: !ready && !gatewayOnly && configured,
    last_attempt_at: stamp(bootstrap.lastAttemptAt),
    last_ready_at: stamp(bootstrap.lastReadyAt),
    evidence: 'Runtime status and categorical error classification; no raw server secrets.',
  };
}
