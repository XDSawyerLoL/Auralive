# AURA — canary Qwen3-0.6B Q4_K_M sur Hostinger

**Conserver Q8 en production jusqu'à un essai contrôlé.** Le ZIP standard garde le modèle Q8 existant. Un essai Q4 se déclenche uniquement si l'opérateur configure `AURA_EMBEDDED_LANGUAGE_MODEL_VARIANT=qwen3-q4-canary` et redémarre le projet Hostinger.

## Modèle et provenance

- **Stable** : Qwen3-0.6B Q8_0, hash vérifié `9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031`, dépôt Qwen officiel, licence Apache-2.0.
- **Canary** : Qwen3-0.6B Q4_K_M, hash vérifié `ac2d97712095a558e31573f62f466a3f9d93990898b0ec79d7c974c1780d524a`, quantification Unsloth du modèle Qwen3, licence des poids Apache-2.0 sous réserve de revue des conditions de distribution.
- Téléchargement HTTPS et contrôle SHA-256 avant activation. Cache Q8 conservé. Moteur `llama.cpp b11425` déjà opérationnel dans AURA.
- Les deux modèles ne doivent **jamais** être actifs en parallèle sous la contrainte mémoire Hostinger. Un seul processus `llama-server`, transport socket Unix existant.
- Si `AURA_EMBEDDED_LANGUAGE_MODEL` pointe explicitement vers un GGUF local, cette configuration manuelle a priorité sur le drapeau canary.

## Procédure d'essai sur une instance Hostinger de préproduction

1. Sauvegarder le ZIP stable et noter `/api/build` et les performances de Q8 (au moins six conversations non sensibles).
2. Installer le ZIP candidat dans **un projet Hostinger de préproduction séparé**, préserver la DB de production et ne pas l'utiliser pour les essais.
3. Mettre `AURA_EMBEDDED_LANGUAGE_MODEL_VARIANT=qwen3-q4-canary`, redémarrer, attendre téléchargement/certification GGUF puis preuve d'inférence.
4. Vérifier `/api/language/embedded/status` : `model_canary_requested:true`, `model_canary_active:true`, `probe_verified:true`, `provisioning.model_variant:'qwen3-q4-canary'` et `provisioning.canary_rollback_available:true`.
5. Faire au moins six conversations de durée variée ; ne jamais lancer 9 tests lourds en parallèle. Inspecter `model_canary_observations`, `generation_failure_code`, `native_process.rss_mb`.
6. Objectif d'admission : 6 réponses/6 sans timeout, p95 inférieur à 30 secondes, RAM stable, réponses vérifiées qualitativement sur la vraie mémoire d'AURA.

## Retour arrière immédiat

**Bascule réversible par redémarrage** : changer `AURA_EMBEDDED_LANGUAGE_MODEL_VARIANT=qwen3-q8` (ou supprimer la variable), puis redémarrer. L'ancien GGUF Q8 reste sur le disque ; aucun poids n'est supprimé et il n'y a pas de permutation de processus à chaud. Le même paquet contient les deux profils.

Ce correctif ne réalise pas lui-même l'import Hostinger : le connecteur Hostinger disponible ici ne pilote que les sites AI Builder, **pas les projets Node.js Web App**. La comparaison avec les résultats GitHub ne dispense pas d'une mesure réelle sur les ressources Hostinger. Aucun résultat de performance Q4 sur Hostinger ne sera inventé.

## Mesures et limites

Le suivi `model_canary_observations` conserve les 12 derniers résultats chiffrés (durée, succès, timeout, p95), sans contenu de conversation ni données personnelles, et **ne promeut jamais automatiquement** le nouveau modèle. Il s'agit d'une procédure de test et de rollback contrôlés, pas d'une promesse de stabilité.
