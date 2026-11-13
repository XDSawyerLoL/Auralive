# AURA — compréhension française locale v1 (13 novembre 2026)

## Périmètre honnête

Ce patch ajoute un **analyseur symbolique local et borné**, pas un LLM, pas une preuve de compréhension générale et pas une conscience. Il se sert des verbes présents dans le corpus morphologique UD French-GSD déjà embarqué (CC BY-SA 4.0) pour retrouver le lemme verbal, puis combine ces indices avec des règles grammaticales transparentes.

Couverture ciblée : sujet/action/objet, équivalence actif–passif pour certaines constructions, copule et attribut, négation, questions « qui », « est-ce que », « de quelle couleur », causes déclarées avec « parce que/car », ordre déclaré avec « puis/ensuite », corrections explicites d'acteur ou d'attribut. Un nouveau nom propre est utilisable comme entité seulement si la construction est couverte.

## Connexion au noyau

- ExpressionLayer interroge answerFrenchFromConversation seulement en mode AURA_NATIVE_FRENCH_MODE=local-only ou prefer-local. Il conserve validateNucleusSpeech, la provenance et le refus si la couverture est insuffisante.
- Les antécédents sont limités aux tours utilisateur de la fenêtre de dialogue de la même session, après le filtre perceptif du noyau. Les affirmations de l'assistant ne sont jamais recyclées comme preuves.
- LanguageFaculty.rememberCorrection extrait des corrections explicites, les persiste dans la table existante aura_language_experiences avec étiquette user-statement-unverified ; aucune migration ni création d'un second « cerveau ».
- La récupération SQL est filtrée par session_id et limitée au circuit local pour une question. Aucun souvenir d'une session étrangère n'est interrogé.
- Les corrections explicites prévalent sur les faits contradictoires non corrigés de la même session. Limite connue : la chronologie d'une affirmation ultérieure non qualifiée n'est pas encore comparée à celle de la correction ; il faut prévoir un ordre d'événements fiable.
- Le système ne convertit ni une phrase déclarée par un utilisateur en vérité vérifiée, ni une correction en droit d'exécuter un outil.
- **Zéro appel Groq dans cette voie de verbalisation locale.** D'autres composants historiques d'AURA peuvent faire leurs propres appels réseau : le patch ne rend pas toute l'application hors ligne.

## Évaluation reproductible

Depuis cloud-node :

    node --test test/native_semantic_grammar.test.js test/native_semantic_integration.test.js

Les tests couvrent les rôles agent/patient actif/passif sur phrases distinctes ; l'action niée ; une correction et son effet sur une réponse ; le transfert à des entités nouvelles ; l'abstention hors couverture ; les séquences et causes explicitement déclarées ; la séparation des sessions, la persistance et l'absence d'appel externe.

**Niveau de preuve :** tests unitaires de constructions connues avec certaines entités inédites. Il manque encore un benchmark indépendant à grande échelle sur conversations entièrement tenues à l'écart de l'ajustement des règles. Ne pas transformer le nombre de tests verts en « intelligence linguistique ».

Prochaine étude : partition externe gelée de plusieurs centaines de conversations annotées (rôles, négation, temporalité, coreférence), précision et rappel par construction, calibration du refus, falsification après correction et persistance après redémarrage sur Hostinger. **Ne pas déployer** avant contrôle des suites globales/CI, de la protection des données et de la charge réelle.

## Apport ciblé de DeepSeek DSH Superagent

Source auditée : https://github.com/deepseek-ai/dsh-superagent-prototype (licence MIT, avertissement explicite : prototype de recherche, non produit officiel ni prêt pour production). Son enchaînement Intake → Evals → Tickets → Assignments → Replies favorise une admission vérifiable, la séparation décision/exécution, la reprise et la limitation des interruptions. Il peut inspirer la prise d'initiative déjà présente dans AURA.

Ne pas intégrer directement ce serveur : il dépend de DeepSeek Harness et vise GitHub/Feishu, **pas** l'acquisition du langage ou la perception audiovisuelle. Il ajouterait un second orchestrateur concurrent de CognitiveKernel et TaskGraphExecutor. Évaluer ultérieurement une adaptation indépendante des concepts de déduplication, mandat, pause, résultat observé et abstention.
