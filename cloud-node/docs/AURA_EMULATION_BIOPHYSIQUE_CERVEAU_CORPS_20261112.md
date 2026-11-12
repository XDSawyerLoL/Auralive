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
