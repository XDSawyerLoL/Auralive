# AURA — Carte de cognition instrumentée (v1)

## Objet

Unifier le dialogue et la visualisation des **opérations vérifiées**, sans prétendre afficher des activations neuronales internes d’un LLM ou des pensées privées.

La vue est intégrée **dans le panneau de chat existant**. L’ancien rendu de particules, déconnecté des étapes de la requête, n’est plus initialisé et sa carte est masquée. Aucun package client, CDN, GPU spécifique ou service payant requis.

## Ce qui est réellement mesuré

Chaque appel accepté à `POST /api/chat` démarre une trace unique, bornée et liée à la session HTTP actuelle. Le serveur enregistre les débuts et fins des étapes **lorsqu’elles sont effectivement atteintes** dans `CognitiveKernel.chat` :

1. Entrée persistée ;
2. Homéostasie avant réponse ;
3. Stimulus reçu par le noyau ;
4. Contexte (intentions, leçons, réflexions, messages, travail) chargé ;
5. Décision prise par `CognitionEngine.planReply` ;
6. Recherche externe, uniquement si déclenchée ; sinon marquée « ignorée » ;
7. Support sémantique, seulement si sollicité ; sinon « ignoré » ;
8. Expression produite et mode de langage réel (`french-language-faculty`, `natural-language-unavailable`, secours déterministe) ;
9. Homéostasie post-réponse ;
10. Persistance de la réponse et de sa trace cognitive.

Une étape peut être `running`, `done`, `skipped` ou `error`. Les millisecondes sont calculées par l’horloge serveur depuis l’entrée de la requête. Les mouvements visuels sont exclusivement associés à des opérations en cours. Le clic et le clavier permettent d’inspecter chaque nœud.

## API

- `GET /api/cognition/trace` — dernier traitement de la session HTTP ; crée au besoin le cookie de session avant un premier message.
- `GET /api/cognition/trace?id=<uuid>` — traitement précis, **uniquement s’il appartient à la même session**.
- `POST /api/chat` — renvoie en plus `trace_id`.

Les réponses indiquent `available`, `id`, `state`, `started_at`, `duration_ms`, `events`, et `source: server-events`. Le tableau d’événements affiche les horodatages, étapes, statuts, durées et **un jeu restreint de métriques**. Il n’expose ni prompts, ni réponses, ni documents récupérés, ni erreurs internes, ni raisonnement caché.

Les traces sont en **mémoire volatile du processus**, limitées à 120 traitements et 20 minutes ; un redémarrage les efface. Si plusieurs instances Node sont déployées, leur mémoire n’est pas partagée : le feed peut indiquer « aucune trace » sur un autre processus. Une future évolution pourra persister des traces redigées en base sans divulguer de données privées.

## Contraintes

- Ce n’est **pas** une visualisation des poids, couches, tokens internes ou états de conscience d’un modèle.
- L’homéostasie visualisée est un état computationnel du module `organism.js`, pas une émotion humaine ressentie.
- Ne jamais animer une branche « recherche externe » ou « sémantique » si elle a été ignorée.
- Les fallbacks de langue sont explicitement identifiés ; un moteur indisponible ne doit pas apparaître comme une inférence réussie.
- L’observabilité ne doit jamais bloquer l'exécution : le callback d'événements est sans effet métier.

## Vérifications

À exécuter **avant fusion/déploiement** sur Node 22 :

```sh
cd cloud-node
npm run check
npm test -- test/cognitive_trace.test.js
```

Tests ciblés : isolation entre sessions y compris par identifiant, absence de métadonnées privées arbitraires, refus des étapes/états inconnus, échecs visibles, durée mesurée, expiration et plafond de rétention.

## Contrôle manuel après déploiement sur environnement de test

1. Ouvrir AURA, demander « Bonjour ». Vérifier les nœuds successifs, chronologie et durée.
2. Poser une question sans besoin du Web : « Recherche » reste **ignorée**.
3. Couper le moteur de français sur test : le mode indisponible apparaît dans « Expression ».
4. Ouvrir une deuxième session navigateur : elle ne doit **jamais** voir la trace de la première.
5. Vérifier le comportement sur mobile et avec `prefers-reduced-motion`.
6. Valider cookies cross-origin, reverse proxy et nombre d’instances. Aucun résultat de cette recette en production n’est revendiqué avant exécution réelle.
