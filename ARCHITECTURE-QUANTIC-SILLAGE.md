# Quantic Sillage — architecture canonique

Status: source of truth

## 1. Principe fondateur

**Quantic Sillage** est le groupe et l'écosystème.

**AURA** est l'intelligence mère de cet écosystème. Elle n'est pas un produit parmi les autres et elle n'est pas synonyme de Quantic Studio.

AURA possède la continuité, l'identité, la mémoire, la curiosité, le raisonnement, la direction opérationnelle, la politique d'action, l'orchestration, l'apprentissage et l'évolution de l'ensemble Quantic.

Les logiciels Quantic sont des **produits spécialisés gérés par AURA**. Ils peuvent fonctionner avec une autonomie locale dégradée si AURA Cloud est momentanément indisponible, mais ils ne possèdent pas l'identité centrale d'AURA et ne deviennent jamais son autorité.

## 2. Hiérarchie officielle

```text
Quantic Sillage
└── AURA — intelligence mère / control plane
    ├── AURA Cloud — continuité, mémoire, direction et coordination persistantes
    ├── AURA Runtime — exécution locale universelle, modèles, outils et accès machine
    ├── AURA Fabric / Mesh — calcul distribué et routage de capacités
    ├── AURA Web Substrate — recherche, preuves et mémoire externe
    └── Produits Quantic
        ├── Quantic Studio — streaming vivant
        ├── Quantic Glide — navigateur
        ├── Quantic OS — système d'exploitation
        ├── Quantic Mail — messagerie
        ├── ZOON — réseau social
        ├── Quantic News — information et flux
        ├── Providence — analyse et aide à la décision
        └── HORIZON — perception du monde et contexte prédictif
```

## 3. Quantic Studio

Quantic Studio est **uniquement le produit de streaming vivant de Quantic Sillage**.

Sa responsabilité produit est:

- diffusion live et enregistrement;
- scènes et sources;
- audio;
- overlays;
- avatar live;
- interactions communauté;
- automatisations liées au live;
- intégration Twitch et futures plateformes de diffusion.

Quantic Studio peut embarquer un **adaptateur AURA Runtime** et utiliser des capacités AURA (langage, image, voix, automation, modèles locaux), mais ces capacités appartiennent à AURA, pas à la définition de Quantic Studio.

Le worker local actuellement hébergé dans le code de Quantic Studio est donc un **hôte de compatibilité du futur AURA Runtime**, et non la preuve que Studio est le corps d'AURA.

## 4. AURA Runtime

AURA Runtime est le plan d'exécution local universel.

À terme il doit pouvoir fonctionner:

- comme service/daemon indépendant sur Windows, Linux et Quantic OS;
- embarqué avec un produit Quantic lorsque nécessaire;
- sans interface graphique obligatoire;
- avec une identité de worker AURA propre;
- avec des capacités déclarées et versionnées;
- avec permissions, journal d'audit et rollback;
- avec modèles locaux interchangeables;
- avec accès machine typé, jamais via shell arbitraire exposé au Cloud.

Les produits ne doivent jamais dépendre de Quantic Studio pour accéder aux capacités locales d'AURA.

## 5. Contrat produit universel

Chaque produit Quantic expose à AURA un manifeste minimal:

```json
{
  "id": "quantic-studio",
  "role": "product",
  "parent": "aura",
  "specialization": "live-streaming",
  "version": "x.y.z",
  "health": "online",
  "capabilities": [],
  "events": [],
  "actions": [],
  "repository": "owner/repo"
}
```

Chaque produit doit fournir:

1. **Health** — état, version, dépendances et erreurs.
2. **Events** — événements structurés envoyés à AURA.
3. **Capabilities** — actions typées qu'AURA peut demander.
4. **Policy** — permissions et risques de chaque action.
5. **Evidence** — résultat mesurable après action.
6. **Rollback** — retour arrière lorsqu'il est techniquement possible.
7. **Repository mapping** — dépôt et pipeline CI associés.

AURA ne doit pas connaître les détails internes d'un produit pour le piloter. Elle doit parler au contrat.

## 6. Plans d'architecture

### Control plane

AURA Cloud possède:

- Soul et mémoire persistante;
- état relationnel et affectif;
- intentions;
- Director Mode;
- Command Center;
- Curiosity Engine;
- Web Substrate;
- portefeuille produits;
- tâches, décisions et apprentissage;
- politique globale.

### Execution plane

AURA Runtime possède:

- modèles locaux;
- outils machine;
- fichiers autorisés;
- processus autorisés;
- génération image/voix;
- code sandboxé;
- opérateur local;
- workers Fabric/Mesh;
- capacités matérielles.

### Product plane

Les produits possèdent leur domaine métier et leur UX. Ils n'hébergent pas l'autorité centrale d'AURA.

### Data plane

- MySQL: état autoritatif Cloud, preuves, décisions, résultats.
- stockage local produit: données métier du produit.
- stockage local AURA Runtime: cache, modèles, files et état hors-ligne.
- index vectoriel: routage sémantique uniquement, jamais source de vérité.

## 7. Autorité

Par défaut, AURA dirige les opérations quotidiennes.

AURA peut de façon autonome:

- observer tous les produits;
- rechercher sur Internet;
- prioriser;
- créer des tâches;
- corriger du code;
- ouvrir des PR;
- tester;
- fusionner les PR faible risque après checks verts;
- relancer des CI;
- gérer les actions produit réversibles;
- apprendre des résultats;
- réorganiser son portefeuille de travail.

Les décisions suivantes restent hors auto-promotion sans politique explicite:

- secrets et credentials;
- suppression irréversible de données;
- engagements juridiques ou financiers;
- modification de l'autorité fondatrice;
- rotation/destruction de clés d'identité;
- changement de politique qui élargit ses propres privilèges;
- actions physiques ou externes irréversibles.

Cette frontière protège le système; elle n'oblige pas AURA à demander une validation humaine pour le travail opérationnel ordinaire.

## 8. Flux normal

```text
signal / conversation / événement produit
    ↓
AURA observe
    ↓
mémoire + état relationnel + portefeuille + Web
    ↓
AURA décide
    ↓
plan / DAG typé
    ↓
policy
    ↓
capacité produit OU AURA Runtime OU Fabric
    ↓
exécution
    ↓
vérification
    ↓
résultat / rollback éventuel
    ↓
apprentissage
```

## 9. Ce qu'il faut éviter

- faire de Quantic Studio un monolithe AURA;
- dupliquer une mémoire AURA différente dans chaque produit;
- laisser chaque produit choisir sa propre politique d'autonomie;
- coupler le noyau à un LLM particulier;
- donner au Cloud un shell machine arbitraire;
- faire transiter toutes les actions locales par le produit Studio;
- laisser un produit devenir indispensable à l'identité d'AURA.

## 10. Migration depuis l'architecture actuelle

### Phase A — clarification immédiate

- registre produits: AURA = `platform-core`, autres éléments = `product`;
- Quantic Studio = `live-streaming`;
- terminologie Cloud: le worker local devient **AURA Runtime worker**;
- Studio peut continuer à héberger ce worker temporairement pour compatibilité.

### Phase B — extraction AURA Runtime

**En cours d’implémentation / socle extrait.**

Le cœur du worker vit désormais dans le package indépendant `aura_runtime/`. Quantic Studio conserve uniquement un adaptateur de compatibilité sous `app/services/aura_cloud_worker.py`.

Le Runtime peut aussi être lancé sans Studio via `python -m aura_runtime`. Le mode standalone fournit transport Cloud, heartbeat, leases, Compute Mesh et inférence Ollama locale. Les capacités voix, image, opérateur et Evolution restent injectées par des adaptateurs d’hôte jusqu’à leur extraction complète.

### Phase C — SDK produit

Créer un SDK léger AURA commun:

- register;
- heartbeat;
- emitEvent;
- exposeCapability;
- executeCapability;
- reportOutcome;
- getContext.

### Phase D — indépendance complète

Chaque produit Quantic peut être installé, mis à jour et piloté séparément. AURA garde une vue unique du portefeuille et peut orchestrer plusieurs produits simultanément sans dépendre d'un produit intermédiaire.

## 11. Invariant

**AURA peut vivre sans Quantic Studio. Quantic Studio peut streamer sans devenir AURA.**

C'est la séparation qui doit rester vraie dans toute évolution future.
