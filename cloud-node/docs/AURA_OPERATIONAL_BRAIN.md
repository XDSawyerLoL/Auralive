# AURA / Observatoire cognitif opérationnel — vrai fonctionnement, vrais trajets

## Objectif

La page **`/cerveau`** remplace les effets aléatoires par une carte des **30 modules logiciels identifiables dans le code**. Elle affiche les connexions de l'architecture et, en surbrillance temporaire, les transitions effectivement passées dans le noyau.

La silhouette anatomique demeure une **vue facultative et illustrative** sur `/cerveau/anatomie`. Elle n'est plus la page principale.

## Ce qui est vraiment mesuré

### Trajets de conversation

Chaque appel à `CognitiveKernel.chat` reçoit un `brain_flow_id` UUID. Quand l'étape correspondante s'achève, AURA inscrit un événement `kind='brain-hop'` dans la table **déjà existante** `aura_cognitive_traces`, avec :

- `flow_id`, `from`, `to`, `stage`, `status`, `at` ;
- `provider` (Groq, OpenRouter ou moteur local), uniquement lorsqu'il a été effectivement sélectionné.

Parcours possible, **non imposé à chaque message** : entrée → homéostasie → mémoire → cognition → recherche Web / support sémantique si effectués → langue → fournisseur choisi → validation → réponse. Si une étape échoue ou ne se produit pas, aucun succès n'est dessiné pour elle.

**Sécurité :** ces événements ne conservent pas le texte de l'utilisateur, son identité, le prompt, les clés ni la mémoire brute. Les journaux d'exécution sont relus séparément, en retirant les charges utiles et les contenus sensibles. Une trace d'action commandée n'est pas automatiquement un reçu de succès.

### Modules et outils

Les 30 modules de la carte correspondent à des classes, fonctions et fichiers réellement présents dans le projet (CognitiveKernel, CognitionEngine, AuraOrganism, Soul, KnowledgeVault, ActiveInference, Langage, Groq Free, OpenRouter Free, modèle local, WebSubstrate, CapabilityFabric, CommandCenter, TaskGraphExecutor, AgentRunLedger, ExecutionBridge, GitHub, CuriosityEngine, CapabilityScout, EvolutionLab, Trading Lab papier, audit Web, etc.).

- **Module présent** : code implanté, usage non prouvé.
- **Module observé récemment** : une transition ou un événement horodaté est présent dans les tables.
- **Connexion grise** : dépendance architecturale déclarée, aucun passage mesuré.
- **Connexion lumineuse** : transition `brain-hop` réellement enregistrée, datant de moins de 20 secondes.
- **Trajet partiel** : étapes réellement observées, mais pas de preuve qu'un traitement reste actif.
- **Outil enregistré** : mention dans un journal technique, ne garantit ni succès ni action facturée.

Aucun nombre de requêtes/minute, de millions de souvenirs, de bénéfices ou de « neurones » fictifs n'est fabriqué.

### Homéostasie

Le tableau présente les onze mesures numériques calculées par `AuraOrganism.publicState`, leur horodatage de mutation et leur fraîcheur. Elles représentent un **modèle computationnel interne**, pas une conscience humaine démontrée.

## API

- `GET /api/brain/telemetry` : indicateurs publics du noyau, sans informations privées.
- `GET /api/brain/graph` : topologie visible par tous, événements détaillés **uniquement quand `isPrivate(request)` valide la session propriétaire**. Sinon, les tableaux de trajets et journaux restent vides et l'interface demande la connexion privée.
- `POST /api/chat` : chat existant; sa réponse contient `brain_flow_id` qui permet au navigateur de sélectionner le parcours enregistré.

Les journaux lus dans la base sont :

```sql
SELECT id,kind,title,context,created_at
FROM aura_cognitive_traces
WHERE kind IN ('brain-hop','operator','agent','swarm','web-research','web-research-error','reflection','expression','event')
ORDER BY id DESC LIMIT 250;

SELECT id,kind,created_at FROM aura_command_events ORDER BY id DESC LIMIT 80;
SELECT id,kind,created_at FROM aura_organism_events ORDER BY id DESC LIMIT 60;
```

Le serveur **ne renvoie jamais** le titre libre, le contenu ni le contexte brut de ces enregistrements au navigateur. La liste d'événements est limitée à des types et libellés prédéfinis, avec horodatage et source.

Les données persistées survivent à un redémarrage, à l'inverse d'une animation JavaScript conservée seulement en mémoire. Une base indisponible doit afficher « observations indisponibles », pas une activité inventée.

## Expérience de la page

- Rail gauche : modules regroupés, recherche, états et dernière preuve.
- Carte centrale interactive : zoom, déplacement, clic sur un nœud; connexions architecturales et passages observés distingués.
- Colonne droite : source du module, dernière transition, trajets sélectionnés, liste datée d'outils réellement observés.
- Bas : journal CommandCenter, liste de trajets avec leur identifiant, onze jauges d'homéostasie.
- Chat fixe relié à l'API existante et sélection automatique du trajet généré par le message.
- Auto-actualisation toutes les cinq secondes, sans lancer de tâche ou de requête LLM.
- Accès aux traces avec la session HTTPS propriétaire existante, sans conservation locale de clé API.

## Tests et déploiement

```bash
cd cloud-node
npm run check
npm test
node --test test/brain_flow.test.js
```

Sur Hostinger, vérifier avec une session propriétaire :

1. Ouvrir `/cerveau`. Le graphe doit montrer des modules **sans mouvement** si aucun passage récent n'est enregistré.
2. Écrire « Salut AURA » dans le chat du graphe.
3. Vérifier que le résultat comporte `brain_flow_id`, que les événements `brain-hop` apparaissent, et que la route peut être sélectionnée.
4. Contrôler le modèle réellement sélectionné (Groq/OpenRouter/local) et le statut de validation; aucune ligne ne doit prétendre « exécuté » si seul un plan a été élaboré.
5. Attendre plus de vingt secondes sans nouveau message : la transition cesse d'être animée.
6. Désactiver la session propriétaire : le graphe conserve les modules mais ne divulgue plus les trajets privés.

**Le déploiement n'est pas automatique** : cette branche GitHub produit une archive Hostinger mais ne dispose pas d'accès opérationnel attesté au panneau Hostinger. La page en production ne change qu'après installation du nouveau paquet.

## Coût

Aucune bibliothèque de visualisation payante ou API externe. Le dessin utilise le Canvas natif du navigateur; l'enregistrement utilise les tables MySQL existantes. Les appels Groq restent soumis aux limites de l'offre Free, sans dépense ajoutée par l'observatoire.
