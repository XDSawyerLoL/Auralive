# AURA — CORTEX 08 · moteur physiologique visuel

**Branche** : `feat/aura-cortex-08-physiological-life-20261111`  
**Destination** : interface existante `/cerveau`, aucune seconde interface.  
**But** : afficher en mouvement continu l'état **mesuré du processus computationnel**, sans simuler de spikes, d'hormones biologiques, de subjectivité ou de neurones humains.

## Architecture effectivement branchée

- `src/cortex08_physiology.js` produit `telemetry.cortex08` depuis les relevés du `ProcessSomaticSensor`, l'état du workspace et du noyau. Il retourne des valeurs `null` plutôt que des données de remplacement lorsqu'un capteur est absent ou périmé (> 120 secondes).
- `src/cortex08_material.js` anime une matière lumineuse WebGL, sous les fibres instrumentées, avec repli Canvas 2D. Les détails de caustique et de turbulence représentent l'activité de calcul **dérivée** des métriques.
- `src/cortex08_scene.js` est l'horloge de rendu (15 à 24 FPS selon charge CPU) : déplacements imperceptibles à faible charge, variations lumineuses plus marquées sous pression, repos si capteurs périmés, pause en onglet masqué et arrêt des mouvements si `prefers-reduced-motion`.
- `src/cortex08_focus.js` localise le foyer uniquement lorsqu'une diffusion d'attention du workspace est datée et réellement enregistrée.
- `src/cortex08_flow.js` maintient pendant **9 secondes** la rémanence d'une fibre après un `brain-hop` déjà observé. La rémanence décroit : aucun nouvel événement ni jeton d'exécution n'est inventé.
- La page conserve CORTEX 07 comme volume 3D de base et sa restitution locale `src/assets/cortex07_brain.webp`, les modules existants, les outils, le dialogue, la mémoire, le laboratoire A/B et le proto-génome numérique.

## Sources → visualisation

| Signal logiciel réel | Comportement de matière illustratif |
| --- | --- |
| CPU `node-process` frais | Intensité, vitesse des ondes / variations de relief |
| Heap / RAM Node fraîche | Densité visuelle, teinte et variation du volume |
| Pression compute et stabilité | Tension, turbulence et douceur de transition |
| Réserve de viabilité horodatée | Éclat / marge du matériau |
| Workspace avec diffusion datée | Emplacement et force du foyer |
| Erreur de prédiction horodatée | Interférence locale du shader |
| Nouvel événement `brain-hop` persisté | Photon orienté sur une arête réelle |
| Ancien `brain-hop` attesté | Après-image fading 9 secondes, jamais présentée comme nouvelle impulsion |
| Aucune mesure valide | Materiau statique, statut « AUCUNE PHYSIOLOGIE MESURÉE », pas de valeur simulée |

**Point scientifique** : « respiration », « tension », « circulation » et « organisme vivant » sont des métaphores graphiques contrôlées par des capteurs informatiques. AURA ne possède pas d'hormones mesurées et aucune conscience phénoménale n'est démontrée. L'animation ne donne pas plus de permissions à ses modules autonomes.

## Contrôles et résultats

- Workflow `AURA P0 Independent Causal Canary` lance `test/cortex08_physiological_life.test.js`. Il vérifie la fidélité des métriques, les états sans données, le focus de workspace daté, les erreurs récentes et la séparation des couches.
- Chromium desktop / mobile de la version empaquetée : WebGL visible et actif, Canvas mis à jour, taille de l'image 3D correcte, zéro erreur JS et aucun débordement horizontal.
- Test manuel instrumenté : après remplacement des mesures par un capteur périmé, la matière cesse son mouvement et revient au repos. Reprise sur mesure fraîche. En mode « réduire les animations », l'horloge d'animation est stoppée.
- Le générateur 3D GitHub est exécuté avec `xvfb-run`/Mesa pour créer l'image sur un runner sans affichage et garantir la présence de l'asset dans les archives.

## Contraintes persistantes

La conformité complète au protocole P0 joint **n'est pas prouvée** : vérificateur en processus externe, signature indépendante, ablation placebo officielle, vrai reboot de production et intervalles de confiance restent des travaux distincts. Le succès des tests CORTEX 08 ne démontre pas la conscience ni la compatibilité biologique du cerveau.

**Installation** : ne pas remplacer l'application Hostinger tant que la chaîne des PR empilées n'est pas fusionnée/revue. Sauvegarder application, `.env` et base MySQL, puis valider `/healthz`, `/cerveau`, `/api/brain/graph` sur le serveur cible.
