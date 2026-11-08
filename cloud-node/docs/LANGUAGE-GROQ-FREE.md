# AURA — Remettre le français conversationnel en service

## Diagnostic illustré

Quand le graphe affiche `Expression · échec` et que le bandeau affiche `Français · indisponible`, cela signifie **qu'aucun moteur de langue n'a généré de texte**. Le graphe mesure correctement le traitement mais ne remplace pas un LLM. Une réponse de service ne doit jamais être présentée comme une vraie réponse d'AURA.

Le moteur local Hostinger peut manquer de mémoire ou ne pas pouvoir exécuter son binaire. L'autre chemin historique est OpenRouter `openrouter/free`, qui nécessite une clé.

## Solution alternative facultative : Groq Free

Le code peut utiliser l'API officielle Groq **uniquement avec un compte Groq Free confirmé comme non facturant**. Groq Free impose ses limites en requêtes et retourne HTTP 429 lorsqu'elles sont dépassées. Une clé API ne suffit pas pour autoriser l'envoi : le verrou de confirmation du plan gratuit est obligatoire.

Dans les variables de l'application Node.js sur Hostinger, configurer :

```dotenv
AURA_ZERO_COST_MODE=true
AURA_GROQ_API_KEY=VOTRE_CLE_PRIVEE_GROQ_FREE
AURA_GROQ_FREE_PLAN_CONFIRMED=true
AURA_GROQ_FREE_MODEL=openai/gpt-oss-20b
AURA_GROQ_FREE_MAX_REQUESTS_PER_DAY=100
```

**Ne jamais copier la clé privée dans GitHub, le navigateur, un ticket ou une capture d'écran.** L'ancienne variable `GROQ_API_KEY` est aussi reconnue. Une configuration déjà existante `AI_API_KEY` n'est reconnue comme clé Groq que si `AI_BASE_URL` correspond exactement à `https://api.groq.com/openai/v1`.

Le modèle est volontairement restreint à `openai/gpt-oss-20b` ou `openai/gpt-oss-120b`, dont la documentation Groq annonce des limites Free. Les anciens modèles Llama 3.1/3.3 ne sont pas utilisés : ils ont été retirés du plan Free en août 2026.

**La confirmation du plan Free est une action de l'administrateur**. Elle ne doit pas être activée sur un compte Groq Developer ou facturable. En l'absence de confirmation, aucun appel réseau n'est effectué par cette intégration. Le plafond applicatif est en mémoire par processus ; Groq applique par ailleurs son plafond au niveau du compte. Le code ne peut pas garantir un accès illimité.

## Ordre de réponse effectif

1. Moteur local réellement prêt et vérifié.
2. Groq Free confirmé (si clé présente).
3. OpenRouter `openrouter/free` confirmé (si clé présente et budget disponible).
4. Worker local de langue (si en ligne).
5. En l'absence de modèle : erreur de service explicite, **sans inventer une réponse d'AURA**.

En cas d'échec, consulter `GET /api/capabilities` et `language.groq_free` (sans aucun secret exposé). `configured` indique une clé présente, `plan_confirmed` une confirmation explicite, `enabled` une capacité à tenter la génération et `last_error_code` la dernière erreur. `language.ready` reste `false` jusqu'à une vraie génération réussie.

## Recette de validation

- Exécuter `npm test` et `npm run check` sur Node 22 avant le déploiement.
- Après avoir paramétré les variables, redémarrer l'application Hostinger.
- Envoyer « salut » : vérifier que la réponse est réellement produite par le modèle, et non par une phrase fixe.
- Dans `GET /api/capabilities`, vérifier `language.ready: true`, `last_backend: groq-free` ou un autre fournisseur effectivement utilisé.
- Si Groq répond 429, OpenRouter peut servir de secours si sa clé est configurée. Sinon l'interface doit afficher « SERVICE · NON EXÉCUTÉ », sans incrémenter artificiellement une réussite homéostatique ni enregistrer une fausse réplique d'AURA dans l'historique.
- Tester séparément les cas 401, 429, indisponibilité réseau et absence de clé.

## Sécurité et confidentialité

La requête utilisateur, les contraintes d'expression et le contexte fourni au moteur sont envoyés à Groq seulement si le propriétaire a activé explicitement cette intégration. Le service ne reçoit pas les secrets Hostinger ; son endpoint est fixé dans le code. Le mode Free peut avoir des règles de traitement des données différentes d'une inférence 100 % locale.

Cette intégration ne prouve pas que Groq fonctionne sur la production : elle doit être vérifiée avec une vraie clé Free dans l'environnement Hostinger.
