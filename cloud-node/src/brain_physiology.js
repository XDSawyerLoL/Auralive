// Instrumented physiological ANALOGUES, not biological measurements.
// Every value is sourced from a fresh process sensor, dated software state
// or independently verified receipt. Unavailable is null, NEVER a fake 50%.
const bounded=x=>Number.isFinite(Number(x))&&x!==null&&x!==''?
  Math.max(0,Math.min(100,Math.round(Number(x)))):null;
const value=(v)=>v===undefined||v===null||v===''?null:bounded(v);
const fresh=(meta)=>meta?.status==='recent';
const output=(id,label,valuePct,{
  kind='software',description='',source='',at=null,unit='%',tone='cyan',
}={})=>({
  id,label,value:value(valuePct),unit,tone,kind,
  description,source,observed_at:at,
  available:value(valuePct)!==null,
  // No one should mistake a named hormonal analogue for a hormone.
  biological_measurement:false,subjective_experience_proven:false,
});
function metric(metrics,id){
 const found=(Array.isArray(metrics)?metrics:[]).find(m=>m.id===id);
 return found?.value??null;
}
export function buildNeuroVitalSigns(telemetry={},nowMs=Date.now()){
 const sensor=telemetry.somatic||{};
 const state=telemetry.source||{};
 const viability=telemetry.viability||{};
 const workspace=telemetry.global_workspace||{};
 const freshness=typeof viability.last_at==='string'
   ?Math.max(0,nowMs-Date.parse(viability.last_at)):Infinity;
 const recentReserve=Number.isFinite(freshness)&&freshness<=120000&&
   viability.source==='node-process';
 const process=fresh(sensor.freshness)&&sensor.source==='node-process';
 const software=fresh(state)&&telemetry.runtime_ready===true;
 const selected=(workspace.broadcast_enabled&&fresh(workspace.freshness)
   ?workspace.selected:[])||[];
 const salience=selected[0]?.score??null;
 const failure=software?value(telemetry.failure_ema):null;
 const pressure=process?value(sensor.compute_pressure):null;
 const cortisol=pressure===null?null:Math.round(
   .72*pressure+.28*(failure===null?pressure:failure));
 const verified=telemetry.verified_loop||{};
 const latestSuccessAt=Date.parse(String(verified.last_success_at||''));
 const hasRecentVerifiedSuccess=Number.isFinite(latestSuccessAt)&&
   nowMs>=latestSuccessAt&&nowMs-latestSuccessAt<=120000;
 const success=hasRecentVerifiedSuccess?Math.min(100,
   25+25*Math.min(3,Number(verified.recent_verified_successes)||1)):null;
 const vitals=[
  output('reserve','Réserve',recentReserve?viability.reserve:null,{
   kind:'measured-regulation',tone:'mint',at:viability.last_at,
   source:'viability_budget / capteur node-process daté',
   description:'Réserve de calcul du noyau, réversible. Pas une énergie biologique.'}),
  output('cpu','CPU',process?sensor.cpu_utilization:null,{
   kind:'sensor',tone:'aqua',at:sensor.freshness?.updated_at,
   source:'ProcessSomaticSensor / process.cpuUsage',
   description:'Utilisation du CPU par le processus Node, pas la machine entière.'}),
  output('heap','Mémoire RAM',process?sensor.heap_utilization:null,{
   kind:'sensor',tone:'violet',at:sensor.freshness?.updated_at,
   source:'ProcessSomaticSensor / process.memoryUsage',
   description:'Fraction de heap utilisée par le processus, pas toute la RAM.'}),
  output('stability','Stabilité',software?metric(telemetry.metrics,'stabilite'):null,{
   kind:'software-state',tone:'mint',at:state.updated_at,
   source:'AuraOrganism.publicState.stabilite',
   description:'Indice algorithmique interne calculé ; non mesuré chez un humain.'}),
  output('attention','Attention',salience,{
   kind:'observed-selection',tone:'aqua',at:workspace.at,
   source:'global_workspace.selected[0].score',
   description:'Score du premier signal réellement sélectionné et diffusé.'}),
  output('cortisol_like','Cortisol analogue',cortisol,{
   kind:'derived-analogue',tone:'coral',at:sensor.freshness?.updated_at,
   source:'0.72×pression processus + 0.28×EMA des échecs si disponible',
   description:'Indicateur dérivé de charge et échecs, aucune hormone mesurée.'}),
  output('noradrenaline_like','Vigilance analogue',salience,{
   kind:'derived-analogue',tone:'amber',at:workspace.at,
   source:'Score de saillance sélectionné par le workspace',
   description:'Analogie attentionnelle ; ni noradrénaline ni état biologique.'}),
  output('serotonin_like','Équilibre analogue',software?metric(telemetry.metrics,'stabilite'):null,{
   kind:'derived-analogue',tone:'mint',at:state.updated_at,
   source:'Indice logiciel stabilite du noyau',
   description:'Indice de régulation software. Ce n’est pas de la sérotonine.'}),
  output('melatonin_like','Repos analogue',software?metric(telemetry.metrics,'pression_de_reve'):null,{
   kind:'derived-analogue',tone:'violet',at:state.updated_at,
   source:'Indice logiciel pression_de_reve',
   description:'Pression de consolidation telle que définie par le code, non mélatonine.'}),
  output('dopamine_like','Gain vérifié analogue',success,{
   kind:'verified-event-proxy',tone:'amber',
   at:hasRecentVerifiedSuccess?verified.last_success_at:null,
   source:'verified_probe_loop / résultat machine-observed récent',
   description:'Proxy de réussite observée récemment, pas dopamine ou plaisir.'}),
 ];
 const measured=vitals.filter(x=>x.kind==='sensor'&&x.available).length;
 const computed=vitals.filter(x=>x.kind!=='sensor'&&x.available).length;
 return {
  version:'aura-neuro-vital-signs-v1',at:new Date(nowMs).toISOString(),
  sensor_fresh:process,software_fresh:software,signals_available:measured+computed,
  measured_sensor_count:measured,derived_index_count:computed,
  vitals,source:'server-certified-telemetry-projection',
  distinct_from_biological_human:true,
  pulse_requires_persisted_brain_hop:true,
  no_fake_heartbeat:true,no_unobserved_signal_animation:true,
 };
}
