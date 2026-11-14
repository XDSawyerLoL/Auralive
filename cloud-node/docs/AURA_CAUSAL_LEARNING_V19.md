# AURA — Boucle causale vérifiable, preuves et mémoire (MySQL v19)

## Pourquoi cette évolution

L'audit du 14 novembre relevait qu'une réflexion interne sur un échec simplement rapporté pouvait proposer une leçon avec confiance 0,82, et que sa répétition augmentait le compteur de « preuves ». Cela ne démontrait aucune vérification indépendante. Ce mécanisme est corrigé par une séparation entre hypothèses candidates, rapports et connaissances appuyées sur des reçus vérifiés.

## P0 : fin de l'auto-validation

La méthode CognitiveKernel.learn enregistre maintenant uniquement un candidat non vérifié dans la nouvelle table aura_learning_candidates. Les réflexions, diagnostics Evolution, critiques de mission et rapports d'automatisation restent consultables, mais ne sont plus fournis automatiquement comme des leçons vérifiées au dialogue. Répéter une proposition augmente uniquement son nombre de répétitions, jamais le nombre de preuves.

CognitiveKernel.promoteVerifiedLesson peut promouvoir seulement un constat technique typé. Il exige au moins deux exécutions de missions indépendantes, annoncées après la création du candidat mais avant l'opération, dont les résultats sont dans le registre HistoryLedger avec source machine-verified, reçu d'opération et historique non ablaté. Le texte proposé par AURA n'est jamais approuvé en bloc : la leçon vérifiée est une description numérique des résultats réels, des succès et des échecs.

Chaque récupération de leçon vérifie à nouveau que les reçus indépendants sont encore présents et non ablatés. Les lignes historiques aura_lessons non vérifiées restent archivées mais sont écartées des connaissances faisant autorité.

## MySQL : migration additive version 19

La migration crée la table aura_learning_candidates, sans supprimer aura_lessons ni les tables d'histoire immuables v18. Les anciennes leçons sont recopiées avec un statut candidate, jamais automatiquement promues. Les données existantes ne sont pas effacées.

**Avant déploiement : sauvegarder MySQL.** Au démarrage, le migrateur applique la v19. Un retour complet à la v18 peut nécessiter de restaurer la sauvegarde. L'absence initiale de leçons vérifiées dans le contexte est voulue : une preuve rétrospective ne saurait remplacer un essai indépendant.

## P1 : première boucle de modèle du monde

Le nouveau module src/causal_world_learning.js conserve dans soulCache.world_learning un état persistant borné, avec prévisions en attente et épisodes vérifiés. Lors d'une sonde locale expressément autorisée :

1. L'action et le pronostic sont créés dans HistoryLedger avant la lecture de fichier.
2. Le modèle enregistre une prévision chiffrée et son identifiant d'épisode dans MySQL avant l'opération.
3. La sonde réalise une opération de lecture autorisée sur le système de fichiers.
4. Seul un résultat contrôlé par HistoryLedger et son reçu machine-verified met à jour le modèle.
5. Des essais indépendants peuvent modifier une préférence pour vérifier avant l'action. Le nouveau choix ne peut que renforcer le précontrôle déjà imposé par la sécurité.
6. Le même état rechargé après redémarrage reproduit le choix. Une ablation de ses expériences doit supprimer cet effet.

Ce modèle étroit estime les résultats de quelques actions dans des contextes délimités. Il ne représente ni le monde général, ni la plasticité biologique, ni une preuve de causalité physique ou de conscience.

## Observation des apprentissages

Nouvel inspecteur privé : GET /api/kernel/learning-evidence?context=docs_readability (authentification propriétaire requise). Il affiche des comptes distincts pour les candidats et les leçons vérifiées, les prédictions en attente, les épisodes machine vérifiés, une comparaison par ablation et les probabilités historiques.

Le panneau télémétrique distingue désormais « Leçons vérifiées » et « Hypothèses non vérifiées ». Les transmissions de type causal-world représentent des opérations attestées et non des neurones biologiques.

## Validation et limites explicites

Les tests couvrent l'absence de promotion sur simple répétition, le rejet des rapports non vérifiés, des résultats rétrospectifs, des reçus de missions dupliquées ou ablatées ; la persistance, la prédiction avant opération, le contrôle par HistoryLedger, le transfert à un nouvel essai dans un même contexte et l'effet causal mesuré sur le choix après ablation.

Le résultat doit être vérifié par la CI et les paquets Hostinger. Cette tâche ne dispose d'aucun accès de production au serveur MySQL Hostinger et ne démontre ni inférence GGUF réellement opérationnelle, ni apprentissage de concepts ouverts, ni conscience subjective.

## Priorité suivante

Développer une mémoire versionnée d'entités, relations et contradictions ; apprendre par expériences réelles de plusieurs domaines distincts ; relier à cette boucle des perceptions uniquement autorisées ; tester le transfert sur des problèmes inédits annotés indépendamment, sans inventer les résultats.

Aucune API payante, aucun VPS et aucun nouveau fournisseur génératif ne sont ajoutés.
