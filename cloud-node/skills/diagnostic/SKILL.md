---
name: diagnostic
description: Diagnostic reproductible
version: 1
owner: AURA
execution: advisory-only
budget_eur: 0
roles: [dev, operator]
---

# Diagnostic reproductible

Cette compétence est une procédure native AURA. Son comportement compilé est défini dans `src/agent_skills.js` et non par l'exécution de ce document. Aucun script externe n'est chargé.

## Procédure

1. Décrire le défaut, le résultat attendu et les conditions de reproduction.
2. Rassembler logs et mesures sans extraire de secrets.
3. Comparer les hypothèses et chercher le changement minimal.
4. Préparer un test de régression et un retour arrière.

## Porte de validation

Symptôme reproduit, cause étayée et résultat de test réellement observé. Une déclaration de l'agent, seule, n'est pas une preuve.

## Politique immuable

Budget : **0 €**. Aucune nouvelle API payante, aucun installateur, aucune commande shell automatique, aucun accès à un compte ou envoi de document sans autorisation, aucun déploiement implicite. Les étapes restent **pending** jusqu'à vérification instrumentée.
