export const BRAIN_OPERATIONS_SCRIPT = String.raw`(function(){
'use strict';
const $=id=>document.getElementById(id);
const GROUPS={conversation:'Conversation',core:'Noyau et décision',memory:'Mémoire',language:'Langage',provider:'Modèles',security:'Contrôles',tools:'Outils',execution:'Exécution',research:'Recherche'};
const COLORS={conversation:'#f0bb88',core:'#eea7a1',memory:'#c2a0ff',language:'#6ae3d8',provider:'#7ecbff',security:'#e5b086',tools:'#9bd9f1',execution:'#ef9cab',research:'#c8c59b'};
const POS={
 input:[90,385],kernel:[560,380],homeostasis:[290,470],memory:[310,245],knowledge:[175,162],journal:[110,245],
 cognition:[480,270],attention:[430,122],inference:[485,565],semantic:[680,146],language:[760,295],
 groq:[930,125],openrouter:[948,220],local:[956,315],coherence:[913,430],output:[1080,395],
 web:[638,84],fabric:[690,585],toolbox:[596,530],command:[430,640],dag:[586,690],agent:[274,642],
 bridge:[810,660],github:[906,596],scout:[534,54],curiosity:[390,66],evolution:[226,72],
 trading:[1040,570],audit:[1005,664],voice:[1084,488],peer:[190,566]
};
const STAGES={input:'Entrée',homeostasis:'Homéostasie',memory:'Mémoire',cognition:'Cognition',web:'Recherche Web',semantic:'Support sémantique',language:'Langage',groq:'Groq',openrouter:'OpenRouter',local:'Modèle local',coherence:'Validation',output:'Réponse',command:'CommandCenter',fabric:'CapabilityFabric',dag:'TaskGraphExecutor',agent:'Agent',bridge:'ExecutionBridge'};
const state={data:null,selected:'kernel',flow:null,replayStarted:0,zoom:1,panX:0,panY:0,screen:[],drag:null,busy:false,lastPrompt:'',lastError:'',pollInFlight:false};
const canvas=$('graphCanvas'),ctx=canvas.getContext('2d'),view=$('graphViewport');
const reduced=window.matchMedia('(prefers-reduced-motion:reduce)').matches;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=s=>{const n=Date.parse(String(s||''));return Number.isFinite(n)?new Date(n).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'medium'}):'—';};
const shortTime=s=>{const n=Date.parse(String(s||''));return Number.isFinite(n)?new Date(n).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';};
const tone=n=>COLORS[n?.group]||'#b8c6d0';
const GROUP_CLOUDS=[['memory',[280,250],200,'150,112,225'],['core',[550,360],250,'196,94,109'],['language',[825,300],230,'74,196,186'],['execution',[660,620],250,'190,126,126'],['research',[390,70],150,'158,152,98']];

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
 const root=$('moduleList'), needle=$('moduleSearch').value.toLowerCase().trim();
 root.replaceChildren();
 let count=0;
 for(const [group,label] of Object.entries(GROUPS)){
   const nodes=dataNodes().filter(n=>n.group===group && (!needle || (n.label+' '+n.code+' '+n.id).toLowerCase().includes(needle)));
   if(!nodes.length)continue;
   root.append(element('div','group-label',label));
   for(const n of nodes){
     count++;
     const row=element('button','module-row'+(isRecent(n)?' recent':'')+(state.selected===n.id?' selected':''));
     row.type='button';
     row.append(element('span','module-light'),element('span','name',n.label),element('span','state',nodeStateLabel(n)));
     row.addEventListener('click',()=>selectNode(n.id));
     root.append(row);
   }
 }
 if(!count)root.append(element('p','empty','Aucun module correspondant.'));
 setText('moduleCount',dataNodes().length+' modules');
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
}

function renderRoute(){
 const root=$('routeSteps');root.replaceChildren();
 if(!state.flow){
   setText('flowState','Sélectionne un trajet réellement enregistré.');
   setText('currentFlowLabel','Aucun trajet sélectionné');
   setText('currentFlowSummary','Envoie une requête à AURA puis observe la chaîne de traitement et les modules effectivement traversés.');
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
 if(!state.data?.authorized){root.append(element('p','empty','Connexion propriétaire requise pour observer les trajets individuels.'));return;}
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
 if(!state.data?.authorized){root.append(element('p','empty','Journal accessible uniquement en session propriétaire AURA.'));return;}
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
 setText('metricTime','Dernière mutation : '+stamp(state.data?.telemetry?.source?.updated_at)+' · état '+(state.data?.telemetry?.source?.status||'non vérifié')+'. Ces indices décrivent un logiciel, pas une émotion biologique.');
}

function renderTools(){
 const root=$('toolList');root.replaceChildren();
 if(!state.data?.authorized){root.append(element('p','empty','Connexion propriétaire nécessaire pour afficher les appels d’outils.'));return;}
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

function renderKPIs(){
 const d=state.data;if(!d)return;
 setText('kModules',d.nodes?.length||0);
 setText('kHops',d.authorized?d.observed_hop_count:'🔒');
 setText('kFlows',d.authorized?(d.flows?.length||0):'🔒');
 setText('kSignals',d.authorized?d.recent_signal_count:'🔒');
 setText('kTools',d.authorized?(d.observed_tools?.length||0):'🔒');
 setText('kOrganism',shortTime(d.telemetry?.source?.updated_at));
 $('graphClock').textContent='Relevé : '+stamp(d.sampled_at)+' · '+(d.authorized?'session privée active':'vue architecture seule');
 $('onlineState').dataset.state=d.runtime_ready?'active':'error';
 $('onlineState').lastChild.textContent=d.runtime_ready?'Noyau joignable':'Noyau indisponible';
 $('graphCaption').textContent=d.authorized?
   'Cyan : transitions observées récemment. Ambre : replay du trajet sélectionné. Gris : dépendances déclarées dans le code. Aucun flux n’est inventé.'
  :'Connecte la session propriétaire pour afficher les trajets et outils réels. La carte reste muette lorsqu’aucune preuve n’est disponible.';
 $('authState').textContent=d.authorized?'Session propriétaire active · trajets détaillés autorisés':'Session propriétaire requise pour les flux détaillés';
 $('ownerFields').hidden=d.authorized;$('ownerArea').hidden=d.authorized;
}

function renderAll(){renderKPIs();renderModules();renderInspect();renderRoute();renderFlows();renderEvents();renderTools();renderMetrics();draw();}
function selectNode(id){state.selected=id;renderModules();renderInspect();draw();}

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

function draw(){
 if(!state.data)return;sizeCanvas();ctx.clearRect(0,0,canvasW,canvasH);
 ctx.save();
 for(const [group,pos,size,color] of GROUP_CLOUDS){
   const c={x:canvasW*.5+(pos[0]-590)*scale+state.panX,y:canvasH*.5+(pos[1]-395)*scale+state.panY};
   const grad=ctx.createRadialGradient(c.x,c.y,2,c.x,c.y,size*scale);
   grad.addColorStop(0,'rgba('+color+',.18)');grad.addColorStop(.45,'rgba('+color+',.08)');grad.addColorStop(1,'rgba('+color+',0)');
   ctx.fillStyle=grad;ctx.fillRect(c.x-size*scale,c.y-size*scale,size*2*scale,size*2*scale);
 }
 const d=state.data;const now=Date.now();
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
   ctx.save();ctx.lineCap='round';ctx.setLineDash(selected||recent?[]:[4,7]);
   ctx.lineWidth=selected?2.8:recent?2.1:observed?1.15:.8;
   ctx.strokeStyle=selected?'rgba(243,180,132,.82)':recent?'rgba(135,244,234,.86)':observed?'rgba(115,171,192,.38)':'rgba(116,136,151,.18)';
   ctx.shadowBlur=selected?16:recent?13:0;ctx.shadowColor=selected?'rgba(243,180,132,.88)':'rgba(135,244,234,.92)';
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
       const pulseColor=replayPulse?'243,180,132':'135,244,234';
       halo.addColorStop(0,'rgba(255,255,255,1)');halo.addColorStop(.22,'rgba('+pulseColor+',.95)');halo.addColorStop(1,'rgba('+pulseColor+',0)');
       ctx.fillStyle=halo;ctx.beginPath();ctx.arc(p.x,p.y,replayPulse?12:10,0,Math.PI*2);ctx.fill();
     }
   }
 }
 state.screen=[];
 for(const node of d.nodes||[]){
   const p=project(node.id);const selected=node.id===state.selected;const active=isRecent(node);const base=selected?16:active?13:11;const r=base*scale;
   state.screen.push({id:node.id,x:p.x,y:p.y,r:Math.max(r,14)});
   const glow=ctx.createRadialGradient(p.x,p.y,1,p.x,p.y,r*3.2);
   const rgb=selected?'243,180,132':active?'135,244,234':tone(node).replace('#','');
   glow.addColorStop(0,selected?'rgba(243,180,132,.45)':active?'rgba(135,244,234,.38)':'rgba(180,198,209,.18)');
   glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(p.x,p.y,r*3.2,0,Math.PI*2);ctx.fill();
   ctx.beginPath();ctx.fillStyle=selected?'#f3b484':active?'#7df3e2':tone(node);ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();
   ctx.lineWidth=selected?2.4:1.5;ctx.strokeStyle=selected?'#fff2de':active?'#d7fff8':'rgba(255,255,255,.25)';ctx.stroke();
   ctx.beginPath();ctx.fillStyle='rgba(255,255,255,.95)';ctx.arc(p.x,p.y,Math.max(1.5,r*.22),0,Math.PI*2);ctx.fill();
   const label=node.label.length>18?node.label.slice(0,18)+'…':node.label;const font=Math.max(9,Math.min(12,11.5*scale));ctx.font='600 '+font+'px system-ui';const tw=ctx.measureText(label).width;const tagW=tw+28,tagH=Math.max(20,18*scale);const tx=p.x+r+8,ty=p.y-tagH/2;
   ctx.fillStyle='rgba(7,11,17,.88)';ctx.strokeStyle=selected?'rgba(243,180,132,.7)':active?'rgba(135,244,234,.6)':'rgba(78,97,113,.55)';ctx.lineWidth=1;roundedLabel(tx,ty,tagW,tagH,8);ctx.fill();ctx.stroke();
   ctx.fillStyle=selected?'#fff0df':active?'#ebfffb':'#d8e5ec';ctx.fillText(label,tx+10,ty+tagH/2+font*.32-2);
 }
 ctx.restore();
 if((d.edges||[]).some(e=>e.signal_recent&&Date.now()-Date.parse(e.last_observed_at||'')<1800)||replaying)requestAnimationFrame(draw);
}

function inside(hit,x,y){const dx=x-hit.x,dy=y-hit.y;return Math.sqrt(dx*dx+dy*dy)<=Math.max(18,hit.r+6);}
canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect();state.drag={x:e.clientX-r.left,y:e.clientY-r.top,panX:state.panX,panY:state.panY,moved:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!state.drag)return;const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;const dx=x-state.drag.x,dy=y-state.drag.y;if(Math.abs(dx)+Math.abs(dy)>5)state.drag.moved=true;if(state.drag.moved){state.panX=state.drag.panX+dx;state.panY=state.drag.panY+dy;draw();}});
canvas.addEventListener('pointerup',e=>{const drag=state.drag;state.drag=null;if(!drag||drag.moved)return;const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;const hit=[...state.screen].reverse().find(item=>inside(item,x,y));if(hit)selectNode(hit.id);});
canvas.addEventListener('wheel',e=>{e.preventDefault();state.zoom=Math.min(3,Math.max(.6,state.zoom*(e.deltaY>0?.92:1.08)));draw();},{passive:false});
$('graphMore').onclick=()=>{state.zoom=Math.min(3,state.zoom*1.15);draw();};$('graphLess').onclick=()=>{state.zoom=Math.max(.6,state.zoom/1.15);draw();};$('graphReset').onclick=()=>{state.zoom=1;state.panX=0;state.panY=0;draw();};
window.addEventListener('resize',draw,{passive:true});$('moduleSearch').addEventListener('input',renderModules);

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
   state.lastError=String(err&&err.message||err).slice(0,120);$('onlineState').dataset.state='error';$('onlineState').lastChild.textContent='API indisponible · '+state.lastError;$('graphClock').textContent='Requête échouée · aucune donnée fraîche';
 }finally{state.pollInFlight=false;}
}
$('refreshMap').onclick=poll;setInterval(()=>{if(!document.hidden)poll();},state.busy?900:5000);
// Extra poll while an AURA response is in flight: the graph can show database-
// committed module hops BEFORE the model produces its final answer.
setInterval(()=>{if(state.busy&&!document.hidden)void poll();},950);

$('ownerSignIn').onclick=async()=>{
 const field=$('ownerKey');const secret=field.value.trim();if(!secret)return;$('ownerSignIn').disabled=true;
 try{
   const res=await fetch('/api/auth/session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:secret})});
   const out=await res.json();if(!res.ok||out.authenticated!==true)throw new Error('Accès refusé');field.value='';await poll();
 }catch(_){$('authState').textContent='Clé non validée. Vérifier la session propriétaire AURA.';}
 finally{field.value='';$('ownerSignIn').disabled=false;}
};

const history=$('chatHistory');
$('chatExpand').onclick=()=>{const open=!history.classList.contains('open');history.classList.toggle('open',open);$('chatExpand').setAttribute('aria-expanded',String(open));};
function chatLine(role,text,kind=''){const item=element('div','chat-message '+kind);item.append(element('small','',role),element('span','',text));history.append(item);while(history.children.length>26)history.firstElementChild.remove();history.classList.add('open');history.scrollTop=history.scrollHeight;$('chatExpand').setAttribute('aria-expanded','true');}
$('chatSend').onclick=async()=>{
 const field=$('chatInput');const msg=field.value.trim();if(!msg||state.busy)return;state.busy=true;$('chatSend').disabled=true;field.value='';state.lastPrompt=msg;setText('requestPreview',msg);chatLine('VOUS',msg,'user');
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),60000);
 try{
   void poll();
   const res=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({text:msg,author:'Utilisateur'}),signal:ctrl.signal});
   const out=await res.json();const answer=String(out.answer||'').trim();
   if(!res.ok||!out.ok||!answer){chatLine('SERVICE','Le moteur de langage n’a pas fourni de réponse vérifiable.');}
   else{chatLine(out.nucleus_verbalization_validated?'AURA · NOYAU CONTRÔLÉ':'AURA · TEXTE NON ATTESTÉ',answer);}
   await poll();
   if(out.brain_flow_id){const flow=state.data?.flows?.find(f=>f.id===out.brain_flow_id);if(flow)chooseFlow(flow.id);else setText('currentFlowSummary','Réponse reçue, mais aucun trajet corrélé n’est encore disponible en base.');} 
 }catch(_){chatLine('SERVICE','Connexion impossible. Aucun dialogue de remplacement n’a été généré.');}
 finally{clearTimeout(timer);state.busy=false;$('chatSend').disabled=false;field.focus();}
};
$('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chatSend').click();}});

poll();
})();`;
