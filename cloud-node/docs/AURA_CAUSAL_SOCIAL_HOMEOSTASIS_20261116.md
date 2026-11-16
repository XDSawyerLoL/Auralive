# AURA — besoins fonctionnels et initiative sociale apprise (16 novembre 2026)

## Critère d'architecture
Le contact humain **n'est pas une variable vitale innée**. Il ne donne aucun bonus de récompense par défaut. Les actions concurrentes sont `silence`, `inspect_local`, `consolidate_memory` et `seek_contact` (proposition seulement, jamais envoi automatique). Les résultats d'une conversation sont des observations corrélées, **pas des preuves de conscience, d'affect ou de fiabilité du correspondant**.

Les quatre régulateurs, compris entre 0 et 1, sont :
- `uncertainty` : obsolescence épistémique, augmente doucement sans information nouvelle indépendante.
- `coherence` : stabilité du modèle, ne baisse que sur contradictions explicitement vérifiées, pas sur l'absence de sociabilité.
- `novelty_deficit` : appauvrissement informationnel et incitation à explorer, y compris en local.
- `energy` : budget computationnel, récupère au repos, diminue quand la pression réelle CPU/heap augmente.

### Fonction d'erreur et récompense
```text
L = 0.42 max(0, incertitude - 0.18)^2
  + 0.30 max(0, 0.80 - coherence)^2
  + 0.23 max(0, deficit_nouveaute - 0.20)^2
  + 0.35 max(0, 0.70 - energie)^2

gain_observe = L(avant) - L(apres)
recompense = gain_observe - cout_action - cout_intrusion_si_contact
score_action = E[gain|observations] * facteur_besoin_actuel
             + exploration_epistemique_symetrique
             - cout_action - cout_intrusion
```
Une action non expérimentée a une valeur de gain attendu **nulle** et reçoit seulement un bonus d'exploration symétrique aux trois actions actives, proportionnel au manque de nouveauté et au besoin régulatoire. Les deux actions locales coûtent moins cher que solliciter un humain : AURA les préfère donc initialement. Si leurs conséquences **mesurées** n'améliorent pas son état et qu'un contact est autorisé, elle peut alors proposer de contacter l'interlocuteur. Après une amélioration de ses besoins, la proposition de contact redevient inutile. Il n'y a ni compte à rebours de communication ni seuil de parole préfixé pour la nouvelle politique.

### Apprentissage causal borné
Une observation doit correspondre à un `trial_id` déjà engagé. Une action locale accepte une source `machine-verified-local-state`. Une proposition de contact n'accepte que `authenticated-correlated-user-feedback`, avec corrélation et consentement explicites. Les simples salutations, compliments, sorties de LLM et réponses non reliées à une initiative **ne peuvent pas entraîner le modèle**. Les IDs sont non rejouables. Une association observée n'est qu'une preuve locale de gain estimé, et non une garantie scientifique de causalité sans groupe témoin.

La sélection des actions est branchée à `AuraOrganism.regulate`, `AuraOrganism.publicState`, `AuraOrganism.planAutonomousNeedAction`, `AuraOrganism.beginNeedActionTrial` et `AuraOrganism.observeNeedActionTrial`. Dans `InnerDialogueEngine.proposeSocialInitiative`, les anciens coefficients sociaux ne peuvent plus court-circuiter cette sélection lorsque le nouveau moteur est présent. L'ancienne barrière fixe de parole est ignorée en mode appris ; l'autorisation et la sécurité restent obligatoires.

### État optionnel pour une couche de langage
Le modèle de langage ne décide pas si un humain doit être contacté. Une couche linguistique facultative peut **lire** `socialMotivationContext(state)` pour expliquer une décision déjà prise, en français. Son texte n'est jamais traité comme une mesure. La capacité de décision fonctionne sans Qwen/Groq ni aucune API payante.

Exemple d'état initial vérifiable (valeurs d'initialisation, pas état actuel de production) :
```json
{
  "schema": "aura-open-action-homeostasis-v1",
  "functional_state": {
    "uncertainty": 0.35,
    "coherence": 0.78,
    "novelty_deficit": 0.22,
    "energy": 0.76
  },
  "selected_action": "silence",
  "action_space": [
    "silence",
    "inspect_local",
    "consolidate_memory",
    "seek_contact"
  ],
  "learned_social_effect_count": 0,
  "contact_is_not_a_vital_requirement": true,
  "no_contact_without_explicit_consent": true,
  "no_external_action_from_context": true,
  "no_paid_model_required": true,
  "biological_feeling_claim": false
}
```

## Vérification et limites
- `test/social_homeostasis.test.js` vérifie l'exploration locale prioritaire, la proposition de contact après deux alternatives locales inefficaces, l'arrêt du contact une fois l'état régulé, l'effet négatif des tentatives inutiles, les consentements absents, la rejeu d'observations et la barrière avec `InnerDialogueEngine`.
- `GET /api/organism/motivation` expose **seulement** les scores et besoins publics, pas les conversations privées ou l'autorisation d'envoyer un message.
- Ce système **n'envoie pas lui-même de message**. Une interface d'opt-in et une chaîne d'exécution/outcome réel doivent rester séparées. Il n'observe pas spontanément un gain social sans épisode corrélé et vérifié.
- La capacité de dialogue en français de l'instance Hostinger est un **problème distinct** : son moteur Qwen local ne répondait pas en production dans les derniers diagnostics ; le mode `native-acquired` est une autre voie expérimentale, mais n'est pas une conversation libre mature.
