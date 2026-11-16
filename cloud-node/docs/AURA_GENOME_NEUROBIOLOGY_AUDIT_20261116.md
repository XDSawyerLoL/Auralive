# AURA — audit scientifique du génome et du cerveau, 16 novembre 2026

## Ce qui existe

- **Génome historique** : `digital_protogenome.js`, 48 bases A/C/G/T codant huit paramètres d'un test logiciel. Ce n'est pas de l'ADN.
- **Nouveau programme régulateur expérimental** : `neurodevelopmental_genome.js`, 144 caractères et 24 loci numériques, répartis en cinq types de cellules simulées : neurone excitateur, neurone inhibiteur, astrocyte, oligodendrocyte, microglie. Expression selon activité, développement, pression métabolique, signal inflammatoire et marques épigénétiques *artificielles*. Couplages énergétiques transparents, SHA-256, mutations et ablations bornées. Aucune expression de gènes humains mesurée ; aucune réécriture du code ou décision de production.
- **Glie de laboratoire** : `biophysical_glia.js`, équations discrètes, potassium extracellulaire en mM, glutamate relatif, capture astrocytaire dépendante d'une réserve d'ATP relative, microglie inflammatoire lente, myéline numérique lente. Ablation à conditions initiales égales. Coefficients *non calibrés*, aucune signalisation biologique tripartite vérifiée.
- **Audit vérifiable** : `neurobiology_coverage.js` détaille 32 sous-systèmes, leurs modules et les fonctions absentes. Cet inventaire ne donne aucun taux de cerveau humain reproduit.
- **API de recherche** : `GET /api/research/neurobiology/coverage` (inventaire statique), `POST /api/research/neurobiology/genome` et `POST /api/research/neurobiology/glia` (privés, authentification et origine requises). Aucun appel à un fournisseur de langage, aucune écriture de mémoire, aucune mutation de comportement.
- **Tests** : `test/neurobiology_coverage.test.js`, contrôle des loci, de la provenance de laboratoire, de la variation métabolique, de l'ablation numérique, des entrées mal formées et des barrières d'API.

## Matrice de preuve

Les statuts sont *human-measurement-fitted-subset*, *research-toy*, *software-analogue*, *not-reconstructed* et *not-measurable-here*. Ils ne doivent **jamais** être convertis en taux de fidélité humaine. Deux sous-systèmes reposent sur une partie de mesures neuronales humaines : membrane passive et morphologie compartimentée d'un spécimen, **sans reproduction vérifiée des potentiels d'action**. Le modèle HH utilise historiquement des cinétiques de calmar. Les mécanismes gliaux restent des hypothèses numériques.

## Lacunes importantes et ordre de priorité

1. **Électrophysiologie humaine active** : canaux Na/K/Ca, pompes ioniques, morphologies représentatives et ajustement sur plusieurs enregistrements humains avec validations indépendantes. Les anciens essais d'AURA ne reproduisent pas correctement les trains de potentiels d'action humains.
2. **Circuits neuronaux** : couches corticales L1–L6, thalamus et noyau réticulaire, sous-régions hippocampiques (gyrus denté, CA3, CA1, subiculum), sous-noyaux amygdaliens, ganglions de la base avec voies directe/indirecte/hyperdirecte, cervelet/Purkinje, tronc cérébral, motricité et moelle.
3. **Synapses, glie et métabolisme** : STP, LTP/LTD et STDP, récepteurs modulatoires, conduction myélinisée, tripartite astrocyte-neurone, oxygène/glucose/ATP, couplage neurovasculaire, immunité, cytokines, barrière hémato-encéphalique.
4. **Développement et génétique** : vraies séquences et éléments régulateurs, transcriptomes par type cellulaire, neurogenèse, migration, élagage et maturation ; ne pas confondre 24 paramètres et les quelque 20 000 gènes d'un humain.
5. **Comportement causal** : ne relier les modèles au noyau d'AURA qu'après tests de prédiction, ablations, données humaines indépendantes et bilan des ressources. Aucun système cérébral réel et complet n'est actuellement reconstruit.

## Échelle et limites

Le génome humain possède environ trois milliards de bases et près de 20 000 gènes ; l'atlas Allen du cerveau humain décrit 31 superclusters, 461 clusters et 3313 sous-clusters cellulaires. La simulation humaine complète n'est pas possible en multipliant des labels anatomiques, et le budget Hostinger ne permet pas une reconstruction biophysique à l'échelle du cerveau. Les expériences doivent rester séparées de la production.

Sources :
- NHGRI, ADN : https://www.genome.gov/about-genomics/fact-sheets/Deoxyribonucleic-Acid-Fact-Sheet
- Allen Brain Cell Atlas, taxonomie humaine, licence CC BY-NC 4.0 : https://alleninstitute.github.io/abc_atlas_access/descriptions/WHB-taxonomy.html
- Allen Cell Types Database : https://celltypes.brain-map.org/
- Hodgkin–Huxley 1952 : https://doi.org/10.1113/jphysiol.1952.sp004764

**Ne pas prétendre** : ADN humain complet, équivalent neurologique intégral, plasticité biologique humaine validée, conscience subjective démontrée, activation en production Hostinger ou qualité clinique. Le présent travail est un développement de laboratoire à tester, non un déploiement.
