import { randomUUID } from 'node:crypto';
import { clamp, parseJsonObject } from './policy.js';

const clean = (value, limit = 4000) =>
  String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);

function nodeId(value) {
  return clean(value, 120).replace(/[^a-zA-Z0-9._:-]/g, '-');
}

export function validateTaskGraph(graph, {
  maxNodes = 32,
  maxParallel = 12,
} = {}) {
  if (!graph || typeof graph !== 'object') throw new Error('DAG AURA absent');
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  if (!nodes.length) throw new Error('DAG AURA vide');
  if (nodes.length > maxNodes) throw new Error(`DAG AURA trop grand: ${nodes.length}/${maxNodes}`);

  const ids = new Set();
  const normalized = nodes.map((raw, index) => {
    const id = nodeId(raw?.id || `n${index + 1}`);
    if (!id) throw new Error('identifiant de nœud invalide');
    if (ids.has(id)) throw new Error(`nœud dupliqué: ${id}`);
    ids.add(id);
    const capability = clean(raw?.capability, 180);
    if (!capability) throw new Error(`capability manquante pour ${id}`);
    const dependsOn = [...new Set(
      (Array.isArray(raw?.depends_on) ? raw.depends_on : [])
        .map(nodeId)
        .filter(Boolean),
    )];
    if (dependsOn.includes(id)) throw new Error(`auto-dépendance interdite: ${id}`);
    return {
      id,
      capability,
      depends_on: dependsOn,
      input: raw?.input && typeof raw.input === 'object' ? raw.input : {},
      expected_output: clean(raw?.expected_output || 'json', 120),
      verification: clean(raw?.verification || 'none', 120),
      quorum: Math.max(1, Math.min(Number(raw?.quorum || 1), 5)),
      timeout_ms: Math.max(500, Math.min(Number(raw?.timeout_ms || 15000), 120000)),
      max_cost_microunits: Math.max(0, Number(raw?.max_cost_microunits || 0)),
    };
  });

  for (const node of normalized) {
    for (const dep of node.depends_on) {
      if (!ids.has(dep)) throw new Error(`dépendance inconnue ${dep} pour ${node.id}`);
    }
  }

  const effectiveParallel = Math.max(
    1,
    Math.min(Number(graph.max_parallel || maxParallel), maxParallel),
  );
  const indegree = new Map(normalized.map((node) => [node.id, node.depends_on.length]));
  const children = new Map(normalized.map((node) => [node.id, []]));
  for (const node of normalized) {
    for (const dep of node.depends_on) children.get(dep).push(node.id);
  }
  const layers = [];
  let frontier = normalized.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  let visited = 0;
  while (frontier.length) {
    const current = frontier.slice(0, effectiveParallel);
    const deferred = frontier.slice(effectiveParallel);
    layers.push(current);
    const unlocked = [];
    for (const id of current) {
      visited += 1;
      for (const child of children.get(id) || []) {
        indegree.set(child, indegree.get(child) - 1);
        if (indegree.get(child) === 0) unlocked.push(child);
      }
    }
    frontier = [...deferred, ...unlocked];
  }
  if (visited !== normalized.length) throw new Error('cycle détecté dans le DAG AURA');

  return {
    id: nodeId(graph.id || randomUUID()),
    objective: clean(graph.objective, 5000),
    nodes: normalized,
    layers,
    max_parallel: effectiveParallel,
    budget_microunits: Math.max(0, Number(graph.budget_microunits || 0)),
    created_at: new Date().toISOString(),
  };
}

export function taskGraphSummary(graph) {
  const valid = validateTaskGraph(graph);
  return {
    id: valid.id,
    objective: valid.objective,
    nodes: valid.nodes.length,
    layers: valid.layers.length,
    max_parallel: valid.max_parallel,
    side_effect_nodes: valid.nodes.filter((node) => node.verification === 'side-effect').length,
  };
}

export class DagCompiler {
  static VERSION = 'aura-dag-compiler-v1';

  constructor(ai) {
    this.ai = ai;
  }

  async compile(objective, capabilities = [], {
    maxNodes = 20,
    maxParallel = 8,
    budgetMicrounits = 0,
  } = {}) {
    const goal = clean(objective, 6000);
    if (!goal) throw new Error('objectif DAG vide');
    const available = capabilities
      .map((item) => ({
        id: clean(item?.id, 180),
        tags: Array.isArray(item?.tags) ? item.tags.slice(0, 12).map((tag) => clean(tag, 80)) : [],
        side_effects: Boolean(item?.side_effects),
        trust: clamp(item?.trust ?? 0.5),
        cost_microunits: Math.max(0, Number(item?.cost_microunits || 0)),
      }))
      .filter((item) => item.id);

    if (!this.ai?.enabled) {
      const research = available.find((item) => item.id === 'web.research')
        || available.find((item) => item.tags.includes('research'));
      if (!research) throw new Error('aucune capability de fallback disponible sans modèle');
      return validateTaskGraph({
        objective: goal,
        budget_microunits: budgetMicrounits,
        max_parallel: 1,
        nodes: [{
          id: 'research',
          capability: research.id,
          input: { question: goal },
          depends_on: [],
          expected_output: 'evidence',
          verification: 'evidence',
        }],
      }, { maxNodes, maxParallel });
    }

    const prompt = [
      'Compile l’objectif AURA en DAG de capacités typées.',
      'Ne génère AUCUN shell, JavaScript, Python, SQL arbitraire ou code source.',
      'Tu peux seulement référencer les capability ids fournis.',
      'Les dépendances doivent former un graphe acyclique.',
      'Les lectures/recherches peuvent être parallèles.',
      'Une action avec effet de bord doit dépendre explicitement des vérifications nécessaires.',
      'Retour JSON strict:',
      '{"objective":"...","max_parallel":4,"budget_microunits":0,"nodes":[{"id":"n1","capability":"...","depends_on":[],"input":{},"expected_output":"json","verification":"none|evidence|quorum|side-effect","quorum":1,"timeout_ms":15000,"max_cost_microunits":0}]}',
      'Capabilities disponibles: ' + JSON.stringify(available).slice(0, 18000),
      'Objectif: ' + goal,
    ].join('\n');

    const raw = await this.ai.generate(
      prompt,
      'Tu es le compilateur de graphes d’AURA. Tu planifies; tu ne prends pas de permissions et tu ne crées pas de nouveau type d’action.',
      1800,
      'reasoning',
    );
    const parsed = parseJsonObject(raw);
    parsed.objective = goal;
    parsed.budget_microunits = Math.max(0, Number(parsed.budget_microunits || budgetMicrounits));
    return validateTaskGraph(parsed, { maxNodes, maxParallel });
  }
}

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout après ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export class TaskGraphExecutor {
  static VERSION = 'aura-task-graph-executor-v1';

  constructor(fabric) {
    this.fabric = fabric;
  }

  async execute(graph, { trigger = 'manual' } = {}) {
    const valid = validateTaskGraph(graph);
    const startedAt = Date.now();
    const results = new Map();
    const errors = [];
    let spent = 0;

    for (const layer of valid.layers) {
      const nodes = layer
        .map((id) => valid.nodes.find((node) => node.id === id))
        .filter(Boolean);
      const batch = await Promise.allSettled(nodes.map(async (node) => {
        const dependencies = {};
        for (const dep of node.depends_on) dependencies[dep] = results.get(dep)?.result;
        const outcome = await withTimeout(
          this.fabric.execute(node.capability, {
            ...node.input,
            dependencies,
            graph_id: valid.id,
            node_id: node.id,
            objective: valid.objective,
          }, {
            trigger,
            maxCostMicrounits: node.max_cost_microunits,
            verification: node.verification,
            quorum: node.quorum,
          }),
          node.timeout_ms,
          node.id,
        );
        return { node, outcome };
      }));

      for (let index = 0; index < batch.length; index += 1) {
        const settled = batch[index];
        const node = nodes[index];
        if (settled.status === 'fulfilled') {
          const outcome = settled.value.outcome;
          const cost = Math.max(0, Number(outcome?.metrics?.cost_microunits || 0));
          spent += cost;
          if (valid.budget_microunits && spent > valid.budget_microunits) {
            throw new Error(`budget DAG dépassé: ${spent}/${valid.budget_microunits}`);
          }
          results.set(node.id, {
            ok: outcome?.ok !== false,
            capability: node.capability,
            result: outcome?.result ?? outcome,
            evidence: outcome?.evidence || [],
            verification: outcome?.verification || {},
            metrics: outcome?.metrics || {},
          });
        } else {
          const error = String(settled.reason?.message || settled.reason || 'échec inconnu');
          errors.push({ node_id: node.id, capability: node.capability, error });
          results.set(node.id, { ok: false, capability: node.capability, error });
        }
      }

      if (errors.length) break;
    }

    return {
      ok: errors.length === 0,
      graph_id: valid.id,
      objective: valid.objective,
      results: Object.fromEntries(results),
      errors,
      metrics: {
        elapsed_ms: Date.now() - startedAt,
        cost_microunits: spent,
        nodes_total: valid.nodes.length,
        nodes_completed: [...results.values()].filter((item) => item.ok).length,
        layers: valid.layers.length,
      },
    };
  }
}
