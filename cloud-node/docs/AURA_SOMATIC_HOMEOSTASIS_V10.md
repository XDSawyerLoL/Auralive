# AURA 3 — Régulation somatique computationnelle v10

## Objectif

Implémenter une boucle fermée où les états fonctionnels d'AURA émergent d'un mélange explicite :

1. **Contrainte matérielle mesurée** : mémoire du processus Node et activité CPU de ce processus (pas celle de toute la machine) ;
2. **Impact situationnel vérifié** : échec et réussite des actions enregistrées dans le noyau ; une réponse textuelle n'est pas assimilée à une action réussie ;
3. **Homéostasie temporelle** : évolution continue vers des points d'équilibre, sans faire croître mécaniquement les scores jusqu'à 100 % ;
4. **Variabilité pseudo-aléatoire bornée** : oscillations faibles, rejouables via une graine conservée dans l'état privé, limitées aux variations d'état et aux arbitrages de faible enjeu ;
5. **Décision observable** : pression de calcul élevée => préférence pour vérification/recentrage, et reflet de cette situation dans la réflexion native.

Ce modèle s'inspire fonctionnellement de l'homéostasie et de l'allostasie. Il ne prétend **ni prouver un ressenti humain ni simuler une biologie réelle**.

## Modules

- `src/somatic_dynamics.js` : capteur ProcessSomaticSensor, points d'équilibre, réponse aux événements, mémoire des réussites/échecs à décroissance exponentielle, bruit pseudo-aléatoire borné.
- `src/organism.js` : migration automatique du modèle v9 vers v10, régulation avant interaction, après réponse, après résultat d'action, sur événement et à chaque tick sans conversation. Champs `homeostasis` persistés dans le Soul canonique MySQL.
- `src/cognition.js` : pression de calcul dans les arbitrages, priorité à la stabilisation en cas de charge élevée, provenance des données explicitée.
- `src/brain_telemetry.js`, `src/brain_console_runtime.js` : indicateurs de processus distincts des indices affectifs calculés, dernier signal, compteur de transitions.

## Invariants de sécurité et vérité

- Les valeurs de `satisfaction`, `confiance`, `clarté`, `stabilité`, `frustration`, `engagement`, `initiative` et `besoin_de_silence` sont maintenues dans **[0,03 ; 0,97]**, et non artificiellement à 100 %.
- Les valeurs de l'état interne sont calculées, non mesurées biologiquement.
- Les capteurs ne mesurent que le **processus Node** ; aucune prétention à mesurer température corporelle, stress psychologique, RAM machine entière, GPU ou consommation énergétique.
- La CPU n'est calculée qu'après deux lectures séparées dans le temps ; avant cela, elle reste **null**, jamais inventée.
- Un relevé de charge de plus de 120 secondes est marqué ancien et n'est plus présenté comme mesure actuelle.
- La graine pseudo-aléatoire reste privée ; l'API cerveau n'expose pas cette graine.
- Aucun seuil de sécurité, privilège, accès, frais ou permission n'est soumis au hasard.
- Une réussite de **génération linguistique** n'est pas prise pour une réussite de mission.
- Aucun fournisseur d'inférence payant, VPS ou service externe nouveau n'est nécessaire.

## Scénarios d'acceptation

```sh
cd cloud-node
npm run check:package
node --test test/somatic_dynamics.test.js test/organism.test.js test/brain_telemetry.test.js
```

Tester sur le serveur Hostinger après déploiement validé :

1. Observer `/cerveau` : les jauges fonctionnelles et les relevés processus sont distingués. Un capteur absent reste « — ».
2. Émettre un événement d'échec **réel**, vérifier le signal `action_failure`, l'augmentation relative de la frustration et la diminution de confiance.
3. Émettre une réussite réelle distincte, vérifier `action_success` et la modification des tendances.
4. Laisser AURA sans conversation : le tick doit entraîner progressivement les états vers l'équilibre, sans fabriquer d'événement ou d'émotion.
5. Augmenter temporairement la charge par un banc de test **isolé** : les mesures CPU/mémoire évoluent ; l'intention de régulation prend plus de poids.
6. Faire redémarrer le processus : les moyennes et l'état restent persistés ; les mesures de CPU reprennent à `null` jusqu'à leur première paire d'échantillons.

## Limites et suites

Cette PR fournit un moteur **fonctionnel et instrumenté**, pas une conscience, pas une simulation neuroscientifique validée, pas un modèle psychologique étalonné sur humains. Les coefficients et seuils sont des **paramètres expérimentaux**. Les essais sur hébergement réel, la mesure de stabilité et l'ajustement des coefficients nécessitent des observations avant fusion/déploiement.

Un futur protocole peut conserver des traces anonymisées signal → delta → intention → résultat, puis utiliser une optimisation hors ligne avec validation indépendante pour ajuster ces paramètres sans laisser le modèle linguistique auto-évaluer ses succès.
