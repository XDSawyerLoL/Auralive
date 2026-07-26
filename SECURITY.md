# Sécurité Aura Live

## Données qui ne doivent jamais entrer dans Git

- `.env` et toute copie de ce fichier ;
- secrets Twitch et clés API ;
- mot de passe OBS WebSocket ;
- jetons OAuth et base `data/aura_live.db` ;
- médias privés et journaux locaux.

## Incident du premier import

Une copie de fichier `.env` a été incluse dans le premier commit de la branche d’import. La branche distante a été réécrite pour supprimer ce commit de son historique actif et le fichier n’est pas présent dans la branche d’intégration.

Comme le dépôt est public, les valeurs concernées doivent être considérées comme compromises même après réécriture :

1. régénérer le secret de l’application Twitch ;
2. changer le mot de passe OBS WebSocket ;
3. remplacer ces valeurs uniquement dans le `.env` local ;
4. reconnecter les comptes Twitch si nécessaire.

## Actions système Automation Studio

L’action `system.process.run` est refusée par défaut. Un exécutable doit être ajouté explicitement au réglage local `automation.allowed_programs`. Les écritures de fichiers restent confinées dans `data/automation-files`.

Les actions réseau, Twitch, modération et processus sont marquées avec un niveau de risque dans le catalogue Automation Studio afin que l’interface puisse les signaler avant activation.
