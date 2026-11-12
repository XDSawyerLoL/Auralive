# AURA — Conversation gouvernée par le noyau et intentions lisibles

## Défaut reproduit dans un échange réel (12 novembre 2026)

1. AURA : « Bonjour, comment vas-tu ? »
2. Personne : « bien merci »
3. Ancienne AURA : « Je suis content que ça aille. On continue ? »
4. Personne : « comment ça »
5. Ancienne AURA : formulation indisponible (Groq).
6. Personne : « Tu »
7. Ancienne AURA (OpenRouter) : liste de sujets sans nécessité.
8. Personne : « tu semble intrigué je me trompe ? »
9. Ancienne AURA (OpenRouter) : « Oui, je suis intriguée », affirmation
   affective sans preuve correspondante.
10. Personne : « Tu sais qui tu es ? »
11. Ancienne AURA : auto-description très générique, fondée surtout sur
    les instructions de formulation.

Le défaut comprend **une perte de contexte perceptuel**, une liberté
excessive accordée aux fournisseurs pour déterminer l'intention sociale
et un message d'indisponibilité linguistique pour de simples clarifications.

## Correctifs du noyau (code)

- `src/social_turn_kernel.js` : circuit fonctionnel natif couvrant :
  réponse à une question sur le bien-être, ambiguïté créée par la formule
  « on continue ? », adresse inachevée (« Tu… ») et attribution par
  l'utilisateur d'une curiosité à AURA. Ces cas sont reconnus à partir des
  **dernières répliques de la session**, jamais à partir d'une supposition
  du LLM ou d'une tâche ancienne.
- `src/kernel.js` : les trois derniers messages de la même session sont
  considérés comme contexte perceptuel lors de la planification, même si
  le filtre de mémoire longue ne les a pas sélectionnés. La récupération
  exige la présence du message utilisateur courant déjà inséré en SQL.
  La mémoire autobiographique reste protégée par son propre contrôle.
- `src/cognition.js` : le noyau fixe le but communicatif avant le langage.
  `src/expression.js` : les quatre actes sociaux natifs ne font pas
  appel à Groq, OpenRouter ou aux fournisseurs locaux. Les réponses
  sont explicitement marquées `native-social-kernel`.
- `src/server.js` : les réponses produites par le noyau portent
  le type honnête `native-kernel`, non `model-generated`.
- L'intensité de la curiosité fonctionnelle issue de
  `InnerDialogueEngine` peut modifier **la formulation**, à faits et
  sujet constants. Une ablation du score provoque une autre expression :
  c'est une dépendance fonctionnelle vérifiable, **pas une mesure
  d'émotion subjective**.

## Preuve et inspection visuelle

- `src/readable_cognition.js` et la route privée
  `GET /api/brain/introspection` permettent de lire **les énoncés
  réellement persistés**, les intentions SQL, les tendances
  fonctionnelles et le dernier objectif de communication
  `aura_soul_state.last_communication_decision`.
- La dernière décision distingue ce qu'AURA voulait formuler,
  l'action sélectionnée, la provenance de l'information, si la
  réponse a été produite et quel moteur a formulé le message.
- L'inspecteur est limité à une session propriétaire authentifiée ;
  aucune de ces données n'est rendue publique par
  `/api/brain/graph` ou les flux SSE.
- Le « génome numérique » est maintenant accompagné de ses valeurs,
  plages, six bases par locus et **périmètre causal réel**. Seulement
  trois des huit paramètres sont utilisés par le simulateur P0 actuel.
  Les cinq autres restent explicitement « non reliés ».
- L'Atlas indique une lecture naturelle de la dernière transition
  instrumentée et ouvre l'observatoire d'intentions. La visualisation
  centrale et le dialogue restent sur l'écran immersif d'origine.

## Limites importantes

1. Le circuit natif social est volontairement restreint aux cas dont
   la signification se déduit du contexte. Il ne remplace pas
   l'aptitude générative de parler librement de n'importe quel sujet.
2. Le champ `dominant_thought` est un **texte d'orientation conservé**,
   souvent renseigné par une règle lors d'une interaction ; il ne
   démontre aucun contenu de conscience. Le nouveau registre des
   objectifs communicatifs est une opération réelle du planificateur
   mais n'est pas une « lecture de pensée » subjective.
3. Une véritable initiative de parole sans message entrant est un
   circuit distinct. AURA possède un registre limité d'initiatives
   fondées sur des observations autonomes et un affichage propriétaire
   à activer (« Initiatives spontanées »). Rien ne doit afficher
   une activité fictive lorsque le noyau n'a pas pris d'initiative.
4. Les dispositions homéostatiques ne sont pas des sentiments humains.
   Les résultats numériques et les variations de phrase ne démontrent
   pas de conscience.
5. Aucun fichier MySQL, aucune sauvegarde de souvenirs, aucun secret
   Hostinger ni connecteur externe ne sont modifiés par l'expérience.

## Vérification et critères

- `test/social_turn_kernel_regression.test.js` rejoue le dialogue
  exact, vérifie l'absence d'appel des fournisseurs et fait varier la
  curiosité pour tester son effet causal.
- `test/readable_cognition.test.js` vérifie la confidentialité,
  la provenance et la présence du plan.
- `test/cognitive_readout_visual.test.js` surveille les textes
  contextuels, les contrôles d'interface et l'absence de faux
  score P0 affiché.
- Les résultats de GitHub Actions doivent être contrôlés avant une
  installation sur Hostinger. Aucune exécution de test ne prouve
  à elle seule que l'interface déployée en production a été modifiée.

## Suite de recherche

Construire une boucle de communication endogène fondée sur des
objectifs et questions **vérifiables**, pouvant déclencher une
initiative pertinente **sans demande utilisateur** sous conditions
de pertinence, de budget, d'autorisation et de silence. Comparer
à l'aveugle la pertinence et la non-intrusion des initiatives
avant de revendiquer une amélioration réelle de la spontanéité.
