# AURA Cloud — Node.js / Hostinger

Backend cloud autonome pour AURA, conçu pour les applications web Node.js Hostinger.

## Stack

- Node.js 22+
- Fastify 5
- MySQL via `mysql2`
- aucune dépendance Python côté serveur
- AURA Runtime local reste Python/Rust; il est actuellement hébergé par le package Quantic Studio pour compatibilité, mais constitue une couche AURA indépendante

## Fonctions

- Soul persistant MySQL
- intentions, leçons, réflexions, routines
- agents planner/research/dev/security/operator/critic
- swarm multi-agents
- `/api/chat`
- couche de langage remplaçable ; en mode zéro coût, AURA Runtime/local Mesh et la fédération distante explicitement gratuite sont exécutables
- diagnostic IA sûr via `GET /api/ai/runtime`
- pont HORIZON avec préservation stricte du statut épistémique
- ingestion des événements et résultats Quantic Studio
- apprentissage des échecs répétés
- propositions d’amélioration
- AURA Evolution phase 1 : recherche GitHub/npm + diagnostic, sans auto-submit ni auto-merge
- canary avec secret séparé

## Autorité

AURA Cloud est le **control plane**: continuité, mémoire, direction, orchestration et décisions.

AURA Runtime est l'**execution plane** local: modèles, outils machine, opérateur, voix/image et capacités matérielles. Le Runtime n'expose pas de shell arbitraire au Cloud et reste borné par des capacités typées.

Quantic Studio n'est pas l'autorité d'exécution d'AURA. C'est le produit de streaming vivant de Quantic Sillage. AURA Runtime est désormais une couche autonome. Quantic Studio peut l’utiliser comme produit client, mais n’est plus requis comme autorité ni comme hôte canonique du Runtime.

## Déploiement Hostinger

1. Créer une application web **Node.js** et sélectionner Node 22.
2. Créer une base MySQL dans hPanel.
3. Uploader le contenu de ce dossier comme racine de l’application.
4. Définir les variables nécessaires de `.env.example` dans Hostinger. `AURA_CLOUD_TOKEN` n'est pas requis pour le dashboard ni le chat public borné.
5. Commande d’installation : `npm install --omit=dev`
6. Commande de démarrage : `npm start`
7. Vérifier `GET /healthz`.

Pour la version de production **zéro coût**, conserver :

```env
AURA_ZERO_COST_MODE=true
AI_MODE=off
MAIRAIY_CLOUD_VOICE_ENABLED=false
```

Avec ce verrou, les appels IA/TTS/expert externes potentiellement facturables sont bloqués dans le runtime, même si une ancienne clé reste présente dans l’environnement. Les capacités de langage peuvent venir d’AURA Runtime, du Compute Mesh ou d’AURA Free Federation. Cette dernière n'accepte par défaut que `openrouter/free` ou des identifiants OpenRouter terminant par `:free`; tout identifiant potentiellement payant est rejeté avant l'appel. Si l'API renvoie un coût non nul, le fournisseur est immédiatement mis en quarantaine. Si aucune capacité gratuite n’est disponible, AURA continue avec son noyau natif au lieu de basculer vers un service payant.

Hostinger fournit `PORT`; le point d'entrée AURA l'utilise automatiquement. Le ZIP de production doit contenir `package.json` et `server.js` directement à sa racine. Le dossier canonique à empaqueter est `cloud-node/`, jamais l'ancien paquet Python `deploy/hostinger/`.

## Endpoints principaux

Publics :
- `GET /`
- `GET /healthz`
- `GET /api/ai/runtime` (diagnostic sans secret)
- `GET /api/kernel/status`
- `GET /api/kernel/public` (vue publique expurgée)
- `POST /api/chat` (accès direct, session navigateur signée et rate-limitée ; aucun token saisi par l'utilisateur)
- `GET /api/horizon/status` (vue publique réduite)

Privés, uniquement si un `AURA_CLOUD_TOKEN` serveur est configuré, avec `Authorization: Bearer <AURA_CLOUD_TOKEN>` :
- `POST /api/kernel/tick`
- `GET /api/kernel/reflections`
- `GET/POST /api/kernel/intentions`
- `GET/POST /api/kernel/routines`
- `GET /api/kernel/lessons`
- `GET /api/kernel/improvements`
- `POST /api/kernel/agents/run`
- `POST /api/kernel/agents/swarm`
- `POST /api/kernel/operator` (plan-only)
- `POST /api/cloud/events`
- `POST /api/cloud/outcomes`
- `POST /api/horizon/sync`
- `POST /api/horizon/context/facts`
- `POST /api/horizon/context/intents`
- `GET/POST /api/evolution/*`

Canary :
- `POST /api/evolution/canary/:cycleId` utilise `AURA_EVOLUTION_CANARY_TOKEN`, jamais le token cloud.

## Liaison produits / AURA Runtime -> AURA Cloud

Tout produit Quantic peut publier des événements structurés vers AURA. Quantic Studio est seulement un exemple de produit :

```json
POST /api/cloud/events
{
  "type": "stream.online",
  "source": "quantic-studio",
  "payload": {"title": "Live démarré"}
}
```

Et un résultat d’automatisation :

```json
POST /api/cloud/outcomes
{
  "automation_id": "scene-switch",
  "event_type": "stream.online",
  "ok": false,
  "signature": "obs:timeout",
  "error": "timeout"
}
```

À partir de trois échecs identiques, AURA Cloud crée une leçon persistante et une proposition d’amélioration.

Le worker local utilisé pour les tâches machine doit être considéré comme **AURA Runtime worker** même lorsqu'il est lancé depuis le package Quantic Studio.

## Sécurité

- aucun secret dans le dépôt ou le ZIP ;
- mutation HORIZON protégée par le token cloud ;
- token canary indépendant ;
- hypothèses HORIZON bloquées si elles perdent `unconfirmed_emerging_event` / `notify_or_verify_only` ;
- recherche Evolution limitée aux domaines HTTPS allowlistés ;
- contenu web traité comme données non fiables ;
- aucun auto-submit/auto-merge en phase 1.


## AURA 2.2 — Zero-Cost Cloud Federation

Le PC n'est pas une dépendance. AURA Cloud peut utiliser une capacité de langage distante lorsque le fournisseur et le modèle sont intrinsèquement gratuits.

Configuration minimale :

```env
AURA_ZERO_COST_MODE=true
AI_MODE=off
AURA_FREE_FEDERATION_ENABLED=true
AURA_OPENROUTER_API_KEY=...
AURA_OPENROUTER_FREE_MODELS=openrouter/free
```

Le catalogue OpenRouter `/api/v1/models` est relu périodiquement. AURA ne cible directement qu'un modèle `:free` dont les prix courants `prompt` et `completion` valent exactement zéro ; sinon elle retombe sur `openrouter/free`. Le ledger MySQL `aura_free_provider_usage` conserve le budget quotidien et `aura_free_model_scorecards` mémorise les succès, échecs et latences par modèle/rôle. Les clés ne sont jamais stockées dans ces tables.


## AURA 3.0 — français intégré automatiquement au même hébergement Node.js

**Mode par défaut : aucune intervention de l'utilisateur, aucune clé OpenRouter, aucun autre serveur.**
Au démarrage du serveur Node.js, `EmbeddedLanguage` tente, en tâche de fond, d'installer une version vérifiée de `llama.cpp` (b11425) et de télécharger les poids publics `Qwen/Qwen3-0.6B-GGUF:Q8_0` sur le disque de l'application. Un processus d'inférence enfant, lié **uniquement à localhost:18080**, sert alors la génération en français ; AURA Cloud conserve la cognition, la mémoire et les décisions. Ces téléchargements nécessitent Internet une seule fois si le cache de l'hébergeur est persistant.

Le ZIP de déploiement est compact : les poids et le binaire, lourds, sont obtenus automatiquement au premier lancement. Aucune facturation de requêtes de modèle distant, aucune dépendance à OpenRouter. Les ressources RAM, CPU, stockage et éventuel coût du plan d'hébergement restent nécessaires. **Le mode automatique ne crée pas de RAM** et **Hostinger Web Apps peut refuser l'exécution d'un binaire natif** : dans ce cas l'état `unavailable` et la cause réelle apparaissent dans `GET /api/ai/runtime` -> `self_hosted_language.embedded`. Cette installation **n'est pas une preuve de bon fonctionnement sur le compte Hostinger avant test en direct**.

Le mode est activé automatiquement sur l'hébergement (hors tests CI), et la fédération distante est désactivée par défaut. Si les variables anciennes de Hostinger forcent `AURA_SELF_HOSTED_BASE_URL` ou `AURA_FREE_FEDERATION_ENABLED=true`, leurs valeurs explicites priment ; désactiver la fédération dans Hostinger pour garantir l'indépendance totale.

Les options ci-dessous sont facultatives et uniquement nécessaires pour désactiver cette fonctionnalité ou privilégier un moteur déjà installé :

```env
AURA_EMBEDDED_LANGUAGE_ENABLED=true
AURA_SELF_HOSTED_LANGUAGE_ENABLED=true
AURA_SELF_HOSTED_MODEL=aura-fr
AURA_FREE_FEDERATION_ENABLED=false
AURA_ZERO_COST_MODE=true
AI_MODE=off
```

`GET /api/ai/runtime` affiche `self_hosted_language.embedded.stage` : `pending`, `downloading-engine`, `installing-engine`, `loading-model`, `ready` ou `unavailable`, avec diagnostic d'échec sans clés en clair. `self_hosted_language.ready` n'est vrai qu'après génération linguistique réussie. Il faut une base MySQL opérationnelle pour la persistance et le chat AURA, indépendamment du modèle. Le benchmark de neuf tâches reste volontairement manuel et ne mesure ni l'entraînement des poids ni la conscience.

**Mode de compatibilité avancé (sans démarrage automatique) :** si un modèle GGUF tourne déjà sur un serveur contrôlé, définir `AURA_EMBEDDED_LANGUAGE_ENABLED=false`, `AURA_SELF_HOSTED_BASE_URL=http://127.0.0.1:8080/v1` pour une instance colocale, ou une URL privée HTTPS authentifiée avec `AURA_SELF_HOSTED_CONFIRMED=true` et `AURA_SELF_HOSTED_API_KEY` pour un hôte différent. Aucun fournisseur payant n'est autorisé comme substitut.

