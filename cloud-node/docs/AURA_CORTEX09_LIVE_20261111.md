# AURA CORTEX 09 — données vivantes, observations authentiques (11/11/2026)

## Motif
L'interface CORTEX 08 interroge /api/brain/graph toutes les 2,8 secondes au repos, mais sa mesure était celle du cycle cognitif du noyau (par défaut 30 secondes). De plus, les mouvements de la matière utilisaient une amplitude inférieure à 1 %, peu perceptible.

## Correctifs
- Un capteur `ProcessSomaticSensor` strictement *read-only*, partagé par les routes publiques `/api/brain/telemetry` et `/api/brain/graph`, actualise les mesures du processus Node jusqu'à une fois toutes les 1,6 secondes lorsque les endpoints sont interrogés. Ce capteur ne déclenche ni tâche cognitive ni écriture mémoire et ne mesure pas le serveur entier.
- `brain_telemetry` utilise cette mesure récente en priorité, avec repli sur le capteur journalisé du noyau uniquement si les données directes sont absentes ou périmées.
- `/cerveau` affiche 3 valeurs et courbes (CPU Node, fraction de heap Node, pression de calcul) ; chaque point correspond à un échantillon daté réellement reçu. Aucun point n'est ajouté lors de l'interrogation répétée de la même date ; la courbe reste plate si les données sont plates.
- Le volume cérébral varie avec une amplitude visiblement perceptible en fonction des mesures (métaphore graphique, pas activité neuronale). Un relevé de plus de 12 secondes arrête toute animation de matière. Les événements `brain-hop` continuent d'être les **seuls** déclencheurs d'impulsions neuronales, conformément à CORTEX 08.
- Onglet masqué et préférence « réduire les animations » sont toujours respectés. Les courbes restent consultables comme état statique sous cette préférence.

## À ne pas confondre
Les ondulations continues sont une traduction des mesures informatiques et non une preuve qu'AURA réfléchit sans interruption. Les nouvelles preuves de décision autonome continuent de dépendre des reçus `brain-hop`, des boucles vérifiées et de l'ablation du noyau. On ne crée aucune activité cognitive pour embellir l'interface.

## Déploiement
Branche empilée sur CORTEX 08, à garder en brouillon jusqu'au résultat complet CI/artefact, sauvegarde de la base MySQL et vérification `/healthz`, `/api/brain/graph`, `/cerveau` sur l'application Hostinger. Le changement ne nécessite aucune migration MySQL supplémentaire.
