// Scientific read-only presentation of SANDBOX data; NOT an activity claim.
// All numbers come from /api/brain/science-lab and are explicitly labelled.
export const BRAIN_SCIENCE_LAB_HTML=String.raw`
<section class="science-lab" id="science-lab" aria-label="Laboratoire de neurogenèse computationnelle">
  <div class="science-lab-head">
    <div>
      <div class="science-eyebrow"><span class="science-pulse-symbol">◈</span> AURA / NEUROSCIENCE COMPUTATIONNELLE / LABORATOIRE 01</div>
      <h2>Architecture causale <span>·</span> Génome numérique</h2>
      <p>Variables réelles de simulation, expériences contrôlées A/B et génotypes mutables. Aucun résultat de laboratoire ne prouve une activité neuronale biologique.</p>
    </div>
    <div class="science-status" id="scienceLabState">SIMULATION · EN ATTENTE DES DONNÉES</div>
  </div>
  <section class="science-mind" aria-label="Lecture des intentions et arbitrages effectivement conservés">
    <div class="science-mind-heading">
      <div><div class="science-minicap">OBSERVATOIRE COGNITIF / DONNÉES DU NOYAU</div>
        <h3>Ce qu’AURA a <em>réellement enregistré.</em></h3>
        <p>Lecture littérale des textes mémorisés, de ses intentions et du dernier arbitrage. Ce n’est ni une transcription de pensées conscientes ni le raisonnement caché du LLM.</p>
      </div>
      <div class="science-mind-actions"><span id="scienceMindState" role="status">Lecture privée · non chargée</span>
        <button type="button" id="scienceMindRefresh" aria-label="Actualiser la lecture du noyau">Actualiser</button>
      </div>
    </div>
    <div class="science-mind-grid">
      <article class="science-mind-focus">
        <div class="science-source-index">01 <span>ÉNONCÉ DOMINANT EN MÉMOIRE</span></div>
        <blockquote id="scienceMindThought">Aucun texte du noyau reçu. Les énoncés ne sont jamais inventés pour remplir cet espace.</blockquote>
        <small id="scienceMindThoughtSource">Source : aura_soul_state.dominant_thought · lecture privée</small>
      </article>
      <article class="science-mind-intention">
        <div class="science-source-index">02 <span>INTENTION CONSIGNÉE</span></div>
        <p id="scienceMindIntention">En attente de l'intention réellement persistée.</p>
        <small id="scienceMindIntentionSource">Source : aura_soul_state.current_intention · pas une action accomplie</small>
      </article>
      <article class="science-mind-choice">
        <div class="science-source-index">03 <span>ARBITRAGE FONCTIONNEL</span></div>
        <strong id="scienceMindChoice">Aucun arbitrage confirmé</strong>
        <div class="science-mind-drives" id="scienceMindDrives" aria-label="Pondérations réellement calculées"></div>
        <small id="scienceMindChoiceSource">Source : InnerDialogueEngine · calcul déterministe, pas voix intérieure</small>
      </article>
    </div>
    <details class="science-mind-ledger" id="scienceMindLedger">
      <summary><span>Journal des intentions persistées</span><small id="scienceMindCount">Aucune entrée chargée</small></summary>
      <div id="scienceMindRows" class="science-mind-rows"><p>Lecture protégée en attente.</p></div>
    </details>
  </section>
  <div class="science-lab-main">
    <article class="science-genome-block" aria-label="Carte interactive des bases du génome numérique">
      <header class="science-block-header">
        <div><span class="science-minicap">PROTOGÉNOME / 48 BASES</span><strong id="scienceGenomeId">Aucun génotype chargé</strong></div>
        <span class="science-neutral">ACGT · CODAGE EXPÉRIMENTAL</span>
      </header>
      <div class="science-genome-stage">
        <canvas id="scienceGenomeCanvas" role="img" aria-label="Double hélice informatique basée sur les 48 bases ACGT calculées"></canvas>
        <div class="science-genome-hint">Sélectionner une zone du génome pour inspecter le paramètre décodé</div>
      </div>
      <section class="science-gene-insight" aria-label="Interprétation du gène sélectionné">
        <div class="science-gene-insight-head">
          <span class="science-minicap" id="scienceGeneLocus">LOCUS G01 / BASES 01–06</span>
          <code id="scienceGeneSequence">------</code>
        </div>
        <strong id="scienceGeneInterpretation">Sélectionner un gène pour lire son sens dans le simulateur.</strong>
        <p id="scienceGeneCausality">Seules les variables effectivement reliées au calcul sont présentées comme causales.</p>
        <div class="science-gene-range"><span id="scienceGeneRange">Plage de réglage : —</span><span id="scienceGeneWiring">Connexion inconnue</span></div>
      </section>
      <div class="science-genome-bottom">
        <span>GÈNE SÉLECTIONNÉ <strong id="scienceGeneName">—</strong></span>
        <span>EXPRESSION <strong id="scienceGeneValue">—</strong></span>
        <span>MUTATION <strong id="scienceMutation">Non appliquée au noyau</strong></span>
      </div>
      <div id="scienceGeneList" class="science-gene-list"></div>
    </article>
    <article class="science-causal-block" aria-label="Résultats graphiques du protocole A/B">
      <header class="science-block-header">
        <div><span class="science-minicap">PROTOCOLE CAUSAL / CONTEXTES A & B</span><strong>Apprentissage · Redémarrage · Ablation · Placebo</strong></div>
        <span id="scienceStudyLabel" class="science-neutral">NON ÉVALUÉ</span>
      </header>
      <div class="science-context-tabs" role="group" aria-label="Choisir le contexte">
        <button id="scienceContextA" data-science-context="A" type="button" aria-pressed="true">A <span>Risque conditionnel</span></button>
        <button id="scienceContextB" data-science-context="B" type="button" aria-pressed="false">B <span>Témoin stable</span></button>
      </div>
      <div class="science-plot">
        <div class="science-plot-head"><span>Taux de vérification préalable</span><span>0 <i></i> 25 <i></i> 50 <i></i> 75 <i></i> 100 %</span></div>
        <div id="scienceEffectsChart" class="science-effects-chart"><p>En attente des observations du simulateur.</p></div>
      </div>
      <p class="science-effect-reading" id="scienceEffectReading">Les effets calculés apparaîtront ici avec leur protocole et leurs limites.</p>
      <div class="science-metrics-row">
        <div><span>DIFFÉRENCE A − B</span><strong id="scienceDiD">—</strong></div>
        <div><span>EFFET D’ABLATION</span><strong id="scienceAblation">—</strong></div>
        <div><span>PLANCHER / PLACEBO</span><strong id="scienceNoise">—</strong></div>
        <div><span>RÉPÉTITIONS</span><strong id="scienceDraws">—</strong></div>
      </div>
      <div class="science-foot" id="scienceProtocolProof">Mesures non reçues. Le protocole officiel P0 nécessite un vérificateur en processus distinct et une validation indépendante.</div>
    </article>
  </div>
  <div class="science-bottom-grid">
    <div class="science-status-card">
      <div class="science-card-title">G1–G5 <span>Portes préalables</span></div>
      <div id="scienceGates" class="science-gates"><span>Preuves non chargées</span></div>
      <small>Les portes ci-dessus concernent le bac à sable seulement. Leur validation sur Hostinger reste séparée.</small>
    </div>
    <div class="science-status-card">
      <div class="science-card-title">Sélection évolutive <span>Validation indépendante</span></div>
      <div class="science-gene-trajectory" id="scienceTrajectory"><span>Expérience non disponible</span></div>
      <small id="scienceGenomeDisclaimer">Les mutations sont limitées aux paramètres du laboratoire. Aucun code génétique biologique ni calcul quantique n’est revendiqué.</small>
    </div>
    <div class="science-status-card">
      <div class="science-card-title">Niveau de preuve <span>Traçabilité</span></div>
      <div class="science-proof-grid"><span>ÉTUDE</span><strong id="scienceStudyProof">NON ÉVALUÉE</strong><span>NOYAU HOSTINGER</span><strong id="scienceHostProof">NON TESTÉ</strong><span>EMPREINTE P0</span><code id="sciencePrereg">—</code></div>
      <small id="scienceLabTimestamp">Aucun instantané scientifique reçu.</small>
    </div>
  </div>
</section>
`;

export const BRAIN_SCIENCE_LAB_CSS=String.raw`
.science-lab{margin:15px 0 17px;border:1px solid #243747;border-radius:22px;overflow:hidden;background:radial-gradient(ellipse at 16% 0%,rgba(46,118,148,.15),transparent 38%),radial-gradient(ellipse at 95% 35%,rgba(123,56,135,.12),transparent 35%),linear-gradient(140deg,#080e17,#0c131e 68%,#0b1119);box-shadow:0 18px 46px #0006;position:relative}
.science-lab::before{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(#85cfff08 1px,transparent 1px),linear-gradient(90deg,#85cfff08 1px,transparent 1px);background-size:35px 35px;mask-image:linear-gradient(90deg,#0007,transparent)}
.science-lab-head,.science-lab-main,.science-bottom-grid{position:relative;z-index:1}
.science-lab-head{padding:23px 26px 21px;display:flex;align-items:center;justify-content:space-between;gap:14px;border-bottom:1px solid #283847}
.science-eyebrow{font-size:10px;letter-spacing:.23em;color:#64dddb;font-weight:800}.science-pulse-symbol{font-size:18px;margin-right:8px;color:#8af3ed}
.science-lab h2{margin:9px 0 5px;letter-spacing:-.05em;font-size:clamp(20px,2.15vw,34px);color:#f1f7fb;font-weight:680}.science-lab h2 span{color:#59ccd4}
.science-lab-head p{margin:0;color:#92a5b5;line-height:1.6;font-size:12px;max-width:790px}
.science-status{border:1px solid #365c68;border-radius:12px;background:#0b202b;min-width:168px;padding:12px;font-size:10px;line-height:1.7;letter-spacing:.10em;color:#7ed5db;text-align:center;font-weight:700}
.science-lab-main{padding:16px;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:14px}
.science-genome-block,.science-causal-block{min-width:0;min-height:395px;border:1px solid #273747;border-radius:17px;background:linear-gradient(180deg,#0c1825d8,#090f19eb);overflow:hidden;box-shadow:inset 0 1px 0 #c4e6ff08}
.science-block-header{padding:16px 17px 13px;display:flex;align-items:start;justify-content:space-between;gap:9px;border-bottom:1px solid #203343}
.science-block-header strong{display:block;margin-top:5px;font-size:13px;color:#d7e8f2;font-weight:650}.science-minicap{display:block;font-size:9px;letter-spacing:.16em;color:#7fded7;font-weight:750}.science-neutral{font-size:9px;letter-spacing:.09em;color:#7f95a8;max-width:130px;text-align:right;line-height:1.5}
.science-genome-stage{height:230px;position:relative;background:radial-gradient(ellipse at 50% 50%,#12314a42,transparent 62%);padding:0 8px}
#scienceGenomeCanvas{width:100%;height:100%;display:block;cursor:crosshair;touch-action:manipulation}
.science-genome-hint{position:absolute;bottom:5px;left:0;right:0;text-align:center;font-size:10px;letter-spacing:.02em;color:#809db1;pointer-events:none}
.science-genome-bottom{margin:1px 13px 11px;display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:6px}.science-genome-bottom span{display:block;border:1px solid #263847;background:#0a1621;padding:9px 10px;border-radius:9px;font-size:8px;line-height:1.6;color:#85a1b5;letter-spacing:.08em}.science-genome-bottom strong{display:block;color:#d6eef4;font-size:11px;line-height:1.4;letter-spacing:0;font-weight:700}
.science-gene-list{padding:0 13px 14px;display:flex;flex-wrap:wrap;gap:5px}.science-gene-list button{border:1px solid #294054;border-radius:7px;padding:6px 8px;background:#132031;color:#91b5c4;font-size:10px;cursor:pointer}.science-gene-list button[aria-pressed=true]{border-color:#49c8d0;background:#0e3a44;color:#adfff6}
.science-context-tabs{display:flex;gap:7px;margin:13px 15px 7px}.science-context-tabs button{flex:1;border:1px solid #2c4150;background:#0b1722;color:#92bac9;border-radius:8px;padding:8px;font-weight:800;text-align:left;cursor:pointer}.science-context-tabs button span{font-size:9px;font-weight:400;color:#8aa1ae;margin-left:8px}.science-context-tabs button[aria-pressed=true]{background:#173b46;border-color:#48bfcc;color:#9af6e9}
.science-plot{margin:0 15px 14px;background:linear-gradient(180deg,#07111a,#0b1823);border:1px solid #24384a;border-radius:12px;min-height:192px;padding:14px}
.science-plot-head{display:flex;justify-content:space-between;gap:10px;color:#9eb5c4;font-size:10px;margin-bottom:20px}.science-plot-head i{display:inline-block;width:1px;height:6px;background:#547188;margin:0 4px}
.science-effects-chart{display:grid;gap:15px}.science-bar-row{display:grid;grid-template-columns:120px minmax(0,1fr) 46px;gap:10px;align-items:center;font-size:11px;color:#b0c5d4}.science-bar-track{height:14px;position:relative;border-radius:5px;background:linear-gradient(90deg,transparent 24.8%,#4660752b 25%,transparent 25.2%,transparent 49.8%,#4660752b 50%,transparent 50.2%,transparent 74.8%,#4660752b 75%,transparent 75.2%),#121f2c;border:1px solid #2c4655}.science-bar-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,#4b929a,#7ef5d9);box-shadow:0 0 10px #4bdfd933;transition:width .4s ease}.science-bar-fill.ablation{background:linear-gradient(90deg,#665b91,#b3a1f7);box-shadow:none}.science-bar-fill.placebo{background:linear-gradient(90deg,#ab7c5c,#f3c78d);box-shadow:none}.science-bar-row strong{text-align:right;color:#f1fafc;font-size:11px;font-variant-numeric:tabular-nums}
.science-metrics-row{margin:0 15px 13px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.science-metrics-row div{padding:10px 8px;border:1px solid #284050;border-radius:9px;background:#111e2a}.science-metrics-row span{display:block;font-size:8px;letter-spacing:.05em;color:#819eaf;min-height:20px}.science-metrics-row strong{display:block;margin-top:4px;color:#cffcf4;font-size:18px;font-variant-numeric:tabular-nums}
.science-foot{font-size:10px;color:#819bad;line-height:1.5;padding:0 16px 15px}
.science-bottom-grid{display:grid;grid-template-columns:1fr 1.12fr .95fr;gap:11px;padding:0 16px 16px}.science-status-card{border:1px solid #293d4d;border-radius:13px;min-width:0;background:#0d1722;padding:13px 14px}.science-card-title{font-size:12px;font-weight:760;color:#daeef6;display:flex;justify-content:space-between;gap:7px}.science-card-title span{font-size:9px;font-weight:500;color:#7996a9}.science-status-card small{display:block;color:#748d9e;font-size:9px;line-height:1.55;margin-top:10px}
.science-gates{display:flex;gap:5px;flex-wrap:wrap;margin-top:12px}.science-gate{border:1px solid #3d6674;border-radius:7px;background:#163240;color:#8bd7dc;padding:6px 8px;font-size:10px;font-weight:700}.science-gate[data-pass=false]{background:#352332;border-color:#75445b;color:#f1a6b7}
.science-gene-trajectory{height:88px;border-bottom:1px solid #254050;margin-top:9px;display:flex;align-items:flex-end;gap:8px;padding:6px 4px 0}.science-trajectory-col{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px}.science-trajectory-col .science-trajectory-bar{display:block;width:100%;max-width:39px;min-height:3px;background:linear-gradient(#8bf4df,#255d68);border-radius:4px 4px 0 0}.science-trajectory-col small{margin:0;font-size:8px;color:#83a3b5}
.science-proof-grid{display:grid;grid-template-columns:1fr 1.15fr;gap:6px;align-items:center;font-size:9px;margin-top:11px}.science-proof-grid span{color:#7a95a5}.science-proof-grid strong{color:#c8f3e5;font-size:10px;word-break:break-all}.science-proof-grid code{font-size:9px;color:#93bad4;overflow-wrap:anywhere}
@media(max-width:1170px){.science-lab-main{grid-template-columns:1fr}.science-bottom-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:720px){.science-lab-head{padding:17px;align-items:start;flex-direction:column}.science-lab-main{padding:9px}.science-bottom-grid{padding:0 9px 9px;grid-template-columns:1fr}.science-metrics-row{grid-template-columns:repeat(2,1fr)}.science-bar-row{grid-template-columns:90px minmax(0,1fr) 34px;gap:6px}.science-genome-bottom{grid-template-columns:1fr 1fr}.science-block-header{flex-direction:column}.science-neutral{text-align:left;max-width:none}}
@media(prefers-reduced-motion:reduce){.science-bar-fill{transition:none}}
`;

export const BRAIN_SCIENCE_LAB_SCRIPT=String.raw`
(function(){
 'use strict';
 const labEl=id=>document.getElementById(id);
 const target=labEl('science-lab');if(!target)return;
 let snapshot=null,context='A',selectedGene=0,loading=false;
 const geneNames=['Biais d’inspection','Période d’exploration','Pénalité d’échec','Gain attentionnel','Seuil d’incertitude','Récupération','Plasticité','Décroissance mémoire'];
 const traitKeys=['inspection_bias','exploration_period','failure_penalty','attention_gain','uncertainty_threshold','homeostasis_recovery','plasticity','memory_decay'];
 const geneMeaning=[
  {range:'−2 à 2',desc:'Influence la probabilité simulée d’inspecter avant d’agir.',role:'Utilisé dans l’expérience P0'},
  {range:'3 à 10 cycles',desc:'Définit la fréquence de l’exploration dans la session simulée.',role:'Utilisé dans l’expérience P0'},
  {range:'1 à 8',desc:'Modifie le coût simulé d’un échec dans le protocole.',role:'Utilisé dans l’expérience P0'},
  {range:'0 à 0,08',desc:'Paramètre encodé mais non consommé par le calcul du score actuel.',role:'NON RELIÉ AU PROTOCOLE'},
  {range:'0,50 à 0,95',desc:'Seuil encodé ; aucun effet causal sur cette expérience n’a été établi.',role:'NON RELIÉ AU PROTOCOLE'},
  {range:'0,001 à 0,14',desc:'Récupération encodée ; le simulateur P0 ne lit pas cette valeur.',role:'NON RELIÉ AU PROTOCOLE'},
  {range:'0,05 à 0,90',desc:'Plasticité encodée ; aucune synapse biologique ni politique vivante modifiée.',role:'NON RELIÉ AU PROTOCOLE'},
  {range:'0,001 à 0,10',desc:'Décroissance mémoire encodée ; aucun souvenir d’AURA n’est effacé.',role:'NON RELIÉ AU PROTOCOLE'},
 ];
 const baseColors={A:'#7cebd3',C:'#f7bb83',G:'#a89cff',T:'#8ac9f8'};
 const number=x=>Number.isFinite(Number(x))?Number(x):0;
 const fmt=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x).toFixed(2):'—';
 const put=(id,v)=>{const e=labEl(id);if(e)e.textContent=String(v??'—');};
 let readingBusy=false,privateForbidden=false,readingCounter=0;
 const actionNames={respond:'Répondre',clarify:'Demander une précision',verify:'Vérifier une preuve',defer:'Différer'};
 const driveNames={initiative:'Initiative',care:'Attention à autrui',curiosity:'Curiosité',caution:'Prudence'};
 function renderReadout(info){
   const thought=info?.declared_thought?.text;
   const intent=info?.current_intention?.text;
   const focus=info?.current_focus?.text;
   put('scienceMindThought',thought||'Aucun énoncé dominant enregistré dans la mémoire persistante.');
   put('scienceMindIntention',intent||focus||'Aucune intention actuellement persistée.');
   put('scienceMindThoughtSource','Source : aura_soul_state.dominant_thought · texte enregistré, pas pensée cachée du modèle');
   put('scienceMindIntentionSource',intent
     ?'Source : aura_soul_state.current_intention · intention non exécutée par défaut'
     :'Source : existence.current_focus · objectif déclaré, pas résultat');
   const a=info?.arbitration||{};
   put('scienceMindChoice',actionNames[a.selected_action]||
      'Aucun arbitrage récent vérifié');
   put('scienceMindChoiceSource',a.last_evaluated_at
      ?'Dernier calcul : '+a.last_evaluated_at.replace('T',' ').slice(0,19)+
       ' UTC · InnerDialogueEngine (sans Groq)'
      :'Aucune évaluation fonctionnelle persistée à ce jour');
   const holder=labEl('scienceMindDrives');holder.replaceChildren();
   for(const ch of a.competition||[]){
     if(!Number.isFinite(ch.value))continue;
     const item=document.createElement('div');item.className='science-mind-drive';
     const line=document.createElement('div');
     const name=document.createElement('span');name.textContent=driveNames[ch.channel]||ch.channel;
     const number=document.createElement('strong');number.textContent=ch.value.toFixed(2);
     line.append(name,number);
     const bar=document.createElement('div');bar.className='science-mind-track';
     const fill=document.createElement('div');fill.className='science-mind-fill';
     fill.style.width=Math.round(Math.max(0,Math.min(1,ch.value))*100)+'%';
     bar.append(fill);item.append(line,bar);holder.append(item);
   }
   const entries=Array.isArray(info?.intentions)?info.intentions:[];
   put('scienceMindCount',entries.length+' intention(s) documentée(s)');
   const list=labEl('scienceMindRows');list.replaceChildren();
   if(!entries.length){
     const empty=document.createElement('p');empty.textContent='Aucune intention persistée accessible.';
     list.append(empty);
   } else for(const item of entries){
     const row=document.createElement('div');row.className='science-mind-entry';
     const top=document.createElement('div');top.className='science-mind-entry-top';
     const state=document.createElement('span');state.textContent=item.status||'non renseigné';
     const from=document.createElement('small');
     from.textContent=(item.source||'source non précisée')+' · '+
       (item.updated_at?item.updated_at.replace('T',' ').slice(0,19)+' UTC':'date inconnue');
     top.append(state,from);
     const label=document.createElement('p');label.textContent=item.statement||'';
     row.append(top,label);list.append(row);
   }
   put('scienceMindState','REGISTRES LUS · '+(info?.observed_at?.replace('T',' ').slice(11,19)||'—'));
 }
 async function readMind(force=false){
   if(readingBusy||(privateForbidden&&!force))return;
   readingBusy=true;
   put('scienceMindState','Lecture privée du noyau…');
   try{
     const response=await fetch('/api/brain/introspection',
       {credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
     if(response.status===401||response.status===403){
       privateForbidden=true;
       put('scienceMindThought','Lecture réservée à la session fondatrice authentifiée.');
       put('scienceMindIntention','Les intentions privées ne sont pas publiées à tous les visiteurs.');
       put('scienceMindChoice','Accès privé requis');
       labEl('scienceMindDrives').replaceChildren();
       labEl('scienceMindRows').replaceChildren();
       put('scienceMindState','SESSION FONDATRICE REQUISE');
       put('scienceMindCount','Registre privé');
       return;
     }
     if(!response.ok)throw Error('HTTP '+response.status);
     const data=await response.json();
     if(data.version!=='aura-readable-cognition-v1')throw Error('Format de noyau incompatible');
     privateForbidden=false;
     renderReadout(data);
   }catch(error){
     put('scienceMindState','LECTURE INDISPONIBLE');
     put('scienceMindThought','Impossible de vérifier le texte mémorisé par le noyau.');
     put('scienceMindChoice','Non vérifié');
     put('scienceMindIntention','Aucune donnée fiable reçue.');
     labEl('scienceMindDrives').replaceChildren();
     labEl('scienceMindRows').replaceChildren();
   }finally{readingBusy=false;}
 }
 labEl('scienceMindRefresh').addEventListener('click',()=>void readMind(true));
 function canvasDraw(){
   const can=labEl('scienceGenomeCanvas'),ctx=can.getContext('2d');
   const bounds=can.getBoundingClientRect();
   const w=Math.max(200,bounds.width),h=Math.max(150,bounds.height),d=Math.min(window.devicePixelRatio||1,2);
   can.width=Math.round(w*d);can.height=Math.round(h*d);ctx.setTransform(d,0,0,d,0,0);
   ctx.clearRect(0,0,w,h);
   const dna=snapshot?.genome?.dna||'',n=dna.length||48;
   const margin=24,step=(w-2*margin)/(n-1),mid=h*.49,amp=h*.21;
   const a=point=>mid+Math.sin(point*.32)*amp;
   const b=point=>mid-Math.sin(point*.32)*amp;
   for(let strand=0;strand<2;strand++){
     ctx.beginPath();
     for(let i=0;i<n;i++){
       const x=margin+i*step,y=strand?a(i):b(i);
       if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
     }
     ctx.strokeStyle=strand?'#61dcd0':'#947acb';ctx.lineWidth=2.1;ctx.stroke();
   }
   for(let i=0;i<n;i++){
     const x=margin+i*step,y1=a(i),y2=b(i),base=dna[i]||'';
     const activated=Math.floor(i/6)===selectedGene;
     ctx.beginPath();ctx.moveTo(x,y1);ctx.lineTo(x,y2);
     ctx.strokeStyle=activated?baseColors[base]||'#9bb5c4':'#42627896';
     ctx.lineWidth=activated?3.0:1.1;ctx.stroke();
     for(const y of [y1,y2]){
       ctx.beginPath();ctx.arc(x,y,activated?3.3:1.9,0,Math.PI*2);
       ctx.fillStyle=baseColors[base]||'#3b5668';ctx.fill();
     }
   }
   const zoneW=6*step,zoneStart=margin+selectedGene*6*step-4;
   ctx.strokeStyle='#69e5e56b';ctx.lineWidth=1;ctx.setLineDash([5,5]);
   ctx.strokeRect(zoneStart,21,zoneW+6,h-42);ctx.setLineDash([]);
   ctx.font='10px ui-monospace,Consolas,monospace';
   ctx.fillStyle='#83b1c2';ctx.fillText('GENE 0'+(selectedGene+1),zoneStart+2,14);
   ctx.fillStyle='#7ea5b8';ctx.fillText(dna.length+' NUCLÉOTIDES NUMÉRIQUES',margin,h-12);
 }
 function selectGene(index){
   selectedGene=Math.max(0,Math.min(7,index));
   const genome=snapshot?.genome;
   put('scienceGeneName',geneNames[selectedGene]);
   put('scienceGeneValue',genome?.traits?.[traitKeys[selectedGene]]??'—');
   const meanings=geneMeaning[selectedGene];
   put('scienceGeneLocus','LOCUS G'+String(selectedGene+1).padStart(2,'0')+
     ' / BASES '+String(selectedGene*6+1).padStart(2,'0')+'–'+
     String(selectedGene*6+6).padStart(2,'0'));
   put('scienceGeneSequence',genome?.dna?.slice(selectedGene*6,selectedGene*6+6)||'------');
   put('scienceGeneInterpretation',geneNames[selectedGene]);
   put('scienceGeneCausality',meanings.desc);
   put('scienceGeneRange','Plage : '+meanings.range);
   put('scienceGeneWiring',meanings.role);
   const list=labEl('scienceGeneList');list.replaceChildren();
   for(let i=0;i<8;i++){
     const button=document.createElement('button');button.type='button';
     button.textContent='G'+(i+1)+' · '+geneNames[i];
     button.setAttribute('aria-pressed',String(i===selectedGene));
     button.addEventListener('click',()=>selectGene(i));list.append(button);
   }
   canvasDraw();
 }
 function chart(){
   const holder=labEl('scienceEffectsChart');holder.replaceChildren();
   const d=snapshot?.sandbox?.sample?.policies;
   if(!d){holder.textContent='Aucune distribution A/B vérifiable disponible.';return;}
   const rows=[
     ['Après apprentissage',d.after?.[context]?.inspect, 'after'],
     ['Ablation de A',Number(d.ablated?.[context]?.inspect),'ablation'],
     ['Placebo B',Number(d.placebo?.[context]?.inspect),'placebo'],
   ];
   for(const [label,raw,kind] of rows){
     const valid=raw!==null&&raw!==undefined&&Number.isFinite(Number(raw));
     const val=valid?Math.max(0,Math.min(1,Number(raw))):null;
     const row=document.createElement('div');row.className='science-bar-row';
     const name=document.createElement('span');name.textContent=label;
     const track=document.createElement('div');track.className='science-bar-track';
     const bar=document.createElement('div');bar.className='science-bar-fill '+kind;
     bar.style.width=valid?Math.round(val*100)+'%':'0%';track.append(bar);
     const pct=document.createElement('strong');pct.textContent=valid?Math.round(val*100)+' %':'—';
     row.append(name,track,pct);holder.append(row);
   }
 }
 function graphTrajectory(){
   const holder=labEl('scienceTrajectory');holder.replaceChildren();
   const history=snapshot?.evolution?.history||[];
   if(!history.length){holder.textContent='Aucune évolution simulée.';return;}
   const min=Math.min(...history.map(x=>number(x.mean_fitness)),0);
   const max=Math.max(...history.map(x=>number(x.best_fitness)),1);
   for(let i=0;i<history.length;i++){
     const point=history[i];
     const col=document.createElement('div');col.className='science-trajectory-col';
     const bar=document.createElement('span');bar.className='science-trajectory-bar';
     bar.style.height=Math.round(15+70*(number(point.best_fitness)-min)/(max-min||1))+'%';
     bar.title='Génération '+point.generation+' · meilleur score '+fmt(point.best_fitness);
     const caption=document.createElement('small');caption.textContent='G'+point.generation;
     col.append(bar,caption);holder.append(col);
   }
 }
 function paint(){
   if(!snapshot)return;
   const s=snapshot.sandbox?.study||{},metrics=s.metrics||{},g=snapshot.genome||{};
   put('scienceLabState','SIMULATION CALCULÉE · PAS LE NOYAU BIOLOGIQUE');
   put('scienceGenomeId','SEQUENCE '+String(g.id||'—').slice(0,24));
   put('scienceMutation','LABORATOIRE SEULEMENT');
   put('scienceStudyLabel',s.executed?(s.accepted?'ACCEPTATION INTERNE':'TEST NON CONCLUANT'):'EXPÉRIENCE BLOQUÉE');
   put('scienceDiD',fmt(metrics.difference_in_differences));
   put('scienceAblation',fmt(metrics.causal_ablation_A));
   put('scienceNoise',fmt(metrics.noise_floor));
   put('scienceEffectReading',s.executed
     ?'Effet calculé en bac à sable : ablation A = '+fmt(metrics.causal_ablation_A)+
      ' ; différence A − B = '+fmt(metrics.difference_in_differences)+
      '. Ce résultat compare des politiques simulées, pas les décisions vivantes d’AURA.'
     :'Aucune expérience P0 exécutée : les différences causales restent inconnues.');
   put('scienceDraws',s.draws??'—');
   put('scienceProtocolProof','Vérificateur arithmétique du simulateur. La validation indépendante du protocole PDF, avec processus séparé, signature et intervalle bootstrap, n’est PAS encore acquise.');
   put('scienceStudyProof','SIMULATION / NON CERTIFIÉE P0');
   put('scienceHostProof','NON VALIDÉ EN PRODUCTION');
   put('sciencePrereg',String(s.preregistration||'—').slice(0,16)+'…');
   put('scienceLabTimestamp','Échantillon : '+(snapshot.generated_at||'non daté')+' · code, graines et seuils inspectables dans GitHub');
   put('scienceGenomeDisclaimer','Sélection probabiliste classique ; ni calcul quantique, ni ADN biologique, ni mutation automatique du logiciel.');
   const gates=labEl('scienceGates');gates.replaceChildren();
   for(const [key,pass] of Object.entries(s.gates?.checks||{})){
     const e=document.createElement('span');e.className='science-gate';
     e.dataset.pass=String(Boolean(pass));e.textContent=key+' · SIMULATION '+(pass?'OK':'BLOQUÉ');
     gates.append(e);
   }
   graphTrajectory();chart();selectGene(selectedGene);
 }
 async function loadLab(){
   if(loading)return;loading=true;
   try{
     const resp=await fetch('/api/brain/science-lab',{cache:'no-store',credentials:'same-origin'});
     if(!resp.ok)throw Error('HTTP '+resp.status);
     const data=await resp.json();
     if(data.version!=='aura-science-lab-v1')throw Error('Payload expérimental incompatible');
     snapshot=data;paint();
   }catch(e){
     put('scienceLabState','LABORATOIRE INDISPONIBLE');
     put('scienceProtocolProof','Aucun résultat n’a pu être calculé : '+String(e?.message||e).slice(0,100));
   }finally{loading=false;}
 }
 for(const button of document.querySelectorAll('[data-science-context]')){
   button.addEventListener('click',()=>{
     context=button.getAttribute('data-science-context');
     for(const other of document.querySelectorAll('[data-science-context]'))
       other.setAttribute('aria-pressed',String(other===button));
     chart();
   });
 }
 labEl('scienceGenomeCanvas').addEventListener('click',e=>{
   const box=e.currentTarget.getBoundingClientRect();
   selectGene(Math.min(7,Math.floor(Math.max(0,(e.clientX-box.left)/box.width)*8)));
 });
 window.addEventListener('resize',()=>{if(snapshot)canvasDraw();},{passive:true});
 const drawer=document.getElementById('neuro-lab-details');
 if(drawer)drawer.addEventListener('toggle',()=>{if(drawer.open){void loadLab();void readMind(true);}});
 else {void loadLab();void readMind(true);}
 // Private readout is refreshed only while visible, never in the background.
 setInterval(()=>{if(drawer?.open&&!document.hidden&&!privateForbidden&&!readingBusy)
   void readMind();},7000);
})();
`;
