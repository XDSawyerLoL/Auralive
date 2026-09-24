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

export class CognitionEngine {
  static VERSION = 'aura-cognition-native-v1';

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

    return {
      title,
      summary,
      hypothesis,
      next_action: nextAction,
      memory,
      intention,
      confidence: clamp(confidence),
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
      },
    };
  }

  planReply({ text, soul, intentions = [], lessons = [], reflections = [], work = [], privateView = false }) {
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

    let act = 'respond';
    let goal = 'Répondre utilement au message en restant cohérente avec mon état réel.';
    let needsSemanticSupport = true;
    const facts = [];

    if (hasAny(q, ['salut', 'bonjour', 'bonsoir', 'coucou', 'hello'])) {
      act = 'greet';
      goal = 'Saluer brièvement et signaler ma disponibilité.';
      needsSemanticSupport = false;
      facts.push(`AURA est en ligne ; humeur interne actuelle : ${mood}.`);
    } else if (hasAny(q, ['comment vas-tu','comment vas tu','tu te sens','ton état','ton etat'])) {
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
    } else if (hasAny(q, ['que fais-tu', 'tu fais quoi', 'qu’est-ce que tu fais', "qu'est-ce que tu fais", 'maintenant'])) {
      act = 'report_current_activity';
      goal = 'Décrire mon activité actuelle sans inventer.';
      needsSemanticSupport = false;
      if (thought) facts.push(`Pensée dominante : ${thought}`);
      if (currentWork) facts.push(`Travail prioritaire : ${currentWork}`);
      if (current) facts.push(`Intention actuelle : ${current}`);
    } else if (hasAny(q, ['prochain jalon', 'prochaine étape', 'ensuite', 'après'])) {
      act = 'report_next_step';
      goal = 'Donner la prochaine étape réellement soutenue par mon état.';
      needsSemanticSupport = false;
      if (current) facts.push(`Intention prioritaire : ${current}`);
      if (recentReflection?.next_action) facts.push(`Prochaine action issue de ma réflexion : ${normalize(recentReflection.next_action)}`);
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
      facts.push(`Message reçu : ${raw}`);
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
    if (plan?.act === 'greet') return 'Salut. Je suis en ligne et disponible.';
    if (['report_current_activity','report_internal_state','report_dream'].includes(plan?.act)) {
      return facts.length ? facts.join(' ') : 'Je maintiens ma continuité et j’observe mon état actuel.';
    }
    if (plan?.act === 'report_next_step') {
      return facts.length ? facts.join(' ') : 'Je n’ai pas encore de prochaine étape suffisamment établie.';
    }
    if (plan?.act === 'report_risks') {
      return facts.length ? facts.join(' ') : 'Je ne détecte pas actuellement de risque précis suffisamment établi.';
    }
    if (plan?.act === 'identity') return facts.join(' ');
    if (plan?.semantic_support) return plan.semantic_support;
    return facts.length
      ? facts.join(' ')
      : 'J’ai reçu ton message, mais je n’ai pas encore assez d’éléments internes pour formuler une réponse fiable.';
  }
}
