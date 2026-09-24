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
