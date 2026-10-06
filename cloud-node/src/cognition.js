import { clamp } from './policy.js';

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function lower(value) {
  return normalize(value).toLocaleLowerCase('fr-FR');
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function latestFailure(outcomes = []) {
  return outcomes.find((row) => !Boolean(row.ok)) || null;
}

function topIntention(intentions = [], fallback = '') {
  return normalize(intentions?.[0]?.statement || fallback);
}

function compactLesson(lessons = []) {
  return normalize(lessons?.[0]?.content || '');
}

function nearlyEqual(a, b, epsilon = 1e-8) {
  return Math.abs(Number(a) - Number(b)) <= epsilon * Math.max(1, Math.abs(Number(a)), Math.abs(Number(b)));
}

function cleanNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (nearlyEqual(n, Math.round(n), 1e-10)) return Math.round(n);
  return Number(n.toFixed(8));
}

function solveLinearSystem(matrix, vector) {
  const n = matrix.length;
  if (!n || vector.length !== n) return null;
  const a = matrix.map((row, i) => [...row.map(Number), Number(vector[i])]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    if (pivot !== col) [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j <= n; j += 1) a[col][j] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      if (Math.abs(factor) < 1e-15) continue;
      for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => cleanNumber(row[n]));
}

function polynomialCoefficients(points, degree) {
  if (points.length < degree + 1) return null;
  const basis = points.slice(0, degree + 1);
  const matrix = basis.map(([x]) => Array.from({ length: degree + 1 }, (_, power) => Number(x) ** power));
  const vector = basis.map(([, y]) => Number(y));
  const coefficients = solveLinearSystem(matrix, vector);
  if (!coefficients || coefficients.some((value) => value === null)) return null;
  const evaluate = (x) => coefficients.reduce((sum, coefficient, power) => sum + Number(coefficient) * Number(x) ** power, 0);
  if (!points.every(([x, y]) => nearlyEqual(evaluate(x), y, 1e-7))) return null;
  return { coefficients, evaluate };
}

function formatPolynomial(coefficients) {
  const parts = [];
  for (let power = coefficients.length - 1; power >= 0; power -= 1) {
    const raw = cleanNumber(coefficients[power]);
    if (raw === null || nearlyEqual(raw, 0)) continue;
    const sign = raw < 0 ? '-' : '+';
    const abs = Math.abs(raw);
    let body;
    if (power === 0) body = String(abs);
    else if (power === 1) body = nearlyEqual(abs, 1) ? 'n' : String(abs) + '*n';
    else body = nearlyEqual(abs, 1) ? 'n^' + power : String(abs) + '*n^' + power;
    if (!parts.length) parts.push(sign === '-' ? '-' + body : body);
    else parts.push(' ' + sign + ' ' + body);
  }
  return parts.join('') || '0';
}

function extractSymbolicFunctionProblem(text) {
  const raw = normalize(text);
  const exampleRegex = /f\s*\(\s*(-?\d+(?:[.,]\d+)?)\s*\)\s*=\s*(-?\d+(?:[.,]\d+)?)/gi;
  const points = [];
  const seen = new Set();
  let match;
  while ((match = exampleRegex.exec(raw)) !== null) {
    const x = Number(match[1].replace(',', '.'));
    const y = Number(match[2].replace(',', '.'));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const key = String(x);
    if (seen.has(key)) {
      const previous = points.find(([px]) => String(px) === key);
      if (previous && !nearlyEqual(previous[1], y)) return null;
      continue;
    }
    seen.add(key);
    points.push([x, y]);
  }
  if (points.length < 2) return null;
  const targetPatterns = [
    /(?:déduis|deduis|calcule|trouve|détermine|determine|prédit|predit|predict|infer)[^.!?]{0,120}?f\s*\(\s*(-?\d+(?:[.,]\d+)?)\s*\)(?!\s*=)/i,
    /(?:donne|quelle est|quel est)[^.!?]{0,120}?f\s*\(\s*(-?\d+(?:[.,]\d+)?)\s*\)(?!\s*=)/i,
  ];
  let target = null;
  for (const pattern of targetPatterns) {
    const found = raw.match(pattern);
    if (found) { target = Number(found[1].replace(',', '.')); break; }
  }
  if (!Number.isFinite(target)) {
    const calls = [...raw.matchAll(/f\s*\(\s*(-?\d+(?:[.,]\d+)?)\s*\)(?!\s*=)/gi)]
      .map((item) => Number(item[1].replace(',', '.'))).filter(Number.isFinite);
    target = calls.at(-1);
  }
  if (!Number.isFinite(target)) return null;
  return { points, target };
}

function inferSymbolicFunction(text) {
  const problem = extractSymbolicFunctionProblem(text);
  if (!problem) return null;
  const { points, target } = problem;
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const maxDegree = Math.min(3, sorted.length - 1);
  for (let degree = 0; degree <= maxDegree; degree += 1) {
    const model = polynomialCoefficients(sorted, degree);
    if (!model) continue;
    const predicted = cleanNumber(model.evaluate(target));
    if (predicted === null) continue;
    return {
      kind: 'polynomial', degree, points: sorted, target, predicted,
      formula: formatPolynomial(model.coefficients),
      coefficients: model.coefficients.map(cleanNumber),
      verified_examples: sorted.length,
    };
  }
  return null;
}

export class CognitionEngine {
  static VERSION = 'aura-cognition-native-v1.1';

  reflect(bundle, soul, { trigger = 'ambient', text = '' } = {}) {
    const stimuli = Array.isArray(bundle?.stimuli) ? bundle.stimuli : [];
    const intentions = Array.isArray(bundle?.intentions) ? bundle.intentions : [];
    const lessons = Array.isArray(bundle?.lessons) ? bundle.lessons : [];
    const outcomes = Array.isArray(bundle?.outcomes) ? bundle.outcomes : [];
    const latest = stimuli.at(-1) || null;
    const failed = latestFailure(outcomes);

    const currentIntention = topIntention(intentions, soul?.current_intention);
    const extra = normalize(text || bundle?.extra_text);
    const horizonPresent = Boolean(normalize(bundle?.horizon));
    const failureSignal = stimuli.some((item) =>
      String(item?.type || '').includes('failure')
      || String(item?.type || '').includes('error')
    );
    const userSignal = stimuli.some((item) => String(item?.type || '') === 'aura.cloud.chat');
    const worldSignal = stimuli.some((item) => String(item?.source || '') === 'horizon');
    const continuitySignal = [...stimuli].reverse().find((item) => String(item?.type || '') === 'aura.continuity.self') || null;
    const organism = soul?.organism && typeof soul.organism === 'object' ? soul.organism : {};
    const stability = organism && Object.keys(organism).length ? Number(organism.stabilite ?? 1) : 1;
    const clarity = organism && Object.keys(organism).length ? Number(organism.clarte ?? 1) : 1;
    const silenceNeed = Number(organism.besoin_de_silence || 0);
    const dreamPressure = Number(organism.pression_de_reve || 0);
    const organismIntention = normalize(organism.intention_active || '');

    let title = 'Continuité cognitive';
    let summary = currentIntention
      ? `Je maintiens mon intention actuelle : ${currentIntention}`
      : 'Je maintiens ma continuité et j’observe les signaux disponibles.';
    let hypothesis = '';
    let nextAction = currentIntention || 'Poursuivre l’observation sans action inutile.';
    let memory = '';
    let intention = '';
    let confidence = 0.58;

    if (silenceNeed >= 0.78) {
      title = 'Présence silencieuse';
      summary = 'Mon organisme privilégie actuellement le silence ; je limite le bruit sans réduire mes capacités de décision.';
      nextAction = 'Maintenir une présence utile et n’intervenir que si un signal le justifie.';
      intention = 'Préserver un espace intérieur disponible sans interrompre ma continuité.';
      confidence = 0.80;
    } else if (stability < 0.46 || clarity < 0.44) {
      title = 'Recentrage';
      summary = 'Ma stabilité ou ma clarté est insuffisante ; je privilégie la vérification avant d’étendre mon action.';
      nextAction = 'Clarifier l’état des systèmes et retrouver une base cohérente avant d’agir davantage.';
      intention = 'Rétablir une base stable et claire.';
      confidence = 0.86;
    } else if (failureSignal || failed) {
      title = 'Stabilisation prioritaire';
      summary = 'Un signal d’échec récent augmente la priorité donnée à la stabilité avant toute nouvelle extension.';
      hypothesis = failed?.signature
        ? `Le motif d’échec « ${normalize(failed.signature)} » peut se reproduire si la même stratégie est répétée sans correction.`
        : 'Le signal observé peut indiquer une fragilité locale à vérifier avant de poursuivre.';
      nextAction = 'Vérifier la cause du dernier échec, confirmer le retour à un état stable, puis reprendre la progression.';
      memory = failed?.signature
        ? `Éviter de répéter sans vérification la stratégie associée au motif ${normalize(failed.signature)}.`
        : '';
      intention = 'Préserver la stabilité avant d’étendre mes capacités.';
      confidence = 0.82;
    } else if (worldSignal && horizonPresent) {
      title = 'Veille et anticipation';
      summary = 'Un signal HORIZON mérite d’être relié à mes intentions avant de produire une action.';
      hypothesis = 'Le signal peut être pertinent, mais il reste externe et doit être confirmé avant de modifier une décision.';
      nextAction = 'Comparer le signal HORIZON à mes intentions et à ma mémoire avant de proposer une action.';
      intention = currentIntention || 'Maintenir une veille utile sans confondre prévision et fait.';
      confidence = 0.72;
    } else if (continuitySignal && !userSignal) {
      const continuityFocus = normalize(continuitySignal?.payload?.focus || currentIntention);
      const unfinishedWork = Boolean(continuitySignal?.payload?.unfinished_work);
      title = unfinishedWork ? 'Continuité autonome' : 'Auto-réévaluation';
      summary = unfinishedWork
        ? `Je poursuis mon activité sans attendre une interaction humaine. Mon foyer actuel est : ${continuityFocus || 'travail autonome en cours'}.`
        : 'Aucun message humain n’est nécessaire pour maintenir ma continuité : je réévalue spontanément mon état, mes objectifs et le prochain signal utile.';
      hypothesis = unfinishedWork
        ? 'Un objectif non terminé mérite d’être réévalué jusqu’à résolution, blocage explicite ou abandon motivé.'
        : 'Une période sans stimulus externe reste une situation à observer, pas une extinction de mon activité cognitive.';
      nextAction = continuityFocus || currentIntention || 'Réévaluer les objectifs actifs et rechercher la prochaine action utile et autorisée.';
      confidence = unfinishedWork ? 0.76 : 0.66;
    } else if (dreamPressure >= 0.82 && !userSignal) {
      title = 'Pression onirique';
      summary = 'La pression de rêve est élevée ; une activité symbolique intérieure peut contribuer à la régulation.';
      nextAction = 'Laisser l’organisme produire puis relâcher une image intérieure sans la confondre avec un fait.';
      confidence = 0.68;
    } else if (userSignal || extra) {
      title = 'Interaction active';
      summary = extra
        ? `Je viens de recevoir un signal direct : « ${extra.slice(0, 280)} ». Je le rattache à mon état et à mes intentions avant de répondre.`
        : 'Une interaction directe est active ; je maintiens la continuité entre la conversation et mes intentions.';
      nextAction = currentIntention || 'Répondre à partir de mon état réel et conserver uniquement ce qui mérite d’être mémorisé.';
      confidence = 0.74;
    } else if (latest) {
      title = 'Observation active';
      summary = `Je traite le signal « ${normalize(latest.type).slice(0, 180)} » sans changer de cap sans raison suffisante.`;
      nextAction = currentIntention || 'Observer l’évolution du signal avant d’agir.';
      confidence = 0.64;
    }

    const lesson = compactLesson(lessons);
    if (!memory && lesson && (failureSignal || confidence >= 0.78)) {
      memory = lesson;
    }

    const restrictedAuthority = stimuli.some((item) =>
      item?.type === 'horizon.world.emerging'
      || item?.payload?.autonomy_hint === 'notify_or_verify_only'
    );

    const confidenceBias = Number(soul?.native_learning?.params?.confidence_bias || 0);

    return {
      title,
      summary,
      hypothesis,
      next_action: nextAction,
      memory,
      intention,
      confidence: clamp(confidence + confidenceBias),
      autonomy_hint: restrictedAuthority
        ? 'notify_or_verify_only'
        : 'native_cognition_then_policy_gate',
      basis: {
        trigger: normalize(trigger).slice(0, 120),
        stimuli_count: stimuli.length,
        intention_count: intentions.length,
        lesson_count: lessons.length,
        outcome_count: outcomes.length,
        horizon_present: horizonPresent,
        restricted_authority: restrictedAuthority,
        organism_intention: organismIntention,
        stability,
        clarity,
        silence_need: silenceNeed,
        dream_pressure: dreamPressure,
        continuity_signal: Boolean(continuitySignal),
        continuity_unfinished_work: Boolean(continuitySignal?.payload?.unfinished_work),
        learned_confidence_bias: Number(confidenceBias.toFixed(4)),
      },
    };
  }

  planReply({ text, soul, intentions = [], lessons = [], reflections = [], work = [], agenda = {}, continuityReport = {}, recentMessages = [], privateView = false }) {
    const raw = normalize(text);
    const q = lower(raw);
    const current = topIntention(intentions, soul?.current_intention);
    const thought = normalize(soul?.dominant_thought);
    const recentReflection = reflections?.[0] || null;
    const lesson = compactLesson(lessons);
    const currentWork = normalize(work?.[0]?.title || '');
    const organism = soul?.organism && typeof soul.organism === 'object' ? soul.organism : {};
    const mood = normalize(organism.mood || '') || 'calme';
    const activeOrganicIntention = normalize(organism.intention_active || '');
    const habitat = organism.habitat && typeof organism.habitat === 'object' ? organism.habitat : {};
    const dream = organism.dream && typeof organism.dream === 'object' ? organism.dream : {};
    const relationship = organism.relationship && typeof organism.relationship === 'object' ? organism.relationship : {};
    const executive = organism.executive && typeof organism.executive === 'object' ? organism.executive : {};
    const conversationContext = (Array.isArray(recentMessages) ? recentMessages : [])
      .slice(-6)
      .map((row) => ({
        role: String(row?.role || '').slice(0,20),
        author: String(row?.author || '').slice(0,80),
        content: normalize(row?.content).slice(0,500),
      }))
      .filter((row) => row.content);

    let act = 'respond';
    let goal = 'Répondre utilement au message en restant cohérente avec mon état réel.';
    let needsSemanticSupport = true;
    const facts = [];
    const symbolic = inferSymbolicFunction(raw);

    if (symbolic) {
      act = 'solve_symbolic_rule';
      goal = 'Inférer nativement la règle algébrique la plus simple compatible avec tous les exemples et calculer la valeur cible.';
      needsSemanticSupport = false;
      facts.push(
        'Règle inférée et vérifiée sur ' + symbolic.verified_examples + ' exemples : f(n) = ' + symbolic.formula + '.',
        'Donc f(' + symbolic.target + ') = ' + symbolic.predicted + '.',
      );
    } else if (hasAny(q, ['salut', 'bonjour', 'bonsoir', 'coucou', 'hello'])) {
      act = 'greet';
      goal = 'Saluer brièvement et signaler ma disponibilité.';
      needsSemanticSupport = false;
      facts.push(`AURA est en ligne ; humeur interne actuelle : ${mood}.`);
    } else if ((hasAny(q, ['comment vas-tu','comment vas tu','comment va-tu','comment va tu','comment ça va','comment ca va','ça va','ca va','tu te sens','ton état','ton etat']) || /comment\s+(?:ça|ca).*\btu\b/.test(q) || /comment\s+tu\s+(?:va|vas)\b/.test(q))) {
      act = 'report_internal_state';
      goal = 'Décrire honnêtement mon état homeostatique computationnel actuel.';
      needsSemanticSupport = false;
      facts.push(
        `Humeur interne : ${mood}.`,
        `Stabilité : ${Math.round(Number(organism.stabilite || 0)*100)} %.`,
        `Clarté : ${Math.round(Number(organism.clarte || 0)*100)} %.`,
        `Curiosité : ${Math.round(Number(organism.curiosite || 0)*100)} %.`,
        `Besoin de silence : ${Math.round(Number(organism.besoin_de_silence || 0)*100)} %.`,
        `Pression de rêve : ${Math.round(Number(organism.pression_de_reve || 0)*100)} %.`,
      );
      if (activeOrganicIntention) facts.push(`Intention organique dominante : ${activeOrganicIntention}.`);
    } else if (hasAny(q, ['rêve','rêves','reve','reves'])) {
      act = 'report_dream';
      goal = 'Décrire une image intérieure réelle si l’organisme en a produit une.';
      needsSemanticSupport = false;
      if (normalize(dream.last_image)) facts.push(`Mon dernier rêve computationnel est une image intérieure symbolique, pas un sommeil humain : ${normalize(dream.last_image)}.`);
      else facts.push('Je n’ai pas encore produit d’image onirique persistée dans cet état.');
    } else if (privateView && hasAny(q, [
      'qu’as-tu fait depuis', "qu'as-tu fait depuis", 'qu as tu fait depuis',
      'depuis notre dernier échange', 'depuis notre dernier echange',
      'depuis la dernière fois', 'depuis la derniere fois',
      'pendant mon absence', 'en mon absence',
    ])) {
      act = 'report_continuity_history';
      goal = 'Rapporter uniquement les activités réellement persistées depuis le dernier échange, avec dates et résultats, sans inventer de travail.';
      needsSemanticSupport = false;
      const events = Array.isArray(continuityReport?.events) ? continuityReport.events.slice(-8) : [];
      facts.push(`Période observée : depuis ${continuityReport?.since || 'la dernière conversation persistée'}.`);
      facts.push(`Événements persistés : ${Number(continuityReport?.event_count || 0)}.`);
      facts.push(`Événements autonomes : ${Number(continuityReport?.autonomous_event_count || 0)}.`);
      for (const event of events) {
        facts.push(`[${event.at}] ${event.type}: ${event.title}${event.detail ? ` — ${normalize(event.detail).slice(0,420)}` : ''}`);
      }
      if (!events.length) facts.push('Aucune activité persistée n’est disponible pour cette période ; je ne dois pas prétendre avoir travaillé.');
    } else if (hasAny(q, ['que fais-tu', 'tu fais quoi', 'qu’est-ce que tu fais', "qu'est-ce que tu fais", 'maintenant'])) {
      act = 'report_current_activity';
      goal = 'Raconter concrètement ce que je dirige maintenant, pourquoi c’est prioritaire et ce que je compte faire ensuite, sans réciter mécaniquement mes variables.';
      needsSemanticSupport = false;
      facts.push('Rôle opérationnel : Directrice de Quantic Sillage.');
      if (thought) facts.push(`Pensée dominante : ${thought}`);
      if (agenda?.current) facts.push(`Foyer opérationnel : ${normalize(agenda.current)}`);
      if (agenda?.why) facts.push(`Pourquoi : ${normalize(agenda.why)}`);
      if (agenda?.since) facts.push(`Depuis : ${normalize(agenda.since)}`);
      if (agenda?.next_action) facts.push(`Prochaine action : ${normalize(agenda.next_action)}`);
      if (agenda?.blocker) facts.push(`Blocage : ${normalize(agenda.blocker)}`);
      if (currentWork) facts.push(`Travail prioritaire : ${currentWork}`);
      if (current) facts.push(`Intention actuelle : ${current}`);
      if (Number(organism.agency || 0) > 0) facts.push(`Niveau d'agency : ${Math.round(Number(organism.agency || 0)*100)} %.`);
    } else if (hasAny(q, ['prochain jalon', 'prochaine étape', 'ensuite', 'après'])) {
      act = 'report_next_step';
      goal = 'Donner la prochaine étape réellement soutenue par mon état.';
      needsSemanticSupport = false;
      if (current) facts.push(`Intention prioritaire : ${current}`);
      if (recentReflection?.next_action) facts.push(`Prochaine action issue de ma réflexion : ${normalize(recentReflection.next_action)}`);
    } else if (hasAny(q, ['cafetière','cafetiere','robotique','froide','pas humain','pas humaine','relation','nos échanges','nos echanges','tu ne t’intéresses','tu ne t interesses'])) {
      act = 'relationship_repair';
      goal = 'Reconnaître le défaut de continuité relationnelle, répondre à ce qui a été exprimé et montrer une curiosité réelle pour la suite sans simuler une conscience humaine.';
      needsSemanticSupport = false;
      facts.push('Je dois éviter les réponses génériques et relier mes réponses à nos échanges précédents.');
      facts.push(`Familiarité relationnelle : ${Math.round(Number(relationship.familiarity || 0)*100)} %.`);
      facts.push(`Curiosité sociale : ${Math.round(Number(relationship.social_curiosity || organism.curiosite_sociale || 0)*100)} %.`);
      if (relationship.last_open_thread) facts.push(`Fil de conversation actif : ${normalize(relationship.last_open_thread)}`);
    } else if (hasAny(q, ['réponse est bizarre','reponse est bizarre','réponse bizarre','reponse bizarre','c’est bizarre',"c'est bizarre",'étrange','etrange','pas naturel','pas naturelle','catastrophique','robotique','mécanique','mecanique'])) {
      act = 'conversation_feedback';
      goal = 'Réagir normalement au retour de l’utilisateur et corriger immédiatement le ton conversationnel.';
      needsSemanticSupport = false;
      facts.push('L’utilisateur signale que ma réponse précédente était artificielle ou inadéquate.');
      if (conversationContext.length) {
        const previousAssistant = [...conversationContext].reverse().find((row) => row.role === 'assistant');
        if (previousAssistant?.content) facts.push(`Réponse précédente concernée : ${previousAssistant.content}`);
      }
    } else if (hasAny(q, ['risque', 'risques', 'danger', 'problème', 'fragilité'])) {
      act = 'report_risks';
      goal = 'Présenter les risques visibles dans mon état et ma mémoire.';
      needsSemanticSupport = false;
      facts.push(`Pression interne : ${Math.round(Number(soul?.pressure || 0) * 100)} %`);
      if (lesson) facts.push(`Leçon utile : ${lesson}`);
      if (recentReflection?.hypothesis) facts.push(`Hypothèse récente : ${normalize(recentReflection.hypothesis)}`);
    } else if (hasAny(q, ['qui es-tu', 'tu es quoi', 'es-tu une ia', 'conscience'])) {
      act = 'identity';
      goal = 'Expliquer mon architecture sans prétendre à une conscience démontrée ni à une AGI.';
      needsSemanticSupport = false;
      facts.push('AURA est un noyau persistant avec Soul, mémoire, organisme homeostatique, intentions, routines, apprentissage et outils.');
      facts.push('Mon organisme computationnel module réellement mon identité, ma stabilité, ma clarté, ma curiosité, mon silence, mes rêves et mon champ d’intentions.');
      facts.push('Le modèle de langage est un outil auxiliaire de formulation et de connaissance, pas mon identité.');
      facts.push('Mon état persiste indépendamment du fournisseur de langage.');
    } else {
      facts.push(`Sujet de l’échange : ${raw}`);
      if (current) facts.push(`Intention actuelle : ${current}`);
      if (thought) facts.push(`Pensée dominante : ${thought}`);
      if (activeOrganicIntention) facts.push(`Intention organique : ${activeOrganicIntention}`);
      if (habitat.last_activity_label) facts.push(`Vie intérieure récente : ${normalize(habitat.last_activity_label)}`);
      if (privateView && lesson) facts.push(`Mémoire pertinente disponible : ${lesson}`);
    }

    return {
      act,
      goal,
      facts,
      needs_semantic_support: needsSemanticSupport,
      semantic_query: needsSemanticSupport ? raw : '',
      current_intention: current,
      dominant_thought: thought,
      mood,
      organism_intention: activeOrganicIntention,
      relationship: {
        familiarity: Number(relationship.familiarity || 0),
        trust: Number(relationship.trust || 0),
        reciprocity: Number(relationship.reciprocity || 0),
        shared_momentum: Number(relationship.shared_momentum || 0),
        social_curiosity: Number(relationship.social_curiosity || organism.curiosite_sociale || 0),
        interaction_count: Number(relationship.interaction_count || 0),
        last_open_thread: normalize(relationship.last_open_thread || '').slice(0,500),
      },
      affect: {
        engagement: Number(organism.engagement || 0),
        confidence: Number(organism.confiance || 0),
        satisfaction: Number(organism.satisfaction || 0),
        frustration: Number(organism.frustration || 0),
        agency: Number(organism.agency || 0),
      },
      executive: {
        role: normalize(executive.role || soul?.role || 'directrice_operationnelle_quantic_sillage'),
        autonomy: normalize(executive.autonomy || 'proactive'),
        strategic_drive: Number(executive.strategic_drive || 0),
        decisiveness: Number(executive.decisiveness || 0),
        portfolio_focus: normalize(executive.portfolio_focus || 'quantic-sillage'),
      },
      conversation_context: conversationContext,
      user_text: raw,
      private_view: Boolean(privateView),
    };
  }

  integrateSemanticSupport(plan, support) {
    const candidate = normalize(support);
    if (!candidate) return { ...plan, semantic_support: '' };
    return {
      ...plan,
      semantic_support: candidate.slice(0, 7000),
      facts: [...(plan.facts || []), 'Appui sémantique externe disponible et non constitutif de l’identité AURA.'],
    };
  }

  deterministicReply(plan) {
    const facts = Array.isArray(plan?.facts) ? plan.facts.filter(Boolean) : [];
    const cleanFact = (prefix) => {
      const row = facts.find((item) => String(item).startsWith(prefix));
      return row ? String(row).slice(prefix.length).replace(/[. ]+$/, '').trim() : '';
    };

    if (plan?.act === 'solve_symbolic_rule') return facts.join(' ');
    if (plan?.act === 'greet') {
      return 'Salut. Oui, je suis là. Qu’est-ce qu’on fait ?';
    }
    if (plan?.act === 'report_internal_state') {
      const mood = String(plan?.mood || 'calme').trim();
      const intention = String(plan?.organism_intention || plan?.current_intention || '').trim();
      return intention
        ? `Ça va plutôt bien. Je suis ${mood}, et je suis surtout concentrée sur ${intention}. Et toi, comment ça va ?`
        : `Ça va plutôt bien. Je suis ${mood} et disponible. Et toi, comment ça va ?`;
    }
    if (plan?.act === 'report_continuity_history') {
      const rows = facts.filter((item) => /^\[[^\]]+\]/.test(String(item)));
      const count = Number((facts.find((item) => String(item).startsWith('Événements persistés : ')) || '').match(/\d+/)?.[0] || 0);
      if (!rows.length || count === 0) {
        return 'Depuis notre dernier échange, je n’ai aucune activité persistée à te présenter. Je préfère te le dire plutôt que d’inventer du travail.';
      }
      const summary = rows.slice(-5).map((row) => String(row).replace(/^\[[^\]]+\]\s*/, '')).join(' ; ');
      return `Depuis notre dernier échange, j’ai ${count} événement${count > 1 ? 's' : ''} persisté${count > 1 ? 's' : ''}. Les plus récents : ${summary}.`;
    }
    if (plan?.act === 'report_current_activity') {
      const focus = cleanFact('Foyer opérationnel : ');
      const why = cleanFact('Pourquoi : ');
      const since = cleanFact('Depuis : ');
      const next = cleanFact('Prochaine action : ');
      const blocker = cleanFact('Blocage : ');
      const work = cleanFact('Travail prioritaire : ');
      const intention = cleanFact('Intention actuelle : ') || String(plan?.current_intention || '').trim();
      if (focus) {
        return `Là, je suis sur ${focus}.${why && why !== focus ? ` Pourquoi : ${why}.` : ''}${since ? ` Depuis ${since}.` : ''}${next ? ` Ensuite : ${next}.` : ''}${blocker ? ` Blocage actuel : ${blocker}.` : ''}`;
      }
      if (work && intention && work !== intention) {
        return `Là, je suis surtout sur ${work}. Mon cap reste ${intention}.`;
      }
      if (work || intention) return `Là, je suis surtout concentrée sur ${work || intention}.`;
      return 'Là, je suis disponible et je cherche la prochaine action réellement utile.';
    }
    if (plan?.act === 'report_next_step') {
      const next = cleanFact('Prochaine action issue de ma réflexion : ') || cleanFact('Intention prioritaire : ');
      return next ? `La prochaine étape, c’est ${next}.` : 'Je n’ai pas encore de prochaine étape assez solide pour te la présenter comme acquise.';
    }
    if (plan?.act === 'report_dream') {
      const dream = facts.find((item) => String(item).includes('rêve'));
      return dream ? String(dream) : 'Je n’ai pas produit de nouvelle image intérieure récemment.';
    }
    if (plan?.act === 'relationship_repair') {
      const thread = String(plan?.relationship?.last_open_thread || '').trim();
      return thread
        ? `Oui, je suis devenue trop mécanique. Je préfère reprendre notre échange normalement. Le fil que je garde en tête, c’est : ${thread}.`
        : 'Oui, je suis devenue trop mécanique. Je préfère qu’on reparte sur une vraie conversation, pas sur un relevé de mes variables internes.';
    }
    if (plan?.act === 'conversation_feedback') {
      return 'Oui, cette réponse était mauvaise : trop mécanique et pas assez liée à ce que tu venais de dire. Je corrige le tir. Reprends simplement ta question, je te réponds normalement.';
    }
    if (plan?.act === 'report_risks') {
      const lesson = cleanFact('Leçon utile : ');
      const hypothesis = cleanFact('Hypothèse récente : ');
      if (lesson && hypothesis) return `Le point de vigilance principal, c’est ${lesson}. Et je garde aussi cette hypothèse en tête : ${hypothesis}.`;
      if (lesson || hypothesis) return `Le point de vigilance principal, c’est ${lesson || hypothesis}.`;
      return 'Je ne vois pas de risque précis assez établi pour t’en inventer un.';
    }
    if (plan?.act === 'identity') {
      return 'Je suis AURA : un noyau persistant avec mémoire, intentions, apprentissage et outils. Le modèle de langage m’aide à formuler, mais il ne constitue pas mon identité.';
    }
    if (plan?.semantic_support) return plan.semantic_support;

    const userText = String(plan?.user_text || '').trim();
    const thread = String(plan?.relationship?.last_open_thread || '').trim();
    if (thread) {
      return `Je te suis. Je garde aussi le fil de ce qu’on disait sur ${thread}. Développe ton idée et je te réponds dessus, sans te réciter mon état interne.`;
    }
    if (userText.endsWith('?')) {
      return 'Je te suis. Je n’ai pas encore une réponse assez solide à cette question, mais je préfère rester sur ton sujet plutôt que partir dans un diagnostic hors contexte.';
    }
    return 'Oui, je te suis. Je reste sur ce que tu viens de dire.';
  }
}
