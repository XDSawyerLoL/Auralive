# Aura Live 1.2 — Complete Local Suite

Aura Live est le bot Twitch unique de la chaîne **SANSAHD**. Le compte qui écrit dans le chat est **mairaiy** ; le personnage reste Aura/Mairaiy selon l’identité définie dans `config/aura_identity.json`.

Cette version ajoute une conversation réellement suivie et une présence visuelle/vocale dans OBS au centre de contrôle modulaire : Twitch, IA locale, OBS, économie communautaire, musique, jeux, modération, automatisations et intégrations externes.

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

### Alertes, médias et OBS

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

La source `http://localhost:8787/overlay/avatar` affiche le personnage fourni avec la version : pose au repos en silence, pose bouche ouverte pendant la voix, sous-titres et halo animé. Dans OBS, ajoute une source navigateur en 700 × 1050 et active **Contrôler l’audio via OBS** afin que la synthèse vocale soit envoyée au mixage du live. Les réglages se trouvent dans **Avatar & voix**.

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

## Installation Windows

### Mise à niveau

1. Ferme Aura avec `Ctrl+C`.
2. Sauvegarde :

```text
.env
data\aura_live.db
```

3. Décompresse Aura Live 1.2 par-dessus le dossier existant.
4. Conserve ton `.env` et ton dossier `data`.
5. Lance :

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\reparer-installation.ps1
.\aura.bat
```

6. Ouvre `http://localhost:8787` et recharge avec `Ctrl+F5`.

Les migrations SQLite ajoutent les nouvelles tables sans supprimer les viewers, commandes, Écumes ou réglages existants.

### Configuration minimale `.env`

```env
TWITCH_BOT_LOGIN=mairaiy
TWITCH_BROADCASTER_LOGIN=sansahd
AI_MODE=ollama
AI_BASE_URL=http://localhost:11434
AI_MODEL=gemma3:12b
AI_WARMUP_ENABLED=true
OBS_ENABLED=true
OBS_HOST=127.0.0.1
OBS_PORT=4455
OBS_PASSWORD=TON_MOT_DE_PASSE
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
