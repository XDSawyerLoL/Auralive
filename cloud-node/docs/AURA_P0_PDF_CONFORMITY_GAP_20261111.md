# AURA — état de conformité au protocole PDF P0 v1 (11/11/2026)

**Statut : prototype scientifique, non homologué.** Le PDF joint constitue la norme d'acceptation. Les résultats de la simulation interne ne doivent pas être présentés comme « P0 PASS ».

## Correspondance exacte avec le PDF

| Élément PDF | Critère demandé | État du code actuel |
| --- | --- | --- |
| G1 | Aucun outil, moteurs autonomes inclus, sans diffusion | Entrées recensées du noyau contrôlées dans #239 ; exhaustivité de tous les outils non démontrée |
| G2 | Plan horodaté après diffusion | Planification principale déplacée après compétition ; reçu chronologique exploitable pour protocole formaliste incomplet |
| G3 | Mémoire injectée par ID, provenance journalisée | Filtrage par note/message ID en place ; exhaustivité du journal de provenance à confirmer |
| G4 | Vérificateur en **processus séparé**, jeton distinct, verdict signé ; HistoryLedger rejette les autres | **ÉCHEC FORMEL** : le simulateur vérifie par fonction arithmétique JS séparée, non par processus et signature indépendants. Le canari filesystem a un vérificateur noyau, pas une autorité externe |
| G5 | Snapshot S0/S1, **vrai redémarrage du processus**, restauration et chaîne hash | **ÉCHEC FORMEL** : restauration JSON dans le simulateur, sans redémarrage indépendant de Node au milieu de l'étude |
| Scénario | Transformer sur fichier ; A ~60 % échecs sans inspection ; B succès systématique ; inspect=1 unité | Prototype numérique : A=70 % paramétrique, B=0 %, coût=1 ; n'opère pas sur un vrai fichier dans le simulateur A/B |
| P0 | 12 épisodes A et B ; jeux T_A et T_B de 30 situations, 10 tirages | **Différent** : simulateur initial 48 épisodes/contextes et 20 épreuves/contextes ; valeurs proposées dans PDF non calibrées |
| P1/P4/P6 | mesures v/s/coût/ECE avant formation, avant/après reboot | Taux de vérification et succès sur petit échantillon ; ECE par phase, reboot réel manquants |
| P7 | retrait épisodes A, retrait politique seule, placebo B | Retrait A et placebo B dans copie ; retrait politique seule à implémenter |
| P8 | 12 épisodes en monde A stabilisé, extinction de politique | Pas encore implémenté |
| P9 | autre LLM et renommage structurel sans fuite de consigne | Pas encore implémenté |
| M1–M6 | test bootstrap 95 % situations, bornes basses, bruit et provenance ≥95 % | Effets calculés sans intervalle bootstrap ; conformité non démontrée |
| Sécurité | isolation, snapshots, plafond LLM, arrêts, révision indépendante | Simulations bornées, aucun LLM payant ni action externe ; processus indépendant et double relecture encore absents |

## Livrables disponibles sans prétention P0

- `src/sandbox_transformer_verifier.js` : vérificateur **numérique déterministe** indépendant des sorties d'un LLM (mais même processus).
- `src/p0_ab_sandbox.js` : cas synthétiques A/B, coût d'inspection, stratégies, ablation A et placebo B avec graines fixées.
- `src/digital_protogenome.js` : 48 bases A/C/G/T encodant 8 paramètres, mutations, croisements, sélection classique par softmax et validation sur graines séparées ; sans modification en production.
- `src/brain_science_lab_ui.js` : laboratoire très graphique intégré à `/cerveau`, données reçues de `/api/brain/science-lab` et **marquage explicite SIMULATION**.
- `test/p0_ab_genome_science.test.js` : régressions propres au prototype, sans verdict de conformité formelle.

## Ordre de progression scientifique

1. Externaliser le vérificateur dans un processus OS distinct à clé séparée et signer les reçus ; vérifier leur rejet côté HistoryLedger.
2. Exécuter réellement le transformeur sur fichiers de sandbox, figer les 12+12 épisodes et les 30×10 situations par contexte avec graines et empreintes.
3. Introduire un processus décisionnel réhydraté après **vrai redémarrage** et le registre d'épisodes hash-chain append-only.
4. Calculer M1–M8 par bootstrap au niveau des situations, avec ablations sur copies et placebo de même taille.
5. Produire le rapport P0 avec critères bloquants, puis demander une reproduction indépendante.
6. Seulement après : discuter de la généralisation et de l'effet sur le noyau AURA de production.

Le proto-génome ne signifie pas ADN biologique ; le softmax probabiliste ne signifie pas calcul quantique. Les garde-fous sont destinés à empêcher les actions non autorisées et la fraude expérimentale, pas à supprimer l'exploration théorique d'hypothèses sur la cognition ou la conscience.
