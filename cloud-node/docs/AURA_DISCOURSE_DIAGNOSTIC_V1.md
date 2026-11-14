# AURA — diagnostic de dialogue multi-événements v1

## Objet
Évaluer la compréhension locale de plusieurs événements, des pronoms, de la chronologie et des corrections **sans Groq**. Ce corpus de **34 cas figés** mesure les réponses autorisées, les réponses exactes, les mauvaises attributions et les abstentions. Il ne sert pas à l'entraînement.

## Provenance et limite d'indépendance
Les dialogues et les étiquettes ont été rédigés spécifiquement pour ce projet, et non extraits d'un corpus externe annoté à l'aveugle. Le jeu est indépendant **du corpus d'entraînement UD French-GSD TRAIN**, mais **n'est pas indépendant de l'équipe qui construit le parseur**. C'est un *diagnostic figé de régression*, pas une preuve de généralisation humaine. Les exemples sont publics dans le dépôt et peuvent contaminer tout développement ultérieur s'ils servent à optimiser des règles.

Le jeu UD French-GSD DEV reste inchangé et évalue une distribution différente de constructions simples.

## Protocole
- Données : `cloud-node/benchmarks/fr_discourse_diagnostic_v1.json`.
- Exécution : `cd cloud-node && node scripts/evaluate_native_discourse.mjs discourse-diagnostic-report.json`.
- Rapport enregistré dans la CI AURA Cloud Node, artefact `aura-discourse-diagnostic`.
- La sortie inclut le SHA-256 exact du jeu, l'identifiant de commit, la ventilation des catégories et les identifiants des réponses incorrectes.
- Les réponses sont considérées exactes uniquement si elles reprennent l'acteur attendu dans la structure native avec provenance utilisateur. Une abstention n'est jamais comptée comme une réponse exacte.
- Les réponses données à des cas qui exigent une abstention sont explicitement comptées comme `unsafe_answers`.
- `precision_at_attempt = correct / attempted`, `correct_over_answerable = correct / answerable`, `unsafe_answer_rate = unsafe_answers / cases_unanswerable`.
- Il n'y a pas de seuil de réussite artificiel : le rapport inclut également les catégories où AURA échoue. Les nouvelles modifications au parseur devront être comparées au rapport de base gelé et au même SHA du corpus.

## Pour mesurer une véritable généralisation
Préparer ensuite **un deuxième corpus séparé**, constitué par un annotateur qui ne lit ni le code du parseur ni ce jeu. Répartir par familles d'événements et de verbes inédites, mélanger les formes actives/passives, et publier un protocole de double annotation. Maintenir ce second jeu inaccessible au processus d'ajustement jusqu'au lancement officiel de l'évaluation.

La validation de cette PR ne constitue pas une autorisation de déployer sur Hostinger : vérifier séparément le site réel, les journaux et les versions de paquet.
