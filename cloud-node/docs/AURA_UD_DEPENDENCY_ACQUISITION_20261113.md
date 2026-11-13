# AURA — acquisition française à partir des dépendances UD (2026-11-13)

## Ce qui est réellement appris

Le corpus français initial embarqué ne contenait que des formes fléchies et des trigrammes de catégories grammaticales. Désormais l'étape de **construction** prend comme données supervisées les arcs tête–dépendant de UD_French-GSD, et non des patrons d'exemples inventés.

- Source de calcul **exclusivement train** : UD_French-GSD, commit Git officiel
  7110d4660ba088b630eb5928a6a1d35523898e05, SHA blob
  9a15cb3559ca80bb0942909e48e7a752bbcfb026.
- 14 450 phrases d'entraînement, 354 486 unités annotées, 16 000 propositions
  avec sujet identifié, dont 3 899 classées passives par les annotations et
  indices auxiliaries/participes. Les statistiques reflètent cette version du
  corpus, pas celles du lexique plus ancien.
- Artefact dérivé compact (sans phrases du corpus) :
  14 signatures de constructions, 256 combinaisons de relations tête/partie du
  discours/direction et 7 493 formes verbales observées.
- La configuration de grammaire est obtenue en comptant
  les dépendances nsubj, obj, nsubj:pass, obl:agent, aux:pass, ainsi que
  les auxiliaires et marques négatives. Le lien linguistique *nsubj → sujet*
  et *obj → objet* est l'interprétation explicite des étiquettes UD ; les
  orientations et leur fréquence, elles, sont apprises sur le corpus.
- La reconnaissance des propositions reste un **analyseur partiel** :
  on n'a pas entraîné un modèle neuronal de parsing universel ni un LLM.

## Prédictions causales et audit

Le module native_ud_constructions.js lit les signatures apprises et refuse
d'assigner les rôles si la signature ou les relations indispensables
ne disposent pas d'observations suffisantes. Sa sortie est un événement typé
(agent, prédicat, patient, polarité) et contient le nom du motif et le volume
d'observations utilisé. Si l'on enlève l'artefact, la voie de reconnaissance
dépendant des constructions UD ne fonctionne plus, plutôt que d'utiliser
des comptes purement décoratifs.

Ce module est appelé avant l'ancien parseur dans native_semantic_grammar.js.
Il n'a aucun accès à Groq, aux outils d'exécution, à la base de souvenirs
privés ou à des intentions autonomes. L'affirmation sémantique reste
**user-statement-unverified** ; seules les phrases d'une session admises par
le noyau peuvent servir de contexte.

## Évaluation correctement séparée

L'entraînement du corpus UD-GSD utilise **train** uniquement.
L'évaluation utilise **dev**, fixé au blob SHA
9f712559f8d69dc9d7872b13b4fe6cec2d722f8b, et vérifie :

- Un sous-ensemble défini à l'avance de propositions simples contenant un
  unique verbe racine avec sujet et objet ou un agent passif annotés.
- Exactitude du lemme verbal + de l'agent + du patient sur les propositions
  que notre analyseur tente effectivement d'interpréter.
- Taux de refus et nombre de réponses incorrectes. Les trois doivent être
  publiés ensemble. Une fréquence de signatures de 100 % ne signifie pas
  une compréhension de 100 %.
- Aucun texte source ni phrase d'échec n'est exporté dans les rapports.

Workflow : .github/workflows/aura-ud-french-heldout.yml
Script : scripts/evaluate_native_ud_dependencies.mjs

Exécution avec les deux fichiers UD-GSD obtenus légalement :

    node scripts/train_native_ud_dependencies.mjs /chemin/fr_gsd-ud-train.conllu
    node scripts/evaluate_native_ud_dependencies.mjs /chemin/fr_gsd-ud-dev.conllu

Les deux scripts valident les SHA blob du corpus officiel avant de procéder.
Ils ne s'exécutent **jamais** pendant une conversation.

## Limites et garde-fous

- Les constructions complexes, la coreférence, les pronoms, les objets
  antéposés, les propositions enchâssées, les ambiguïtés morphologiques
  et la pragmatique ne sont pas encore bien comprises.
- Le parseur peut se tromper : il ne faut pas présenter « un score de motifs
  appris » comme un résultat d'exactitude. Le benchmark doit décider.
- Les corrections utilisateur sont encore des déclarations attribuées,
  pas des connaissances universelles et pas des autorisations d'action.
- Le mode local est opt-in, pas activé en production par défaut.
  Il ne supprime pas les appels à des fournisseurs d'autres modules AURA.
- Source et dérivés : UD French-GSD, licence CC BY-SA 4.0, attribution :
  https://universaldependencies.org/treebanks/fr_gsd/index.html.
- **Non déployé Hostinger.** Préserver la base MySQL existante ; vérifier
  la CI, le benchmark indépendant et le package avant toute fusion.

La prochaine étape structurante sera un véritable analyseur de dépendances
sur les phrases inédites, évalué par attaches étiquetées (LAS/UAS), puis
une compositionalité événementielle et une résolution des références
à partir de la perception audiovisuelle, sans feindre une conscience.
