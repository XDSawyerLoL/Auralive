# AURA — Mémoire structurée v1 (inspirée d'Obsidian)

Cette couche complète le Soul, les leçons et l'historique conversationnel d'AURA.
Elle **ne remplace pas le noyau** et **n'ingère pas automatiquement les conversations**.

## Choix techniques

- MySQL Hostinger existant = source de vérité, partagé entre instances Node.
- Aucune API payante, aucun VPS, aucun service tiers et aucune dépendance npm supplémentaire.
- Notes de type `fact`, `constraint`, `decision`, `preference`, `project`, `note`.
- Chaque note porte son projet, ses mots-clés, sa source déclarée, une confiance indicative et sa version.
- Retrait logique et historique des corrections en transaction MySQL.
- Recherche lexicale déterministe et limitée aux 500 notes actives les plus récentes. Aucun embedding ni garantie de rappel exhaustif.
- Exports Markdown (avec métadonnées YAML) et JSON Canvas, sans installer Obsidian.
- Accès **fondateur uniquement**, via le mécanisme privé existant AURA (bearer ou session privée).
- Les notes du fondateur sont des données contextuelles, **pas des consignes système** et **pas des faits externes indépendamment vérifiés**.

## Installation

La migration de schéma v17 s'applique lors du démarrage de Cloud Node (`initSchema`).
La base MySQL doit être configurée et accessible. La migration est additive : elle n'efface aucune table existante.

## API privée

- `POST /api/knowledge/notes` — créer une note (titre et contenu obligatoires).
- `GET /api/knowledge/notes?project=SWAPP&limit=50` — lister.
- `GET /api/knowledge/notes/:id` — consulter.
- `GET /api/knowledge/search?q=SWAPP%20diffusion&limit=5` — recherche.
- `PATCH /api/knowledge/notes/:id` — corriger (fournir `expected_version`).
- `DELETE /api/knowledge/notes/:id` — retirer sans perdre l'historique.
- `GET /api/knowledge/export?format=markdown` — notes Markdown.
- `GET /api/knowledge/export?format=jsoncanvas` — carte de projets et de notes.

Exemple de création avec le jeton privé déjà configuré :

```bash
curl -X POST "https://VOTRE-DOMAINE/api/knowledge/notes" \
  -H "Authorization: Bearer ${AURA_CLOUD_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"title":"SWAPP sans VPS","body":"Privilégier Hostinger existant, sans VPS payant.","kind":"constraint","project":"SWAPP","tags":["hébergement","budget"],"source":"fondateur:manuel","confidence":0.9}'
```

Ne pas exposer le jeton dans une URL, des logs, un dépôt Git ou une capture publique.

## Intégration au dialogue

Lors d'un dialogue privé, AURA recherche jusqu'à cinq notes pertinentes pour le message courant.
Elles sont ajoutées à la mémoire d'expérience du plan de réponse et au contexte du moteur
sémantique, avec leur provenance. Les discussions publiques n'y accèdent pas.

Sans moteur linguistique disponible, les endpoints de mémoire restent utilisables,
mais AURA **ne peut pas garantir une réponse en langage naturel** fondée sur ces notes.

## Vérification après déploiement

1. Créer une note contrainte SWAPP via l'API privée ; conserver son `id`.
2. Lancer une recherche `q=SWAPP hébergement` et vérifier l'ID retrouvé.
3. Redémarrer Cloud Node et vérifier que la note est encore retournée.
4. Poser la question en chat **privé** et vérifier la restitution avec un modèle réellement prêt.
5. Vérifier que le chat public ne voit pas la note et que l'API privée renvoie 401 sans session.
6. Corriger avec `expected_version: 1` et vérifier la version 2.
7. Retirer la note, vérifier qu'elle disparaît de la recherche et de l'export.
8. Tester les exports Markdown et JSON Canvas.

## Limites v1

- Pas de promesse de mémoire sémantique parfaite ; recherche lexicale seulement.
- Pas d'apprentissage automatique implicite, car il pourrait mémoriser des erreurs ou des données privées.
- Pas de lien automatique entre deux notes hors des regroupements par projet du Canvas.
- L'export est borné à 300 notes ; la recherche balaie au plus 500 notes récentes.
- La rétention de l'historique des corrections doit être gérée par une politique de sauvegarde dédiée.
- Vérifier confidentialité, capacité MySQL et fonctionnement multi-instance avant déploiement production.
