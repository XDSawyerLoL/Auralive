import { clamp, parseJsonObject } from './policy.js';

const clean = (value, limit = 8000) =>
  String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);

export const DEFAULT_MOA_ROLES = [
  {
    id: 'analyst',
    system: 'Analyse le problème méthodiquement. Explicite hypothèses, dépendances et points incertains. Ne prétends pas savoir ce qui n’est pas établi.',
  },
  {
    id: 'critic',
    system: 'Cherche les erreurs, contradictions, hypothèses fragiles, angles morts et raisons pour lesquelles la solution proposée pourrait échouer.',
  },
  {
    id: 'builder',
    system: 'Cherche une solution concrète, simple à tester, réversible et mesurable. Privilégie les mécanismes qui produisent une preuve plutôt qu’une opinion.',
  },
];

function candidateText(task) {
  const result = task?.result || {};
  if (typeof result === 'string') return result;
  if (typeof result?.result === 'string') return result.result;
  if (typeof result?.text === 'string') return result.text;
  if (Array.isArray(result?.candidates)) {
    return result.candidates
      .map((item) => candidateText({ result: item?.result }))
      .filter(Boolean)
      .join('\n\n');
  }
  return clean(JSON.stringify(result), 12000);
}

export class MoAEngine {
  static VERSION = 'aura-moa-v1';

  constructor({ ai, computeMesh }) {
    this.ai = ai;
    this.computeMesh = computeMesh;
    this.lastRunAt = '';
    this.lastError = '';
  }

  async localExpert(objective, role) {
    if (!this.ai?.enabled) {
      return {
        ok: false,
        role: role.id,
        source: 'none',
        text: '',
        error: 'Aucun modèle local/cloud disponible',
      };
    }
    const text = await this.ai.generate(
      [
        'Mission AURA:',
        clean(objective, 10000),
        '',
        'Réponds avec un raisonnement utile, compact et vérifiable.',
        'Sépare clairement faits, hypothèses et recommandations.',
      ].join('\n'),
      role.system,
      1200,
      'reasoning',
    );
    return {
      ok: true,
      role: role.id,
      source: 'aura-model-constellation',
      text: clean(text, 14000),
      reputation: 1,
      reliability: 1,
    };
  }

  async meshExpert(objective, role, {
    dataClass = 'private',
    modelHint = '',
    timeoutMs = 18000,
  } = {}) {
    if (!this.computeMesh?.enabled) return null;
    const task = await this.computeMesh.enqueueTask({
      kind: 'llm.chat',
      dataClass,
      payload: {
        messages: [
          { role: 'system', content: role.system },
          {
            role: 'user',
            content: [
              'Mission AURA:',
              clean(objective, 10000),
              '',
              'Réponds avec un raisonnement utile, compact et vérifiable.',
              'Sépare clairement faits, hypothèses et recommandations.',
            ].join('\n'),
          },
        ],
        temperature: 0.35,
        max_tokens: 1200,
        role: role.id,
      },
      requiredTags: ['llm'],
      modelHint,
      replicas: 1,
      quorum: 1,
      consensusMode: 'any',
      timeoutMs,
      source: 'aura-moa',
    });
    if (!task.assigned_peers) return null;
    const final = await this.computeMesh.waitForTask(task.id, timeoutMs);
    if (!final || final.status !== 'completed') return null;
    const text = candidateText(final);
    if (!text) return null;
    return {
      ok: true,
      role: role.id,
      source: 'compute-mesh',
      text,
      task_id: task.id,
    };
  }

  async run(objective, {
    roles = DEFAULT_MOA_ROLES,
    dataClass = 'private',
    modelHint = '',
    maxExperts = 4,
    meshTimeoutMs = 18000,
  } = {}) {
    const goal = clean(objective, 12000);
    if (!goal) throw new Error('objectif MoA vide');
    const selectedRoles = (Array.isArray(roles) ? roles : DEFAULT_MOA_ROLES)
      .slice(0, Math.max(1, Math.min(Number(maxExperts || 4), 8)))
      .map((role, index) => ({
        id: clean(role?.id || `expert-${index + 1}`, 80),
        system: clean(role?.system || DEFAULT_MOA_ROLES[index % DEFAULT_MOA_ROLES.length].system, 3000),
      }));

    try {
      const expertResults = await Promise.all(selectedRoles.map(async (role) => {
        const remote = await this.meshExpert(goal, role, {
          dataClass,
          modelHint,
          timeoutMs: meshTimeoutMs,
        }).catch(() => null);
        if (remote) return remote;
        return this.localExpert(goal, role);
      }));

      const usable = expertResults.filter((item) => item?.ok && item.text);
      let synthesis = '';
      let synthesisSource = 'deterministic-fallback';

      if (usable.length && this.ai?.enabled) {
        const prompt = [
          'Tu es le synthétiseur critique d’AURA.',
          'Construis une réponse meilleure que chaque avis pris isolément.',
          'Ne fais pas de vote de popularité. Résous les contradictions, signale ce qui reste incertain,',
          'et favorise les propositions testables et falsifiables.',
          '',
          'Objectif:',
          goal,
          '',
          ...usable.map((item) => `=== Expert ${item.role} / ${item.source} ===\n${item.text}`),
          '',
          'Retour JSON strict:',
          '{"synthesis":"...","confidence":0.0,"agreements":["..."],"disagreements":["..."],"open_questions":["..."]}',
        ].join('\n');
        const raw = await this.ai.generate(
          prompt,
          'Tu agrèges plusieurs experts d’AURA. Tu n’inventes pas de consensus et tu conserves les désaccords utiles.',
          1600,
          'reasoning',
        );
        const parsed = parseJsonObject(raw);
        synthesis = clean(parsed?.synthesis || raw, 18000);
        synthesisSource = 'aura-synthesizer';
        const confidence = clamp(parsed?.confidence ?? Math.min(0.9, 0.5 + usable.length * 0.08));
        this.lastRunAt = new Date().toISOString();
        this.lastError = '';
        return {
          ok: true,
          version: MoAEngine.VERSION,
          objective: goal,
          experts: expertResults,
          synthesis,
          synthesis_source: synthesisSource,
          confidence,
          agreements: Array.isArray(parsed?.agreements) ? parsed.agreements.slice(0, 12) : [],
          disagreements: Array.isArray(parsed?.disagreements) ? parsed.disagreements.slice(0, 12) : [],
          open_questions: Array.isArray(parsed?.open_questions) ? parsed.open_questions.slice(0, 12) : [],
        };
      }

      if (usable.length) {
        synthesis = usable
          .map((item) => `[${item.role}] ${item.text}`)
          .join('\n\n');
      }

      this.lastRunAt = new Date().toISOString();
      this.lastError = '';
      return {
        ok: usable.length > 0,
        version: MoAEngine.VERSION,
        objective: goal,
        experts: expertResults,
        synthesis,
        synthesis_source: synthesisSource,
        confidence: usable.length ? clamp(0.45 + usable.length * 0.08) : 0,
        agreements: [],
        disagreements: [],
        open_questions: usable.length ? [] : ['Aucun expert calculable actuellement.'],
      };
    } catch (error) {
      this.lastError = String(error?.message || error).slice(0, 1000);
      throw error;
    }
  }

  status() {
    return {
      version: MoAEngine.VERSION,
      enabled: true,
      mesh_enabled: Boolean(this.computeMesh?.enabled),
      local_model_enabled: Boolean(this.ai?.enabled),
      last_run_at: this.lastRunAt,
      last_error: this.lastError,
    };
  }
}
