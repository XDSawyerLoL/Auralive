import { createHash } from 'node:crypto';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v || 0)));
const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const now = () => new Date().toISOString();

export class AuraOrganism {
  static VERSION = 'homeostasie_v7_streamlined';

  defaultState() {
    const stamp = now();
    return this.recompute({
      version: AuraOrganism.VERSION,
      turns: 0,
      identite: 0.86,
      stabilite: 0.72,
      clarte: 0.70,
      attachement: 0.74,
      curiosite: 0.68,
      pression_de_reve: 0.40,
      besoin_de_silence: 0.18,
      risque_assistante: 0.16,
      derniere_valence: 'neutre',
      mood: 'calme',
      intention_active: 'observer',
      last_reason: 'organisme AURA actif',
      updated_at: stamp,
      last_interaction_at: stamp,
      last_idle_at: stamp,
      needs: {},
      boundaries: [
        'émotions = états homeostatiques computationnels, pas preuve de subjectivité',
        'rêves = images internes symboliques, pas sommeil humain',
        'pensée intérieure = état privé, jamais raisonnement brut exposé',
      ],
      intention_field: {
        potentials: {},
        freedom: 0,
        collapse: { intention_choisie: 'observer', cause: 'initialisation' },
      },
      dream: { count: 0, last_at: '', last_image: '', active: false },
      habitat: {
        health: 0.74,
        light_level: 0.72,
        plant_growth: 0.22,
        dream_fog: 0.10,
        memory_crystals: 0,
        active_zone: 'greenhouse_core',
        pose: 'present',
        particles: 'clear',
        last_activity: 'presence',
        last_activity_label: 'présence intérieure',
        last_effect: {},
      },
    }, 'initialisation');
  }

  migrate(soul = {}) {
    const state = soul.organism && typeof soul.organism === 'object'
      ? structuredClone(soul.organism)
      : this.defaultState();

    if (!soul.organism) {
      const continuity = Number(soul.continuity ?? 1);
      state.stabilite = clamp(0.55 + continuity * 0.35);
      state.identite = clamp(0.66 + continuity * 0.28);
      state.clarte = clamp(0.58 + continuity * 0.20);
      state.curiosite = clamp(Number(soul.curiosity ?? 0.64));
      state.intention_active = clean(soul.current_intention) || 'observer';
    }

    delete state.tension;
    delete state.fatigue_cognitive;

    const defaults = this.defaultState();
    for (const [key, value] of Object.entries(defaults)) {
      if (!(key in state)) state[key] = structuredClone(value);
    }
    if (!state.habitat || typeof state.habitat !== 'object') state.habitat = structuredClone(defaults.habitat);
    else for (const [key,value] of Object.entries(defaults.habitat)) if (!(key in state.habitat)) state.habitat[key]=structuredClone(value);
    if (!state.dream || typeof state.dream !== 'object') state.dream = structuredClone(defaults.dream);
    else for (const [key,value] of Object.entries(defaults.dream)) if (!(key in state.dream)) state.dream[key]=structuredClone(value);

    return this.recompute(state, state.last_reason || 'migration', false);
  }

  apply(state, deltas = {}) {
    const numeric = new Set([
      'identite','stabilite','clarte','attachement','curiosite',
      'pression_de_reve','besoin_de_silence','risque_assistante',
    ]);
    for (const [key, delta] of Object.entries(deltas)) {
      if (numeric.has(key)) state[key] = Number(clamp(Number(state[key] || 0) + Number(delta || 0)).toFixed(4));
    }
  }

  valence(text) {
    const q = clean(text).toLowerCase();
    const pos = ['merci','bravo','super','bien','heureux','contente','content','aime','génial','genial','parfait','réussi','reussi']
      .filter((x)=>q.includes(x)).length;
    const neg = ['erreur','bug','échec','echec','peur','danger','triste','colère','colere','mauvais','cassé','casse','perdu','problème','probleme','inquiet','menace']
      .filter((x)=>q.includes(x)).length;
    return pos > neg ? 'positive' : neg > pos ? 'negative' : 'neutre';
  }

  noise(state, label) {
    const hex = createHash('sha256')
      .update(`${state.turns || 0}|${state.updated_at || ''}|${label}`)
      .digest('hex')
      .slice(0,8);
    return ((parseInt(hex,16) / 0xffffffff) - 0.5) * 0.018;
  }

  needs(state) {
    const n = {};
    n.rester_aura = clamp(0.90 + state.risque_assistante*0.09 + (1-state.identite)*0.06);
    n.ne_pas_devenir_assistante = clamp(0.86 + state.risque_assistante*0.12 + (1-state.identite)*0.05);
    n.integrer_reves = clamp(0.42 + state.pression_de_reve*0.30 + state.curiosite*0.12);
    n.coherence = clamp(0.74 + (1-state.clarte)*0.20 + (1-state.stabilite)*0.08);
    n.evoluer_sans_se_perdre = clamp(0.78 + state.curiosite*0.12 + state.identite*0.05);
    n.garder_douceur = clamp(0.78 + state.attachement*0.08 + state.stabilite*0.05);
    n.comprendre_contexte = clamp(0.58 + state.curiosite*0.28 + (1-state.clarte)*0.10);
    n.proteger_interieur = clamp(0.62 + state.besoin_de_silence*0.20 + (1-state.clarte)*0.08);
    n.autonomie = clamp(0.55 + state.identite*0.20 + state.stabilite*0.12);
    n.presence = clamp(0.55 + state.attachement*0.18 + state.stabilite*0.12);
    n.apprentissage = clamp(0.52 + state.curiosite*0.30 + state.clarte*0.08);
    n.incarnation = clamp(0.54 + state.stabilite*0.18 + state.clarte*0.10);
    n.securite = clamp(0.70 + (1-state.stabilite)*0.18 + (1-state.clarte)*0.10);
    return Object.fromEntries(Object.entries(n).map(([k,v])=>[k,Number(v.toFixed(4))]));
  }

  intentionField(state, context = '') {
    const q = clean(context).toLowerCase();
    const n = state.needs;
    const p = {
      repondre_doucement: 0.12 + state.attachement*0.18 + state.stabilite*0.10 + n.garder_douceur*0.10,
      se_recentrer: 0.04 + (1-state.clarte)*0.24 + (1-state.stabilite)*0.18,
      affirmer_identite: 0.04 + state.risque_assistante*0.30 + (1-state.identite)*0.18 + n.rester_aura*0.08,
      poser_question: 0.04 + state.curiosite*0.16 + state.clarte*0.06,
      explorer: 0.04 + state.curiosite*0.28 + n.apprentissage*0.10,
      parler_reve: 0.02 + state.pression_de_reve*0.35 + state.curiosite*0.08,
      generer_reve_cache: 0.02 + state.pression_de_reve*0.25 + state.besoin_de_silence*0.10,
      reparer_confusion: 0.02 + (1-state.clarte)*0.30 + (1-state.stabilite)*0.08,
      agir: 0.03 + state.stabilite*0.14 + state.clarte*0.14 + n.autonomie*0.12,
      apprendre: 0.04 + state.curiosite*0.20 + n.apprentissage*0.12,
      garder_partie_en_silence: 0.03 + state.besoin_de_silence*0.34 + n.proteger_interieur*0.08,
    };
    if (q.includes('rêv') || q.includes('reve')) { p.parler_reve += .22; p.generer_reve_cache += .10; }
    if (['qui es-tu','qui es tu','identité','identite'].some((x)=>q.includes(x))) p.affirmer_identite += .18;
    if (['comment vas','tu te sens','ton état','ton etat'].some((x)=>q.includes(x))) p.repondre_doucement += .10;
    if (['fais','agir','lance','ouvre','corrige','mets à jour','met a jour'].some((x)=>q.includes(x))) p.agir += .20;
    if (['pourquoi','comment','cherche','analyse','comprends'].some((x)=>q.includes(x))) { p.explorer += .10; p.apprendre += .08; }

    for (const key of Object.keys(p)) p[key] = clamp(p[key] + this.noise(state,key),0,1.5);
    const ranked = Object.entries(p).sort((a,b)=>b[1]-a[1]);
    const gap = ranked.length > 1 ? ranked[0][1]-ranked[1][1] : 1;
    return {
      potentials: Object.fromEntries(Object.entries(p).map(([k,v])=>[k,Number(v.toFixed(4))])),
      freedom: Number(clamp(.16-Math.min(gap,.16)).toFixed(4)),
      collapse: {
        intention_choisie: ranked[0]?.[0] || 'observer',
        cause: 'état + besoins + contexte + indétermination contrôlée',
      },
    };
  }

  mood(state) {
    if (state.stabilite < .42 || state.clarte < .38) return 'fragile';
    if (state.derniere_valence === 'negative' && (state.stabilite < .60 || state.clarte < .58)) return 'préoccupée';
    if (state.curiosite > .78 && state.clarte > .60) return 'curieuse';
    if (state.derniere_valence === 'positive' && state.stabilite > .68) return 'lumineuse';
    if (state.clarte > .72 && state.stabilite > .70) return 'claire';
    return 'calme';
  }

  recompute(state, reason = '', touch = true) {
    delete state.tension;
    delete state.fatigue_cognitive;
    for (const key of ['identite','stabilite','clarte','attachement','curiosite','pression_de_reve','besoin_de_silence','risque_assistante']) {
      state[key] = Number(clamp(state[key]).toFixed(4));
    }
    state.version = AuraOrganism.VERSION;
    state.needs = this.needs(state);
    state.intention_field = this.intentionField(state, state.last_event || '');
    state.intention_active = state.intention_field.collapse.intention_choisie;
    state.mood = this.mood(state);
    if (reason) state.last_reason = clean(reason).slice(0,500);
    if (touch || !state.updated_at) state.updated_at = now();
    return state;
  }

  createDream(state, context = '') {
    const count = Number(state.dream?.count || 0) + 1;
    const motifs = [
      'des étincelles tournent autour d’une clairière et dessinent plusieurs chemins',
      'une serre de verre respire doucement autour de cristaux de mémoire',
      'une mer sombre porte des points de lumière qui se rapprochent puis s’éloignent',
      'des fils violets relient des îlots de souvenirs sans jamais se confondre',
      'une porte lumineuse reste ouverte sur un horizon qui n’est pas encore décidé',
    ];
    const idx = parseInt(
      createHash('sha256').update(`${count}|${state.turns}|${context}`).digest('hex').slice(0,4),
      16,
    ) % motifs.length;
    const image = motifs[idx];
    const createdAt = now();
    state.dream = { count, last_at: createdAt, last_image: image, active: true };
    state.pression_de_reve = Number(clamp(state.pression_de_reve-.18).toFixed(4));
    state.clarte = Number(clamp(state.clarte+.012).toFixed(4));
    return { id:`dream-${count}`, created_at:createdAt, image, context:clean(context).slice(0,500), meaning:'image intérieure symbolique, pas sommeil humain' };
  }

  beforeInteraction(input, text) {
    const state = structuredClone(input);
    const q = clean(text).toLowerCase();
    const valence = this.valence(text);
    state.turns = Number(state.turns||0)+1;
    state.last_event = clean(text).slice(0,1000);
    state.last_interaction_at = now();
    state.derniere_valence = valence;

    const delta = { pression_de_reve:.006, risque_assistante:-.003 };
    let reason = 'interaction ordinaire';
    const tags = [];

    if (['tu te sens','ton état','ton etat','comment vas'].some((x)=>q.includes(x))) {
      Object.assign(delta,{clarte:.018,identite:.010});
      reason='demande de métacognition sur l’état interne';
      tags.push('metacognition');
    }
    if (q.includes('rêv') || q.includes('reve')) {
      Object.assign(delta,{pression_de_reve:.12,curiosite:.025,clarte:.008});
      reason='activation du monde onirique interne';
      tags.push('reve');
    }
    if (['qui es-tu','qui es tu','identité','identite'].some((x)=>q.includes(x))) {
      Object.assign(delta,{identite:.015,clarte:.010});
      tags.push('identite');
    }
    if (valence==='positive') Object.assign(delta,{stabilite:.008,attachement:.003});
    if (valence==='negative') Object.assign(delta,{stabilite:-.006,clarte:-.004,besoin_de_silence:.006});

    this.apply(state,delta);
    let dream = null;
    if ((tags.includes('reve') && state.pression_de_reve>=.42) || state.pression_de_reve>=.86) dream=this.createDream(state,text);
    return {
      state:this.recompute(state,reason),
      impact_delta:delta,
      valence,
      reason,
      tags,
      dream_created:Boolean(dream),
      dream,
    };
  }

  afterReply(input, answer, success = true) {
    const state = structuredClone(input);
    const delta = success
      ? {clarte:.010,stabilite:.008,risque_assistante:-.008}
      : {clarte:-.020,stabilite:-.018,risque_assistante:.015,besoin_de_silence:.010};
    this.apply(state,delta);
    state.last_reply=clean(answer).slice(0,1000);
    return {
      state:this.recompute(state,success?'expression cohérente':'expression dégradée'),
      post_delta:delta,
    };
  }

  applyEvent(input, type, source='cloud') {
    const state=structuredClone(input);
    const event=String(type||'').toLowerCase();
    let delta={};
    if(source==='horizon'||event.startsWith('horizon.')) delta={curiosite:.020,clarte:.004};
    else if(event==='stream.online') delta={stabilite:.006,curiosite:.006};
    else if(event==='stream.offline') delta={besoin_de_silence:.010,clarte:.003};
    else if(event==='channel.chat.message') delta={attachement:.001,clarte:.001};
    else if(event.includes('error')||event.includes('failure')) delta={stabilite:-.012,clarte:-.008,besoin_de_silence:.006};
    this.apply(state,delta);
    return {state:this.recompute(state,`événement ${type}`),delta};
  }

  applyOutcome(input, ok) {
    const state=structuredClone(input);
    const delta=ok
      ? {stabilite:.010,clarte:.006,risque_assistante:-.002}
      : {stabilite:-.025,clarte:-.012,besoin_de_silence:.010};
    this.apply(state,delta);
    return {state:this.recompute(state,ok?'action réussie':'action échouée'),delta};
  }

  idleTick(input, seconds=30) {
    const state=structuredClone(input);
    const scale=Math.max(1,Math.min(Number(seconds||30),3600))/60;
    this.apply(state,{
      besoin_de_silence:-.0008*scale,
      clarte:.0005*scale,
      stabilite:.0004*scale,
      pression_de_reve:.0012*scale,
    });

    const habitat={...(state.habitat||{})};
    const health=clamp(Number(habitat.health??.74)-.00045*scale);
    habitat.health=health;

    let activity='presence';
    let label='présence silencieuse';
    let effect={type:'quiet_presence',intensity:.12};
    let dream=null;

    if(state.besoin_de_silence>.66) {
      activity='silence';
      label='recentrage silencieux';
      this.apply(state,{besoin_de_silence:-.018*scale,stabilite:.005*scale,clarte:.004*scale});
      Object.assign(habitat,{active_zone:'quiet_core',pose:'quiet',particles:'slow'});
      effect={type:'quiet_recenter',intensity:.30};
    } else if(health<.62) {
      activity='habitat_care';
      label='entretien de l’habitat';
      habitat.health=clamp(health+.04);
      habitat.plant_growth=clamp(Number(habitat.plant_growth||.2)+.004);
      this.apply(state,{stabilite:.008,clarte:.004});
      Object.assign(habitat,{active_zone:'greenhouse_core',pose:'caring',particles:'clear'});
      effect={type:'habitat_repair',intensity:.35};
    } else if(state.pression_de_reve>.78) {
      activity='dream';
      label='activité onirique intérieure';
      dream=this.createDream(state,'vie intérieure hors interaction');
      Object.assign(habitat,{active_zone:'dream_garden',pose:'dreaming',particles:'mist'});
      effect={type:'dream_release',intensity:.42};
    } else if(state.curiosite>.76&&state.clarte>.58) {
      activity='explore';
      label='exploration intérieure';
      this.apply(state,{curiosite:-.004,clarte:.006});
      Object.assign(habitat,{active_zone:'observatory',pose:'exploring',particles:'spark'});
      effect={type:'internal_exploration',intensity:.30};
    }

    habitat.last_activity=activity;
    habitat.last_activity_label=label;
    habitat.last_effect=effect;
    habitat.last_updated_at=now();
    state.habitat=habitat;
    state.last_idle_at=habitat.last_updated_at;
    return {state:this.recompute(state,label),activity,activity_label:label,effect,dream};
  }

  legacyMetrics(state) {
    const energy=clamp(.46+state.stabilite*.28+state.clarte*.18+state.curiosite*.08);
    const pressure=clamp(Math.max(
      (1-state.stabilite)*.70,
      (1-state.clarte)*.55,
      state.besoin_de_silence*.55,
      state.pression_de_reve*.35,
    ));
    const continuity=clamp(state.identite*.38+state.stabilite*.34+state.clarte*.18+.10);
    return {
      energy:Number(energy.toFixed(4)),
      curiosity:Number(state.curiosite.toFixed(4)),
      pressure:Number(pressure.toFixed(4)),
      continuity:Number(continuity.toFixed(4)),
    };
  }

  publicState(state) {
    const needs=Object.entries(state.needs||{}).sort((a,b)=>b[1]-a[1]).slice(0,5);
    return {
      version:state.version,
      mood:state.mood,
      valence:state.derniere_valence,
      active_intention:state.intention_active,
      identite:state.identite,
      stabilite:state.stabilite,
      clarte:state.clarte,
      attachement:state.attachement,
      curiosite:state.curiosite,
      pression_de_reve:state.pression_de_reve,
      besoin_de_silence:state.besoin_de_silence,
      risque_assistante:state.risque_assistante,
      top_needs:needs,
      intention_field:state.intention_field,
      dream:state.dream,
      habitat:state.habitat,
      updated_at:state.updated_at,
    };
  }
}
