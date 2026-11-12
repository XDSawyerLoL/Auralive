// Browser research interface embedded inside the ONE AURA brain-and-chat page.
// No pseudo-neural animation. All voltage paths are numeric traces from a
// declared scientific equation or private experiment; real NWB is statistics only.
export const BRAIN_BIOPHYSICS_HTML=String.raw`
<section class="bio-research" id="bioEvidencePanel" aria-label="Laboratoire biophysique et preuves humaines">
  <div class="bio-heading">
    <div class="bio-heading-title">
      <span class="bio-kicker">RECHERCHE BIOLOGIQUE · LECTURE SEULE</span>
      <h3>Du neurone humain au cerveau <span class="bio-version">/ Étape mesurée</span></h3>
      <p>Signaux électriques calculés, enregistrements humains et lacunes anatomiques — distincts des activités logicielles d'AURA.</p>
    </div>
    <span class="bio-evidence-tag" id="bioEvidenceBadge">Preuves en cours de chargement</span>
  </div>
  <div class="bio-scope-note" role="note">
    <strong>Important :</strong> les points du connectome ci-dessus sont des <em>modules logiciels</em>.
    Les courbes ci-dessous concernent un banc de recherche <em>électrophysiologique</em>,
    pas les pensées ni l'activité biologique en temps réel d'AURA.
  </div>
  <div class="bio-modes" role="group" aria-label="Afficher les preuves biologiques">
    <button type="button" id="bioModeHuman" aria-pressed="true">Cellule humaine / RC</button>
    <button type="button" id="bioModeHH" aria-pressed="false">Décharges / banc HH</button>
    <button type="button" id="bioModeAtlas" aria-pressed="false">Structures / maturité</button>
  </div>
  <div class="bio-pane" id="bioSignalPane">
    <div class="bio-signal">
      <div class="bio-chart-header">
        <div><b id="bioTraceTitle">Potentiel membranaire</b><small id="bioTraceSub">Chargement d'une prévision calculée…</small></div>
        <span id="bioTraceSource" class="bio-truth" data-claim="calculated">CALCULÉ</span>
      </div>
      <canvas id="bioVoltageCanvas" height="200" role="img" aria-label="Courbes de tension issues des équations électrophysiologiques, non enregistrements NWB"></canvas>
      <div id="bioChartLegend" class="bio-legend">Les tracés ne sont jamais des impulsions inventées.</div>
      <button type="button" id="bioRunHH" class="bio-run-btn" hidden>Lancer une simulation électrophysiologique privée</button>
      <small id="bioRunStatus" role="status"></small>
    </div>
    <div class="bio-metrics">
      <div class="bio-metric"><small>Cellule humaine · Allen</small><strong id="bioSpecimen">—</strong><span>Référence, pas cerveau complet</span></div>
      <div class="bio-metric"><small>SWC / sections / segments</small><strong id="bioMorph">—</strong><span>Géométrie utilisée par NEURON</span></div>
      <div class="bio-metric"><small>Erreur NEURON / RC</small><strong id="bioErrors">—</strong><span>RMSE sur le NWB sous-seuil</span></div>
      <div class="bio-metric"><small>Décharges observées (NWB)</small><strong id="bioSpikes">—</strong><span>Balayage mesuré, non simulation</span></div>
    </div>
  </div>
  <div class="bio-anatomy" id="bioAnatomyPane" hidden>
    <div class="bio-anatomy-head"><b>Cartographie des preuves par système biologique</b><small>Les noms de régions ne prouvent aucune émulation humaine.</small></div>
    <div class="bio-system-grid" id="bioSystemGrid"><p>Chargement des états de validation…</p></div>
  </div>
  <div class="bio-footer">
    <span id="bioProvenance">Aucune observation humaine chargée.</span>
    <a id="bioReportLink" href="https://github.com/XDSawyerLoL/Auralive/actions/runs/43264994852" target="_blank" rel="noopener noreferrer">Rapport du calcul humain</a>
  </div>
</section>`;

export const BRAIN_BIOPHYSICS_CSS=String.raw`
.bio-research{position:relative;margin:12px 14px 16px;padding:15px 16px 13px;border:1px solid #2b4557;
 background:linear-gradient(152deg,rgba(14,27,39,.98),rgba(8,16,26,.99) 53%,rgba(17,22,37,.98));
 border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.16);color:#dcebf1}
.bio-heading{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.bio-heading h3{font-size:17px;letter-spacing:-.02em;margin:3px 0 6px;color:#f0f8fa}
.bio-heading p{font-size:11px;line-height:1.55;color:#9aafbe;margin:0;max-width:700px}
.bio-kicker{display:block;letter-spacing:.15em;font:700 9px/1.4 ui-monospace,monospace;color:#83d2d0}
.bio-version{color:#9fb6c3;font-weight:400;font-size:11px;white-space:nowrap}
.bio-evidence-tag{border-radius:50px;background:#122c32;border:1px solid #31605e;color:#a6dcd1;
 padding:7px 10px;font:600 10px/1.4 ui-monospace,monospace;white-space:nowrap}
.bio-scope-note{margin:10px 0;padding:9px 12px;border-left:2px solid #60a3a4;
 color:#b6c8d4;font-size:11px;line-height:1.55;background:#111e2a}
.bio-scope-note strong{color:#e2eeee}.bio-scope-note em{font-style:normal;color:#9fe1df}
.bio-modes{display:flex;gap:7px;align-items:center;padding:5px;background:#0a141f;border:1px solid #263b4d;
 border-radius:10px;margin-bottom:12px;flex-wrap:wrap}
.bio-modes button{border:1px solid transparent;color:#9db1c0;background:transparent;border-radius:7px;
 padding:8px 12px;font-size:11px;font-weight:600;cursor:pointer}
.bio-modes button:hover{background:#152d3a;color:#e9f9fa}
.bio-modes button[aria-pressed=true]{background:#1a3945;border-color:#39888a;color:#b5fcf1;
 box-shadow:inset 0 0 0 1px rgba(74,175,172,.08)}
.bio-pane{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(190px,1fr);gap:13px}
.bio-signal{min-width:0;padding:10px 12px;border-radius:10px;border:1px solid #274253;
 background:linear-gradient(180deg,#08141d,#0c1922)}
.bio-chart-header{display:flex;justify-content:space-between;align-items:center;gap:8px}
.bio-chart-header b{display:block;font-size:12px;color:#d8f7f1}
.bio-chart-header small{display:block;font-size:10px;color:#87a7b5;margin-top:3px}
.bio-truth{border:1px solid #2c5e68;color:#86d5d6;background:#12303a;border-radius:5px;
 padding:5px 6px;font:700 9px/1.1 ui-monospace,monospace;letter-spacing:.08em}
.bio-truth[data-claim=unknown]{background:#372c24;color:#f0c997;border-color:#7d5c40}
#bioVoltageCanvas{width:100%;height:200px;display:block;margin:3px 0 0;image-rendering:auto}
.bio-legend{font:10px/1.5 ui-monospace,monospace;color:#8cabb8}
.bio-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.bio-metric{min-width:0;display:flex;flex-direction:column;justify-content:center;padding:11px;
 border-radius:9px;border:1px solid #253e50;background:#0c1824}
.bio-metric small{font-size:10px;color:#95b4c2}
.bio-metric strong{display:block;margin:5px 0;color:#e8f7f6;font:700 clamp(14px,1.3vw,19px)/1.2 ui-monospace,Consolas,monospace;
 overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.bio-metric span{font-size:9px;line-height:1.4;color:#6e91a0}
.bio-run-btn{padding:9px 12px;background:#173943;color:#b8fcf4;border:1px solid #39858c;border-radius:7px;
 cursor:pointer;font-size:11px;margin:8px 0}
.bio-run-btn:disabled{opacity:.5;cursor:not-allowed}#bioRunStatus{display:block;font-size:10px;color:#b7c6d1}
.bio-pane[hidden],.bio-anatomy[hidden]{display:none!important}
.bio-anatomy{background:#0b1721;border:1px solid #294254;border-radius:10px;padding:12px}
.bio-anatomy-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px;margin-bottom:10px}
.bio-anatomy-head b{font-size:12px}.bio-anatomy-head small{color:#839fb1;font-size:10px}
.bio-system-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}
.bio-system{border:1px solid #2a4353;border-radius:9px;padding:12px;background:#101f2d;min-width:0}
.bio-system header{display:flex;flex-wrap:wrap;gap:7px;justify-content:space-between;align-items:start}
.bio-system strong{font-size:11px;color:#e9f1fa}
.bio-system p{margin:8px 0;color:#9bb0bf;font-size:10px;line-height:1.55}
.bio-system small{color:#6e98a6;font:9px ui-monospace,monospace}
.bio-system-level{font:700 9px ui-monospace,monospace;padding:3px 5px;border-radius:4px;border:1px solid #45576a;color:#b0bdcb}
.bio-system-level[data-stage=measured-and-modeled]{border-color:#357d68;color:#9cddc1;background:#18352c}
.bio-system-level[data-stage=prototype-only],.bio-system-level[data-stage=toy-model-only]{border-color:#8b7241;color:#eed19e;background:#2a2418}
.bio-system-level[data-stage=atlas-only]{border-color:#4c6f9b;color:#b7d8ee;background:#172638}
.bio-footer{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;
 padding-top:12px;color:#739aa9;font:10px/1.5 ui-monospace,monospace}
.bio-footer a{color:#83d9d0;text-decoration:underline;text-underline-offset:3px}
.bio-footer a:hover{color:#fff}
@media(max-width:1000px){.bio-pane{grid-template-columns:1fr}.bio-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}
 .bio-system-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:650px){.bio-research{margin:9px 7px;padding:11px}
 .bio-heading{flex-wrap:wrap}.bio-heading h3{font-size:15px}
 .bio-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
 .bio-system-grid{grid-template-columns:1fr}
 .bio-evidence-tag{white-space:normal}}
`;

export const BRAIN_BIOPHYSICS_SCRIPT=String.raw`
const bioLab={mode:'human',evidence:null,hh:null,busy:false};
const bioButtons={human:$('bioModeHuman'),hh:$('bioModeHH'),atlas:$('bioModeAtlas')};
function bioStatus(text){const node=$('bioRunStatus');if(node)node.textContent=String(text||'');}
function bioSetMode(mode){
 bioLab.mode=mode;
 for(const [name,button] of Object.entries(bioButtons))
   if(button)button.setAttribute('aria-pressed',String(name===mode));
 const anatomy=$('bioAnatomyPane'),pane=$('bioSignalPane');
 if(anatomy)anatomy.hidden=mode!=='atlas';
 if(pane)pane.hidden=mode==='atlas';
 const run=$('bioRunHH');if(run)run.hidden=mode!=='hh';
 bioPaintTrace();
}
function bioNumber(value,digits=2){
 return Number.isFinite(value)?Number(value).toLocaleString('fr-FR',{maximumFractionDigits:digits}):'—';
}
function bioRenderEvidence(){
 const data=bioLab.evidence;if(!data)return;
 const e=data.evidence||{},measurement=e.measured_nwb||{};
 setText('bioEvidenceBadge','1 cellule humaine · preuve archivée');
 setText('bioSpecimen',String(e.specimen_id||'—'));
 setText('bioMorph',bioNumber(e.morphology_nodes,0)+' / '+
   bioNumber(e.neuron_sections,0)+' / '+bioNumber(e.neuron_segments,0));
 setText('bioErrors',bioNumber(measurement.neuron_passive_rmse_mV,3)+' / '+
   bioNumber(measurement.rc_passive_rmse_mV,3)+' mV');
 setText('bioSpikes',bioNumber(measurement.action_potential_threshold_crossings,0)+
   ' (sous-seuil)');
 setText('bioProvenance','Allen Cell Types · NWB n° '+
   String(measurement.sweep_number||'—')+' · simulation NEURON · 12/11/2026 · aucune donnée en direct');
 const link=$('bioReportLink');
 if(link&&/^https:\/\/github\.com\/XDSawyerLoL\/Auralive\/actions\/runs\/\d+$/.test(e.workflow_url||''))
   link.href=e.workflow_url;
 const grid=$('bioSystemGrid');
 if(grid){
   grid.replaceChildren();
   const statuses={
     'measured-and-modeled':'Mesuré + modèle',
     'not-human-validated':'Non validé humain',
     'prototype-only':'Prototype',
     'atlas-only':'Atlas disponible',
     'not-reconstructed':'Non reconstruit',
     'toy-model-only':'Modèle simplifié',
   };
   for(const item of data.subsystems||[]){
     const card=element('article','bio-system');
     const top=element('header');
     const h=element('strong','',item.label||'Inconnu');
     const tag=element('span','bio-system-level',statuses[item.status]||'Non validé');
     tag.dataset.stage=item.status||'not-reconstructed';
     top.append(h,tag);
     card.append(top,element('p','',item.detail||'Aucune mesure'));
     card.append(element('small','',item.source||'Source absente'));
     grid.append(card);
   }
 }
 bioPaintTrace();
}
function bioPaintTrace(){
 const canvas=$('bioVoltageCanvas');
 if(!canvas)return;
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const w=Math.max(260,canvas.clientWidth),h=200;
 const dpr=Math.min(2,window.devicePixelRatio||1);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 ctx.fillStyle='#08151d';ctx.fillRect(0,0,w,h);
 const hh=bioLab.mode==='hh';
 const evidence=bioLab.evidence;
 let series=[];
 if(hh&&bioLab.hh?.experiment?.trace){
   const t=bioLab.hh.experiment.trace;
   series=[
     {name:'Thalamus (HH de référence, calmar)',color:'#7de5cc',points:t.map(p=>[p.at_ms,p.membrane_mV.thalamus])},
     {name:'Amygdale (connexion illustrative)',color:'#e8b479',points:t.map(p=>[p.at_ms,p.membrane_mV.amygdala])},
   ];
 }else if(!hh&&evidence?.predicted_trace?.values){
   const trace=evidence.predicted_trace;
   series=[{name:'Prévision RC · courant −10 pA, PAS NWB',color:'#7de5cc',
     points:trace.values.map((v,i)=>[i*trace.dt_ms,v])}];
 }
 const title=$('bioTraceTitle'),sub=$('bioTraceSub'),truth=$('bioTraceSource');
 if(title)title.textContent=hh?'Potentiels électriques · référence HH':
   'Potentiel membranaire · cellule humaine';
 if(sub)sub.textContent=hh
   ?'Calcul de recherche, paramètres de calmar ; régions non calibrées'
   :'Courbe calculée à partir de mesures humaines · tracé NWB non disponible ici';
 if(truth){truth.textContent=series.length?'SIMULATION':'EN ATTENTE';
   truth.dataset.claim=series.length?'calculated':'unknown';}
 setText('bioChartLegend',series.length?series.map(s=>s.name).join(' · '):
   hh?'Lancer le calcul privé pour obtenir des trajectoires électriques.':
      'Aucun tracé fourni ; aucun signal simulé affiché.');
 const margin={l:51,r:18,t:18,b:30};
 const iw=w-margin.l-margin.r,ih=h-margin.t-margin.b;
 if(iw<=0||!series.length){
   ctx.fillStyle='#769bac';ctx.font='12px ui-monospace,monospace';
   ctx.fillText('Aucun signal numérique reçu.',22,h/2);
   return;
 }
 const values=series.flatMap(s=>s.points.map(p=>p[1]));
 const min=Math.min(...values),max=Math.max(...values),pad=Math.max(.25,(max-min)*.11);
 const minY=min-pad,maxY=max+pad;
 const maxX=Math.max(1,...series.flatMap(s=>s.points.map(p=>p[0])));
 const xp=x=>margin.l+(x/maxX)*iw;
 const yp=y=>margin.t+(1-(y-minY)/(maxY-minY))*ih;
 ctx.font='10px ui-monospace,monospace';
 ctx.strokeStyle='#244250';ctx.lineWidth=1;
 for(let i=0;i<=4;i++){
   const y=margin.t+(ih/4)*i,v=maxY-(maxY-minY)*i/4;
   ctx.beginPath();ctx.moveTo(margin.l,y);ctx.lineTo(w-margin.r,y);ctx.stroke();
   ctx.fillStyle='#88a9b7';ctx.fillText(bioNumber(v,1),4,y+3);
 }
 for(let i=0;i<=4;i++){
   const x=margin.l+(iw/4)*i;
   ctx.beginPath();ctx.moveTo(x,margin.t);ctx.lineTo(x,h-margin.b);ctx.stroke();
   ctx.fillStyle='#7f9eaa';ctx.fillText(bioNumber(maxX*i/4,0),x-6,h-10);
 }
 ctx.fillText('mV',7,12);ctx.fillText('ms',w-23,h-10);
 if(!hh&&evidence?.protocol){
   ctx.fillStyle='rgba(125,229,204,.065)';
   const a=xp(evidence.protocol.pulse_start_ms),b=xp(evidence.protocol.pulse_end_ms);
   ctx.fillRect(a,margin.t,b-a,ih);
 }
 for(const s of series){
   ctx.beginPath();ctx.strokeStyle=s.color;ctx.lineWidth=1.8;
   s.points.forEach(([x,y],i)=>{if(i===0)ctx.moveTo(xp(x),yp(y));else ctx.lineTo(xp(x),yp(y));});
   ctx.stroke();
 }
}
for(const [mode,button] of Object.entries(bioButtons))
 if(button)button.addEventListener('click',()=>bioSetMode(mode));
$('bioRunHH')?.addEventListener('click',async()=>{
 if(bioLab.busy)return;
 bioLab.busy=true;$('bioRunHH').disabled=true;
 bioStatus('Calcul du banc HH demandé au noyau…');
 try{
   const res=await fetch('/api/research/biophysics/experiment',{
     method:'POST',credentials:'same-origin',cache:'no-store',
     headers:{'Content-Type':'application/json',Accept:'application/json'},
     body:JSON.stringify({duration_ms:120,dt_ms:.025,stimulation_uA_cm2:16}),
   });
   if(!res.ok)throw Error(res.status===401||res.status===403
     ?'Session propriétaire nécessaire pour lancer un calcul.'
     :'Service scientifique indisponible (HTTP '+res.status+').');
   const data=await res.json();
   if(data?.ok!==true||data?.experiment?.no_llm!==true||
     data?.experiment?.model_origin!=='HH1952-squid-axon-not-human-calibrated')
     throw Error('Le moteur ne fournit pas une preuve numérique reconnue.');
   bioLab.hh=data;
   bioStatus('Exécution vérifiée : '+bioNumber(data.experiment.simulated_ms,1)+
     ' ms biologiques calculés. Aucun neurone humain actif validé.');
   bioPaintTrace();
 }catch(err){bioStatus(String(err.message||err));}
 finally{bioLab.busy=false;$('bioRunHH').disabled=false;}
});
async function bioLoadEvidence(){
 try{
   const res=await fetch('/api/research/biophysics/evidence',{
     cache:'no-store',headers:{Accept:'application/json'}});
   if(!res.ok)throw Error('Données indisponibles (HTTP '+res.status+').');
   const data=await res.json();
   if(data.schema!=='aura-human-biophysical-evidence-v1'||data.status!=='research-readonly-frozen-receipt'
     ||data.interpretation?.human_brain_emulated!==false||
     data.predicted_trace?.origin!=='calculated-not-measured')
     throw Error('Format de preuve biologique inattendu.');
   bioLab.evidence=data;
   bioRenderEvidence();
 }catch(err){
   setText('bioEvidenceBadge','Données non vérifiables');
   setText('bioProvenance',String(err.message||err));
   bioPaintTrace();
 }
}
window.addEventListener('resize',()=>bioPaintTrace());
void bioLoadEvidence();
`;
