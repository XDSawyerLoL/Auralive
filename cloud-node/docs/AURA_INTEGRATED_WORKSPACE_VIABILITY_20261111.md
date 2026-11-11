# AURA — intégration de l'espace de travail, prédiction, viabilité et consolidation (11 novembre 2026)

Branche : \`feat/aura-workspace-gates-prediction-consolidation-20261111\`; base #237.

## Travaux inclus

1. **Porte de diffusion** (\`workspace_boundary.js\`) : le noyau vérifie qu'une proposition perceptive ou exécutive est réellement diffusée *avant* de transférer du contenu à la formulation française, à l'assistance sémantique, aux agents et à l'opérateur. Le contexte historique/les notes personnelles sont retirés quand la mémoire n'a pas gagné l'attention. Une suppression de la diffusion doit supprimer ce transfert (test d'ablation). Le filtre ne donne aucun droit supplémentaire aux outils.
2. **Prédiction transversale** (\`prediction_error_bus.js\`) : confiance de réussite fixée *avant* l'appel, observation datée *après*, erreur absolue, score de Brier et erreur de calibration ECE en cinq classes. La langue vérifie uniquement **qu'une réponse a été produite**, pas sa vérité. Les tests autonomes vérifient un mécanisme local. Les résultats d'automatisation transmis par un tiers sont marqués \`reported\` et **ne peuvent pas déclencher une saillance présentée comme indépendante**.
3. **Viabilité opérationnelle** (\`viability_budget.js\`) : réserve bornée et persistante, alimentée par mesures récentes CPU/heap du processus et échecs observés. En pénurie, elle limite le tampon global (3, 2 ou 1 emplacements) et suspend les activités spéculatives de fond. Le dialogue explicite, le maintien des sécurités et la restauration restent possibles. Aucun crédit payant ni mortalité irréversible ne sont simulés.
4. **Consolidation périodique** (\`offline_consolidation.js\`) : toutes les six heures **pendant qu'un Node actif peut faire tourner son cycle**, lecture maximale de cent reçus \`machine-verified\` du registre v18, agrégation déterministe sans recopier les textes privés, provenance et digest chaîné. Une clé d'environnement \`AURA_STATE_SIGNING_KEY\` d'au moins 24 caractères permet une protection HMAC-SHA256 ; **sans clé externe l'empreinte SHA256 n'est PAS une signature**. Ne jamais coder la clé dans Git ni la transmettre par l'interface. Aucun épisode source n'est supprimé.
5. **Interface unique** : affichage de la réserve, du nombre d'observations et de l'ECE par module, des profils consolidés, et des traces d'ablation/routage sans contenu personnel. Les nœuds installés ne produisent pas de pulsation tant qu'aucune trace n'a été enregistrée.
6. **Tests** : \`workspace_integrated_mechanisms.test.js\` et tests existants, ainsi que le contrôle de syntaxe dans l'empaquetage Hostinger.

## Sécurité / limites

- Les projections linguistiques et les agents appelés directement par \`CognitiveKernel\` sont filtrés. D'autres services du dépôt, dont \`CommandCenter\`, \`CuriosityEngine\`, \`EvolutionLab\`, et les ponts externes peuvent posséder leurs propres générateurs/appels sans passer par ce point d'entrée : **l'obligation stricte pour tout le dépôt reste non démontrée**. Auditer ces chemins avant une déclaration de couverture totale.
- Une réponse textuelle est une **sortie technique**, non la preuve d'une assertion correcte. Un résultat d'action déclaré n'est pas une vérification indépendante. La confiance est une mesure calibrable, pas un sentiment.
- Le signal de viabilité ne mesure que les ressources du processus Node, pas la survie d'un être biologique ni tous les quotas Hostinger.
- Le rôle de l'espace de travail est une analogie computationnelle GWT ; il n'imite ni le nombre, ni la physique des neurones. Pas de revendication de conscience vécue.
- Les tests unitaires ne prouvent pas qu'un vrai MySQL v18 contient déjà des résultats vérifiés ni que le processus Hostinger reste actif sans interruption. Une validation sur le service réel est indispensable pour E3/E4.
- Les anciens historiques et les plans peuvent encore être consommés *dans* \`CognitionEngine.planReply\` avant la sélection ; le filtre ci-dessus contrôle leur **passage au fournisseur**, mais pas tout le raisonnement préparatoire interne. Des récepteurs \`consume(broadcast)\` séparés restent l'étape suivante.
- Ne pas fusionner cette branche avant sa base #237 et les dépendances #235/#234/#233.

## Expériences de référence

| Ablation | Résultat requis |
|---|---|
| Diffusion = false | Aucune note privée envoyée au modèle, aucun plan exécutif diffusé aux outils |
| Mémoire retirée | Historique, contexte conversationnel, profil et notes non transmis |
| Prediction bus absent | Les candidats d'attention liés à une erreur inter-module disparaissent |
| Signal CPU ancien | Aucune fausse pénurie imputée à un capteur périmé |
| Réserve épuisée | Capacité du workspace réduite, tâches spéculatives reportées ; dialogue explicite conservé |
| Receipts non vérifiés | Aucune consolidation à partir de retours humains ou de résultats rapportés |
| HMAC erroné | Échec de vérification et rejet de l'instantané ; aucun effacement de l'histoire |

## Prochain critère majeur

Produire des preuves instrumentées E3/E4 montrant que le chemin \`prediction → surprise → attention → diffusion → action → vérification indépendante → apprentissage → consolidation\` change une décision réelle après redémarrage. Les tests E2 sont nécessaires, mais insuffisants.
