# AURA — apprentissage de constructions conversationnelles en français (16/11/2026)

## Ce qui a réellement été entraîné
Le module `src/native_builtin_dialogue_training.js` présente 168 exemples français synthétiques et annotés au `NativeConstructionLearner`. Il acquiert 14 constructions réutilisables en remplaçant les groupes acteur/verbe/patient par des variables. La procédure comporte un garde-fou : trois acteurs, objets et plusieurs verbes distincts sont nécessaires avant de déclarer une construction acquise. Les formes verbales sont alimentées par la grammaire UD French-GSD préexistante (CC BY-SA 4.0). Aucun poids Qwen n'est utilisé dans cet apprentissage.

La procédure s'exécute localement au premier usage (pas d'API, pas de téléchargement, pas d'apprentissage sur les conversations privées). L'artefact est un modèle de constructions symboliques, **pas un nouveau modèle neuronal ni un LLM entraîné à partir de zéro**. Une option `AURA_NATIVE_CONSTRUCTIONS_ENABLED=false` permet une ablation ; l'option `AURA_NATIVE_CONSTRUCTIONS_FILE` accepte un snapshot administrateur distinct.

## Transfert et audit
Le nouveau test `test/native_dialogue_trained.test.js` réentraîne les constructions de façon reproductible et vérifie 70 combinaisons distinctes de personnes/objets/verbes absentes des démonstrations, un suivi de conversation sur 16 tours, les corrections ainsi que l'abstention sur des faits conditionnels, futurs, négatifs ou ambigus. Sur l'essai local, les 70 questions strictement bornées ont été résolues correctement avec l'entraînement, alors que le parseur non entraîné attribuait l'acteur au mauvais groupe de mots. Le bug qui supprimait `le` dans `lettre` lors du retrait des articles a aussi été corrigé.

Ces tests sont synthétiques et conçus par le développeur. Ils ne démontrent ni conversation ouverte à niveau humain ni compréhension des sous-entendus. Ils ne doivent pas être présentés comme une évaluation indépendante à l'aveugle.

## Choix explicite de l'origine de la parole
`AURA_NATIVE_FRENCH_MODE=native-acquired` **interdit la génération finale par Qwen, Groq ou tout modèle préentraîné dans ExpressionLayer**. AURA ne peut alors répondre que dans son domaine grammatical appris ou avec les actes bornés du noyau ; hors couverture, elle s'abstient. Le mode précédent `local-only` peut encore utiliser Qwen local comme repli pour les demandes qu'AURA ne comprend pas : il ne doit pas être présenté comme « parole entièrement acquise ».

La génération de texte et la synthèse vocale sont distinctes. Une réponse native visible dans un terminal ne prouve pas une sortie sonore sur Hostinger. L'interface et le serveur en production nécessitent encore un déploiement et un essai de conversation réelle.

## Prochaine lacune majeure
Il faudra un corpus français conversationnel plus large et licite, des annotations de discours/intentions, un vrai entraînement statistique ou neuronal progressif, des tests humains tenus à l'écart et des ressources d'inférence compatibles avec l'hébergement. En l'état AURA **n'est pas capable de soutenir une conversation complexe libre** : ce travail pose une fondation mesurée plutôt que de masquer ce fait derrière un autre modèle.
