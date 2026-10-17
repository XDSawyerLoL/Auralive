# AURA — banc d'essai comparatif du moteur de français

Cette expérience **ne modifie ni AURA en production, ni Hostinger, ni la PR #217**.
Elle lance des moteurs GGUF sur un runner GitHub temporaire, **un modèle à la fois**.
Les données ne proviennent pas des conversations privées : neuf tâches figées de
`LANGUAGE_BENCHMARK` (importées directement du code source) et trois phrases synthétiques.

| Candidat | Fichier GGUF | Licence |
|---|---|---|
| LFM2.5-350M Q4_K_M | LiquidAI officiel | LFM 1.0 — examen des conditions obligatoire |
| Qwen2.5-0.5B-Instruct Q4_K_M | Qwen officiel | Apache 2.0 |
| Qwen3-0.6B Q4_K_M | quantification Unsloth | Apache 2.0 |

Le workflow `.github/workflows/aura-french-llm-benchmark.yml` :
1. fige `llama.cpp b11425` (SHA git exact) et vérifie chaque poids GGUF par SHA-256 ;
2. lance les trois variantes à paramètres communs : CPU, 1 thread, 1 seul slot,
   contexte 1 536 tokens, maximum 64 tokens (28 pour salutation) ;
3. évalue deux passages des 12 tâches, mesure temps médian, p95, temps de
   chargement, mémoire RSS maximale, nombre de tokens et expirations ;
4. publie `results.json`, `REPORT.md` et logs dans un *artefact GitHub Actions*.
   Aucun GGUF ni conversation privée ne sont publiés dans l'artefact.

Les scores automatiques utilisent les regex des neuf tests figés d'AURA. Il
s'agit d'un **proxy imparfait de qualité linguistique**, pas d'une mesure de
fluidité humaine : lire les réponses générées avant toute décision. Les
mesures sur runner GitHub **ne prouvent pas** les performances sur l'hébergement
Hostinger : il faudra ensuite un test isolé sur le CPU et la RAM cibles.

**Aucun gagnant n'est déployé automatiquement.** Les licences, les temps de
réponse, les erreurs et le budget mémoire doivent être validés avant une
modification explicite de la configuration de production. Les éventuels coûts
ou quotas GitHub Actions restent ceux du compte GitHub ; zéro API payante.
