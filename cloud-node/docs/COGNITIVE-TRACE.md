# AURA — Carte de cognition instrumentée (v2, conversation et autonomie)

## Objet

Unifier le dialogue et la visualisation des **opérations vérifiées**, sans prétendre afficher des activations neuronales internes d’un LLM ou des pensées privées.

La carte est intégrée **dans le panneau de chat existant**, avec deux modes : Conversation et Autonomie. Les anciens diagnostics restent disponibles dans le même espace, repliés par défaut. Le bouton « Revoir la trace » rejoue uniquement des événements reçus du serveur, horodatés et réellement enregistrés. L’ancienne scène de particules déconnectée de l’exécution n’est plus initialisée. Aucun package client, CDN, GPU spécifique ou service payant ajouté.

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

Une étape peut être `running`, `done`, `skipped` ou `error`. Le serveur mesure le temps écoulé depuis le début de la requête **et** la durée de chaque étape, calculée entre les événements « en cours » et « terminé ». L’homéostasie expose des valeurs bornées issues de `organism.js` : stabilité, clarté, curiosité, confiance, frustration, engagement et humeur calculée, avec variation quand elle est disponible. Le clic et le clavier permettent d’inspecter chaque nœud. Aucune valeur psychologique réelle ni intériorité n’est présumée.

## API

- `GET /api/cognition/trace` — dernier traitement de la session HTTP ; crée au besoin le cookie de session avant un premier message.
- `GET /api/cognition/trace?id=<uuid>` — traitement précis, **uniquement s’il appartient à la même session**.
- `POST /api/chat` — renvoie en plus `trace_id` et `trace`, un instantané vérifié de la trace **de cette réponse**. Cet instantané reste visible même si un navigateur refuse les cookies tiers entre le tableau de bord et le serveur.
- `GET /api/cognition/autonomy` — **privé, authentification fondatrice requise**, retourne le dernier cycle autonome ou l’enregistrement d’opération du noyau. Aucun texte de mission ni document n’y figure.
- `GET /api/cognition/autonomy?id=<uuid>` — trace autonome spécifique, accès privé uniquement.

Les réponses indiquent `available`, `id`, `state`, `started_at`, `duration_ms`, `events`, et `source: server-events`. Le tableau d’événements affiche les horodatages, étapes, statuts, durées et **un jeu restreint de métriques**. Il n’expose ni prompts, ni réponses, ni documents récupérés, ni erreurs internes, ni raisonnement caché.

Les traces sont en **mémoire volatile du processus**, limitées à 120 traitements et 20 minutes ; un redémarrage les efface. Si plusieurs instances Node sont déployées, leur mémoire n’est pas partagée : la synchronisation en cours d'exécution peut manquer des étapes sur un autre processus. L’instantané joint à la réponse `POST /api/chat` assure toutefois une **trace finale fidèle**, même dans ce cas. La répartition entre plusieurs instances reste un point à vérifier avant la fusion. Une évolution future pourra persister des traces expurgées en base sans données privées.

### Activité autonome observée

`CognitiveKernel.tick` enregistre les véritables étapes de son cycle : début, régulation homéostatique, récupération du contexte, réflexion éventuelle, action éventuelle et persistance. Quand une réflexion n’est pas justifiée, la branche correspondante est explicitement `skipped` ; aucune réflexion factice n’est créée.

La journalisation effective par `kernel.trace` d’un agent, d’un groupe d’agents ou d’un opérateur génère aussi un événement d’activité. Un agent `failed` est indiqué en échec ; un agent `blocked` n’est pas décrit comme exécuté. Une **action externe** n’est marquée `execution_confirmed: true` que lorsqu’un résultat d’opérateur possède explicitement `executed === true`. Les inférences des agents ne sont pas assimilées à des actions sur des services externes.

### Confidentialité

Les traces de conversation sont isolées par **session de navigateur**, y compris quand la personne est authentifiée comme fondatrice. Le contexte conversationnel historique privé peut rester partagé dans le noyau, mais les traces de navigateur ne le sont plus. Le flux d’autonomie est réservé à la session fondatrice authentifiée. L’API ne sérialise qu’une liste blanche de métriques numériques, drapeaux et états prédéfinis ; elle n’inclut jamais les contenus de conversation, prompts, missions, erreurs techniques ou documents externes.

## Flux d'événements en direct — transport SSE

**Il existe désormais deux chemins de lecture complémentaires :**

- `GET /api/cognition/events` : connexion `text/event-stream` de la **session de navigateur signée**. Le serveur transmet un instantané expurgé dès l'ouverture, puis après chaque jalon réellement enregistré par `CognitiveTraceLedger.mark` et `finish`.
- `GET /api/cognition/autonomy/events` : même transport, **accessible uniquement à une session fondatrice authentifiée** via `requirePrivate`.
- `GET /api/cognition/trace` et `GET /api/cognition/autonomy` : lecture REST de secours ; elle reste utilisable sans EventSource et si un reverse proxy coupe les connexions longues.
- `POST /api/chat` contient toujours l'identifiant et la **trace finale vérifiée**, même si une requête de streaming a été routée vers un autre processus Node.

Le navigateur lance le flux SSE **après** le premier appel REST qui installe le cookie de session. Il affiche explicitement « Événements directs » lorsque les messages SSE sont reçus, et « Flux indisponible · secours actif » si le navigateur repasse aux interrogations périodiques. Le mode Autonomie change d'abonnement ; le flux précédent est fermé.

Le transport est borné à **4 connexions par session** et **120 connexions par processus**, émet un battement de vie toutes les 15 secondes, et ferme automatiquement chaque flux au bout de 2 minutes (EventSource peut se reconnecter). `Cache-Control: private, no-store, no-transform` et `X-Accel-Buffering: no` demandent au proxy de ne pas mettre en cache ou en tampon les messages, mais **certains hébergeurs peuvent malgré tout tamponner les événements**.

Les notifications de `CognitiveTraceLedger` n'exposent jamais l'identifiant interne de session, les prompts, les réponses, les documents récupérés, les secrets ni le raisonnement privé. Les listeners sont désabonnés à la fermeture de connexion et leurs erreurs n'interrompent pas le noyau.

**Limite restante :** plusieurs instances Node ont des mémoires distinctes. Le SSE suit seulement les traitements du processus où il est connecté. Une observation multi-instance continue nécessitera un journal partagé ou un bus d'événements explicite, redigé et isolé par session ; sans cela, l'instantané final de `POST /api/chat` assure uniquement la vérité du résultat final, pas une animation live inter-processus.

### Test manuel SSE

1. Ouvrir l'inspecteur réseau du navigateur. Vérifier que `/api/cognition/events` répond 200 et `Content-Type: text/event-stream`, avec une connexion active.
2. Envoyer « salut ». Les événements `running` et `done` doivent arriver **durant** la requête. Les événements d'absence de moteur doivent être affichés comme `error`, pas comme une sortie réussie.
3. Fermer la connexion SSE : le panneau doit indiquer le mode de secours et les traces doivent encore être visibles.
4. Essayer une session publique sur `/api/cognition/autonomy/events` : la requête doit être refusée.
5. Sur un déploiement à plusieurs processus, vérifier le comportement des événements pendant la requête ; ne pas prétendre qu'un flux inter-processus existe tant qu'il n'a pas été implémenté.

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

Tests ciblés : isolation entre sessions y compris par identifiant, absence de métadonnées privées arbitraires, refus des étapes/états inconnus, échecs visibles, durée mesurée par étape, expiration et plafond de rétention, cycles autonomes, état des agents, véritables valeurs homéostatiques, et compilation du JavaScript réellement intégré à la page.

## Contrôle manuel après déploiement sur environnement de test

1. Ouvrir AURA, demander « Bonjour ». Vérifier les nœuds successifs, chronologie et durée.
2. Poser une question sans besoin du Web : « Recherche » reste **ignorée**.
3. Couper le moteur de français sur test : le mode indisponible apparaît dans « Expression ».
4. Ouvrir une deuxième session navigateur : elle ne doit **jamais** voir la trace de la première.
5. Vérifier le comportement sur mobile et avec `prefers-reduced-motion`.
6. Se connecter en tant que fondatrice/fondateur, choisir « Autonomie » et déclencher un cycle `POST /api/kernel/tick` sur environnement de test ; vérifier les étapes faites et ignorées.
7. Avec la même identité fondatrice, ouvrir deux navigateurs : les traces **de dialogue** ne doivent pas se croiser, mais chacun peut voir les cycles autonomes autorisés.
8. Vérifier les modes « Diagnostics » et « Revoir la trace » ; le dernier rejoue une succession d’événements enregistrés et n’affiche jamais une opération absente du registre.
9. Simuler le refus des cookies entre domaines : la réponse doit conserver `trace` jointe.
10. Valider reverse proxy, charge et nombre d’instances. Aucun résultat de cette recette en production n’est revendiqué avant exécution réelle.
