# AURA — Consentement social et questions composées (16 novembre 2026)

## Deux aptitudes indépendantes

1. **Décider s'il faut communiquer.** Le régulateur `social_homeostasis.js` compare le silence, l'examen local, la consolidation et la recherche d'un contact humain. Ses conséquences ne sont apprises qu'à partir d'essais corrélés aux preuves admissibles, et non des compliments, du seul passage du temps ou de l'avis d'un LLM.
2. **Former et comprendre du français.** `native_session_discourse.js` peut désormais répondre à deux ou trois questions coordonnées sur les faits explicitement déclarés par l'utilisateur dans une session : prénom, objectif, goûts, préférences, favoris. Chaque sous-question est résolue séparément, et **l'ensemble est refusé si un seul élément est inconnu**. Les faits révisés remplacent les versions précédentes.

### API de consentement (propositions privées uniquement)

`POST /api/organism/motivation/consent`, connexion propriétaire et origine du site obligatoires, JSON `{"enabled": true}` ou `{"enabled": false}`.

- Par défaut, le consentement vaut `false`. Seul le propriétaire authentifié peut l'activer.
- Le retrait supprime les propositions encore en attente, et bloque leur consultation ou acquittement.
- Ce consentement **ne permet pas** l'envoi de messages externes, l'ouverture du microphone ou l'envoi automatique d'une notification. `external_delivery_enabled` demeure `false`.
- `GET /api/cognition/initiative` conserve la nature privée et facultative de l'initiative; le contenu reste tributaire d'une preuve indépendante et de la politique apprise.
- Le contrôle de consentement ne constitue **pas** une preuve qu'AURA initie déjà une conversation utile en production.

### Exemples bornés (mode `AURA_NATIVE_FRENCH_MODE=native-acquired`)

Après les déclarations « Je m'appelle Camille », « Je veux écrire un roman », « Mon jeu préféré est Cyberpunk » :

- « Comment je m'appelle et quel est mon objectif ? » peut être résolu en deux énoncés sourcés.
- « Quel est mon objectif, quel est mon jeu préféré et comment je m'appelle ? » peut être résolu en trois énoncés sourcés.
- Si le prénom, le jeu ou l'objectif est absent, toute la question composée reste sans réponse native, plutôt que d'inventer un fait.
- Les clauses hypothétiques, les déclarations de l'assistant et les autres sessions ne sont pas des preuves admissibles.

**Limites :** compétences de composition et de mémoire symbolique spécifiques, pas de dialogue français ouvert ni d'apprentissage neural. Les tests de régression ne mesurent pas la conversation humaine complexe et ne prouvent ni un déploiement Hostinger, ni l'apprentissage d'une utilité sociale réelle, ni la conscience subjective. Aucune API payante, aucun VPS, aucun poids de Qwen utilisé en mode `native-acquired`.

## À mesurer ensuite

1. À partir d'un contact réellement autorisé, enregistrer un identifiant de question et une réponse authentifiée dans la même session, en distinguant l'utilité *rapportée* de l'information effectivement acquise.
2. Tester si l'ablation de cet épisode modifie la décision future, puis si AURA choisit spontanément le silence après résolution du problème.
3. Faire évaluer à l'aveugle de nouvelles conversations françaises multithématiques avec corrections, ambiguïtés et dépendances temporelles, en publiant précision, couverture et erreurs non justifiées.
4. Vérifier un déploiement Hostinger sur le commit exact et une réponse orale réelle dans le navigateur. Aucun test CI seul ne valide la production.
