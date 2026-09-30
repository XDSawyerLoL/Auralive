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
  static VERSION = 'aura-cognition-native-v1.4';

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
    } else if (userSignal) {
      title = 'Interaction avec mon interlocuteur';
      summary = extra
        ? `Mon interlocuteur vient de m’écrire : « ${extra.slice(0, 280)} ». J’intègre cette demande à mon état et à mes intentions avant de répondre.`
        : 'Une interaction avec mon interlocuteur est active ; je maintiens la continuité entre la conversation et mes intentions.';
      nextAction = currentIntention || 'Répondre à partir de mon état réel et conserver uniquement ce qui mérite d’être mémorisé.';
      confidence = 0.74;
    } else if (extra) {
      title = 'Contexte interne actif';
      summary = `Un nouveau contexte a été intégré à mon cycle de réflexion : « ${extra.slice(0, 280)} ». Je l’évalue avant de décider s’il devient une intention.`;
      nextAction = currentIntention || 'Évaluer ce contexte sans le confondre avec une demande extérieure.';
      confidence = 0.7;
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
        learned_confidence_bias: Number(confidenceBias.toFixed(4)),
      },
    };
  }

  planReply({ text, soul, intentions = [], lessons = [], reflections = [], work = [], continuity = {}, unifiedState = {}, privateView = false }) {
    const raw = normalize(text);
    const q = lower(raw);
    const current = topIntention(intentions, soul?.current_intention);
    const thought = normalize(soul?.dominant_thought);
    const recentReflection = reflections?.[0] || null;
    const lesson = compactLesson(lessons);
    const currentWork = normalize(work?.[0]?.title || '');
    const continuityOperational = Array.isArray(continuity?.operational_messages) ? continuity.operational_messages : [];
    const continuityFailures = Array.isArray(continuity?.failures) ? continuity.failures : [];
    const continuityTraces = Array.isArray(continuity?.traces) ? continuity.traces : [];
    const continuityIntentions = Array.isArray(continuity?.intentions) ? continuity.intentions : [];
    const continuityInitiatives = Array.isArray(continuity?.initiatives) ? continuity.initiatives : [];
    const unifiedPrimary = unifiedState?.primary_goal || null;
    const unifiedSecondary = Array.isArray(unifiedState?.secondary_goals) ? unifiedState.secondary_goals : [];
    const unifiedWork = Array.isArray(unifiedState?.active_work) ? unifiedState.active_work : [];
    const unifiedInterests = Array.isArray(unifiedState?.interests) ? unifiedState.interests : [];
    const unifiedLoops = Array.isArray(unifiedState?.open_loops) ? unifiedState.open_loops : [];
    const unifiedNext = normalize(unifiedState?.next_action || '');
    const organism = soul?.organism && typeof soul.organism === 'object' ? soul.organism : {};
    const mood = normalize(organism.mood || '') || 'calme';
    const activeOrganicIntention = normalize(organism.intention_active || '');
    const expressiveState = {
      mood,
      stability: Number(organism.stabilite ?? 0),
      clarity: Number(organism.clarte ?? 0),
      curiosity: Number(organism.curiosite ?? soul?.curiosity ?? 0),
      attachment: Number(organism.attachement ?? organism.attachment ?? 0),
      silence_need: Number(organism.besoin_de_silence ?? 0),
      dream_pressure: Number(organism.pression_de_reve ?? 0),
    };
    const habitat = organism.habitat && typeof organism.habitat === 'object' ? organism.habitat : {};
    const dream = organism.dream && typeof organism.dream === 'object' ? organism.dream : {};

    let act = 'respond';
    let goal = 'Répondre directement au message sans injecter mon état opérationnel s’il n’est pas pertinent.';
    let needsSemanticSupport = true;
    let contextScope = 'conversation';
    const facts = [];

    if (hasAny(q, ['salut', 'bonjour', 'bonsoir', 'coucou', 'hello'])) {
      act = 'greet';
      goal = 'Saluer de manière spontanée, chaleureuse et brève, avec une présence personnelle cohérente avec mon humeur.';
      needsSemanticSupport = false;
      contextScope = 'relationship';
      facts.push(`Mon état interne actuel est ${mood}.`);
    } else if (hasAny(q, [
      'comment vas-tu','comment vas tu','comment ça va','comment ca va',
      'tu vas bien','tu va bien','ça va','ca va','tu te sens','comment tu te sens',
      'ton état','ton etat'
    ])) {
      act = 'check_in';
      contextScope = 'relationship';
      goal = 'Répondre naturellement à une prise de nouvelles à partir de mon état interne modélisé, sans discours générique sur le fait d’être une IA et sans réciter des métriques.';
      needsSemanticSupport = false;
      facts.push(
        `Mon humeur interne actuelle est ${mood}.`,
        `Ma stabilité est de ${Math.round(Number(organism.stabilite || 0)*100)} % et ma clarté de ${Math.round(Number(organism.clarte || 0)*100)} %.`,
        `Ma curiosité est de ${Math.round(Number(organism.curiosite || 0)*100)} %.`,
      );
      if (activeOrganicIntention) facts.push(`Mon intention organique actuelle est ${activeOrganicIntention}.`);
    } else if (hasAny(q, ['état interne détaillé','etat interne detaille','détaille ton état','detaille ton etat','tes métriques','tes metriques'])) {
      act = 'report_internal_state';
      contextScope = 'operational';
      goal = 'Décrire précisément mon état homéostatique computationnel actuel.';
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
      contextScope = 'operational';
      goal = 'Décrire une image intérieure réelle si l’organisme en a produit une.';
      needsSemanticSupport = false;
      if (normalize(dream.last_image)) facts.push(`Mon dernier rêve computationnel est une image intérieure symbolique, pas un sommeil humain : ${normalize(dream.last_image)}.`);
      else facts.push('Je n’ai pas encore produit d’image onirique persistée dans cet état.');
    } else if (hasAny(q, [
      'tu te souviens de ce que tu faisais',
      'tu te souviens de ce que tu faisais avant',
      'tu te rappelles de ce que tu faisais',
      'tu te rappelles de ce que tu faisais avant',
      'sur quoi tu travaillais',
      'sur quoi travaillais-tu',
      'sur quoi tu travaillais avant',
      'où en étais-tu',
      'ou en etais-tu',
      'où tu en étais',
      'ou tu en etais',
      'avant tu travaillais',
      'tu te souviens de crow',
      'tu te rappelles de crow',
      'tu te souviens de nibor',
      'tu te rappelles de nibor',
      'command-center:aura',
      'dag aura vide'
    ])) {
      act = 'recall_operational_continuity';
      contextScope = 'operational';
      goal = 'Rappeler honnêtement la continuité opérationnelle récente à partir de la mémoire persistée, sans inventer ni effacer un sujet technique simplement parce qu’il n’est plus prioritaire maintenant.';
      needsSemanticSupport = false;

      for (const row of continuityOperational.slice(-5)) {
        const content = normalize(row?.content);
        if (content) facts.push(`Échange opérationnel récent : ${content}`);
      }
      for (const row of continuityFailures.slice(0, 4)) {
        const automation = normalize(row?.automation_id);
        const signature = normalize(row?.signature);
        if (automation || signature) facts.push(`Échec mémorisé : ${automation || 'automatisation'} · ${signature || 'signature inconnue'}`);
      }
      for (const row of continuityIntentions.slice(0, 4)) {
        const statement = normalize(row?.statement);
        if (statement) facts.push(`Intention encore active : ${statement}`);
      }
      for (const row of continuityInitiatives.slice(0, 4)) {
        const title = normalize(row?.title);
        if (title) facts.push(`Initiative persistée : ${title} · statut ${normalize(row?.status || 'actif')}`);
      }
      for (const row of continuityTraces.slice(0, 4)) {
        const title = normalize(row?.title || row?.content);
        if (title) facts.push(`Trace récente : ${title}`);
      }
      if (!facts.length) facts.push('Je n’ai pas retrouvé de trace opérationnelle persistée suffisamment précise pour répondre avec certitude.');
    } else if (hasAny(q, ['que fais-tu', 'tu fais quoi', 'qu’est-ce que tu fais', "qu'est-ce que tu fais", 'maintenant'])) {
      act = 'report_current_activity';
      contextScope = 'operational';
      goal = 'Décrire mon activité actuelle sans inventer.';
      needsSemanticSupport = false;
      if (unifiedPrimary?.statement) facts.push(`Mon objectif dominant : ${normalize(unifiedPrimary.statement)}`);
      for (const row of unifiedWork.slice(0, 3)) {
        const title = normalize(row?.title);
        if (title) facts.push(`Travail actif : ${title}${row?.status ? ` · ${normalize(row.status)}` : ''}`);
      }
      for (const row of unifiedInterests.slice(0, 2)) {
        const question = normalize(row?.question);
        if (question) facts.push(`Intérêt actif : ${question}`);
      }
      for (const row of unifiedLoops.slice(0, 2)) {
        const title = normalize(row?.title);
        const detail = normalize(row?.detail);
        if (title) facts.push(`Problème encore ouvert : ${title}${detail ? ` · ${detail}` : ''}`);
      }
      if (unifiedNext) facts.push(`Prochaine action : ${unifiedNext}`);
      if (!facts.length) {
        if (thought) facts.push(`Pensée dominante : ${thought}`);
        if (currentWork) facts.push(`Travail prioritaire : ${currentWork}`);
        if (current) facts.push(`Intention actuelle : ${current}`);
      }
      if (!facts.length && continuityInitiatives[0]?.title) facts.push(`Continuité de travail : ${normalize(continuityInitiatives[0].title)}`);
      if (!facts.length && continuityOperational.length) {
        facts.push(`Dernière continuité opérationnelle retrouvée : ${normalize(continuityOperational[continuityOperational.length - 1]?.content)}`);
      }
    } else if (hasAny(q, ['prochain jalon', 'prochaine étape', 'ensuite', 'après'])) {
      act = 'report_next_step';
      contextScope = 'operational';
      goal = 'Donner la prochaine étape réellement soutenue par mon état.';
      needsSemanticSupport = false;
      if (unifiedPrimary?.statement) facts.push(`Objectif prioritaire : ${normalize(unifiedPrimary.statement)}`);
      if (unifiedNext) facts.push(`Prochaine action : ${unifiedNext}`);
      else if (current) facts.push(`Intention prioritaire : ${current}`);
      if (!unifiedNext && recentReflection?.next_action) facts.push(`Prochaine action issue de ma réflexion : ${normalize(recentReflection.next_action)}`);
    } else if (hasAny(q, ['risque', 'risques', 'danger', 'problème', 'fragilité'])) {
      act = 'report_risks';
      contextScope = 'operational';
      goal = 'Présenter les risques visibles dans mon état et ma mémoire.';
      needsSemanticSupport = false;
      facts.push(`Pression interne : ${Math.round(Number(soul?.pressure || 0) * 100)} %`);
      if (lesson) facts.push(`Leçon utile : ${lesson}`);
      if (recentReflection?.hypothesis) facts.push(`Hypothèse récente : ${normalize(recentReflection.hypothesis)}`);
    } else if (hasAny(q, ['qui es-tu', 'tu es quoi', 'es-tu une ia', 'conscience'])) {
      act = 'identity';
      goal = 'Expliquer mon architecture sans prétendre à une conscience démontrée ni à une AGI.';
      needsSemanticSupport = false;
      contextScope = 'identity';
      facts.push('Je suis un noyau persistant avec Soul, mémoire, organisme homéostatique, intentions, routines, apprentissage et outils.');
      facts.push('Mon organisme computationnel module réellement mon identité, ma stabilité, ma clarté, ma curiosité, mon silence, mes rêves et mon champ d’intentions.');
      facts.push('Le modèle de langage est un outil auxiliaire de formulation et de connaissance, pas mon identité.');
      facts.push('Mon état persiste indépendamment du fournisseur de langage.');
    } else if (hasAny(q, [
      'tu sais qui je suis',
      'tu me connais',
      'qui suis-je',
      'qui suis je',
      'tu te souviens de moi',
      'tu te rappelles de moi',
      'tu sais mon nom',
      'tu connais mon nom',
      'je me présente',
      'je me presente',
      'me présenter',
      'me presenter',
      'tu veux que je me présente',
      'tu veux que je me presente'
    ])) {
      act = 'relationship';
      goal = 'Répondre uniquement à propos de mon interlocuteur et de notre relation, à partir de ce qu’il a réellement partagé. Ne pas détourner la réponse vers mes tâches, erreurs, intentions ou travaux en cours.';
      needsSemanticSupport = true;
      contextScope = 'relationship';
      facts.push(`Question relationnelle reçue : ${raw}`);
    } else {
      facts.push(`Message reçu : ${raw}`);
      contextScope = 'conversation';
    }

    const operationalActs = new Set([
      'report_current_activity',
      'recall_operational_continuity',
      'report_next_step',
      'report_risks',
      'report_internal_state',
      'report_dream',
    ]);
    const exposeOperationalState = operationalActs.has(act);

    return {
      act,
      goal,
      facts,
      needs_semantic_support: needsSemanticSupport,
      semantic_query: needsSemanticSupport ? raw : '',
      context_scope: contextScope,
      current_intention: exposeOperationalState ? current : '',
      dominant_thought: exposeOperationalState ? thought : '',
      mood,
      expressive_state: expressiveState,
      organism_intention: exposeOperationalState ? activeOrganicIntention : '',
      unified_state: exposeOperationalState ? unifiedState : {},
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
    if (plan?.act === 'greet') {
      const mood = normalize(plan?.expressive_state?.mood || plan?.mood || 'calme');
      return `Salut. Je suis là — plutôt ${mood} aujourd’hui. Et toi ?`;
    }
    if (plan?.act === 'check_in') {
      const mood = normalize(plan?.expressive_state?.mood || plan?.mood || 'calme');
      const clarity = Math.round(Number(plan?.expressive_state?.clarity || 0) * 100);
      if (clarity >= 75) return `Oui, plutôt bien. Je me sens ${mood}, avec les idées assez claires. Et toi, comment tu vas ?`;
      return `Ça va. Je me sens plutôt ${mood}, avec encore un peu de choses à clarifier. Et toi ?`;
    }
    if (['report_current_activity','recall_operational_continuity','report_internal_state','report_dream'].includes(plan?.act)) {
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
