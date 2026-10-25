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
- opérateur local natif: inspection, fichiers bornés, process allowlistés et HTTP technique contrôlé;
- lecture Web profonde via Crawl4AI pour pages JavaScript et extraction Markdown;
- agent navigateur Browser Use + Ollama actif par défaut sur tout le Web public.

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

Browser Use et Crawl4AI font désormais partie des dépendances standard du Runtime. Sous Windows, le launcher installe aussi Chromium lors du premier bootstrap si nécessaire. Aucune API payante n'est requise : Browser Use utilise l'Ollama local configuré par AURA.

3. Copier `.env.example` en `.env` à la racine du package puis renseigner au minimum `AURA_CLOUD_BASE_URL` et `AURA_BRIDGE_TOKEN`. Le Runtime charge automatiquement ce fichier sans écraser les vraies variables d'environnement.
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


## Open Web Capabilities

AURA garde la décision, la politique et la validation. Les projets externes restent des adaptateurs d'outils.

### Crawl4AI

`web.deep_read` est une lecture seule. L'URL passe d'abord par les contrôles réseau du Runtime (HTTPS, DNS public, allowlist éventuelle), puis Crawl4AI rend la page dynamique et renvoie du Markdown nettoyé.

Variables :

```env
AURA_RUNTIME_DEEP_WEB_ENABLED=true
AURA_RUNTIME_DEEP_WEB_MAX_CHARS=60000
```

### Browser Use

`browser.task` est actif par défaut avec Ollama local :

- `AURA_RUNTIME_BROWSER_ENABLED=true`;
- `browser-control` fait partie de la politique locale standard;
- `AURA_RUNTIME_BROWSER_ALLOW_ALL_PUBLIC=true` ouvre tout le Web HTTP/HTTPS public;
- aucune allowlist de domaines n'est nécessaire dans ce mode;
- localhost, les IP directes et les réseaux privés/non globaux restent interdits;
- les secrets AURA ne sont pas injectés dans le navigateur;
- la vision reste optionnelle via `AURA_RUNTIME_BROWSER_USE_VISION`;
- une mission navigateur peut utiliser jusqu'à 50 étapes, avec 25 par défaut.

Pour revenir à une allowlist, mettre `AURA_RUNTIME_BROWSER_ALLOW_ALL_PUBLIC=false` puis renseigner `AURA_RUNTIME_BROWSER_DOMAINS`.

## Pont Cloud : diagnostic de la connexion

Le Runtime local utilise `AURA_BRIDGE_TOKEN` pour l'authentification des
endpoints `/api/bridge/...`. Ce jeton doit être **identique** à
`AURA_BRIDGE_TOKEN` configuré sur Hostinger. Il est distinct de
`AURA_CLOUD_TOKEN` (accès aux autres fonctions). Le token ne doit jamais
figurer dans GitHub ou dans les rapports.

1. Définir `AURA_BRIDGE_TOKEN` sur Hostinger et sur le PC (fichier `.env` local).
2. Définir `AURA_CLOUD_BASE_URL` sur le PC avec l'URL HTTPS du Cloud.
3. Lancer `aura_runtime\\run-aura-runtime.cmd` sur le PC Windows.
4. Vérifier `/api/command/status` côté Cloud : le worker doit être indiqué en ligne.

Si le worker est hors ligne, aucune exécution PC ne peut être certifiée.
Le Runtime n'ouvre aucun port entrant et ne nécessite pas de VPS.

## Audit navigateur SWAPP sans modèle payant

Le Runtime comporte désormais `browser.audit`, un contrôle Playwright
**sans Ollama ni service externe payant** sur les seules pages publiques SWAPP.

Depuis la racine du dépôt, avec Python/Playwright et Chromium installés :

```sh
python -m aura_runtime.browser_audit --routes / /actus /twitch
node evaluation/aura-operations/verify.mjs aura-browser-reports/audit-report.json
```

Le rapport indique les captures réalisées et les éventuels défauts détectés
dans chaque viewport. Les permissions de l'opérateur imposent
`browser-control` si l'action est déclenchée via un worker Cloud. Les
captures ne sont pas transférées automatiquement vers Hostinger.

## Diagnostic Runtime sans connexion ni API

Depuis la racine du dépôt :

```sh
python -m aura_runtime.doctor
```

Le diagnostic affiche uniquement des booléens de configuration :
disponibilité d'aiohttp et Playwright, adresse HTTPS valide et présence
du jeton `AURA_BRIDGE_TOKEN`. **Il n'affiche jamais la valeur du jeton**
et ne contacte pas Hostinger. `ready_for_bridge_start` signifie que
les prérequis locaux sont présents, pas que le Cloud a accepté la connexion.

Les actions locales `fs.write` et `fs.read` émettent dorénavant des
empreintes SHA-256; `fs.write` relit le fichier et restaure la version
précédente en cas d'incohérence détectée. Les missions `browser.audit`
renvoient des résultats mesurés (captures, succès/échecs, contrôles mobile).
Un accusé de réception seul ne doit jamais marquer la mission terminée.

## Actions quotidiennes réellement exécutables, hors Quantic/SWAPP

AURA Runtime possède désormais quatre outils déterministes qui utilisent les
fichiers choisis par l'utilisateur. Ils ne demandent **ni modèle, ni Cloud,
ni clé API**. Les opérations passent par le même opérateur local typé et
son contrôle de permissions.

Depuis la racine du dépôt, remplacer le chemin d'exemple par un dossier
que tu autorises explicitement :

```powershell
python -m aura_runtime.personal_cli --root "C:\Users\Utilisateur\Documents" search --query "facture"
python -m aura_runtime.personal_cli --root "C:\Users\Utilisateur\Documents" csv --path "depenses.csv"
python -m aura_runtime.personal_cli --root "C:\Users\Utilisateur\Documents" compare --left "avant.txt" --right "apres.txt"
python -m aura_runtime.personal_cli --root "C:\Users\Utilisateur\Documents" backup --path "important.txt"
```

- **Recherche** : fichiers texte UTF-8 uniquement, sous-dossiers autorisés,
  100 fichiers / 30 correspondances maximum, aucun fichier caché.
- **CSV** : calcul de colonnes numériques (dont virgule décimale française),
  5000 lignes, 32 colonnes, 1 Mo maximum ; retourne total, moyenne, min/max
  sans avoir besoin d'un LLM.
- **Comparaison** : différences des 100 premières lignes du diff sur deux
  textes de 200 Ko maximum, avec les empreintes de chaque version.
- **Sauvegarde** : copie distincte de 2 Mo maximum, créée avec exclusivité,
  relue et vérifiée par SHA-256 ; permission d'écriture obligatoire, sans
  écraser l'original. Une transaction annulée supprime sa nouvelle copie.

Les chemins sont résolus sous la racine autorisée et les tentatives de sortie
sont rejetées. Les résultats sont affichés **localement** ; ils peuvent
contenir des extraits des documents demandés et ne doivent pas être
publiés dans les journaux GitHub. L'utilisation **par Cloud** des mêmes
actions transmettrait le résultat à Hostinger : limiter les autorisations
et éviter les données confidentielles.

### Mesure reproductible : tâches réelles, pas intention d'agir

```powershell
python -m aura_runtime.personal_benchmark
```

Le benchmark crée son propre dossier temporaire, puis mesure 7 scénarios
avec le véritable opérateur AURA : recherche, budget, diff, sauvegarde,
refus sans permission, refus hors dossier et rollback après échec.
Le résultat JSON comporte `checks_passed`, `checks_total` et `ok`.
Il doit retourner un code d'erreur si un seul scénario échoue.

Cela démontre uniquement les **capacités opérationnelles testées**, pas
une conversation autonome, la gestion des emails ou l'exécution effective
des actions depuis une interface Hostinger. Aucun benchmark ne doit
être considéré comme réussi avant son lancement sur un Runtime installé.
