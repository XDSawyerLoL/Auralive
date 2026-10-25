# AURA — Critères de réussite opérationnelle (zéro abonnement)

Ce dossier évalue les résultats de l'opérateur AURA, **pas la qualité d'une prétendue AGI**.

## 1. Vérification gratuite sans installation

Depuis la racine du dépôt :

```sh
node evaluation/aura-operations/verify.mjs
```

La commande exécute 11 scénarios contre le vrai validateur
`cloud-node/src/outcome_truth.js`. Aucun appel d'API, navigateur, modèle ou npm requis.

## 2. Audit de vraies pages SWAPP sur le PC

Installer une seule fois les dépendances Runtime et son navigateur (sur le PC,
pas sur Hostinger) si nécessaire :

```sh
python -m pip install -r aura_runtime/requirements.txt
python -m playwright install chromium
```

Lancer depuis la racine :

```sh
python -m aura_runtime.browser_audit --routes / /actus /twitch
node evaluation/aura-operations/verify.mjs aura-browser-reports/audit-report.json
```

AURA ouvre chaque page en mode ordinateur et mobile, relève HTTP, titre,
exceptions JS, images cassées, débordements horizontaux et écrit les captures
sur le disque local. Le vérificateur Node recalcule indépendamment leur SHA-256.

**Limites :** ce test ne prouve ni l'absence de bugs fonctionnels, ni que les
streams sont diffusés, ni que le chat et le lecteur sont parfaitement alignés.
Le navigateur est éphémère, sans identifiants ni clics; seuls les domaines et
routes SWAPP publics de l'allowlist sont acceptés. Aucun POST n'est autorisé
par l'intercepteur de requêtes. Le trafic navigateur public peut néanmoins
utiliser des ressources réseau classiques.

## 3. Évaluation complémentaire avec Promptfoo (facultative, PC uniquement)

Si Promptfoo est déjà installé localement :

```sh
cd evaluation/aura-operations
promptfoo eval -c promptfooconfig.yaml --safe-mode
```

Le fournisseur `provider.mjs` est **100 % local** et appelle le vrai
classificateur d'AURA. Aucun fournisseur IA n'est configuré. Ne pas ajouter
ces scripts aux GitHub Actions payantes.

## 4. Via AURA Runtime une fois le pont connecté

L'opérateur accepte ce plan JSON typé, sans étape de génération IA :

```json
{"summary":"Contrôle public SWAPP","actions":[{"type":"browser.audit","routes":["/","/actus","/twitch"]}]}
```

Risque requis : `browser-control`. Les captures restent sur la machine
locale dans `aura-browser-audits/`. Une page en échec entraîne un résultat
opérateur `status:error, executed:false` et conserve les détails de l'échec.

Le pont local demande `AURA_BRIDGE_TOKEN` sur Hostinger **et** sur le PC,
et `AURA_CLOUD_BASE_URL` sur le PC. Ne jamais commiter la valeur du token.

## Décisions d'architecture

- **Playwright** : utilisé pour l'audit déterministe; Browser Use existant
  reste disponible pour les tâches agentiques.
- **Promptfoo** : facultatif, validateur local déjà exécutable sans lui.
- **MCP Filesystem** : non ajouté; `fs.read/fs.write` bornés existent déjà.
- **Pipelock** : non activé; exige validation d'intégration et des permissions
  avant de filtrer les opérations du Runtime.
- **MarkItDown** : non installé; dépendances de documents et isolation à auditer
  avant activation.
- **Open d1 et modèles plus lourds** : non téléchargés; décision différée à
  une mesure locale des performances et de la RAM.
- **GitHub Actions** : aucune CI ou planification ajoutée.
