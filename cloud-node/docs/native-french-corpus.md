# AURA — faculté française par corpus (sans LLM)
  
**Prototype technique, pas une conversation française ouverte et fluide.**
  
## Origine de la base

- Corpus `UniversalDependencies/UD_French-GSD`, fichier d’entraînement `fr_gsd-ud-train.conllu`.
- Référence : https://universaldependencies.org/treebanks/fr_gsd/index.html
- Dépôt : https://github.com/UniversalDependencies/UD_French-GSD
- Licence des données : **CC BY-SA 4.0**. Conserver l’attribution et les obligations de partage à l’identique pour toute redistribution des données dérivées. Les statistiques compactées restent des données dérivées sous cette licence.
- L’artefact `data/fr_ud_gsd_compact.json` contient des fréquences lexicales, des traits morphologiques et des trigrammes de catégories grammaticales, **pas** les phrases source.
- Corpus parcouru : 14 444 phrases non vides après filtrage et 287 486 mots dans les catégories grammaticales retenues ; 26 356 motifs lexicaux observés, 13 000 conservés et 900 trigrammes de catégories.
- Les formes isolées ne contiennent pas un modèle causal du monde, de l'intention de l'interlocuteur ou de la pragmatique.

## Reproduire localement

Télécharger le fichier `fr_gsd-ud-train.conllu` depuis le dépôt officiel. Exécuter depuis `cloud-node` :

```sh
npm run train:language:fr -- /chemin/vers/fr_gsd-ud-train.conllu
npm test
```

Le script n'utilise pas le réseau et n'est pas exécuté pendant les dialogues. Le format compact est régénérable en conservant la provenance et le SHA Git de la source.

## Activation explicite

Par défaut, AURA conserve le fonctionnement historique. Pour une expérimentation contrôlée :

```ini
AURA_NATIVE_FRENCH_MODE=prefer-local
```

Ce mode tente d'abord la verbalisation morphologique à partir du corpus pour les actes **explicitement couverts**, puis autorise le circuit de secours existant.

Pour **interdire Groq/OpenRouter pendant la verbalisation de la conversation** :

```ini
AURA_NATIVE_FRENCH_MODE=local-only
```

Dans ce mode :
- Les énoncés couverts passent par le réalisateur lexical/symbolique local ; les intentions sociales déjà approuvées par le noyau restent prises en charge sans LLM.
- Les énoncés hors périmètre sont refusés avec `local-corpus-unsupported-intent` : **pas** de phrase artificielle, ni invocation silencieuse de Groq, OpenRouter ou du LLM local.
- La fonction `ExpressionLayer.semanticSupport` ne sollicite aucun modèle externe.
- Ce réglage ne désactive **pas nécessairement** toutes les autres fonctions indépendantes utilisant des API dans le reste d'AURA ; les configurer séparément pour un fonctionnement totalement hors réseau.
- La présence du fichier de lexique n'est pas déclarée comme une compréhension libre, une compétence conversationnelle complète ou une preuve de conscience.

## Couverture volontairement limitée à cette étape

Actuellement : salutations, nom déclaré d'AURA, quelques énoncés simples décrivant l'état computationnel ; les phrases morphologiques structurées exigeant `origin:'nucleus-verified-semantic-frame'` et `evidence_verified:true` peuvent être réalisées avec la flexion vérifiée dans le corpus. Les autres actes restent hors couverture locale.

Prochains paliers réels : étendre le schéma d'actes et d'objets sémantiques décidé par le noyau ; apprendre des constructions à partir des dépendances UD plutôt que seulement des trigrammes de POS ; introduire Lexique 4 / LeXiK pour flexion, phonétique et relations sémantiques ; tester les paraphrases sans inventer de faits ; benchmark indépendant sur conversations inédites, contraintes mémoire et latence Hostinger. Un dictionnaire très volumineux ne remplace jamais cet apprentissage.
