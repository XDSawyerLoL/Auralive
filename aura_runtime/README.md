# AURA Runtime

AURA Runtime est le plan d'exécution local universel d'AURA.

Il n'est pas Quantic Studio. Quantic Studio peut l'héberger comme adaptateur de compatibilité, mais le Runtime peut aussi fonctionner seul.

## Capacités standalone v0.1

- connexion sortante authentifiée vers AURA Cloud;
- heartbeat et inventaire machine;
- leases de jobs et reprise après expiration;
- Compute Mesh déterministe;
- inférence locale via Ollama;
- constellation de modèles adaptative : routage par spécialité, mémoire persistante des résultats et exploration bornée;
- Mixture-of-Agents local : plusieurs spécialistes peuvent proposer une réponse puis un modèle critique la synthétise;
- export au Compute Mesh d'un score de compétence par modèle/rôle, sans exposer les prompts ni le contenu utilisateur;
- participation au Mesh si l'utilisateur l'active explicitement;
- Evolution Fleet inter-produits via GitHub, avec allowlist, branches dédiées et PR uniquement;
- opérateur local natif: inspection, fichiers bornés, process allowlistés et HTTP technique contrôlé.

Evolution Fleet appartient désormais directement à AURA Runtime et peut fonctionner sans Studio. L'évolution native du dépôt AURA reste gérée par le noyau Cloud.

L'opérateur local appartient désormais à AURA Runtime. Quantic Studio conserve son opérateur métier historique comme adaptateur de compatibilité, mais un Runtime standalone sait agir sans Studio.

Les capacités voix et image restent encore injectées par des adaptateurs d'hôte à ce stade.

## Constellation adaptative

Le Runtime ne considère plus un modèle comme « le cerveau ». AURA choisit un moteur selon la mission, puis apprend de ses résultats.

- `AURA_RUNTIME_MOA_ENABLED=true` active la coopération locale pour les tâches complexes;
- `AURA_RUNTIME_MOA_MAX_MODELS` borne le nombre de spécialistes;
- `AURA_RUNTIME_MOA_PARALLEL=false` est le défaut prudent pour éviter de saturer la RAM;
- `AURA_RUNTIME_MODEL_SCORECARD_FILE` conserve les performances par modèle et par rôle;
- `AURA_RUNTIME_MODEL_EXPLORATION` autorise un faible taux d'exploration afin qu'un modèle peu essayé puisse encore prouver qu'il est meilleur.

Les échecs, latences et retours qualité font évoluer le score. Les profils statiques restent un a priori, pas une vérité définitive.

## Démarrage

1. Installer Python 3.12+ et Ollama si l'inférence locale est souhaitée.
2. Installer la dépendance:

```bash
pip install -r aura_runtime/requirements.txt
```

3. Copier `.env.example` en `.env` à la racine du package puis renseigner au minimum `AURA_CLOUD_BASE_URL` et `AURA_CLOUD_TOKEN`. Le Runtime charge automatiquement ce fichier sans écraser les vraies variables d'environnement.
4. Sous Windows, lancer `aura_runtime\\run-aura-runtime.cmd` : le launcher crée `.env` s'il manque et installe `aiohttp` si nécessaire. Sinon lancer:

```bash
python -m aura_runtime
```

Le Runtime n'écoute aucun port entrant. Il initie des connexions HTTPS sortantes vers AURA Cloud.

## Invariant

AURA Runtime doit pouvoir vivre sans Quantic Studio. Quantic Studio doit pouvoir utiliser AURA Runtime sans posséder l'identité ou la politique centrale d'AURA.

## Evolution Fleet standalone

Pour permettre au Runtime de maintenir les produits enfants Quantic:

- définir `AURA_RUNTIME_GITHUB_TOKEN` avec les droits GitHub strictement nécessaires;
- conserver `AURA_RUNTIME_GITHUB_ALLOWED_REPOSITORIES` sur les seuls dépôts Quantic autorisés;
- `AURA_RUNTIME_EVOLUTION_AUTO_SUBMIT=true` autorise uniquement la création branche + commit + PR;
- Fleet ne fusionne jamais lui-même une PR inter-produit.

Les cycles et diagnostics Fleet sont persistés localement dans `evolution.sqlite3`.

## Runtime Operator

Le Runtime Operator n'expose jamais un shell arbitraire.

- les chemins doivent rester sous `AURA_RUNTIME_OPERATOR_ROOTS`;
- les écritures sont atomiques et conservées en mémoire pour rollback pendant la transaction;
- si une étape échoue, les écritures/mkdir précédents sont restaurés lorsque possible;
- `process.run` utilise un appel direct sans shell et seulement `AURA_RUNTIME_OPERATOR_COMMANDS`;
- l'environnement enfant exclut les tokens, clés API et credentials AURA;
- `http.get` exige HTTPS, refuse les IP privées/non globales et respecte `AURA_RUNTIME_OPERATOR_DOMAINS`;
- la mission Cloud ne peut jamais élargir `AURA_RUNTIME_OPERATOR_ALLOWED_RISKS`.
