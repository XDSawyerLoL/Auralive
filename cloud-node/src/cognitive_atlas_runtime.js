// Module de visualisation indépendant, injecté dans le dashboard existant.
export const COGNITIVE_ATLAS_SCRIPT = String.raw`
/* AURA Cognitive Atlas 3: every active signal is driven by real server events.
   No hidden LLM neurons or reasoning are reconstructed or claimed. */
const COG_STAGES=[
 {id:'request',name:'Requête',glyph:'↗',x:104,y:352,info:'Admission HTTP de la demande et durée du traitement.'},
 {id:'input',name:'Entrée',glyph:'↳',x:247,y:352,info:'Message utilisateur sauvegardé par le noyau.'},
 {id:'homeostasis',name:'Homéostasie',glyph:'∿',x:396,y:196,info:'État computationnel recalculé avant la réponse.'},
 {id:'stimulus',name:'Stimulus',glyph:'✳',x:392,y:514,info:'Stimulus enregistré et transmis au moteur cognitif.'},
 {id:'context',name:'Mémoire',glyph:'◈',x:566,y:176,info:'Contexte historique récupéré pour la décision.'},
 {id:'decision',name:'Décision',glyph:'⌘',x:574,y:449,info:'Choix de l’action de dialogue par le noyau.'},
 {id:'research',name:'Recherche',glyph:'⌕',x:783,y:107,info:'Consultation externe éventuelle, si exécutée.'},
 {id:'semantic',name:'Sémantique',glyph:'∑',x:784,y:317,info:'Appui sémantique externe éventuel, si réellement sollicité.'},
 {id:'expression',name:'Expression',glyph:'✧',x:911,y:503,info:'Génération linguistique et mode de sortie réellement utilisé.'},
 {id:'homeostasis_post',name:'Régulation',glyph:'∿',x:1063,y:259,info:'Réévaluation computationnelle après l’expression ou son échec.'},
 {id:'persistence',name:'Persistance',glyph:'▣',x:1065,y:549,info:'Enregistrement des résultats et traces du traitement.'}
];
// Seven satellite processes are independently instrumented and timed by
// CognitiveKernel.chat. These are actual data reads, not synthetic neurons.
const COG_CONTEXT_CHILDREN=[
 {id:'context_intentions',name:'Intentions',glyph:'i',x:455,y:95,info:'Lecture des intentions actives.',micro:true},
 {id:'context_lessons',name:'Leçons',glyph:'l',x:521,y:43,info:'Consultation des leçons persistées.',micro:true},
 {id:'context_reflections',name:'Réflexions',glyph:'r',x:622,y:44,info:'Récupération des réflexions précédentes.',micro:true},
 {id:'context_work',name:'Travaux',glyph:'t',x:693,y:101,info:'Lecture du travail et des missions accessibles.',micro:true},
 {id:'context_agenda',name:'Agenda',glyph:'a',x:690,y:224,info:'Lecture de l’agenda courant.',micro:true},
 {id:'context_continuity',name:'Continuité',glyph:'c',x:625,y:286,info:'Lecture des activités depuis le dernier échange.',micro:true},
 {id:'context_messages',name:'Messages',glyph:'m',x:512,y:290,info:'Historique de messages effectivement interrogé.',micro:true}
];
const COG_EDGES=[
 ['request','input'],['input','homeostasis'],['homeostasis','stimulus'],
 ['stimulus','context'],['context','decision'],['decision','research'],
 ['decision','semantic'],['research','semantic'],['semantic','expression'],
 ['decision','expression'],['expression','homeostasis_post'],
 ['homeostasis_post','persistence'],
 ['context','context_intentions'],['context','context_lessons'],
 ['context','context_reflections'],['context','context_work'],
 ['context','context_agenda'],['context','context_continuity'],
 ['context','context_messages']
];
const COG_AUTO_STAGES=[
 {id:'cycle',name:'Cycle',glyph:'◎',x:120,y:355,info:'Cycle automatique effectivement démarré.'},
 {id:'regulation',name:'Régulation',glyph:'∿',x:335,y:195,info:'Évolution du module homéostatique.'},
 {id:'context_auto',name:'Contexte',glyph:'◈',x:568,y:190,info:'Lecture des stimuli et leçons utilisées.'},
 {id:'reflection_auto',name:'Réflexion',glyph:'⌘',x:735,y:430,info:'Réflexion autonome calculée si déclenchée.'},
 {id:'execution_auto',name:'Exécution',glyph:'⚙',x:973,y:232,info:'Résultat d’opération constaté, et non action inventée.'},
 {id:'commit_auto',name:'Persistance',glyph:'▣',x:1030,y:541,info:'État et traces enregistrés en fin de cycle.'}
];
const COG_AUTO_EDGES=[
 ['cycle','regulation'],['regulation','context_auto'],['context_auto','reflection_auto'],
 ['reflection_auto','execution_auto'],['execution_auto','commit_auto'],
 ['regulation','commit_auto'],['reflection_auto','commit_auto']
];
const COG_STATUS={running:'En cours',done:'Exécuté',skipped:'Ignoré',error:'Échec',idle:'Non exécuté'};
const COG_FIELDS={
 messages:'Messages consultés',intentions:'Intentions',lessons:'Leçons',reflections:'Réflexions',work_items:'Travaux',
 memory_items:'Souvenirs',research_evidence:'Preuves externes',answer_chars:'Caractères produits',
 token_budget:'Budget de tokens',semantic_requested:'Support requis',semantic_available:'Support obtenu',
 external_required:'Recherche requise',confidence:'Confiance calculée',delta_stability:'Δ Stabilité',
 delta_curiosity:'Δ Curiosité',delta_frustration:'Δ Frustration',decision_act:'Acte retenu',
 language_mode:'Mode linguistique',language_backend:'Moteur réellement employé',stimuli_count:'Stimuli',lessons_count:'Leçons consultées',
 cycle_reflected:'Réflexion produite',execution_confirmed:'Exécution confirmée',
 operation_kind:'Type opération',trigger_kind:'Déclencheur',
 state_stability:'Stabilité',state_clarity:'Clarté',state_curiosity:'Curiosité',
 state_confidence:'Confiance',state_frustration:'Frustration',state_engagement:'Engagement',
 state_mood:'Humeur calculée'
};
const COG_LANGUAGE={
 'french-language-faculty':'Modèle de français opérationnel',
 'natural-language-unavailable':'Aucun modèle disponible',
 'deterministic-emergency-fallback':'Formulation de secours non générative',unknown:'Non identifié'
};
const COG_METRIC_KEYS=[
 'state_stability','state_clarity','state_curiosity','state_confidence','state_frustration','state_engagement'
];
let cogMode='dialogue';
let cogTrace=null;
let cogTraceOrigin='poll';
let cogSelected='';
let cogSelectedIndex=-1;
let cogTraceId='';
let cogAwaitingReply=false;
let cogAutonomyForbidden=false;
let cogReplayVersion=0;
let cogReplaying=false;
let cogFetchPending=null;
let cogLiveStream=null;
let cogStreamReady=false;
let cogLastFetchMs=0;
let cogGraphReady=false;
let cogLatestVisualSignature='';
let cogZoom=1;
let cogPanX=0;
let cogPanY=0;
const cogElements=new Map();
const cogEdges=[];
const cogSVG='http://www.w3.org/2000/svg';
const cogStages=()=>cogMode==='autonomy'?COG_AUTO_STAGES:COG_STAGES.concat(COG_CONTEXT_CHILDREN);
const cogPaths=()=>cogMode==='autonomy'?COG_AUTO_EDGES:COG_EDGES;

function cogSvg(tag,attrs,parent){
 const el=document.createElementNS(cogSVG,tag);
 Object.entries(attrs||{}).forEach(function(pair){el.setAttribute(pair[0],String(pair[1]));});
 if(parent)parent.appendChild(el);
 return el;
}
function cogFormatMs(ms){
 if(ms==null||!Number.isFinite(Number(ms)))return '—';
 const n=Math.max(0,Number(ms));
 return n<1000?Math.round(n)+' ms':(n/1000).toFixed(2)+' s';
}
function cogHuman(key,value){
 if(key==='language_mode')return COG_LANGUAGE[value]||String(value);
 if(typeof value==='boolean')return value?'Oui':'Non';
 if(typeof value==='number'){
   if(key.startsWith('state_')||key==='confidence')return Math.round(value*100)+' %';
   if(key.startsWith('delta_'))return (value>=0?'+':'')+(value*100).toFixed(2)+' pt';
   return String(value);
 }
 return String(value==null?'—':value);
}
function cogEvent(stage,index){
 const events=Array.isArray(cogTrace?.events)?cogTrace.events:[];
 if(Number.isInteger(index)&&index>=0&&index<events.length&&events[index].stage===stage)return events[index];
 for(let i=events.length-1;i>=0;i--)if(events[i].stage===stage)return events[i];
 return null;
}
function cogSetZoom(next){
 cogZoom=Math.max(.62,Math.min(2.35,Number(next)||1));
 const group=$('cogNetwork');
 if(group)group.setAttribute('transform','translate('+(600+cogPanX)+' '+(350+cogPanY)+') scale('+cogZoom+') translate(-600 -350)');
 if($('cogZoomReset'))$('cogZoomReset').textContent=Math.round(cogZoom*100)+'%';
}
function cogMoveToStage(id){
 cogSelected=id;
 cogSelectedIndex=-1;
 renderCognitiveGraph();
}
function cogLinkShape(a,b){
 const dx=(b.x-a.x)*.55;
 return 'M '+a.x+' '+a.y+' C '+(a.x+dx)+' '+a.y+', '+(b.x-dx)+' '+b.y+', '+b.x+' '+b.y;
}
function initCognitiveGraph(){
 const svg=$('cogGraph');if(!svg)return;
 svg.replaceChildren();cogElements.clear();cogEdges.length=0;
 cogGraphReady=false;cogLatestVisualSignature='';
 const defs=cogSvg('defs',{},svg);
 const grad=cogSvg('radialGradient',{id:'cogCore',cx:'35%',cy:'25%',r:'80%'},defs);
 cogSvg('stop',{offset:'0%','stop-color':'#75dfda','stop-opacity':'.3'},grad);
 cogSvg('stop',{offset:'100%','stop-color':'#0b2541','stop-opacity':'.03'},grad);
 const group=cogSvg('g',{id:'cogNetwork'},svg);
 const backdrop=cogSvg('g',{'aria-hidden':'true'},group);
 [{x:235,y:340,r:205,title:'PERCEPTION'},{x:600,y:360,r:255,title:'COGNITION'},{x:980,y:365,r:225,title:'EXPRESSION'}].forEach(function(zone){
   cogSvg('circle',{cx:zone.x,cy:zone.y,r:zone.r,class:'cog-scope'},backdrop);
   cogSvg('circle',{cx:zone.x,cy:zone.y,r:zone.r*.74,class:'cog-scope',opacity:'.38'},backdrop);
   const label=cogSvg('text',{x:zone.x,y:zone.y-zone.r+16,class:'cog-structure-label','text-anchor':'middle'},backdrop);
   label.textContent=zone.title;
 });
 // Static coordinate accents are background design, not neural events.
 for(let i=0;i<75;i++){
   const x=45+((i*233+83)%1110),y=45+((i*157+129)%605);
   cogSvg('circle',{cx:x,cy:y,r:i%6===0?1.2:.7,fill:'#5b8fa5',opacity:i%7===0?.48:.16},backdrop);
 }
 const lines=cogSvg('g',{},group);
 const nodes=cogSvg('g',{},group);
 const stages=cogStages();
 cogPaths().forEach(function(pair){
   const a=stages.find(function(n){return n.id===pair[0];});
   const b=stages.find(function(n){return n.id===pair[1];});
   if(!a||!b)return;
   const edge=cogSvg('path',{d:cogLinkShape(a,b),class:'cog-edge','data-edge':a.id+'-'+b.id},lines);
   cogEdges.push({a:a.id,b:b.id,el:edge});
 });
 stages.forEach(function(stage){
   const g=cogSvg('g',{class:'cog-node'+(stage.micro?' micro':''),role:'button',tabindex:'0','data-state':'idle','data-id':stage.id,'aria-label':stage.name+' : non exécuté'},nodes);
   cogSvg('circle',{cx:stage.x,cy:stage.y,r:stage.micro?24:48,class:'node-ring'},g);
   cogSvg('circle',{cx:stage.x,cy:stage.y,r:stage.micro?17:35,class:'node-halo'},g);
   cogSvg('circle',{cx:stage.x,cy:stage.y,r:stage.micro?12:25,class:'node-center'},g);
   const icon=cogSvg('text',{x:stage.x,y:stage.y+1,class:'node-glyph'},g);icon.textContent=stage.glyph;
   const title=cogSvg('text',{x:stage.x,y:stage.y+(stage.micro?35:65),class:'node-title'},g);title.textContent=stage.name;
   const meta=cogSvg('text',{x:stage.x,y:stage.y+(stage.micro?49:83),class:'node-meta'},g);meta.textContent='Non observé';
   const micro=cogSvg('g',{'data-micro':stage.id},g);
   const select=function(){cogMoveToStage(stage.id);};
   g.addEventListener('click',function(event){event.stopPropagation();select();});
   g.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();select();}});
   cogElements.set(stage.id,{el:g,meta,micro,stage});
 });
 let dragging=null;
 svg.onpointerdown=function(e){
   if(e.target.closest?.('.cog-node'))return;
   dragging={x:e.clientX,y:e.clientY,panX:cogPanX,panY:cogPanY};
   try{svg.setPointerCapture(e.pointerId);}catch(_){}
 };
 svg.onpointermove=function(e){
   if(!dragging)return;
   const bounds=svg.getBoundingClientRect();
   const aspectX=1200/Math.max(1,bounds.width),aspectY=700/Math.max(1,bounds.height);
   cogPanX=dragging.panX+(e.clientX-dragging.x)*aspectX;
   cogPanY=dragging.panY+(e.clientY-dragging.y)*aspectY;
   cogSetZoom(cogZoom);
 };
 svg.onpointerup=svg.onpointercancel=function(){dragging=null;};
 svg.onwheel=function(e){
   e.preventDefault();
   cogSetZoom(cogZoom*(e.deltaY<0?1.12:.89));
 };
 $('cogZoomIn').onclick=function(){cogSetZoom(cogZoom*1.18);};
 $('cogZoomOut').onclick=function(){cogSetZoom(cogZoom/1.18);};
 $('cogZoomReset').onclick=function(){cogPanX=0;cogPanY=0;cogSetZoom(1);};
 $('cogExport').onclick=exportCognitiveTrace;
 cogSetZoom(cogZoom);
 cogGraphReady=true;
 renderCognitiveGraph();
}
function cogEffectiveDetails(event){
 return event&&typeof event.details==='object'&&event.details!==null?event.details:{};
}
function cogDrawSatellite(item,details){
 const el=item.micro;el.replaceChildren();
 const keys=Object.keys(details).filter(function(k){return COG_METRIC_KEYS.includes(k);});
 if(!keys.length)return;
 keys.slice(0,6).forEach(function(key,i){
   const angle=-2.72+i*(5.28/Math.max(6,keys.length));
   const x=item.stage.x+Math.cos(angle)*59;
   const y=item.stage.y+Math.sin(angle)*59;
   const raw=Number(details[key]);
   cogSvg('circle',{cx:x,cy:y,r:2.8+Math.max(0,Math.min(1,raw))*3.4,class:'cog-micro'},el);
 });
}
function cogShowInspector(){
 const stages=cogStages();
 const events=Array.isArray(cogTrace?.events)?cogTrace.events:[];
 const latest=events.slice().reverse().find(function(e){return e.status==='error'&&e.stage!=='request'&&e.stage!=='cycle';})
   ||events.slice().reverse().find(function(e){return e.stage!=='request'&&e.stage!=='cycle';})
   ||events.at(-1);
 const stage=stages.find(function(x){return x.id===cogSelected;})
   ||stages.find(function(x){return x.id===latest?.stage;})
   ||null;
 const event=stage?cogEvent(stage.id,cogSelectedIndex):null;
 const details=cogEffectiveDetails(event);
 $('cogDetailTitle').textContent=stage?.name||'Aucune opération';
 const state=event?.status||'idle';
 const el=$('cogDetailState');el.dataset.state=state;el.textContent=COG_STATUS[state]||state;
 $('cogDetail').textContent=stage?(stage.info+(event?' Le serveur a enregistré cette étape.':' Aucune exécution enregistrée pour ce nœud.'))
   :'En attente de données serveur. Aucun calcul n’est simulé pour remplir la carte.';
 $('cogStageTiming').textContent=event
   ? (event.duration_ms==null?'Durée de cette étape non disponible':cogFormatMs(event.duration_ms))
   :'—';
 const metrics=$('cogMetrics');metrics.replaceChildren();
 const vals=COG_METRIC_KEYS.filter(function(k){return typeof details[k]==='number';});
 if(!vals.length){const note=document.createElement('span');note.className='cog-description';note.textContent='Aucun indicateur homéostatique enregistré à cette étape.';metrics.append(note);}
 vals.forEach(function(key){
   const wrap=document.createElement('div');wrap.className='cog-metric-row';
   const top=document.createElement('div');top.className='cog-metric-top';
   const name=document.createElement('span');name.textContent=COG_FIELDS[key]||key;
   const value=document.createElement('strong');value.textContent=cogHuman(key,details[key]);
   top.append(name,value);
   const track=document.createElement('div');track.className='cog-metric-track';
   const fill=document.createElement('div');fill.className='cog-metric-fill';fill.style.width=Math.round(details[key]*100)+'%';
   track.append(fill);wrap.append(top,track);metrics.append(wrap);
 });
 const metadata=$('cogMetadata');metadata.replaceChildren();
 const list=Object.keys(details).filter(function(k){return !COG_METRIC_KEYS.includes(k);});
 if(event){
   list.unshift('_at','_elapsed');
 }
 if(!list.length){const note=document.createElement('span');note.className='cog-description';note.textContent='Aucune métadonnée supplémentaire enregistrée.';metadata.append(note);}
 list.forEach(function(key){
   const row=document.createElement('div');row.className='cog-meta-row';
   const label=document.createElement('span');
   const value=document.createElement('b');
   label.textContent=key==='_at'?'Horodatage':key==='_elapsed'?'Depuis entrée':COG_FIELDS[key]||key.replace(/_/g,' ');
   value.textContent=key==='_at'?event.at:key==='_elapsed'?cogFormatMs(event.elapsed_ms):cogHuman(key,details[key]);
   row.append(label,value);metadata.append(row);
 });
}
function cogEventMatchesEdge(edge,events){
 const a=events.find(function(e){return e.stage===edge.a&&e.status==='done';});
 const b=events.find(function(e){return e.stage===edge.b&&(e.status==='running'||e.status==='done'||e.status==='error');});
 if(edge.a==='context'&&edge.b.startsWith('context_')){
   const start=events.find(function(e){return e.stage==='context'&&e.status==='running';});
   return Boolean(start&&b&&Number(b.elapsed_ms)>=Number(start.elapsed_ms)
     &&(!a||Number(b.elapsed_ms)<=Number(a.elapsed_ms)));
 }
 return Boolean(a&&b&&Number(b.elapsed_ms)>=Number(a.elapsed_ms));
}
function renderCognitiveGraph(){
 if(!cogGraphReady)return;
 const events=Array.isArray(cogTrace?.events)?cogTrace.events:[];
 const available=Boolean(cogTrace?.available);
 const state=String(cogTrace?.state||'idle');
 const failed=events.filter(function(e){return e.status==='error';});
 const done=events.filter(function(e){return e.status==='done'&&e.stage!=='request'&&e.stage!=='cycle';});
 const last=events.at(-1);
 const lastSignificant=events.slice().reverse().find(function(e){return e.stage!=='request'&&e.stage!=='cycle';})||last;
 const status=!available?'Aucune trace instrumentée'
   :state==='running'?'Exécution en cours · données réelles'
   :state==='error'?'Exécution interrompue'
   :failed.length?'Terminé avec anomalie':'Exécution terminée';
 $('cogState').textContent=status+(available&&cogTraceOrigin==='reply'?' · instantané joint':'');
 const latestName=lastSignificant?(cogStages().find(s=>s.id===lastSignificant.stage)?.name||lastSignificant.stage):null;
 const stateLabel=lastSignificant?.status==='done'?'terminé'
  :lastSignificant?.status==='running'?'en traitement'
  :lastSignificant?.status==='error'?'en échec'
  :lastSignificant?.status==='skipped'?'non sollicité':'en attente';
 $('cogReadableSummary').textContent=available&&latestName
  ?'Dernier jalon confirmé : '+latestName+' · '+stateLabel+
    (lastSignificant?.elapsed_ms!=null?' · t+'+cogFormatMs(lastSignificant.elapsed_ms):'')
  :'Aucun trajet attesté reçu. Le noyau ne publie pas un faux monologue pour remplir le graphique.';
 $('cogReadableEvidence').textContent=available
  ?'Source : '+String(cogTrace.id||'trace instrumentée').slice(0,16)+
    ' · '+done.length+' étapes distinctes terminées'+
    (failed.length?' · '+failed.length+' anomalie(s) enregistrée(s)':'')+
    ' · aucune activité subjective inférée.'
  :'La carte décrit des modules logiciels ; seules leurs transitions réellement enregistrées peuvent être déclarées actives.';
 $('cogStatsEvents').textContent=available?String(new Set(done.map(function(e){return e.stage;})).size)+' / '+cogStages().length:'—';
 $('cogDuration').textContent=available?cogFormatMs(cogTrace.duration_ms??last?.elapsed_ms):'—';
 $('cogStatsErrors').textContent=available?String(new Set(failed.map(function(e){return e.stage;})).size):'—';
 $('cogStatsLatest').textContent=lastSignificant?
   (cogStages().find(function(e){return e.id===lastSignificant.stage;})?.name||lastSignificant.stage):'—';
 $('cogReplay').disabled=!available||cogReplaying;
 $('cogExport').disabled=!available;
 cogElements.forEach(function(item,id){
   const e=cogEvent(id),state=e?.status||'idle';
   item.el.dataset.state=state;
   item.el.classList.toggle('selected',id===cogSelected);
   item.el.setAttribute('aria-label',item.stage.name+' · '+(COG_STATUS[state]||state)
      +(e?.duration_ms!=null?' · '+cogFormatMs(e.duration_ms):''));
   item.meta.textContent=state==='idle'?'Non observé'
     :state==='running'?'En traitement'
     :state==='skipped'?'Non sollicité'
     :e?.duration_ms!=null?cogFormatMs(e.duration_ms):(COG_STATUS[state]||state);
   if(!item.stage.micro)cogDrawSatellite(item,cogEffectiveDetails(e));
 });
 cogEdges.forEach(function(edge){
   const source=cogEvent(edge.a),target=cogEvent(edge.b);
   const observed=cogEventMatchesEdge(edge,events);
   edge.el.classList.toggle('observed',observed);
   edge.el.classList.toggle('active',Boolean(observed&&target?.status==='running'));
   edge.el.classList.toggle('error',Boolean(observed&&target?.status==='error'));
 });
 cogShowInspector();
 const signature=(cogTrace?.id||'')+':'+cogMode+':'+events.length+':'+(last?.stage||'')+':'+(last?.status||'');
 if(signature!==cogLatestVisualSignature){
   cogLatestVisualSignature=signature;
   cogRenderTimeline(events);
 }
 $('cogTraceSource').textContent=available?
   ('Trace '+String(cogTrace.id||'').slice(0,8)+' · '+(cogTraceOrigin==='reply'?'Réponse HTTP':cogTraceOrigin==='stream'?'Événements instantanés':'Lecture serveur'))
   :'Aucune trace reçue';
}
function cogRenderTimeline(events){
 const list=$('cogEvents');list.replaceChildren();
 $('cogTimelineSummary').textContent=events.length+' événement'+(events.length>1?'s':'')+' horodaté'+(events.length>1?'s':'');
 events.forEach(function(e,i){
   if(e.stage==='request'&&e.status==='running')return;
   if(e.stage==='cycle'&&e.status==='running')return;
   const bt=document.createElement('button');bt.type='button';bt.className='cog-event';bt.dataset.state=e.status;
   const label=document.createElement('b');
   const name=cogStages().find(function(n){return n.id===e.stage;});
   label.textContent=(name?.name||e.stage)+' · '+(COG_STATUS[e.status]||e.status);
   const timing=document.createElement('span');
   timing.textContent='t+'+cogFormatMs(e.elapsed_ms)
     +(e.duration_ms!=null?' / '+cogFormatMs(e.duration_ms):'');
   bt.append(label,timing);
   bt.onclick=function(){
     cogSelected=e.stage;cogSelectedIndex=i;
     renderCognitiveGraph();
     list.querySelectorAll('.cog-event').forEach(function(item){item.classList.remove('active');});
     bt.classList.add('active');
   };
   list.append(bt);
 });
}
function replayCognitiveTrace(){
 if(!cogTrace?.available||cogReplaying)return;
 const events=(cogTrace.events||[]).filter(function(e){
   return e.status!=='running'&&e.stage!=='request'&&e.stage!=='cycle';
 });
 if(!events.length)return;
 const token=++cogReplayVersion,id=cogTrace.id,mode=cogMode;
 cogReplaying=true;$('cogReplay').disabled=true;
 events.forEach(function(entry,i){
   setTimeout(function(){
     if(cogReplayVersion!==token||id!==cogTrace?.id||mode!==cogMode)return;
     const item=cogElements.get(entry.stage);
     if(item){
       item.el.classList.remove('just-verified');
       void item.el.getBoundingClientRect();
       item.el.classList.add('just-verified');
       setTimeout(function(){item.el.classList.remove('just-verified');},650);
     }
     cogEdges.forEach(function(edge){
       if(edge.b!==entry.stage||!cogEventMatchesEdge(edge,cogTrace.events))return;
       edge.el.classList.add('just-verified');
       setTimeout(function(){edge.el.classList.remove('just-verified');},500);
     });
     if(i===events.length-1)setTimeout(function(){
       if(cogReplayVersion===token){cogReplaying=false;renderCognitiveGraph();}
     },720);
   },i*180);
 });
}
function exportCognitiveTrace(){
 if(!cogTrace?.available)return;
 const data=JSON.stringify(cogTrace,null,2);
 const blob=new Blob([data],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');link.href=url;
 link.download='aura-trace-'+String(cogTrace.id||'unknown').slice(0,8)+'.json';
 document.body.append(link);link.click();link.remove();
 setTimeout(function(){URL.revokeObjectURL(url);},1000);
}
function cogSetTransport(mode,label){
  const element=$('cogTransport');
  if(!element)return;
  element.dataset.mode=mode;
  element.textContent=label;
}
function closeCognitiveEventStream(){
  if(cogLiveStream){
    try{cogLiveStream.close();}catch(_){}
    cogLiveStream=null;
  }
  cogStreamReady=false;
  cogSetTransport('poll','Interrogation périodique');
}
function connectCognitiveEventStream(){
  closeCognitiveEventStream();
  if(typeof EventSource==='undefined')return;
  cogSetTransport('pending','Connexion directe…');
  const mode=cogMode;
  const url=apiUrl(mode==='autonomy'
    ? '/api/cognition/autonomy/events' : '/api/cognition/events');
  try{
    const stream=new EventSource(url,{withCredentials:true});
    cogLiveStream=stream;
    stream.onopen=function(){
      if(cogLiveStream===stream&&cogMode===mode){
        cogStreamReady=true;
        cogSetTransport('live','Flux direct connecté');
      }
    };
    stream.addEventListener('trace',function(event){
      if(cogLiveStream!==stream||cogMode!==mode)return;
      let snapshot=null;
      try{snapshot=JSON.parse(event.data);}catch(_){return;}
      if(!snapshot||typeof snapshot!=='object'
        ||!Array.isArray(snapshot.events)||typeof snapshot.available!=='boolean')return;
      if(mode==='dialogue'&&cogTraceId&&snapshot.available
        &&snapshot.id!==cogTraceId)return;
      // An embedded, final trace is authoritative if the streaming proxy
      // routed this connection to another Node instance.
      if(!snapshot.available&&cogTrace?.available)return;
      cogStreamReady=true;
      cogSetTransport('live','Événements directs');
      cogTraceOrigin='stream';
      cogTrace=snapshot;
      renderCognitiveGraph();
    });
    stream.onerror=function(){
      if(cogLiveStream!==stream)return;
      cogStreamReady=false;
      cogSetTransport('poll','Flux indisponible · secours actif');
      // EventSource reconnects automatically on transient network failures.
      // REST polling remains independently available.
      if(stream.readyState===EventSource.CLOSED)closeCognitiveEventStream();
    };
  }catch(_){closeCognitiveEventStream();}
}
function switchCognitiveMode(next){
 const mode=next==='autonomy'?'autonomy':'dialogue';
 if(cogMode===mode)return;
 closeCognitiveEventStream();
 cogMode=mode;cogTrace=null;cogTraceOrigin='poll';
 cogSelected='';cogSelectedIndex=-1;cogAutonomyForbidden=false;
 cogReplayVersion++;cogReplaying=false;cogPanX=0;cogPanY=0;cogZoom=1;
 $('cogModeDialogue').setAttribute('aria-pressed',String(mode==='dialogue'));
 $('cogModeAutonomy').setAttribute('aria-pressed',String(mode==='autonomy'));
 initCognitiveGraph();
 connectCognitiveEventStream();
 if(cogFetchPending)void cogFetchPending.then(function(){if(cogMode===mode)void refreshCognitiveTrace();});
 else void refreshCognitiveTrace();
}
async function refreshCognitiveTrace(){
 if(cogAutonomyForbidden&&cogMode==='autonomy')return;
 if(cogFetchPending)return cogFetchPending;
 cogFetchPending=(async function(){
   const mode=cogMode;
   try{
     const parameter=mode==='dialogue'&&cogTraceId?'?id='+encodeURIComponent(cogTraceId):'';
     const data=await api(mode==='autonomy'?'/api/cognition/autonomy':'/api/cognition/trace'+parameter);
     if(mode!==cogMode)return;
     if(mode==='dialogue'&&cogTraceId&&data.available
       &&data.id!==cogTraceId)return;
     if(mode==='dialogue'&&!data.available&&cogTrace?.available&&cogTrace.id===cogTraceId){
       cogTraceOrigin='reply';renderCognitiveGraph();return;
     }
     cogLastFetchMs=Date.now();
     cogTraceOrigin='poll';cogTrace=data;renderCognitiveGraph();
   }catch(error){
     if(mode!==cogMode)return;
     if(error.status===401&&mode==='autonomy'){
       cogAutonomyForbidden=true;
       closeCognitiveEventStream();
       $('cogState').textContent='Accès privé : authentification fondatrice requise';
     }else{
       $('cogState').textContent='Télémétrie indisponible';
     }
     $('cogDetail').textContent='Le serveur ne confirme pas la disponibilité des traces : '
       +String(error.message||'connexion interrompue');
   }
 })();
 try{await cogFetchPending;}finally{cogFetchPending=null;}
}
async function loopCognitiveTrace(){
  // SSE delivers each genuine event at source. Periodic REST is a safety net
  // for buffering proxies, lost cookies, and multiple Hostinger workers.
  if(!cogStreamReady||cogAwaitingReply||Date.now()-cogLastFetchMs>30000)
    await refreshCognitiveTrace();
  setTimeout(loopCognitiveTrace,cogAwaitingReply?850:cogStreamReady?12500:cogMode==='autonomy'?2200:3200);
}
`;
