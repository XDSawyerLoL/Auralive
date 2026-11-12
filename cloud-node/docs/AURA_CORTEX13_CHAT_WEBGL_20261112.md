# CORTEX 13 — une seule scène, dialogue lisible et connectome observable

**Statut :** changement proposé, pas de déploiement Hostinger dans cette PR. Empilé sur CORTEX 12 (#249).

## Problèmes corrigés

### 1. Réponses du tchat invisibles
Le style historique `cortex06_visual.js` remplaçait la grille par une colonne verticale et donnait au cerveau toute la hauteur du viewport. Le dialogue arrivait après et les anciennes règles appliquaient des largeurs/positions incompatibles.

La nouvelle feuille finale `cortex13_layout.js` impose :
- Desktop : grille à 2 colonnes, connectome à gauche et tchat de 376 à 440 pixels à droite ;
- messages utilisateur/AURA en bulles distinctes, toujours visibles, scroll indépendamment du cerveau ;
- champ, mode et bouton d'envoi ancrés dans la colonne, sans calque cérébral au-dessus ;
- adaptation mobile en pile lisible, sans déplacer le tchat derrière la scène ;
- inventaire et diagnostics dans une section supplémentaire, sans envahir le cerveau.

### 2. 3D réelle plutôt qu'un schéma 2D superposé
`cortex13_connectome.js` utilise **WebGL2**, des coordonnées 3D (x/y/z), un effet de profondeur, une rotation manuelle et une géométrie déterministe. La texture anatomique existante reste un fond visuel, réduit pour rendre les modules et les fibres plus lisibles.

Les éléments sont des **échantillons graphiques rattachés aux modules du noyau** ; ils ne correspondent pas à des neurones biologiques observés. Le nombre total est calculé et affiché sur l'écran ; il ne s'agit jamais d'un nombre de neurones réels.

Une liaison structurelle n'existe dans le GPU que lorsque le graphe déclare effectivement la relation module A → module B. Chaque liaison peut être dessinée sous forme de plusieurs fibres visuelles, clairement étiquetées *structure déclarée*.

### 3. Activité réelle seulement
- Un niveau d'activation n'est calculé que sur les étapes horodatées `status:'ok'` des vrais `data.flows[].steps` ;
- les transitions `attempted`, historiques trop anciennes, ou sans serveur confirmé ne déclenchent aucune activation ;
- le trajet ne se propage qu'une seule fois après l'observation datée du résultat, sans oscillateur ou répétition artificielle ;
- une sélection manuelle produit une surbrillance de navigation faible, distincte d'une preuve d'activité ;
- une relecture manuelle est teinte en ambre pour la différencier du direct ;
- WebGL2 absent ou perdu : repli sur le rendu CORTEX 11 basé sur les mesures.

### 4. Validation
- Tests Node : nombre de points structurels, déterminisme, connexion déclarée, activation uniquement quand le statut est `ok`, expiration, absence de fausse activité hors serveur ;
- Tests UI : DOM du chat, CSS de grille, scroll et barre de saisie ;
- Vérifier en navigateur Chromium avec backend réel, mobile et ordinateur, le comportement du WebGL2 et les interactions.

## Critères de réception Hostinger
1. En ouvrant la page, le cartouche affiche **CORTEX 13**, et la colonne tchat est visible sans défilement vertical.
2. Après un message, la réponse apparaît dans le tchat au-dessus de la saisie et reste consultable.
3. L'interface expose les modules, les échantillons graphiques, les liens déclarés et les transmissions réellement observées **sans les confondre**.
4. Quand aucune trace n'arrive, aucune fibre ne s'illumine comme si elle était utilisée.
5. Lorsque AURA fonctionne hors conversation, les reçus attestés via CORTEX 12 apparaissent après collecte ; si Hostinger suspend le processus, l'interface doit afficher une absence de fraîcheur, jamais simuler un calcul.

**Limite scientifique :** une carte neuro-inspirée ne permet pas de reproduire ni de prouver le fonctionnement d'un cerveau biologique, et ne prouve pas l'expérience subjective.
