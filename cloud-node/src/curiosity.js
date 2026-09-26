import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { one, query } from './db.js';
import { clamp, parseJsonObject } from './policy.js';

const now = () => new Date().toISOString();
const clean = (value, limit = 4000) => String(value || '').replace(/\s+/g,' ').trim().slice(0,limit);
const parse = (value, fallback = {}) => { try { return JSON.parse(value || '') ?? fallback; } catch { return fallback; } };

export function curiosityScore(item = {}) {
  const novelty = clamp(item.novelty ?? 0.5);
  const uncertainty = clamp(item.uncertainty ?? 0.5);
  const impact = clamp(item.impact ?? 0.5);
  const relevance = clamp(item.relevance ?? 0.5);
  const repetition = clamp(item.repetition ?? 0);
  return Number(clamp(novelty * 0.28 + uncertainty * 0.27 + impact * 0.27 + relevance * 0.18 - repetition * 0.35).toFixed(4));
}

export class CuriosityEngine {
  static VERSION = 'aura-curiosity-v0.1';

  constructor(ai, webSubstrate, productRegistry, kernel = null) {
    this.ai = ai;
    this.web = webSubstrate;
    this.products = productRegistry;
    this.kernel = kernel;
    this.started = false;
    this.running = false;
    this.timer = null;
    this.lastCycleAt = '';
    this.lastError = '';
  }

  async start() {
    if (this.started) return;
    this.started = true;
    if (!config.curiosityEnabled) return;
    const run = () => this.runCycle('autonomous').catch((error) => { this.lastError = clean(error?.message || error,1000); });
    this.timer = setInterval(run, config.curiosityTickSeconds * 1000);
    this.timer.unref?.();
    setTimeout(run, Math.min(90000, config.curiosityWarmupSeconds * 1000)).unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.started = false;
  }

  async recent(limit = 40) {
    const rows = await query('SELECT * FROM aura_curiosity_questions ORDER BY created_at DESC LIMIT ?', [Math.max(1,Math.min(Number(limit)||40,200))]);
    return rows.map((row)=>({ ...row, score:Number(row.score||0), evidence:parse(row.evidence,{}), result:parse(row.result,{}) }));
  }

  async enqueue(payload = {}) {
    const question = clean(payload.question,3000);
    if (!question) throw new Error('curiosity question requise');
    const dimensions = {
      novelty:clamp(payload.novelty ?? 0.6),
      uncertainty:clamp(payload.uncertainty ?? 0.7),
      impact:clamp(payload.impact ?? 0.5),
      relevance:clamp(payload.relevance ?? 0.6),
      repetition:clamp(payload.repetition ?? 0),
    };
    const score = curiosityScore(dimensions);
    const id = randomUUID();
    const stamp = now();
    await query(
      `INSERT INTO aura_curiosity_questions(
        id,source,domain,question,why_now,novelty,uncertainty,impact,relevance,repetition,
        score,status,evidence,result,error,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,'queued','{}','{}','',?,?)`,
      [id,clean(payload.source||'self',120),clean(payload.domain||'general',120),question,clean(payload.why_now,3000),
       dimensions.novelty,dimensions.uncertainty,dimensions.impact,dimensions.relevance,dimensions.repetition,score,stamp,stamp],
    );
    return { id, question, score, status:'queued', ...dimensions };
  }

  async generateQuestions(trigger = 'cycle') {
    const registry = await this.products.status().catch(()=>({products:[]}));
    const productSummary = registry.products.map((p)=>({
      id:p.id,state:p.state,version:p.version,capabilities:p.capabilities?.slice(0,20),
    }));
    const fallback = [];
    for (const product of registry.products.filter((p)=>p.state !== 'online')) {
      fallback.push({
        source:'system',domain:'ecosystem',
        question:`Pourquoi ${product.name} est-il ${product.state}, et quelle observation permettrait de distinguer panne, absence normale et intégration AURA manquante ?`,
        why_now:'Produit Quantic non observé comme actif.',novelty:0.55,uncertainty:0.8,impact:0.7,relevance:0.9,
      });
    }
    if (!this.ai?.enabled) return fallback;

    try {
      const answer = await this.ai.generate(
        [
          'Tu es le moteur de curiosité d’AURA. Génère des QUESTIONS utiles, pas des affirmations.',
          'Cherche les inconnues, contradictions, anomalies, capacités inutilisées, risques techniques et opportunités d’apprentissage.',
          'Ne demande ni secrets, ni données sensibles. Ne propose pas d’action irréversible.',
          'Retour JSON strict: {"questions":[{"question":"...","domain":"system|web|ecosystem|interlocutor|self","why_now":"...","novelty":0.0,"uncertainty":0.0,"impact":0.0,"relevance":0.0}]}',
          'Trigger: '+clean(trigger,120),
          'Produits: '+JSON.stringify(productSummary).slice(0,12000),
        ].join('\n'),
        'AURA est curieuse mais épistémiquement prudente. Une bonne question réduit une incertitude importante.',
        1000,'reasoning',
      );
      const parsed = parseJsonObject(answer);
      const rows = Array.isArray(parsed.questions) ? parsed.questions : [];
      return [...rows,...fallback];
    } catch {
      return fallback.slice(0,config.curiosityQuestionsPerCycle);
    }
  }

  async investigate(row) {
    const question = clean(row.question,3000);
    await query("UPDATE aura_curiosity_questions SET status='researching',updated_at=? WHERE id=?",[now(),row.id]);
    let research = { ok:false, skipped:true, reason:'web unavailable' };
    if (this.web?.enabled && row.domain !== 'interlocutor') {
      research = await this.web.research(question,{trigger:'curiosity'}).catch((error)=>({ok:false,error:clean(error?.message||error,1000)}));
    }
    const result = {
      researched:Boolean(research?.ok),
      research_session_id:String(research?.session_id || ''),
      epistemic_status:String(research?.epistemic_status || 'unverified'),
      confidence:Number(research?.confidence || 0),
      conclusion:clean(research?.conclusion || research?.error || research?.reason || '',5000),
    };
    const status = result.researched ? 'learned' : 'open';
    await query(
      'UPDATE aura_curiosity_questions SET status=?,evidence=?,result=?,error=?,updated_at=? WHERE id=?',
      [status,JSON.stringify(research?.evidence || []).slice(0,80000),JSON.stringify(result).slice(0,80000),
       research?.error ? clean(research.error,2000) : '',now(),row.id],
    );
    if (result.researched && this.kernel?.observeEvent) {
      await this.kernel.observeEvent('curiosity-learning',{
        question,result,source:row.source,domain:row.domain,
      },'curiosity-engine').catch(()=>{});
    }
    return { id:row.id,status,result };
  }

  async runCycle(trigger = 'manual') {
    if (this.running || !config.curiosityEnabled) return { skipped:true,reason:this.running?'already-running':'disabled' };
    this.running = true;
    try {
      this.lastCycleAt = now();
      const generated = await this.generateQuestions(trigger);
      const added = [];
      for (const item of generated) {
        if (added.length >= config.curiosityQuestionsPerCycle) break;
        const since = new Date(Date.now() - 86_400_000).toISOString();
        const duplicate = await one(
          'SELECT id,status,score FROM aura_curiosity_questions WHERE question=? AND created_at>=? ORDER BY created_at DESC LIMIT 1',
          [clean(item.question,3000), since],
        ).catch(()=>null);
        if (duplicate) continue;
        const queued = await this.enqueue({source:item.source||'self',...item});
        if (queued.score >= config.curiosityMinScore) added.push(queued);
      }
      const budget = Math.max(0,config.curiosityResearchPerCycle);
      const rows = await query(
        "SELECT * FROM aura_curiosity_questions WHERE status='queued' AND score>=? ORDER BY score DESC,created_at ASC LIMIT ?",
        [config.curiosityMinScore,budget],
      );
      const investigated = [];
      for (const row of rows) investigated.push(await this.investigate(row));
      return { ok:true,generated:generated.length,queued:added.length,investigated,last_cycle_at:this.lastCycleAt };
    } finally {
      this.running = false;
    }
  }

  status() {
    return {
      version:CuriosityEngine.VERSION,enabled:config.curiosityEnabled,started:this.started,running:this.running,
      last_cycle_at:this.lastCycleAt,last_error:this.lastError,
      tick_seconds:config.curiosityTickSeconds,min_score:config.curiosityMinScore,
      research_per_cycle:config.curiosityResearchPerCycle,
    };
  }
}
