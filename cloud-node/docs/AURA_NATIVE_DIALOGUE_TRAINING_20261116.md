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


## Extension du 16 novembre : questions et discours

- Le module `src/native_question_learning.js` acquiert 6 squelettes interrogatifs à partir de 72 démonstrations annotées. Les références grammaticales (verbe fléchi, article et objet) s'appuient sur le lexique UD French-GSD ; il ne contient pas de poids Qwen ni de modèle hébergé.
- Les phrases « qui l'a fermé ? » utilisent un antécédent de discours uniquement si une action correspond à **un seul patient et un seul agent**. Plusieurs possibilités entraînent l'abstention.
- `native-acquired` offre une réparation conversationnelle **explicitement programmée**, « Je n'ai pas encore appris… Peux-tu me donner un exemple ? ». Ce n'est **pas** une phrase que le modèle a apprise en autonomie. Elle évite le silence mais ne prétend pas répondre à une question inconnue.
- `AURA_NATIVE_QUESTIONS_ENABLED=false` permet l'ablation des constructions interrogatives acquises, afin de prouver leur effet causal.

## Deux batteries de développement, et leurs limites

- **Batterie multi-tours de 100 cas** (`scripts/evaluate_native_multiturn_100.mjs`) : 70 cas résolubles et 30 cas où il faut s'abstenir ; 70/70 réponses correctes et 30/30 abstentions, contre 20/70 réponses correctes sans apprentissage des constructions. Données créées par le développeur, non indépendantes.
- **Batterie de 48 structures interrogatives non apprises telles quelles** (`scripts/evaluate_native_structural_stress_48.mjs`) : diagnostic initial 0/36 questions résolubles, puis 30/36 après ajout d'une généralisation compositionnelle conservatrice du suffixe appris « qui a VERBE ARTICLE OBJET ». Douze cas négatifs n'ont pas été attribués à tort.
- La deuxième batterie a servi au développement : son score final **ne peut donc plus être qualifié de validation aveugle ou de véritable généralisation hors ajustement**. Il faudra une nouvelle cohorte indépendante et figée par un évaluateur extérieur.
- Les six cas encore refusés dans ce test impliquent notamment une nominalisation (« fermeture de ») sans lien lexical attesté entre nom et action ; AURA ne doit pas inventer ce lien.
- Le français conversationnel ouvert, l'humour contextuel, les longues subordonnées, la référence aux époques, les changements de sujet et la voix audio ne sont pas démontrés par ces scores.

L'objectif d'une conversation libre complexe n'est **pas atteint** par ce travail ; le reconnaître est une condition de progrès réel.


## Mise à jour « conversation autonome, mémoire et enseignement » du 16 novembre

### Nouvelles capacités implémentées et testées

- `src/native_session_discourse.js` : AURA extrait uniquement des déclarations explicites de l'interlocuteur, comme son prénom, ses goûts, son jeu favori ou son objectif. Les faits portent une provenance `explicit-user-disclosure`, restent des **déclarations non vérifiées**, et ne sont jamais des connaissances universelles.
- Une déclaration contradictoire ultérieure remplace la précédente dans la session SQL. « Je veux écrire un roman » est une **intention**, non une action accomplie ; « je ne veux plus… » conserve la rétractation.
- `LanguageFaculty.nativeSessionFacts(sessionId)` relit uniquement les enregistrements `native-session-disclosure` associés à ce `sessionId`. Le kernel et `workspace_boundary.js` ne laissent passer que des enregistrements dont la provenance SQL de la session est autorisée, sans lecture d'une mémoire d'une autre session.
- Le mode `native-acquired` examine jusqu'à **18 tours antérieurs** (issus de la même session et d'une entrée utilisateur vérifiée), contre 3 auparavant. Les autres modes restent à leur fenêtre limitée.
- **Apprentissage interactif guidé :** lorsque la grammaire ne possède pas l'information demandée, AURA pose une question ciblée (« Quel est ton jeu préféré ? », etc.). La réponse courte de l'utilisateur n'est apprise que si elle suit *immédiatement* cette question formulée par AURA et enregistrée comme telle. Les réponses impératives ou interrogatives ne deviennent pas des faits personnels. Les questions d'apprentissage sont **programmées**, non générées spontanément par un modèle neuronal.
- `ExpressionLayer` peut restituer ces faits, reconnaître leurs corrections, ou demander de les enseigner, sans appeler Qwen ni Groq en mode `native-acquired`.
- **Correction du démarrage autonome sur Hostinger :** le régulateur n'essaie plus de lancer Qwen dans ce mode. Le redémarrage manuel de Qwen via `/api/language/embedded/start` est également refusé (HTTP 409). `/api/language/ready` distingue `native_acquired_ready` de `model_verified` et de `open_domain_ready`; `/api/language/native/training` rapporte également les constructions interrogatives acquises.
- L'API `/api/chat` distingue les sorties `native-kernel` des sorties `model-generated` ; le noyau renvoie aussi l'origine de verbalisation afin de ne pas présenter une phrase à règle comme une phrase improvisée par un modèle.

### Réglage Hostinger nécessaire

```dotenv
AURA_NATIVE_FRENCH_MODE=native-acquired
```

Définir cette variable dans l'environnement Node.js **existant** de Hostinger, sans écraser `.env`, MySQL ou les données persistantes. Redémarrer puis vérifier `/api/build`, `/api/language/ready` (`native_acquired_ready=true`, `model_verified=false`, `open_domain_ready=false`), `/api/language/native/training`, et un échange réel de plusieurs tours sur `/api/chat`.

Un `ready=true` dans ce mode indique uniquement la disponibilité **des constructions bornées** ; il ne prouve pas une conversation ouverte naturelle. La synthèse vocale fr-FR requiert encore une voix locale disponible dans le navigateur et une permission utilisateur. **Aucune vérification de déploiement et de sortie audio réelle sur Hostinger n'a encore été obtenue pour cette version.**

La maîtrise d'une conversation complexe nouvelle n'est pas démontrée, malgré des tests unitaires réussis. Les prochaines évaluations doivent inclure des dialogues humains réellement inédits, les contextes longs, les sous-entendus et le transfert à des domaines non enseignés.
