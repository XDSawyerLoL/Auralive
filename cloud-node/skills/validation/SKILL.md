---
name: validation
description: Validation et livraison
version: 1
owner: AURA
execution: advisory-only
budget_eur: 0
roles: [critic, operator, dev]
---

# Validation et livraison

Cette compétence est une procédure native AURA. Son comportement compilé est défini dans `src/agent_skills.js` et non par l'exécution de ce document. Aucun script externe n'est chargé.

## Procédure

1. Contrôler syntaxe, tests, sécurité et intégrité de l'archive.
2. Vérifier la branche, la version, les checks et les conditions de livraison.
3. Valider réellement le service déployé sans confondre archive créée et publication.
4. Ne déclarer l'opération terminée qu'avec une preuve datée.

## Porte de validation

Checks réels, version déployée, résultat du test réel et plan de rollback. Une déclaration de l'agent, seule, n'est pas une preuve.

## Politique immuable

Budget : **0 €**. Aucune nouvelle API payante, aucun installateur, aucune commande shell automatique, aucun accès à un compte ou envoi de document sans autorisation, aucun déploiement implicite. Les étapes restent **pending** jusqu'à vérification instrumentée.
