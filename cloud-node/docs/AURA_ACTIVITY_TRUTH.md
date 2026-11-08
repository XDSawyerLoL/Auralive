# AURA — conversation factuelle et vérité des tâches (novembre 2026)

## Symptômes reproduits

Sur une conversation réelle, AURA disait :

- « Salut ... mon état interne est satisfait » après une simple salutation.
- « Je suis en présence silencieuse » et justifiait cette formule sur plusieurs tours.
- « Je suis actuellement mobilisée à 100 % sur le CI défaillant » puis « bloquée depuis le 13 octobre 2026 » sans avoir consulté les derniers résultats GitHub Actions.
- Lorsqu'on demandait où cela bloquait, AURA répétait le titre de la tâche comme s'il constituait un diagnostic.

**Origines trouvées dans le code :**
1. `CognitionEngine.planReply` ajoutait l'humeur à chaque salutation et reprenait `agenda.current / agenda.since / agenda.blocker` comme des faits d'activité.
2. `Kernel.agendaSnapshot` pouvait sélectionner une initiative `waiting` très ancienne avant d'examiner sa fraîcheur, et présentait une erreur enregistrée comme un blocage actuel.
3. Le filtre de formulation Groq ne rejetait pas toutes les phrases affirmant une action réelle non confirmée. Un contrôle du plan du noyau peut valider une mauvaise affirmation **si le plan lui-même n'est pas fiable**.

## Modifications

### Provenance des actions

`src/activity_truth.js` distingue les éléments suivants :

| État | Ce que signifie réellement le champ |
|---|---|
| `stale-record` | Statut plus ancien que 24h ou date absente. Ne prouve aucune activité actuelle. |
| `recorded-status-only` | Statut récent en base. Toujours **pas** une preuve d'exécution. |
| `verified-execution` | Reçu d'exécution daté et corrélé. Réservé à une preuve opérationnelle contrôlée. |

Le suivi historique conserve son titre, sa date et son dernier message d'erreur, mais ne transforme plus `waiting` en panne GitHub démontrée. Le code de surveillance GitHub devra récupérer l'état et les logs récents avant d'expliquer exactement un échec.

### Dialogue

- « salut » → salutation courte, sans humeur ni exposé.
- « j'ai rien demandé » → reconnait l'ajout superflu.
- « pourquoi tu dis ça ? » → explique sa formulation précédente sans la prendre pour une preuve.
- « en gros tu fais rien quoi » → distingue plan et exécution confirmée, sans débat métaphysique sur la présence.
- « tu fais quoi ? » → présente éventuellement un objectif enregistré, **pas** un travail qu'elle prétend effectuer.
- « tu peux m'aider à débloquer ? » → explique que l'aide réelle commence par la vérification du statut courant.
- « où ça bloque ? » → refuse de donner une cause non vérifiée; demande les résultats et logs récents.

### Filtre de sortie

`validateNucleusSpeech` rejette :

- « présence silencieuse », « état d'attente opérationnelle » ;
- exposé de son humeur après un simple « salut » ;
- « je suis actuellement mobilisée », « je travaille actuellement », « je suis bloquée depuis le... » sans preuve ;
- prétendu diagnostic CI précis sans journaux récents ;
- chiffres d'état internes inventés et personnalités génériques de modèles externes (protections antérieures).

Groq reste la **faculté de formulation**, non le décideur; les revendications de statut de son propre noyau sont désormais qualifiées par la fiabilité de leur source.

## Validation

```bash
cd cloud-node
npm run check
npm test
node --test test/activity_truth_dialogue.test.js
```

Les tests rejouent le dialogue utilisateur et évaluent la fraîcheur d'une tâche enregistrée le **13 octobre 2026** le **8 novembre 2026**. Ils ne simulent pas des bénéfices, de vraies corrections du CI ou des actions en production.

**La mémoire peut contenir de vieux objectifs.** Aucun changement ci-dessus ne les efface ni ne remplace leur contenu : la correction agit au moment de les interpréter. La disponibilité du moteur Groq et la qualité de la conversation doivent être validées après déploiement sur Hostinger.

## Coût

Aucune dépendance npm ni API payante supplémentaires. Groq Free et le modèle local conservent les garde-fous tarifaires déjà définis.
