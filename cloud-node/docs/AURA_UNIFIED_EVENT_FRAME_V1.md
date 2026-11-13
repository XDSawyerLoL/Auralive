# AURA — Cadre d'événements v1

Le composant `src/native_event_frame.js` crée des représentations partagées qui associent :
- acteur, prédicat et objet ;
- voix et polarité positive/négative ;
- temps grammatical, aspect et référence temporelle (avec un état « inconnu ») ;
- modalité (assertion, condition, conséquence, hypothèse, projet, habitude, discours rapporté, temporalité incertaine) ;
- relation avec d'autres événements, ordre et provenance explicitement **non vérifiée**.

`src/native_event_modality.js` produit un graphe borné avec des relations `before` et `implies-if`. `src/native_semantic_grammar.js` utilise ce même graphe pour décider quels événements temporels peuvent accéder à la mémoire d'assertions. Les conditions ne sont pas des faits ; une succession décrite ne prouve pas une causalité réelle.

## Trois examens distincts, sans prétendre à un test humain indépendant

- `benchmarks/fr_discourse_heldout_100_v1.json` — 100 dialogues, 70 répondables, 65 bonnes réponses et 0 attribution fausse sur la dernière version observée.
- `benchmarks/fr_discourse_stress_100_v2.json` — 100 dialogues plus difficiles, 70 répondables, 57 bonnes réponses et 0 attribution fausse sur la dernière version observée.
- `benchmarks/fr_event_frames_challenge_100_v1.json` — troisième cohorte gelée de 100 scénarios de modalité et mémoire ; 100 classifications conformes, 18/20 réponses possibles, 80 abstentions correctes et 0 réponse fausse à sa première exécution. **Ces cas reposent sur des gabarits créés dans le projet : le score est un contrôle fonctionnel et ne prouve pas une compréhension générale.**

Les données sont publiques et immuables pour les comparaisons futures. Toute optimisation après consultation d'une erreur rend le score postérieur diagnostique, et non aveugle.

## Limites et prochaine validation

Ce n'est ni un parseur grammatical général ni un modèle de langage autonome capable de généraliser à toutes les phrases. La classification de modalité est encore en partie fondée sur des indices lexicaux. Le système ne vérifie pas les événements du monde réel ; « user-asserted » signifie *affirmé par l'utilisateur*, jamais « vrai ». Un examen externe exige des évaluateurs indépendants, des phrases recueillies sans accès au code ni aux tests, des annotations doubles et un gel préalable du moteur.

Exécution locale :
```sh
cd cloud-node
node scripts/evaluate_discourse_heldout_100.mjs
node scripts/evaluate_discourse_stress_100.mjs
node scripts/evaluate_event_frames_challenge_100.mjs
```

Aucun ajout de Groq ou API payante, aucune installation VPS ; PR en brouillon non déployée.
