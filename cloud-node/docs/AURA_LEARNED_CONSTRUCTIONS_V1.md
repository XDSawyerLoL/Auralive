# Acquisition de constructions françaises — expérimentation v1

## Pourquoi

Le noyau antérieur reconnaît des structures explicitement codées et quelques relations UD agrégées. Même lorsque les corrections sont correctement prises en compte, la compréhension de structures grammaticales hors de ces formes reste limitée. Le module `src/native_construction_learning.js` ajoute une forme **d'acquisition supervisée** : il extrait des schémas d'arguments à partir de plusieurs exemples annotés, en utilisant le lexique morphologique UD déjà embarqué. Il n'ajoute ni modèle génératif, ni API, ni VPS.

## Fonctionnement réel

1. Un évaluateur humain fournit un exemple avec `sentence`, `agent`, `predicate` (lemme), et `patient`. Une phrase non reconnue comme une affirmation simple est refusée.
2. L'inducteur remplace les entités, la forme verbale et le déterminant par les variables `@agent`, `@verb`, `@patient`, `@det`. Les verbes sont confrontés aux formes apprises sur UD_French-GSD TRAIN.
3. Il faut **au moins trois exemples distincts**, trois acteurs distincts, trois patients distincts et deux verbes distincts, partageant la même structure abstraite, pour autoriser l'inférence.
4. Une nouvelle phrase de cette structure peut être interprétée avec de nouveaux acteurs, objets et verbes présents dans le lexique morphologique. La modalité, l'incertitude et la négation empêchent l'assertion de faits hypothétiques.
5. L'état est exportable/importable en JSON via `snapshot()` et `new NativeConstructionLearner(snapshot)`. Un test d'ablation retire une construction et vérifie que l'attribution change.

La structure reste une généralisation **dans une même famille syntaxique**, pas une compréhension illimitée. L'existence d'un exemple ne garantit pas sa vérité. Aucun entraînement automatique sur une conversation privée ou sur les réponses d'AURA n'est activé.

## Exemples annotés

```json
{
  "schema": "aura-annotated-language-examples-v1",
  "examples": [
    {"sentence": "Devant la gare, Romain a fermé la porte.", "agent": "Romain", "predicate": "fermer", "patient": "porte"},
    {"sentence": "Devant la gare, Camille a ouvert le tiroir.", "agent": "Camille", "predicate": "ouvrir", "patient": "tiroir"},
    {"sentence": "Devant la gare, Nadia a déplacé la caisse.", "agent": "Nadia", "predicate": "déplacer", "patient": "caisse"}
  ]
}
```

Enregistrer cet objet dans un fichier `annotations.json`, puis lancer :

```sh
cd cloud-node
node scripts/train_native_constructions.mjs annotations.json construction_snapshot.json
```

Le fichier de sortie doit être inexistant pour éviter d'écraser une mémoire précédente. L'application doit charger explicitement son snapshot avant utilisation : aucun déploiement automatique n'est déclenché par ce script.

```js
import {NativeConstructionLearner} from './src/native_construction_learning.js';
import {answerFrenchFromConversation} from './src/native_semantic_grammar.js';
const learner=new NativeConstructionLearner(snapshot);
const response=answerFrenchFromConversation({
  history:[{role:'user',content:'Devant la gare, Luc a ouvert la fenêtre.'}],
  question:'Qui a ouvert la fenêtre ?',
  constructionLearner:learner
});
```

## Contrôles

- L'exemple répété ne peut pas franchir le seuil d'apprentissage.
- L'ablation du schéma provoque effectivement une modification du comportement.
- Les exemples hypothétiques, futurs ou contenant une négation ne produisent pas de faits affirmés.
- L'état est exportable, réimportable et contrôlé à la restauration.
- Les deux benchmarks de dialogue de 100 questions et les 100 cas d'événements restent inchangés.

## Limites structurelles et prochaine étape

Un apprentissage de gabarits annotés reste **étroit** : il n'apprend ni toutes les constructions grammaticales du français ni les références longues, le discours libre et les connaissances implicites. Pour une généralisation forte, il faudra un modèle de représentations de phrases entraîné sur un corpus français beaucoup plus large avec évaluation **externe et aveugle**. Une option gratuite est un modèle encodeur de langue déjà entraîné, non génératif, à condition de vérifier les licences, la mémoire et la compatibilité Hostinger. Ce développement ne promet ni autonomie linguistique générale ni conscience.
