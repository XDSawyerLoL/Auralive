# AURA — Langage autonome strictement local (sans Groq / Grok / API de texte)

Ce fichier propose la configuration à inscrire **sur l'environnement Node Hostinger**, pas un compte ni une clé. Ne déployer qu'après lecture des prérequis et validation de la CI.

```dotenv
AURA_LOCAL_LANGUAGE_ONLY=true
AURA_ZERO_COST_MODE=true
AURA_GROQ_FREE_ENABLED=false
AURA_FREE_FEDERATION_ENABLED=false
AI_MODE=off
AURA_EMBEDDED_LANGUAGE_ENABLED=true
AURA_EMBEDDED_AUTOPROVISION_ENABLED=true
AURA_EMBEDDED_LANGUAGE_QUANTIZATION=q4
AURA_LOCAL_ENCODER_ENABLED=false
```

## Modèles réellement génératifs

**Configuration minimale :** Qwen3-0.6B Q4_K_M, 484 Mo de poids (SHA256 vérifié ; source : `tauqir02/Qwen3-0.6B-GGUF`). Demande au moins 1,5 Go de quota mémoire pour l'auto-installation (estimation de sécurité, pas garantie de fonctionnement).

**Configuration plus capable :** remplacer par `AURA_EMBEDDED_LANGUAGE_QUANTIZATION=1.7b-q4` : Qwen3-1.7B Q4_K_M (source `ggml-org/Qwen3-1.7B-GGUF`, empreinte SHA256 `d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5`), poids ~1,28 Go, garde-fou d'au moins 3 Go de mémoire cgroup et 1,65 Go de disque disponibles pour l'installation. Le lancement exige également au moins 1,9 Go de marge dynamique ; la RAM totale exigée peut donc être supérieure à 3 Go. Vérifier les limites **réelles** sur l'offre Hostinger : les ressources des différents sites et processus sont partagées.

Le profil `q8` reste disponible en cas de machine suffisamment dotée, mais n'est pas le premier choix pour un hébergement contraint. Les différents profils requièrent les fichiers du modèle et les bibliothèques llama.cpp ; ils sont récupérés uniquement via les URLs préétablies et les empreintes SHA256 connues, jamais depuis une URL libre fournie par un interlocuteur.

**Priorité d'inférence :** le moteur local GGUF est tenté avant le moindre fournisseur distant. Avec `AURA_LOCAL_LANGUAGE_ONLY=true`, il n'existe **aucune** alternative Groq, Gemini, OpenRouter, ni fédération de modèles distants. Les clés anciennes peuvent rester présentes dans les variables d'environnement sans être utilisées sur ce parcours, mais il est préférable de les retirer. Si le modèle local est indisponible, AURA n'invente pas une réponse de ce moteur et son diagnostic indique l'indisponibilité.

**Encodeur MiniLM :** n'est pas un moteur de parole. Le laisser désactivé tant que l'on n'a pas vérifié que l'hébergement peut faire fonctionner en même temps le LLM et l'encodeur sans dépasser les quotas.

## Vérification sur le véritable hébergement

Sur un shell de **l'hébergement AURA** (et non sur un GitHub Actions runner), avec ces variables, lancer :

```sh
cd cloud-node
node scripts/probe_local_french_dialogue.mjs --install --output=./french-probe-hostinger.json
```

Le script installe le modèle et le serveur natif par le provisionneur déjà présent si nécessaire, demande 12 réponses courtes en français et enregistre la consommation RSS et les relevés mémoire cgroup. Il ne contacte pas de fournisseur d'inférence distant. Le démarrage peut être bloqué par des restrictions d'exécution natives, RAM, PID, disque ou par les délais du plan d'hébergement. Ne pas exécuter via une requête HTTP publique : le processus d'initialisation peut dépasser la limite de traitement des requêtes.

`french-probe-hostinger.json` n'est **pas créé** par la CI et ne peut pas être qualifié de mesure Hostinger tant que cette commande n'a pas effectivement tourné sur ce serveur. Le contrôle automatique Node vérifie la logique, pas la fluence humaine ou la mémoire sur Hostinger.

## Ce qui reste à prouver

Même Qwen3-1.7B n'offre aucune garantie de parler « parfaitement ». Pour une conversation naturelle à niveau élevé, une taille de modèle plus grande et des évaluations sur plusieurs dizaines de dialogues libres seront probablement nécessaires. Sur un hébergement Web partagé, cette exigence peut être incompatible avec les limites contractuelles. Un moteur purement à règles ou un encodeur MiniLM ne remplace pas un modèle génératif entraîné sur de larges corpus.

Le présent développement n'installe pas de modèle payant, n'ouvre pas de VPS, et ne promet pas la conscience ni un apprentissage spontané illimité.
