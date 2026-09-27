# AURA — Audit AGI v1

Date: 2026-09-28

## Conclusion

**AURA n'est pas démontrée AGI à ce stade.**

Elle possède un substrat agentique généraliste inhabituellement large : mémoire persistante, intentions, apprentissage à partir des résultats, allocation adaptative du calcul, Web Substrate, outils typés, DAGs, missions longue durée, critique/replanification, Evolution, Director Mode et orchestration multi-produit.

Ce socle est suffisant pour justifier une **évaluation AGI sérieuse**, mais pas pour conclure AGI. Les preuves manquantes portent surtout sur la généralisation à des tâches réellement inconnues, le transfert conceptuel inter-domaines, l'amélioration mesurable grâce à la mémoire, la réussite autonome de missions longues, et la compétence ouverte multi-outils.

## Méthode

La batterie ne produit volontairement **aucun "score AGI" unique**. Elle classe chaque capacité comme :

- `pass` : comportement déterministe effectivement testé ;
- `fail` : régression d'une capacité attendue ;
- `gap` : capacité nécessaire mais absente ou ambiguë ;
- `unverified` : architecture présente mais preuve comportementale insuffisante.

Cette philosophie suit l'idée centrale d'ARC-AGI : la nouveauté, la généralisation et l'efficacité comptent davantage qu'une simple accumulation de fonctions. La batterie interne ne remplace pas ARC-AGI-2/3, GAIA ni un benchmark logiciel externe.

Référence ARC-AGI-2 : https://arcprize.org/arc-agi/2

## Résultat initial attendu

La version v1 contient 18 contrôles.

### Capacités déterministes testées

1. composition d'un plan en DAG avec dépendances ;
2. rejet des cycles ;
3. confinement des outils à effets de bord ;
4. sélection des capacités par confiance, fiabilité et latence ;
5. respect d'un plafond de coût explicite ;
6. allocation adaptative du calcul selon nouveauté/risque ;
7. apprentissage de politique après un échec ;
8. déclenchement d'une recherche externe pour les faits actuels ;
9. arrêt sur dépassement du budget de graphe ;
10. arrêt des actions dépendantes après échec amont ;
11. mesure mathématique d'incertitude.

### Lacune critique détectée

Dans `Capability Fabric`, `maxCostMicrounits=0` signifie actuellement **"aucun plafond"**, pas **"zéro coût uniquement"**.

Cela ne veut pas dire qu'AURA dépense actuellement de l'argent : les fournisseurs de modèles possèdent déjà leurs propres garde-fous `AURA_ZERO_COST_MODE`. Mais la primitive Fabric n'est pas elle-même fail-closed sur ce point.

Cette ambiguïté doit être corrigée avant de considérer la gouvernance financière comme démontrée de bout en bout.

### Preuves encore manquantes

- **ARC-style abstraction held-out** : aucune exécution ARC-AGI-2/3 officielle n'est branchée.
- **Transfert inter-domaines** : le transfert de politique risque/calcul existe, mais pas de preuve qu'une stratégie conceptuelle apprise dans un domaine améliore une tâche inconnue dans un autre.
- **Mémoire utile** : persistance SQL réelle, mais pas encore de test restart -> rappel -> amélioration de performance.
- **Long horizon** : replanification et critique existent, mais pas de mission aveugle de plusieurs heures scorée automatiquement.
- **Open-world / GAIA-style** : Web + outils + DAG existent, mais aucune série cachée avec résultats exacts.
- **Auto-réparation logicielle** : Evolution/Director existent, mais pas encore de benchmark aveugle de bugs inconnus.
- **Calibration** : AURA calcule surprise/entropie/confiance, mais il faut mesurer si sa confiance prédit réellement son taux d'erreur.

## Ce qui constituerait une preuve nettement plus forte

Une revendication AGI ne devrait être envisagée que si AURA réussit simultanément :

1. un benchmark abstrait held-out de type ARC ;
2. une suite multi-outils inconnue de type GAIA ;
3. un benchmark de correction logicielle sur dépôts non vus ;
4. une épreuve de mémoire persistante avec amélioration mesurée ;
5. des missions longue durée avec pannes injectées et récupération ;
6. un test de transfert de stratégie entre domaines sans réentraînement spécifique ;
7. des mesures de coût, latence et nombre d'appels montrant que les résultats ne proviennent pas d'une recherche exhaustive.

## Exécution

Depuis `cloud-node/` :

```bash
npm run audit:agi
npm run test:agi
```

Pour produire un rapport machine :

```bash
node scripts/run-agi-audit.mjs --json=agi-audit-report.json
```

Le workflow GitHub `AURA AGI Battery` exécute automatiquement cette batterie sur les changements du noyau cognitif.
