# AURA — Étude des mécanismes actifs Na/K avec données humaines (v2)

## État exact

Ce code est un protocole expérimental NEURON exécuté dans GitHub Actions, **pas**
un « cerveau biologique » activé en production.

Le solveur remplace l'insertion de la **membrane HH historique** par deux
nouveaux mécanismes NMODL originaux :
- \`scripts/aura_kinetics_mod/aura_na_eff.mod\` : activation sodique et
  inactivation (courant Na transitoire) à fonctions logistiques et temps de
  relaxation réglables.
- \`scripts/aura_kinetics_mod/aura_k_eff.mod\` : activation potassique à
  fonction logistique et relaxation réglable.
- \`scripts/fit_human_kinetics_v2.py\` : importe la morphologie humaine SWC
  dans NEURON, distribue la membrane passive d'après vrest, résistance
  d'entrée et tau Allen, et place les deux conductances actives au soma
  et dans la première section axonale *proxy*.
- \`scripts/evaluate_human_kinetics_transfer.py\` : teste les
  **mêmes paramètres actifs** sur deux autres cellules humaines,
  en ne remplaçant que leurs caractéristiques passives et leurs SWC.
- \`.github/workflows/aura-human-effective-gating-v2.yml\` : compilation
  effective NMODL, tests numériques, ajustement et tests intercellulaires.

Les valeurs de demi-activation, de temps, de pente, de conductance et de
potentiel de renversement sont des hypothèses **a priori**, dont une
grille de 12 combinaisons est ajustée à la réponse en courant imposé de
cellules humaines. Ce ne sont PAS des mesures directes des cinétiques de
protéines NaV/Kv humaines en voltage-clamp. Même une prédiction de spike
correcte sur plusieurs traces ne prouve pas l'identité moléculaire des
canaux. La première section axonale reconstruite n'est pas un AIS
anatomiquement identifié.

## Pourquoi ne pas utiliser tel quel le code all-active de l'Allen Institute ?

L'Allen Institute publie des modèles neocorticaux humains et des fichiers
NMODL de canaux adaptés à certaines cellules. Mais le dépôt
\`AllenInstitute/Human_all_active_models_EAP\` contient une licence spéciale
de type BSD à **interdiction de redistribution commerciale sans accord
écrit**. Les mécanismes originaux de ce dossier **ne contiennent
aucune copie** de ces fichiers ni leurs paramètres optimisés. Leur
distribution dans le produit AURA serait une question de licence à
régler auparavant.

Les études sur les propriétés Na/K humaines (par exemple
\`https://pmc.ncbi.nlm.nih.gov/articles/PMC10569700/\`) montrent des
différences entre cellules humaines et murines, mais n'autorisent
aucune extrapolation chiffrée non mesurée à un spécimen particulier.

## Protocoles stricts

1. **Référence humaine** : spécimen Allen \`643582610\` avec morphologie
   SWC et valeurs vrest/Ri/tau. Deux stimulations distinctes, NWB
   \`26\` et \`37\` (courants 10 et 230 pA), servent à choisir les
   paramètres en minimisant RMSE (mV) + 5 mV par spike manquant
   ou ajouté. Le champ de données NWB \`44\` (120 pA) reste isolé
   de l'optimiseur, et n'est évalué **qu'une fois** après sélection.
2. **Deux nouvelles cellules** : IDs Allen \`529898751\` et
   \`508410761\`. Les balayages de forte stimulation déjà sélectionnés
   **sans lire les réponses expérimentales** sont NWB \`54\` (230 pA)
   et \`58\` (350 pA). Les mêmes paramètres Na/K gelés sont testés
   sur leurs morphologies et propriétés passives respectives ;
   aucun nouvel ajustement actif n'est permis.
3. **Banc numérique synthétique** : avant d'accéder aux données
   humaines, compiler ces deux fichiers NMODL et résoudre un
   courant imposé sur une cellule artificielle NEURON, puis
   tester la finitude des tensions.
4. **Résultats** : publier les paramètres gelés, courants,
   décharges observées/prédites, RMSE et provenances SHA-256.
   Aucun NWB brut, aucune donnée à caractère personnel,
   aucune commande sur la mémoire ou la politique d'AURA.
5. **Validation scientifique** : le succès des jobs CI
   certifie l'exécution, PAS la fidélité humaine. Si 0 spike
   prédit pour 2 humains observés, le tableau doit afficher
   cette erreur, sans inventer des ondes neuronales.

La validation sur différents spécimens ne démontre pas leur origine
de donneurs distincts. Un résultat satisfaisant ne généralise pas à
l'amygdale, aux astrocytes, aux neurotransmetteurs, aux systèmes
hormonaux ou à la conscience subjective.

## Références publiques

- AllenSDK, données Cell Types et format NWB :
  https://alleninstitute.github.io/AllenSDK/cell_types.html
- AllenSDK biophysical runner et archive de mécanismes :
  https://alleninstitute.github.io/AllenSDK/biophysical_models.html
- Propriétés humaines de Na/K chez les neurones pyramidaux :
  https://pmc.ncbi.nlm.nih.gov/articles/PMC10569700/
- Cinétique humaine de HCN/Ih et validation sur un jeu distinct :
  https://pmc.ncbi.nlm.nih.gov/articles/PMC7906797/
- Modèles humains all-active Allen et leur licence :
  https://github.com/AllenInstitute/Human_all_active_models_EAP
