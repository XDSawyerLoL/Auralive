# AURA Everywhere v0.1

AURA Everywhere est le contrat commun qui relie chaque produit Quantic au même noyau AURA.

## Présence produit

Chaque produit s'enregistre puis envoie un heartbeat périodique.

- `POST /api/aura/everywhere/register`
- `POST /api/aura/everywhere/:id/heartbeat`
- `POST /api/aura/everywhere/:id/observe`
- `POST /api/aura/everywhere/:id/event`
- `GET /api/aura/everywhere/status`
- `GET /api/aura/everywhere/capabilities`

Les routes sont privées et nécessitent le token AURA. Elles ne servent pas à aspirer le contenu utilisateur : elles décrivent version, état, capacités, surfaces et métadonnées opérationnelles.

## Produits inscrits

AURA, Quantic Studio, Quantic Glide, Quantic Mail, Quantic OS, ZOON, Pulse, Quantic News et Providence.

## Modification par AURA

Un produit peut annoncer les permissions `observe`, `propose-change`, `test` et `canary`.
La politique recommandée est `branch-test-canary-promote` : AURA observe, diagnostique, propose ou crée un changement isolé, valide par tests/CI/canary, puis seulement ensuite une promotion peut être autorisée.

Aucune route AURA Everywhere ne fournit un shell distant arbitraire.

## Curiosity Engine

Le moteur de curiosité est indépendant du chat. Il note les questions selon nouveauté, incertitude, impact, pertinence et répétition. Les questions suffisamment fortes peuvent déclencher le Web Substrate. Les recherches conservent preuves, statut épistémique et conclusion avant réinjection dans le noyau cognitif.

Les anomalies produit remontées par `/:id/event` peuvent créer une question de curiosité automatiquement.
