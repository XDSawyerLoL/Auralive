# AURA — récupération du français naturel, sans modèle payant

État du chantier : code proposé dans la PR #221. Les tests CI ne constituent pas une confirmation de déploiement sur Hostinger.

## Comportement attendu

1. Lorsqu'OpenRouter renvoie un texte français exploitable, AURA le conserve et indique le modèle réellement utilisé.
2. Lorsqu'une réponse est vide (ou contient seulement du raisonnement interne), AURA la rejette. Pour les conversations, elle peut tenter **une seule** autre inférence avec un modèle de texte `:free` dont le prix a été confirmé à zéro dans le catalogue OpenRouter. Le routeur `openrouter/free` reste également disponible et intrinsèquement gratuit. Cela utilise toutefois une requête gratuite additionnelle et peut consommer le quota.
3. En présence d'une erreur d'authentification ou d'accès (401/403), d'une restriction du compte/de facturation (402), d'une limite de débit ou de quota (429), ou de messages équivalents `quota_exceeded`, `billing`, `insufficient_credits`, **aucune deuxième inférence n'est envoyée**. Les erreurs structurées dans un corps JSON HTTP 200 sont prises en compte.
4. Toute réponse de raisonnement privé (champs `reasoning` ou `reasoning_details`) est exclue du texte affiché. Le système ne doit pas la présenter comme un échange naturel.
5. Aucune bascule automatique vers l'API officielle Grok/xAI, DeepSeek ou un modèle facturé n'est permise. Les modèles configurés sont limités à `openrouter/free` et aux identifiants `:free` avec vérification du prix actuel dans le catalogue.

## Déploiement Hostinger

- Déployer le paquet **canonique Cloud Node Hostinger** issu de cette branche après sauvegarde de la version en ligne et des variables privées.
- Vérifier côté serveur que `AURA_OPENROUTER_API_KEY` est configurée, sans la publier dans GitHub ou le tableau de bord.
- Conserver `AURA_ZERO_COST_MODE=true` et `AURA_FREE_FEDERATION_ENABLED=true`. La configuration par défaut limite AURA à 45 appels gratuits par jour pour préserver une marge, mais **le quota véritable dépend d'OpenRouter et du modèle** ; un plafond configuré n'augmente jamais le quota du fournisseur.
- Effectuer un véritable échange français, relever dans `GET /api/ai/runtime` le modèle et le fournisseur réellement utilisés, et vérifier que le texte est lisible et non vide.
- Tester un appel avec quota épuisé ou clé refusée : l'interface doit informer sur la cause sans requête TTS ou inférence payante.
- Si le modèle local Qwen3 reste non vérifié, consulter `GET /api/language/embedded/status` ; des fichiers GGUF détectés n'attestent pas que le processus `llama.cpp` peut s'exécuter sur Hostinger.

## Compatibilité avec AURA Trading Lab

La surveillance périodique des marchés reste **PAPER ONLY**. Elle ne doit pas consommer le quota OpenRouter pour calculer ses résultats, car son backtest est déterministe et utilise les cours publics de Kraken. **Aucun bénéfice réel n'est réalisé par le simulateur**.

## Validation

- `npm run check` et `npm test` dans `cloud-node/`.
- Les scénarios de `test/free_federation.test.js` couvrent les réponses vides, le repli `:free`, l'absence de sortie du raisonnement privé et les erreurs financières/quotas.
- Aucun déploiement Hostinger ni test de conversation en production ne doit être revendiqué sans observation directe du site.

Documentation API officielle OpenRouter : https://openrouter.ai/docs
