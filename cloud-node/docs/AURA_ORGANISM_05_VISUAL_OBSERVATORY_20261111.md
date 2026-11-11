# AURA / ORGANISM 05 — scène neuronale observable

**Version** : 2026-11-11 (PR empilée #241 → #240 → #239 → #238 → #237).  
**Écran** : \`/cerveau\`, un seul espace de dialogue et d'observation.  
**Nature** : organisme computationnel instrumenté ; **aucune équivalence neurobiologique ni conscience subjective démontrée**.

## 1 — Composition et hiérarchie visuelle

Le connectome se déploie sur la largeur disponible, autour d'une silhouette cérébrale **décorative et non animée**. À l'intérieur de cette scène : les véritables nœuds issus du registre de modules, les liaisons déclarées, et les transitions horodatées réellement observées. Les nœuds restent visibles sans activations inventées.

Aux périphéries : un journal causal condensé à gauche, des jauges circulaires à droite, six raccourcis vers les fonctions thalamique, préfrontale, hippocampique, insulaire, des ganglions de la base et métacognitive. Ces intitulés sont des **analogies fonctionnelles**. Ils ne décrivent ni des neurones biologiques ni des homologues complets.

En bas : une frise d'événements cliquables, avec dates, origine et état « RECENT / ARCHIVE ». Une commande \`REPLAY\` ouvre le contrôleur de trajet archivé, avec relecture **explicitement demandée**. Aucune archive n'est jouée automatiquement à l'ouverture de la page.

La boîte de dialogue demeure accessible dans une barre fixe discrète et déployable. Les diagnostics, le référentiel de modules, l'atlas à 18 opérations, le protocole A/B et le génotype expérimental sont conservés mais secondaires ; ils ne remplacent plus la scène principale.

## 2 — Couplage temps réel et fiabilité

- Source unique : \`GET /api/brain/graph\`, déjà publique, expurgée du contenu privé et alimentée par les traces persistées \`aura_cognitive_traces\`.
- Fréquence de consultation : **2,8 secondes lorsque l'onglet est visible et inactif**, **950 ms durant une requête utilisateur**. Il s'agit d'actualisations régulières d'observations et non d'un flux neuronal continu ou d'une mesure 10 Hz.
- Une impulsion animée exige un nouveau reçu \`brain-hop\` non vu au précédent relevé, horodaté de moins de 4 secondes, situé sur une arête enregistrée, avec au moins une observation. Le front de l'animation dure 2,25 s ; la file est bornée à 32.
- Au **premier relevé**, toutes les traces connues servent de références et ne deviennent **pas** des impulsions « en direct ».
- Une lueur statique de région est uniquement un décor anatomique ; les nœuds ne passent à « récemment observés » qu'avec les traces du serveur.
- Si la base de traces est indisponible, l'interface affiche « journal inaccessible » et ne transforme pas l'architecture seule en preuves d'exécution.
- Le mode réduction des mouvements de l'OS et les onglets masqués désactivent les animations ; les contrôles de relecture restent accessibles sans lecture automatique.

## 3 — Constantes et provenance

Le serveur adjoint \`telemetry.neuro_vitals\` via \`brain_physiology.js\`. Toute valeur affichée a : un identifiant stable, une unité, une source, un instant, une description et un classement **capteur**, **état logiciel**, **dérivé analogue** ou **événement vérifié**.

| Jauge | Origine | Signification |
| --- | --- | --- |
| Réserve | \`viability_budget\` + échantillon processus récent | Budget opérationnel de calcul réversible |
| CPU | \`ProcessSomaticSensor.cpu_utilization\` | Charge CPU du seul processus Node |
| Mémoire RAM | \`ProcessSomaticSensor.heap_utilization\` | Fraction de heap Node utilisée, pas RAM globale |
| Stabilité | \`AuraOrganism.publicState.stabilite\` | Variable de régulation logicielle |
| Attention | \`global_workspace.selected[0].score\` avec diffusion récente | Saillance du premier signal diffusé |
| « Cortisol » analogue | 72 % pression de calcul + 28 % EMA des échecs, quand disponible | Indice de surcharge/échecs, **pas hormone** |
| « Noradrénaline » analogue | Saillance sélectionnée dans le workspace | Proxy de vigilance, **pas neurotransmetteur** |
| « Sérotonine » analogue | Indice de stabilité de l'organisme logiciel | Proxy de régulation, **pas neurotransmetteur** |
| « Mélatonine » analogue | Variable logicielle de pression de rêve | Proxy de repos/consolidation, **pas hormone** |
| « Dopamine » analogue | Reçu récent de succès **local** \`fs-syscall\` | Proxy de réussite constatée, **pas dopamine ni plaisir** |

**Règle de vérité** : une mesure absente, non datée, périmée ou hors intervalle est \`null\` et représentée « — ». Aucun maintien artificiel à 50 %, aucune simulation de fréquence cardiaque, aucun « taux de conscience ».

**Limitation importante** : le canari \`fs-syscall\` est une vérification dans le processus Node, pas le vérificateur externe signé du protocole P0 du PDF. Le proxy de réussite ne doit jamais être nommé « preuve d'indépendance externe ».

## 4 — Interface responsive

Grand écran : scène dominante, journal et constantes aux périphéries ; chronologie hors de la zone de saisie.  
Téléphone : réseau réel décalé vers le tiers supérieur avec six raccourcis minimaux ; les constantes deviennent une bande de dix petits cadrans, le journal une bande défilante et la frise reste en bas **au-dessus du dialogue fixe**. Pas de tableau de bord compacté au centre du cerveau.

Navigation au clavier, titres accessibles, boutons natifs, relecture sur demande et \`prefers-reduced-motion\` respectés.

## 5 — Modules modifiés / ajoutés

- \`src/brain_organism_v5.js\` : structure HTML et composition CSS adaptative.
- \`src/brain_organism_v5_runtime.js\` : sélection des organes, historique, jauges, bornage des nouveaux reçus.
- \`src/brain_physiology.js\` : sources et calcul des indices neurophysiologiques analogues.
- \`src/brain_connectome_v4.js\` : silhouette anatomique artistique et récepteur de flashs sur les vraies arêtes.
- \`src/brain_operations_console.js\`, \`src/brain_operations_runtime.js\`, \`src/brain_readable_theme.js\` : montage dans la page et ouverture des tiroirs.
- \`src/brain_telemetry.js\` : projection des constantes datées et des derniers succès locaux.
- \`src/brain_science_lab_ui.js\` : simulation A/B/ADN numérique déclenchée seulement à la demande.

## 6 — Prouver le rendu ET la sémantique

\`test/brain_organism_v5.test.js\` vérifie l'absence de valeurs inventées, le vieillissement des capteurs, le statut analogue et la présence de l'interface. Le canari CI indépendant et les empaquetages Hostinger testent la régression du noyau.

Une **capture de contrôle du HTML assemblé** sur navigateur Chromium a été effectuée avec des données de télémétrie synthétiques clairement identifiées. Cette capture est une **maquette de validation visuelle**, pas un constat que le serveur Hostinger émet réellement ces valeurs. Les états en production restent à tester séparément.

## 7 — Hors périmètre

- Aucun déploiement automatique Hostinger ; PR en brouillon empilée, pas une version installée.
- Aucune reproduction à l'identique de l'anatomie, de la dynamique cellulaire ou d'une activité neuronale humaine.
- Aucune suppression des portes d'exécution du noyau, ni mutation du code de production par le proto-génome.
- Pas de prétention scientifique de réussite complète du protocole d'acceptation P0, lequel exige encore un vérificateur hors processus, une signature indépendante, un redémarrage réel et des bornes bootstrap.
