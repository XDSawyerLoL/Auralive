# AURA : Groq comme voix, jamais comme noyau

**Mode expérimental — désactivé par défaut.** Cette intégration ne doit
jamais être confondue avec une délégation de décision à Groq.

## Contrat d'architecture

1. AURA reçoit l'interaction dans son noyau habituel (homeostasie, mémoire,
   intentions, cognition). La fonction `planReply` décide l'acte de parole,
   l'objectif et les faits que le noyau peut soutenir.
2. `GroqSpeechOnly` reçoit une **copie minimale** : message utilisateur
   (500 caractères max), acte de parole, but de communication (240 caractères
   max), maximum cinq faits décidés par AURA (210 caractères chacun), style.
   Il n'accède ni au Soul, ni à la DB, ni aux outils, ni aux intentions
   persistées, ni à l'historique complet de conversation.
3. Le service Groq reçoit `tool_choice:none` et doit fournir un JSON limité à
   `{utterance,speech_act,used_fact_ids}`. AURA refuse les actes changés,
   identifiants inconnus, champs additionnels, sorties techniques,
   nouveaux chiffres/URLs et annonces d'actions non justifiées par un fait.
4. Si le plan ne contient **pas de contenu cognitif suffisant** (simple
   instruction générique « répondre utilement », recherche non résolue),
   aucune requête Groq ne part : `speech-plan-insufficient-grounding`.
5. En mode Groq, le chemin de conversation n'injecte plus de synthèse
   spéculative d'un autre LLM dans le plan cognitif. Les sources externes
   restent accessibles à AURA via son Web Substrate, mais ne deviennent
   pas automatiquement des faits vérifiés.
6. Groq n'a aucun droit d'écriture et aucune capacité d'action dans AURA.
   Une sortie refusée n'est pas affichée, et aucun autre modèle ne lui est
   substitué silencieusement.

**Limite fondamentale :** le contrôle du JSON, des faits chiffrés et des
actions ne garantit **pas** une équivalence sémantique parfaite. Un modèle
peut produire une paraphrase fausse sans chiffres nouveaux. Les tests de
fidélité et la capacité de décision réelle du noyau restent à renforcer.
Un message complexe non résolu doit être bloqué plutôt que « pensé » par Groq.

## Confidentialité et coût

Les fragments du plan envoyés à Groq sont transférés hors Hostinger. Ne
mettre aucune mémoire sensible dans les champs transmis et ne pas activer
sans consentement explicite à cet usage. Les clés API restent **seulement
dans les secrets Hostinger**, jamais dans GitHub ni dans le navigateur.

L'accès est bloqué si une condition manque :
- `AURA_GROQ_SPEECH_ENABLED=true`
- `AURA_GROQ_FREE_PLAN_CONFIRMED=true` (**à confirmer par l'opérateur**)
- `AURA_ZERO_COST_MODE=true`
- `AURA_GROQ_API_KEY` défini dans les secrets du serveur

`AURA_GROQ_SPEECH_MAX_REQUESTS_PER_DAY=30` réduit les appels et ne dépasse
jamais 200 par jour **par processus Node**. Ce compteur n'est pas persistant
au redémarrage ni partagé entre réplicas : ce n'est pas une preuve
automatique de facturation zéro. **Garder le compte Groq sur le plan Free.**
Selon la documentation officielle, le plan Free retourne un HTTP 429 après
atteinte des limites au lieu de facturer.

## Essai (sans installer en production par défaut)

Créer/valider une clé Groq Free et configurer l'instance de préproduction
avec les variables ci-dessus. Tester les vrais tours « salut », « que
fais-tu ? », « explique cette panne », puis examiner le diagnostic
`/api/ai/runtime` et les réponses. « salut » et les rapports réellement
documentés doivent être formulés par Groq; une question sans plan suffisamment
prouvé doit rester non résolue.

Si une erreur apparaît, désactiver
`AURA_GROQ_SPEECH_ENABLED` et redémarrer. Cela restaure le comportement
linguistique précédent; aucune mémoire ni poids locaux ne sont supprimés.

Modèle API : `llama-3.3-70b-versatile`, HTTPS vers
`https://api.groq.com/openai/v1/chat/completions`, JSON Object Mode,
sans tool calls; timeout 12 secondes, aucun retry automatique.

**État :** tests simulés CI, aucun appel réel ni clé fournie; pas de
validation de qualité ou de coût sur un compte Groq en production.
