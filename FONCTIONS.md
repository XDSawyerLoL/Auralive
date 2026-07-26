# Inventaire fonctionnel Aura Live 1.2

## Cœur Twitch et IA

- [x] Compte bot séparé `mairaiy`
- [x] Compte diffuseur `sansahd`
- [x] EventSub séparé pour le chat et les événements de chaîne
- [x] Réponse IA finale uniquement, avec blocage technique de tout message « je réfléchis »
- [x] Réponse normale avec mention, sans fil de réponse Twitch par défaut
- [x] Préchargement silencieux du modèle Ollama
- [x] Mémoire communautaire désactivable par viewer
- [x] Historique conversationnel persistant et isolé par interlocuteur
- [x] Filtrage des annonces et bots tiers dans le contexte IA
- [x] Interventions spontanées configurables
- [x] Conversation privée dans le tableau de bord

## Gestion du chat

- [x] Commandes simples
- [x] Commandes Pro : alias, regex, permissions, coûts, cooldowns et actions multiples
- [x] FAQ dynamique
- [x] Annonces périodiques et planificateur
- [x] Modération : spam, liens, majuscules, répétitions et mots interdits
- [x] Autorisation temporaire de liens
- [x] Restrictions par viewer
- [x] Mode silence et mode urgence
- [x] Follow Guard et journal de sécurité

## Fidélité et communauté

- [x] Écumes, XP, niveaux et classement
- [x] Boutique et historique des transactions
- [x] Profils viewers
- [x] Inventaire, loot, craft et enchères
- [x] File pour jouer avec les viewers
- [x] Concours et loterie des abonnés
- [x] Suivi followers/unfollowers et abonnés/désabonnements
- [x] Page communautaire locale

## Interactivité et jeux

- [x] Sondages Twitch natifs
- [x] Prédictions Twitch natives
- [x] Paris en Écumes
- [x] Roulette
- [x] Pêche et duels
- [x] Run, Drop, Décryptage et Bombe
- [x] Love/Hate
- [x] Tickets et tirage
- [x] Bingo
- [x] TopWords
- [x] Mur d'émoticônes
- [x] Compteurs, objectifs et Streamathon

## Médias, OBS et diffusion

- [x] Alertes multimédias configurables
- [x] Médiathèque locale
- [x] TTS avec file et modération
- [x] Song Request YouTube
- [x] Clips manuels et règles de clips automatiques
- [x] Pilotage OBS WebSocket
- [x] Générique de fin et récapitulatif du live
- [x] Pings privés au streamer
- [x] Overlays alertes, chat, objectifs, écran, musique, Streamathon, emotes, TopWords, concours, crédits et pings
- [x] Avatar vocal Mairaiy avec pose repos/parole, sous-titres et synthèse vocale OBS

## Statistiques et automatisation

- [x] Journal d'activité
- [x] Analytics événements, commandes et économie
- [x] Récapitulatif IA
- [x] Suggestions de titres Twitch
- [x] Amélioration IA des annonces
- [x] Automatisations programmées
- [x] Webhooks génériques et Discord webhook
- [x] API locale pour StreamDeck/Loupedeck
- [x] Docker

## Configuration ou service externe requis

- [ ] Métadonnées YouTube avancées : `YOUTUBE_API_KEY`
- [ ] Discord : URL de webhook ou jeton d'un bot Discord complet
- [ ] OBS : serveur WebSocket activé
- [ ] IA : Ollama lancé ou API compatible configurée
- [ ] X, Bluesky, LastFM, Steam, IGDB, RCON et Telnet : identifiants propres à chaque service
- [ ] Fonctionnement 24/7 : serveur, VPS ou machine restant allumée

## Limite honnête

Aura Live 1.2 fournit un noyau local très étendu. Une parité absolue avec un service cloud exploité depuis plusieurs années ne peut pas être déclarée sans tests réels en charge, hébergement permanent et identifiants des services externes. Les dépendances externes sont affichées comme telles dans la page « Couverture fonctionnelle » au lieu d'être présentées comme actives.
