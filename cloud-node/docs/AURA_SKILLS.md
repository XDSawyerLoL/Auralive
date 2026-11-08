# AURA Skills v1 — six procédures natives à budget zéro

## Principe

AURA Skills est un complément **local** à `src/skill_learning.js`, au noyau `src/kernel.js` et aux rôles existants (planner, research, dev, security, operator, critic).

Il ne s'agit pas d'un modèle externe, d'un système MCP, de l'installateur `npx` d'un dépôt tiers, ni d'une migration vers Claude ou Google Cloud.

Les six compétences versionnées sont intégrées dans `src/agent_skills.js`, avec une représentation humaine dans `skills/<id>/SKILL.md` :

1. `planning` — objectif, périmètre, dépendances, jalons et critères d'acceptation.
2. `diagnostic` — reproduction, diagnostic, correction minimale et non-régression.
3. `tdd` — contrat, test initial en échec, correction, tests effectivement observés.
4. `code-review` — revue, sécurité, secrets, risques et budget zéro.
5. `research` — mémoire locale, hypothèses, corroboration facultative et sources.
6. `validation` — distinction entre écrit, testé, intégré, livré et vérifié sur le site.

**Code et autorité** : seul le registre JS audité est exécutable en tant que code de sélection déterministe. Les fichiers `SKILL.md` sont des documents lisibles et versionnés, pas des scripts que l'agent peut interpréter comme autorisations.

## Comment AURA les utilise

- `selectAgentSkills(objective,{role,limit})` sélectionne localement jusqu'à trois méthodes par mots-clés et rôle.
- `planAgentSkills(objective,{role,skills})` renvoie un plan et une checklist en `pending`, sans aucune API, aucun fichier modifié, aucun shell et aucun modèle appelé.
- `agentSkillsGuidance(objective,{role})` prépare un rappel compact pour les agents déjà présents et, uniquement pour les conversations privées pertinentes, le contexte de réponse.
- Les sorties `runAgent` ajoutent `proposed_skills` et `skills_executed:false`.

Aucune compétence ne peut décider seule qu'un test a été lancé ou qu'une version est en production. Une preuve d'exécution doit provenir d'un contrôle extérieur à la procédure.

## Endpoints propriétaires

```http
GET /api/skills/playbooks
POST /api/skills/plan
Content-Type: application/json

{"objective":"Diagnostiquer un écran noir HLS sur SWAPP","role":"dev"}
```

Ces deux routes nécessitent l'authentification privée existante. Elles sont **lecture/préparation seulement** et ne dépendent pas de la disponibilité d'un modèle. Il n'existe pas de route `/api/skills/execute`.

**Ne pas confondre** avec `GET /api/skills`, qui répertorie les compétences acquises dynamiquement par `SkillLearningEngine`.

## Invariant financier — 0 €

- Aucune dépendance `npm` supplémentaire, aucun installateur et aucun VPS.
- Aucun service de génération externe ajouté, aucun compte et aucune clé.
- `SKILLS_POLICY.monetary_budget_eur=0`, `cost_microunits=0`.
- `external_api_calls=false`, `external_model_calls=false`, `remote_execution=false`, `shell_execution=false`, `automatically_deploy=false`.
- Les anciens moteurs AURA conservent leurs politiques et quotas propres. AURA Skills **ne remplace pas** l'audit de la configuration existante `AURA_ZERO_COST_MODE=true` en production.
- Les recherches à sources publiques existantes dans AURA Toolbox restent soumises à leur opt-in explicite séparé.
- Les déploiements GitHub/Hostinger ne sont jamais implicitement autorisés par une procédure.

## Validation

Depuis `cloud-node/` :

```bash
npm run check
npm test
node --test test/agent_skills.test.js
```

À vérifier ensuite avant fusion : chemins privés des APIs, absence de fuite vers le chat public, génération du package Hostinger, et contrôle global GitHub.

Les modules de ce chantier ont été conçus en s'inspirant de **principes** publics décrits dans les dépôts Matt Pocock Skills, Garden Skills et Gstack. Aucune source, script ni dépendance de ces dépôts n'est copiée ou installée.

**État** : AURA Skills v1 est un cadre de sélection et de procédures contrôlées. Il ne constitue pas encore un système autonome d'exécution instrumentée de ces six métiers.
