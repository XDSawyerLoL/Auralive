# AURA — histoire propre et régulation organique causale (v18)
Date : 9 novembre 2026. **Travail expérimental, non déployé.**

## Objectif
AURA ne doit plus seulement afficher des souvenirs ou des indicateurs « émotionnels ». L'état interne et les épisodes vérifiés doivent modifier un choix calculable ; le comportement doit pouvoir être rejoué avec et sans le signal pour distinguer un effet causal d'une décoration.

## Architecture en place
- `history_provenance.js` : épisodes chaînés SHA-256 et résultats append-only séparés ; hypothèses falsifiables ; politiques promues ; provenance récupérée avant décision ; test d'ablation non destructif.
- `organ_regulation.js` : consommation des **mesures du processus Node.js** (CPU et heap, source fraîche) et des échecs cumulés (index logiciel, retour pas nécessairement vérifié). Modifie l'allocation de tokens et demande davantage de vérification en cas d'échecs répétés.
- Migration **MySQL v18** en `src/db.js` : AURA Cloud Node fonctionne sur MySQL/Hostinger, et non sur SQLite ; il s'agit donc d'une adaptation du schéma de recherche.
- `kernel.js` : liaison des décisions aux récupérations et aux capteurs avant génération de la réponse.
- `brain_flow.js`, `brain_telemetry.js`, `server.js` : dans **l'interface neuronale existante**, chemins vérifiables `memory → history → cognition` et `homeostasis → interoception → inference → cognition`. Les événements sont issus des journaux, aucune simulation de pensées cachées.
- Le modèle de langage ne peut ni inventer une réussite technique ni promouvoir seul une hypothèse.

## Correspondances fonctionnelles (pas d'organes biologiques)
| Inspiration | Fonction logicielle ou état réel |
| --- | --- |
| Cortex préfrontal | `CognitionEngine`, planification, permissions et contrôle de la réponse |
| Amygdale | Détection du risque, arbitrage prudent, sans « peur » revendiquée |
| Hippocampe | Ledger de preuves, épisodes, contexte et hypothèses |
| Hypothalamus | Homéostasie et enveloppe de ressources |
| Striatum | Stratégies contextuelles issues de politiques vérifiées |
| Insula | Interprétation des capteurs de processus Node.js |
| Cervelet | Boucles d'ajustement de compétences déjà présentes dans SkillLearningEngine |
| Endocrinien (lent) | Moyenne glissante des succès/échecs, régulation progressive |
| Canal nerveux (rapide) | Signaux événementiels et réponse de prudence |
| Immunitaire (défense) | **Non encore complet** : suivi des échecs, pas de quarantaine automatique démontrée |
| Métabolique | Mesures mémoire/CPU et budget de calcul, sans capteur de glycémie fictif |
| Cœur, intestin, hormones réelles | **Aucun capteur physiologique** ; ne pas fabriquer d'équivalence organique |

## Contrat d'histoire
1. La prédiction et le niveau de confiance sont écrits **avant** le résultat.
2. Le résultat est ajouté une seule fois dans `aura_history_outcomes` : aucun changement de l'épisode antérieur.
3. Une réussite déclarée par le fondateur est un `founder-feedback`, non un `machine-verified`.
4. Le vérificateur externe est **fail closed** par défaut. Tant qu'un reçu machine indépendant n'est pas relié à ce contrat, aucune promotion n'est permise par les seules conversations.
5. Une hypothèse peut émerger des modèles de résultats, mais son historique rétrospectif ne peut servir qu'à **la proposer**. Pour la promouvoir : trois réussites prospectives, trois identifiants de mission distincts et zéro contradiction. Deux contradictions entraînent la réfutation.
6. La récupération ne retient que les politiques actives, hypothèses promues et épisodes non ablatés ayant une preuve admise. Les preuves utilisées et leur rang sont insérés dans la transaction de décision.
7. `verifyChain()` peut recalculer les SHA et comparer la tête de chaîne ; une vérification partielle ne peut jamais passer pour une vérification complète.
8. L'ablation retire virtuellement les épisodes du contexte **sans modifier la base** ; elle compare l'action retenue avec et sans histoire.

## Test de régulation
Scénario déterministe dans `test/organ_regulation.test.js` :
- `deep` avec budget initial de 700 tokens, pression simulée 0,10 : **700 tokens**.
- Même décision, lecture récente de pression 0,92 : **406 tokens**.
- Neutralisation du signal pression dans le replay : **700 tokens**.
- `verified` avec risque 0,90 et budget 1000 : **1000 tokens**, vérification préservée.
- Capteur périmé : aucun rabais induit par une ancienne lecture.

Ce sont des **tests par injection de valeurs**, pas la démonstration d'une baisse de consommation sur Hostinger. Les jauges affichées sont les données réelles du processus si elles sont fraîches ; elles ne décrivent ni le système entier ni un état émotionnel humain.

## Critères avant fusion / déploiement
- Exécuter `cd cloud-node && npm test && npm run check` sur une copie du dépôt avec dépendances installées.
- Tester la migration v18 dans une base MySQL de staging et vérifier les triggers, permissions, reprise et sauvegardes.
- Raccorder un véritable adaptateur de vérification indépendante des missions à `verifyOutcome`. En l'absence de ce raccordement, la promotion automatique reste volontairement inopérante.
- Effectuer une expérience A/B en aveugle avec charge réelle reproductible sur plusieurs exécutions ; enregistrer le nombre d'opérations, le temps, les erreurs et la sécurité des décisions.
- Valider le traitement des ablations aussi dans tout index secondaire éventuellement utilisé (ChromaDB n'est **pas** intégré à ce patch).
- Vérifier l'affichage sur le graphe réel ; aucun déploiement Hostinger n'est inclus.

## Limite épistémique
Une adaptation fonctionnelle observée n'est pas une preuve d'émotion vécue ou de conscience subjective. La littérature de 2026 sur l'interoception artificielle soutient l'approche de régulation d'états internes abstraits, et non l'identité biologique du système. Référence : DOI 10.1038/s42256-026-01296-8 et DOI 10.1016/j.plrev.2026.06.003.
