# AURA — langage français GroqCloud Free, 0 € tant que l'organisation reste sur Free

## Pourquoi Groq et quel modèle

Le nom exact du fournisseur est **GroqCloud**, distinct de Grok de xAI. Sa solution gratuite n'est ni illimitée ni dépourvue des conditions d'utilisation habituelles. L'API répond normalement beaucoup plus vite qu'un petit modèle embarqué.

Configuration recommandée au 8 novembre 2026 :

- **Primaire : `qwen/qwen3.8-27b`**. Taille 27 milliards de paramètres, contrôle `reasoning_effort: "none"`, `include_reasoning: false`. Le modèle produit directement du texte visible, sans utiliser le budget de sortie pour un raisonnement caché.
- **Secours en cas de réponse entièrement vide : `openai/gpt-oss-120b`**, aussi listé dans le tableau Free, avec un seul essai de secours. Une erreur d'autorisation, de facturation, de quota ou de connexion ne déclenche aucune nouvelle requête chez Groq.
- **Autres secours** : modèle local AURA déjà vérifié puis OpenRouter `openrouter/free` / `:free`. Aucun fallback vers un modèle payant.
- Les anciens identifiants `llama-3.3-70b-versatile`, `llama-3.1-8b-instant` ne sont pas utilisés : Groq les a dépréciés pour les formules non-Enterprise.

Groq Free annonce notamment **30 requêtes/minute, 1 000 requêtes/jour, 8 000 tokens/minute et 200 000 tokens/jour** pour Qwen 3.8 27B (limites indicatives, celles du compte prévalent). La protection interne AURA limite à **500 requêtes/jour**, et 25 requêtes par minute et une seule requête simultanée, pour conserver une marge; l'API peut appliquer des seuils plus bas. Au-delà des quotas, Groq retourne HTTP 429 et AURA doit attendre.

## Clé privée et sécurité financière

**Seules les variables d'environnement privées de Hostinger** doivent contenir les secrets :

```dotenv
AURA_ZERO_COST_MODE=true
AURA_GROQ_FREE_ENABLED=true
AURA_GROQ_API_KEY=COLLER_LA_CLE_DANS_HOSTINGER_SEULEMENT
AURA_GROQ_FREE_PLAN_CONFIRMED=true
AURA_GROQ_FREE_MODEL=qwen/qwen3.8-27b
AURA_GROQ_FREE_MAX_REQUESTS_PER_DAY=500
```

**N'activer `AURA_GROQ_FREE_PLAN_CONFIRMED=true` qu'après avoir vérifié dans la console Groq que l'organisation portant la clé est sur le plan Free**. Une même API et les mêmes modèles deviennent facturables avec le plan Developer. Le verrou ne constitue pas une preuve automatique du type de compte et devra être revérifié après toute modification de l'abonnement. Ne pas entrer de carte bancaire et ne pas passer sur Developer pour le projet à 0 €.

Générer une clé directement sur https://console.groq.com/keys ; ne jamais la déposer dans GitHub, un message public ou une URL.

L'API est épinglée au domaine officiel `https://api.groq.com/openai/v1/chat/completions`. Les modèles sont sur liste blanche. La requête ne peut contenir ni `service_tier: "performance"`, ni URL personnalisée, ni modèle non listé. La clé ne transite pas par le navigateur. AURA consigne les compteurs d'usage mais ne connaît pas le solde bancaire ni le montant réellement facturé par Groq.

## Vérification opérationnelle après déploiement

1. Installer le paquet AURA Cloud Node Hostinger depuis la PR #221 après sauvegarde de la version et des variables actuelles.
2. Confirmer le compte Free, configurer la clé `AURA_GROQ_API_KEY` et les autres variables ci-dessus, puis redémarrer l'app Node.js.
3. Dans le cockpit, vérifier **Groq Free · Configuré**, puis envoyer « Salut AURA, présente-toi naturellement en deux phrases. »
4. Constater **Groq Free · Réponse vérifiée** avec le modèle réellement utilisé `qwen/qwen3.8-27b`. Lire également `GET /api/ai/runtime` (champ `groq_free`) et le diagnostic linguistique.
5. Sans clé, sans Free confirmé, sur 401/402/403/429 ou sur une réponse vide même après secours, AURA doit afficher un diagnostic; elle ne doit pas simuler une réponse sensible ou une présence humaine.
6. Si l'interface affiche encore des phrases creuses, conserver le texte, le code d'erreur, le modèle et le statut, pour un correctif ciblé.

## Limitations

- Aucun vrai appel à Groq n'a été effectué dans le pipeline GitHub : les tests injectent des réponses simulées pour vérifier le code sans consommer de quota ni révéler une clé.
- Une configuration correct ne prouve pas encore la qualité d'une conversation réelle ou la possibilité pour Hostinger de joindre l'API HTTPS.
- Zéro coût fixe supplémentaire n'est possible que si l'organisation Groq reste sur **Free** et respecte ses quotas. Un appel facturé à un compte Developer ne sera pas automatiquement gratuit parce qu'AURA utilise Qwen 3.8.
- Groq est un fournisseur distant : ne pas envoyer automatiquement de secrets, fichiers privés, données médicales ou mémoire intégrale d'AURA.
- « Débridé » ne signifie pas contourner des règles de sécurité ni obtenir une infinité de jetons : Groq applique ses propres politiques et quotas.
- L'utilisation de Groq ne crée pas de revenus de trading, ne prouve aucune autonomie financière et n'engage aucun capital.

## Sources officielles

- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/models
- https://console.groq.com/docs/reasoning
- https://console.groq.com/docs/deprecations
- https://console.groq.com/docs/billing-faqs
- https://console.groq.com/docs/legal/ai-policy
