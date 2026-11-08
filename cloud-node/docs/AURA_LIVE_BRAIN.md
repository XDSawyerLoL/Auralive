# AURA — Cerveau fonctionnel interactif, télémétrie réelle

## Accès

La nouvelle page du site est **`/cerveau`**, accessible depuis l'en-tête du tableau de bord et la carte « AURA vivante ». Alias : `/brain`.

Ce n'est **pas** une capture d'écran ni une image statique collée sur le site : le cerveau est dessiné en SVG anatomique stylisé et canvas neuronal animé, et ses données sont reliées à l'API du noyau. Les éclairages et particules sont **illustratifs**, jamais des neurones biologiques mesurés.

## Données et traçabilité

`GET /api/brain/telemetry` produit une vue publique et en lecture seule à partir de `publicOperationalSnapshot()`, déjà utilisée par le dashboard :

- `AuraOrganism.publicState` : stabilité, clarté, curiosité, agency, engagement, confiance, satisfaction, frustration, besoin de silence, pression de rêve, identité, humeur, intention, dernier motif de transition, `updated_at`.
- `CognitiveKernel.status.counts` : réflexions, intentions, leçons, routines; les valeurs absentes restent `null`, jamais des zéros inventés.
- `GroqFreeProvider.snapshot` : modèle et indicateur indiquant si une vraie sortie texte a été vérifiée dans le processus Node actuel; aucun secret ni clé API.
- `CommandCenter.status` et traces publiques : état déclaré de l'orchestrateur et dernières observations enregistrées, **pas** preuve de travail exécuté.
- `source.status` : `recent` pour une mutation de moins de 120 secondes, `aging` jusqu'à une heure, `stale` ensuite; source indisponible si l'application n'a pas démarré.

La page effectue une actualisation toutes les **12 secondes** et affiche l'heure de l'échantillon du serveur et celle de la dernière mutation de l'organisme. Si le réseau échoue, elle conserve les dernières données visiblement **anciennes** et ne fabrique aucune valeur.

## Fonctionnalités du cerveau

- Sept zones cliquables : Noyau, Homéostasie, CognitionEngine, Mémoire, Faculté linguistique (Groq), Contrôle de cohérence, Actions/outils.
- Sélection de région : son état est expliqué avec le nom précis de la source et la liste des valeurs utilisables.
- Mode plein écran, bureau et mobile.
- Onze jauges d'homéostasie provenant de la base du noyau, non de maquettes.
- Traces récentes datées et étiquetées comme **événements enregistrés**.
- Lien de retour vers le chat principal sans retirer ni modifier le chat fixe.

## Homéostasie : ce que ce visualiseur vérifie, et ce qu'il ne vérifie pas

La classe `AuraOrganism` met à jour un état logiciel déterministe lors des interactions, de la réception d'événements et des ticks au repos; elle dérive des indices tels que stabilité et clarté. La page vérifie la présence, l'horodatage et la validité de ces indices.

Une valeur « satisfaction : 78 % » signifie **0,78 dans l'état numérique du logiciel**, pas que la machine ressent une satisfaction comme un humain. La présence de mises à jour régulières n'est pas une preuve de conscience; elle confirme uniquement le fonctionnement de ce mécanisme logiciel. Une absence de mutation récente peut signifier qu'aucun événement n'a déclenché de changement, ou un dysfonctionnement à examiner — le visualiseur ne tranche pas automatiquement.

## Sécurité et coût

- La route est **GET, publique, en lecture seule**, sans actions sensibles.
- Aucune mémoire privée, aucun message utilisateur, aucune clé API ni jeton Hostinger affichés.
- Pas d'API commerciale ou de traitement d'image payant ; les animations fonctionnent directement dans le navigateur.
- L'endpoint est en `Cache-Control: no-store`.
- Pas de chiffre financier inventé ni d'activité de trading présentée comme réelle.

## Vérification

```bash
cd cloud-node
npm run check
npm test
node --test test/brain_telemetry.test.js
```

Après déploiement Hostinger, ouvrir `/cerveau` puis vérifier : (1) un état organisme réellement daté, (2) des valeurs numériques cohérentes avec `GET /api/kernel/public`, (3) le rafraîchissement sans rechargement de page, (4) les détails de chaque région, (5) le mode plein écran, (6) la navigation vers le chat.

**Attention :** la PR GitHub et le ZIP du pipeline sont une préparation au déploiement. Tant qu'ils ne sont pas publiés sur Hostinger, l'URL `/cerveau` du site en production peut encore afficher 404.


## Refonte du véritable site — version 4.0, animation visible et chat

La page `/cerveau` a été considérablement retravaillée : **aucune image générée ne remplace le code de l'application**.

- Modules `src/brain_experience_style.js` et `src/brain_experience_runtime.js` raccordés à `src/brain_console.js`.
- Effets animés **dans le navigateur** : flux de lumière le long de 36 filaments conceptuels, particules mobiles, halo pulsant, anneaux orbitaux lumineux, balayage, noyau à pulsation rapide, intensité visuelle liée à l'indice logiciel `engagement` quand il existe.
- Barre d'indicateurs : stabilité, engagement, nombre de réflexions et fraîcheur de la source, jamais de valeur inventée.
- Graphique d'historique de stabilité et engagement construit exclusivement à partir d'au moins **deux relevés datés effectivement reçus** par cette session du navigateur. Avant cela, pas de fausse courbe.
- Chat **réellement connecté à `POST /api/chat`** et fixé en bas de `/cerveau`, avec historique repliable, validation de la réponse d'AURA et message technique si l'inférence échoue. Aucun faux dialogue.
- Rafraîchissement de télémétrie **une seule fois toutes les 12 secondes** ; le script existant diffuse ses données via l'événement DOM `aura-brain-telemetry` au rendu animé et au graphique.
- Mobile : barre d'envoi réorganisée sur 390 px, boutons et entrée accessibles. Animation décorative toujours distinguée de l'activité neuronale réelle.
- Tests `test/brain_experience.test.js` : fonctionnement des scripts, animations, sécurité des données, chat, vrais relevés et rendu.
- Test local Chromium en 1480×970 et 390×844 : aucune erreur JavaScript ; bouton de région, réponse HTTP simulée de chat et jauges vérifiés ; captures prises à 1,15 seconde d'écart présentent un changement mesurable de pixels sur les effets. Les réponses **simulées n'étaient utilisées que pour le test navigateur**, pas dans le site en production.
- Aucun service externe, abonnement, image API ou coût supplémentaire.
- **Pas de déploiement Hostinger automatique** : GitHub fabrique le paquet mais les workflows disponibles ne le transfèrent pas à l'hébergement. L'installation et la vérification de `https://antiquewhite-dolphin-780448.hostingersite.com/cerveau` doivent être réalisées après le déploiement.
