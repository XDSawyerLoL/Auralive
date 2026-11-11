# AURA CORTEX 09 — volume neuronal logiciel intégré

**Statut : branche de travail, non déployée sur Hostinger.** Branche empilée sur CORTEX 08 (PR #244).

## Problème concret traité

La scène CORTEX 08 superposait une sculpture pré-rendue, des lignes 2D de topologie et une lumière shader. Le cerveau était principalement perçu comme une image figée recouverte d'un schéma.

## Modification

- Le canvas central restitue désormais une géométrie **volumique** déterministe (environ 1 600 points structurels dans deux hémisphères et plus de 1 000 fibres de proximité locales), ordonnée par profondeur, avec rotation/parallaxe lente.
- Les paramètres visuels (luminosité et mouvement global) sont uniquement liés aux dernières mesures horodatées CPU/RAM et aux contrôles calculés par `cortex08_physiology.js`.
- Les photons en déplacement ne proviennent **que** des `brain-hop` persistés ; un mode « relecture » lancé explicitement est marqué en couleur distincte. Après 9 secondes, la rémanence s'éteint.
- Suppression visuelle des grandes arêtes statiques du graphe 2D (ancienne fonction conservée pour repli).
- Image anatomique rendue secondaire (silhouette fantôme) ; zone principale dégagée, étiquettes discrètes, chronologie réduite.
- Conditions de fraîcheur inchangées : capteur absent/périmé, onglet masqué ou `prefers-reduced-motion` = pas de mouvement présenté comme activité réelle.
- Les modules restent sélectionnables, et le dialogue/chronologie/détails/laboratoire restent dans **la même page**.

## Limites scientifiques

Il ne s'agit **ni** de vrais neurones, **ni** d'une mesure d'activité électrique cérébrale. La position et la densité des points sont une **géométrie de représentation logicielle**. Seules les transitions reposant sur un reçu enregistré constituent des opérations observées. Le mouvement ambiant constitue une métaphore de la charge mesurée et non une cognition prouvée.

## Critères d'acceptation

1. Sur un navigateur Chromium, la majorité de l'espace central est occupée par un **volume de fibres en profondeur**, jamais un schéma de nœuds aplati.
2. Une charge de processus fraîche modifie le rendu ; les valeurs périmées ne donnent pas de fausses animations.
3. Sans nouvelles transitions persistées, aucune impulsion itinérante n'apparaît.
4. Un `brain-hop` réel est visible sur le trajet des deux modules ; sa source et son horodatage sont inspectables.
5. L'utilisateur peut toujours ouvrir le dialogue, cliquer sur un module, réexaminer un trajet, et consulter le laboratoire.
6. Tests Node, validation navigateur desktop et mobile, contrôle `prefers-reduced-motion`, puis **seulement** empaquetage/déploiement Hostinger.

**Non validés ici :** capture de rendu Chromium, performance sur GPU réel et exécution du processus Hostinger.