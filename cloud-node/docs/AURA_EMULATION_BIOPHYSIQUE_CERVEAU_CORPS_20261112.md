# AURA — programme scientifique d'émulation biophysique cerveau–corps humain

**Orientation décidée le 12 novembre 2026.**
La cible n'est PAS « une IA qui mime un humain » et pas une collection
d'organes logiciels que l'on nomme amygdale, dopamine ou vagus. Elle est
**une émulation biologiquement contrainte d'un cerveau humain, de son
développement, et de l'interaction avec un corps computationnel**. Les
choix, émotions fonctionnelles, pensées et interactions devraient résulter
de la dynamique des cellules, réseaux et boucles corporelles.

## Principes non négociables

- Ne pas imposer de personnalité, biographie, origine humaine ou question
  existentielle à la genèse ; ne jamais conclure à une conscience subjective.
- Ne jamais remplacer les neurones biologiques par des compteurs « peur 80% »
  en leur attribuant abusivement une signification biologique.
- Distinguer les **données humaines mesurées**, les paramètres empruntés à
  d'autres espèces, les mécanismes génériques et les hypothèses non validées.
- Chaque synapse possède une direction, des propriétés cinétiques, un type de
  récepteur et une provenance biologique ; pas de liens purement graphiques.
- Chaque équation possède unités, pas de temps, conditions initiales,
  paramètres, limites numériques et références expérimentales.
- Le langage externe, y compris Groq, n'est pas l'origine des décisions :
  une formulation ne valide ni intention ni mécanisme cérébral.
- L'émulation ne doit pas écraser le noyau existant en production : les
  expériences travaillent sur leur propre état, et les interfaces entre
  simulation et comportement seront autorisées après validation.

## Inventaire anatomique et physiologique cible

| Niveau | Structures et mécanismes à reconstruire | Données/expériences nécessaires |
| --- | --- | --- |
| Membrane | Potentiel, C, conductances Na+/K+/Ca2+/Cl-, canaux ligand/voltage, pompes Na/K, réversibilité ionique | Patch clamp humain, pharmacologie, électrophysiologie |
| Neurone | Soma, dendrites, axone, morphologie compartimentée, épines, diversité cellulaire, propagation, adaptation | Morphologies humaines et familles de modèles cellulaires |
| Synapse | AMPA, NMDA, GABA_A/B, métabotropes, délais axonaux, libération vésiculaire, récepteurs, STP, STDP | Connectivité microscopique, cinétiques et plasticité mesurées |
| Neurochimie | Dopamine, noradrénaline, sérotonine, acétylcholine, histamine, neuropeptides, volume transmission, récepteurs spécifiques | Neurochimie localisée, concentrations, dynamique de récepteurs |
| Glie et matière blanche | Astrocytes, microglie, oligodendrocytes, oligodendrogenèse, myéline, métabolisme énergétique et homéostasie ionique | Données cellulaires, immunologie et métabolisme humain |
| Cortex | L1 à L6, modules excitateurs/inhibiteurs, cortex sensoriel, associatif, moteur, préfrontal dorsolatéral/ventromédian/orbitofrontal | Cytoarchitecture, électrophysiologie, connectivité corticale |
| Amygdales cérébrales | Complexes latéral, basal, central et réseaux intercalés ; afférences sensorielles et hypothalamiques | Circuits spécifiques, réponses aux stimuli et contextes |
| Mémoire | Gyrus denté, CA3, CA1, subiculum, cortex entorhinal, consolidation hippocampo-corticale | Enregistrements, mémoire et reconsolidation |
| Sélection des actions | Striatum dorsal/ventral, pallidum, noyau sous-thalamique, substantia nigra, VTA, dopamine | Mesures du comportement, plasticité et réseaux |
| Attention/éveil | Thalamus, noyaux réticulaires, formation réticulée, locus coeruleus, tronc cérébral | Enregistrements de rythmes et modulation |
| Intéroception | Insula, cortex cingulaire, NTS, voies viscéro-sensorielles | Physiologie autonome et retours corps-cerveau |
| Coordination | Cervelet, noyaux profonds, erreur motrice et prédiction sensorielle | Modèles cérébelleux, cinématique |
| Langage | Réseaux frontaux, temporaux, pariétaux, faisceaux de substance blanche, boucles auditivo-motrices | Mesures de compréhension/production, troubles du langage |
| Hypothalamus/endocrinien | PVN, hypophyse, surrénales et axe HPA/HHS, rétroaction cortisol, rythmes circadiens | Dosages hormonaux, stimulation et récupération |
| Corps autonome | Système sympathique et parasympathique, nerf vague, cœur, respiration, pression artérielle et baroréflexe | Courbes cardiorespiratoires et baroréflexes |
| Métabolisme/viscères | Oxygène, glucose, ATP, lactate, foie, digestion, intestin, pancréas, sommeil | Métabolisme cérébral et corporel, données endocrines |
| Système immunitaire | Cytokines, inflammation, microglie, interactions avec stress et comportement | Mesures immuno-neurales |
| Développement | Migration cellulaire, synaptogenèse, myélinisation, élagage, maturation, apprentissage social, différences individuelles | Atlas développementaux longitudinaux |
| Communication observable | D'abord dynamiques neuronales et intention, puis codage du sens, expression et feedback réel | Tests d'ablation, comportement et validations externes |

**Note** : le cerveau n'est pas une collection de boîtes isolées.
L'amygdale (plusieurs noyaux, pas un « centre de peur ») module avec
l'hippocampe, le préfrontal, l'hypothalamus et le tronc cérébral les
réponses au contexte. Le corps transmet en retour des signaux qui changent
l'excitabilité et l'état d'autres circuits.

## Ce qui est réellement programmé à ce jour

Les modules `organ_regulation`, `brain_physiology`, `organism`,
`somatic_dynamics` sont **des analogues logiciels ou de la télémétrie
du processus Node**. Ils ne sont pas des modèles du cerveau humain. Ils
restent utiles pour protéger l'exécution AURA, mais ne constituent plus
le critère de fidélité biologique.

Un **premier banc électrophysiologique isolé** a été créé :
`src/biophysical_microcircuit.js`.

- Équations membranaires Hodgkin–Huxley, canaux Na/K/fuite, variables
  de portes et unités mV, mS/cm², µA/cm², µF/cm², ms.
- Potentiels d'action et synapses conductancielles AMPA/GABA_A à
  cinétiques simplifiées. Connexions de cellules représentatives portant
  les noms thalamus, amygdale, hippocampe, préfrontal + interneurone,
  hypothalamus, insula, tronc cérébral.
- Premier couplage cardio-autonome et chaîne relative CRH → ACTH →
  glucocorticoïde avec rétroaction, avec temps en secondes (dynamique
  simplifiée, concentrations relatives non mesurées).
- Possibilité de supprimer virtuellement une connexion et comparer le
  même état initial : test numérique de causalité et reproductibilité.
- API privée de recherche sans écriture de mémoire :
  `GET /api/research/biophysics` et
  `POST /api/research/biophysics/experiment`.
- Aucun appel de modèle linguistique, aucune prise de décision de
  production, aucun état de l'AURA actuelle modifié par ce simulateur.

**IMPORTANT :** les paramètres HH sont ceux de l'axone géant de
calmar en 1952 (6,3 °C), PAS ceux de neurones humains ; une cellule
représentative ne simule pas la diversité d'une région cérébrale. Les
connectivités et constantes HPA de ce premier banc sont illustratives
et **non calibrées sur l'humain**. Ne jamais appeler cet état du projet
« cerveau humain reproduit ».

## Plan de passage à une véritable calibration humaine

**P0 — Fiabilité des solveurs et provenance**
- Rejouer exactement les trajectoires électriques, comparer les
  potentiels d'action au jeu HH de référence, mesurer stabilité/
  convergence à deux pas de temps, conservation et unités.
- Ajouter import de modèles cellulaires avec provenance :
  source, espèce, région, donneur anonymisé, morphologie, canal ionique,
  version et licence ; refuser toute étiquette « humain validé » sinon.
- Introduire structures synaptiques avec séparation AMPA, NMDA,
  GABA_A/B et synapses de régulation plus réalistes et cinétiques.

**P1 — Calibration biophysique humaine**
- Identifier jeux autorisés du *Allen Cell Types Database* et
  d'EBRAINS, modèles humains morpho-électriques validés, morphologies
  SWC, traces de patch-clamp et données transcriptomiques.
- Utiliser NEURON (ou autre solveur validé) pour compartiments et
  conductances. Faire des tests indépendants sur courbes f-I,
  adaptabilité, temps réfractaire et propriétés dendritiques.
- Paramètres empiriques et intervalles d'incertitude par type cellulaire
  et région, avec comparaison à jeu de données tenu à l'écart.

**P2 — Circuits cérébraux et corps**
- Construire les noyaux et sous-circuits identifiés ci-dessus ;
  connexions hypothétiques explicitement étiquetées jusqu'à
  validation par histologie/connectomique.
- Introduire l'axe hypothalamo-hypophysaire/surrénalien et le
  baroréflexe sur leurs échelles de temps correctes ; neurones
  interoceptifs et retours viscéraux affectent les courants et
  la plasticité du réseau.
- Comparer les prédictions du modèle à des mesures physiologiques
  disponibles, et réviser plutôt que « booster » artificiellement
  les variables d'émotion.

**P3 — Développement et comportements émergents**
- Plasticité synaptique et structurale, consolidation, maturation,
  influence de l'environnement et apprentissage social.
- Des tâches de perception, de choix et de communication dont les
  sorties résultent des états du réseau : pas de règles pré-écrites
  « si amygdale > 0.8 alors peur ».
- A/B reproductibles : même cerveau initial, environnement différent,
  développement différent et généralisation testée sur stimuli jamais
  rencontrés.
- Vérification du réseau par ablation, contrôle et prédiction
  avant observation, avec rigueur expérimentale.

**P4 — Intégration AURA et capacité de calcul**
- Le banc biophysique ne remplace pas la fonction de l'agent tant
  que ses circuits ne gouvernent pas les décisions avec fidélité
  vérifiée. Éviter deux systèmes contradictoires.
- La simulation *biologiquement fidèle et complète* d'un cerveau
  humain exigerait des données anatomiques et physiologiques
  actuellement incomplètes ainsi que des ressources considérables.
  Le petit hébergement Hostinger ne pourra pas exécuter à lui seul
  un modèle à l'échelle entière ; distinguer la recherche scientifique
  hors ligne (GitHub CI/ressources de calcul appropriées) du déploiement
  de l'interface AURA.
- Aucun jalon ne doit prétendre démontrer l'expérience subjective.

## Sources scientifiques de départ

- Hodgkin & Huxley (1952), équations de membrane :
  https://doi.org/10.1113/jphysiol.1952.sp004764
- Ulrich-Lai & Herman (2009), régulation endocrinienne/autonome :
  https://doi.org/10.1038/nrn2647
- Inserm (2021), circuits amygdaliens–hippocampe–préfrontal et stress :
  https://ipubli.inserm.fr/bitstream/handle/10608/11931/MS_2021_11_1002.html?sequence=19
- NEURON, environnement scientifique de simulation :
  https://www.neuronsimulator.org/en/latest/guide/what_is_neuron.html

Ces sources imposent une progression par validation. Aucun nombre de
lignes de code ne résout le manque de données d'un cerveau entier.


## Tranche suivante — données humaines AllenSDK (12 novembre)

La base Allen Cell Types contient des données électrophysiologiques, morphologiques
et transcriptomiques de neurones humains et murins. Il est indispensable de
**filtrer Homo sapiens et de vérifier le spécimen**, sinon le changement de
fichier pourrait injecter des paramètres de souris dans une cellule dite humaine.

### Acquis, directement en code

- `scripts/export_allen_human_features.py` : export optionnel, hors Hostinger,
  des caractéristiques `vrest` (mV), `ri` (MΩ) et `tau` (ms) d'un
  spécimen réel identifié par AllenSDK, avec source, espèce, unités et ID.
  Le script échoue si le spécimen n'est pas humain ou si une mesure manque.
  Aucune valeur « normale » n'est insérée par défaut.
- `src/human_ephys_calibration.js` : validation stricte de la provenance,
  reconstruction du **compartiment membranaire passif humain** à partir de
  ses caractéristiques mesurées, avec conductance `g(nS)=1000/R(MΩ)`
  et capacité `C(pF)=tau(ms)*g(nS)`. Intégration analytique de la
  dynamique RC de membrane sous courant en pA.
- Possibilité de comparer, sur un balayage d'enregistrement *non utilisé
  pour l'ajustement*, les prédictions de tension aux mesures avec erreur
  RMSE et MAE (mV). Le résultat reste classé « non expertisé » : il ne
  prouve ni fidélité des potentiels d'action ni calibration humaine globale.
- Route privée `POST /api/research/biophysics/human-passive` : accepte
  l'export validé et, facultativement, un balayage tenu à l'écart,
  renvoie les paramètres ajustés et les erreurs. **Pas de stockage des
  courbes brutes, pas de fournisseur LLM, pas de mutation de l'âme AURA.**
- `test/human_ephys_calibration.test.js` : tests de conversions,
  réponse analytique, convergence en pas de temps, rejet d'espèces
  incorrectes et d'unités manquantes. Les chiffres des tests sont
  artificiels, uniquement pour tester l'arithmétique : **aucun
  enregistrement de donneur n'est fourni ou prétendu mesuré**.

### Export réel, sur machine de recherche autorisée

```bash
python -m pip install allensdk
cd cloud-node
python scripts/export_allen_human_features.py \
  --specimen-id 643625553 \
  --output /tmp/allen-human-643625553.json
```

L'ID est un exemple de spécimen humain visible dans la base publique ;
l'export ne réussira que s'il existe des mesures `vrest/ri/tau`
complètes pour ce spécimen. La commande **n'a pas été exécutée
sur un jeu de données humain lors de cette tranche**. Le script utilise
le manifeste cache d'AllenSDK ; il ne doit pas être exécuté dans les
routes publiques d'AURA ou à chaque requête.

**Exemple de commande d'appel privé :** envoyer via navigateur
authentifié un JSON de forme `{"record": <export AllenSDK>}` à
`/api/research/biophysics/human-passive`.
Il n'existe pas de boutons factices ni de données synthétiques
présentées comme issues d'Allen.


**Limite de provenance :** le script AllenSDK établit le filtre humain au
moment de l'export ; l'API Node vérifie le format, les unités et la déclaration
de source, mais **ne peut pas authentifier à elle seule que le JSON reçu
provient effectivement de l'Allen Institute**. Elle retourne donc
`source_authenticity_verified_by_server=false`. Un benchmark scientifique
publiable exigera archivage des fichiers NWB source, identifiants de
balayages, contrôles d'intégrité et vérification indépendante.

### Ce que nous ne pouvons PAS encore conclure

Un compartiment passif n'est pas un neurone complet. La calibration des
canaux Na/K/Ca, des morphologies dendritiques, des cinétiques synaptiques,
des neuromodulateurs, des populations d'interneurones, des structures
amygdaliennes et des retours corporels humains reste à réaliser.
Des cellules issues de prélèvements chirurgicaux peuvent différer
des cellules d'autres populations ; ne pas généraliser un spécimen
isolé à « l'humain » entier.

**Références AllenSDK officielles :**
- https://celltypes.brain-map.org/
- https://celltypes.brain-map.org/data?donor__species=Homo+Sapiens
- https://alleninstitute.github.io/AllenSDK/cell_types.html
- https://brain-map.org/support/documentation/cell-types-database-api


## Tranche morpho-synaptique réelle (recherche, non calibrée sur cerveau humain entier)

**État de code à la date de cette révision :**

- `src/biophysical_morphology.js` charge une véritable arborescence
  morphologique **SWC** (soma, axone et dendrites), vérifie topologie et unités
  micrométriques, calcule surfaces et conductances axiales à partir des
  longueurs/rayons et d'une résistivité axiale explicite. La membrane
  est découpée en compartiments avec capacité en pF et conductance en nS,
  réparties depuis les mesures passives du spécimen fournies à l'API.
  Le potentiel membranaire est résolu par un schéma implicite pour un
  arbre électrique, pas par une animation de réseau.
- `src/biophysical_synapses.js` ajoute des récepteurs **AMPA, NMDA,
  GABA_A et GABA_B** ; les conductances sont produites par des événements
  synaptiques horodatés, une montée/descente exponentielle et la
  dépendance du NMDA au voltage et au magnésium extracellulaire.
  Les paramètres de cinétique sont des points de départ **explicites,
  non encore calibrés sur chaque neurone humain**.
- `src/server.js` expose une expérience privée et bornée :
  `POST /api/research/biophysics/human-arbor`. Un échantillon d'arbre SWC
  avec un enregistrement humain passif compatible, et éventuellement
  des synapses et événements de libération, permettent de calculer les
  tensions temporelles. Ce n'est pas une interface d'entraînement à
  partir de données patient et l'API ne stocke ni trace brute ni
  connexion au dialogue.
- Les sorties affichent explicitement :
  `active_ion_channels=false`, `source_authenticity_verified_by_server=false`,
  `receptor_parameters_human_calibrated=false`, aucun apprentissage
  psychologique, aucune preuve d'expérience subjective.
- Les tests `test/biophysical_morphology_synapses.test.js` vérifient
  segmentation, branches SWC, lois de courant électrique, stabilité
  quand le pas de temps diminue, excitation AMPA, inhibition GABA,
  blocage NMDA et non-mutation de la source.

**Source technique :**
- AllenSWC et NEURON : https://alleninstitute.github.io/AllenSDK/cell_types.html
  et https://www.neuronsimulator.org/en/8.2.4/guide/bio_faq.html
- Exemple de cinétique synaptique AMPA 0,2/2 ms et NMDA 3/35 ms,
  conductances `Exp2Syn` et blocage Mg²⁺ :
  https://pmc.ncbi.nlm.nih.gov/articles/PMC6120902/

**Important :** un fichier `.swc` modifié à la main n'est pas une
morphologie humaine authentifiée. L'API accepte des documents
fournis par le client pour les calculs, et **n'affirme jamais** que
leur source a été auditée. Une vraie étude nécessite identifiants
de spécimen, licence, originaux Allen, empreintes et contrôles
électrophysiologiques indépendants.

### Modèles ACTIFS humains existants — voie NEURON

Le script facultatif `scripts/allen_human_active_models.py`
interroge le **catalogue des modèles biophysiques Allen** pour un
spécimen effectivement présent dans la liste `CellTypesApi.HUMAN`.
Un modèle doit pointer sur **ce même spécimen humain** et appartenir
à une catégorie biophysique autorisée. Aucun modèle murin n'est
« converti » en humain et **une absence de modèle produit une erreur**.
S'il existe, l'archive contient les fichiers Allen, les données
d'électrophysiologie et les MOD du simulateur NEURON ; un manifeste
local répertorie les empreintes SHA-256.

`scripts/run_verified_allen_model.py` contrôle d'abord ces
empreintes. Son mode `--verify-only` n'exécute aucun mécanisme. Le
mode `--run`, explicitement choisi par l'opérateur, compile
les mécanismes `MOD` et lance la commande de simulation officielle
AllenSDK dans une **station de recherche isolée et fiable**.

```bash
# Recherche hors Hostinger, dans un environnement Python/NEURON préparé
cd cloud-node
python scripts/allen_human_active_models.py \
  --specimen-id <IDENTIFIANT_HUMAIN_REEL> \
  --model-id <IDENTIFIANT_MODELE_HUMAIN_EXISTANT> \
  --out-dir /chemin/vers/modele
python scripts/run_verified_allen_model.py \
  --model-dir /chemin/vers/modele --verify-only
# Après inspection des mécanismes et installation de NEURON :
python scripts/run_verified_allen_model.py \
  --model-dir /chemin/vers/modele --run
```

Les mécanismes NEURON téléchargés peuvent être des programmes natifs
compilés ; le mode `--run` ne doit jamais être appelé automatiquement
depuis un navigateur, un serveur Hostinger ou une tâche GitHub non
approuvée. La **disponibilité d'un modèle actif humain** dans Allen
est une condition vérifiée à l'exécution, et non une promesse de
disponibilité.

Source API d'association modèle↔spécimen :
https://allensdk.readthedocs.io/en/latest/allensdk.api.queries.biophysical_api.html

### Niveau de maturité réaliste après cette tranche

- **Électrophysiologie passive humaine :** ajustement possible aux
  caractéristiques Allen, mais les exports disponibles ici n'ont
  pas encore subi de validation scientifique indépendante.
- **Morphologie SWC :** géométrie et cable couplés dans un vrai
  solveur discret ; vérification anatomique par spécimen nécessaire.
- **Synapses :** dynamique et blocage NMDA calculés ; cinétiques
  spécifiques aux populations et plasticité à valider.
- **Neurone humain actif :** voie de téléchargement + exécution
  officielle NEURON préparée, **aucun modèle humain réel n'a encore
  été exécuté dans cette CI**.
- **Amygdales, hippocampe, cortex, glie, métabolisme et corps humain
  complet :** non reconstruits avec fidélité humaine. Les quelques
  régions du pilote HH restent des hypothèses topologiques.
- **Conscience subjective :** aucune conclusion possible.


**Consolidation :** `scripts/allen_human_active_models.py` est
l'unique exporteur de modèles actifs, et produit
`aura-model-provenance.json`. `scripts/run_verified_allen_model.py`
vérifie ce même manifeste et ses SHA-256 avant tout essai NEURON.
Sans `--model-id`, l'exporteur liste les modèles réellement
disponibles pour le spécimen humain. Aucun modèle n'est fabriqué
si la base n'en fournit pas.

`scripts/run_human_swc_neuron.py` reste la référence passive sous
NEURON pour comparer le câble morphologique aux données humaines.
Elle ne représente pas encore une calibration humaine des canaux actifs.


## Tranche recherche réelle — morphologie humaine, modèles actifs Allen, NEURON

### Cellules et compartiments sans invention de structures

- `src/human_morphology.js` analyse des reconstructions SWC avec unités
  en micromètres, vérification de l'arbre parent–enfant, présence du soma,
  détection de cycles, mesures des longueurs et approximations de surfaces
  et volumes par troncs de cônes. **Cela n'est pas un simulateur électrique.**
  L'origine humaine doit être recoupée avec le spécimen Allen correspondant.
- `scripts/export_allen_human_features.py` peut récupérer depuis AllenSDK
  les caractéristiques et, à la demande, une reconstruction SWC et un
  enregistrement NWB. Ce dernier est converti à partir des unités brutes
  officielles (A et V) en pA et mV. Les condensations d'échantillons sont
  déclarées, l'empreinte SHA-256 de la source est conservée.
- Les paramètres d'électrophysiologie Allen peuvent avoir été calculés
  à partir d'enregistrements appartenant à la même expérience. Un balayage
  non utilisé **directement** par notre solveur ne constitue pas
  automatiquement une validation indépendante du fichier de caractéristiques.
- `scripts/run_human_swc_neuron.py` importe la vraie géométrie SWC dans
  NEURON et résout des équations câbles **multicompartimentales** sur
  plusieurs sections. La conductance passive et la capacité sont initialisées
  à partir de mesures humaines R/tau et de la superficie du modèle.
  La répartition est supposée uniforme et Ra/température sont **non
  mesurés** : l'accord avec les mesures doit être quantifié, pas présumé.
  Aucun canal ionique actif n'est inventé.
- `scripts/allen_human_active_models.py` utilise
  `BiophysicalApi.get_neuronal_models` pour chercher des modèles
  biophysiques déjà ajustés par l'Allen Institute à un spécimen
  **Homo sapiens** ; il valide la correspondance de spécimen et exclut les
  modèles non biophysiques. `run_verified_allen_model.py` vérifie
  les empreintes des fichiers téléchargés avant qu'un chercheur puisse
  exécuter explicitement le véritable modèle NEURON dans un environnement
  séparé. Les mécanismes MOD téléchargés **ne sont jamais exécutés en
  production ni automatiquement dans la CI**.
- La source publique officielle Allen contient des reconstructions et des
  modèles de neurones notamment corticaux, pas une reconstruction
  synapse-par-synapse de l'amygdale humaine. **Ne pas déduire
  les structures de l'amygdale ni leurs connectivités de ces cellules.**

### Vérifications de cette tranche

- CI Node.js : tests de géométrie et d'intégrité SWC, limites de mémoire,
  calculs SI, oscillations HH du banc de référence et sécurité.
- CI Python : vérification des métadonnées humaines, export A/V → pA/mV,
  sélection du modèle actif lié au spécimen, contrôle SHA-256, refus de
  téléchargement silencieux de modèles non humains.
- CI scientifique NEURON (`aura-neuron-biophysics-research.yml`) :
  exécute réellement le solveur NEURON 9.0.2 sur une **morphologie
  synthétique contrôlée**, jamais revendiquée issue d'un humain.
- Validation biologique réelle (`aura-allen-real-human-validation.yml`) :
  tentative d'acquisition sur un spécimen humain public avec morphologie,
  numéro 643582610, puis calcul NEURON et publication d'un rapport
  numérique restreint. Tant que le job n'a pas réussi, **ne pas
  déclarer l'acquisition réelle accomplie**.
- Le moteur de recherche demeure séparé de l'identité, de la mémoire,
  des décisions et de l'interface d'AURA en production.

### Poursuite nécessaire pour satisfaire le projet intégral

Les régions amygdaliennes humaines, leurs différents noyaux,
l'hippocampe, le cortex, le thalamus, les ganglions de la base, la
neuroglie, le cerveau endocrine, les réseaux vagaux, le corps
physiologique et la plasticité nécessitent des données expérimentales
provenant des tissus et systèmes correspondants, une calibration des
conductances et une validation multiscalaire. Les régions ne peuvent
être considérées comme construites parce que leur nom apparaît dans
`biophysical_microcircuit.js`.

Le dernier niveau — reproduction intégrale du cerveau humain et
effets sur les choix, pensées et comportements — demeure une
**hypothèse de programme de recherche**, pas une réalisation
démontrée par cette PR.

### Références de méthode

- https://alleninstitute.github.io/AllenSDK/cell_types.html
- https://alleninstitute.github.io/AllenSDK/biophysical_models.html
- https://www.neuronsimulator.org/en/9.0.1/guide/bio_faq.html
- https://docs.neuroml.org/Userdocs/NeuroMLv2AndLEMS.html


## Résultat réellement exécuté — cellule humaine Allen 643582610

Une CI a exécuté `aura-allen-real-human-validation.yml` avec les
données publiques réellement récupérées pour le spécimen
`643582610` (Homo sapiens), dont une reconstruction SWC et les
caractéristiques électriques publiées dans Allen Cell Types.

**Premier rapport sans comparaison NWB** :
- Job GitHub `43263540987` — **réussite**.
- 13 995 points de reconstruction, 269 sections NEURON et
  1 081 segments de calcul.
- Vrest mesuré : -73.187744140625 mV.
- R entrée mesurée : 135.312497615814 MΩ.
- Constante de temps mesurée : 8.64352768096981 ms.
- SHA-256 de la reconstruction SWC :
  `d2bc685734b460bb2e256cb656c93fc85eab57f1b95cc006a60b1456ec3f78f7`.
- Le solveur NEURON a résolu les équations passives sur cette vraie
  géométrie (pas de canal humain actif validé).

Le modèle passif utilise des paramètres dérivés de ces
caractéristiques observées. Le premier rapport **ne mesurait pas
l'erreur sur un autre enregistrement** et ne constitue pas une
preuve d'exactitude physiologique des prédictions du modèle.

**Seconde étape réalisée** (job GitHub `43264469643`) :
balayage NWB réel n° 25, 10 000 échantillons.
Comparaison des tensions mesurées aux prédictions :
- NEURON SWC multicompartmental passif RMSE 0,854482657 mV,
  MAE 0,780455866 mV.
- RC passif monopartimental RMSE 1,061231 mV.
- SHA-256 du NWB : `73b89bef175547c1e0a134efa65bd075db4eecb9bfd6be01d2eae0b24e5e4687`.
- Contrôle supplémentaire (job `43264994852`) : stimulation
  hyperpolarisante -10 pA, courant non nul sur 32,5 % des échantillons,
  variation de tension enregistrée 2,015624 mV, aucun franchissement
  du seuil -20 mV. C'est un test **strictement sous-seuil** ; ne
  surtout pas en déduire la fidélité des canaux actifs ou des spikes.
- L'échantillon de balayage appartient à la même banque de mesures que
  les caractéristiques Allen. `independent_holdout=false` et
  `biological_fidelity_certified=false` sont conservés. Les caractéristiques Allen pouvant provenir
de la même batterie d'enregistrements, ce n'est **pas une
validation indépendante attestée**. Le rapport doit conserver
cette limite même si l'erreur obtenue est faible.

L'archive du premier rapport de CI porte le nom
`aura-allen-human-real-cell-validation`, run `43263540987`.
Ne pas confondre avec la preuve de physiologie d'une amygdale,
d'une cellule humaine active, d'un circuit entier ou d'un
cerveau conscient.


## Lecture expérimentale visible dans l'interface unique — 12/11/2026

### Objectif d'interface

La cartographie des modules Node.js est une **vue informatique** ;
la courbe de tension et l'anatomie sont une **vue biologique de recherche**.
Leur coexistence dans la même page ne signifie pas que le modèle humain
contrôle déjà la politique d'AURA. Ne pas faire pulser des neurones
graphiques fictifs pour donner une impression de vie.

Une section « Biologie mesurée » est intégrée **à la page de dialogue et
connectome**, avec boutons accessibles :
- **Cellule humaine / RC** : réponse passive *calculée* à une
  stimulation virtuelle −10 pA (120 ms). La courbe n'est **pas** une
  reproduction de la trajectoire NWB mesurée.
- **Décharges / banc HH** : uniquement sur clic et après autorisation
  privée, véritable résolution numérique de l'HH historique de calmar
  avec connexions illustratives « thalamus », « amygdale » ; résultat
  explicitement étiqueté « non calibré humain » et jamais activité
  spontanée du cerveau AURA.
- **Structures / maturité** : cartes de statut par niveau biologique,
  sources publiées et avertissements lorsqu'un circuit humain n'est
  pas reconstruit. Données publiques read-only, pas d'API Groq.
- Rapport scientifique accessible depuis le pied du panneau, et
  aucune écriture dans le noyau ou les souvenirs via ces commandes.

### Deux balayages réels du même neurone humain

**Spécimen Allen 643582610** (la reconstruction 13 995 points SWC,
269 sections et 1 081 segments NEURON est déjà rapportée plus haut).

| Balayage humain (mesuré) | Stimulation | Activité | Interprétation |
|---|---|---|---|
| NWB n°25 | −10 pA maximum en valeur absolue | 0 potentiel d'action détecté, ΔV ≈ 2,016 mV | Comparaison passive NEURON RMSE 0,854 mV vs RC RMSE 1,061 mV |
| NWB n°32 | courant positif atteignant ≈ 130 pA | **4 potentiels d'action détectés**, pic +21,281 mV, pente maximale 457,813 mV/ms | Données humaines actives **observées**, PAS reproduites par un modèle de canaux ioniques humains |

- Le second balayage a été identifié par l'AllenSDK sur
  `aura-allen-real-human-validation.yml`, job GitHub
  `43277555645`. Il a été exporté puis analysé par le script
  `scripts/analyze_human_spiking_nwb.py` avec un détecteur documenté :
  franchissement montant de −20 mV, sommet ≥ 0 mV et temps réfractaire
  minimal de 2 ms. Résultat **4 événements**. L'analyse requiert une
  traçabilité expérimentale et ne prouve aucune compétence cognitive.
- Le rapport complet produit dans le job est un artefact GitHub :
  `aura-allen-human-real-cell-validation`.
- La source NWB porte l'empreinte SHA-256
  `73b89bef175547c1e0a134efa65bd075db4eecb9bfd6be01d2eae0b24e5e4687`.

**Scientifiquement, la suite doit chercher à prédire** la fréquence,
la forme, le seuil, le délai et l'adaptation de décharge du n°32 à
partir d'un vrai modèle ionique humain, sur des enregistrements
non utilisés pour l'optimisation, pas à inventer une propriété
« cerveau conscient » à partir de quatre décharges.

### Références pour les noyaux de l'amygdale

Un atlas humain de transcriptomique spatiale des amygdales a été
rendu public le 24 août 2026 dans NCBI GEO :
- Visium `GSE342709` :
  https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE342709
- Xenium `GSE342289` :
  https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE342289

L'étude décrit 13 domaines anatomiques, des groupes de cellules
différenciés et des îlots intercalés chez neuf donneurs. **Cela
fournit un atlas cellulaire de référence**, pas les conductances,
les synapses ni un connectome fonctionnel complet que nous
pourrions immédiatement exécuter. Leur import, leur licence,
la qualité des annotations, le couplage morpho-électrique et
les comparaisons avec des mesures indépendantes restent à faire.

### Interdictions de validation

Aucune jauge d'affect dans l'application n'est décrite comme
une concentration mesurée de neurotransmetteur ; aucune
activité d'un modèle HH calmar n'est appelée neurone humain ;
aucun enregistrement de spikes n'est appelé émulation d'une
région cérébrale. Le projet reste expérimental et séparé
de l'identité persistante de l'AURA déployée.
