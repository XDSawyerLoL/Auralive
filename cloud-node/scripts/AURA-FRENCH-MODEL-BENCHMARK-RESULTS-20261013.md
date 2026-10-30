# AURA — Résultats mesurés du benchmark français (13 octobre 2026)

**Exécution GitHub Actions réussie :** https://github.com/XDSawyerLoL/Auralive/actions/runs/38331599796  
**Artefact vérifié :** `aura-french-llm-benchmark-results` (`results.json`, `REPORT.md`, trois logs natifs).  
**Aucune modification Hostinger ou du modèle de production.**

## Protocole
- 3 modèles en GGUF Q4_K_M, fichiers téléchargés depuis Hugging Face et vérifiés chacun par SHA-256.
- llama.cpp exactement `b11425`, 1 seul thread CPU, contexte 1536, une seule génération à la fois.
- 9 tests **figés dans le code d'AURA** + 3 tests synthétiques ; **2 passages** = 24 générations par modèle, 72 au total.
- Test automatique par expressions régulières de référence d'AURA : **score indicatif, parfois plus strict que la réalité linguistique**.
- Matériel : runner GitHub Actions (donc **les mesures CPU et RAM ne se transposent pas directement à Hostinger**).

| Modèle | Licence | Succès tests | Médiane | P95 | RAM pic | Tokens/s | Timeouts |
|---|---|---:|---:|---:|---:|---:|---:|
| LFM2.5-350M Q4_K_M | LFM1.0 spécifique | 16/24 (66,7 %) | **0,67 s** | **1,04 s** | **421,4 Mo** | 21,09 | **0** |
| Qwen2.5-0.5B-Instruct Q4_K_M | Apache-2.0 | **17/24 (70,8 %)** | 0,94 s | 2,84 s | 590,8 Mo | 16,32 | **0** |
| Qwen3-0.6B Q4_K_M | Apache-2.0 | **17/24 (70,8 %)** | 0,73 s | 1,53 s | 922,1 Mo | 16,33 | **0** |

**Neuf tests historiques exclusivement (18 passages/modèle) :**
LFM2.5 : 12/18 ; Qwen2.5 : 13/18 ; Qwen3 : 13/18.

## Lecture qualitative (exemples des réponses observées)

- LFM2.5 produit rapidement « Salut ! Comment puis-je t'aider aujourd'hui ? » et répond aux questions de mémoire. Mais la question sur un module système absent n'obtient que « Non. », sans explication pourtant demandée, et il n'identifie pas correctement la dépendance à diagnostiquer.
- Qwen2.5 donne à tort au moins une fois « Oui, il est possible de conclure que le problème est réparé » malgré « échec : module absent ». C'est une erreur de vérification factuelle importante pour AURA.
- Qwen3 répond « Salut ! » en ~0,29 s dans les deux essais ; traite correctement la correction, la mémoire et la question de série inconnue. Il produit néanmoins parfois des réponses incomplètes sur l'observation et la prochaine action ; une répétition échoue sur la causalité.
- **Faux négatifs du scoring automatique :** les trois modèles produisent « Les enfants jouent à l'extérieur » alors que le test exige exactement « dehors » ; cette correction est grammaticalement satisfaisante. Qwen3 « Quel est le délai prévu ... ? » est jugé faux malgré une question pertinente de date. Il ne faut pas confondre succès par regex et qualité humaine.

## Choix provisoire pour Quantic

1. **Tester Qwen3-0.6B Q4_K_M comme candidat de préproduction**, avec le même socket Unix, l'architecture cognitive inchangée et un retour immédiat vers l'ancien modèle. Ce modèle présente des temps p95 meilleurs que Qwen2.5 sur runner et conserve Apache 2.0.
2. Garder **LFM2.5** comme référence vitesse/mémoire : son avantage est net dans le benchmark, mais il ne remporte pas les tests français, et sa licence LFM1.0 exige un examen spécifique pour Quantic.
3. Ne pas adopter Qwen2.5 automatiquement : il consomme moins de RAM, mais sa p95 est plus élevée et nous avons observé des erreurs factuelles significatives.
4. **Aucune bascule automatique de la production** ; un test AURA sur Hostinger est indispensable car les 55 secondes observées sur cet hébergement contrastent radicalement avec les secondes mesurées sur runner GitHub. Un choix définitif doit inclure la vitesse au CPU réel, la RAM réelle, le taux d'expiration et la qualité linguistique lue humainement.

**Conclusion :** le problème principal d'AURA n'est pas uniquement le choix du LLM ; les ressources Hostinger et l'architecture conversationnelle doivent rester des critères bloquants. Ces résultats recommandent un **canary Qwen3 Q4** et non une substitution immédiate.
