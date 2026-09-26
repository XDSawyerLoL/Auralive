import { createHash, randomUUID } from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { config } from './config.js';
import { query } from './db.js';
import { clamp, parseJsonObject } from './policy.js';

const now = () => new Date().toISOString();

function cleanText(value, limit = 12000) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function hash(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function hostOf(value) {
  try { return new URL(String(value)).hostname.toLowerCase(); } catch { return ''; }
}

function isPrivateIpv4(ip) {
  const parts = String(ip).split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n))) return false;
  const [a, b] = parts;
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || a === 0;
}

function isPrivateIpv6(ip) {
  const value = String(ip).toLowerCase();
  return value === '::1'
    || value === '::'
    || value.startsWith('fc')
    || value.startsWith('fd')
    || value.startsWith('fe8')
    || value.startsWith('fe9')
    || value.startsWith('fea')
    || value.startsWith('feb');
}

export function sourcePrior(url) {
  const host = hostOf(url);
  if (!host) return 0.25;
  if (
    host.endsWith('.gov')
    || host.endsWith('.gov.uk')
    || host.endsWith('.gouv.fr')
    || host.endsWith('.europa.eu')
    || host.endsWith('.who.int')
    || host.endsWith('.oecd.org')
    || host.endsWith('.un.org')
  ) return 0.88;
  if (
    host.endsWith('.edu')
    || host === 'arxiv.org'
    || host === 'doi.org'
    || host.endsWith('.ac.uk')
    || host === 'pubmed.ncbi.nlm.nih.gov'
    || host === 'crossref.org'
    || host === 'api.crossref.org'
  ) return 0.82;
  if (host.endsWith('wikipedia.org') || host.endsWith('wikidata.org')) return 0.64;
  if (host === 'github.com' || host === 'api.github.com') return 0.70;
  return 0.55;
}

export function aggregateEvidence(rows = []) {
  const usable = rows.filter((row) => ['support', 'contradict'].includes(String(row.stance || '')));
  const supports = usable.filter((row) => row.stance === 'support');
  const contradicts = usable.filter((row) => row.stance === 'contradict');
  const supportHosts = new Set(supports.map((row) => row.independent_key || row.host).filter(Boolean));
  const contradictionHosts = new Set(contradicts.map((row) => row.independent_key || row.host).filter(Boolean));
  const weightedSupport = supports.reduce(
    (sum, row) => sum + clamp(row.reliability ?? 0.5) * clamp(row.relevance ?? 0.5),
    0,
  );
  const weightedContradiction = contradicts.reduce(
    (sum, row) => sum + clamp(row.reliability ?? 0.5) * clamp(row.relevance ?? 0.5),
    0,
  );
  const total = weightedSupport + weightedContradiction;
  const balance = total > 0 ? weightedSupport / total : 0;
  const independence = Math.min(1, supportHosts.size / 3);
  const contradictionPenalty = Math.min(0.55, weightedContradiction * 0.22);
  const confidence = clamp(
    balance * 0.58
    + independence * 0.27
    + Math.min(1, weightedSupport / 2.4) * 0.15
    - contradictionPenalty,
  );
  let epistemicStatus = 'unverified';
  if (supportHosts.size >= 2 && confidence >= 0.72 && weightedContradiction < weightedSupport * 0.35) {
    epistemicStatus = 'corroborated';
  } else if (weightedContradiction > 0 && weightedSupport > 0) {
    epistemicStatus = 'contested';
  } else if (supportHosts.size >= 1 && confidence >= 0.5) {
    epistemicStatus = 'partially-supported';
  }
  return {
    confidence: Number(confidence.toFixed(4)),
    epistemic_status: epistemicStatus,
    independent_supporting_sources: supportHosts.size,
    independent_contradicting_sources: contradictionHosts.size,
    weighted_support: Number(weightedSupport.toFixed(4)),
    weighted_contradiction: Number(weightedContradiction.toFixed(4)),
  };
}

export class WebSubstrate {
  static VERSION = 'aura-web-substrate-v1';

  constructor(ai) {
    this.ai = ai;
    this.lastResearchAt = '';
    this.lastError = '';
    this.totalResearch = 0;
    this.totalSources = 0;
    this.remoteSnapshot = [];
  }

  get enabled() {
    return Boolean(config.webSubstrateEnabled);
  }

  async assertSafeUrl(value) {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') throw new Error('AURA Web Substrate exige HTTPS');
    const host = url.hostname.toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
      throw new Error('Hôte réseau privé interdit');
    }
    if (config.webBlockedDomains.has(host)) throw new Error('Domaine bloqué: ' + host);
    if (
      config.webAllowedDomains.size
      && ![...config.webAllowedDomains].some((domain) => host === domain || host.endsWith('.' + domain))
    ) {
      throw new Error('Domaine hors allowlist: ' + host);
    }

    if (net.isIP(host)) {
      if ((net.isIPv4(host) && isPrivateIpv4(host)) || (net.isIPv6(host) && isPrivateIpv6(host))) {
        throw new Error('Adresse IP privée interdite');
      }
      return url;
    }

    const addresses = await dns.lookup(host, { all: true, verbatim: true });
    if (!addresses.length) throw new Error('Résolution DNS vide');
    for (const item of addresses) {
      if (
        (item.family === 4 && isPrivateIpv4(item.address))
        || (item.family === 6 && isPrivateIpv6(item.address))
      ) {
        throw new Error('Résolution DNS vers un réseau privé interdite');
      }
    }
    return url;
  }

  async fetchText(value, { maxBytes = config.webMaxSourceBytes } = {}) {
    const url = await this.assertSafeUrl(value);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.webRequestTimeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'text/html,application/json,text/plain;q=0.9,*/*;q=0.2',
          'User-Agent': 'AURA-Web-Substrate/1.0',
        },
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const length = Number(response.headers.get('content-length') || 0);
      if (length && length > maxBytes) throw new Error('Source trop volumineuse');
      const reader = response.body?.getReader?.();
      if (!reader) {
        const text = await response.text();
        return {
          url: response.url || String(url),
          text: cleanText(text, Math.min(maxBytes, 16000)),
          content_type: response.headers.get('content-type') || '',
        };
      }
      const chunks = [];
      let total = 0;
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        total += result.value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error('Source trop volumineuse');
        }
        chunks.push(result.value);
      }
      const merged = Buffer.concat(chunks.map((item) => Buffer.from(item))).toString('utf8');
      return {
        url: response.url || String(url),
        text: cleanText(merged, Math.min(maxBytes, 16000)),
        content_type: response.headers.get('content-type') || '',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async searchSearx(queryText, limit) {
    if (!config.webSearchUrl) return [];
    const endpoint = await this.assertSafeUrl(config.webSearchUrl);
    endpoint.searchParams.set('q', queryText);
    endpoint.searchParams.set('format', 'json');
    endpoint.searchParams.set('language', config.webSearchLanguage);
    endpoint.searchParams.set('safesearch', '1');
    const headers = {
      Accept: 'application/json',
      'User-Agent': 'AURA-Web-Substrate/1.0',
    };
    if (config.webSearchApiKey) headers.Authorization = 'Bearer ' + config.webSearchApiKey;
    const response = await fetch(endpoint, {
      headers,
      signal: AbortSignal.timeout(config.webRequestTimeoutMs),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('Search HTTP ' + response.status);
    return (Array.isArray(body?.results) ? body.results : []).slice(0, limit).map((row) => ({
      url: String(row.url || ''),
      title: cleanText(row.title || '', 300),
      snippet: cleanText(row.content || row.snippet || '', 1200),
      engine: String(row.engine || row.engines?.[0] || 'search'),
      published_at: String(row.publishedDate || row.published_at || ''),
    })).filter((row) => row.url.startsWith('https://'));
  }

  async searchWikipedia(queryText, limit) {
    const url = new URL('https://fr.wikipedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('list', 'search');
    url.searchParams.set('srsearch', queryText);
    url.searchParams.set('srlimit', String(Math.min(limit, 6)));
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'AURA-Web-Substrate/1.0' },
      signal: AbortSignal.timeout(config.webRequestTimeoutMs),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return [];
    return (body?.query?.search || []).map((row) => ({
      url: 'https://fr.wikipedia.org/wiki/' + encodeURIComponent(String(row.title || '').replace(/ /g, '_')),
      title: String(row.title || ''),
      snippet: cleanText(row.snippet || '', 1200),
      engine: 'wikipedia',
      published_at: '',
    }));
  }

  async searchGithub(queryText, limit) {
    const url = new URL('https://api.github.com/search/repositories');
    url.searchParams.set('q', cleanText(queryText, 240));
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('per_page', String(Math.min(limit, 5)));
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'AURA-Web-Substrate/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(config.webRequestTimeoutMs),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return [];
    return (Array.isArray(body?.items) ? body.items : []).map((row) => ({
      url: String(row.html_url || ''),
      title: cleanText(row.full_name || row.name || '', 300),
      snippet: cleanText(
        [row.description || '', `stars=${Number(row.stargazers_count || 0)} language=${row.language || 'n/a'}`].join(' · '),
        1200,
      ),
      engine: 'github',
      published_at: String(row.updated_at || ''),
    })).filter((row) => row.url.startsWith('https://github.com/'));
  }

  async searchCrossref(queryText, limit) {
    const url = new URL('https://api.crossref.org/works');
    url.searchParams.set('query.bibliographic', queryText);
    url.searchParams.set('rows', String(Math.min(limit, 6)));
    url.searchParams.set('select', 'DOI,title,URL,publisher,published');
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'AURA-Web-Substrate/1.0' },
      signal: AbortSignal.timeout(config.webRequestTimeoutMs),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return [];
    return (body?.message?.items || []).map((row) => ({
      url: String(row.URL || (row.DOI ? 'https://doi.org/' + row.DOI : '')),
      title: cleanText(Array.isArray(row.title) ? row.title[0] : row.title, 300),
      snippet: cleanText(row.publisher || '', 500),
      engine: 'crossref',
      published_at: '',
    })).filter((row) => row.url.startsWith('https://'));
  }

  async search(queryText, limit = config.webSearchResults) {
    const q = cleanText(queryText, 800);
    if (!q) return [];
    const batches = await Promise.allSettled([
      this.searchSearx(q, limit),
      this.searchWikipedia(q, Math.min(4, limit)),
      this.searchCrossref(q, Math.min(4, limit)),
      this.searchGithub(q, Math.min(4, limit)),
    ]);
    const seen = new Set();
    const rows = [];
    for (const batch of batches) {
      if (batch.status !== 'fulfilled') continue;
      for (const row of batch.value) {
        if (!row.url || seen.has(row.url)) continue;
        seen.add(row.url);
        rows.push(row);
      }
    }
    return rows.slice(0, limit);
  }

  async propose(question) {
    const fallback = {
      hypotheses: [{ statement: cleanText(question, 1200), prior: 0.5 }],
      queries: [cleanText(question, 500)],
      evaluation_criteria: ['independent corroboration', 'source reliability', 'contradictions'],
    };
    if (!this.ai?.enabled) return fallback;
    try {
      const answer = await this.ai.generate(
        [
          'Mission: construire un plan de recherche externe pour AURA.',
          'Le modèle ne doit PAS conclure. Il produit seulement des hypothèses testables et des requêtes.',
          'Retour JSON strict: {"hypotheses":[{"statement":"...","prior":0.0}],"queries":["..."],"evaluation_criteria":["..."]}.',
          'Question: ' + cleanText(question, 3000),
        ].join('\n'),
        'Tu es le noyau de méta-raisonnement d’AURA. Tu sépares hypothèses, recherche et preuve.',
        650,
        'research',
      );
      const parsed = parseJsonObject(answer);
      const hypotheses = (Array.isArray(parsed.hypotheses) ? parsed.hypotheses : [])
        .slice(0, 4)
        .map((item) => ({
          statement: cleanText(item?.statement || item, 1400),
          prior: clamp(item?.prior ?? 0.5),
        }))
        .filter((item) => item.statement);
      const queries = (Array.isArray(parsed.queries) ? parsed.queries : [])
        .slice(0, config.webMaxQueries)
        .map((item) => cleanText(item, 600))
        .filter(Boolean);
      return {
        hypotheses: hypotheses.length ? hypotheses : fallback.hypotheses,
        queries: queries.length ? queries : fallback.queries,
        evaluation_criteria: Array.isArray(parsed.evaluation_criteria)
          ? parsed.evaluation_criteria.slice(0, 8).map((item) => cleanText(item, 300))
          : fallback.evaluation_criteria,
      };
    } catch {
      return fallback;
    }
  }

  async evaluateSource(question, hypotheses, source) {
    const prior = sourcePrior(source.url);
    if (!this.ai?.enabled) {
      return {
        stance: 'neutral',
        relevance: 0.35,
        reliability: prior,
        excerpt: cleanText(source.text || source.snippet, 900),
        notes: 'Évaluation sémantique indisponible sans modèle.',
      };
    }
    const answer = await this.ai.generate(
      [
        'Évalue UNE source par rapport aux hypothèses. N’invente rien au-delà du texte fourni.',
        'Retour JSON strict: {"stance":"support|contradict|neutral","relevance":0.0,"reliability":0.0,"excerpt":"court résumé factuel","notes":"limites"}.',
        'Question: ' + cleanText(question, 1800),
        'Hypothèses: ' + JSON.stringify(hypotheses).slice(0, 5000),
        'URL: ' + source.url,
        'Prior de source: ' + prior,
        'Contenu: ' + cleanText(source.text || source.snippet, 7000),
      ].join('\n'),
      'Tu es le critique épistémique d’AURA. Tu dois distinguer support, contradiction et absence de preuve.',
      520,
      'critic',
    );
    const parsed = parseJsonObject(answer);
    const stance = ['support', 'contradict', 'neutral'].includes(String(parsed.stance))
      ? String(parsed.stance)
      : 'neutral';
    const modelReliability = clamp(parsed.reliability ?? prior);
    return {
      stance,
      relevance: clamp(parsed.relevance ?? 0.5),
      reliability: Number((prior * 0.65 + modelReliability * 0.35).toFixed(4)),
      excerpt: cleanText(parsed.excerpt || source.snippet || source.text, 1200),
      notes: cleanText(parsed.notes || '', 1000),
    };
  }

  async persistSource(queryText, source) {
    const host = hostOf(source.url);
    const fetchedAt = now();
    const expiresAt = new Date(Date.now() + config.webMemoryTtlSeconds * 1000).toISOString();
    const content = cleanText(source.text || source.snippet, 12000);
    const id = hash(source.url).slice(0, 40);
    await query(
      'INSERT INTO aura_external_memory(id,query_text,url,host,title,excerpt,content_hash,source_quality,published_at,fetched_at,expires_at) '
      + 'VALUES(?,?,?,?,?,?,?,?,?,?,?) '
      + 'ON DUPLICATE KEY UPDATE query_text=VALUES(query_text),title=VALUES(title),excerpt=VALUES(excerpt),'
      + 'content_hash=VALUES(content_hash),source_quality=VALUES(source_quality),published_at=VALUES(published_at),'
      + 'fetched_at=VALUES(fetched_at),expires_at=VALUES(expires_at)',
      [
        id,
        cleanText(queryText, 1000),
        source.url,
        host,
        cleanText(source.title, 500),
        content,
        hash(content),
        sourcePrior(source.url),
        cleanText(source.published_at, 80),
        fetchedAt,
        expiresAt,
      ],
    );
    return id;
  }

  async research(question, { trigger = 'manual' } = {}) {
    if (!this.enabled) return { ok: false, skipped: true, reason: 'web substrate disabled' };
    const q = cleanText(question, 5000);
    if (!q) throw new Error('Question de recherche vide');
    const sessionId = randomUUID();
    const startedAt = now();
    const plan = await this.propose(q);
    await query(
      "INSERT INTO aura_reasoning_sessions(id,trigger_name,question,hypotheses,plan,conclusion,confidence,epistemic_status,evidence_count,created_at,updated_at) "
      + "VALUES(?,?,?,?,?,'',0,'researching',0,?,?)",
      [sessionId, String(trigger).slice(0, 120), q, JSON.stringify(plan.hypotheses), JSON.stringify(plan), startedAt, startedAt],
    );

    const searchRows = [];
    for (const searchQuery of plan.queries.slice(0, config.webMaxQueries)) {
      const rows = await this.search(searchQuery, config.webSearchResults);
      for (const row of rows) searchRows.push({ ...row, search_query: searchQuery });
    }

    const unique = [];
    const seenUrls = new Set();
    for (const row of searchRows) {
      if (!row.url || seenUrls.has(row.url)) continue;
      seenUrls.add(row.url);
      unique.push(row);
      if (unique.length >= config.webMaxSources) break;
    }

    const evidence = [];
    for (const row of unique) {
      let fetched = { url: row.url, text: row.snippet || '', content_type: '' };
      try {
        fetched = await this.fetchText(row.url);
      } catch {
      }
      const source = { ...row, ...fetched, url: fetched.url || row.url };
      await this.persistSource(row.search_query, source).catch(() => {});
      const evaluated = await this.evaluateSource(q, plan.hypotheses, source).catch(() => ({
        stance: 'neutral',
        relevance: 0.2,
        reliability: sourcePrior(source.url) * 0.65,
        excerpt: cleanText(source.snippet || source.text, 700),
        notes: 'Évaluation indisponible.',
      }));
      const host = hostOf(source.url);
      const item = {
        source_url: source.url,
        source_title: cleanText(source.title, 500),
        host,
        independent_key: host.replace(/^www\./, ''),
        ...evaluated,
      };
      evidence.push(item);
      await query(
        'INSERT INTO aura_reasoning_evidence(session_id,source_url,source_title,source_host,stance,relevance,reliability,excerpt,notes,created_at) '
        + 'VALUES(?,?,?,?,?,?,?,?,?,?)',
        [
          sessionId,
          item.source_url,
          item.source_title,
          item.host,
          item.stance,
          item.relevance,
          item.reliability,
          item.excerpt,
          item.notes,
          now(),
        ],
      );
    }

    const aggregate = aggregateEvidence(evidence);
    let conclusion = '';
    if (this.ai?.enabled && evidence.length) {
      const answer = await this.ai.generate(
        [
          'Synthétise la recherche AURA à partir des preuves UNIQUEMENT.',
          'Tu dois mentionner les contradictions et l’incertitude. Pas de fait sans support.',
          'Question: ' + q,
          'Hypothèses: ' + JSON.stringify(plan.hypotheses).slice(0, 5000),
          'Preuves: ' + JSON.stringify(evidence).slice(0, 18000),
          'Verdict déterministe: ' + JSON.stringify(aggregate),
        ].join('\n'),
        'Tu es le synthétiseur épistémique d’AURA. Le verdict déterministe est souverain sur ton style.',
        900,
        'critic',
      );
      conclusion = cleanText(answer, 6000);
    }
    if (!conclusion) {
      conclusion = aggregate.epistemic_status === 'corroborated'
        ? 'Les éléments disponibles sont corroborés par plusieurs sources indépendantes.'
        : aggregate.epistemic_status === 'contested'
          ? 'Les sources disponibles se contredisent; aucune conclusion ferme ne doit être adoptée.'
          : 'Les éléments disponibles restent insuffisants pour conclure avec confiance.';
    }

    await query(
      'UPDATE aura_reasoning_sessions SET conclusion=?,confidence=?,epistemic_status=?,evidence_count=?,updated_at=? WHERE id=?',
      [conclusion, aggregate.confidence, aggregate.epistemic_status, evidence.length, now(), sessionId],
    );
    this.lastResearchAt = now();
    this.lastError = '';
    this.totalResearch += 1;
    this.totalSources += evidence.length;

    return {
      ok: true,
      session_id: sessionId,
      question: q,
      plan,
      conclusion,
      ...aggregate,
      evidence_count: evidence.length,
      evidence,
    };
  }

  async sessions(limit = 20) {
    return query(
      'SELECT id,trigger_name,question,hypotheses,plan,conclusion,confidence,epistemic_status,evidence_count,created_at,updated_at '
      + 'FROM aura_reasoning_sessions ORDER BY updated_at DESC LIMIT ?',
      [Math.max(1, Math.min(Number(limit) || 20, 100))],
    );
  }

  async externalContext(limit = 5) {
    const rows = await query(
      "SELECT question,conclusion,confidence,epistemic_status,evidence_count,updated_at "
      + "FROM aura_reasoning_sessions WHERE epistemic_status IN ('corroborated','partially-supported','contested') "
      + "ORDER BY updated_at DESC LIMIT ?",
      [Math.max(1, Math.min(Number(limit) || 5, 12))],
    );
    if (!rows.length) return '';
    return [
      'MÉMOIRE EXTERNE DISTRIBUÉE — résultats de recherche, à distinguer de la mémoire interne.',
      ...rows.map((row) =>
        '[' + row.epistemic_status + '; confiance=' + Number(row.confidence || 0).toFixed(2)
        + '; preuves=' + Number(row.evidence_count || 0) + '] '
        + cleanText(row.question, 240) + ' => ' + cleanText(row.conclusion, 700)
      ),
    ].join('\n').slice(0, 6000);
  }

  status() {
    return {
      version: WebSubstrate.VERSION,
      enabled: this.enabled,
      search_gateway_configured: Boolean(config.webSearchUrl),
      default_public_sources: ['wikipedia', 'crossref'],
      max_queries: config.webMaxQueries,
      max_sources: config.webMaxSources,
      last_research_at: this.lastResearchAt,
      last_error: this.lastError,
      total_research: this.totalResearch,
      total_sources: this.totalSources,
      epistemic_gate: 'independent-source-corroboration',
      network_action_bus: 'Quantic Studio authenticated execution bridge',
      arbitrary_remote_shell: false,
    };
  }
}
