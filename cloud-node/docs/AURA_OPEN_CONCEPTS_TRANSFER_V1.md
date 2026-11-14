# AURA — Mémoire conceptuelle et transfert entre domaines (v1)

## 1. Architecture réalisée

Le module src/conceptual_world_memory.js introduit un graphe de concepts construits à partir de nouvelles observations, sans liste fixe de noms, domaines, types ou relations. Les nœuds et liens sont identifiés de manière déterministe et sauvegardés dans soulCache.concept_memory, conservé dans le stockage MySQL déjà existant.

Un lien contient : sujet/type libre, relation, objet/type libre, domaine, polarité, portée temporelle, provenance, date et révision. Les sources répétées n'augmentent pas la preuve. Les corrections rétractent une source sans détruire les révisions ; une contradiction de polarité ou de localisation simultanée reste visible au lieu d'être écrasée.

Cette première version accepte jusqu'à 480 concepts, 360 relations, 16 sources par relation et conserve 600 dernières révisions, pour protéger la mémoire et les ressources Hostinger. Quand la capacité est atteinte, elle refuse l'écriture plutôt que de supprimer des données sans avertissement. « Ouvert » signifie ici vocabulaire et types apprenables, pas stockage illimité.

## 2. Dialogue et événements

Dans une conversation privée seulement, les phrases reconnues par le parseur français peuvent devenir des déclarations structurées :
- Romain a fermé la porte : Romain → événement « fermer porte » ; statut user-reported.
- Maya a ouvert le coffre une fois que Hugo a fermé la porte : deux événements liés par before.
- Si Maya ferme la porte, Hugo ouvre le coffre : relation implies-if, sans affirmer qu'un de ces événements est réellement survenu.
- Les négations, projets et modalités pris en charge ne deviennent pas des faits machine vérifiés.

Le texte intégral n'est pas copié dans chaque relation. La mémoire conceptuelle privée est retirée de publicSoul ; seuls des décomptes sont utilisés pour la télémétrie publique. Une conversation publique ne nourrit pas cette mémoire personnelle.

## 3. Observation du monde technique

Après une opération de lecture seule explicitement autorisée, le registre HistoryLedger valide une preuve d'exécution. Le modèle prédictif associe le contexte à un résultat ; seule cette preuve déjà enregistrée peut ajouter une relation machine-observed au graphe. Aucun client HTTP ne peut inventer une telle source. Rétracter une déclaration utilisateur ne supprime pas un reçu machine.

## 4. Transfert de relations entre domaines

Deux observations indépendantes d'une même relation abstraite, issues d'au moins deux domaines sources et de sujets distincts, permettent de proposer la relation dans un nouveau domaine. Exemple expérimental : « vérification → avant → exécution » observé dans la marine et le montage permet de proposer ce motif dans l'administration.

Ce transfert est explicitement une HYPOTHÈSE. La disparition des sources, une contradiction ou une ambiguïté empêche de le proposer. Il n'autorise aucune exécution ni aucune affirmation comme si un résultat cible avait été vérifié.

## 5. Transfert d'une compétence de sécurité

Les sondes réelles enregistrent, avant l'exécution, des propriétés concrètes de l'action (lecture seule, système de fichiers, accès à un chemin, précontrôle disponible). Lorsque deux missions distinctes dans deux contextes sources ont abouti à des résultats machine vérifiés cohérents, AURA peut proposer d'ajouter un précontrôle pour un troisième contexte technique doté des mêmes propriétés.

La proposition est refusée si les expériences sources se contredisent ou si les caractéristiques ne correspondent pas. Ce transfert peut influencer la décision lors d'une sonde déjà autorisée, uniquement pour AJOUTER une vérification, jamais pour supprimer une sécurité ni obtenir des permissions.

L'état survit au redémarrage ; retirer ses épisodes de preuve par ablation retire la proposition de transfert. Il s'agit d'une généralisation entre contextes techniques semblables, non d'un apprentissage global de tous les domaines.

## 6. Interface privée de contrôle

Les routes exigent une session privée AURA ou le jeton propriétaire ; les appels POST passent par la protection d'origine existante.

- GET /api/kernel/concepts?domain=marine : concepts, liens, conflits, sources et révisions.
- POST /api/kernel/concepts/observe : annotation humaine structurée, toujours non vérifiée.
- POST /api/kernel/concepts/retract : retrait d'une source utilisateur, sans effacer l'historique.
- POST /api/kernel/concepts/transfer : simulation du transfert de relation avec ablation, sans exécution.
- GET /api/kernel/learning-evidence?context=docs_readability : preuves historiques et transfert technique.

Exemple de corps JSON pour POST /api/kernel/concepts/observe :

    {
      "domain": "marine",
      "subject": {"label": "contrôler les amarres", "kind": "verification"},
      "relation": "avant",
      "object": {"label": "quitter le quai", "kind": "execution"},
      "polarity": "positive",
      "time_scope": "session_001"
    }

La réponse contient un source_id pour une éventuelle correction. Ne pas envoyer de secrets dans une annotation : les données privées sont conservées dans la base MySQL.

## 7. Tests et déploiement

Les tests couvrent la création de concepts de types inconnus, la correction des sources, la conservation des contradictions, les résultats vérifiés par le registre causal, le dialogue français, la réhydratation JSON, la confidentialité, la mémoire bornée, les nouveaux domaines, les effets de contradiction et d'ablation.

Cette version n'ajoute pas de migration au-delà de MySQL v19 : le graphe est inclus dans le JSON de l'état AURA. Sauvegarder MySQL avant déploiement. Aucun test GitHub n'est une preuve de performance d'apprentissage sur une instance Hostinger réelle, d'intelligence générale, de conscience ou de français parfait.
