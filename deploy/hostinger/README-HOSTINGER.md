# Déploiement manuel AURA Cloud sur Hostinger

Ce package correspond au commit validé de la PR #57 (AURA Evolution phase 1).

## Ce qu'il contient

- le runtime Python AURA (`app/`) ;
- les configurations publiques (`config/`) ;
- la suite `tests/`, nécessaire au sas local AURA Evolution ;
- `requirements.txt` et `pytest.ini` ;
- un exemple d'environnement Hostinger ;
- un script de démarrage Linux ;
- aucun `.env`, token, base SQLite, média utilisateur, build Windows ou dépôt `.git`.

## Important

Ce ZIP nécessite un hébergement Hostinger capable d'exécuter une application Python 3.12 ou un conteneur Docker. Un simple Website Builder / AI Builder statique ne peut pas exécuter FastAPI.

## Installation Python

1. Décompresser le ZIP à la racine de l'application.
2. Copier `deploy/hostinger/.env.hostinger.example` vers `.env`.
3. Remplacer au minimum :
   - `AURA_CLOUD_TOKEN`
   - `AURA_EVOLUTION_CANARY_TOKEN`
   - les paramètres IA si une IA distante est utilisée.
4. Installer :

```bash
python -m pip install -r requirements.txt
```

5. Démarrer :

```bash
bash deploy/hostinger/start.sh
```

Le script mappe automatiquement la variable Hostinger `PORT` vers `AURA_PORT`.

## Docker

Depuis la racine :

```bash
docker build -f deploy/hostinger/Dockerfile -t aura-cloud .
docker run --env-file .env -p 8787:8787 -v aura-data:/app/data aura-cloud
```

## Vérification

Après démarrage, vérifier d'abord :

- `/api/kernel/status`
- `/api/evolution/status`

Ces routes sont privées. Utiliser :

```text
Authorization: Bearer <AURA_CLOUD_TOKEN>
```

En phase 1 :
- recherche + diagnostic : ON ;
- sandbox local : ON si l'arbre source complet est présent ;
- auto-submit : OFF ;
- auto-merge : OFF ;
- canary indépendant : requis avant toute future promotion automatique.

## Données

Conserver le dossier `data/` sur un volume persistant. Ne jamais écraser un ancien `data/aura_live.db` lors d'une mise à jour.
