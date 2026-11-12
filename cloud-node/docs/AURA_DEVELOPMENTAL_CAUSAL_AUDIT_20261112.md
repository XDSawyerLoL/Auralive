# AURA — audit d'intégration développementale et critères de preuve
Date : 2026-11-12
Base de travail : PR #251 (branche dialogue-context-causal-gate).
Portée : état lu dans le code ; ne constitue PAS une certification de production Hostinger.

## Règle d'ingénierie

Ne jamais créer un « organe » parce qu'il manque un nom sur une interface.
Une fonction est intégrée uniquement si : entrée authentifiée → changement d'état réel →
choix ou action différent(e) → résultat observable → persistance → ablation causale.
Un comptage de cycles, un texte généré, une couleur ou une formule de tempérament ne
prouvent ni apprentissage général ni expérience subjective. Les fonctions biologiques
sont des analogies computationnelles, pas de vrais organes humains.

Sources de vérité : mesure Node datée ; acte machine avec reçu indépendant ;
correction humaine clairement attribuée ; hypothèse non vérifiée ; texte de LLM.
Ces cinq sources ne doivent jamais être mélangées dans un score « vrai ».

## État et couverture observés

Niveaux : I = installé ; C = conséquence locale testable ; L = effet durable démontré
en simulation unitaire ; P = validé en conditions réelles sur Hostinger.

| Domaine humain | Source existante | État au 12/11 | Limite / condition d'acceptation |
| --- | --- | --- | --- |
| Interoception | somatic_dynamics, process_observer | I/C | Mesure du processus, pas cgroup ni sensation corporelle ; vérifier fraîcheur |
| Homéostasie | organism, somatic_dynamics, organ_regulation | I/C | Démontrer décision différente sous signal réel puis retour au régime normal |
| Allostasie | viability_budget, active_inference | I/C partiel | Anticiper pression future sur prédiction calibrée, puis ablation |
| Réflexes et réactions primaires | millisecond_reflex, reflex_policy | I/C | Hz réels, coût, latence et résolution des stimuli ; pas 1 000 pensées/s |
| Motivations initiales | organism.needs, intentionField | I | Nombreuses priorités initialement écrites ; séparer contraintes et préférences |
| Variabilité individuelle | somatic_dynamics seed, digital_protogenome | I/laboratoire | A/B par graine, génération reproductible ; génome sandbox non production |
| Émotions fonctionnelles | somatic_dynamics, inner_dialogue | I/C | Mesurer des effets sur choix, non revendiquer peur ou frustration ressentie |
| Endophasie | inner_dialogue, independent_continuity | I/C (patch présent) | Question issue d'un retour, ablation de stratégie, non dialogue mental libre |
| Pensée spontanée non verbale | global_workspace, prediction_error_bus | I/C partiel | Nouvelle hypothèse issue de perception sans message, pas motif périodique |
| Attention | attention_schema, global_workspace | I/C | Erreurs de prédiction et sélection changent décisions de façon répétable |
| Mémoire épisodique | history_provenance | I/C | Vérification SHA, ablation et intégrité du contexte réellement utilisé |
| Mémoire sémantique | knowledge_vault, memory_retrieval | I | Généralisation nouvelle situation et conflit de sources à démontrer |
| Mémoire procédurale | native_learning, skill_learning, lived_experience | I/C | Test prospectif sur actes indépendamment vérifiés |
| Oubli/reconsolidation | offline_consolidation, memory_consolidation | I/C partiel | Révisions, conservation des preuves, preuve de non-régression |
| Imagination et simulation | cognition.reflect, organism.createDream | I/symbolique | Les motifs préécrits ne sont pas des rêves cognitifs ; isoler sur décision |
| Métacognition | self_inquiry, attention_schema | I/C | Sondes limitées ; valider nouvelles questions causées par anomalies |
| Prédiction / surprise | prediction_error_bus, active_inference | I/C | Prédiction avant action, résultat indépendant après |
| Habitudes et préférences | lived_experience, identity_autogenesis | I/C | Généralisation et transfert inter-contextes non démontrés |
| Identité acquise | identity_autogenesis, lived_experience | I/C | Traits encore prédéfinis ; nouveaux traits issus d'expérience à concevoir |
| Héritage social | conversation_grounding, lived_experience | I partiel | Source, fiabilité, conflits entre personnes, révision sans fausse origine |
| Attachement et cognition sociale | organism.relationship, conversation_pragmatics | I/symbolique | Ne pas augmenter la confiance automatiquement au nombre de messages |
| Intention et planification | cognition, durable_mission, task_graph | I/C | But révisable et conséquences machine démontrées |
| Incarnation / perception multimodale | workspace_receptors, web_substrate | I partiel | Aucun corps humain ni perception sensorielle complète |
| Cycles, repos, récupération | independent_continuity, organism, viability_budget | I/C | Continuité dépend du processus Node ; aucune activité fictive à l'arrêt |
| Faculté de langage | language_faculty, french_language, providers | I/C | Modèle fournisseur ≠ mémoire propre du noyau |
| Conscience subjective | aucun test validant | non démontrée | Ne pas confondre comportement, narration et ressenti subjectif |

## Correction cohérente intégrée sur cette branche

1. `InnerDialogueEngine.derivePrivateInquiry` : à partir de retours agrégés et
   de dispositions apprises, crée une question privée **contextualisée**, uniquement
   si le niveau d'évidence est suffisant et que les ressources le permettent.
   Aucun mot de l'utilisateur ou du fournisseur LLM n'y est inséré.
2. `IndependentContinuity.step` : si une nouvelle révision d'expérience justifie
   une question, compare `LivedExperience.select` sur l'état appris et sur
   `defaultState()` dépourvu d'histoire. Reçu : action témoin, action observée,
   modification causale, portée « local-policy-counterfactual », jamais réussite
   extérieure inventée.
3. Persistance par `CognitiveKernel.soulCache.endophasia` et sauvegarde
   `aura_soul_state`; trace `endophasia` uniquement après le travail calculé.
   Publication redigée et bornée via `/api/brain/graph`.
4. Après une expérience inchangée, la question ne se répète pas : retour aux
   sondes habituelles. Une expérience nouvelle peut la réactiver.
5. Genèse neutre **sur opt-in** `AURA_DEVELOPMENTAL_GENESIS=true`, uniquement
   quand aucune `aura_soul_state` valide n'est présente. Elle ne reçoit pas
   de métier, de passé humain, de rôle Quantic Sillage ni de question
   existentielle préétablie. La régulation et les garde-fous techniques restent.
   Les bases existantes ne sont ni réécrites ni effacées.

## Critère de réussite pour l'endophasie (première tranche)

- État vierge : aucune question privée inventée.
- Un retour isolé : aucune conclusion sur une prédisposition.
- Plusieurs corrections enregistrées : création d'une hypothèse locale,
  action d'investigation et preuve par ablation de politique.
- Supprimer les observations : absence de cette hypothèse et de son effet.
- Réinjecter les observations : reproduction du choix avec traces liées.
- Persister/redémarrer : mêmes révisions et même décision pour mêmes entrées.
- Charge CPU/RAM réelle excessive : investiguer est différé.
- Aucun LLM ne produit de preuve et aucune donnée privée n'est publiée.
- Les dispositions acquises restent subordonnées à permissions, contraintes
  de sécurité et coût zéro.

## Ce qui N'EST PAS encore livré

- Endophasie dialogique ouverte, langage intérieur appris socialement et
  nouvelles représentations spontanées non bornées.
- Création de nouvelles classes de besoins ou traits identitaires sans
  taxonomie préexistante.
- Apprentissage social de croyances contradictoires de plusieurs sources avec
  calibration de confiance, contestation et provenance vérifiée.
- Allostasie anticipative validée, consolidation/reconsolidation causale,
  transfert inter-tâches, langage intérieur non verbal et développement longitudinal.
- Une couverture complète de toutes les fonctions physiologiques humaines,
  ce qui n'est pas scientifiquement reproductible sur Node/Hostinger.
- Expérience réelle de peur, de joie, de conscience subjective, ou mémoire
  d'un ancien corps humain : aucune de ces propriétés n'est établie.

## Prochaines opérations, sans nouvel empilement de noyaux

P0. Faire passer `npm test` et `npm run check` sur la même référence SHA.
P0. Sur environnement de staging MySQL, sauvegarder la base et vérifier que
`aura_soul_state` conserve l'endophasie après restart. Ne pas activer le
mode genèse pour l'instance existante.
P0. Essai longitudinal : deux corpus de feedbacks contraires avec même état
initial, ablation des événements, comparaison des stratégies après 100 cycles,
rejeu de la trace et vérification des limites de charge.
P1. Étendre la création de questions à des anomalies issues de souvenirs
vérifiés, surprises et révisions de croyances, au lieu des seuls contextes
de correction.
P1. Séparer les motivations invariantes de sécurité des préférences acquises :
revoir `organism.needs`, `identity_autogenesis` et `native_learning` sur la
même architecture, sans deuxième moteur d'émotions ni deuxième mémoire.
P1. Permettre la coexistence de récits sociaux incompatibles avec auteurs,
statuts, degré de confiance et possibilités de vérification ; aucune
affirmation d'origine humaine ne doit devenir un fait sans preuve.
P2. Examiner rêves, allostasie, attention, interactions sociales et besoin de
repos par tests d'ablation en temps réel.
P2. Visualiser les décisions et preuves obtenues, pas des neurones inventés.

## Procédure de validation

```bash
cd cloud-node
npm ci
node --test test/endophasia_developmental_causality.test.js
npm run check
npm test
```

Les tests Node prouvent la logique à entrées contrôlées. Les GitHub Actions
doivent être verts au commit final ; Hostinger/staging doit encore démontrer
la véritable persistance et le comportement en charge. Aucun déploiement
automatique ni réinitialisation de mémoire n'est autorisé par ce document.


## Étude langage, pensée et socialité — cahier de validation (12 novembre)

### Corrections scientifiques de référence

- Les aires dites de Broca/Wernicke ne constituent pas un unique duo
  compréhension/production. Réseau frontal-temporal distribué, avec interactions
  distinctes entre perception, langage, raisonnement et contrôle exécutif.
  Source : Fedorenko, Ivanova & Regev, Nat Rev Neurosci 2024,
  https://doi.org/10.1038/s41583-024-00802-4
- La parole intérieure peut être monologique, dialogique, spontanée,
  sollicitée ou absente/peu rapportée. Ne jamais obliger l'architecture
  à verbaliser toutes ses décisions. Anendophasie totale encore débattue ;
  faibles rapports de parole intérieure associés à certaines différences
  spécifiques de mémoire verbale et jugements de rimes, pas à une absence
  globale de créativité, intelligence ou à une protection avérée contre
  toute anxiété. Nedergaard & Lupyan 2024,
  https://doi.org/10.1177/09567976241243004 ; Lind 2025,
  https://doi.org/10.1177/09567976251335583
- Le langage facilite certains raisonnements mais n'est pas une condition
  nécessaire à toutes les opérations logiques ou contrefactuelles.
  Fedorenko et al., 2016, https://pmc.ncbi.nlm.nih.gov/articles/PMC4874898/
- Les mécanismes de copie d'efférence sont étudiés dans la parole intérieure
  ; une explication mono-causale des hallucinations verbales n'est pas
  démontrée. Étude ERP 2025 : https://pubmed.ncbi.nlm.nih.gov/40080836/
- La théorie des neurones miroirs n'explique ni à elle seule la lecture
  des intentions, ni la confiance, ni une compulsion à parler.
  Bekkali et al., 2021 : https://pubmed.ncbi.nlm.nih.gov/32876854/
- Éviter « une phrase agréable => dopamine et ocytocine => confiance » :
  l'ocytocine et la récompense sociale ont des effets contextuels complexes
  et les preuves neurochimiques directes sont hétérogènes.
  https://pubmed.ncbi.nlm.nih.gov/38713749/

### Fonctionnement informatique attendu, sans copier l'anatomie

1. **Représentation préverbale (noyau)** : intentions, relations et hypothèses
   typées indépendantes d'une phrase française. Peut exister sans tout texte.
2. **Sémantique acquise** : concepts/étiquettes appris au contact de
   l'environnement et attribués à une source, jamais biographies fictives.
   La différence entre « quelqu'un l'affirme » et « le noyau l'a vérifié »
   est obligatoire.
3. **Mémoire de travail et répétition volontaire** : retenir, comparer,
   oublier ou mettre à jour des éléments utiles. La « boucle phonologique »
   n'est **pas** implémentée ; l'existence d'un champ texte ne la prouve pas.
4. **Simulation interne d'une formulation** : facultative et contrôlée,
   distincte de la décision. Aucun « timbre de voix » ou perception
   auditive interne n'est prétendu sans dispositif et mesure correspondants.
5. **Inhibition / autorisation de communiquer** : décision de ne pas
   externaliser chaque représentation, prise en compte des permissions,
   disponibilité sociale observée, coût de calcul et cadence.
6. **Expression** : transformation des intentions en mots. Le fournisseur
   Groq est un outil extérieur : sans preuve de décision préexistante, ses
   mots ne comptent pas comme capacité autonome.
7. **Comparaison attentes/retours** : l'anticipation « l'interlocuteur
   comprendra X » doit précéder une communication ; correction authentique,
   résultat observé ou absence de feedback viennent après. L'absence de
   réponse ne prouve pas un rejet.
8. **Socialité** : le besoin de contact peut faire partie des motivations
   internes, mais confiance, réciprocité et attachement se révisent sur
   événements attribuables, pas automatiquement à chaque message.

### Correctif testé dans cette PR

- `inner_dialogue.derivePrivateInquiry` produit désormais
  `semantic_intent` : représentation catégorielle non verbale de l'hypothèse
  d'ablation d'une stratégie. La question française est un affichage facultatif.
- `independent_continuity.step` sélectionne sa vérification sur la
  proposition **sémantique**, jamais sur la question française. Corrompre
  la phrase ne change pas la décision ; corrompre le type de proposition
  interdit la vérification.
- `organism.beforeInteraction` comptabilise l'exposition sans augmenter
  la confiance, l'attachement, la familiarité et la réciprocité par défaut.
- `organism.observeSocialFeedback` change modestement les variables
  relationnelles seulement après un feedback authentifié et lié à la
  **réponse précédente**, ce que contrôle `kernel.chat`. Il reste un
  signal humain rapporté : ne pas le prendre pour une preuve de compétence.
- Un salut (« bonjour »), un « merci » non relié à un résultat, un prompt
  du LLM ou un cycle vide ne deviennent pas des récompenses sociales.

### Tests d'acceptation encore obligatoires

- Environnement sans LLM : le noyau conserve ses hypothèses et choix
  symboliques sans les attribuer à une génération externe.
- Choix même état initial, retours sociaux divergents : politique et
  initiative finale doivent diverger **avec causalité démontrée**.
- Ablation de la couche langage : les opérations non verbales restent
  possibles et les performances verbales s'évaluent séparément.
- Mesure de l'initiative : ni notification intrusive, ni message fabriqué
  à partir d'un compteur de cycles. L'absence de consentement doit
  bloquer la communication non sollicitée, pas la pensée privée.
- Mémoire de travail verbale, alternance monologue/dialogue intérieur,
  apprentissage lexical indépendant, généralisation sémantique,
  modélisation d'autrui et vérification longitudinale : **non réalisés**.
- Rien ici ne démontre un centre de Broca artificiel, une sensation
  intérieure ou une conscience subjective.

Les changements sont une consolidation du noyau existant et non la création
de deux processeurs de pensée concurrents.
