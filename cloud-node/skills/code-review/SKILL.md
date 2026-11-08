---
name: code-review
description: Revue de code et sécurité
version: 1
owner: AURA
execution: advisory-only
budget_eur: 0
roles: [security, critic, dev]
---

# Revue de code et sécurité

Cette compétence est une procédure native AURA. Son comportement compilé est défini dans `src/agent_skills.js` et non par l'exécution de ce document. Aucun script externe n'est chargé.

## Procédure

1. Identifier le diff exact et les chemins de données non fiables.
2. Contrôler secrets, accès privés/publics et injection.
3. Contrôler coût 0 €, absence de dépendance payante et absence d'envoi externe implicite.
4. Classer les observations en bloquantes, non bloquantes et inconnues.

## Porte de validation

Fichiers/lignes examinés, risques précis et validation des restrictions. Une déclaration de l'agent, seule, n'est pas une preuve.

## Politique immuable

Budget : **0 €**. Aucune nouvelle API payante, aucun installateur, aucune commande shell automatique, aucun accès à un compte ou envoi de document sans autorisation, aucun déploiement implicite. Les étapes restent **pending** jusqu'à vérification instrumentée.
