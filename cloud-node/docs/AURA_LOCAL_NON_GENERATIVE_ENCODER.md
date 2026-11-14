# AURA — encodeur de phrases local, non génératif (expérimentation)

## Architecture mise en place

Trois nouveaux composants permettent de rechercher par sens **dans des passages déjà fournis**, sans générer de nouveaux faits :

- `src/native_local_sentence_encoder.js` : interface d'encodage de phrases françaises en 384 dimensions, avec validation d'un modèle ONNX installé localement ; chargement seulement après activation explicite.
- `src/native_semantic_retrieval.js` : classement de passages attribués à l'utilisateur par similarité cosinus. Un seuil de similarité ET une marge sur le deuxième candidat sont nécessaires ; les cas ambigus restent sans résultat.
- `src/ai.js` : `AiClient.retrieveLocalSemanticEvidence(question, passages)` et diagnostic `non_generative_semantic_encoder` permettent aux services cognitifs d'appeler le composant.

**Le modèle ne parle pas, ne construit pas seul de phrases et n'a pas été entraîné par AURA**. Son apprentissage est celui du modèle open source, antérieur au projet. Un passage retrouvé n'est jamais une preuve de la vérité d'une action. L'encodeur ne remplace pas l'analyse de modalité ni les règles de provenance. Cette capacité reste une aide à la récupération de contexte, et non une compréhension générale autonome.

## Modèle sélectionné et ressources

Modèle : `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (modèle dérivé de `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`). Licence Apache 2.0, environ 50 langues, encodeur de 384 dimensions ; variante ONNX `onnx/model_quantized.onnx` d'environ **118 Mo**. Voir les pages du modèle sur Hugging Face.

La **RAM nécessaire est supérieure aux 118 Mo du fichier** : elle dépend des opérateurs ONNX, du tokenizer, du contexte, du runtime natif et des autres services AURA. Aucun fonctionnement en conditions réelles sur Hostinger n'a été constaté à ce stade. Le runtime Node peut refuser l'installation de dépendances natives ou manquer de mémoire ; dans ces cas, AURA conserve sa voie de langage précédente.

## Installation explicite (sans API, sans VPS)

**Ne pas activer tant que les limites mémoire/processus de l'hébergement ne sont pas connues**. Sur une installation permettant les outils nécessaires :

```sh
# 1. Installer le moteur CPU local facultatif dans le package AURA.
cd cloud-node
npm install --no-save --package-lock=false @huggingface/transformers

# 2. Installer hors du répertoire public les actifs du modèle, préalablement
# téléchargés/contrôlés par l'opérateur, à cette arborescence :
# /chemin/prive/models/Xenova/paraphrase-multilingual-MiniLM-L12-v2/
#   config.json
#   tokenizer.json
#   tokenizer_config.json
#   special_tokens_map.json
#   onnx/model_quantized.onnx
#
# La dernière ressource dépasse 100 Mo et peut être incompatible avec le plan.

# 3. Dans l'environnement du processus Node :
export AURA_LOCAL_ENCODER_ENABLED=true
export AURA_LOCAL_ENCODER_ROOT=/chemin/prive/models
export AURA_LOCAL_ENCODER_DTYPE=q8
```

La vérification de mémoire exige au moins **768 MiB de marge dans le cgroup** avant le chargement. Si l'hébergement ne publie pas son quota mémoire, le modèle reste désactivé, sauf confirmation explicite de l'opérateur par `AURA_LOCAL_ENCODER_MEMORY_VERIFIED=true` après une mesure réelle de capacité ; cette variable ne résout pas une insuffisance de mémoire.

Un outil de validation avec les **vrais poids** est inclus :

```sh
cd cloud-node
node scripts/probe_local_sentence_encoder.mjs
```

Il mesure quatre encodages de phrases, une similarité de paraphrases, une comparaison non liée, un contraste de négation, une latence et la RSS du processus. Ce test doit être lancé sur un hôte sur lequel les fichiers ONNX et la dépendance sont déjà installés. Il renvoie un échec si le modèle est indisponible. **Aucune validation réelle sur les poids Hostinger n'est déclarée tant que ce test n'a pas réussi sur Hostinger.**

Redémarrer le service Node. Le modèle est chargé uniquement lors d'une recherche sémantique. **Aucun téléchargement automatique ne peut avoir lieu en production** : `env.allowRemoteModels=false` et `local_files_only=true`. En l'absence du modèle, du module Node facultatif ou de ressources suffisantes, le diagnostic indique `disabled`, `model-assets-not-installed` ou `offline-runtime-or-model-load-failed`.

Un administrateur peut préparer les fichiers depuis Hugging Face avant de les transférer sur Hostinger. Le processus ne doit pas écrire ni redistribuer les fichiers sous une URL publique. Ne pas enregistrer des conversations personnelles dans un jeu d'entraînement sans consentement.

## Interface du noyau AURA

```js
const evidence=await aiClient.retrieveLocalSemanticEvidence(
  'Où le document a-t-il été posé ?',
  [
    {role:'user',evidence_scope:'user-statement-unverified',
     text:'Le document a été rangé dans le bureau.'},
    {role:'user',evidence_scope:'user-statement-unverified',
     text:'La réunion a été déplacée à jeudi.'}
  ]
);
```

Le résultat n'est **pas une réponse** : seulement un texte préexistant avec sa provenance et sa similarité. Le moteur ne doit le citer comme fait que si l'analyse de l'événement et de la modalité l'autorise indépendamment. Un score vectoriel élevé ne prouve pas un événement.

## Validation et limites

- Tests unitaires sans réseau et sans poids ONNX : détection d'une configuration absente, sortie de 384 dimensions via encodeur injecté, calcul de similarité, refus des textes externes/non attribués, ambiguïté de deux passages et absence de génération.
- Ces tests démontrent la **conformité du code d'intégration**, pas la capacité d'un vrai modèle téléchargé à fonctionner sur Hostinger. Aucune mesure de latence, de RAM ou de compréhension nouvelle sur poids réels n'a encore été obtenue.
- Le benchmark de dialogue de 2 × 100 cas et le défi de 100 modalités restent inchangés et mesurent l'ancien chemin d'analyse, pas une progression automatique par encodeur.
- La prochaine validation doit être un test réel CPU sur les poids installés, avec scores de paraphrases et contre-exemples de négation/causalité, suivi du même essai sur les ressources Hostinger ; puis un véritable examen externe aveugle.

Aucune API générative supplémentaire, aucune facturation par requête, aucun VPS ajouté. Les contraintes de l'hébergement peuvent rendre cette option techniquement indisponible.


## Intégration dans la conversation privée (nouvelle itération)

- `src/native_semantic_memory.js` indexe jusqu'à **40 messages explicites** conservés uniquement en mémoire du processus. Les vecteurs ne sont pas écrits dans la base de données.
- Une recherche renvoie **un extrait original, son identifiant de message et son statut non vérifié**, ou s'abstient lorsque deux passages restent trop proches.
- Les conditions, projets, habitudes et déclarations rapportées ne sont jamais admis comme faits sur simple similarité.
- La suppression ou la correction d'un message exige son identifiant explicite (`retracts_message_id`) ; aucune ressemblance vectorielle ne peut supprimer une autre affirmation.
- `AiClient.recallLocalConversation(question, history)` permet d'effectuer cette recherche.
- Le `contextForAi` du noyau consulte ce rappel **uniquement en contexte privé avec une question ciblée et l'encodeur activé** ; le rappel est inséré comme citation utilisateur non vérifiée. Il ne crée pas une autorité décisionnelle.
- Pas de disponibilité avec le modèle absent : le noyau conserve le comportement existant si le nouvel encodeur est désactivé.

## Sécurité des poids et du runtime

- Le fichier quantifié `onnx/model_quantized.onnx` est contrôlé par **SHA-256** :
  `66fc00f5f29afcaff34092e1bdd20008ca3918265a82fb9695a551e510cc4ebc`
  (empreinte publiée sur la page officielle du modèle, version consultée le 14 novembre 2026).
- Un lien symbolique utilisé comme fichier de poids est refusé.
- Les paramètres Transformers.js interdisent les téléchargements distants de modèles et fixent le chemin de secours WebAssembly vers `<racine>/runtime-wasm/` local ; toute dépendance native nécessaire doit elle aussi être installée sur le serveur.
- Les requêtes simultanées partagent **un seul chargement du modèle**, pour éviter plusieurs allocations ONNX concurrentes.
- Aucun résultat de performance sémantique fondé sur les vrais poids ne peut être annoncé avant exécution réussie du script `scripts/probe_local_sentence_encoder.mjs` sur l'hébergement.

**Limite maintenue :** une citation extraite par similarité n'est pas une réponse générative ni une vérification factuelle. Les nouveaux tests vérifient les garde-fous avec des vecteurs contrôlés, et non une compréhension libre évaluée sur le modèle installé.
