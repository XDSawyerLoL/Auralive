import { createHash } from 'node:crypto';
import { config } from './config.js';
import { one, query } from './db.js';

const clean = (value, limit = 500) =>
  String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);

const clamp = (value, low = 0, high = 1) =>
  Math.max(low, Math.min(high, Number(value || 0)));

function parseJson(value, fallback) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value || '')); } catch { return fallback; }
}

function stableSkillId(strategyKey) {
  return 'skill.' + createHash('sha256').update(String(strategyKey)).digest('hex').slice(0, 20);
}

function capabilityIds(payload = {}) {
  const report = payload.report && typeof payload.report === 'object' ? payload.report : {};
  const result = report.result && typeof report.result === 'object' ? report.result : {};
  const raw = [
    payload.capability,
    ...(Array.isArray(payload.capabilities) ? payload.capabilities : []),
    report.capability,
    ...(Array.isArray(report.capabilities) ? report.capabilities : []),
    result.capability,
    ...(Array.isArray(result.capabilities) ? result.capabilities : []),
  ];
  return [...new Set(raw.map((item) => clean(item, 180)).filter((item) =>
    /^[a-z0-9][a-z0-9._:-]{1,179}$/i.test(item) && !item.startsWith('skill.'),
  ))].slice(0, 6);
}

export function deriveSkillDescriptor(payload = {}) {
  const automationId = clean(payload.automation_id || 'unknown', 220);
  const eventType = clean(payload.event_type || 'unknown', 220);
  const recipe = capabilityIds(payload);
  const explicitStrategy = clean(payload.strategy_key || '', 240);
  const strategyKey = explicitStrategy || [
    automationId,
    eventType,
    recipe.length ? recipe.join('>') : clean(payload.signature || 'generic', 180),
  ].join('::');
  const report = payload.report && typeof payload.report === 'object' ? payload.report : {};
  const contextKey = clean(
    payload.context_key
    || payload.domain
    || payload.repository
    || report.context_key
    || report.domain
    || report.repository
    || report.target
    || eventType,
    240,
  ) || 'default';
  return {
    id: stableSkillId(strategyKey),
    strategy_key: strategyKey,
    name: clean(payload.skill_name || report.skill_name || eventType || automationId, 180),
    recipe,
    context_key: contextKey,
    source: clean(payload.source || 'outcome', 80),
  };
}

export function skillConfidence({ successes = 0, failures = 0, contextCount = 0 } = {}) {
  const s = Math.max(0, Number(successes || 0));
  const f = Math.max(0, Number(failures || 0));
  const posterior = (s + 1) / (s + f + 2);
  const contextBonus = Math.min(0.12, Math.max(0, Number(contextCount || 0) - 1) * 0.04);
  return Number(clamp(posterior + contextBonus).toFixed(4));
}

export function shouldPromoteSkill({
  successes = 0,
  failures = 0,
  contextCount = 0,
  recipe = [],
} = {}) {
  const s = Math.max(0, Number(successes || 0));
  const f = Math.max(0, Number(failures || 0));
  const total = s + f;
  const rate = total ? s / total : 0;
  return Boolean(
    Array.isArray(recipe)
    && recipe.length > 0
    && s >= 3
    && Number(contextCount || 0) >= 2
    && rate >= 0.75
  );
}

class DbSkillPersistence {
  async get(id) {
    return one('SELECT * FROM aura_skills WHERE id=?', [String(id)]);
  }

  async observations(id) {
    return query(
      'SELECT ok,context_key,evidence,created_at FROM aura_skill_observations WHERE skill_id=? ORDER BY id DESC LIMIT 200',
      [String(id)],
    );
  }

  async listPromoted(limit = 100) {
    return query(
      "SELECT * FROM aura_skills WHERE status='promoted' ORDER BY confidence DESC,updated_at DESC LIMIT ?",
      [Math.max(1, Math.min(Number(limit) || 100, 200))],
    );
  }

  async list(limit = 50) {
    return query(
      'SELECT * FROM aura_skills ORDER BY status DESC,confidence DESC,updated_at DESC LIMIT ?',
      [Math.max(1, Math.min(Number(limit) || 50, 200))],
    );
  }

  async saveObservation(skill, payload, ok) {
    const stamp = new Date().toISOString();
    const current = await this.get(skill.id);
    const recipeJson = JSON.stringify(skill.recipe);
    if (!current) {
      await query(
        `INSERT INTO aura_skills(
          id,strategy_key,name,recipe,status,successes,failures,context_count,confidence,
          source,first_seen_at,last_seen_at,promoted_at,updated_at
        ) VALUES(?,?,?,?, 'candidate',0,0,0,0, ?,?,?, '',?)`,
        [skill.id, skill.strategy_key, skill.name, recipeJson, skill.source, stamp, stamp, stamp],
      );
    } else if (skill.recipe.length && String(current.recipe || '[]') === '[]') {
      await query(
        'UPDATE aura_skills SET recipe=?,name=?,last_seen_at=?,updated_at=? WHERE id=?',
        [recipeJson, skill.name, stamp, stamp, skill.id],
      );
    }
    await query(
      'INSERT INTO aura_skill_observations(skill_id,ok,context_key,evidence,created_at) VALUES(?,?,?,?,?)',
      [
        skill.id,
        ok ? 1 : 0,
        skill.context_key,
        JSON.stringify({
          automation_id: clean(payload.automation_id, 220),
          event_type: clean(payload.event_type, 220),
          signature: clean(payload.signature, 500),
          capability_recipe: skill.recipe,
        }).slice(0, 16000),
        stamp,
      ],
    );
    const stats = await one(
      `SELECT
        SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END) AS successes,
        SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS failures,
        COUNT(DISTINCT context_key) AS context_count
       FROM aura_skill_observations WHERE skill_id=?`,
      [skill.id],
    );
    const latest = await this.get(skill.id);
    const recipe = parseJson(latest?.recipe, skill.recipe);
    const confidence = skillConfidence({
      successes: stats?.successes,
      failures: stats?.failures,
      contextCount: stats?.context_count,
    });
    const promote = shouldPromoteSkill({
      successes: stats?.successes,
      failures: stats?.failures,
      contextCount: stats?.context_count,
      recipe: skill.promotion_eligible === false ? [] : recipe,
    });
    const status = promote ? 'promoted' : String(latest?.status || 'candidate');
    await query(
      `UPDATE aura_skills SET
        successes=?,failures=?,context_count=?,confidence=?,status=?,
        promoted_at=CASE WHEN ?='promoted' AND promoted_at='' THEN ? ELSE promoted_at END,
        last_seen_at=?,updated_at=?
       WHERE id=?`,
      [
        Number(stats?.successes || 0),
        Number(stats?.failures || 0),
        Number(stats?.context_count || 0),
        confidence,
        status,
        status,
        stamp,
        stamp,
        stamp,
        skill.id,
      ],
    );
    return this.get(skill.id);
  }
}

export class SkillLearningEngine {
  static VERSION = 'aura-skill-learning-v2';

  constructor({ fabric = null, persistence = null } = {}) {
    this.fabric = fabric;
    this.persistence = persistence || new DbSkillPersistence();
    this.lastError = '';
    this.lastObservationAt = '';
    this.promotedThisRuntime = new Set();
  }

  async hydrate() {
    const rows = await this.persistence.listPromoted(100).catch(() => []);
    let registered = 0;
    for (const row of rows) {
      if (await this.registerSkill(row)) registered += 1;
    }
    return { promoted: rows.length, registered };
  }

  recipeFor(row) {
    return parseJson(row?.recipe, []).map((item) => clean(item, 180)).filter(Boolean).slice(0, 6);
  }

  async registerSkill(row) {
    if (!this.fabric || !row || String(row.status) !== 'promoted') return false;
    const recipe = this.recipeFor(row);
    if (!recipe.length) return false;
    const members = recipe.map((id) => this.fabric.registry?.get(id)).filter(Boolean);
    if (members.length !== recipe.length) return false;
    if (members.some((item) =>
      item.side_effects
      || String(item.id || '').startsWith('skill.')
      || (config.zeroCostMode && Number(item.cost_microunits || 0) > 0)
    )) return false;

    const id = String(row.id);
    const tags = [...new Set([
      'learned-skill',
      'composed',
      ...members.flatMap((item) => Array.isArray(item.tags) ? item.tags : []),
    ])].slice(0, 24);
    const confidence = clamp(row.confidence ?? 0.5);
    this.fabric.register({
      id,
      name: String(row.name || id),
      transport: 'local',
      tags,
      trust: Math.min(0.94, 0.55 + confidence * 0.39),
      observed_reliability: confidence,
      semantic_reliability: confidence,
      latency_ms: members.reduce((sum, item) => sum + Number(item.latency_ms || 0), 0),
      cost_microunits: 0,
      side_effects: false,
      risk: 'safe',
      input_contract: { input: 'object' },
      output_contract: { steps: 'array', result: 'json' },
      provider: 'aura-skill-learning',
      version: SkillLearningEngine.VERSION,
      learned_from: recipe,
      enabled: true,
    }, async (input, options = {}) => {
      const steps = [];
      let previous = null;
      for (const capabilityId of recipe) {
        const outcome = await this.fabric.execute(capabilityId, {
          ...(input && typeof input === 'object' ? input : { value: input }),
          previous,
        }, {
          ...options,
          trigger: options.trigger || 'learned-skill',
          allowSideEffects: false,
          maxCostMicrounits: 0,
        });
        steps.push({
          capability: capabilityId,
          ok: outcome?.ok !== false,
          result: outcome?.result ?? null,
        });
        previous = outcome?.result ?? null;
      }
      return {
        ok: true,
        result: previous,
        steps,
        metrics: { cost_microunits: 0, learned_skill: id },
      };
    });
    this.promotedThisRuntime.add(id);
    return true;
  }

  recipePromotionEligible(recipe = []) {
    if (!this.fabric || !Array.isArray(recipe) || !recipe.length) return false;
    const members = recipe.map((id) => this.fabric.registry?.get(id)).filter(Boolean);
    if (members.length !== recipe.length) return false;
    return members.every((item) =>
      !item.side_effects
      && !String(item.id || '').startsWith('skill.')
      && (!config.zeroCostMode || Number(item.cost_microunits || 0) === 0)
    );
  }

  async observe(payload = {}) {
    const descriptor = deriveSkillDescriptor(payload);
    if (!descriptor.recipe.length) {
      return {
        ignored: true,
        reason: 'no-replayable-capability-recipe',
        strategy_key: descriptor.strategy_key,
      };
    }
    descriptor.promotion_eligible = this.recipePromotionEligible(descriptor.recipe);
    const ok = Boolean(payload.ok);
    this.lastObservationAt = new Date().toISOString();
    try {
      const row = await this.persistence.saveObservation(descriptor, payload, ok);
      if (String(row?.status) === 'promoted') await this.registerSkill(row);
      this.lastError = '';
      return this.publicSkill(row);
    } catch (error) {
      this.lastError = String(error?.message || error).slice(0, 1000);
      throw error;
    }
  }

  publicSkill(row) {
    if (!row) return null;
    return {
      id: String(row.id || ''),
      name: String(row.name || ''),
      strategy_key: String(row.strategy_key || ''),
      recipe: this.recipeFor(row),
      status: String(row.status || 'candidate'),
      successes: Number(row.successes || 0),
      failures: Number(row.failures || 0),
      context_count: Number(row.context_count || 0),
      confidence: Number(row.confidence || 0),
      promoted_at: String(row.promoted_at || ''),
      updated_at: String(row.updated_at || ''),
    };
  }

  async list(limit = 50) {
    const rows = await this.persistence.list(limit);
    return rows.map((row) => this.publicSkill(row));
  }

  async status() {
    const rows = await this.persistence.list(200).catch(() => []);
    return {
      version: SkillLearningEngine.VERSION,
      candidates: rows.filter((row) => String(row.status) === 'candidate').length,
      promoted: rows.filter((row) => String(row.status) === 'promoted').length,
      registered_runtime: this.promotedThisRuntime.size,
      last_observation_at: this.lastObservationAt,
      last_error: this.lastError,
      promotion_policy: {
        min_successes: 3,
        min_distinct_contexts: 2,
        min_success_rate: 0.75,
        side_effects_allowed: false,
        zero_cost_required: Boolean(config.zeroCostMode),
      },
    };
  }
}
