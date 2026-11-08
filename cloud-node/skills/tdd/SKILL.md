---
name: tdd
description: Développement guidé par tests
version: 1
owner: AURA
execution: advisory-only
budget_eur: 0
roles: [dev, planner]
---

# Développement guidé par tests

Cette compétence est une procédure native AURA. Son comportement compilé est défini dans `src/agent_skills.js` et non par l'exécution de ce document. Aucun script externe n'est chargé.

## Procédure

1. Formuler le contrat d'entrée, de sortie et les invariants.
2. Écrire un test qui échoue effectivement avant modification.
3. Proposer la modification minimale autorisée.
4. Relancer les tests ciblés puis complets, et relever les résultats.

## Porte de validation

Résultats mesurés d'un test avant/après, sans jamais inventer une exécution. Une déclaration de l'agent, seule, n'est pas une preuve.

## Politique immuable

Budget : **0 €**. Aucune nouvelle API payante, aucun installateur, aucune commande shell automatique, aucun accès à un compte ou envoi de document sans autorisation, aucun déploiement implicite. Les étapes restent **pending** jusqu'à vérification instrumentée.
