# AURA — Circuiterie multi-régions et plasticité biologique de recherche
Date : 17 novembre 2026. Branche empilée sur PR #259. Aucun déploiement Hostinger.

## Correction concrète apportée
- **STP et STDP événementiels** (`neural_plasticity.js`). Ressources de libération présynaptique, facilitation et récupération, traces temporelles pré/post, potentiation lorsque le pré précède le post et dépression en ordre inverse. Les impulsions simultanées restent sans modification temporelle arbitraire. Effets testables par ablation. Coefficients *illustratifs*, non ajustés aux données humaines.
- **Six couches corticales** : populations L1 à L6 différenciées avec relais thalamique et inhibition réticulaire, interneurones et boucle corticothalamique. Modèle de taux de populations, non neurones humains individuels.
- **Hippocampe** : entorhinal → gyrus denté → CA3 (récurrence) → CA1 → subiculum, voie directe entorhinale et inhibition de CA1.
- **Ganglions de la base** : striatum D1 → GPi (voie directe), D2 → GPe → STN/GPi (voie indirecte), cortex → STN → GPi (voie hyperdirecte), inhibition pallidale vers thalamus moteur. Aucun système dopaminergique humain ajusté.
- **Cervelet** : fibres moussues → granulaire → Purkinje → noyaux profonds, voie olive inférieure et collatérale moussue vers noyaux. Mécanismes non validés sur cellules Purkinje humaines.
- **Amygdale** : noyau basolatéral, cellules intercalées, noyau central et hypothalamus PVN ; rapports qualitatifs, pas de connectome humain.
- **Glie et métabolisme** : simulations de réserves relatives oxygène, glucose, ATP, lactate ; consommation par activité, modulation de l'excitabilité et intégration expérimentale du tampon potassium/glutamate du module glial. Aucun réseau vasculaire anatomique, aucune cinétique humaine validée.
- **Plasticité mesoscopique** : une règle de coactivité pour certaines projections du réseau ; ne pas la confondre avec le STDP événementiel du module indépendant.
- **Causalité** : expérimentation sur les mêmes états initiaux avec suppression d'une projection, sortie `delta` par population, contrôle de provenance et des limites de charge.
- **Routes** : `POST /api/research/neurobiology/circuits` et `POST /api/research/neurobiology/plasticity`. Propriétaire authentifié, même origine, aucune écriture dans l'organisme, aucune inférence LLM.
- **Audit 32 systèmes** mis à jour : les nouveaux éléments sont classés `research-toy`, jamais `human-measurement-fitted-subset` ni `validated human`.

## Pour atteindre de véritables équivalences et non un simple vocabulaire
1. Électrophysiologie active humaine : obtenir et ajuster des balayages NWB de plusieurs neurones identifiés, avec traçabilité espèces/échantillons et scores hors entraînement (taux et formes de décharge, activité adaptative, seuils, RMSE). Les essais historiques d'AURA ont échoué sur la fidélité des décharges. Les données Allen ne fournissent **pas** à elles seules un circuit complet.
2. Synapses : mesurer paramètres de libération/vésicules, conductances et STP/STDP par types cellulaires et région. Les constantes du modèle de recherche sont **à remplacer** par les valeurs et incertitudes mesurées.
3. Atlas Allen : les **3313 sous-clusters** sont une taxonomie transcriptomique, non des cellules et synapses directement implantables. Utiliser l'API Allen `AbcProjectCache` avec vérification des hashes du manifeste ; licence des taxonomies **CC BY-NC 4.0** à respecter, particulièrement avant tout usage commercial. Ne pas incorporer les ~70 Go de matrices brutes sur Hostinger.
4. Développement : connecter identité génétique réellement annotée, données transcriptomiques spécifiques de l'âge/cellule, synaptogenèse/élagage, myéline et maturation avec observation longitudinale. Le génotype numérique actuel de 24 loci reste un outil de laboratoire, pas 20 000 vrais gènes.
5. Validation scientifique : plusieurs sujets et types cellulaires, out-of-distribution, ablation et contrôles, provenance immuable, comparaison sur paramètres humains mesurés. Ne pas déclarer modèle du cerveau humain complet ou conscience subjective.

## Sources primaires
- Allen Cell Types / NWB : https://alleninstitute.github.io/AllenSDK/cell_types.html
- Allen Human Brain Taxonomy : https://alleninstitute.github.io/abc_atlas_access/descriptions/WHB-taxonomy.html
- Allen S3 data / manifest : https://alleninstitute.github.io/abc_atlas_access/notebooks/getting_started.html
- HH 1952 : https://doi.org/10.1113/jphysiol.1952.sp004764

**Politique de sûreté** : toutes les simulations sont séparées des actions, de la mémoire, de la parole et du « cerveau en direct » d'AURA ; pas de coût API, pas de VPS. Un workflow vert teste le logiciel, pas la biologie humaine.
## Référence génomique réelle : données NCBI sans invention d'ADN
Le nouveau module `human_reference_genome.js` **n'est pas un génome d'AURA** ; il contrôle, *hors ligne*, un fichier FASTA réel de la référence humaine GRCh38.p14. Le vérificateur travaille en flux même sur un `.gz`, vérifie les 24 chromosomes nucléaires plus le chromosome mitochondrial (accessions RefSeq et longueurs officielles), refuse les bases invalides, les doublons et les références tronquées en mode strict, et compare une empreinte SHA-256 à une valeur indépendante fournie par l'opérateur. Le fichier ADN et son contenu **ne sont pas mémorisés, réinjectés dans AURA ou exposés via HTTP**.

Source des longueurs (NCBI GRC) : https://www.ncbi.nlm.nih.gov/grc/human/data . La somme du génome primaire ne doit pas être confondue avec les séquences alternatives et correctifs de l'assemblage. Vérifier l'origine du SHA fourni auprès de NCBI : comparer deux valeurs produites localement ne prouve pas la provenance d'un fichier.

La réussite du contrôle d'intégrité ne prouve **ni l'expression des ~20 000 gènes humains, ni le développement de tissus, ni des canaux ioniques humains, ni une identité biologiquement humaine**. L'éventuelle conversion des données en mécanismes adaptatifs demande les données transcriptomiques, de protéomique, d'électrophysiologie et des validations expérimentales supplémentaires. Aucun fichier de plusieurs Go n'est fourni ou chargé en production.
