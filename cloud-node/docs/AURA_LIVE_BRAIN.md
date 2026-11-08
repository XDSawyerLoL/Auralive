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
