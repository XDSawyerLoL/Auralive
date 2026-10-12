# Audit d'architecture AURA 3.0 — 2026-10-12

## Périmètre vérifié
Dépôt `XDSawyerLoL/Auralive`, branche `main`, dossier `cloud-node/`, avec comparaison de la branche historique `hostinger/aura-cloud`. Cet audit est statique : aucun résultat de production, de CI ou de benchmarks tiers n'est présumé.

## Existant à préserver
- `src/kernel.js`: noyau v3.1, cognition, organisme, inférence active, mémoire et apprentissage de politiques.
- `src/task_graph.js`, `src/capability_fabric.js`: DAG, exécution de capacités typées, contrôles de coût et de risques.
- `src/command_center.js`, `src/long_horizon.js`: portefeuille de produits, initiatives et missions durables avec critique et replanification.
- `src/skill_learning.js`: compétences dérivées des résultats, candidats et promotion après observations.
- `src/language_faculty.js`: mémoire contextuelle et benchmark de français de neuf tâches.
- `src/db.js`: persistance opérationnelle MySQL.

## Constats concrets
1. **Vérité opérationnelle (P0)** : avant ce correctif, `executeInitiative` pouvait classer une réponse `executed:false` comme `completed`, et `reconcileWaiting` limitait le rejet des payloads de worker à `evolution`. Les missions utilisaient un prédicat permissif sur les résultats. La PR introduit un classificateur d'état partagé et des tests de non-régression.
2. **Décision rapide (P1)** : `ActiveInferenceEngine` choisit des niveaux `native/fast/deep/verified` à partir de pondérations et seuils; `DagCompiler` dispose d'un routeur natif par indices lexicaux. Ce n'est pas encore un classificateur de décisions entraîné et calibré avec une matrice de confusion et des résultats terrain.
3. **Exécution parallèle (P1)** : les nœuds d'un DAG peuvent s'exécuter en parallèle, mais `LongHorizonMissionEngine.activeMission()` sélectionne une seule mission courante. Évaluer une file multi-missions avec verrous par service, limites et reprise après panne.
4. **Preuves de mission (P1)** : les `success_criteria` sont stockés et envoyés au critique, mais la réussite finale peut dépendre de la fin des étapes plutôt que de preuves machine validées pour chacun des critères. Ajouter des attestations d'artefacts et contrôles de postconditions.
5. **Apprentissage (P1)** : `skill_learning.js` promeut une recette sur seuils de réussite et diversité de contextes; `native_learning.js` ajuste des coefficients. Vérifier les biais de résultats déclarés, les doublons et l'effet de l'apprentissage sur une batterie tenue à l'écart.
6. **Français (P1)** : le benchmark public couvre neuf cas à expressions régulières; il mesure une compatibilité limitée, pas une maîtrise générale de la langue. Le modèle auto-hébergé doit être disponible et testé sur l'infrastructure réelle, sans réponse fictive.
7. **Écart de branches / déploiement (P0)** : `main/cloud-node/package.json` annonce la v3.0.0 tandis que `hostinger/aura-cloud/package.json` annonce la v2.2.1. Identifier la source exacte de l'instance déployée et vérifier les hashes avant de qualifier AURA 3.0 de « en production ».
8. **Budget et sécurité (invariant)** : aucun fournisseur payant en repli, aucune dépendance obligatoire au worker local, aucun merge automatique de cette PR. Garder la protection des secrets, la validation des outils et l'isolation des actions à effet de bord.

## Séquence de travail recommandée
- **Étape 1 — Production Truth** : état d'exécution fiable, artefact/preuve, test des retours d'erreurs/attentes/rejets, comparaison au vrai déploiement.
- **Étape 2 — AURA Reflex** : collecte d'événements, classificateur calibré, escalade vers raisonnement profond, journal des décisions et résultats; pas de clonage aveugle de JEV.
- **Étape 3 — Organisation multi-agents** : emprunter le modèle objectif→mission→agent→résultat à Paperclip, sans importer tout son backend.
- **Étape 4 — Mémoire exploitable** : indexer source, date, validité et provenance des décisions; déduplication et recherche inter-sessions dans MySQL/SQLite existants avant d'ajouter une nouvelle pile.
- **Étape 5 — Compétences** : importer uniquement des workflows libres et testés (débogage, revue, recherche), en bac à sable, avec vérification des licences.
- **Étape 6 — Carte neuronale réelle** : projeter les événements instrumentés des agents et du DAG sur le graphe; aucune animation décorative présentée comme du calcul réel.

## Validation
Cette PR ne déploie rien. Exécuter depuis `cloud-node/` : `npm run check:package`, `node --test test/outcome_truth.test.js`, `npm test`. Vérifier ensuite les gates CI et un scénario bout-à-bout sur un environnement d'essai; seulement ensuite considérer la fusion.
