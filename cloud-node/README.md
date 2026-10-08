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


## AURA 3.0 — moteur de français indépendant (aucun quota d'API externe)

**Le ZIP Node.js de Hostinger n'embarque pas les poids d'un modèle : ce sont deux processus différents.** AURA Cloud conserve ses données, intentions, mémoire et planification. Le modèle GGUF est un moteur local de **verbalisation** raccordé à AURA ; il n'entraîne pas seul une nouvelle langue. Une barre d'évaluation ne mesure pas l'apprentissage des poids.

**Hébergement nécessaire :** un serveur ou une machine sous ton contrôle sur lequel tu peux installer et lancer `llama.cpp` avec assez de RAM et de CPU. Le système Hostinger Web Apps géré accepte le ZIP Node, mais ne garantit **ni** les processus natifs persistants **ni** la mémoire du modèle. Sur un VPS Linux avec accès aux processus système, tu peux exploiter un CPU et un modèle léger. Si tu n'as que le plan Node.js Web Apps, il faut vérifier l'existence d'une machine déjà disponible ; l'import du seul ZIP ne crée pas ce calcul.

**Démarrage CPU sur le même serveur que AURA Cloud :**

1. Installer le binaire `llama-server` du projet libre [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp), sous le compte système dédié à AURA.
2. Lancer sur le serveur propriétaire : `llama-server --host 127.0.0.1 --port 8080 --alias aura-fr --threads 2 -c 2048 --jinja -hf Qwen/Qwen3-0.6B-GGUF:Q8_0`. Au premier lancement, llama.cpp télécharge librement les poids GGUF (Apache 2.0, environ 639 Mo). La génération suivante fonctionne localement, sans API distante. Ne jamais exposer directement le port 8080 sur Internet.
3. Vérifier `curl http://127.0.0.1:8080/v1/models` puis une requête de conversation : `curl -s http://127.0.0.1:8080/v1/chat/completions -H 'Content-Type: application/json' -d '{"model":"aura-fr","messages":[{"role":"user","content":"Réponds en français. Salut."}],"max_tokens":80}'`.
4. Définir dans les variables Hostinger AURA Cloud :

```env
AURA_ZERO_COST_MODE=true
AI_MODE=off
AURA_FRENCH_LANGUAGE_REQUIRED=true
AURA_SELF_HOSTED_LANGUAGE_ENABLED=true
AURA_SELF_HOSTED_BASE_URL=http://127.0.0.1:8080/v1
AURA_SELF_HOSTED_MODEL=aura-fr
AURA_FREE_FEDERATION_ENABLED=false
```

5. Redémarrer AURA Cloud. Vérifier `GET /api/ai/runtime` : `self_hosted_language.enabled` doit valoir `true`, puis `self_hosted_language.ready` passe à `true` **après une réponse réussie**. Si `ready=false`, AURA signale l'erreur et ne fabrique pas de conversation.

**Attention réseau :** si AURA Cloud est dans Hostinger Web Apps et le modèle sur un *autre* VPS, `localhost` désigne Hostinger Web Apps et non le VPS. Il faut publier le moteur sous un domaine **HTTPS privé** avec pare-feu, authentification et un proxy TLS administré par toi. Configurer `AURA_SELF_HOSTED_BASE_URL=https://ton-domaine-prive.example/v1`, `AURA_SELF_HOSTED_CONFIRMED=true` et si nécessaire `AURA_SELF_HOSTED_API_KEY` côté AURA Cloud. Ne jamais rendre `llama-server` ouvert directement à Internet, ne jamais versionner de clé. Si aucun endpoint auto-hébergé n'existe, AURA ne peut pas parler naturellement : il n'y a pas de repli automatique payant ou scripté.

La fédération OpenRouter est désormais **désactivée par défaut** dans les nouvelles configurations (`AURA_FREE_FEDERATION_ENABLED=false`). Une ancienne variable `true` déjà définie dans Hostinger garde priorité sur le fichier exemple et doit être changée si tu veux une indépendance totale. L'indépendance vis-à-vis d'OpenRouter ne supprime pas le coût éventuel de la machine, de l'électricité ni de l'hébergement.
