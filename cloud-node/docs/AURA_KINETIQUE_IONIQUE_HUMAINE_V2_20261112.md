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


## Résultats réellement obtenus — GitHub Actions 43302961099

Les deux fichiers NMODL originaux ont été **compilés** avec
NEURON 9.0.2. Le contrôle numérique sur une cellule artificielle a passé
son seuil de finitude. Le modèle original a ensuite été instancié sur
le véritable SWC humain Allen 643582610, calibré uniquement sur les
balayages NWB 26 et 37, puis testé sur NWB 44 sans le réutiliser pour
choisir les paramètres. Enfin, **les mêmes neuf paramètres actifs
ont été transférés sans réajustement** à deux autres morphologies
humaines réelles.

Lien : https://github.com/XDSawyerLoL/Auralive/actions/runs/43302961099

| Données humaines | Spikes mesurés | Ancien HH | Na/K AURA original | RMSE Na/K | RMSE ancien HH |
| --- | ---: | ---: | ---: | ---: | ---: |
| NWB 26 (référence, entraînement 10 pA) | 0 | 0 | 0 | 1,180675 mV | 0,958777 mV |
| NWB 37 (référence, entraînement 230 pA) | 14 | 0 | **1** | 14,262327 mV | 7,275160 mV |
| **NWB 44 (référence, validation réservée 120 pA)** | **2** | **0** | **1** | **12,562798 mV** | **4,343179 mV** |
| **529898751, NWB 54 (validation externe 230 pA)** | **3** | **0** | **1** | **11,501830 mV** | **7,778253 mV** |
| **508410761, NWB 58 (validation externe 350 pA)** | **2** | **0** | **1** | **12,271311 mV** | **7,340096 mV** |

Les neuf paramètres sélectionnés sont :

- gNa soma = 0,12 S/cm² ; gK soma = 0,035 S/cm² ;
- gain du proxy axonal = 4 ;
- demi-activation Na = −42 mV ; demi-inactivation Na = −55 mV ;
- demi-activation K = −32 mV ;
- tau activation Na = 0,15 ms ;
- tau inactivation Na = 1,4 ms ;
- tau activation K = 1,1 ms.

**Observations et limites explicites :**

1. Le modèle NMODL original **produit désormais une impulsion** dans
   chaque cellule sous forte stimulation. Cela répond à la première
   question : la simulation électrique active n'est pas bloquée
   à zéro décharge.
2. Il ne reproduit **pas** la fréquence de décharge ni les trains
   d'impulsions humains. Il sous-estime 14 spikes sur le balayage
   d'entraînement fort et les comptes de spikes des trois validations.
3. Les **erreurs de tension RMSE sont plus élevées** que celles du
   précédent modèle HH sur ces enregistrements. La simulation ne
   doit donc **pas** être déclarée globalement plus réaliste.
4. Les deux cellules supplémentaires n'ont fourni aucun paramètre
   actif pendant l'ajustement. Les cinétiques et conductances Na/K
   ont été gelées après calibrage sur le spécimen de référence.
5. La plupart des paramètres sont des paramètres **effectifs** de
   canaux artificiels, pas une identification directe des protéines
   humaines NaV/Kv. L'extrapolation aux amygdales, à l'hippocampe
   ou à un cerveau conscient est injustifiée.
6. Le test réservé NWB 44 a été consulté pour évaluer ce modèle.
   Il ne peut plus être qualifié de jeu inédit si un modèle suivant
   est conçu en fonction de son résultat. Toute calibration suivante
   doit annoncer un nouveau jeu de validation avant l'optimisation.
7. Les deux fichiers de mécanismes sont originaux et ne copient pas
   les fichiers à licence restreinte de l'Allen Institute.
8. Aucun calcul de l'expérience ne modifie la mémoire, la politique,
   les émotions déclarées ou le dialogue d'AURA en production.

Les résultats sont stockés dans les artefacts
\`aura-human-original-nak-gating-validation\` du job indiqué.
L'interface présente la comparaison réelle sous la section
**« Nouveaux mécanismes Na/K »**, repliée par défaut dans le
volet « Biologie mesurée », sans affecter le cerveau visuel central.

### Étape suivante dictée par les résultats

Le modèle nécessite des courants de récupération sodium,
une adaptation et une répartition soma/AIS/dendrites plus
fidèles, mais de tels mécanismes ne peuvent être
paramétrés arbitrairement puis dits « humains ».
Le protocole scientifique doit mobiliser des **enregistrements
voltage-clamp spécifiques aux cellules humaines**, documenter
les estimations des constantes de temps et du voltage
de demi-activation, puis réserver des traces et des
cellules qui n'ont pas servi à choisir ces paramètres.
