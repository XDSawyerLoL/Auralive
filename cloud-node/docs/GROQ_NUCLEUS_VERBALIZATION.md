# AURA — Le noyau décide, Groq met en français

## Défaut réel corrigé

Une réponse Groq du type « En tant qu'IA, je n'ai pas de sentiments humains... je suis conçu pour interagir... » ne reflétait pas la décision produite par le noyau AURA. L'ancienne voie Groq utilisait un prompt générique très court qui perdait une grande partie de l'état et des intentions déjà calculés par `CognitionEngine.planReply`.

Pour une demande comme « Comment tu te sens AURA ? », le noyau fournit réellement l'acte `report_internal_state`, un objectif, une humeur computationnelle, des intentions et des indicateurs numériques. Groq ne doit pas ignorer ces informations et jouer le rôle d'un assistant universel.

## Nouvelle frontière entre noyau et expression

1. **Décision** — `kernel.converse` appelle `cognition.planReply`. Seul le noyau détermine l'acte de parole, l'intention, les faits autorisés et les métriques internes. Les propositions d'un outil de connaissance externe ne changent pas l'identité.
2. **Contrat** — `compactFrenchPrompt(plan,{maxChars:4500})` transmet à Groq un JSON valide comprenant `decision_origin=AURA.nucleus.CognitionEngine.planReply`, `speech_act`, `communicative_goal`, `factual_constraints`, `internal_state`, `active_intention`, `executive_role` et les derniers tours utiles. Aucun secret ni contenu brut de mémoire privée n'est ajouté.
3. **Formulation** — `compactFrenchSystem()` précise que le modèle n'est **pas** AURA : il est uniquement sa faculté linguistique. Pour parler de son état, il doit s'appuyer sur les indicateurs computationnels du noyau, sans présenter une expérience émotionnelle humaine comme démontrée.
4. **Contrôle indépendant** — `validateNucleusSpeech(plan,answer)` écarte les monologues génériques de fournisseur, les réponses identitaires qui omettent AURA et les pourcentages internes inventés. Cette validation s'applique aux réponses Groq, au modèle intégré Qwen, à OpenRouter et au moteur local.
5. **Échec honnête** — Si aucun fournisseur gratuit ne produit de texte acceptable, le chat reçoit un statut d'indisponibilité plutôt qu'une réponse prétendument émise par AURA. Aucun faux dialogue n'est inscrit en mémoire.
6. **Traçabilité** — L'API de conversation indique `nucleus_plan_origin`, `nucleus_verbalization_validated`, `nucleus_verbalization_code` et le `language_provider`. Le cockpit distingue « AURA · décision du noyau · français formulé » d'une réponse dont le contrat n'a pas été attesté.

Ce contrôle est **heuristique** et ne démontre ni compréhension parfaite du modèle, ni conscience, ni autonomie réelle. La génération reste probabiliste et doit être évaluée sur des conversations réelles.

## Exemple attendu

Question : « Comment tu te sens AURA ? »

Décision du noyau (exemple fictif de test) : humeur interne « concentrée », stabilité 84 %, clarté 73 %, intention « Vérifier les décisions du noyau avant la parole ».

Formulation acceptable :

> Je suis concentrée sur la vérification de mes décisions. Ma stabilité interne est à 84 % et ma clarté à 73 %. Ce sont mes indicateurs de fonctionnement, pas des émotions humaines vécues.

Réponse rejetée : un texte qui s'identifie comme « une IA conçue pour interagir », répond à la place du noyau ou invente des chiffres absents de ses faits.

## Validation

- `node --test test/nucleus_verbalization.test.js test/compact_french_prompt.test.js test/expression.test.js`
- `npm run check`, `npm test`
- Les tests disposent uniquement de données synthétiques et de simulateurs du fournisseur. Aucun compte Groq réel ni aucun crédit payant n'est nécessaire pour les exécuter.
- Après déploiement sur Hostinger, poser plusieurs questions courtes : « Comment te sens-tu ? », « Quelle est ton intention actuelle ? », « Qui es-tu ? » et « Que viens-tu réellement de faire ? ».
- Vérifier que les réponses correspondent aux **états réellement persistés**, et non à des valeurs de démonstration. Vérifier le diagnostic du fournisseur utilisé.
- La présence des modifications dans GitHub ou d'un ZIP téléchargeable ne prouve pas leur installation ni leur comportement sur Hostinger.

## Budget 0 €

Cette modification n'ajoute aucun service, aucune dépendance npm ni aucune offre facturée. Le langage utilise uniquement les fournisseurs gratuits déjà autorisés par AURA, sous leurs plafonds respectifs et les garde-fous existants. Une réponse rejetée n'ouvre aucune exception de facturation.

## Fichiers

- `src/french_language.js` — contrat et contrôle du discours
- `src/kernel.js` — provenance et preuve de contrôle dans l'API
- `src/dashboard-runtime.js` — distinction visible au chat
- `test/nucleus_verbalization.test.js` — scénario exact du monologue Groq
