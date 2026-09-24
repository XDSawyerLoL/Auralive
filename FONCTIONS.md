# Inventaire fonctionnel Quantic Studio 2.7.4

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

## Médias et diffusion

- [x] Alertes multimédias configurables
- [x] Médiathèque locale
- [x] TTS avec file et modération
- [x] Song Request YouTube
- [x] Clips manuels et règles de clips automatiques
- [x] Pilotage OBS WebSocket
- [x] Quantic Studio Core 0.4.1 : moteur Rust local, RTMP, enregistrement et contrôle depuis Aura
- [x] Gestion native des scènes : création, renommage, suppression et sélection
- [x] Transitions de scène Cut / Fondu configurables
- [x] Replay buffer local 10–300 s et sauvegarde de clips MKV
- [x] Multistream natif jusqu’à 3 destinations secondaires avec un seul encodage
- [x] Générique de fin et récapitulatif du live
- [x] Pings privés au streamer
- [x] Overlays alertes, chat, objectifs, écran, musique, Streamathon, emotes, TopWords, concours, crédits et pings
- [x] Avatar vocal Mairaiy avec pose repos/parole, sous-titres et synthèse vocale OBS

## Intelligence monde et boucle cognitive HORIZON

- [x] Pont HORIZON versionné avec déduplication persistante des signaux
- [x] Événements monde confirmés/dérivés vers Automation Studio
- [x] Hypothèses émergentes conservées explicitement comme non confirmées
- [x] Prévisions personnelles HORIZON vers AURA
- [x] Contexte HORIZON injecté dans l'IA locale avec garde-fous épistémiques
- [x] Faits de contexte AURA → HORIZON
- [x] Intentions AURA → HORIZON
- [x] Nœuds d'automatisation HORIZON (domaine, statut épistémique, personnel, sûreté d'autonomie)
- [x] Fonctionnement AURA non bloquant si HORIZON est hors ligne
- [x] API locale de diagnostic et synchronisation HORIZON

## Noyau souverain AURA unifié

- [x] Soul persistant avec cycles et état développemental runtime
- [x] Boucle de réflexion ambient non auto-récursive
- [x] Intentions persistantes
- [x] Routines autonomes persistantes
- [x] Réflexions auditables avec hypothèse/prochaine action/confiance
- [x] Apprentissage durable à partir des résultats d'automatisation
- [x] Détection des motifs d'échec répétés
- [x] Propositions d'amélioration avec plan de validation
- [x] Sous-agents spécialisés AURA
- [x] Swarm multi-agents avec synthèse
- [x] API AURA Cloud protégée par `AURA_CLOUD_TOKEN`
- [x] `/api/chat` reconnecté au noyau serveur
- [x] `/api/kernel/tick` reconnecté à la réflexion privée
- [x] Soul + leçons + HORIZON injectés dans le contexte IA
- [x] Perception `live_awareness` réellement installée au runtime
- [x] Garde-fous Automation Studio conservés comme autorité d'exécution
- [x] Aucune auto-modification silencieuse du code de production

## Auto-évolution AURA

- [x] Recherche périodique des améliorations documentées sur sources HTTPS autorisées
- [x] Veille du dépôt GitHub officiel et des versions PyPI
- [x] Analyse des erreurs récurrentes et des leçons du noyau
- [x] Génération de patchs minimaux par remplacement exact
- [x] Workspace de test séparé du runtime actif
- [x] Réseau externe bloqué pendant les tests du sas
- [x] Compilation baseline + candidat
- [x] Suite pytest baseline + candidat
- [x] Interdiction d'auto-modifier les tests existants
- [x] Fichiers de sécurité/politique protégés de toute auto-promotion
- [x] Détection de nouvelles primitives sensibles dans un patch
- [x] Soumission automatique optionnelle d'une PR GitHub
- [x] Deuxième sas via checks CI GitHub
- [x] Fusion automatique optionnelle uniquement après checks distants réussis
- [x] Historique persistant de chaque cycle d'évolution et de ses preuves
- [x] Pas d'écriture directe dans le runtime actif pendant la génération/test

## AURA Evolution progressive

- [x] Phase 1 `observe` active par défaut
- [x] Recherche externe limitée aux domaines autorisés
- [x] Diagnostic persistant à partir des erreurs, leçons et évolutions documentées
- [x] Zéro patch / zéro PR / zéro merge en mode `observe`
- [x] Niveau `sandbox` pour candidat local + tests isolés
- [x] Niveau `submit` pour PR après validation locale
- [x] Niveau `promote` pour fusion uniquement après tous les checks CI requis
- [x] Autorité effective visible via `/api/evolution/status`

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
- [ ] OBS : serveur WebSocket activé uniquement si le mode de compatibilité OBS est utilisé
- [ ] IA : Ollama lancé ou API compatible configurée
- [ ] X, Bluesky, LastFM, Steam, IGDB, RCON et Telnet : identifiants propres à chaque service
- [ ] Fonctionnement 24/7 : serveur, VPS ou machine restant allumée

## Limite honnête

Quantic Studio 2.7.4 fournit un noyau local très étendu. Une parité absolue avec un service cloud exploité depuis plusieurs années ne peut pas être déclarée sans tests réels en charge, hébergement permanent et identifiants des services externes. Les dépendances externes sont affichées comme telles dans la page « Couverture fonctionnelle » au lieu d'être présentées comme actives.

- [x] Compositeur multi-source natif : écran, fenêtre/jeu, webcam, image, texte et navigateur/Mairaiy
- [x] Sources navigateur headless locales avec MJPEG + chroma-key
- [x] Détection automatique fenêtres/jeux et webcams
- [x] Ajout/configuration/suppression et drag & drop des sources dans Aura Studio

- [x] Moteur Quantic par défaut au démarrage, OBS conservé en compatibilité
- [x] Windows Graphics Capture (`gfxcapture`) pour fenêtre/jeu avec fallback GDI
- [x] FFmpeg Windows vérifié et embarqué dans le package
- [x] Édition scène/source pendant Live/REC avec rebuild contrôlé
- [x] Mix audio natif 3 voies : micro + son PC/jeu WASAPI + Aura/Mairaiy/alertes
- [x] Live + REC simultanés sans concurrence sur les buffers PCM
- [x] Coffre RTMP local chiffré DPAPI, migration des anciennes clés et zéro secret dans engine.json

- [x] Gestion complète des scènes depuis Aura Studio
- [x] Transition contrôlée Cut / Fondu lors du rebuild de scène
- [x] Replay buffer segmenté et clip instantané
- [x] Multistream via FFmpeg tee, clés secondaires chiffrées DPAPI
- [x] Installateur Windows Inno Setup sans droits administrateur obligatoires
- [x] Conservation de .env et des données utilisateur pendant les mises à jour
- [x] Centre de mise à jour intégré avec vérification de la release officielle
- [x] Vérification SHA-256 avant lancement d'une mise à jour
- [x] Pipeline Authenticode prêt pour certificat de signature de code
