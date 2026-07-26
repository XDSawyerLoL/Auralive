# Mairaiy — coanimatrice contextuelle

Aura Live 2.0.8 transforme Mairaiy en coanimatrice plutôt qu'en simple bot réactif.

## Sources de contexte

- profil local éditable de SANSAHD et de la chaîne ;
- titre, catégorie, tags et audience du live Twitch ;
- derniers messages humains du chat, hors commandes et bots ;
- scène OBS courante ;
- capture basse résolution du programme OBS uniquement, jamais le bureau privé ;
- mémoire individuelle déjà existante pour chaque viewer.

Le profil actif est conservé dans `data/channel_profile.json`. Le fichier `config/channel_profile.default.json` sert uniquement de modèle initial.

## Initiatives

Mairaiy peut intervenir lorsqu'un sujet se répète, qu'une question reste ouverte, qu'une réaction collective apparaît ou qu'un changement visible dans le programme OBS est pertinent. Elle doit retourner `SKIP` lorsque son intervention serait artificielle.

Garde-fous par défaut :

- six messages humains avant une décision ;
- quatre minutes minimum entre deux interventions ;
- trois initiatives maximum par heure ;
- aucune initiative hors live, en mode silence ou sans connexion au chat ;
- aucune affirmation visuelle sans analyse OBS réussie.

## CTA naturels

Les campagnes JustPlayer, Discord et Suivre possèdent chacune un intervalle et un maximum par live. Le texte est généré en fonction du chat et du jeu courant. Une campagne peut être différée si le moment est inadapté.

Le CTA JustPlayer ne doit inventer aucune fonctionnalité ou promesse concernant le site. Le Discord reste désactivé par défaut tant que son lien ou sa commande n'a pas été validé.

## Coût de la voix

Gemini TTS 3.1 Flash est utilisé en priorité. Le garde-fou local applique par défaut une estimation conservatrice de `0,50 USD` maximum par jour au tarif payant. À l'atteinte du plafond, Aura bascule automatiquement vers la voix Windows, puis vers le navigateur si nécessaire.

Variables :

```env
TTS_BUDGET_ENABLED=true
TTS_MAX_DAILY_USD=0.50
```

Le diagnostic `GET /api/avatar/runtime` indique les minutes générées, l'estimation quotidienne et le montant restant. Le niveau gratuit Google peut produire une facturation réelle de 0 USD ; le compteur reste volontairement conservateur.

## Diagnostics

- `GET /api/cohost/status`
- `GET /api/cohost/profile`
- `POST /api/cohost/context/refresh`
- `POST /api/cohost/screen/analyze`
- `POST /api/cohost/test/initiative`
- `POST /api/cohost/test/cta`
- `GET /api/avatar/runtime`
