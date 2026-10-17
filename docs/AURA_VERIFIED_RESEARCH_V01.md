# AURA Verified Research Lab v0.1 — R&D sans interrompre Quantic Sillage

Date : 2026-10-13. Statut : **prototype isolé sur branche**, non intégré au runtime, non déployé.

## Deux pistes parallèles, un seul produit central

1. **Entreprise agentique (inchangée)** : AURA Company OS et Control Plane, identités/secrets distincts par produit, permissions, heartbeats fiables, portefeuille multi-missions, reçus d'exécution vérifiables. Poursuivre les intégrations Quantic Sillage, GEKKO, Identity, Mail, Providence/HORIZON et Quantic OS, ainsi que la préparation commerciale.
2. **Recherche scientifique** : renforcer le noyau cognitif par une boucle objectif → hypothèses → expérience → preuve → retour d'expérience → nouvelle décision. Brancher progressivement les résultats validés au Company OS; ne pas mettre des agents expérimentaux en production.

**Règle de fusion :** aucune nouvelle capacité ne passe en production sans comparaison au socle actuel, tests de régression, preuve fonctionnelle et accord explicite pour toute action à effets externes.

## Contenu réalisé dans cette branche

- `src/verified_research_lab.js` : planification exacte de petits budgets par sac-à-dos 0/1; aucun appel externe et aucun coût d'API.
- `VerifiedResearchLab.run` : ne lance que les expériences injectées par l'appelant; par défaut, bloque les expériences avec effets externes sans approbation du candidat exact.
- Les résultats ne sont comptés comme succès/échec vérifiés qu'après un contrat `verify` distinct qui fournit `ok`, `verifierId` et `evidenceId`.
- L'historique ne conserve pas le texte des missions, les réponses ni les données brutes : uniquement l'empreinte SHA-256 de l'objectif, l'identifiant de la proposition, le coût réservé et la référence de preuve.
- Sélection fondée sur la valeur annoncée pondérée par le taux de succès observé (lissage de Laplace). **C'est une heuristique, pas une probabilité calibrée, ni une preuve d'apprentissage général.**
- `test/verified_research_lab.test.js` : tests pour l'optimalité du budget, la reproductibilité, les entrées invalides, la sécurité des effets externes, l'obligation de preuve, la sélection adaptée, la minimisation des données et le mode budget nul.

## Limites explicites

- **Non branché** aux services de production ou à la base AURA. Le `snapshot()` est en mémoire, sans persistance inter-redémarrages. La persistance future doit être authentifiée et résiliente.
- Le contrat `verify` est fourni par l'appelant : dans v0.1 le code ne prouve pas l'indépendance organisationnelle du vérificateur ni l'authenticité de `evidenceId`. Une preuve signée et une chaîne de provenance seront nécessaires.
- Le coût en `costUnits` est déclaré avant exécution; ce n'est pas une mesure réelle de tokens, joules ou secondes.
- Aucun modèle de langage, aucune capacité quantique et aucune intégration JEV payante ne sont ajoutés. Les travaux JEPA/AlphaEvolve/FunSearch guident des expériences ultérieures et ne constituent pas une dépendance.
- Les cas de test démontrent des propriétés logicielles locales, **pas une intelligence générale ni un avantage concurrentiel**.

## Protocole expérimental

1. **T0 / socle de référence :** évaluer le moteur AURA existant sur des tâches inédites de réparation, raisonnement et recherche, avec indices cachés et budget de calcul fixé.
2. **T1 / labo :** utiliser la boucle validée sur les mêmes distributions de tâches, mais avec des instances différentes. Mesurer taux de réussite, taux d'abstention correct, tentatives, temps, et coût effectif.
3. **Ablations :** comparer sans mémoire, sans vérification, sans retour des échecs, et avec le décideur classique seul.
4. **Transfert :** après entraînement sur une famille de tâches, évaluer sur une autre sans exposer les réponses. Comparer à un groupe témoin sans historique.
5. **Sobriété :** comparer la planification classique ci-dessus à une heuristique simple. N'essayer QUBO / recuit simulé / QAOA qu'en présence d'une difficulté de planification mesurée; ne prétendre à aucun avantage quantique sans benchmark sérieux.
6. **Reproductibilité :** publier scripts, jeux de tests, seuils de réussite et résultats négatifs; lancer avec le moteur local disponible sans API payante.

## Plan entreprise : jalons conservés

| Piste produit / opérations | Piste recherche |
| --- | --- |
| Sécuriser les identités, secrets, permissions et preuves de missions du Control Plane | v0.1 : boucle d'expérimentation isolée avec budget et vérification |
| Stabiliser le langage AURA (échec natif Hostinger toujours bloquant) | v0.2 : vérificateurs indépendants et coûts réellement mesurés |
| Heartbeats réels, supervision et portefeuille multi-missions | v0.3 : transfert de stratégies sur tâches cachées |
| GEKKO : environnement d'action pilote, HORIZON : observation et tests | Benchmarks externes, comparateurs et ablations |
| Démonstration de bout en bout puis retours clients | Publication des résultats vérifiables |

Les jalons commerciaux ne sont pas mis en attente par la R&D; seule la promotion d'une capacité expérimentale dans les produits attend sa validation.
