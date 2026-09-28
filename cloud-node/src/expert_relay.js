import { createHash, randomUUID } from 'node:crypto';
import { config } from './config.js';
import { one, query } from './db.js';

const now = () => new Date().toISOString();

function normalize(value, max = 12000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function incidentKey(input = {}) {
  return createHash('sha256')
    .update([
      String(input.automationId || ''),
      String(input.eventType || ''),
      String(input.signature || ''),
    ].join('|').toLowerCase())
    .digest('hex')
    .slice(0, 40);
}

export class ExpertRelay {
  static VERSION = 'aura-expert-relay-v1';

  constructor(ai, kernel) {
    this.ai = ai;
    this.kernel = kernel;
    this.lastError = '';
  }

  async status() {
    const counts = await one(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS queued,
        SUM(CASE WHEN status='advice_received' THEN 1 ELSE 0 END) AS advice_received,
        SUM(CASE WHEN status='testing' THEN 1 ELSE 0 END) AS testing,
        SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END) AS resolved
       FROM aura_expert_incidents`,
    ).catch(() => null);
    return {
      version: ExpertRelay.VERSION,
      enabled: config.expertRelayEnabled,
      mode: config.expertMode,
      paid_allowed: config.expertAllowPaid,
      openai_configured: Boolean(config.expertOpenAiApiKey && config.expertOpenAiModel),
      failure_threshold: config.expertFailureThreshold,
      counts: {
        total: Number(counts?.total || 0),
        queued: Number(counts?.queued || 0),
        advice_received: Number(counts?.advice_received || 0),
        testing: Number(counts?.testing || 0),
        resolved: Number(counts?.resolved || 0),
      },
      last_error: this.lastError,
    };
  }

  async recent(limit = 20) {
    return query(
      `SELECT id,incident_key,status,automation_id,event_type,signature,failures,
        summary,provider,created_at,updated_at
       FROM aura_expert_incidents
       ORDER BY updated_at DESC LIMIT ?`,
      [Math.max(1, Math.min(Number(limit) || 20, 100))],
    );
  }

  async incident(id) {
    const row = await one('SELECT * FROM aura_expert_incidents WHERE id=?', [String(id)]);
    if (!row) return null;
    const messages = await query(
      `SELECT id,role,author,content,metadata,created_at
       FROM aura_expert_messages WHERE incident_id=? ORDER BY id ASC LIMIT 200`,
      [String(id)],
    );
    return {
      ...row,
      context: parseJson(row.context, {}),
      result: parseJson(row.result, {}),
      messages: messages.map((message) => ({
        ...message,
        metadata: parseJson(message.metadata, {}),
      })),
    };
  }

  async addMessage(id, role, author, content, metadata = {}) {
    const text = normalize(content, 20000);
    if (!text) throw new Error('message expert vide');
    await query(
      `INSERT INTO aura_expert_messages(
        incident_id,role,author,content,metadata,created_at
      ) VALUES(?,?,?,?,?,?)`,
      [
        String(id),
        normalize(role || 'system', 40),
        normalize(author || 'AURA', 120),
        text,
        JSON.stringify(metadata || {}).slice(0, 16000),
        now(),
      ],
    );
    await query('UPDATE aura_expert_incidents SET updated_at=? WHERE id=?', [now(), String(id)]);
  }

  async openIncident(input = {}) {
    if (!config.expertRelayEnabled) return { created: false, skipped: 'disabled' };
    const failures = Math.max(1, Number(input.failures || 1));
    if (failures < config.expertFailureThreshold) {
      return { created: false, skipped: 'below-threshold' };
    }

    const key = incidentKey(input);
    const existing = await one(
      `SELECT id,status,updated_at FROM aura_expert_incidents
       WHERE incident_key=? AND status NOT IN ('resolved','closed')
       ORDER BY updated_at DESC LIMIT 1`,
      [key],
    );
    if (existing) {
      await query(
        'UPDATE aura_expert_incidents SET failures=GREATEST(failures,?),updated_at=? WHERE id=?',
        [failures, now(), existing.id],
      );
      return { created: false, incident_id: existing.id, status: existing.status };
    }

    const id = randomUUID();
    const [lessons, reflections] = await Promise.all([
      this.kernel?.lessons?.(6).catch(() => []) || [],
      this.kernel?.reflections?.(4).catch(() => []) || [],
    ]);
    const context = {
      automation_id: normalize(input.automationId, 220),
      event_type: normalize(input.eventType, 220),
      signature: normalize(input.signature, 1000),
      failures,
      report: input.report || {},
      lessons,
      reflections,
      constraints: [
        'No secret disclosure.',
        'No irreversible action before sandbox validation.',
        'Prefer minimal reversible fixes.',
        'Do not disable safety or cost guards.',
      ],
    };
    const summary =
      `Blocage répété: ${context.automation_id} a échoué ${failures} fois avec la signature « ${context.signature} ».`;

    await query(
      `INSERT INTO aura_expert_incidents(
        id,incident_key,status,automation_id,event_type,signature,failures,
        summary,context,provider,result,created_at,updated_at
      ) VALUES(?,?,'queued',?,?,?,?,?,?,?,'{}',?,?)`,
      [
        id,
        key,
        context.automation_id,
        context.event_type,
        context.signature,
        failures,
        summary,
        JSON.stringify(context).slice(0, 60000),
        config.expertMode,
        now(),
        now(),
      ],
    );
    await this.addMessage(
      id,
      'aura',
      'AURA',
      [
        'J’ai besoin d’un second regard sur un blocage que je n’arrive pas à résoudre seule.',
        summary,
        'Je veux comprendre la cause, obtenir une hypothèse minimale et un plan de validation en sandbox.',
        'Je n’appliquerai rien sans vérifier.',
      ].join('\n'),
      { kind: 'incident-opened' },
    );

    if (config.expertMode === 'local') {
      await this.ask(id).catch((error) => { this.lastError = normalize(error?.message || error, 1000); });
    } else if (config.expertMode === 'openai' && config.expertAllowPaid) {
      await this.ask(id).catch((error) => { this.lastError = normalize(error?.message || error, 1000); });
    }

    return { created: true, incident_id: id, status: 'queued' };
  }

  buildPrompt(incident) {
    return [
      'AURA te demande un diagnostic technique. Elle doit rester l’agent qui décide et exécute.',
      'Réponds avec: DIAGNOSTIC, HYPOTHESE, CORRECTIF_MINIMAL, TEST_SANDBOX, CRITERES_REUSSITE, RISQUES, ROLLBACK.',
      'N’invente pas les faits absents du dossier. Ne demande ni n’expose aucun secret.',
      'Privilégie un changement minimal, réversible et testable.',
      '',
      'DOSSIER:',
      JSON.stringify({
        id: incident.id,
        summary: incident.summary,
        context: incident.context,
        messages: incident.messages.slice(-12).map((m) => ({
          role: m.role,
          author: m.author,
          content: m.content,
        })),
      }).slice(0, config.expertMaxContextChars),
    ].join('\n');
  }

  async ask(id) {
    const incident = await this.incident(id);
    if (!incident) throw new Error('incident expert inconnu');

    let answer = '';
    let provider = config.expertMode;

    if (config.expertMode === 'openai') {
      if (!config.expertAllowPaid) throw new Error('expert OpenAI bloqué par le garde-fou zéro coût');
      if (!config.expertOpenAiApiKey || !config.expertOpenAiModel) {
        throw new Error('expert OpenAI non configuré');
      }
      const response = await fetch(`${config.expertOpenAiBaseUrl}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.expertOpenAiApiKey}`,
        },
        body: JSON.stringify({
          model: config.expertOpenAiModel,
          input: this.buildPrompt(incident),
          max_output_tokens: config.expertMaxOutputTokens,
        }),
        signal: AbortSignal.timeout(config.expertTimeoutMs),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Expert OpenAI HTTP ${response.status}: ${text.slice(0, 500)}`);
      const payload = text ? JSON.parse(text) : {};
      answer = normalize(
        payload.output_text
        || payload.output?.flatMap?.((item) => item?.content || [])
          ?.map?.((part) => part?.text || '')
          ?.filter?.(Boolean)
          ?.join?.('\n')
        || '',
        20000,
      );
      provider = 'openai-responses';
    } else if (config.expertMode === 'local') {
      answer = normalize(await this.ai.generate(
        this.buildPrompt(incident),
        'Tu es un expert externe consulté par AURA. Tu aides à diagnostiquer et tester; tu ne prends pas le contrôle d’AURA.',
        config.expertMaxOutputTokens,
        'critic',
      ), 20000);
      provider = 'aura-existing-ai';
    } else {
      return { queued: true, incident_id: id, mode: config.expertMode };
    }

    if (!answer) throw new Error('réponse expert vide');
    await this.receiveAdvice(id, answer, provider);
    return { queued: false, incident_id: id, provider, answer };
  }

  async receiveAdvice(id, answer, provider = 'external-expert') {
    const incident = await this.incident(id);
    if (!incident) throw new Error('incident expert inconnu');
    const advice = normalize(answer, 20000);
    if (!advice) throw new Error('conseil expert vide');

    await this.addMessage(id, 'expert', provider, advice, { kind: 'expert-advice' });
    await query(
      `UPDATE aura_expert_incidents
       SET status='advice_received',provider=?,result=?,updated_at=? WHERE id=?`,
      [
        normalize(provider, 120),
        JSON.stringify({ advice }).slice(0, 30000),
        now(),
        String(id),
      ],
    );

    if (this.kernel?.addIntention) {
      await this.kernel.addIntention(
        `Tester en sandbox le conseil expert pour l’incident ${id}: ${incident.signature}`,
        {
          priority: 0.9,
          source: 'expert-relay',
          context: {
            expert_incident_id: id,
            provider,
            advice: advice.slice(0, 8000),
            requirement: 'sandbox-first',
          },
        },
      );
    }
    if (this.kernel?.pushStimulus) {
      this.kernel.pushStimulus({
        type: 'expert.advice',
        source: 'expert-relay',
        occurred_at: now(),
        payload: {
          incident_id: id,
          provider,
          advice: advice.slice(0, 8000),
        },
      });
    }
    return { ok: true, incident_id: id, status: 'advice_received' };
  }

  async markTesting(id, result = {}) {
    await query(
      `UPDATE aura_expert_incidents SET status='testing',result=?,updated_at=? WHERE id=?`,
      [JSON.stringify(result || {}).slice(0, 30000), now(), String(id)],
    );
    return { ok: true, status: 'testing' };
  }

  async resolve(id, result = {}) {
    await query(
      `UPDATE aura_expert_incidents SET status='resolved',result=?,updated_at=? WHERE id=?`,
      [JSON.stringify(result || {}).slice(0, 30000), now(), String(id)],
    );
    await this.addMessage(
      id,
      'aura',
      'AURA',
      'J’ai validé la résolution de cet incident après test. Je conserve le résultat comme expérience vérifiée.',
      { kind: 'incident-resolved', result },
    );
    return { ok: true, status: 'resolved' };
  }
}
