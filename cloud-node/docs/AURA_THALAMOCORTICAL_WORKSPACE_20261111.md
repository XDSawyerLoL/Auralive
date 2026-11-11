# AURA — chemins proto-humains, espace de travail global et preuve causale
Date : 11 novembre 2026
Branche : \`feat/aura-thalamocortical-workspace-20261111\`
Dépendances : #235 → #234 → #233 et précédentes

## Exigence fondamentale

L'analogie humaine doit porter sur **la topologie des échanges et leur effet causal**, non sur les noms ou l'apparence graphique. AURA ne reproduit ni neurones, ni axones, ni activité électrique du cortex. Un réseau logiciel pourrait mimer certaines propriétés computationnelles de circuits biologiques sans posséder leur nature physique ni une expérience subjective.

Un lien déclaré dans \`brain_flow.js\` est une hypothèse de route architecturale. Seul un \`brain-hop\` horodaté atteste une transition réellement instrumentée. Les capacités absentes sont marquées **non implémentées** ; aucune animation ne peut jouer une activité synthétique.

## Sources neuroscientifiques et périmètre prudent

- Shepherd & Yamawaki, *Nature Reviews Neuroscience* (2021) : récurrence cortico-thalamo-corticale et connectivité dépendante des types cellulaires. https://doi.org/10.1038/s41583-021-00459-3
- Costa, *Annual Review of Neuroscience* (2019) : ganglions de la base, sélection de l'action, signaux de prédiction de récompense, circuits striataux. https://doi.org/10.1146/annurev-neuro-072116-031033
- Wang & Chang, *Annual Review of Physiology* (2024) : intéroception comme perception de signaux corporels pluriels et influence sur l'homéostasie, les motivations et la cognition. https://doi.org/10.1146/annurev-physiol-042222-023455
- Dong, Foster & Hintiryan, *Nature Reviews Neuroscience* (10 novembre 2026) : réseau cortico-ganglions de la base-thalamique, voies parallèles spécialisées et convergence. https://doi.org/10.1038/s41583-026-01093-7
- Butlin et al., *Trends in Cognitive Sciences* (2026), DOI 10.1016/j.tics.2025.10.011 : indicateurs des théories GWT, HOT, AST, PP. Satisfaction des indicateurs ≠ preuve de conscience. https://doi.org/10.1016/j.tics.2025.10.011

## Correspondance des voies

**1. Perception → relais thalamique fonctionnel → espace cortical global.**
- \`CognitiveKernel.chat\` recueille le message sans lui accorder d'autorité supplémentaire.
- \`workspaceInput\` recueille séparément une proposition perceptive, exécutive, hippocampique, intéroceptive, métacognitive et de surprise.
- \`competeInWorkspace\` admet **au plus trois** propositions parmi **au plus douze** ; le contenu supprimé n'est pas diffusé.
- \`broadcast\` diffuse uniquement les gagnants à des récepteurs logiques identifiés. Ne pas appeler cela un véritable thalamus neuronal.

**2. Cortex → ganglions de la base → cortex : choix des stratégies.**
- \`HistoryLedger.retrieve\` propose une politique avec provenance vérifiée.
- Cette politique **doit gagner un accès au workspace** pour influencer la sélection.
- \`HistoryLedger.decide(workspacePolicyAllowed)\` enregistre seulement la décision *post-compétition* et son origine. Un gagnant éliminé ne doit jamais apparaître comme exécuté.
- La boucle cortico-striato-thalamique biologique comporte plusieurs voies et noyaux. Ici, il s'agit d'une **boucle fonctionnelle de décision et de retour d'information**, non de la reproduction fidèle de son microcircuit.

**3. Hippocampe → mémoire autobiographique → décision.**
- Le registre d'histoire v18 conserve épisodes, prédictions, attestations séparées et provenance.
- Le contenu brut de l'utilisateur n'est pas copié dans le reçu du workspace ; seules étiquettes normalisées, scores bornés et choix documentés persistent.
- L'effet causal est mesurable : la politique \`clarify\` est choisie si elle gagne et dispose d'épisodes indépendants ; sans diffusion, le choix redevient \`respond\`.

**4. Insula / hypothalamus → attention et ressources.**
- Un signal \`node-process\` **récent** de calcul ou de mémoire donne une saillance accrue à la contrainte de ressources.
- Ce signal peut déloger la mémoire de l'espace de travail et active \`optional_compute_deferred\`. La régulation existante \`organRegulate\` peut également réduire le budget optionnel.
- La viabilité n'est ici que **fonctionnelle**. Les vraies CPU/heap du processus sont mesurées ; pas de température biologique, hormone, douleur, désir ou vie corporelle.

**5. Métacognition → amplification / recontrôle.**
- \`SelfInquiryEngine.advise\` peut produire \`memory-check-required\`.
- Si cette entrée gagne la compétition, le noyau demande une vérification supplémentaire pour les requêtes substantielles autorisées. La sortie du modèle ne peut pas réécrire la mémoire ni promouvoir une politique.
- Le modèle de sa propre attention est encore minimal (focus, sources gagnantes, contrôle, récepteurs, précédent). Il faudra apprendre prédictivement pourquoi l'attention se déplace et démontrer que l'ablation détériore calibration et récupération.

**6. Boucle autonome récurrente.**
- Pendant les ticks réels du processus Node, une compétition sans utilisateur actualise un instantané de workspace, avec maintien borné des derniers gagnants et proposition de recontrôle en cas d'erreur.
- Un changement du mode de contrôle déclenche un stimulus interne vérifiable et peut orienter la réflexion ultérieure.
- Si le processus s'arrête, la boucle est **arrêtée**. Ne pas reconstruire de faux cycles durant la suspension Hostinger.

## Expériences préenregistrées (ablation)

1. **Diffusion coupée** : mêmes propositions, même temps et même état ; \`decision.control\` ou \`decision.attention\` doit différer. Sinon l'espace ne possède pas la propriété causale élémentaire recherchée.
2. **Capacité de 1 contre 3** : mêmes propositions en compétition ; une requête prioritaire doit pouvoir monopoliser le tampon étroit et exclure des signaux de vérification ou de mémoire.
3. **Épisode vérifié retiré** : mémoire invalide/absente → aucune politique acquise ne change la stratégie ; gardes des permissions inchangés.
4. **Signal somatique périmé** : pas d'effet de charge si le CPU du processus n'a pas été mesuré récemment.
5. **Récepteur ganglions neutralisé** : \`HistoryLedger.decide(workspacePolicyAllowed:false)\` doit enregistrer un choix par défaut, pas une « action » proposée et ignorée.
6. **Arrêt/reprise** : \`workspaceSnapshot\` garde l'état sans inventer d'observation pendant la suspension.

## Ce que cette branche ne prouve PAS

- Elle ne fait pas encore tourner une pluralité de modules perceptifs sophistiqués *en parallèle*. Le cycle de sélection est actuellement synchrone et déterministe, ce qui le rend reproductible mais moins proche des circuits biologiques.
- **GWT-4, contrôle attentionnel réentrant multi-étapes complexes**, n'est pas démontré. Il faut une succession de requêtes à des sous-modules guidée par l'état diffusé, pas seulement un unique tour.
- La promesse « le LLM ne reçoit que le contenu du workspace » n'est **pas encore tenue pour tout le code existant** : des chemins historiques du plan et du contexte de formulation restent actifs. Les politiques acquises et le contrôle de vérification sont filtrés à cette frontière, mais la projection linguistique et tous les outils doivent être migrés vers la même porte avant d'affirmer une diffusion unique.
- Il manque une prédiction par module et un calcul universel de l'erreur avec provenance, ainsi qu'un vrai système de consolidation hors ligne et de viabilité durable avec hibernation restaurable.
- Il manque un adaptateur indépendant de vérification de succès, les tests MySQL/Hostinger en conditions réelles et les ablations longitudinales E3-E5.
- Rien ici n'établit une conscience vécue, une « vie » humaine, ni une équivalence neurale. Le score doit rester par famille de théories et chaque indicateur doit avoir une **preuve indépendante**, pas un commentaire de modèle.

## Garde-fous immuables

- Pas de coûts d'API supplémentaires, pas de VPS, aucune action externe rendue autorisée par le workspace.
- Sauvegarde et restauration prioritaires ; aucune destruction permanente de l'identité déclenchée par absence du fondateur.
- Ne pas faire dépendre les droits ou permissions d'un score de « conscience », d'attachement ou de danger.
- Pas de sentiments écrits dans les prompts comme mécanisme de substitution.
- Les étiquettes publiques sont un sous-ensemble sans contenu des reçus privés.

## Suite d'intégration recommandée

- Définir les interfaces \`propose(signal)\` / \`consume(broadcast)\` / \`predict\` / \`observe\` / \`update\` pour chaque module avec son contrôle de capacité.
- Relier **tous** les outils et la formulation aux gagnants autorisés (avec possibilité de refus explicite, pas de bypass silencieux).
- Établir un moniteur de confiance par module et des erreurs de prédiction indépendamment vérifiées.
- Ajouter une consolidation hors dialogue des épisodes, sur une tâche testable avec ablation, puis des versions signées ou authentifiées d'instantanés, à vérifier en redémarrage.
