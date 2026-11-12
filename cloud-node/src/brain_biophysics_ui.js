// Browser research interface embedded inside the ONE AURA brain-and-chat page.
// No pseudo-neural animation. All voltage paths are numeric traces from a
// declared scientific equation or private experiment; real NWB is statistics only.
export const BRAIN_BIOPHYSICS_HTML=String.raw`
<section class="bio-research" id="bioEvidencePanel" role="region" tabindex="-1" hidden aria-label="Laboratoire biophysique et preuves humaines">
  <div class="bio-heading">
    <div class="bio-heading-title">
      <span class="bio-kicker">RECHERCHE BIOLOGIQUE · LECTURE SEULE</span>
      <h3>Du neurone humain au cerveau <span class="bio-version">/ Étape mesurée</span></h3>
      <p>Signaux électriques calculés, enregistrements humains et lacunes anatomiques — distincts des activités logicielles d'AURA.</p>
    </div>
    <div class="bio-heading-actions"><span class="bio-evidence-tag" id="bioEvidenceBadge">Preuves en cours de chargement</span><button type="button" id="bioClose" class="bio-close" aria-label="Fermer le laboratoire biologique" title="Retour au cerveau">×</button></div>
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
      <div class="bio-metric"><small>SWC / sections / segments</small><strong id="bioMorph">—</strong><span id="bioMorphContext">Géométrie utilisée par NEURON</span></div>
      <div class="bio-metric"><small>Erreur NEURON / RC</small><strong id="bioErrors">—</strong><span id="bioErrorsContext">RMSE (mV) · NEURON / RC · NWB 25</span></div>
      <div class="bio-metric"><small>Décharges observées (NWB)</small><strong id="bioSpikes">—</strong><span id="bioSpikesContext">Balayage humain mesuré, non simulation</span></div>
    </div>
  </div>
  <details class="bio-fit-details" id="bioFitDetails">
    <summary><span>CALIBRATION NEURONALE · TRAIN / VALIDATION</span><strong id="bioFitSummary">Résultat expérimental à charger</strong></summary>
    <div class="bio-fit-grid">
      <div><small>Entraînement · NWB 26 · 10 pA</small><b id="bioFitTrainLow">—</b></div>
      <div><small>Entraînement · NWB 37 · 230 pA</small><b id="bioFitTrainHigh">—</b></div>
      <div><small>Validation réservée · NWB 44 · 120 pA</small><b id="bioFitHoldout">—</b></div>
    </div>
    <p>Modèle HH historique à cinétique non humaine. Les paramètres ont été choisis sur les deux premières stimulations. La troisième n'a pas participé au choix.</p>
    <a href="https://github.com/XDSawyerLoL/Auralive/actions/runs/43294699060" target="_blank" rel="noopener noreferrer">Consulter la preuve expérimentale (GitHub Actions)</a>
  </details>
  <details class="bio-fit-details" id="bioCohortDetails">
    <summary><span>TRANSFERT ENTRE CELLULES HUMAINES</span><strong id="bioCohortSummary">Résultats à charger</strong></summary>
    <div class="bio-fit-grid" id="bioCohortGrid">
      <div><small>Spécimen · NWB · stimulation</small><b id="bioCohortCellOne">—</b></div>
      <div><small>Spécimen · NWB · stimulation</small><b id="bioCohortCellTwo">—</b></div>
    </div>
    <p>Paramètres Na/K gelés depuis la cellule 643582610. Les caractéristiques passives restent propres à chaque cellule. Même si les décharges expérimentales sont réelles, la cinétique HH reste d'origine non humaine.</p>
    <a href="https://github.com/XDSawyerLoL/Auralive/actions/runs/43299079259" target="_blank" rel="noopener noreferrer">Rapport de simulation sur les cellules humaines (GitHub)</a>
  </details>
  <details class="bio-fit-details" id="bioHumanNaKV2Details">
    <summary><span>NOUVEAUX MÉCANISMES Na/K · 3 CELLULES</span><strong id="bioNaKV2Summary">Comparaison à charger</strong></summary>
    <div class="bio-kinetics-scroll">
      <table class="bio-kinetics-table" aria-label="Décharges humaines observées et simulations HH contre Na K">
        <thead><tr><th>Cellule humaine</th><th>Mesurées</th><th>HH</th><th>AURA Na/K</th><th>Erreur Na/K</th></tr></thead>
        <tbody>
          <tr><th>643582610 · NWB 44</th><td>2</td><td>0</td><td id="bioNaKV2RefSpikes">—</td><td id="bioNaKV2RefRMSE">—</td></tr>
          <tr><th>529898751 · NWB 54</th><td>3</td><td>0</td><td id="bioNaKV2CellA">—</td><td id="bioNaKV2CellARMSE">—</td></tr>
          <tr><th>508410761 · NWB 58</th><td>2</td><td>0</td><td id="bioNaKV2CellB">—</td><td id="bioNaKV2CellBRMSE">—</td></tr>
        </tbody>
      </table>
    </div>
    <p>Les mécanismes Na/K ont été écrits pour AURA et ajustés à des enregistrements humains. Ils calculent désormais des décharges, mais leurs erreurs de tension sont plus fortes que celles du modèle HH témoin. Les propriétés moléculaires des canaux humains ne sont pas encore identifiées.</p>
    <a href="https://github.com/XDSawyerLoL/Auralive/actions/runs/43302961099" target="_blank" rel="noopener noreferrer">Consulter le calcul NEURON et les trois validations humaines</a>
  </details>
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
.bio-kinetics-scroll{width:100%;overflow-x:auto;margin-top:9px}
.bio-kinetics-table{width:100%;min-width:430px;border-collapse:collapse;font-size:10px;text-align:right;font-variant-numeric:tabular-nums}
.bio-kinetics-table th,.bio-kinetics-table td{padding:8px 6px;border-bottom:1px solid #334259}
.bio-kinetics-table th:first-child{text-align:left}
.bio-kinetics-table thead th{font:700 9px ui-monospace,monospace;color:#8acbd5;white-space:nowrap}
.bio-kinetics-table tbody td{color:#e3f0f4;font:600 10px ui-monospace,monospace}
#bioHumanNaKV2Details summary strong{color:#f2bb8f}
.bio-fit-details{margin:10px 0;border:1px solid #36485d;background:#111c2a;border-radius:10px;padding:8px 10px;color:#d9e6ed}
.bio-fit-details summary{display:flex;cursor:pointer;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;list-style:none;font-size:10px}
.bio-fit-details summary::-webkit-details-marker{display:none}
.bio-fit-details summary span{font:700 9px ui-monospace,monospace;letter-spacing:.08em;color:#a2b6d4}
.bio-fit-details summary strong{font:600 11px ui-monospace,monospace;color:#ffc6a6}
.bio-fit-details summary:focus-visible{outline:2px solid #a0c6fa;outline-offset:3px}
#bioCohortGrid{grid-template-columns:repeat(2,minmax(0,1fr))}
#bioCohortGrid b{font-size:11px;line-height:1.5;white-space:normal;overflow-wrap:anywhere}
@media(max-width:560px){#bioCohortGrid{grid-template-columns:1fr}}
.bio-fit-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0 8px}
.bio-fit-grid>div{border:1px solid #354358;border-radius:7px;padding:9px;min-width:0}
.bio-fit-grid small{display:block;color:#92aec0;font-size:9px}
.bio-fit-grid b{display:block;margin-top:7px;color:#ecf5f7;font:700 13px ui-monospace,monospace}
.bio-fit-details p{color:#9ab3bf;font-size:10px;line-height:1.5;margin:8px 0}
.bio-fit-details a{font-size:10px;color:#89e0db;text-decoration:underline}
@media(max-width:550px){.bio-fit-grid{grid-template-columns:1fr}}
.bio-anatomy{background:#0b1721;border:1px solid #294254;border-radius:10px;padding:12px}
.bio-anatomy-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px;margin-bottom:10px}
.bio-anatomy-head b{font-size:12px}.bio-anatomy-head small{color:#839fb1;font-size:10px}
.bio-system-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}
.bio-system{border:1px solid #2a4353;border-radius:9px;padding:12px;background:#101f2d;min-width:0}
.bio-system header{display:flex;flex-wrap:wrap;gap:7px;justify-content:space-between;align-items:start}
.bio-system strong{font-size:11px;color:#e9f1fa}
.bio-system p{margin:8px 0;color:#9bb0bf;font-size:10px;line-height:1.55}
.bio-system small{color:#6e98a6;font:9px ui-monospace,monospace}
.bio-system-source{display:inline-block;color:#79d2ca;font:10px ui-monospace,monospace;text-decoration:underline;text-underline-offset:3px}
.bio-system-source:hover{color:#eafff9}
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
/* Mesures scientifiques : une vue contextuelle, jamais un bloc qui réduit le connectome. */
.top .bio-top-trigger{background:#192035;border-color:#5f5893;color:#d4d6ff;font-size:11px;
 letter-spacing:.01em;padding:9px 11px;white-space:nowrap}
.top .bio-top-trigger:hover,.top .bio-top-trigger[aria-expanded=true]{border-color:#9d91df;color:#f5ebff;background:#31254b}
@media(max-width:620px){.top-actions .bio-top-trigger.top-btn{display:inline-flex!important;align-items:center;min-height:31px;padding:7px 9px;font-size:10px}.top .bio-top-trigger span{display:none}}
#bioEvidencePanel[hidden],#bioBackdrop[hidden]{display:none!important}
.graph-stage{isolation:isolate}
#bioBackdrop.bio-backdrop{position:absolute;inset:4px 6px 48px;z-index:12;display:block;width:auto;height:auto;
 padding:0;margin:0;border:0;border-radius:12px;cursor:pointer;background:rgba(1,4,12,.53);backdrop-filter:blur(2px)}
#bioEvidencePanel.bio-research{position:absolute;z-index:13;top:7px;right:7px;bottom:auto;left:auto;
 box-sizing:border-box;width:min(720px,calc(100% - 14px));height:min(690px,calc(100% - 15px));
 max-height:calc(100% - 15px);overflow:auto;margin:0;padding:14px;
 border-color:rgba(133,127,228,.46);border-radius:12px;
 box-shadow:0 12px 65px #000d,0 0 0 1px rgba(90,93,178,.12);
 background:linear-gradient(152deg,#110f22,#080f1b 62%,#0a1420);overscroll-behavior:contain}
#bioEvidencePanel .bio-heading{gap:10px;align-items:center}
.bio-heading-actions{display:flex;align-items:center;gap:7px;flex:none}
.bio-close{width:30px;height:30px;display:inline-grid;place-items:center;
 border:1px solid #596079;border-radius:8px;color:#eadff7;background:#272237;
 font-size:23px;font-weight:400;line-height:1;cursor:pointer}
.bio-close:hover,.bio-close:focus-visible{border-color:#b18bff;background:#382b52}
#bioEvidencePanel .bio-kicker{color:#a5adfc}
#bioEvidencePanel .bio-heading h3{color:#f2eaff}
#bioEvidencePanel .bio-evidence-tag{white-space:normal;max-width:185px;text-align:right;
 background:#1b2035;color:#afdbd3;border-color:#40556c}
#bioEvidencePanel .bio-scope-note{border-left-color:#a292ee}
#bioEvidencePanel .bio-modes button[aria-pressed=true]{border-color:#8c78be;background:#292344;color:#f8e9ff}
#bioEvidencePanel .bio-pane{grid-template-columns:minmax(0,1.6fr) minmax(185px,1fr)}
#bioEvidencePanel #bioVoltageCanvas{height:158px}
#bioEvidencePanel .bio-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
#bioEvidencePanel .bio-metric{min-height:78px;padding:9px}
#bioEvidencePanel .bio-metric strong{font-size:14px}
#bioEvidencePanel .bio-metric span{font-size:9px}
#bioEvidencePanel .bio-system-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
#bioEvidencePanel:focus{outline:none}
#bioEvidencePanel:focus-visible{outline:2px solid #9c8efa;outline-offset:-2px}
@media(max-width:850px){#bioEvidencePanel.bio-research{width:calc(100% - 12px);right:6px;top:5px;
 height:calc(100% - 10px);max-height:calc(100% - 10px);padding:10px}
 #bioEvidencePanel .bio-heading-actions{flex-wrap:wrap;justify-content:flex-end}}
@media(max-width:600px){#bioEvidencePanel .bio-pane{grid-template-columns:1fr}
 #bioEvidencePanel #bioVoltageCanvas{height:130px}
 #bioEvidencePanel .bio-system-grid{grid-template-columns:1fr}
 #bioEvidencePanel .bio-heading{align-items:start}
 #bioEvidencePanel .bio-evidence-tag{font-size:9px;max-width:130px}
 #bioEvidencePanel .bio-heading h3{font-size:14px}
 #bioEvidencePanel .bio-heading p{font-size:10px}}

`;

export const BRAIN_BIOPHYSICS_SCRIPT=String.raw`
const bioLab={mode:'human',evidence:null,hh:null,busy:false};

const bioPanel=$('bioEvidencePanel'),bioBackdrop=$('bioBackdrop');
const bioTrigger=$('bioLabTrigger'),bioClose=$('bioClose');
function bioSetOpen(open,{focus=true}={}){
 const enabled=Boolean(open);
 if(!bioPanel||!bioBackdrop)return;
 bioPanel.hidden=!enabled;
 bioBackdrop.hidden=!enabled;
 if(bioTrigger){bioTrigger.setAttribute('aria-expanded',String(enabled));
  bioTrigger.classList.toggle('scene-active',enabled);}
 if(enabled){
  if(focus)bioPanel.focus({preventScroll:true});
  requestAnimationFrame(()=>bioPaintTrace());
 } else if(focus&&bioTrigger)bioTrigger.focus({preventScroll:true});
}
bioTrigger?.addEventListener('click',()=>bioSetOpen(bioPanel.hidden));
bioClose?.addEventListener('click',()=>bioSetOpen(false));
bioBackdrop?.addEventListener('click',()=>bioSetOpen(false));
document.addEventListener('keydown',ev=>{
 if(ev.key==='Escape'&&!bioPanel?.hidden)bioSetOpen(false);
});
document.querySelectorAll('[data-focus]').forEach(nav=>nav.addEventListener('click',()=>bioSetOpen(false,{focus:false})));

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
 setText('bioMorph',bioNumber(e.morphology_nodes,0)+' points');
 setText('bioMorphContext',bioNumber(e.neuron_sections,0)+' sections / '+bioNumber(e.neuron_segments,0)+' segments');
 setText('bioErrors',bioNumber(measurement.neuron_passive_rmse_mV,3)+' / '+
   bioNumber(measurement.rc_passive_rmse_mV,3));
 const spiking=e.measured_spiking||{};
 setText('bioSpikes',Number.isInteger(spiking.observed_spike_count)
   ?bioNumber(spiking.observed_spike_count,0)+' mesurées':'—');
 const fit=e.active_multisweep_calibration||null;
 if(fit){
   const hold=fit.validation||{};
   setText('bioFitSummary','Validation : '+bioNumber(hold.observed_spikes,0)+
      ' observées / '+bioNumber(hold.simulated_spikes,0)+' simulées');
   const write=(id,ob)=>{
      setText(id,bioNumber(ob?.observed_spikes,0)+' réelles / '+
        bioNumber(ob?.simulated_spikes,0)+' simulées');
   };
   write('bioFitTrainLow',fit.training?.[0]);
   write('bioFitTrainHigh',fit.training?.[1]);
   write('bioFitHoldout',hold);
 }
 const cohort=e.human_cross_specimen_transfer;
 if(cohort?.additional_human_specimens?.length===2){
   const rows=cohort.additional_human_specimens;
   const formatRow=(row)=>{
     const test=row.high_current||{};
     return String(row.specimen_id)+' · NWB '+String(test.sweep||'—')+
       ' · '+bioNumber(test.current_pA,0)+' pA · '+
       bioNumber(test.observed_spikes,0)+' mesurées / '+
       bioNumber(test.simulated_spikes,0)+' simulées';
   };
   setText('bioCohortCellOne',formatRow(rows[0]));
   setText('bioCohortCellTwo',formatRow(rows[1]));
   setText('bioCohortSummary','2 cellules · HH : 0 décharge reproduite');
 }
 const naik=e.original_NaK_human_fit_v2;
 if(naik?.external?.length===2){
   setText('bioNaKV2Summary','3 cellules · 1 décharge calculée / cellule');
   setText('bioNaKV2RefSpikes',bioNumber(naik.locked_holdout.predicted_spikes,0));
   setText('bioNaKV2RefRMSE',bioNumber(naik.locked_holdout.rmse_mV,2)+' mV');
   setText('bioNaKV2CellA',bioNumber(naik.external[0].predicted_spikes,0));
   setText('bioNaKV2CellARMSE',bioNumber(naik.external[0].rmse_mV,2)+' mV');
   setText('bioNaKV2CellB',bioNumber(naik.external[1].predicted_spikes,0));
   setText('bioNaKV2CellBRMSE',bioNumber(naik.external[1].rmse_mV,2)+' mV');
 }
 const hhComparison=e.active_reference_comparison;
 setText('bioSpikesContext',Number.isInteger(spiking.sweep_number)
   ?'NWB '+spiking.sweep_number+' · +'+bioNumber(spiking.injected_current_max_pA,0)+' pA'+
     (hhComparison?' · HH témoin : '+bioNumber(hhComparison.simulated_reference_spikes,0)+' simulée(s)':'')
   :'Balayage actif humain non enregistré');
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
     // Whitelisted research links, never arbitrary URLs from a response.
     const publications={
       passive:'https://celltypes.brain-map.org/',
       active:'https://github.com/XDSawyerLoL/Auralive/actions/runs/43277555645',
       amygdala:'https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE342709',
     };
     if(publications[item.id]){
       const source=element('a','bio-system-source',item.source||'Document scientifique');
       source.href=publications[item.id];
       source.target='_blank';source.rel='noopener noreferrer';
       card.append(source);
     }else card.append(element('small','',item.source||'Source absente'));
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
 ctx.fillText('mV',7,12);ctx.fillText('temps (ms)',w-86,12);
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
