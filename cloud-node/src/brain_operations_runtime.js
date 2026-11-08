export const BRAIN_OPERATIONS_SCRIPT = String.raw`(function(){
'use strict';
const $=id=>document.getElementById(id);
const GROUPS={conversation:'Conversation',core:'Noyau et décision',memory:'Mémoire',language:'Langage',provider:'Modèles',security:'Contrôles',tools:'Outils',execution:'Exécution',research:'Recherche'};
const COLORS={conversation:'#ffbb8a',core:'#ffa26e',memory:'#ed80ff',language:'#67fafa',provider:'#ff6e9b',security:'#ff9a9b',tools:'#af77fb',execution:'#ffa866',research:'#69f3f4'};
const POS={
 input:[90,385],kernel:[560,380],homeostasis:[290,470],memory:[310,245],knowledge:[175,162],journal:[110,245],
 cognition:[480,270],attention:[430,122],inference:[485,565],semantic:[680,146],language:[760,295],
 groq:[930,125],openrouter:[948,220],local:[956,315],coherence:[913,430],output:[1080,395],
 web:[638,84],fabric:[690,585],toolbox:[596,530],command:[430,640],dag:[586,690],agent:[274,642],
 bridge:[810,660],github:[906,596],scout:[534,54],curiosity:[390,66],evolution:[226,72],
 trading:[1040,570],audit:[1005,664],voice:[1084,488],peer:[190,566],
 dialogue:[535,170],nativelearning:[300,24],skilllearning:[375,718],reflex:[415,310],
 truth:[560,512],linguisticmemory:[222,320],federation:[1100,173],
 runtime:[605,465],voicefabric:[1050,535],expert:[754,728],horizon:[955,738]
};
const STAGES={input:'Entrée',homeostasis:'Homéostasie',memory:'Mémoire',cognition:'Cognition',web:'Recherche Web',semantic:'Support sémantique',language:'Langage',groq:'Groq',openrouter:'OpenRouter',local:'Modèle local',coherence:'Validation',output:'Réponse',command:'CommandCenter',fabric:'CapabilityFabric',dag:'TaskGraphExecutor',agent:'Agent',bridge:'ExecutionBridge'};
const state={data:null,selected:'kernel',hovered:null,focusGroup:'all',showAllLabels:false,flow:null,replayStarted:0,zoom:1,panX:0,panY:0,screen:[],drag:null,busy:false,lastPrompt:'',lastError:'',pollInFlight:false,drawScheduled:false};
const ANCHORS=new Set(['input','kernel','homeostasis','memory','cognition','language','coherence','output','web','groq','command','fabric','dag','agent','knowledge','inference','toolbox','journal']);
const LENSES=Object.entries(GROUPS);
for(const [group,label] of LENSES){
 for(const id of ['moduleGroup','graphLens']){
  const select=$(id),option=element('option','',label);
  option.value=group;select.append(option);
 }
}
$('graphLens').addEventListener('change',e=>{state.focusGroup=e.target.value;scheduleDraw();});
$('graphLabels').addEventListener('click',()=>{state.showAllLabels=!state.showAllLabels;$('graphLabels').setAttribute('aria-pressed',String(state.showAllLabels));$('graphLabels').textContent=state.showAllLabels?'Noms essentiels':'Tous les noms';scheduleDraw();});
const canvas=$('graphCanvas'),ctx=canvas.getContext('2d'),view=$('graphViewport');
const reduced=window.matchMedia('(prefers-reduced-motion:reduce)').matches;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=s=>{const n=Date.parse(String(s||''));return Number.isFinite(n)?new Date(n).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'medium'}):'—';};
const shortTime=s=>{const n=Date.parse(String(s||''));return Number.isFinite(n)?new Date(n).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';};
const tone=n=>COLORS[n?.group]||'#b8c6d0';
const GROUP_CLOUDS=[['memory',[280,250],220,'217,68,244'],['core',[550,360],265,'245,89,116'],['language',[825,300],240,'23,218,232'],['execution',[660,620],250,'255,137,66'],['research',[390,70],170,'163,74,248']];

function element(name,cls,text){const e=document.createElement(name);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function setText(id,val){const el=$(id);if(el)el.textContent=String(val??'—');}
function dataNodes(){return state.data?.nodes||[];}
function findNode(id){return dataNodes().find(n=>n.id===id);}
function isRecent(n){return n?.activity_verified===true;}
function nodeStateLabel(n){
 if(!n)return 'NON INSPECTÉ';
 if(isRecent(n))return 'ACTIVITÉ OBSERVÉE';
 if(n.state==='not-available')return 'NON DISPONIBLE';
 if(n.state==='configured')return 'CONFIGURÉ';
 if(n.state==='available')return 'DISPONIBLE';
 return 'PRÉSENT DANS LE CODE';
}
function explainNode(n){
 if(!n)return '—';
 if(isRecent(n))return 'Au moins une transition horodatée impliquant ce module a été persistée dans les traces brain-hop.';
 if(n.evidence==='source-code-only')return 'Ce module est détecté dans l’architecture logicielle, mais aucune utilisation récente n’est prouvée par les événements consultés.';
 return 'Aucune activité récente prouvée.';
}

function renderModules(){
 const root=$('moduleList'),needle=$('moduleSearch').value.toLowerCase().trim();
 const groupFilter=$('moduleGroup').value;
 root.replaceChildren();let count=0;
 for(const [group,label] of LENSES){
   if(groupFilter!=='all'&&group!==groupFilter)continue;
   const members=dataNodes().filter(n=>n.group===group);
   const nodes=members.filter(n=>!needle||(n.label+' '+n.code+' '+n.id).toLowerCase().includes(needle));
   if(!nodes.length)continue;
   const verified=members.filter(isRecent).length;
   root.append(element('div','group-label',label+' · '+members.length+' modules'+(verified?' · '+verified+' récent(s)':'')));
   for(const n of nodes){
     count++;
     const row=element('button','module-row'+(isRecent(n)?' recent':'')+(state.selected===n.id?' selected':''));
     row.type='button';row.title=n.label+' — '+n.code+' — '+nodeStateLabel(n);
     const info=element('span','module-description');
     info.append(element('span','name',n.label),element('small','',n.code));
     row.append(element('span','module-light'),info,element('span','state',nodeStateLabel(n)));
     row.addEventListener('click',()=>{selectNode(n.id);state.focusGroup='all';$('graphLens').value='all';const p=project(n.id);state.panX+=canvasW*.5-p.x;state.panY+=canvasH*.5-p.y;scheduleDraw();});
     root.append(row);
   }
 }
 if(!count)root.append(element('p','empty','Aucun module correspondant.'));
 const all=dataNodes(),recent=all.filter(isRecent).length;
 setText('moduleCount',all.length+' modules');
 setText('moduleSummary',count+' affichés · '+recent+' observés récemment · autres présents dans le code (pas forcément actifs).');
}

function renderInspect(){
 const n=findNode(state.selected);
 if(!n)return;
 setText('nodeTitle',n.label);
 setText('nodeState',nodeStateLabel(n));
 $('nodeState').classList.toggle('recent',isRecent(n));
 setText('nodeSource',n.code);
 setText('nodeLast',stamp(n.last_observed_at));
 setText('nodeEvidence',explainNode(n));
 const connections=$('nodeConnections');connections.replaceChildren();
 const edges=(state.data?.edges||[]).filter(e=>e.from===n.id||e.to===n.id);
 if(!edges.length)connections.append(element('small','', 'Aucune dépendance déclarée.'));
 for(const edge of edges.slice(0,24)){
   const other=edge.from===n.id?edge.to:edge.from;
   const peer=findNode(other);
   const btn=element('button','connection-link',(edge.from===n.id?'→ ':'← ')+(peer?.label||other));
   btn.type='button';btn.title=(edge.observed_count||0)+' transition(s) persistée(s), dépendance logicielle déclarée';
   if(edge.observed_count>0)btn.classList.add('observed');
   btn.addEventListener('click',()=>selectNode(other));
   connections.append(btn);
 }
}

function renderRoute(){
 const root=$('routeSteps');root.replaceChildren();
 if(!state.flow){
   setText('flowState',state.busy?'Requête transmise, en attente de transitions persistées…':'Sélectionne un trajet réellement enregistré.');
   setText('currentFlowLabel',state.busy?'Réponse en cours':'Aucun trajet sélectionné');
   setText('currentFlowSummary',state.busy?'Les passages confirmés apparaissent sur le réseau en cyan. Leur association précise à ta requête sera vérifiée à réception du flow_id.':'Envoie une requête à AURA puis observe la chaîne de traitement et les modules effectivement traversés.');
   return;
 }
 const label=(state.flow.state==='completed'?'Réponse produite':'Parcours partiel / incident');
 setText('flowState','Trajet '+state.flow.id.slice(0,13)+' · '+state.flow.step_count+' transitions · '+stamp(state.flow.updated_at)+' · '+label);
 setText('currentFlowLabel',state.flow.id.slice(0,12)+'…');
 setText('currentFlowSummary',state.flow.step_count+' étapes · '+label+' · mise à jour '+shortTime(state.flow.updated_at));
 for(const hop of state.flow.steps){
   const row=element('div','route-step');row.append(element('i'));
   const body=element('div');
   body.append(element('b','',(STAGES[hop.from]||hop.from)+' → '+(STAGES[hop.to]||hop.to)));
   body.append(element('small','',shortTime(hop.at)+' · '+hop.status+(hop.provider?' · '+hop.provider:'')));
   row.append(body);root.append(row);
 }
}

function chooseFlow(id){
 state.flow=(state.data?.flows||[]).find(f=>f.id===id)||null;
 state.replayStarted=performance.now();
 if(state.flow?.steps?.length)state.selected=state.flow.steps[state.flow.steps.length-1].to;
 renderAll();
}

function renderFlows(){
 const root=$('flowList');root.replaceChildren();
 const flows=state.data?.flows||[];
 if(!flows.length){root.append(element('p','empty','Aucun parcours enregistré. Une requête envoyée ici créera des transitions visibles si elles sont effectivement persistées.'));return;}
 for(const flow of flows){
   const btn=element('button','flow-item'+(state.flow?.id===flow.id?' selected':''));
   btn.type='button';
   btn.append(element('b','',flow.step_count+' étapes · '+(flow.state==='completed'?'réponse produite':'parcours partiel')));
   btn.append(element('small','',shortTime(flow.updated_at)+' · ID '+flow.id.slice(0,12)+'…'));
   btn.addEventListener('click',()=>chooseFlow(flow.id));
   root.append(btn);
 }
}

function renderEvents(){
 const root=$('eventList');root.replaceChildren();
 const events=state.data?.events||[];
 if(!events.length){root.append(element('p','empty','Aucun événement récent dans les journaux consultés.'));return;}
 for(const ev of events.slice(0,50)){
   const row=element('div','event-row');row.append(element('i'));
   const body=element('div');
   body.append(element('strong','',ev.label));
   body.append(element('small','',shortTime(ev.at)+' · '+ev.source+' · preuve de journalisation, pas nécessairement succès métier'));
   row.append(body);root.append(row);
 }
}

function renderMetrics(){
 const root=$('metricList');root.replaceChildren();
 const metrics=state.data?.telemetry?.metrics||[];
 for(const m of metrics){
   const row=element('div','metric-line');
   row.append(element('span','',m.label));
   const track=element('div','track'),fill=element('b',m.id==='frustration'?'warm':'');
   const value=m.value===null?0:Math.max(0,Math.min(100,m.value));
   fill.style.width=value+'%';
   track.append(fill);row.append(track);row.append(element('strong','',m.value===null?'—':m.value+' %'));
   root.append(row);
 }
 const telemetry=state.data?.telemetry||{};
 const affectHop=(state.data?.edges||[]).find(edge=>edge.from==='homeostasis'&&edge.to==='language');
 setText('organismMood',telemetry.mood||'Non disponible');
 const somatic=telemetry.somatic||{};
 const readingsFresh=somatic.source==='node-process'&&somatic.freshness?.status==='recent';
 const percent=v=>readingsFresh&&Number.isFinite(v)?v+' %':'—';
 setText('somaticFreshness',readingsFresh?'Mesures récentes':'Non mesuré / ancien');
 setText('somaticCpu',percent(somatic.cpu_utilization));
 setText('somaticHeap',percent(somatic.heap_utilization));
 setText('somaticPressure',percent(somatic.compute_pressure));
 setText('somaticScope',readingsFresh?'Capteurs : processus Node · '+stamp(somatic.freshness?.updated_at)
   :'Capteurs absents ou anciens. Aucun chiffre physique inventé.');
 setText('affectBridge',affectHop?.observed_count>0
   ?'Transmission homéostasie → langage observée : '+affectHop.observed_count+' passage(s) sur 24 h, dernier à '+shortTime(affectHop.last_observed_at)+'. Le modèle reçoit les signaux avant de formuler.'
   :'Aucun passage homéostasie → langage enregistré sur 24 h. Une réponse ne prouve pas que cette liaison a été utilisée.');
 setText('metricTime','Dernière mutation : '+stamp(telemetry.source?.updated_at)+' · état '+(telemetry.source?.status||'non vérifié')+'. Ces indices décrivent un logiciel, pas une émotion biologique.');
}

// Each reported change belongs to the selected persisted flow only.
const CAUSAL_LABELS={
 stabilite:'Stabilité',clarte:'Clarté',confiance:'Confiance',
 satisfaction:'Satisfaction',frustration:'Frustration',
 engagement:'Engagement',agency:'Initiative',
 besoin_de_silence:'Besoin de silence',
};
const DECISION_LABELS={
 respond:'Répondre',greet:'Saluer',report_internal_state:'État interne',
 solve_symbolic_rule:'Résolution symbolique',acknowledge_unrequested:'Correction de dialogue',
 explain_previous_claim:'Vérifier une affirmation',
 clarify_real_activity:'Clarifier une activité',
 clarify_blocker_evidence:'Vérifier un blocage',
 request_verifiable_help:'Demander des preuves',
};
function renderCausal(){
 const flow=state.flow,receipt=flow?.causal||null;
 const values=$('causalValues');values.replaceChildren();
 if(!receipt){
  setText('causalStatus',state.busy?'Traitement en cours':'Non corrélé');
  setText('causalDecision','—');
  setText('causalLanguage','—');
  setText('causalExecution','Non attestée');
  setText('causalEvidence',state.busy
   ?'La requête est transmise. Les traces numérotées et son bilan final ne seront présentés qu’après enregistrement.'
   :flow?'Trajet observé sans bilan causal corrélé. Les états précédents et les décisions ne sont pas disponibles pour ce trajet.'
     :'Choisis un trajet ou envoie une requête. Aucun état ni événement n’est reconstitué sans trace corrélée.');
  setText('causalProvenance',flow
   ?'Source : transitions horodatées. Bilan homéostatique non enregistré pour ce trajet.'
   :'Mesures et indices sont distingués ; aucune conscience ni émotion humaine n’est prétendue.');
  return;
 }
 setText('causalStatus','Bilan corrélé');
 setText('causalDecision',DECISION_LABELS[receipt.decision]||receipt.decision||'Non disponible');
 setText('causalLanguage',receipt.language_outcome==='response-produced'
  ?'Réponse produite':receipt.language_outcome==='response-unavailable'?'Indisponible':'Non vérifiée');
 setText('causalExecution','Non attestée par cette trace');
 setText('causalEvidence',flow.step_count+' transitions corrélées à ce bilan. Décision et changement d’état enregistrés à '+shortTime(receipt.at)+'.');
 const before=receipt.before?.metrics||{},after=receipt.after?.metrics||{};
 for(const [key,label] of Object.entries(CAUSAL_LABELS)){
  if(!Number.isFinite(before[key])||!Number.isFinite(after[key]))continue;
  const delta=Number(receipt.delta?.[key]);
  const row=element('div','causal-value');
  const title=element('span','',label);
  const change=element('strong',delta>0?'positive':delta<0?'negative':'neutral',
   Math.round(before[key]*100)+' → '+Math.round(after[key]*100)+' % · '+
    (Number.isFinite(delta)?(delta>0?'+':'')+(delta*100).toFixed(1)+' pt':'—'));
  row.append(title,change);values.append(row);
 }
 if(!values.children.length)values.append(element('p','empty','Aucune variation chiffrée attestée.'));
 const pressure=receipt.after?.process_pressure;
 const measured=receipt.after?.sensor_source==='node-process';
 setText('causalProvenance','Source : '+receipt.evidence+
   ' · pression calcul '+(measured&&Number.isFinite(pressure)?Math.round(pressure*100)+' % (processus Node)':'non mesurée')+
   ' · états observés pendant le trajet : une variation peut aussi venir d’événements simultanés ; ce ne sont pas des émotions biologiques.');
}
function renderTools(){
 const root=$('toolList');root.replaceChildren();
 const tools=state.data?.observed_tools||[];
 if(!tools.length){root.append(element('p','empty','Aucun appel d’outil consigné sur la période. Un outil installé n’est pas une activité.'));return;}
 for(const tool of tools){
   const row=element('button','tool-row');row.type='button';
   row.append(element('span','tool-light'+(tool.status==='observed-recently'?' fresh':'')));
   const body=element('span');
   body.append(element('b','',tool.label));
   body.append(element('small','',shortTime(tool.observed_at)+' · '+tool.source));
   row.append(body);
   row.addEventListener('click',()=>selectNode(tool.id));
   root.append(row);
 }
}

function renderSourceCallouts(){
 const d=state.data;
 if(!d)return;
 const memory=d.telemetry?.memory||[];
 const reflections=memory.find(m=>m.label==='Réflexions');
 setText('niMemoryCount',Number.isFinite(reflections?.value)?
  reflections.value.toLocaleString('fr-FR'):'—');
 const setNode=(id,timeId,stateId,detailId)=>{
   const n=findNode(id);
   const last=n?.last_observed_at;
   setText(timeId,shortTime(last));
   const mark=$(stateId);
   if(mark){
     mark.textContent=n?.activity_verified?'OBSERVÉ'
       :id==='kernel'&&d.runtime_ready?'JOIGNABLE · PAS DE TRACE RÉCENTE':'NON OBSERVÉ';
     mark.classList.toggle('recent',n?.activity_verified===true);
   }
   if(detailId)setText(detailId,n?.activity_verified?'Transition effectivement persistée'
     :id==='kernel'&&d.runtime_ready?'Service du noyau accessible, aucun passage récent attesté'
       :'Aucune transition récente enregistrée');
 };
 setNode('memory','niMemoryTime','niMemoryState');
 setNode('web','niWebTime','niWebState');
 setNode('kernel','niKernelTime','niKernelState','niKernelInfo');
}

function renderMemory(){
 const root=$('memoryStats');root.replaceChildren();
 const items=state.data?.telemetry?.memory||[];
 if(!items.length){root.append(element('p','empty','Aucune mesure publique de mémoire disponible.'));return;}
 for(const item of items){
  const row=element('div','memory-row');
  row.append(element('span','',item.label),element('strong','',
   Number.isFinite(item.value)?item.value.toLocaleString('fr-FR'):'—'));
  root.append(row);
 }
}

function renderActivity(){
 const root=$('activityStats');root.replaceChildren();
 const flows=state.data.flows||[];
 if(!flows.length){
   root.append(element('p','empty','Aucune mission ou réponse corrélée attestée sur la période.'));
   return;
 }
 for(const flow of flows.slice(0,7)){
   const row=element('div','activity-entry');
   row.append(element('strong','',flow.step_count+' transitions enregistrées · '+(flow.state==='completed'?'réponse finalisée':'chemin partiel')));
   row.append(element('small','',shortTime(flow.updated_at)+' · identifiant '+flow.id.slice(0,12)));
   root.append(row);
 }
}

function renderToolMirror(){
 const root=$('toolMirror');root.replaceChildren();
 const tools=state.data?.observed_tools||[];
 if(!tools.length){
   root.append(element('p','empty','Aucun outil invoqué dans les traces consultées.'));
   return;
 }
 for(const t of tools.slice(0,12)){
   const row=element('div','event-row');
   row.append(element('i'));
   const info=element('div');
   info.append(element('strong','',t.label));
   info.append(element('small','',shortTime(t.observed_at)+' · '+t.source+' · statut : '+t.status));
   row.append(info);root.append(row);
 }
}

function renderRuntimeIncident(){
 const incident=$('runtimeIncident'),diag=state.data?.runtime_diagnostic||{};
 const offline=state.data?.runtime_ready!==true;
 incident.hidden=!offline;
 if(!offline){setText('runtimeFeedback','');return;}
 setText('runtimeTitle',diag.title||'Noyau indisponible · diagnostic incomplet');
 setText('runtimeMessage',diag.action||
   'Le navigateur reçoit la page, mais le serveur n’a pas confirmé le démarrage du noyau.');
 setText('runtimeMeta','État : '+(diag.code||'inconnu')+
   ' · MySQL : '+(diag.db_ready?'connecté':diag.db_configured?'configuré, non confirmé':'non configuré')+
   ' · dernière tentative : '+shortTime(diag.last_attempt_at));
 $('runtimeRetry').disabled=diag.code==='database-unconfigured' || diag.code==='gateway-only' || !!diag.ready;
 $('runtimeRetry').title=$('runtimeRetry').disabled
   ?'Une modification Hostinger est requise avant de relancer.'
   :'Relance protégée par une session propriétaire AURA.';
}
function renderKPIs(){
 const d=state.data;if(!d)return;
 renderRuntimeIncident();
 setText('kModules',d.nodes?.length||0);
 setText('kHops',d.database_observations_available===false?'—':(d.observed_hop_count||0));
 setText('kFlows',d.database_observations_available===false?'—':(d.flows?.length||0));
 setText('kSignals',d.database_observations_available===false?'—':(d.recent_signal_count||0));
 setText('kTools',d.database_observations_available===false?'—':(d.observed_tools?.length||0));
 setText('kOrganism',shortTime(d.telemetry?.source?.updated_at));
 $('graphClock').textContent='Relevé : '+stamp(d.sampled_at)+' · '+
  (d.database_observations_available?'observations publiques confirmées':'journal indisponible — aucune activité vérifiable');
 $('onlineState').dataset.state=d.runtime_ready?'active':'error';
 $('onlineState').lastChild.textContent=d.runtime_ready?'Noyau joignable':'Noyau indisponible';
 $('graphCaption').textContent=d.database_observations_available===false
   ?'Observations indisponibles : réseau architectural affiché sans traces inventées.'
   :'Cyan : transitions observées. Ambre : replay du trajet sélectionné. Gris : architecture déclarée. Données publiques anonymisées.';
}

function renderAll(){renderKPIs();renderSourceCallouts();renderModules();renderInspect();renderRoute();renderCausal();renderFlows();renderEvents();renderTools();renderToolMirror();renderMemory();renderActivity();renderMetrics();scheduleDraw();}
function selectNode(id){state.selected=id;renderModules();renderInspect();scheduleDraw();}

let canvasW=1000,canvasH=700,scale=1;
function sizeCanvas(){
 const r=view.getBoundingClientRect();
 const ratio=Math.min(window.devicePixelRatio||1,2);
 canvas.width=Math.max(1,Math.round(r.width*ratio));
 canvas.height=Math.max(1,Math.round(r.height*ratio));
 ctx.setTransform(ratio,0,0,ratio,0,0);canvasW=r.width;canvasH=r.height;
 scale=Math.min(canvasW/1180,canvasH/790)*state.zoom;
}
function project(id){const p=POS[id]||[560,395];return {x:canvasW*.5+(p[0]-590)*scale+state.panX,y:canvasH*.5+(p[1]-395)*scale+state.panY};}
function edgeMid(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2-28*scale};}
function edgePoint(a,b,t){const m=edgeMid(a,b);return{x:(1-t)*(1-t)*a.x+2*(1-t)*t*m.x+t*t*b.x,y:(1-t)*(1-t)*a.y+2*(1-t)*t*m.y+t*t*b.y};}
function drawEdge(a,b){const m=edgeMid(a,b);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(m.x,m.y,b.x,b.y);}
function roundedLabel(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

function scheduleDraw(){
 if(state.drawScheduled)return;
 state.drawScheduled=true;
 requestAnimationFrame(()=>{
  state.drawScheduled=false;
  draw();
 });
}

// The illuminated strands are geometric segments of the actual declared
// module edges. They are not synthetic neural events. Only persisted
// brain-hop receipts can trigger a moving signal.
function drawNetworkStructure(edges){
 if(!edges.length)return;
 ctx.save();
 const center=project('kernel'),sx=485*scale,sy=300*scale;
 const base=Math.min(canvasW,canvasH);
 // Brain-shaped anatomical frame, decorative only (not biological telemetry).
 const lobe=ctx.createRadialGradient(center.x,center.y,0,center.x,center.y,base*.62);
 lobe.addColorStop(0,'rgba(130,37,130,.09)');
 lobe.addColorStop(.5,'rgba(72,24,93,.10)');
 lobe.addColorStop(1,'rgba(5,3,12,0)');
 ctx.fillStyle=lobe;ctx.fillRect(0,0,canvasW,canvasH);
 const contour=(side)=>{
  ctx.beginPath();
  const x=center.x+side*sx*.06,y=center.y;
  ctx.moveTo(x,y-sy*.8);
  ctx.bezierCurveTo(x+side*sx*.36,y-sy*1.26,x+side*sx*1.02,y-sy*.8,x+side*sx*1.04,y-sy*.1);
  ctx.bezierCurveTo(x+side*sx*1.12,y+sy*.78,x+side*sx*.62,y+sy*1.12,x,y+sy*.79);
  ctx.bezierCurveTo(x-side*sx*.07,y+sy*.42,x-side*sx*.06,y-sy*.4,x,y-sy*.8);
  const c=side<0?'194,85,251':'57,208,237';
  ctx.strokeStyle='rgba('+c+',.17)';ctx.shadowColor='rgba('+c+',.26)';
  ctx.shadowBlur=23;ctx.lineWidth=1.4;ctx.stroke();
 };
 contour(-1);contour(1);
 ctx.shadowBlur=0;
 // Segment points only divide ACTUAL topology edges: no invented connectivity.
 for(let i=0;i<edges.length;i++){
  const edge=edges[i],a=project(edge.from),b=project(edge.to);
  const src=findNode(edge.from);
  const col=(src?.group==='provider'||src?.group==='language'||src?.group==='research')
   ?'89,235,244':src?.group==='core'||src?.group==='execution'
   ?'255,136,119':'219,106,246';
  const observed=edge.observed_count>0;
  // Architecture only: do not draw faux synapses on unobserved links.
  if(!observed)continue;
  for(let k=1;k<=12;k++){
    const t=k/13,p=edgePoint(a,b,t),wiggle=Math.sin((k+i*7)*1.7)*Math.sin(Math.PI*t);
    const dx=b.x-a.x,dy=b.y-a.y,mag=Math.max(1,Math.hypot(dx,dy));
    const spread=(i%3+1)*1.7*wiggle*scale;
    const x=p.x-dy/mag*spread,y=p.y+dx/mag*spread;
    const radius=(observed?1.05:.74)*Math.max(.7,scale)*((k+i)%6===0?1.55:1);
    ctx.fillStyle='rgba('+col+','+(observed?.54:.29)+')';
    ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
    // faint paired contact on same connection, NOT an additional module
    if(k%4===0){
      ctx.strokeStyle='rgba('+col+','+(observed?.17:.065)+')';ctx.lineWidth=.6;
      ctx.beginPath();ctx.moveTo(x,y);
      ctx.lineTo(x-dy/mag*9*scale,y+dx/mag*9*scale);ctx.stroke();
    }
  }
 }
 ctx.restore();
}

function draw(){
 if(!state.data)return;sizeCanvas();ctx.clearRect(0,0,canvasW,canvasH);
 // Ambient breathing is decorative, never represented as observed neural activity.
 const ambient=0; // no decorative animation misread as neural firing
 ctx.save();
 for(const [group,pos,size,color] of GROUP_CLOUDS){
   const c={x:canvasW*.5+(pos[0]-590)*scale+state.panX,y:canvasH*.5+(pos[1]-395)*scale+state.panY};
   const grad=ctx.createRadialGradient(c.x,c.y,2,c.x,c.y,size*scale);
   grad.addColorStop(0,'rgba('+color+','+(.15+.035*ambient)+')');grad.addColorStop(.45,'rgba('+color+',.08)');grad.addColorStop(1,'rgba('+color+',0)');
   ctx.fillStyle=grad;ctx.fillRect(c.x-size*scale,c.y-size*scale,size*2*scale,size*2*scale);
 }
 const d=state.data;const now=Date.now();
 drawNetworkStructure(d.edges||[]);
 const lens=state.focusGroup;
 const inLens=id=>lens==='all'||findNode(id)?.group===lens;
 const elapsed=performance.now()-state.replayStarted;
 const steps=state.flow?.steps||[];
 const replayWindow=steps.length*520+850;
 const replaying=state.flow&&state.replayStarted>0&&elapsed<=replayWindow;
 const currentReplayStep=replaying?Math.min(steps.length-1,Math.floor(elapsed/520)): -1;
 const selectedEdgeSet=new Set(steps.map(s=>s.from+'>'+s.to));
 const activeReplayEdge=steps[currentReplayStep];
 for(const edge of d.edges||[]){
   const a=project(edge.from),b=project(edge.to);const key=edge.from+'>'+edge.to;
   const selected=selectedEdgeSet.has(key);const observed=edge.observed_count>0;const age=edge.last_observed_at?now-Date.parse(edge.last_observed_at):Infinity;const recent=edge.signal_recent===true&&age>=0&&age<20000;
   ctx.save();ctx.globalAlpha=inLens(edge.from)||inLens(edge.to)?1:.12;ctx.lineCap='round';ctx.setLineDash(selected||recent?[]:[4,7]);
   const replayActive=Boolean(replaying&&activeReplayEdge&&activeReplayEdge.from===edge.from&&activeReplayEdge.to===edge.to);
   ctx.lineWidth=replayActive?2.5:recent?1.7:selected?1.3:observed?1:.7;
   ctx.strokeStyle=replayActive?'rgba(255,194,121,.86)':recent?'rgba(101,255,225,.78)':selected?'rgba(224,166,115,.42)':observed?'rgba(154,164,206,.32)':'rgba(105,125,153,.16)';
   ctx.shadowBlur=replayActive?13:recent?10:0;ctx.shadowColor=replayActive?'rgba(255,186,104,.72)':'rgba(95,255,229,.62)';
   drawEdge(a,b);ctx.stroke();ctx.restore();
   if(!reduced){
     const replayPulse=Boolean(replaying&&activeReplayEdge&&activeReplayEdge.from===edge.from&&activeReplayEdge.to===edge.to);
     // Event pulse: one time-bounded traversal after the actual persisted hop.
     // Replay pulse: explicitly user-selected historical route, once per step.
     const eventElapsed=age;
     const livePulse=recent&&eventElapsed>=0&&eventElapsed<1600;
     if(replayPulse||livePulse){
       const progress=replayPulse?Math.min(1,(elapsed%520)/520):Math.min(1,eventElapsed/1600);
       const p=edgePoint(a,b,progress);const halo=ctx.createRadialGradient(p.x,p.y,1,p.x,p.y,replayPulse?12:10);
       const pulseColor=replayPulse?'255,186,104':'94,255,226';
       halo.addColorStop(0,'rgba(255,255,255,1)');halo.addColorStop(.22,'rgba('+pulseColor+',.95)');halo.addColorStop(1,'rgba('+pulseColor+',0)');
       ctx.fillStyle=halo;ctx.beginPath();ctx.arc(p.x,p.y,replayPulse?12:10,0,Math.PI*2);ctx.fill();
     }
   }
 }
 state.screen=[];
 const labelCandidates=[];
 for(const node of d.nodes||[]){
   const p=project(node.id);const selected=node.id===state.selected;const active=isRecent(node);const base=selected?16:active?13:6;const r=base*scale;
   state.screen.push({id:node.id,x:p.x,y:p.y,r:Math.max(r,14)});
   ctx.save();ctx.globalAlpha=(inLens(node.id)?1:.22)*(selected||active?1:.35);
   const glow=ctx.createRadialGradient(p.x,p.y,1,p.x,p.y,r*3.2);
   const rgb=selected?'243,180,132':active?'135,244,234':tone(node).replace('#','');
   glow.addColorStop(0,selected?'rgba(255,191,105,.86)':active?'rgba(94,255,225,.85)':'rgba(221,110,245,.38)');
   glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(p.x,p.y,r*3.2,0,Math.PI*2);ctx.fill();
   ctx.beginPath();ctx.shadowBlur=selected?17:active?13:0;ctx.shadowColor=selected?'#ffb768':active?'#71ffe0':tone(node);ctx.fillStyle=selected?'#ffbf78':active?'#78ffe1':tone(node);ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
   ctx.lineWidth=selected?2.4:1.5;ctx.strokeStyle=selected?'#fff2de':active?'#d7fff8':'rgba(255,222,248,.6)';ctx.stroke();
   ctx.beginPath();ctx.fillStyle='rgba(255,255,255,.95)';ctx.arc(p.x,p.y,Math.max(1.5,r*.22),0,Math.PI*2);ctx.fill();

   ctx.restore();
   if(selected||node.id===state.hovered||active||ANCHORS.has(node.id)||state.showAllLabels||state.zoom>1.55)
     labelCandidates.push({node,p,r,selected,active,priority:selected?100:node.id===state.hovered?90:active?80:ANCHORS.has(node.id)?50:10});
 }
 // Labels are information overlays, not artificial neurons. Avoid overlaps
 // while keeping every underlying node available through the sidebar.
 const placed=[];
 labelCandidates.sort((a,b)=>b.priority-a.priority);
 for(const item of labelCandidates){
   const {node,p,r,selected,active}=item;
   if(!inLens(node.id)&&!selected)continue;
   const label=node.label.length>24?node.label.slice(0,23)+'…':node.label;
   const font=11;ctx.font='600 '+font+'px system-ui';
   const tagW=ctx.measureText(label).width+18,tagH=21;
   const offsets=[[r+8,-tagH/2],[-r-8-tagW,-tagH/2],[r+8,15],[-r-8-tagW,-tagH-12]];
   let rect=null;
   for(const [dx,dy] of offsets){
     const x=p.x+dx,y=p.y+dy;
     if(x<8||x+tagW>canvasW-8||y<36||y+tagH>canvasH-10)continue;
     if(placed.some(b=>x<b.x+b.w+4&&x+tagW+4>b.x&&y<b.y+b.h+4&&y+tagH+4>b.y))continue;
     rect={x,y,w:tagW,h:tagH};break;
   }
   if(!rect)continue;
   placed.push(rect);
   ctx.fillStyle='rgba(7,11,19,.88)';
   ctx.strokeStyle=selected?'rgba(255,185,110,.88)':active?'rgba(110,255,239,.70)':'rgba(131,151,186,.34)';
   ctx.lineWidth=selected?1.4:.8;
   roundedLabel(rect.x,rect.y,rect.w,rect.h,7);ctx.fill();ctx.stroke();
   ctx.fillStyle=selected?'#ffdfbd':active?'#bdfdf2':'#cfdeeb';
   ctx.fillText(label,rect.x+9,rect.y+14.5);
 }
 ctx.restore();
 if((d.edges||[]).some(e=>e.signal_recent&&Date.now()-Date.parse(e.last_observed_at||'')<1800)||replaying)scheduleDraw();
}

function inside(hit,x,y){const dx=x-hit.x,dy=y-hit.y;return Math.sqrt(dx*dx+dy*dy)<=Math.max(18,hit.r+6);}
canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect();state.drag={x:e.clientX-r.left,y:e.clientY-r.top,panX:state.panX,panY:state.panY,moved:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{
 const bounds=canvas.getBoundingClientRect(),x=e.clientX-bounds.left,y=e.clientY-bounds.top;
 if(state.drag){
  const dx=x-state.drag.x,dy=y-state.drag.y;
  if(Math.abs(dx)+Math.abs(dy)>5)state.drag.moved=true;
  if(state.drag.moved){state.panX=state.drag.panX+dx;state.panY=state.drag.panY+dy;scheduleDraw();}
  return;
 }
 const hit=[...state.screen].reverse().find(item=>inside(item,x,y));
 const id=hit?.id||null;
 if(state.hovered!==id){
   state.hovered=id;
   const n=id?findNode(id):null;
   setText('graphHover',n?n.label+' · '+nodeStateLabel(n)+' · '+shortTime(n.last_observed_at):'Survole un point pour identifier son module.');
   canvas.style.cursor=n?'pointer':'grab';scheduleDraw();
 }
});
canvas.addEventListener('pointerleave',()=>{state.hovered=null;setText('graphHover','Survole un point pour identifier son module.');scheduleDraw();});
canvas.addEventListener('pointerup',e=>{const drag=state.drag;state.drag=null;if(!drag||drag.moved)return;const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;const hit=[...state.screen].reverse().find(item=>inside(item,x,y));if(hit)selectNode(hit.id);});
canvas.addEventListener('wheel',e=>{e.preventDefault();state.zoom=Math.min(3,Math.max(.6,state.zoom*(e.deltaY>0?.92:1.08)));scheduleDraw();},{passive:false});
$('graphMore').onclick=()=>{state.zoom=Math.min(3,state.zoom*1.15);scheduleDraw();};$('graphLess').onclick=()=>{state.zoom=Math.max(.6,state.zoom/1.15);scheduleDraw();};$('graphReset').onclick=()=>{state.zoom=1;state.panX=0;state.panY=0;scheduleDraw();};
window.addEventListener('resize',scheduleDraw,{passive:true});
$('moduleSearch').addEventListener('input',renderModules);
$('moduleGroup').addEventListener('change',renderModules);

document.querySelectorAll('[data-focus]').forEach(button=>{
 button.addEventListener('click',()=>{
   const target=button.getAttribute('data-focus');
   const node=$(target);
   if(!node)return;
   if(target==='chatInput')node.focus();
   else node.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});
   document.querySelectorAll('[data-focus]').forEach(x=>
     x.classList.toggle('scene-active',x===button));
 });
});
document.querySelectorAll('[data-inspect]').forEach(panel=>{
 const open=()=>selectNode(panel.getAttribute('data-inspect'));
 panel.addEventListener('click',open);
 panel.addEventListener('keydown',ev=>{
  if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();open();}
 });
});


async function poll(){
 if(state.pollInFlight)return;
 state.pollInFlight=true;
 try{
   const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),10000);let res;
   try{res=await fetch('/api/brain/graph',{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'},signal:ctrl.signal});}finally{clearTimeout(timer);}
   if(!res.ok)throw new Error('HTTP '+res.status);
   const data=await res.json();
   if(data.version!=='brain-flow-v1'||!Array.isArray(data.nodes)||!Array.isArray(data.edges))throw new Error('Schéma réseau invalide');
   state.data=data;if(state.flow)state.flow=data.flows.find(f=>f.id===state.flow.id)||null;if(!findNode(state.selected))state.selected='kernel';state.lastError='';renderAll();
 }catch(err){
   state.lastError=String(err&&err.message||err).slice(0,120);
   $('onlineState').dataset.state='error';
   $('onlineState').lastChild.textContent='API indisponible · '+state.lastError;
   $('graphClock').textContent='Requête échouée · aucune donnée fraîche';
   $('runtimeIncident').hidden=false;
   setText('runtimeTitle','Connexion au serveur interrompue');
   setText('runtimeMessage','Le relevé du noyau est impossible : '+state.lastError);
   setText('runtimeMeta','Aucune activité, mémoire ni exécution ne peut être confirmée.');
   $('runtimeRetry').hidden=true;
 }finally{state.pollInFlight=false;}
}
$('refreshMap').onclick=poll;
$('runtimeCheck').onclick=()=>void poll();
$('runtimeRetry').onclick=async()=>{
 const button=$('runtimeRetry');if(button.disabled)return;
 button.disabled=true;setText('runtimeFeedback','Demande de redémarrage envoyée à l’API privée…');
 try{
  const res=await fetch('/api/bootstrap/retry',{
   method:'POST',credentials:'same-origin',
   headers:{Accept:'application/json','Content-Type':'application/json'},
   body:'{}',
  });
  if(res.status===401||res.status===403)
   setText('runtimeFeedback','Session propriétaire requise : aucune relance effectuée.');
  else if(!res.ok)
   setText('runtimeFeedback','Relance refusée (HTTP '+res.status+'). Vérifier le journal Hostinger.');
  else {
   const data=await res.json();
   setText('runtimeFeedback',data.runtime_ready
     ?'Noyau démarré et confirmé.' : 'Relance terminée, mais le noyau reste indisponible. Vérifier la configuration Hostinger.');
   await poll();
  }
 }catch{
   setText('runtimeFeedback','Relance impossible : API indisponible.');
 }finally{button.disabled=false;}
};
fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'})
 .then(r=>r.ok?r.json():null)
 .then(result=>{$('runtimeRetry').hidden=result?.authenticated!==true;})
 .catch(()=>{$('runtimeRetry').hidden=true;});
setInterval(()=>{if(!document.hidden)poll();},state.busy?900:5000);
// Extra poll while an AURA response is in flight: the graph can show database-
// committed module hops BEFORE the model produces its final answer.
setInterval(()=>{if(state.busy&&!document.hidden)void poll();},950);

const history=$('chatHistory');
$('chatExpand').onclick=()=>{$('conversation-panel').scrollIntoView({behavior:reduced?'auto':'smooth',block:'nearest'});};
function chatLine(role,text,kind=''){const item=element('div','chat-message '+kind);item.append(element('small','',role),element('span','',text));history.append(item);while(history.children.length>26)history.firstElementChild.remove();history.classList.add('open');history.scrollTop=history.scrollHeight;}
$('chatMode').addEventListener('change',()=>{
 const mission=$('chatMode').value==='mission';
 $('chatInput').placeholder=mission
  ?'Décris une mission ; AURA affichera l’exécution réelle ou le plan seul…'
  :'Interroge AURA puis suis les véritables modules traversés…';
 $('chatSend').textContent=mission?'Lancer':'Envoyer';
});

$('chatSend').onclick=async()=>{
 const field=$('chatInput'),msg=field.value.trim();
 if(!msg||state.busy)return;
 const mission=$('chatMode').value==='mission';
 state.busy=true;
 state.flow=null;state.replayStarted=0;
 $('chatSend').disabled=true;field.value='';
 state.lastPrompt=msg;setText('requestPreview',msg);
 chatLine('VOUS · '+(mission?'MISSION':'DIALOGUE'),msg,'user');
 renderRoute();
 renderCausal();
 setText('currentFlowSummary',mission
   ?'Mission explicitement demandée. Vérification des étapes d’exécution en cours…'
   :'Message envoyé. Lecture des transitions réellement enregistrées…');
 scheduleDraw();
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),65000);
 try{
   void poll();
   const endpoint=mission?'/api/kernel/operator':'/api/chat';
   const body=mission?{task:msg,allowed_risks:[]}:{text:msg,author:'Utilisateur'};
   const res=await fetch(endpoint,{
     method:'POST',credentials:'same-origin',
     headers:{'Content-Type':'application/json',Accept:'application/json'},
     body:JSON.stringify(body),signal:ctrl.signal,
   });
   let out;
   try{out=await res.json();}catch{throw Error('Réponse serveur non lisible');}
   if((res.status===401||res.status===403)&&mission){
     field.value=msg;
     chatLine('AURA · ACTION PROTÉGÉE','Les observations sont ouvertes. Cette commande peut modifier le serveur : son exécution exige une autorisation distincte. La requête reste dans le champ de saisie.');
   }else if(!res.ok||out?.ok!==true){
     // Model failure is not a failed/unedited user command. Keep text
     // available for a deliberate retry; a POST may have been persisted.
     const speechUnavailable=!mission&&(out?.language_unavailable===true
       ||out?.service_status?.code==='french-inference-unavailable');
     field.value=msg;
     if(speechUnavailable){
       chatLine('AURA · LANGAGE INDISPONIBLE',
         'Le noyau a reçu ta question, mais la formulation n’a pas été confirmée. Réessaie lorsque le modèle répond ; ton message reste dans le champ de saisie.');
     }else{
       const failure=typeof out?.error==='string'?out.error:'Le service n’a pas confirmé cette demande.';
       chatLine('SERVICE · ERREUR',failure.slice(0,750));
     }
   }else if(mission){
     const executed=out.executed===true;
     const details=typeof out.plan==='string'?out.plan
       :typeof out.answer==='string'?out.answer
       :out.result?.summary||out.result?.message||'Aucun compte rendu textuel détaillé disponible.';
     chatLine(executed?'AURA · EXÉCUTION CONFIRMÉE':'AURA · PLAN SEUL, NON EXÉCUTÉ',
       'Mode : '+String(out.execution_mode||'non précisé')+'\n'+
       (executed?'Exécution attestée par le moteur.':'Aucune exécution attestée.')+
       '\n'+String(details).slice(0,3200));
   }else{
     const answer=String(out?.answer||'').trim();
     if(!answer||out.language_unavailable){
       chatLine('MOTEUR INDISPONIBLE','Aucun texte vérifiable généré ; consulter le diagnostic.');
     }else{
       chatLine(out.nucleus_verbalization_validated
         ?'AURA':'AURA · FORMULATION À VÉRIFIER',answer);
     }
   }
   await poll();
   if(out?.brain_flow_id){
     let flow=state.data?.flows?.find(f=>f.id===out.brain_flow_id);
     if(!flow){
       await new Promise(resolve=>setTimeout(resolve,400));
       await poll();
       flow=state.data?.flows?.find(f=>f.id===out.brain_flow_id);
     }
     if(flow)chooseFlow(flow.id);
     else setText('currentFlowSummary',state.data?.database_observations_available===false
       ?'La base des événements est indisponible : trajet non attesté.'
       :'Réponse reçue, mais aucun trajet corrélé n’est présent dans les traces consultées.');
   }
 }catch(error){
   field.value=msg;
   chatLine('SERVICE · ÉCHEC',
     error?.name==='AbortError'?'Délai dépassé. Le traitement peut déjà être enregistré ; vérifie le trajet avant de renvoyer. Ton message est conservé.':
     'Connexion impossible : '+String(error?.message||error).slice(0,220));
 }finally{
   clearTimeout(timer);state.busy=false;
   $('chatSend').disabled=false;field.focus();
 }
};
$('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chatSend').click();}});

// Low-rate ambient redraw makes the diagram feel alive without manufacturing tool calls.
// Persisted events alone create travelling pulses; honor reduced-motion and hidden tabs.
if(!reduced)setInterval(()=>{if(!document.hidden&&state.data&&!state.drawScheduled)scheduleDraw();},125);
poll();
})();`;
