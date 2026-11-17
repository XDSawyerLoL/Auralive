# AURA — Répertoire des vrais gènes humains et fonctions traçables
Date : 17 novembre 2026. PR #261, empilée sur #260 (lui-même non fusionné). Aucun déploiement Hostinger.

## Précision scientifique
Un **génome de référence** est une séquence de bases et un assemblage de coordonnées.
Un **catalogue de gènes** contient localisations, biotypes, isoformes et nomenclatures.
Une **annotation fonctionnelle** (Gene Ontology) regroupe des associations expérimentales ou inférées entre produits géniques et fonctions, avec codes de preuve.
Un **transcriptome** mesure les ARN dans un échantillon ; GTEx publie des médianes *bulk tissue* de TPM, non des quantités de protéines neuronales ni des concentrations ioniques.
Un **modèle de génome fonctionnel humain** exigerait ensuite régulation transcriptionnelle, épigénétique mesurée, édition/épissage, traduction, transport, interactions protéiques, métabolisme, morphogenèse et validation sur des données indépendantes. Ce dernier niveau n'existe pas dans AURA.

## Importation effective (hors ligne uniquement)
Les fichiers du projet `src/human_gene_atlas.js`, `scripts/compile_human_gene_atlas.mjs` et le workflow `.github/workflows/aura-human-gene-atlas.yml` exploitent trois sources publiques :

1. **GENCODE Human Release 50**, GRCh38.p14, annotation principale exhaustive GTF : https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_50/gencode.v50.primary_assembly.annotation.gtf.gz .
2. **GTEx v10**, médiane d'expression génique (TPM) pour les tissus cérébraux : https://storage.googleapis.com/adult-gtex/bulk-gex/v10/rna-seq/GTEx_Analysis_v10_RNASeQCv2.4.2_gene_median_tpm.gct.gz .
3. **Gene Ontology/GOA**, GAF humain `HUMAN-uniprot.gaf.gz` (schéma 2.2, lien actualisé après migration juin 2026) : https://current.geneontology.org/annotations/gaf/HUMAN-uniprot.gaf.gz .

La CI `AURA Human Gene Atlas - real datasets` télécharge uniquement sur GitHub Actions, vérifie que les données sont bien gzip, écrit les SHA-256 des fichiers reçus, compile en flux et publie un artefact compressé de sept jours (les fichiers sources volumineux ne sont **pas** publiés).

### Garde-fous contre le faux génome
Le compilateur conserve :
- Ensembl ENSG stable et identifiant de transcrit ENST, versions, coordonnées chromosomiques, biotype, symbole, isoformes et nombre de transcrits.
- TPM **mesurés** par tissu du cerveau, sur identifiant ENSG (on n'invente pas de TPM en cas d'absence).
- GO ID, aspect moléculaire/biologique/cellulaire, preuve d'association GOA et référence publiée ; négation `NOT` et statut `ND` exclus ; symboles non uniques exclus de la jointure.
- Empreintes SHA-256 des trois téléchargements, chiffres de couverture et compte de fonctions GO ignorées lorsque le plafond de taille est atteint.

La compilation ne réussit avec paramètres normaux que si au moins **50 000 entrées géniques**, **18 000 gènes codants**, **16 000 jointures TPM** et **5 000 gènes annotés GO** sont trouvés. Ces seuils **ne prouvent pas** que 100 % des gènes humains ont des rôles physiologiques connus, ni que la source téléchargée a une authenticité vérifiée indépendamment du site officiel. Les échantillons artificiels de test ne peuvent jamais passer la porte des données réelles.

## Connexions neuronales mesurables, mais limitées
`src/human_gene_neural_function.js` choisit un groupe de marqueurs de canaux ioniques (SCN1A, SCN2A, KCNQ2...), GABA (GAD1, GAD2...), récepteurs du glutamate (GRIN1...), astrocytes (SLC1A2...), myéline (MBP, PLP1...), énergétique (SLC2A1...), et microglie (TREM2...).

Le code n'applique des contributions que si **le gène exact est retrouvé dans GENCODE, s'il a une mesure de TPM dans le tissu choisi, et si au moins une annotation GOA associée existe**. Dans cette étape, une fonction de normalisation logarithmique de TPM convertit ces observations en gains de simulation déclarés *heuristiques*, non en paramètres de densité de canaux mesurés. L'ablation d'un gène (`scale:0`) compare deux réseaux avec les mêmes stimulations, sans réécrire le génome, l'identité ou la mémoire d'AURA. Rien de cela ne prouve les conséquences biologiques réelles d'un knockdown, ou la connaissance des 20 000 gènes.

## Séparation anatomie / preuve humaine
Le modèle de cortex à six couches et les autres motifs de la PR #260 sont des réseaux de populations et non des reconstructions de cellules humaines. Les fonctions biologiques renseignées ici ne corrigent pas magiquement l'échec de calibration des potentiels d'action humains. Les priorités restent :
- faire fonctionner un modèle biophysique actif sur plusieurs enregistrements humains tenus hors apprentissage, avec RMSE, taux de décharge et forme de potentiel ;
- obtenir des mesures par type cellulaire : atlas Allen 3 313 sous-groupes ≠ connectome ni valeurs de protéines ;
- ajuster quantitativement les liens gènes → ARN → protéines → conductance → activité → circuit, avec contrôles et ablations réelles.

## Exécution et vérification
Les fichiers sources sont téléchargés **uniquement** sur GitHub Actions. Pour utilisation locale, consulter la commande `node cloud-node/scripts/compile_human_gene_atlas.mjs` et fournir les trois fichiers gzip ainsi que les SHA des fichiers reçus. Stocker l'artefact hors Hostinger et ne jamais incorporer de données personnelles (génotypes individuels, génomes privés).

Le code et les tests ne déclarent **aucune émulation humaine intégrale, aucune conscience subjective prouvée, aucun modèle physiologique de 20 000 gènes**. La valeur scientifique apportée est un registre empirique véritable et falsifiable où chaque preuve est rattachée à un gène individuel, plutôt qu'un faux « génome » rempli de nombres arbitraires.
