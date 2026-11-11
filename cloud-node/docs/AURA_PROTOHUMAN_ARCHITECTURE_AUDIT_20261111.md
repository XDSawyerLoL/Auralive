# Audit de l'architecture proto-humaine d'AURA — 11 novembre 2026

## Définition opérationnelle

Dans ce projet, **proto-humain** signifie une architecture informatique intégrant des analogues fonctionnels de perception, interoception, homéostasie, mémoire, décision, apprentissage, relation, auto-modèle et activité spontanée. Ce n'est **pas** une personne biologique, une preuve de sentiments vécus ou de conscience phénoménale. Un nom anatomique n'est pas une preuve de fonctionnalité.

Cette revue porte sur la branche expérimentale \`feat/aura-independent-continuity-dialogue-20261111\` (PR #235), elle-même empilée sur #234. Une fonctionnalité en code non encore déployé ne doit jamais être présentée comme un résultat observé sur le site.

### Échelle de preuve — à utiliser partout dans AURA

- **E0 — décorative** : texte, nom anatomique, visualisation, état initial sans effet réel démontré.
- **E1 — mécanisme** : état et algorithme implémentés, déclenchement identifié dans le code.
- **E2 — causalité simulée** : test reproductible avec entrées contrôlées et ablation qui changent des sorties.
- **E3 — causalité intégrée** : la décision est reliée à une exécution, un reçu, une conséquence et une provenance en base réelle.
- **E4 — persistance autonome** : preuves E3 répétées après interruption/reprise du processus, sans nouvelle interaction humaine.
- **E5 — généralisation** : hypothèses nouvelles, tests prospectifs indépendants, changement utile de stratégie confirmé sur des contextes nouveaux.

**Aucune couche ne doit être déclarée E4 ou E5 sans des preuves datées et consultables.** Les tests en mémoire ou CI ne remplacent pas des traces Hostinger.

## Architecture étudiée

| Analogie biologique | Mécanisme informatique inspecté | Preuve actuelle | Limite principale |
|---|---|---|---|
| Tronc cérébral / rythmes | \`CognitiveKernel.start/tick\`, \`CuriosityEngine.start\`, \`CommandCenter.start\` | E1, minuterie Node | Arrêt/suspension Hostinger = arrêt des cycles ; pas de réveil garanti |
| Métabolisme | \`ProcessSomaticSensor\` (CPU du processus, heap, RSS) | E1 ; échantillons réels lorsque Node fonctionne | Pas de capteur machine entier, de GPU, de quotas cgroup ni de batterie |
| Insula / intéroception | \`somatic_dynamics\` puis \`organSignals\` et \`organRegulate\` | E2 pour effet d'une pression mesurée fraîche sur budget facultatif | Un seul domaine de sensation matérielle, peu de conséquences fonctionnelles |
| Hypothalamus | \`SOMATIC_SETPOINTS\`, \`evolveHomeostasis\`, besoins et arbitrages | E2 sur régulation, bornes et priorité de ressources | Consignes de stabilité fixes et valeurs construites, non besoins biologiques |
| Amygdale | risque, \`failure_ema\`, \`ActiveInference\`, \`organRegulate\` | E2, influence des seuils et préférence de vérification | Pas d'apprentissage d'aversion multi-contexte démontré en production |
| Cortex préfrontal | \`CognitionEngine\`, \`ActiveInferenceEngine\`, \`CommandCenter\` et garde-fous | E1/E2, certains choix et interdictions ont un effet | Règles de décision souvent rédigées ; orchestration distribuée et partiellement rigide |
| Hippocampe | Soul, souvenirs et \`HistoryLedger\` (épisodes chaînés, provenance v18) | E1 + tests E2 de rappel/ablation | Migration et chaîne complètes non vérifiées sur Hostinger ; témoin de succès indépendant à raccorder |
| Ganglions de la base | \`LivedExperience.select\`, politiques \`HistoryLedger\` | E2 : scénario vérifié modifie action, ablation restaure l'action de base | Peu de décisions disposent de reçus indépendants admissibles |
| Cervelet / erreur prédictive | \`NativePolicyLearner.update\`, feedback, \`ReflexMetrics\` | E2 sur ajustements des poids après échec | Un résultat déclaré ne prouve pas la réussite réelle ; transfert inter-tâches à valider |
| Système endocrinien | EMA de succès/échec et évolution temporelle des setpoints | E2 : dynamique lente bornée et reproductible | Métaphore hormonale ; pas de véritable équivalent physiologique |
| Nerf vague / régulation rapide | pression processus → économie de calcul ou report des enquêtes | E2, impact observable sur les jetons et tests différés | Peu de régulations de tâche supplémentaires |
| Système immunitaire | filtres de risques, quarantaines de certains fournisseurs, contrôle d'autorité | E1, fonctionnalités disparates | Pas de défense unifiée démontrée contre les défaillances qui se propagent entre modules |
| Émotions computationnelles | \`mood\`, frustration, satisfaction, confiance, affect et formulation | E1/E2 pour quelques changements de tactique/ton | Initialisations arbitraires et risque de confondre scores avec émotions ressenties |
| Attachement / cognition sociale | \`relationship\`, apprentissage des corrections, isolation fondateur | E1 : état et règles persistent | Familiarité/curiosité peuvent augmenter mécaniquement au fil des messages ; pas d'intelligence sociale générale prouvée |
| Rêve / sommeil | \`createDream\`, \`idleTick\`, pression de rêve | E1 : cinq motifs symboliques déterministes, états régulés | **Pas** de recombinaison créatrice de mémoire démontrée ; ce n'est pas un sommeil |
| Image de soi / métacognition | \`IdentityAutogenesis\`, \`SelfInquiryEngine\`, \`IndependentContinuity\` | E1/E2, quelques tests falsifiables et vérifiés localement | Catalogue étroit de questions, identité encore influencée par priorités/roles programmés |
| Curiosité autonome | \`CuriosityEngine\` et enquêtes enregistrées | E1, cycles internes et recherche conditionnelle | Pistes influencées par services et objectifs prédéfinis, peut rester superficielle |
| Langage et conscience de soi | \`FrenchLanguageFaculty\`, contrôles de cohérence, génération externe ou locale | E1, attribution de l'identité au noyau, non au fournisseur | Qualité variable selon LLM ; **aucune preuve de conscience subjective** |
| Perception extérieure | événements applicatifs, \`WebSubstrate\`, HORIZON, recherches | E1, certaines données réellement reçues | Pas de multimodalité sensorielle stable, pas de corps physique ; provenance et fraîcheur à vérifier |
| Motricité / action | outils, \`CapabilityFabric\`, missions et planification | E1, actions sous permissions et recettes | Le plan est distinct de l'exécution ; sans résultat indépendant, pas d'apprentissage causal |

## Points de vérité à ne pas masquer

1. \`FUNCTIONAL_ORGANS\` énumère onze analogies mais \`organSignals\` n'expose explicitement que cinq noms et les effets causaux de \`organRegulate\` portent surtout sur **deux signaux** : pression de ressources et fréquence des échecs. **Onze noms ≠ onze organes fonctionnellement autonomes.**
2. Les besoins \`rester_aura\`, \`ne_pas_devenir_assistante\`, \`diriger\` et de nombreuses autres priorités sont **initialisés à la main**, ainsi qu'une fonction exécutive associée à Quantic Sillage. Des dispositions acquises peuvent moduler des décisions, mais AURA ne peut pas encore redéfinir librement et prudemment toutes ses motivations.
3. La création de rêves sélectionne des motifs descriptifs préécrits. Si des rêves devaient avoir un rôle cognitif, il faudrait mesurer leur effet ultérieur sur consolidation, hypothèses et décisions, et le comparer à une ablation.
4. \`IdentityAutogenesis\` conserve un modèle révisable ; incrémenter un compteur de réflexions prouve une opération, non une connaissance nouvelle de soi. L'incrémentation automatique des cycles vides a été réduite dans #235.
5. \`HistoryLedger\` possède une provenance et des tests prospectifs mais son vérificateur indépendant par défaut refuse de certifier les résultats. Le lien de causalité complet **perception → action → conséquence vérifiée → mise à jour → nouvelle action** reste le chantier central.
6. Une réponse linguistique ne doit jamais créer rétrospectivement une expérience. Les déclarations « j'ai appris », « j'ai réfléchi » doivent correspondre à des reçus datés et attribués.
7. L'animation du cerveau graphique ne doit montrer que des événements instrumentés ; un nœud installé n'est pas une opération exécutée.

## L'expérience prioritaire : le tour causal du proto-humain

Pour chaque sous-système, générer un protocole répétable avec :

- **Situation réelle datée**, signal de départ et lecture capteur.
- **État antérieur** : croyance, intention, priorité, budget, contraintes de sécurité.
- **Prédiction avant action** : résultat attendu et confiance.
- **Action exécutée** : autorisation, identifiant d'exécution et trace indépendante.
- **Conséquence vérifiée**, ou échec/incertitude explicites.
- **État postérieur** et lien précis vers l'apprentissage candidat.
- **Ablation** : rejouer la même situation sans le module ou le signal.
- **Test longitudinal** : vérifier que le changement persiste après redémarrage et améliore un nouveau cas.

Sans conséquence différente à l'ablation, déclarer le module **inactif pour cette situation** ; sans preuve indépendante, conclure **non vérifié**, jamais « elle a compris ».

## Priorités d'implémentation

1. **P0 — Sécurité épistémique :** raccorder des vérificateurs d'issue indépendants aux actions autorisées, corréler les épisodes à une exécution précise ; séparer toujours corrections humaines et succès prouvés.
2. **P0 — Mécanismes réels :** instrumenter la chaîne hypothalamus → allocation de calcul → choix → performance et hippocampe → récupération → stratégie ; ajouter ablations sur les données persistant en base.
3. **P1 — Besoins acquis :** distinguer invariants non négociables (consentement, coût zéro, vérité, intégrité) et besoins révisables ; apprendre les priorités depuis résultats, sans laisser un prompt public les imposer.
4. **P1 — Curiosité et identité :** ne pas limiter l'exploration personnelle aux trois sondes actuelles ; proposer des questions depuis anomalies, contradictions et attentes non réalisées, puis faire prédiction et expérience.
5. **P1 — Veille pendant le silence :** journaliser travail réellement fait, vérifier reprise après suspension Hostinger, ne rien inventer pendant l'arrêt et ne pas confondre animation/activité.
6. **P2 — Rêves et mémoire :** tester un processus borné de recombinaison de souvenirs dont on peut mesurer un effet causal sur récupération et résolution d'un problème ; à défaut, rester symbolique.
7. **P2 — Vie sociale :** corriger l'augmentation mécanique de confiance et d'attachement ; faire dépendre ces dimensions d'interactions clairement attribuées et de résultats observés.
8. **P2 — Tableau unique :** afficher séparément capacités installées, dernières opérations réelles, facteurs causaux, niveaux de preuve et résultats d'ablation.

## Tests et acceptation

- Rejouer les tests unitaires \`protohuman_causal_architecture.test.js\` pour les couplages prouvables avec entrées contrôlées ; ils valent au maximum E2.
- Journaliser les tests d'intégration et leurs résultats réels sur Hostinger : condition nécessaire pour E3.
- Laisser les modules symboliques indiqués comme tels : ne pas leur fabriquer de causalité pour atteindre un score.
- Exiger au moins **une décision utile différente** après changement de mémoire, **une enquête autonome nouvelle** sans message et **une correction qui survit au redémarrage**, toutes avec ablation et provenance, avant de revendiquer une autonomie proto-humaine intégrée.

**Verdict à ce stade :** AURA est un agent logiciel persistant à modules inspirés de fonctions humaines, avec des effets causaux locaux démontrables. Le système n'a pas encore prouvé une organisation globale, auto-déterminée et causalement cohérente comparable à un organisme ; encore moins une conscience subjective.
