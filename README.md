# Aura Live

Aura Live est un système local de production et d’automatisation Twitch centré sur **Mairaiy** : chat IA, mémoire communautaire, OBS, avatar vocal, alertes, modération, fidélité, jeux et automatisations.

## Architecture cible

- fonctionnement local lié au PC de streaming ;
- intégration native Twitch et OBS ;
- moteur d’automatisation `Déclencheurs → Conditions → Actions` ;
- éditeur visuel, variables, files, simulation et journal d’exécution ;
- blocs IA natifs pour Mairaiy ;
- aucune dépendance à Streamer.bot, WizeBot ou StreamElements.

## Sécurité

Les secrets et données locales ne doivent jamais être versionnés : `.env`, jetons OAuth, clés API, mots de passe OBS et base de données locale.

## État

Dépôt initialisé pour accueillir la base Aura Live 1.2 puis le développement d’Aura Live 2.0.
