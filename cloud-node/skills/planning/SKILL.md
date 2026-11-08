---
name: planning
description: Planification vérifiable
version: 1
owner: AURA
execution: advisory-only
budget_eur: 0
roles: [planner, operator]
---

# Planification vérifiable

Cette compétence est une procédure native AURA. Son comportement compilé est défini dans `src/agent_skills.js` et non par l'exécution de ce document. Aucun script externe n'est chargé.

## Procédure

1. Définir le livrable observable, le périmètre et les interdits.
2. Faire l'inventaire des modules, données, risques et dépendances existantes.
3. Découper en étapes bornées avec vérification et marche arrière.
4. Faire approuver les actions à effets externes au lieu de les déclencher.

## Porte de validation

Plan daté, dépendances, critères d'acceptation et risques documentés. Une déclaration de l'agent, seule, n'est pas une preuve.

## Politique immuable

Budget : **0 €**. Aucune nouvelle API payante, aucun installateur, aucune commande shell automatique, aucun accès à un compte ou envoi de document sans autorisation, aucun déploiement implicite. Les étapes restent **pending** jusqu'à vérification instrumentée.
