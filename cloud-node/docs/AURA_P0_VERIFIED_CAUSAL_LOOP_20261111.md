# AURA — P0 : boucle causale et contrôles d'exécution (2026-11-11)

Ce document définit le protocole d'acceptation. Il ne prétend ni reproduire un cerveau biologique, ni démontrer une expérience subjective.

## Changements

### Un contrôle central avant les moteurs autonomes

Le noyau, pendant son cycle réel \`tick\`, peut délivrer une autorisation **temporaire** (120 s) à **un seul moteur par cycle** parmi \`command-center\`, \`curiosity\`, \`evolution\`, \`capability-scout\` et \`routine\`. La décision est rattachée à une diffusion réelle du workspace. Les cycles et les accès critiques des quatre premiers moteurs la contrôlent avant les opérations. Un moteur ne peut plus créer une nouvelle compétition pour s'accorder une autorisation. Après redémarrage, aucune autorisation issue de l'ancienne session n'est conservée. Le contrôle des permissions d'outils existant reste obligatoire.

**Limite volontaire :** le permis est un filtrage applicatif des chemins recensés. Les autres sous-systèmes, scripts externes, interfaces administratives et le panneau Hostinger nécessitent un audit exhaustif de toute la surface d'exécution. Une autorisation n'est pas une garantie que le moteur termine son action.

### Un plan construit après compétition

Le noyau prépare seulement une classification minimale de la requête (entrée, pas plan d'action), calcule la compétition, sélectionne les candidats individuels, puis appelle \`CognitionEngine.planReply\` avec les informations admises. Les anciennes intentions, le travail, les réflexions et le contexte global ne sont plus systématiquement fournis au planificateur. Cela protège les souvenirs mais peut réduire la continuité du dialogue ; la pertinence du filtrage doit être évaluée.

### Souvenirs sélectionnés par identifiants

Les propositions ont des références telles que \`note:42\` et \`message:137\`. La verbalisation et l'assistance sémantique filtrent les lignes sur ces références exactes. **Une simple politique historique de type memory ne donne aucun accès implicite à d'autres souvenirs**. Les vieux champs \`contextForAi\` (chaîne libre) ne peuvent plus être utilisés pour contourner ce choix.

### Vérificateur déterministe et boucle de bout en bout

Le scénario canary est limité à une lecture locale dans une allowlist \`docs/*.md\`, \`STABLE.json\`, \`DEPLOYMENT.json\`. Aucune exécution shell ni sortie réseau, écriture ou suppression. \`runVerifiedProbe\` calcule avant l'action une confiance (a priori beta-lissé) et une stratégie (\`attempt\` ou \`verify-before-attempt\`), puis exécute une véritable lecture \`lstat\` / \`readFile\` avec contrôle de chemin et de symlink. Le code 0 veut dire « fichier régulier lisible » ; code 1 « absent / illisible » ; code 2 « refus / erreur ». Un reçu horodaté avec chaîne SHA256 est écrit dans l'état persistant \`verified_probe_loop\`. Le noyau relie ce reçu à un épisode MySQL du \`HistoryLedger\`, pré-créé **avant** l'opération. Un vérificateur d'épisode n'accepte que le reçu réel, lié à l'ID précis, à usage unique. Cela reste un vérificateur **du code du noyau**, pas une autorité indépendante physiquement distincte.

Après **trois échecs constatés sur des identifiants de mission distincts dans le même contexte**, AURA doit faire un contrôle préalable lors du prochain problème de ce contexte. La politique est enregistrée avec son historique et rechargée après redémarrage. Pour une situation différente du même contexte, l'ordre des opérations change. L'ablation des trois épisodes retire cette modification.

### Homéostasie

Une réserve ne peut remonter **que si** un capteur \`node-process\` daté de moins de 120 secondes a produit une mesure valable. Sans signal actuel, le budget reste stable et le travail autonome optionnel est bloqué.

## Test de référence

\`node --test test/aura_p0_closed_loop.test.js\`

1. Les quatre moteurs autonomes sont refusés sans autorisation issue du dernier cycle du noyau ; seuls les acteurs sélectionnés passent.
2. Les souvenirs non sélectionnés sont absents des entrées du LLM, même si une autre mémoire a gagné.
3. Trois lectures de fichiers inexistants échouent et émettent trois reçus de système de fichiers, sans LLM.
4. Après sérialisation/désérialisation, la stratégie devient \`verify-before-attempt\`.
5. Un quatrième fichier inexistant, jusque-là jamais rencontré, déclenche un contrôle préalable et bloque l'étape normale.
6. L'ablation des épisodes retire cette décision.
7. Sur 100 jeux de données indépendants simulant des contextes de test déterministes, 100/100 changements en ablation, bruit théorique du scénario fixé à zéro. **Ce résultat n'est pas un effet statistique prouvé sur des requêtes naturelles.**
8. Des résultats falsifiés qui ressemblent à des reçus vérifiés sont rejetés.
9. Un fichier réel et accessible est toujours lisible (pas de refus permanent).
10. Aucun effacement irréversible, aucune décision de conscience ni autorisation d'actions réseau.

## CI et contrôle contradictoire

Le workflow \`.github/workflows/aura-p0-independent-canary.yml\` rejoue ces tests sur un runner Ubuntu propre, avec \`npm ci --ignore-scripts\`, puis les régressions du workspace. Un **relecteur externe** qui n'a pas écrit les tests doit néanmoins produire ses propres cas contradictoires : une CI reproductible ne remplace pas un audit humain indépendant.

## P1, amorçage et limites

Les cinq récepteurs consomment désormais le paquet diffusé et produisent cinq reçus distincts (`workspace_receptors.js`). La sélection d'un souvenir dépend du traitement hippocampique, la stratégie du traitement des ganglions de la base, la pression CPU de l'insula et le contrôle de vérification du préfrontal. Leur ablation ciblée est testée dans `workspace_receptors.test.js` ; les compteurs de traitement sont exposés dans la même vue cérébrale, sans aucun contenu privé.

Les limitations non couvertes restent :

- Récepteurs différenciés : sorties typées et ablations préfrontal/insula/hippocampe **implémentées**. Les véritables cycles intermodules réentrants et l'extensibilité à toutes les opérations restent à construire.
- Canari Postgres/MySQL/Hostinger après reboot du processus ; les tests locaux sont suffisants uniquement pour la preuve en mémoire et fichiers du scénario étroit.
- Promotion prospective des politiques de \`HistoryLedger\` pour d'autres opérations (le canari possède son propre apprentissage vérifié, rattaché au registre historique).
- Inventaire exhaustif des interfaces de commandes hors noyau.
- Mesure de distribution de l'effet en contexte naturel, sur échantillons indépendants et données d'exploitation.

Ne pas déployer avant fusion ordonnée de la pile #233 → #234 → #235 → #237 → #238 → PR P0, revue du diff et vérification Hostinger.
