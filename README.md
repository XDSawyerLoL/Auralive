# Quantic Studio 2.7.4 — Native Broadcast Suite

Quantic Studio est le studio de streaming local de la chaîne **SANSAHD**. Le compte qui écrit dans le chat est **mairaiy** ; le personnage reste Aura/Mairaiy selon l’identité définie dans `config/aura_identity.json`.

La version 2.7.4 réunit Twitch, IA locale, diffusion vidéo native, audio, scènes, replay, multistream, économie communautaire, musique, jeux, modération et automatisations dans une seule application Windows. **OBS n’est plus requis** : il reste uniquement disponible comme mode de compatibilité.

## Modules inclus

### Twitch et identité

- Deux connexions EventSub séparées : `mairaiy` pour le chat et `SANSAHD` pour les événements de chaîne.
- Messages, follows, abonnements, cadeaux, bits, raids, récompenses, mise en ligne et hors ligne.
- Sondages, prédictions, clips et récompenses de points Twitch natives.
- Synchronisation, création, activation, désactivation et suppression des récompenses créées par Aura.
- Validation ou annulation des demandes de récompenses.

### Commandes Pro et automatisations

- Commandes simples et commandes avancées.
- Alias, déclencheurs exacts, préfixes, mots contenus et expressions régulières.
- Réponses aléatoires et variables `{user}`, `{login}`, `{points}`, `{level}`, `{arg}`.
- Conditions de rôle, niveau, Écumes et live actif.
- Cooldown global et par utilisateur.
- Chaînes d’actions : chat, overlay, TTS, Écumes, compteur, scène OBS, son, objet, clip et webhook.
- Planificateur périodique avec condition « live uniquement ».

### Song Request

- Demandes YouTube depuis le chat ou le panneau.
- File persistante, doublons bloqués, limite par viewer, coût en Écumes et remboursement.
- Liste noire par vidéo.
- Métadonnées YouTube par oEmbed ; durée et détails complets avec `YOUTUBE_API_KEY` facultative.
- Lecteur OBS dédié : `http://localhost:8787/overlay/song`.

Commandes :

```text
!sr URL
!song
!skip
```

### Économie, casino et méta-jeu

- Écumes, XP, niveaux et classement.
- Paris communautaires avec cagnotte et redistribution proportionnelle.
- Roulette avec limites de mises.
- Loot, raretés, inventaire persistant, recettes et craft.
- Enchères entre viewers avec remboursement automatique des surenchères.
- Boutique, duels et pêche.

Commandes principales :

```text
!pari
!mise 1 100
!roulette 50
!inventaire
!loot
!recettes
!craft 1
!encheres
!bid 1 200
```

### Streamathon

- Minuteur persistant.
- Temps ajouté automatiquement par follow, abonnement, cadeau et tranches de 100 bits.
- Ajustements manuels et journal des ajouts.
- Overlay : `http://localhost:8787/overlay/streamathon`.

### TTS professionnel

- Coût en Écumes et longueur maximale.
- Voix, vitesse, tonalité et volume.
- File de modération facultative.
- Approbation, refus et lecture manuelle depuis le panneau.
- Lecture dans l’overlay principal.

### Alertes, médias et overlays

- Alertes par événement avec texte, couleur, durée, image/GIF/vidéo, son et volume.
- Animations d’entrée et de sortie, disposition et tests en direct.
- Médiathèque locale avec import de médias jusqu’à 25 Mo.
- Overlays :

```text
http://localhost:8787/overlay
http://localhost:8787/overlay/chat
http://localhost:8787/overlay/goal
http://localhost:8787/overlay/screen
http://localhost:8787/overlay/song
http://localhost:8787/overlay/streamathon
http://localhost:8787/overlay/emotes
http://localhost:8787/overlay/topwords
http://localhost:8787/overlay/giveaway
http://localhost:8787/overlay/credits
http://localhost:8787/overlay/ping
http://localhost:8787/overlay/avatar
```


### Avatar vocal Mairaiy

La source `http://localhost:8787/overlay/avatar` affiche le personnage fourni avec la version : pose au repos en silence, pose bouche ouverte pendant la voix, sous-titres et halo animé. Avec Moteur Quantic, ajoute simplement le preset **Mairaiy** dans le Studio : le rendu navigateur est capturé localement et sa voix est injectée directement dans le bus audio Aura. OBS reste disponible uniquement en mode de compatibilité. Les réglages se trouvent dans **Avatar & voix**.

### Modération et sécurité

- Liens, liste blanche, mots interdits, spam, répétitions et majuscules.
- Timeouts, mode urgence et journal des sanctions.
- Follow Guard : détection des pics anormaux de follows, alerte overlay et activation automatique du mode urgence.
- Mémoire communautaire désactivable et effaçable par viewer.

### IA et intégrations

- Conversation privée avec Ollama ou une API compatible OpenAI.
- Réponses dans le chat lorsqu’Aura/Mairaiy est appelée.
- Mémoire courte persistante par interlocuteur pour les questions de suivi.
- Les annonces de bots tiers ne sont plus utilisées comme contexte d’une conversation directe.
- Uniquement la réponse finale : tout message « je réfléchis » est bloqué avant Twitch.
- Réponse normale avec mention du viewer ; les fils de réponse Twitch sont désactivés de force.
- Préchargement silencieux du modèle Ollama au démarrage.
- Interventions spontanées configurables.
- Discord par webhook.
- Webhooks JSON génériques pour relier n8n, Make, Home Assistant, Streamer.bot ou un service interne.
- Analytics des événements, commandes et flux d’Écumes.


### Suite communautaire complète

- FAQ dynamique, permis temporaires de liens et restrictions par viewer.
- Historique synchronisé des followers, unfollowers, abonnés et désabonnements.
- Jeux Run, Drop, Décryptage, Bombe, Love/Hate, tickets, Bingo et TopWords.
- Loterie réservée aux abonnés synchronisés.
- Mur d’émoticônes Twitch.
- Générique de fin, récapitulatif IA, proposition de titres et amélioration d’annonces.
- Clips automatiques selon des règles d’événements.
- Pings privés au streamer et page communautaire locale `http://localhost:8787/channel`.
- Connecteurs testables et API locale pour StreamDeck/Loupedeck.

## Fusion cognitive AURA × HORIZON

AURA peut maintenant consommer nativement le moteur **HORIZON Predictive Intelligence** et lui renvoyer son contexte local. La fusion reste découplée : si HORIZON est indisponible, le moteur local d'AURA, le streaming et les automatisations continuent de fonctionner.

Le pont versionné fournit trois événements Automation Studio :

```text
horizon.world.confirmed
horizon.world.emerging
horizon.personal.forecast
```

AURA conserve strictement le statut épistémique transmis par HORIZON : une hypothèse émergente reste non confirmée, les scores diagnostiques ne sont jamais convertis en probabilités, et une hypothèse ne peut pas autoriser automatiquement une action irréversible.

AURA peut également transmettre à HORIZON des faits de contexte local et des intentions via les nœuds `horizon.context.fact` et `horizon.context.intent`. Le contexte HORIZON récent peut être injecté dans l'IA locale pour que Mairaiy raisonne avec la situation du monde sans confondre faits, hypothèses et prévisions.

Configuration minimale :

```env
HORIZON_ENABLED=true
HORIZON_BASE_URL=https://votre-horizon.example
HORIZON_API_KEY=...
HORIZON_EXTERNAL_ID=aura-local
```

Diagnostic local : `GET /api/horizon/status`. Synchronisation manuelle : `POST /api/horizon/sync`.

## Noyau souverain AURA unifié

Le runtime moderne réunit désormais les lignées historiques **AURA Brain**, **Aura Sovereign**, **AURA Cloud**, **Quantic Studio** et **HORIZON** dans un seul noyau persistant.

Le noyau ajoute :

- **Soul persistant** : identité runtime, phase, cycles, énergie, curiosité, pression, continuité, introspection, ouverture, réactivité et intention courante ;
- **boucle ambient** : AURA observe les événements utiles et ne déclenche une réflexion que lorsqu'un nouveau stimulus ou une routine le justifie ;
- **réflexions auditables** : résumé, hypothèse éventuelle, prochaine action proposée et niveau de confiance, sans journal de raisonnement détaillé ;
- **apprentissage par résultats** : les succès/échecs des automatisations alimentent des leçons persistantes réinjectées dans les décisions suivantes ;
- **laboratoire d'amélioration** : les échecs répétés produisent des propositions d'amélioration et un plan de validation, sans modification silencieuse du code de production ;
- **intentions persistantes** et **routines autonomes** ;
- **agents spécialisés** (planner, research, dev, security, operator, critic) et mode **swarm** avec synthèse ;
- **AURA Cloud API** : `/api/chat`, `/api/kernel/tick`, Soul, réflexions, intentions, routines, leçons et propositions d'amélioration ;
- **perception live** réactivée via `live_awareness` et intégrée au cycle de vie du cohost ;
- contexte combiné **Soul + leçons + HORIZON** injecté dans les réponses IA.

Le noyau est volontairement autonome sans être incontrôlable : une réflexion propose une action, puis Automation Studio reste l'autorité d'exécution avec ses permissions, risques, simulations et rollbacks. Les hypothèses HORIZON conservent leurs garde-fous jusqu'à l'action finale.

Pour un déploiement serveur, protège les commandes privées :

```env
AURA_COGNITIVE_ENABLED=true
AURA_COGNITIVE_TICK_SECONDS=30
AURA_COGNITIVE_REFLECTION_SECONDS=300
AURA_COGNITIVE_MAX_REFLECTIONS_PER_HOUR=6
AURA_CLOUD_TOKEN=<secret-long-et-aleatoire>
```

Endpoints principaux :

```text
GET  /api/kernel/status
GET  /api/kernel/soul
POST /api/kernel/tick
GET  /api/kernel/reflections
GET  /api/kernel/lessons
GET  /api/kernel/intentions
POST /api/kernel/intentions
GET  /api/kernel/routines
POST /api/kernel/routines
GET  /api/kernel/improvements
POST /api/kernel/agents/run
POST /api/kernel/agents/swarm
POST /api/chat
```

## AURA Evolution — phase 1 active

AURA Evolution est maintenant **active par défaut en mode `observe`**. Dans ce mode, AURA peut rechercher des évolutions documentées, relire ses erreurs/leçons, comparer l'état du projet et produire un diagnostic persistant. Elle ne peut pas générer ni appliquer de patch, lancer un candidat, ouvrir une PR ou fusionner du code.

La montée en autonomie est explicite :

```text
observe  -> recherche + diagnostic uniquement
sandbox  -> candidat local + tests isolés, aucune PR
submit   -> PR autorisée après sas local, aucun merge automatique
promote  -> merge possible seulement après sas local + tous les checks CI requis
```

Configuration par défaut :

```env
AURA_EVOLUTION_ENABLED=true
AURA_EVOLUTION_MODE=observe
AURA_EVOLUTION_INTERVAL_SECONDS=21600
AURA_EVOLUTION_AUTO_SUBMIT=false
AURA_EVOLUTION_AUTO_MERGE=false
```

Le statut privé `GET /api/evolution/status` expose le niveau actif et les capacités réellement autorisées. L'API privée `POST /api/evolution/run` permet de lancer un cycle ponctuel ; elle respecte toujours le niveau d'autorité configuré.

## Quantic Studio Core

Quantic Studio utilise désormais **Quantic Studio Core 0.4.1** comme moteur de diffusion Windows par défaut. OBS reste disponible comme mode de compatibilité manuel, mais n’est plus requis pour le fonctionnement normal du Studio.

```env
AURA_BROADCAST_ENGINE=native
AURA_NATIVE_ENGINE_AUTOSTART=true
```

Le moteur Rust `QuanticStudioCore.exe` et un build FFmpeg vérifié sont embarqués directement dans le package Windows. Aura vérifie que FFmpeg fournit **Windows Graphics Capture (`gfxcapture`)** et utilise automatiquement ce backend pour les sources Fenêtre/Jeu, avec repli GDI lorsque nécessaire.

Le moteur est piloté localement depuis Aura. Aucun port de contrôle supplémentaire n’est exposé.

### Compositeur natif 0.4

Le même compositeur FFmpeg alimente l’aperçu, l’enregistrement et le direct :

- écran Windows ;
- fenêtre et jeu via Windows Graphics Capture quand disponible ;
- webcam DirectShow ;
- image locale ;
- texte ;
- navigateur headless ;
- Mairaiy (`/overlay/avatar`) ;
- overlays Aura (`/overlay` et variantes).

Le Studio permet d’ajouter, configurer, masquer, supprimer, déplacer et redimensionner ces sources. Les scènes et la géométrie restent modifiables pendant Live/REC : Aura reconstruit proprement le graphe puis réactive automatiquement les sorties actives.

### Mix audio natif

Aura dispose de trois canaux indépendants :

- **Micro** ;
- **Son PC / jeu** via WASAPI loopback ;
- **Aura / Mairaiy / alertes** via le bus PCM local.

Chaque canal possède son volume et son mute dans le Studio. Le Live et le REC partagent les mêmes tranches audio afin d’éviter toute perte ou double consommation lorsqu’ils sont actifs simultanément.

Les sources navigateur sont rendues localement par Chromium/Edge headless. Mairaiy et les sons d’alertes ne dépendent donc plus du mixeur audio d’OBS.

### Coffre RTMP local

La clé de stream n’est plus persistée en clair dans `engine.json`. Depuis **⚙ Diffusion** dans Aura Studio :

- l’URL RTMP reste dans la configuration non sensible ;
- la clé est protégée localement par Windows DPAPI ;
- le fichier chiffré est `data/native_broadcast/stream-key.dpapi` ;
- la clé n’est jamais réaffichée dans l’interface ni renvoyée par les API de statut ;
- une ancienne clé trouvée en clair est migrée automatiquement vers le coffre puis retirée du JSON ;
- aucun compte Microsoft ou service cloud n’est requis : DPAPI est utilisé localement par le profil Windows.

### API locale de diffusion

```text
GET  /api/broadcast/status
GET  /api/broadcast/output
PUT  /api/broadcast/output
POST /api/broadcast/mode/obs
POST /api/broadcast/mode/native
POST /api/broadcast/engine/start
POST /api/broadcast/engine/stop
POST /api/broadcast/stream/start
POST /api/broadcast/stream/stop
POST /api/broadcast/record/start
POST /api/broadcast/record/stop
POST /api/broadcast/preview/start
POST /api/broadcast/preview/stop
POST /api/broadcast/scene
PUT  /api/broadcast/audio
POST /api/broadcast/source
PATCH /api/broadcast/source/{source_id}
DELETE /api/broadcast/source/{source_id}
```

## Installation Windows

### Installation recommandée

Télécharge **`QuanticStudio-Setup-2.7.4.exe`** depuis la release officielle et lance-le. L'installation est faite dans le profil Windows courant et ne demande pas de droits administrateur.

L'installateur :
- conserve le fichier `.env` existant ;
- conserve le dossier `data` et les données runtime ;
- crée les raccourcis Windows ;
- ferme proprement Quantic Studio lors d'une mise à niveau puis relance l'application.

Les ZIP Full et Lite restent disponibles pour l'usage portable.

### Mises à jour intégrées

Dans **Mon compte & services → Mises à jour**, Quantic Studio peut vérifier la dernière release officielle, télécharger l'installateur correspondant et contrôler son empreinte SHA-256 avant de le lancer.

L'updater n'accepte que les assets `QuanticStudio-Setup-X.Y.Z.exe` publiés sur le dépôt officiel `XDSawyerLoL/Auralive`.

### Signature Windows

Le pipeline CI prend en charge la signature Authenticode de `QuanticStudio.exe`, `QuanticStudioCore.exe` et de l'installateur lorsque les secrets `AURA_WINDOWS_SIGNING_PFX_BASE64` et `AURA_WINDOWS_SIGNING_PFX_PASSWORD` contiennent un certificat de signature de code valide.

Sans certificat configuré, la release reste vérifiable par SHA-256 mais Windows peut afficher un avertissement de réputation.

Les migrations SQLite ajoutent les nouvelles tables sans supprimer les viewers, commandes, Écumes ou réglages existants.

### Configuration minimale `.env`

```env
TWITCH_BOT_LOGIN=mairaiy
TWITCH_BROADCASTER_LOGIN=sansahd
AI_MODE=ollama
AI_BASE_URL=http://localhost:11434
AI_MODEL=gemma3:12b
AI_WARMUP_ENABLED=true
AURA_BROADCAST_ENGINE=native
AURA_NATIVE_ENGINE_AUTOSTART=true

# OBS reste facultatif, uniquement pour le mode de compatibilité.
OBS_ENABLED=false
OBS_HOST=127.0.0.1
OBS_PORT=4455
OBS_PASSWORD=
YOUTUBE_API_KEY=
```

Après une mise à niveau, reconnecte le compte **SANSAHD** dans la page Connexions afin d’accorder les nouveaux scopes Hype Train, shoutouts et synchronisation d’audience.

Le compte `mairaiy` doit être modérateur sur SANSAHD :

```text
/mod mairaiy
```

## Fonctionnement 24/7 avec Docker

Le projet inclut `Dockerfile` et `docker-compose.yml`.

```powershell
docker compose up -d --build
```

Pour une installation distante, remplace les URL `localhost` dans `.env` par ton domaine HTTPS et ajoute exactement la nouvelle URL de callback dans la console développeur Twitch. La partie OBS et l’IA locale peuvent rester sur le PC tandis que les fonctions chat/communauté tournent sur le serveur, mais cette séparation nécessite un tunnel sécurisé ou un déploiement dédié.

## Tests

```powershell
.\scripts\test-all.ps1
```

La suite comporte 32 tests et vérifie notamment les réponses IA finales, Twitch, la modération, les alertes, les objectifs, les commandes Pro, les jeux, les paris, l’inventaire, le Streamathon, les connecteurs et le Follow Guard.

## Limites réelles

- Twitch doit autoriser les fonctions utilisées par le compte de chaîne. Certaines API, notamment les points de chaîne et prédictions, dépendent du statut et des droits de la chaîne.
- YouTube peut empêcher l’autoplay dans certains environnements OBS ou pour certaines vidéos.
- Discord et les webhooks nécessitent leurs URL secrètes.
- Spotify, X, Bluesky, Steam, StreamDeck et les serveurs de jeux n’ont pas une authentification universelle : ils passent actuellement par les webhooks et automatisations génériques, ou demandent des clés propres à chaque service.
- Ne partage jamais `.env` ni le dossier `data`.


Ouvre `http://localhost:8787/api/ai/diagnostic`. Les valeurs attendues sont :

- `ai_enabled: true`
- `reply_enabled: true`
- `bot_active: true`
- `bot_silent: false`
- `chat_eventsub_connected: true`
- `bot_account.login: mairaiy`
- `bot_account.matches_expected: true`

Tests dans le chat : `!mairaiy bonjour`, `@mairaiy bonjour` ou `Aura, bonjour`.
