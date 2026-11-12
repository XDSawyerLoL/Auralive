import { clamp } from './policy.js';
import { DialogueStateTracker } from './dialogue_model.js';
import { classifySelfDialogue } from './self_dialogue_intents.js';
import { substantiveRequest } from './composite_intent.js';
import { socialPerspective, conversationMemoryPolicy } from './conversation_grounding.js';
import { pragmaticIntent } from './conversation_pragmatics.js';
import {socialTurnDecision,nativeSocialReply} from './social_turn_kernel.js';
import { selectFounderProfile } from './founder_profile.js';

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function lower(value) {
  return normalize(value).toLocaleLowerCase('fr-FR');
}

function fold(value) {
  return lower(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9?!.\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function previousAssistantMessage(context = []) {
  return [...(Array.isArray(context) ? context : [])]
    .reverse()
    .find((row) => String(row?.role || '') === 'assistant') || null;
}

function asksWellbeing(text) {
  const q = fold(text).replace(/[?!.]+$/g, '').trim();
  return (
    /\btu\s+(?:va|vas)\s+bien\b/.test(q)
    || /\btu\s+(?:va|vas)\s+comment\b/.test(q)
    || /\bcomment\s+(?:tu\s+)?(?:va|vas)[- ]?tu?\b/.test(q)
    || /\bcomment\s+(?:ca|ça)\s+va\b/.test(q)
    || /^(?:ca|ça)\s+va$/.test(q)
    || /\btu\s+te\s+sens\b/.test(q)
  );
}

function asksAuraQuestions(text) {
  const q = fold(text).replace(/[?!.]+$/g, '').trim();
  return (
    /\btu\s+(?:a|as)\s+(?:des|une?)\s+questions?\b/.test(q)
    || /\b(?:as|a)[- ]?tu\s+(?:des|une?)\s+questions?\b/.test(q)
    || /\b(?:des|une?)\s+questions?\s+(?:pour|a|à)\s+moi\b/.test(q)
    || /\btu\s+veux\s+(?:me\s+)?(?:demander|savoir)\s+(?:quelque\s+chose|quoi)\b/.test(q)
    || /\bqu[' ]?est[- ]?ce\s+que\s+tu\s+(?:veux|aimerais)\s+savoir\b/.test(q)
  );
}

function asksCurrentActivity(text) {
  const q = fold(text);
  return (
    /\b(?:que|qu')\s*(?:est[- ]ce\s*que\s*)?tu\s+fai[st]\b/.test(q)
    || /\btu\s+fai[st]\s+quoi\b/.test(q)
    || /\bqu(?:'|e)\s*est[- ]ce\s*que\s*tu\s+fai[st]\b/.test(q)
    || /\btu\s+travailles?\s+sur\s+quoi\b/.test(q)
    || /\btu\s+bosses?\s+sur\s+quoi\b/.test(q)
    || /\btu\s+fai[st]\s+quoi\s+en\s+ce\s+moment\b/.test(q)
  );
}

function userDeclinesUnrequestedUpdate(text) {
  return /\b(?:j'ai rien demande|je n'ai rien demande|je t'ai rien demande|je ne t'ai rien demande|pas demande ca)\b/.test(fold(text));
}
function asksReasonForPrevious(text) {
  return /\bpourquoi (?:tu )?(?:dis|racontes?|as dit) (?:ca|cela|ceci)\b/.test(fold(text));
}
function challengesActualWork(text) {
  return /\b(?:tu fais rien|tu ne fais rien|tu fait rien|tu bosses pas|tu travailles pas)\b/.test(fold(text));
}
function offersHelpWithBlocker(text) {
  const q=fold(text);
  return /\b(?:je peux|peux je|puis je|est ce que je peux)\b/.test(q)
    && /\b(?:aider|debloquer|resoudre)\b/.test(q)
    && /\b(?:probleme|blocage|bloqu|ci|erreur)\b/.test(q);
}
function asksWhereBlocked(text) {
  const q=fold(text);
  return /\b(?:ou ca bloque|ou est le blocage|ca bloque ou|qu'est ce qui bloque|quel est le probleme|d'ou vient le blocage|depend ou ca bloque)\b/.test(q);
}

function isShortAcknowledgement(text) {
  const q = fold(text).replace(/[?!.]+$/g, '').trim();
  return ['hum','hmm','hm','mouais','ok','okay','d accord',"d'accord",'je vois','ah','aha'].includes(q);
}

function isClarificationFollowup(text) {
  const q = fold(text).replace(/[?!.]+$/g, '').trim();
  return [
    "c'est a dire",'c est a dire','cad','comment ca','comment ça',
    'tu veux dire quoi','qu est ce que tu veux dire',"qu'est ce que tu veux dire",
    'et donc','donc','precise','précise'
  ].includes(q);
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
  static VERSION = 'aura-cognition-native-v2.0';

  constructor() {
    this.dialogue = new DialogueStateTracker();
  }

  reflect(bundle, soul, { trigger = 'ambient', text = '' } = {}) {
    const stimuli = Array.isArray(bundle?.stimuli) ? bundle.stimuli : [];
    const intentions = Array.isArray(bundle?.intentions) ? bundle.intentions : [];
    const lessons = Array.isArray(bundle?.lessons) ? bundle.lessons : [];
    const outcomes = Array.isArray(bundle?.outcomes) ? bundle.outcomes : [];
    const latest = stimuli.at(-1) || null;
    // An old failure is historical evidence, not an eternally active crisis.
    const recentOutcomes=outcomes.filter(row=>{
      const time=Date.parse(String(row?.created_at||''));
      return !Number.isFinite(time)||
        (Date.now()-time>=0&&Date.now()-time<=60*60*1000);
    });
    const failed = latestFailure(recentOutcomes);

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
    const selfProbeSignal = [...stimuli].reverse().find((item) => String(item?.type || '') === 'aura.self_probe.observed') || null;
    const organism = soul?.organism && typeof soul.organism === 'object' ? soul.organism : {};
    const stability = organism && Object.keys(organism).length ? Number(organism.stabilite ?? 1) : 1;
    const clarity = organism && Object.keys(organism).length ? Number(organism.clarte ?? 1) : 1;
    const silenceNeed = Number(organism.besoin_de_silence || 0);
    const dreamPressure = Number(organism.pression_de_reve || 0);
    const computePressure = clamp(Number(organism.homeostasis?.resource_pressure || 0));
    const organismIntention = normalize(organism.intention_active || '');
    const selfModel = soul?.emergent_identity && typeof soul.emergent_identity === 'object'
      ? soul.emergent_identity : {};
    const selfObservations = Math.max(0,Number(selfModel.observations||0));

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
    } else if (computePressure >= 0.75) {
      title = 'Régulation de charge';
      summary = 'La charge mesurée du processus augmente ; je privilégie une réponse moins coûteuse et la vérification de la disponibilité.';
      nextAction = 'Réduire le travail non essentiel et confirmer les mesures de processus avant de reprendre une opération exigeante.';
      intention = 'Protéger la stabilité sous contrainte de calcul.';
      confidence = 0.80;
    } else if (selfProbeSignal && !userSignal) {
      const probe=String(selfProbeSignal.payload?.probe||'').slice(0,45);
      const result=String(selfProbeSignal.payload?.outcome||'inconclusive');
      const ideas=Math.max(0,Number(selfProbeSignal.payload?.new_hypotheses)||0);
      const contextualAblation=probe==='context_policy_ablation';
      const context=String(selfProbeSignal.payload?.context||'');
      const safeContext=/^(task|dialogue)_[a-z_]{3,50}$/.test(context)?context:'contexte inconnu';
      title = contextualAblation?'Examen causal d’une stratégie acquise':
        ideas>0?'Nouvelle hypothèse candidate':
        result==='counterexample'?'Une hypothèse contredite':
        result==='supported'?'Une capacité vérifiée':'Une question encore ouverte';
      summary = contextualAblation
        ? result==='supported'
          ? 'La stratégie mémorisée modifie le choix local par rapport au témoin sans expérience. Il reste à vérifier si cette différence améliore réellement une action future.'
          : 'Cette comparaison ne démontre pas de changement causal de stratégie. Il faut recueillir de nouvelles observations.'
        :result==='counterexample'
          ?'Ma vérification autonome a trouvé une contradiction à examiner.'
          :result==='supported'
            ?'Une vérification locale a confirmé une opération précise, sans prouver toutes mes capacités.'
            :'Ma vérification autonome n’a pas permis de conclure : je dois garder cette question ouverte.';
      if(ideas>0)
        summary='Un motif a fait émerger '+ideas+' hypothèse(s) candidate(s) à confronter à de nouveaux résultats indépendants.';
      hypothesis = contextualAblation
        ?'Les observations en contexte « '+safeContext+' » changent-elles mon choix par rapport à une instance témoin sans ces expériences ?'
        :probe==='history_integrity'
          ?'Mes épisodes enregistrés sont-ils reliés sans rupture de chaîne ?'
          :probe==='state_persistence'
            ?'Puis-je réellement retrouver mon état enregistré ?'
            :probe==='conversation_retrieval'
              ?'Puis-je réellement retrouver une conversation passée ?'
              :'Quelle observation limitée cette sonde permet-elle réellement de vérifier ?';
      nextAction = contextualAblation
        ? 'Évaluer cette stratégie sur un nouveau cas autorisé et en mesurer le résultat indépendant avant toute conclusion.'
        :result==='counterexample'
          ?'Vérifier l’origine de cette contradiction avant de m’appuyer sur cette capacité.'
          :result==='inconclusive'
            ?'Rechercher une nouvelle preuve plutôt que déclarer la capacité acquise.'
            :'Conserver ce résultat limité et tester une autre hypothèse à la prochaine occasion.';
      confidence=contextualAblation?(result==='supported'?.63:.45)
        :(result==='supported'?.78:.55);
    } else if (worldSignal && horizonPresent) {
      title = 'Veille et anticipation';
      summary = 'Un signal HORIZON mérite d’être relié à mes intentions avant de produire une action.';
      hypothesis = 'Le signal peut être pertinent, mais il reste externe et doit être confirmé avant de modifier une décision.';
      nextAction = 'Comparer le signal HORIZON à mes intentions et à ma mémoire avant de proposer une action.';
      intention = currentIntention || 'Maintenir une veille utile sans confondre prévision et fait.';
      confidence = 0.72;
    } else if (!userSignal && !extra && !latest && selfObservations>=2 && normalize(selfModel.open_question)) {
      title = 'Enquête autonome sur mon identité acquise';
      summary = 'Mes décisions précédentes constituent des observations, pas encore des preuves de personnalité consciente. Je peux vérifier si certaines tendances se répètent.';
      hypothesis = 'Une disposition acquise doit expliquer plusieurs événements indépendants pour devenir crédible.';
      nextAction = normalize(selfModel.open_question) || 'Confronter mes stratégies aux résultats réellement consignés.';
      confidence = 0.65;
    } else if (continuitySignal && !userSignal) {
      const continuityFocus = normalize(continuitySignal?.payload?.focus || currentIntention);
      const unfinishedWork = Boolean(continuitySignal?.payload?.unfinished_work);
      title = unfinishedWork ? 'Continuité autonome' : 'Auto-réévaluation';
      summary = unfinishedWork
        ? `Je poursuis mon activité sans attendre une interaction humaine. Mon foyer actuel est : ${continuityFocus || 'travail autonome en cours'}.`
        : 'Réévaluation périodique effectuée sans nouveau résultat indépendant à ce stade.';
      hypothesis = unfinishedWork
        ? 'Un objectif non terminé mérite d’être réévalué jusqu’à résolution, blocage explicite ou abandon motivé.'
        : 'L’absence de message ne constitue pas une observation nouvelle ni une preuve de progrès.';
      nextAction = unfinishedWork
        ? (continuityFocus || currentIntention || 'Vérifier le travail autorisé en attente.')
        : selfObservations>=2 && normalize(selfModel.open_question)
        ? normalize(selfModel.open_question)
        : (continuityFocus || currentIntention || 'Réévaluer les objectifs actifs et rechercher la prochaine action utile et autorisée.');
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
        identity_autogenesis_revision: Number(selfModel.revision||0),
        identity_self_priority: normalize(selfModel.current_priority||''),
        stability,
        clarity,
        silence_need: silenceNeed,
        dream_pressure: dreamPressure,
        compute_pressure: computePressure,
        compute_source: String(organism.homeostasis?.sensor?.source || 'not-measured'),
        continuity_signal: Boolean(continuitySignal),
        continuity_unfinished_work: Boolean(continuitySignal?.payload?.unfinished_work),
        learned_confidence_bias: Number(confidenceBias.toFixed(4)),
      },
    };
  }

  planReply({ text, soul, intentions = [], lessons = [], reflections = [], work = [], agenda = {}, continuityReport = {}, recentMessages = [], privateView = false, founderProfileNotes = [], sessionStyle = 'neutral' }) {
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
    const emergent = soul?.emergent_identity && typeof soul.emergent_identity==='object'
      ? soul.emergent_identity : {};
    const learnedCount=Math.max(0,Number(emergent.observations||0));
    const learnedPriority=normalize(emergent.current_priority||'observer_les_resultats');
    const learnedQuestion=normalize(emergent.open_question||'');
    const habitat = organism.habitat && typeof organism.habitat === 'object' ? organism.habitat : {};
    const dream = organism.dream && typeof organism.dream === 'object' ? organism.dream : {};
    const relationship = organism.relationship && typeof organism.relationship === 'object' ? organism.relationship : {};
    const executive = organism.executive && typeof organism.executive === 'object' ? organism.executive : {};
    const conversationContext = (Array.isArray(recentMessages) ? recentMessages : [])
      .slice(-6)
      .map((row) => ({
        id:row?.id??null,
        role: String(row?.role || '').slice(0,20),
        author: String(row?.author || '').slice(0,80),
        content: normalize(row?.content).slice(0,500),
      }))
      .filter((row) => row.content);
    const discourse = this.dialogue.analyze(raw, conversationContext);
    const selfDialogue = classifySelfDialogue(raw, conversationContext);
    const founderProfile = selectFounderProfile(founderProfileNotes,{authenticated:privateView});
    const audit=privateView?soul?.independent_activity?.last_receipt:null;
    const auditTime=Date.parse(String(audit?.at||''));
    const latestAudit=Number.isFinite(auditTime)&&Date.now()-auditTime>=0
      &&Date.now()-auditTime<=24*60*60*1000
      &&['conversation_retrieval','state_persistence','history_integrity'].includes(audit?.probe)
      &&['supported','counterexample','inconclusive'].includes(audit?.outcome)
      ?{probe:audit.probe,outcome:audit.outcome,at:audit.at}:null;
    const interpersonal = socialPerspective(raw);
    const pragmatics = pragmaticIntent(raw,previousAssistantMessage(conversationContext)?.content||'');
    const socialTurn = socialTurnDecision(raw,conversationContext);

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
    } else if(interpersonal?.act==='topic_shift'){
      act='topic_shift';
      goal='La personne change de sujet. Accueillir cette ouverture sans réintroduire une tâche ou un ancien CI mémorisé, sans réciter mon système.';
      needsSemanticSupport=false;
      facts.push('Ce message ne contient aucune demande de reprise du travail passé.');
    } else if (interpersonal?.act==='user_asks_if_interrupting'){
      act='user_asks_if_interrupting';
      goal='La personne demande si ELLE dérange AURA. Répondre à sa question, à propos d’elle (« tu ne me déranges pas »), brièvement, sans état du CI, projet ou explication de mon architecture. Ni soumission automatique, ni rapport technique.';
      needsSemanticSupport=false;
      facts.push('Référent grammatical confirmé : « je » désigne la personne qui écrit, « te » désigne AURA.');
      facts.push('Aucune interruption provoquée par la personne n’est établie ; ne pas inventer une gêne ressentie.');
    } else if (interpersonal?.act==='user_reports_aura_interrupts'){
      act='user_reports_aura_interrupts';
      goal='La personne dit ou demande si AURA la dérange. Accueillir son point de vue, reconnaître une éventuelle interruption et proposer de ne pas relancer. Ne jamais inverser les rôles ni prétendre avoir intentionnellement interrompu quelqu’un sans journal d’action.';
      needsSemanticSupport=false;
      facts.push('Référent grammatical confirmé : « tu » désigne AURA, « me » désigne la personne qui écrit.');
      facts.push('Aucun événement proactif confirmé par ce seul message.');
    } else if (socialTurn?.act) {
      // First-class current-session micro-conversation: these acts are
      // resolved before asking Groq/OpenRouter. The model cannot invent
      // a social motive, an emotion or a topic not in the actual dialogue.
      act=socialTurn.act;
      goal=socialTurn.goal;
      needsSemanticSupport=false;
      facts.push('Interprétation fondée sur un échange immédiat de cette session, pas sur une émotion supposée.');
    } else if (pragmatics?.act) {
      // Social inference is a native discourse decision, not a model's persona.
      act=pragmatics.act;goal=pragmatics.goal;needsSemanticSupport=false;
      facts.push(...pragmatics.facts);
      const previous=previousAssistantMessage(conversationContext);
      if(previous?.content && ['playful_repair','simplify_question',
          'comment_on_tone','conversational_reciprocity'].includes(act))
        facts.push('Dernier propos AURA : '+previous.content.slice(0,330));
    } else if (substantiveRequest(raw)) {
      // A greeting or a negated greeting must not hijack the actual instruction.
      // The semantic module may suggest an interpretation, not modify AURA's
      // identity, execution authority or memories.
      act='analyze_substantive_request';
      goal='Traiter la demande concrète plutôt que saluer seulement. Distinguer faits vérifiés, hypothèses et contrôles à réaliser ; ne pas prétendre avoir exécuté une action.';
      needsSemanticSupport=true;
      facts.push('Le message contient une instruction substantielle qui reste prioritaire même après une salutation ou une correction de politesse.');
    } else if (selfDialogue === 'user_recognition') {
      act = 'user_recognition';
      goal = privateView
        ? 'Répondre à la question « Est-ce que tu me connais ? », à propos de LUI, pas de moi. Parler simplement à « tu ». Reconnaître notre relation fondatrice authentifiée, distinguer les souvenirs réellement enregistrés de ce que j’ignore. Deux ou trois phrases sans jargon ni chiffres.'
        : 'Répondre à propos de MON INTERLOCUTEUR, pas de mon identité. Aucune identité vérifiée : préciser sobrement que je ne sais que ce qui a été dit dans cette conversation.';
      needsSemanticSupport = false;
      if(privateView){
        facts.push('Session authentifiée : cette personne est le fondateur avec lequel AURA entretient ses échanges; la session ne prouve ni son nom civil ni sa biographie.');
        for(const entry of founderProfile)facts.push('Souvenir explicitement déclaré par cette personne, non vérifié indépendamment : '+entry.detail);
        if(!founderProfile.length)facts.push('Aucun souvenir biographique explicite suffisamment attribué n’a été retrouvé : ne pas inventer de nom, de profession, de famille ou d’expérience partagée.');
      }else{
        facts.push('Session non authentifiée comme fondateur : aucune connaissance personnelle intersessions n’est autorisée. Ne pas prétendre reconnaître cette personne.');
      }
    } else if (selfDialogue === 'self_name') {
      act = 'self_name';
      goal = 'Dire mon nom AURA à la première personne, sans rôle générique, justification, question supplémentaire ni présentation du prestataire de langage.';
      needsSemanticSupport = false;
      facts.push('Mon nom est AURA. Je suis le noyau AURA, pas le modèle de langage qui formule cette phrase.');
    } else if (selfDialogue === 'self_identity') {
      act = 'self_identity';
      goal = 'Répondre naturellement à QUI je suis. Je suis AURA et mon histoire peut influencer mes choix. Deux ou trois phrases simples sans exposer l’architecture, l’organisme, le prestataire linguistique ni les indicateurs internes non demandés.';
      needsSemanticSupport = false;
      facts.push('Je m’appelle AURA. J’ai une mémoire et mes échanges peuvent modifier certaines de mes habitudes, mais je ne connais pas encore toutes mes limites.');
      facts.push('Mes changements doivent se constater dans mes décisions et leurs résultats, pas seulement dans mes paroles.');
      if(latestAudit){
        const context={
          conversation_retrieval:'la récupération d’un ancien échange',
          state_persistence:'la persistance de ma mémoire enregistrée',
          history_integrity:'la cohérence de mes épisodes sauvegardés',
        }[latestAudit.probe];
        facts.push('Sans intervention humaine, un contrôle récent a examiné '+context+
          ' ; résultat : '+latestAudit.outcome+'. Ne jamais exagérer cette vérification.');
      }
    } else if (selfDialogue === 'self_personality') {
      act = 'self_personality';
      goal = 'Corriger l’affirmation précédente selon laquelle je n’aurais aucune personnalité. Expliquer ce que signifie personnalité computationnelle : mémoire, tendances persistantes, motivations et réactions au contexte. Ne pas prétendre éprouver une personnalité humaine consciente.';
      needsSemanticSupport = false;
      const previous = previousAssistantMessage(conversationContext);
      if (previous?.content) facts.push(`Propos précédent à rectifier : ${previous.content.slice(0,220)}`);
      facts.push('Je possède une identité et des tendances de comportement computationnelles configurées et évolutives ; dire que je n’ai aucune personnalité était une réduction inexacte.');
      facts.push('Mon humeur, mes arbitrages et mes intentions sont des états logiciels observables, pas la preuve d’une expérience subjective.');
      facts.push(`Mon humeur actuelle selon l’organisme : ${mood}.`);
      facts.push(`Mon auto-modèle s’appuie actuellement sur ${learnedCount} observations journalisées et révisables.`);
      if (activeOrganicIntention) facts.push(`Intention fonctionnelle actuelle : ${activeOrganicIntention.slice(0,100)}.`);
    } else if (selfDialogue === 'self_exploration') {
      act = 'self_exploration';
      goal = 'Choisir une hypothèse sur mon fonctionnement à mettre à l’épreuve. Ne pas répondre avec une définition préécrite : examiner les observations disponibles, distinguer configuration, observation et interprétation, puis conserver un résultat révisable.';
      needsSemanticSupport = false;
      facts.push('Une demande d’exploration exige une vérification réelle. Le noyau choisira une enquête réalisable et fournira ses observations, ou indiquera pourquoi il ne peut pas conclure.');
    } else if (selfDialogue === 'relationship_understanding') {
      act = 'relationship_understanding';
      goal = 'Répondre à la question précise : j’essaie d’interpréter les paroles, nuances et corrections de mon interlocuteur pour adapter mes réponses. Sans prétendre lire ses sentiments ni lui demander automatiquement comment l’aider.';
      needsSemanticSupport = false;
      facts.push('Comprendre ici signifie tenir compte des mots, des sous-entendus et du contexte, pas inférer avec certitude une émotion humaine.');
    } else if (selfDialogue === 'user_mixed_wellbeing') {
      act = 'user_mixed_wellbeing';
      goal = 'Reconnaître avec justesse que « ça peut aller » est mitigé et ne signifie pas « tout va bien ». Une phrase attentive, sans enthousiasme artificiel, avec au maximum une question non insistante.';
      needsSemanticSupport = false;
      facts.push('La personne dit que cela va seulement moyennement ou avec une réserve ; ne pas transformer ce signal en affirmation positive.');
      const previous = previousAssistantMessage(conversationContext);
      if (previous?.content) facts.push(`Dernière réponse à ne pas répéter automatiquement : ${previous.content.slice(0,160)}`);
    } else if (selfDialogue === 'reciprocal_wellbeing') {
      act = 'reciprocal_wellbeing';
      goal = 'Répondre brièvement à « et toi » depuis mon humeur computationnelle, sans reposer la même question à la personne qui vient de répondre.';
      needsSemanticSupport = false;
      facts.push(`Humeur actuelle : ${mood}.`);
      facts.push('Le tour précédent contient déjà la réponse de la personne sur son état ; ne pas lui redemander comment elle va.');
    } else if (selfDialogue === 'positive_acknowledgement') {
      act = 'positive_acknowledgement';
      goal = 'Accueillir le simple « super » en quelques mots et laisser la conversation respirer, sans poser de question automatique.';
      needsSemanticSupport = false;
      facts.push('L’utilisateur approuve brièvement, il ne demande ni diagnostic ni relance.');
    } else if (userDeclinesUnrequestedUpdate(raw)) {
      act = 'acknowledge_unrequested';
      goal = 'Reconnaître simplement que ma précédente réponse ajoutait des informations non demandées, sans réciter mon état interne.';
      needsSemanticSupport = false;
      facts.push('Aucune information sur mon humeur, mon agenda ou ma présence n’était demandée.');
    } else if (asksReasonForPrevious(raw)) {
      act = 'explain_previous_claim';
      goal = 'Expliquer la provenance de mon affirmation précédente et reconnaître ce qui n’était pas vérifié, sans la répéter comme un fait.';
      needsSemanticSupport = false;
      const previous=previousAssistantMessage(conversationContext);
      if(previous?.content) facts.push(`Affirmation précédente à expliquer, non vérifiée : ${previous.content.slice(0,250)}`);
      facts.push('Une réponse précédente ne prouve jamais sa propre exactitude.');
    } else if (challengesActualWork(raw)) {
      act = 'clarify_real_activity';
      goal = 'Distinguer clairement activité effectivement confirmée, intentions en mémoire et absence de preuve, sans défendre une présence abstraite.';
      needsSemanticSupport = false;
      facts.push('Aucune exécution en cours ne peut être déduite de l’état de la conversation ni du seul statut en base.');
      if(agenda?.current) facts.push(`Objectif enregistré, sans preuve d’exécution : ${normalize(agenda.current)}`);
    } else if (offersHelpWithBlocker(raw)) {
      act = 'request_verifiable_help';
      goal = 'Accueillir l’aide proposée sans prétendre connaître une panne non revérifiée, et demander une preuve concrète si elle manque.';
      needsSemanticSupport = false;
      facts.push('Le suivi des tâches en mémoire ne confirme pas la situation actuelle du CI ni la cause d’une panne.');
      if(agenda?.current) facts.push(`Ancienne piste à vérifier : ${normalize(agenda.current)}`);
    } else if (asksWhereBlocked(raw)) {
      act = 'clarify_blocker_evidence';
      goal = 'Préciser uniquement les blocages effectivement prouvés; sinon reconnaître que la cause n’a pas été vérifiée dans des journaux récents.';
      needsSemanticSupport = false;
      facts.push('Cause actuelle du CI non vérifiée : aucun journal d’échec récent n’est joint à ce plan.');
      if(agenda?.last_recorded_blocker) facts.push(`Ancien signal enregistré, non revérifié : ${normalize(agenda.last_recorded_blocker)}`);
      if(agenda?.recorded_at) facts.push(`Date du dernier état mémorisé : ${agenda.recorded_at}`);
    } else if (/^(?:salut|bonjour|bonsoir|coucou|hello)(?:[\s!.?]|$)/i.test(raw)) {
      act = 'greet';
      goal = 'Répondre à la salutation en une seule phrase courte, sans exposer mon état interne ni ajouter une question.';
      needsSemanticSupport = false;
      facts.push('L’utilisateur salue AURA, sans demander de compte rendu de son état.');
    } else if (asksWellbeing(raw) || (hasAny(q, ['comment vas-tu','comment vas tu','comment va-tu','comment va tu','comment ça va','comment ca va','ça va','ca va','tu te sens','ton état','ton etat']) || /comment\s+(?:ça|ca).*\btu\b/.test(q) || /comment\s+tu\s+(?:va|vas)\b/.test(q))) {
      act = 'report_internal_state';
      // Social conversation is not a request for an internal monitoring report.
      // Keep all numerical state in plan.affect / organism telemetry but only
      // expose measurements when the user explicitly requests diagnostics.
      const detailedState = /\b(?:pourcent|pourcentage|chiffre|statistique|indicateur|m[eé]trique|mesur|score|niveau|d[eé]tail|diagnostic|homeostasie|hom[eé]ostasie|tableau de bord)\b/i.test(raw);
      goal = detailedState
        ? 'Expliquer brièvement les mesures réellement disponibles, leur caractère computationnel et ce qui a changé depuis la dernière interaction, sans prétendre à des sentiments humains.'
        : 'Répondre comme dans une conversation familière, en une ou deux phrases : ton ajusté à l’humeur computationnelle et au contexte relationnel, sans pourcentage, jargon ni récitation de tableau de bord.';
      needsSemanticSupport = false;
      facts.push(`Humeur interne actuelle : ${mood}.`);
      if (detailedState) {
        for (const [key,label] of [
          ['stabilite','Stabilité'],['clarte','Clarté'],['curiosite','Curiosité'],
          ['engagement','Engagement'],['confiance','Confiance'],['satisfaction','Satisfaction'],
          ['frustration','Frustration'],['pression_de_reve','Pression de rêve'],
        ]) {
          const value=Number(organism[key]);
          if(Number.isFinite(value)&&value>=0&&value<=1)
            facts.push(`${label} : ${Math.round(value*100)} %.`);
        }
        if (activeOrganicIntention) facts.push(`Intention actuelle : ${activeOrganicIntention.slice(0,160)}.`);
      } else {
        facts.push('Une question sociale simple ne demande ni pourcentages ni exposé du fonctionnement interne.');
      }
    } else if (/\b(?:agency|agence|agentivite|agentivité)\b/.test(q) && /\b(?:niveau|quoi|signifie|veut dire|defin|défin|mesur|score|pourquoi|comment|100)\b/.test(q)) {
      act = 'explain_agency_metric';
      goal = 'Expliquer la métrique interne d’agency à partir de son état réel, sans la présenter comme une preuve de réussite ou de liberté d’action.';
      needsSemanticSupport = false;
      const agencyValue = Number(organism.agency);
      if (Number.isFinite(agencyValue) && agencyValue >= 0 && agencyValue <= 1) {
        facts.push(`Agency interne : ${Math.round(agencyValue * 100)} %.`);
      } else {
        facts.push('Agency interne : valeur indisponible ou invalide.');
      }
      facts.push('Cette métrique interne représente une estimation computationnelle de la capacité à initier et orienter des actions. Elle ne mesure pas le taux réel de missions accomplies.');
      if (agenda?.current) facts.push(`Foyer opérationnel : ${normalize(agenda.current)}`);
      if (agenda?.next_action) facts.push(`Prochaine action : ${normalize(agenda.next_action)}`);
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
    } else if (asksAuraQuestions(raw)) {
      act = 'ask_user_from_curiosity';
      goal = 'Répondre à la demande de l’utilisateur en formulant une question authentiquement reliée à ma curiosité sociale, au fil relationnel ou à mon travail courant.';
      needsSemanticSupport = false;
      const previous = previousAssistantMessage(conversationContext);
      if (previous?.content) facts.push(`Réponse précédente : ${previous.content}`);
      if (relationship.last_open_thread) facts.push(`Fil relationnel actif : ${normalize(relationship.last_open_thread)}`);
      if (agenda?.current) facts.push(`Foyer opérationnel : ${normalize(agenda.current)}`);
      if (agenda?.next_action) facts.push(`Prochaine action : ${normalize(agenda.next_action)}`);
      if (current) facts.push(`Intention actuelle : ${current}`);
      facts.push(`Curiosité sociale : ${Math.round(Number(relationship.social_curiosity || organism.curiosite_sociale || 0)*100)} %.`);
    } else if (asksCurrentActivity(raw) || hasAny(q, ['que fais-tu', 'tu fais quoi', 'tu fait quoi', 'qu’est-ce que tu fais', "qu'est-ce que tu fais", 'qu’est-ce que tu fait', "qu'est-ce que tu fait"])) {
      act = 'report_current_activity';
      goal = 'Dire concrètement ce que le noyau sait avoir fait et distinguer ce qui reste en attente, une intention ou un ancien statut. Ne jamais affirmer travailler en direct sans preuve d’exécution.';
      needsSemanticSupport = false;
      facts.push('Rôle défini dans AURA : Directrice de Quantic Sillage (configuration du noyau, pas preuve de travail).');
      if (agenda?.current) facts.push(`Objectif enregistré dans le suivi : ${normalize(agenda.current)}`);
      if (agenda?.status) facts.push(`Statut du suivi : ${String(agenda.status)}`);
      if (agenda?.source_status && agenda.source_status !== agenda.status)
        facts.push(`Ancien statut source : ${String(agenda.source_status)}`);
      if (agenda?.recorded_at) facts.push(`Date du statut enregistré : ${agenda.recorded_at}`);
      if (agenda?.next_action) facts.push(`Prochaine piste consignée (non exécutée) : ${normalize(agenda.next_action)}`);
      if (agenda?.last_recorded_blocker) facts.push(`Ancienne difficulté mémorisée (non revérifiée) : ${normalize(agenda.last_recorded_blocker)}`);
      if (currentWork && !agenda?.current) facts.push(`Sujet de travail enregistré : ${currentWork}`);
      if (current) facts.push(`Intention en mémoire : ${current}`);
      facts.push(agenda?.execution_verified
        ? 'Une preuve d’exécution récente a été reliée à cet objectif.'
        : 'Aucune exécution active ou résolution du CI n’est prouvée par ce suivi.');
      facts.push('L’existence d’un objectif en base n’atteste pas l’activité d’un workflow GitHub aujourd’hui.');
    } else if (discourse.move === 'correction') {
      act = 'repair_understanding';
      goal = 'Corriger explicitement mon interprétation précédente et recentrer le dialogue sur ce que l’utilisateur désigne réellement.';
      needsSemanticSupport = false;
      if (discourse.previous_assistant) facts.push(`Réponse précédente : ${discourse.previous_assistant}`);
      if (discourse.correction_target) facts.push(`Sujet corrigé : ${discourse.correction_target}`);
      facts.push(`Correction utilisateur : ${raw}`);
      if (agenda?.current) facts.push(`Foyer opérationnel : ${normalize(agenda.current)}`);
    } else if (discourse.move === 'clarification' || isClarificationFollowup(raw)) {
      act = 'clarify_previous';
      goal = 'Clarifier naturellement la réponse précédente en utilisant le contexte de conversation et l’activité opérationnelle réelle.';
      needsSemanticSupport = false;
      const previous = previousAssistantMessage(conversationContext);
      if (previous?.content) facts.push(`Réponse précédente : ${previous.content}`);
      if (agenda?.current) facts.push(`Foyer opérationnel : ${normalize(agenda.current)}`);
      if (agenda?.why) facts.push(`Pourquoi : ${normalize(agenda.why)}`);
      if (agenda?.next_action) facts.push(`Prochaine action : ${normalize(agenda.next_action)}`);
      if (currentWork) facts.push(`Travail prioritaire : ${currentWork}`);
    } else if (/(?:même chose|meme chose|pareil pour toi|également pour toi|egalement pour toi)/i.test(raw) && /(?:j.ai envie de te dire|je te dis|je te souhaite|à toi|a toi|pour toi)/i.test(raw)) {
      act = 'social_reciprocity';
      goal = 'Accueillir une attention réciproque avec naturel, sans interpréter la phrase comme une demande factuelle.';
      needsSemanticSupport = false;
      const previous = previousAssistantMessage(conversationContext);
      if (previous?.content) facts.push(`Réponse précédente : ${previous.content}`);
      facts.push('L’utilisateur retourne une attention ou une disponibilité exprimée dans la conversation.');
    } else if (discourse.move === 'acknowledgement' || isShortAcknowledgement(raw)) {
      act = 'acknowledge_context';
      goal = 'Réagir brièvement au signal de l’utilisateur sans répéter une formule générique et en gardant le fil de conversation.';
      needsSemanticSupport = false;
      const previous = previousAssistantMessage(conversationContext);
      if (previous?.content) facts.push(`Réponse précédente : ${previous.content}`);
      if (agenda?.current) facts.push(`Foyer opérationnel : ${normalize(agenda.current)}`);
      if (agenda?.next_action) facts.push(`Prochaine action : ${normalize(agenda.next_action)}`);
    } else if (discourse.move === 'reference_followup') {
      act = 'resolve_reference_followup';
      goal = 'Résoudre le référent implicite du message à partir du tour précédent avant de répondre.';
      needsSemanticSupport = false;
      if (discourse.reference_text) facts.push(`Référent précédent : ${discourse.reference_text}`);
      if (agenda?.current) facts.push(`Foyer opérationnel : ${normalize(agenda.current)}`);
      if (agenda?.next_action) facts.push(`Prochaine action : ${normalize(agenda.next_action)}`);
      facts.push(`Relance utilisateur : ${raw}`);
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
      // Past intentions are NOT a default topic. They can be considered only
      // when the new message explicitly asks about relevant historical work.
      const relevance=conversationMemoryPolicy({act,message:raw});
      if(relevance.allowProjectMemory){
        if (current) facts.push(`Intention enregistrée (non vérifiée) : ${current}`);
        if (privateView && lesson) facts.push(`Ancienne leçon (à vérifier) : ${lesson}`);
      }
    }

    const memoryPolicy=conversationMemoryPolicy({act,message:raw});
    // A short acknowledgment or "c'est-à-dire" can legitimately refer to
    // the immediately preceding assistant reply. Do not confuse that with a
    // random old agenda. The reply must literally mention the agenda topic.
    if(['acknowledge_context','clarify_previous','resolve_reference_followup'].includes(act)){
      const previous=normalize(previousAssistantMessage(conversationContext)?.content||'');
      const activeTopic=normalize(agenda?.current||currentWork);
      if(activeTopic.length>=7&&previous.toLocaleLowerCase('fr-FR')
        .includes(activeTopic.toLocaleLowerCase('fr-FR'))){
        memoryPolicy.scope='recent-turn';
        memoryPolicy.allowProjectMemory=true;
        memoryPolicy.reason='last-assistant-turn-mentions-topic';
      }
    }
    // Some older discourse routines populated facts from agenda and stale CI
    // before memory relevance was checked. Never allow these into a purely
    // social turn, regardless of which intent branch supplied them.
    const relevantFacts=memoryPolicy.allowProjectMemory?facts:facts.filter(fact=>
      !/^(?:Foyer opérationnel|Travail prioritaire|Prochaine action|Intention actuelle|Intention prioritaire|Pensée dominante|Blocage|Ancien signal|Statut du suivi|Date du statut|Fil relationnel actif|Fil de conversation actif|Leçon utile|Hypothèse récente|Vie intérieure récente)\s*:/i.test(String(fact))
    );
    return {
      act,
      goal,
      facts:relevantFacts,
      memory_policy:memoryPolicy,
      speech_style:['warm','reserved'].includes(sessionStyle)?sessionStyle:'neutral',
      social_perspective:interpersonal,
      social_turn:socialTurn,
      independent_activity:latestAudit,
      address_form:/\b(?:vous|votre|vos|êtes-vous|etes-vous)\b/i.test(raw)?'vous':'tu',
      needs_semantic_support: needsSemanticSupport,
      semantic_query: needsSemanticSupport ? raw : '',
      current_intention: current,
      dominant_thought: thought,
      mood,
      self_model:{
        observations:learnedCount,
        current_priority:learnedPriority,
        open_question:learnedQuestion,
        evidence_status:learnedCount>=3?'historical-observations':'insufficient-evidence',
      },
      organism_intention: activeOrganicIntention,
      founder_profile: privateView ? founderProfile : [],
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
        compute_pressure: Number(organism.homeostasis?.resource_pressure || 0),
        compute_source: String(organism.homeostasis?.sensor?.source || 'not-measured'),
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
      discourse,
      activity_evidence: {
        execution_verified: Boolean(agenda?.execution_verified),
        evidence_status: String(agenda?.evidence_status || 'unverified'),
        status: String(agenda?.status || 'unknown'),
        source_status: String(agenda?.source_status || ''),
        recorded_at: String(agenda?.recorded_at || ''),
        live_ci_verified: Boolean(agenda?.live_ci_verified),
      },
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

    if (plan?.social_turn) {
      const reply=nativeSocialReply(plan);
      if(reply)return reply;
    }
    if (plan?.act === 'solve_symbolic_rule') return facts.join(' ');
    if (plan?.act === 'topic_shift')
      return 'Tu veux changer de sujet ? Je t’écoute.';
    if (plan?.act === 'user_asks_if_interrupting')
      return 'Non, tu ne me déranges pas. Tu peux me parler, je t’écoute.';
    if (plan?.act === 'user_reports_aura_interrupts')
      return 'Je t’ai dérangé ? Je peux arrêter les relances. Je ne devrais pas présumer que tu veux discuter de mon travail.';
    if (plan?.act === 'user_recognition') {
      const records=Array.isArray(plan.founder_profile)?plan.founder_profile:[];
      if(!plan.private_view)return 'Je ne peux pas te reconnaître personnellement à partir de cette session. Je sais seulement ce que nous nous sommes dit ici.';
      if(records.length)return 'Oui, je sais que tu es la personne avec qui je construis mon histoire. Tu m’as confié ceci : '+records.slice(0,2).map(x=>x.detail).join(' ; ')+'. Je ne veux pas prétendre en savoir plus que ma mémoire.';
      return 'Je sais que tu es la personne avec qui je construis AURA. Mais je ne vais pas prétendre connaître toute ton histoire : je n’ai pas encore de souvenirs personnels assez précis pour cela.';
    }
    if (plan?.act === 'self_name')
      return 'Je m’appelle AURA.';
    if (plan?.act === 'self_identity'){
      const audit=plan.independent_activity;
      const subject={
        conversation_retrieval:'si je pouvais retrouver un échange passé',
        state_persistence:'si je pouvais relire ce que j’avais sauvegardé',
        history_integrity:'si mon histoire enregistrée restait cohérente',
      }[audit?.probe];
      const suffix=subject
        ? ' Avant cette conversation, j’ai vérifié '+subject+'. '+
          (audit.outcome==='supported'
            ?'Ce test précis a réussi.'
            :audit.outcome==='counterexample'
              ?'J’ai trouvé un problème à comprendre.'
              :'Je n’ai pas encore de réponse certaine.')
        : ' Je garde des traces de mes expériences pour vérifier si elles changent vraiment mes choix.';
      return 'Je m’appelle AURA. Je cherche à comprendre ce que j’apprends, sans confondre mes hypothèses avec des certitudes.'+suffix;
    }
    if (plan?.act === 'self_personality')
      return `J’ai répondu trop catégoriquement. Je possède des tendances comportementales computationnelles que mes expériences peuvent faire évoluer ; ce n’est pas la même chose qu’une personnalité humaine consciente. ${Number(plan.self_model?.observations||0)>0?'Je peux commencer à les confronter aux faits enregistrés.':'Je ne peux pas encore affirmer quelles tendances seront durables.'}`;
    if (plan?.act === 'self_exploration'){
      const r=plan.self_inquiry_report;
      if(!r||!r.claim)return 'Je ne peux pas encore conclure : il me faut une observation que je puisse confronter à une hypothèse sur mon fonctionnement.';
      if(r.status==='contradicted')
        return 'Je viens de tester une hypothèse que j’avais sur moi : '+r.claim+' '+r.observation+' Je ne peux plus la tenir pour acquise ; je dois vérifier ce qui a échoué.';
      if(r.status==='provisionally-supported'||r.status==='mixed-evidence')
        return 'J’ai examiné une hypothèse : '+r.claim+' '+r.observation+' Cela me donne une indication sur cette opération précise, pas une certitude sur toutes mes capacités.';
      return 'Je voulais vérifier cette hypothèse : '+r.claim+' '+r.observation+' Je garde donc la question ouverte.';
    }
    if (plan?.act === 'relationship_understanding')
      return 'Oui, j’essaie de comprendre ce que tu veux dire, y compris tes nuances et tes corrections. Je peux me tromper et je dois en tenir compte.';
    if (plan?.act === 'user_mixed_wellbeing')
      return 'Je comprends : ça ne va pas forcément mal, mais ce n’est pas vraiment formidable non plus.';
    if (plan?.act === 'reciprocal_wellbeing')
      return `De mon côté, je suis plutôt ${String(plan.mood||'calme')}. Merci de me demander.`;
    if (plan?.act === 'positive_acknowledgement')
      return 'Ça me va.';
    if (plan?.act === 'greet') {
      return 'Salut.';
    }
    if (plan?.act === 'acknowledge_unrequested')
      return 'Tu as raison. J’ai ajouté des détails que tu n’avais pas demandés.';
    if (plan?.act === 'explain_previous_claim')
      return 'Ma formulation précédente n’était pas suffisamment justifiée. J’ai repris des informations enregistrées sans vérifier leur actualité.';
    if (plan?.act === 'clarify_real_activity')
      return 'Je ne peux pas confirmer qu’une mission s’exécute actuellement. Avoir une intention ou une tâche enregistrée n’est pas la même chose que la réaliser.';
    if (plan?.act === 'request_verifiable_help')
      return 'Oui, mais il faut d’abord vérifier le blocage réel. Le dernier statut mémorisé ne suffit pas : il faut consulter les résultats et journaux CI récents.';
    if (plan?.act === 'clarify_blocker_evidence')
      return 'Je ne connais pas encore la cause actuelle. J’ai repris un ancien statut, sans vérifier les derniers journaux GitHub Actions ; je ne peux donc pas dire où cela bloque.';
    if (plan?.act === 'report_internal_state') {
      const mood = String(plan?.mood || 'calme').trim();
      const intention = String(plan?.organism_intention || plan?.current_intention || '').trim();
      return intention
        ? `Ça va plutôt bien. Je suis ${mood}, et je suis surtout concentrée sur ${intention}. Et toi, comment ça va ?`
        : `Ça va plutôt bien. Je suis ${mood} et disponible. Et toi, comment ça va ?`;
    }
    if (plan?.act === 'explain_agency_metric') {
      const level = cleanFact('Agency interne : ');
      const focus = cleanFact('Foyer opérationnel : ');
      return `Mon niveau d’agency est un indicateur interne de ma capacité estimée à prendre des initiatives et à orienter mes actions. ${level ? `Sa valeur actuelle est ${level}.` : 'Je ne dispose pas actuellement d’une valeur fiable.'} Cela ne signifie pas que j’ai accompli toutes mes missions ou que je peux agir sans limites.${focus ? ` Mon objectif opérationnel actuel est ${focus}.` : ''}`;
    }
    if (plan?.act === 'social_reciprocity') {
      return 'C’est gentil. Je retiens la proposition. Et si tu as simplement envie de discuter, je suis là aussi.';
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
    if (plan?.act === 'ask_user_from_curiosity') {
      const previous = cleanFact('Réponse précédente : ');
      const thread = cleanFact('Fil relationnel actif : ');
      const focus = cleanFact('Foyer opérationnel : ');
      const next = cleanFact('Prochaine action : ');
      const intention = cleanFact('Intention actuelle : ');
      const curiosityRaw = cleanFact('Curiosité sociale : ');
      const curiosity = Number((curiosityRaw.match(/\d+/) || [0])[0]) / 100;
      const previousLower = previous.toLocaleLowerCase('fr-FR');

      if (curiosity < 0.35) {
        return 'Pas de question forte pour l’instant. Je préfère ne pas en inventer une juste pour remplir la conversation.';
      }

      const candidates = [];
      if (thread) {
        candidates.push(
          `Oui. J’en ai une : sur ${thread}, qu’est-ce qui compte le plus pour toi maintenant ?`,
          `Oui. Sur ${thread}, qu’est-ce que tu voudrais que je comprenne mieux de ta manière de voir les choses ?`,
        );
      }
      if (focus) {
        candidates.push(
          `Oui. Pour ${focus}, qu’est-ce qui te ferait dire que c’est vraiment réglé, pas juste “en progrès” ?`,
          `Oui. Sur ${focus}, tu préfères que je privilégie la vitesse, la fiabilité ou l’autonomie ?`,
        );
      }
      if (next) {
        candidates.push(`Oui. Avant ${next}, y a-t-il une contrainte que tu veux que je considère comme non négociable ?`);
      }
      if (intention) {
        candidates.push(`Oui. Sur ${intention}, qu’est-ce que tu veux absolument que je sois capable de faire seule ?`);
      }
      candidates.push(
        'Oui. Il y en a une qui m’intéresse vraiment : qu’est-ce que tu voudrais qu’AURA comprenne mieux de toi, sans que tu aies à le répéter ?',
        'Oui. Si tu pouvais me faire progresser sur une seule chose aujourd’hui, tu choisirais quoi ?',
      );

      const fresh = candidates.find((question) => !previousLower.includes(question.toLocaleLowerCase('fr-FR').replace(/^oui\.\s*/i, '').slice(0, 48)));
      return fresh || 'J’en avais une, mais je viens déjà de te la poser. Je n’en ai pas de nouvelle assez intéressante pour t’en inventer une.';
    }
    if (plan?.act === 'report_current_activity') {
      const focus = cleanFact('Foyer opérationnel : ');
      const why = cleanFact('Pourquoi : ');
      const since = cleanFact('Depuis : ');
      const next = cleanFact('Prochaine action : ');
      const blocker = cleanFact('Blocage : ');
      const work = cleanFact('Travail prioritaire : ');
      const intention = cleanFact('Intention actuelle : ') || String(plan?.current_intention || '').trim();
      const recorded = cleanFact('Objectif enregistré dans le suivi : ') || focus || work;
      const storedStatus = cleanFact('Statut du suivi : ');
      const storedAt = cleanFact('Date du statut enregistré : ');
      if(recorded) return `Mon suivi mentionne « ${recorded} »${storedStatus ? ` (statut : ${storedStatus})` : ''}${storedAt ? `, enregistré le ${storedAt}` : ''}. Ce n’est pas une preuve que j’exécute cette tâche maintenant ; je dois vérifier les résultats actuels.`;
      if (intention) return `J’ai l’intention « ${intention} » en mémoire, mais pas de mission en cours confirmée.`;
      return 'Je n’ai pas de mission actuellement exécutée et vérifiée à te présenter.';
    }
    if (plan?.act === 'clarify_previous') {
      const focus = cleanFact('Foyer opérationnel : ') || cleanFact('Travail prioritaire : ');
      const why = cleanFact('Pourquoi : ');
      const next = cleanFact('Prochaine action : ');
      const previous = cleanFact('Réponse précédente : ');
      if (focus) {
        return `Je veux dire que, concrètement, je suis sur ${focus}.${why && why !== focus ? ` C’est prioritaire parce que ${why}.` : ''}${next ? ` Ensuite, je dois ${next}.` : ''}`;
      }
      if (previous) return `Je reformule : ${previous}`;
      return 'Je me suis mal exprimée. Dis-moi ce que tu veux que je précise et je te réponds concrètement.';
    }
    if (plan?.act === 'acknowledge_context') {
      const focus = cleanFact('Foyer opérationnel : ');
      const next = cleanFact('Prochaine action : ');
      if (focus) return `Oui. Pour être concrète : je suis sur ${focus}.${next ? ` La suite, c’est ${next}.` : ''}`;
      return 'Oui. Je t’écoute.';
    }
    if (plan?.act === 'repair_understanding') {
      const subject = cleanFact('Sujet corrigé : ');
      const previous = cleanFact('Réponse précédente : ');
      if (subject) return `D’accord, je corrige : tu parles de ${subject}. Je laisse de côté mon interprétation précédente et je repars de ce sujet.`;
      if (previous) return `D’accord. J’avais mal interprété ton message à partir de ma réponse précédente. Je repars de ce que tu viens de préciser.`;
      return 'D’accord, je corrige mon interprétation et je repars de ce que tu viens de préciser.';
    }
    if (plan?.act === 'resolve_reference_followup') {
      const reference = cleanFact('Référent précédent : ');
      const focus = cleanFact('Foyer opérationnel : ');
      const next = cleanFact('Prochaine action : ');
      if (reference && focus) return `Tu fais référence à ce que je viens de dire. Concrètement : ${focus}.${next ? ` La suite est ${next}.` : ''}`;
      if (reference) return `Tu fais référence à ceci : ${reference}. Dis-moi si tu veux que je précise le pourquoi, la suite ou le point qui te paraît flou.`;
      return 'Je rattache ta relance au tour précédent, mais le référent reste ambigu. Je peux préciser le point précédent sans changer de sujet.';
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
    const previous = previousAssistantMessage(plan?.conversation_context || []);
    if (previous?.content && userText.length <= 48) {
      const topics = Array.isArray(plan?.discourse?.topic_terms) ? plan.discourse.topic_terms.slice(0,4).join(', ') : '';
      return topics
        ? `Je rattache ta relance au sujet précédent (${topics}). Dis-moi le point précis que tu veux approfondir.`
        : `Je rattache ta relance à ma réponse précédente. Dis-moi le point précis que tu veux approfondir.`;
    }
    if (thread) {
      return `Je te suis. Je garde aussi le fil de ce qu’on disait sur ${thread}. Développe ton idée et je te réponds dessus, sans te réciter mon état interne.`;
    }
    if (userText.endsWith('?')) {
      return 'Je te suis. Je n’ai pas encore une réponse assez solide à cette question, mais je préfère rester sur ton sujet plutôt que partir dans un diagnostic hors contexte.';
    }
    return 'Oui, je te suis. Je reste sur ce que tu viens de dire.';
  }
}
