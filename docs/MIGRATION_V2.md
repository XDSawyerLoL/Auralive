# Migration locale vers Aura Live 2

Aura Live 2 conserve l’application V1.2 et démarre désormais avec `app.main_v2`. Les tables historiques, le fichier `.env`, les jetons OAuth stockés dans SQLite et les médias locaux restent utilisés.

## Sauvegarde obligatoire

Avant toute mise à jour, copier hors du dépôt :

- `.env`
- `data/aura_live.db`
- `data/media/`

## Mise à jour Git

```powershell
cd C:\Users\valen\Desktop\AuraLive
Copy-Item .env ..\AuraLive.env.sauvegarde -Force
Copy-Item data\aura_live.db ..\aura_live.db.sauvegarde -Force

git fetch origin
git checkout main
git reset --hard origin/main
```

Les fichiers ignorés par Git restent sur le PC. Vérifier ensuite que `.env` et `data\aura_live.db` sont toujours présents.

## Réinstallation des dépendances

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\reparer-installation.ps1
```

## Lancement

```powershell
.\aura.bat
```

Le script lance `python -m app.main_v2`.

## Accès

- Centre de contrôle historique : `http://localhost:8787/`
- Automation Studio : `http://localhost:8787/automation`
- Statut moteur : `http://localhost:8787/api/automation/status`

## Principe de non-régression

Pour chaque événement Twitch, Aura Live 2 exécute d’abord le traitement V1.2, puis les automatisations personnalisées. Un scénario installé depuis un modèle est désactivé par défaut afin d’éviter les doubles alertes et doubles messages.

## Retour arrière

```powershell
git checkout migration/aura-live-1.2
```

Le fichier `.env` et la base locale ne sont pas modifiés par ce changement de branche.
