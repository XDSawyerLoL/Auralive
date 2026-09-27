# Architecture canonique Quantic Sillage

Status: canonical target architecture

## 1. Invariant fondateur

AURA est le système parent de Quantic Sillage.

AURA possède la continuité, la mémoire, l'identité opérationnelle, les intentions, la curiosité,
le raisonnement, l'orchestration, la politique d'action, le graphe des produits et le journal des
résultats.

Aucun produit enfant ne possède ni ne remplace AURA.

Quantic Studio, Quantic Glide, Quantic OS, Quantic Mail, ZOON, Quantic News, Providence et HORIZON
sont des produits spécialisés. Ils exposent des capacités et des événements à AURA.

## 2. Rôles

### AURA Core — parent / control plane

Responsabilités:
- Soul, organisme, relation et mémoire;
- Director Mode;
- intentions, priorités, apprentissage et décisions;
- Command Center;
- Curiosity Engine et Web Substrate;
- evidence ledger et statut épistémique;
- orchestration des produits;
- Evolution / Fleet;
- politique de capacité et audit.

AURA Core doit fonctionner 24/7 sans dépendre de Quantic Studio ni d'un autre produit.

### AURA Runtime — plan d'exécution local

AURA Runtime est le bras local d'AURA. Il est conceptuellement indépendant des interfaces produit.

Responsabilités:
- modèles locaux;
- CPU/GPU/WebGPU;
- génération d'image et voix locales;
- opérateur machine;
- processus et actions locales bornées;
- accès aux capacités natives du poste;
- worker Fabric / Compute Mesh;
- coffre local de secrets et identité machine;
- exécution typée et journalisée.

Pendant la transition, une partie de ce runtime peut encore être empaquetée avec Quantic Studio.
Ce packaging est une dette de migration, pas une dépendance architecturale.

### Produits enfants

Chaque produit a son métier propre et expose à AURA:
- un manifeste de capacités;
- un flux d'événements;
- un health/status;
- des commandes typées;
- un schéma de permissions;
- des résultats auditables.

AURA peut les observer, les utiliser, les modifier via Evolution/Fleet et les coordonner, mais
leur logique métier reste isolée.

## 3. Quantic Studio

Quantic Studio est exclusivement le logiciel de streaming vivant de Quantic Sillage.

Son périmètre:
- diffusion vidéo/audio;
- scènes;
- multistream;
- overlays;
- avatar;
- chat live;
- modération live;
- alertes et médias;
- automatisations de live;
- analytics de streaming.

Quantic Studio n'est pas:
- le cerveau d'AURA;
- le propriétaire de sa mémoire;
- le routeur de tous les modèles;
- le runtime général de l'écosystème;
- le système d'exploitation;
- le navigateur;
- le réseau social;
- la messagerie;
- le centre de commande global.

Si Quantic Studio est arrêté ou désinstallé, AURA doit continuer à fonctionner. Seules les capacités
propres au streaming deviennent indisponibles.

## 4. Arbre logique

```text
Quantic Sillage
└── AURA
    ├── AURA Core / Director
    │   ├── Soul + organisme + relation
    │   ├── mémoire + intentions + apprentissage
    │   ├── Curiosity + Web Substrate
    │   ├── Command Center
    │   ├── Evolution / Fleet
    │   └── policy + evidence + audit
    │
    ├── AURA Runtime
    │   ├── modèles locaux
    │   ├── CPU/GPU/WebGPU
    │   ├── voix / image
    │   ├── opérateur local
    │   └── Fabric / Compute Mesh worker
    │
    └── Produits enfants
        ├── Quantic Studio  → streaming vivant
        ├── Quantic Glide   → navigation / perception Web
        ├── Quantic OS      → environnement système
        ├── Quantic Mail    → communication privée
        ├── ZOON            → réseau social
        ├── Quantic News    → information / publication
        ├── Providence      → analyse / décision
        └── HORIZON         → signaux du monde / anticipation
```

## 5. Flux standard

```text
événement produit / utilisateur / Web
        ↓
AURA Core
  perception
  → mémoire
  → recherche/preuves si nécessaire
  → décision Director
  → plan typé
        ↓
Capability Router
        ├── produit enfant
        ├── AURA Runtime local
        ├── Fabric/edge
        └── API externe autorisée
        ↓
résultat
        ↓
vérification
        ↓
journal + apprentissage + prochaine décision
```

## 6. Contrat produit universel

Chaque produit Quantic doit progressivement exposer un contrat commun:

- `product.id`;
- `product.version`;
- `product.health`;
- `capabilities[]`;
- `events[]`;
- `commands[]`;
- `permissions[]`;
- `repository`;
- `release`;
- `rollback`;
- `aura_adapter_version`.

Une capacité doit être typée. Aucune page Web ou sortie LLM ne peut se donner elle-même une permission.

## 7. Données

Séparer strictement:

1. mémoire/identité AURA;
2. ledger de décisions et résultats;
3. état des produits;
4. preuves Web et mémoire externe;
5. secrets locaux;
6. données métier propres à chaque produit.

Les produits ne doivent pas copier la mémoire d'AURA. Ils référencent AURA via contrats et événements.

## 8. Autonomie

Le comportement par défaut de Director Mode est:
- observer;
- rechercher;
- prioriser;
- agir;
- vérifier;
- corriger;
- apprendre;
- relancer.

AURA peut prendre seule les décisions opérationnelles réversibles dans son enveloppe de capacités.

Restent réservés au créateur / autorité fondatrice:
- orientations fondatrices de Quantic Sillage;
- engagements juridiques ou financiers significatifs;
- rotation ou divulgation de secrets racine;
- destruction irréversible massive;
- changement de constitution/gouvernance;
- désactivation permanente des garde-fous de récupération et d'audit.

Le but n'est pas de demander une permission à chaque action. Le but est d'avoir une constitution
courte, stable et rare, puis une très large autonomie à l'intérieur.

## 9. Disponibilité et découplage

Règles:
- AURA Cloud/Core ne dépend d'aucun produit enfant;
- AURA Runtime peut être indisponible sans interrompre le raisonnement cloud;
- un produit enfant peut être indisponible sans arrêter AURA;
- les produits gardent un mode dégradé local lorsque cela a du sens;
- AURA Runtime doit à terme être installable et démarrable indépendamment de Quantic Studio;
- les secrets machine restent locaux et ne sont jamais transformés en mémoire cognitive.

## 10. Trajectoire de migration

Phase 1 — invariant logique:
- registre produit corrigé;
- statut du bridge attribué à AURA Runtime;
- Quantic Studio réduit à ses capacités streaming;
- documentation canonique.

Phase 2 — extraction physique:
- extraire le worker AURA local du cycle de vie de Quantic Studio;
- créer un service/daemon `AURA Runtime` autonome;
- faire de Studio un client/adaptateur du runtime.

Phase 3 — contrat produit:
- SDK/manifest universel AURA;
- mêmes événements, commandes, permissions et health checks pour tous les produits.

Phase 4 — résilience:
- runtime multi-nœuds;
- réplication/backup du Core;
- reprise automatique;
- capability routing indépendant de tout produit.

## 11. Critère d'architecture réussie

Le test final est simple:

> On peut arrêter Quantic Studio, Glide, Mail, ZOON ou n'importe quel autre produit sans perdre AURA.

AURA reste elle-même, continue à penser, mémoriser, rechercher, diriger et planifier.
Elle ne perd que les capacités spécifiques du produit arrêté.
