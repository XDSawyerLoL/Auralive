# AURA Cloud — Node.js / Hostinger

Backend cloud autonome pour AURA, conçu pour les applications web Node.js Hostinger.

## Stack

- Node.js 22+
- Fastify 5
- MySQL via `mysql2`
- aucune dépendance Python côté serveur
- Quantic Studio local reste Python/Rust

## Fonctions

- Soul persistant MySQL
- intentions, leçons, réflexions, routines
- agents planner/research/dev/security/operator/critic
- swarm multi-agents
- `/api/chat`
- pont HORIZON avec préservation stricte du statut épistémique
- ingestion des événements et résultats Quantic Studio
- apprentissage des échecs répétés
- propositions d’amélioration
- AURA Evolution phase 1 : recherche GitHub/npm + diagnostic, sans auto-submit ni auto-merge
- canary avec secret séparé

## Autorité

Le cloud est volontairement **plan-only** pour les actions. Il ne pilote pas directement le PC. Quantic Studio / Automation Studio reste l’autorité d’exécution.

## Déploiement Hostinger

1. Créer une application web **Node.js** et sélectionner Node 22.
2. Créer une base MySQL dans hPanel.
3. Uploader le contenu de ce dossier comme racine de l’application.
4. Définir les variables de `.env.example` dans Hostinger.
5. Commande d’installation : `npm install --omit=dev`
6. Commande de démarrage : `npm start`
7. Vérifier `GET /healthz`.

Hostinger fournit `PORT`; AURA l’utilise automatiquement.

## Endpoints principaux

Publics :
- `GET /`
- `GET /healthz`
- `GET /api/kernel/status`
- `GET /api/kernel/soul` (vue publique expurgée)
- `POST /api/chat` (contexte privé uniquement avec token)
- `GET /api/horizon/status` (vue publique réduite)

Privés avec `Authorization: Bearer <AURA_CLOUD_TOKEN>` :
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

## Liaison Quantic Studio -> AURA Cloud

Quantic Studio peut publier un événement :

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

## Sécurité

- aucun secret dans le dépôt ou le ZIP ;
- mutation HORIZON protégée par le token cloud ;
- token canary indépendant ;
- hypothèses HORIZON bloquées si elles perdent `unconfirmed_emerging_event` / `notify_or_verify_only` ;
- recherche Evolution limitée aux domaines HTTPS allowlistés ;
- contenu web traité comme données non fiables ;
- aucun auto-submit/auto-merge en phase 1.
