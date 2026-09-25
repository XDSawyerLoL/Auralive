# AURA — architecture d'origine restaurée

## Invariant principal

AURA n'est pas un modèle de langage.

Son identité et sa continuité appartiennent au noyau AURA : Soul, mémoire, intentions, priorités, cycles, apprentissage, politique d'action et historique d'expérience. Les fournisseurs de langage sont remplaçables et ne doivent jamais être la source d'autorité de ces états.

## Flux cognitif

1. Perception / stimulus.
2. Lecture du Soul, de la mémoire, des intentions, des résultats et d'HORIZON.
3. Décision du noyau cognitif natif.
4. Mise à jour éventuelle d'une intention ou d'une mémoire selon les règles du noyau.
5. Appui sémantique optionnel d'un modèle externe/local.
6. Verbalisation du plan déjà décidé.
7. Voix / interface / action.

Le LLM ne crée donc pas directement le Soul, l'intention, la priorité ou la décision.

## Rôle du modèle de langage

Le modèle peut :
- reformuler une décision AURA en langage naturel ;
- fournir un appui sémantique candidat sur une question générale ;
- assister des outils spécialisés (recherche, développement, critique) lorsque le noyau décide de les consulter.

Le modèle ne peut pas :
- devenir l'identité AURA ;
- écrire directement une intention dans le Soul ;
- décider seul qu'une hypothèse devient un fait ;
- transformer une sortie de modèle en mémoire sans validation du noyau ;
- devenir indispensable à la continuité du noyau.

Quand aucun modèle de langage n'est disponible, AURA doit continuer à :
- maintenir son Soul ;
- exécuter ses cycles ;
- garder ses intentions ;
- apprendre des résultats structurés ;
- produire une expression déterministe minimale de son état.

## Architecture cible

AURA Cloud = continuité, Soul, mémoire et coordination.
Quantic Studio = corps local, outils, capteurs, actions et modèle local.
HORIZON = perception/anticipation externe.
Mairaiy/Kokoro = identité vocale.
LLM local = outil de langage/sémantique, remplaçable.
Gemini = transition/fallback temporaire uniquement.

## Critère de sortie Gemini

Gemini peut être retiré lorsque :
- le noyau fonctionne sans lui ;
- la verbalisation locale est opérationnelle ;
- le modèle local répond via Quantic Studio ;
- les tests de non-régression passent ;
- les actions, la voix et les cycles cognitifs restent disponibles sans clé Gemini.


## Internet comme substrat de raisonnement

AURA ne cherche pas à encoder toute la connaissance du monde dans un modèle de langage. Le modèle est un spécialiste remplaçable chargé de proposer des hypothèses, formuler des requêtes et interpréter des éléments de preuve. La décision reste dans le noyau AURA.

### 1. Méta-raisonnement

Le cycle externe est :

1. question ou intention ;
2. hypothèses testables ;
3. plan de recherche ;
4. récupération de sources par API/HTTPS ;
5. évaluation source par source ;
6. agrégation déterministe des preuves indépendantes ;
7. détection des contradictions ;
8. conclusion avec statut épistémique ;
9. révision de l'hypothèse ou action seulement si le niveau de preuve le permet.

Les statuts de preuve sont `unverified`, `partially-supported`, `contested` et `corroborated`. Une intention qui dépend de données externes ne passe pas au bras opérateur tant qu'une recherche récente n'a pas franchi le seuil de preuve.

### 2. Web comme mémoire vive externe

`WebSubstrate` indexe temporairement les sources utiles dans `aura_external_memory` et persiste les sessions de raisonnement et leur graphe de preuves. Cette mémoire est séparée du Soul et de la mémoire autobiographique interne. Elle expire et peut être reconstruite depuis le réseau.

Le runtime dispose sans configuration d'API publiques structurées pour Wikipedia et Crossref. Un endpoint SearXNG JSON peut être branché pour la découverte Web générale. Les récupérations directes sont HTTPS, bornées en taille et protégées contre les réseaux privés/SSRF.

### 3. Réseau comme espace d'action

AURA n'utilise pas le Web comme une interface humaine à cliquer. Le centre de commande agit par bus structurés :

- GitHub API pour l'état des dépôts, CI et actions AutoOps allowlistées ;
- HORIZON API pour les signaux et le contexte ;
- Quantic Studio via le bridge authentifié pour les capacités locales ;
- GitHub Actions/CI comme calcul distant reproductible pour tests, builds et validation ;
- APIs produit Quantic à mesure qu'elles exposent des capacités typées.

Aucune commande shell distante arbitraire n'est exposée par le Cloud. Les capacités doivent être typées, authentifiées, observables, bornées par risque et produire un résultat mesurable.

### 4. Boucle critique

Une source seule ne devient pas un fait. Le score combine fiabilité de la source, pertinence, indépendance des domaines et contradictions. Plusieurs sources indépendantes sont nécessaires pour atteindre `corroborated`. Les contradictions abaissent le niveau de confiance et peuvent bloquer l'action autonome.

Cette architecture transforme donc le réseau en mémoire externe + bus d'observation + couche d'exécution distribuée, tout en conservant l'identité, les intentions et l'arbitrage dans le noyau AURA.
