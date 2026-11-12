import test from 'node:test';
import assert from 'node:assert/strict';
import {BIOPHYSICS_HUMAN_EVIDENCE,biologicalResearchSnapshot} from '../src/biophysical_evidence.js';
import {BRAIN_BIOPHYSICS_HTML,BRAIN_BIOPHYSICS_CSS,BRAIN_BIOPHYSICS_SCRIPT}
  from '../src/brain_biophysics_ui.js';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';
import {readFileSync} from 'node:fs';

test('published real human NWB receipt has stable grounded specimen, scope and hashes',()=>{
 const e=BIOPHYSICS_HUMAN_EVIDENCE;
 assert.equal(e.specimen_id,643582610);
 assert.equal(e.reconstruction_sha256,'d2bc685734b460bb2e256cb656c93fc85eab57f1b95cc006a60b1456ec3f78f7');
 assert.equal(e.nwb_sha256,'73b89bef175547c1e0a134efa65bd075db4eecb9bfd6be01d2eae0b24e5e4687');
 assert.equal(e.morphology_nodes,13995);
 assert.equal(e.neuron_sections,269);
 assert.equal(e.neuron_segments,1081);
 assert.equal(e.measured_nwb.sweep_number,25);
 assert.equal(e.measured_nwb.samples,10000);
 assert.equal(e.measured_nwb.action_potential_threshold_crossings,0);
 assert.equal(e.measured_spiking.sweep_number,32);
 assert.equal(e.measured_spiking.observed_spike_count,4);
 assert.equal(e.measured_spiking.recording_workflow_run_id,43277555645);
 assert.equal(e.measured_spiking.original_nwb_sha256,e.nwb_sha256);
 assert.equal(e.measured_spiking.measured_not_simulated,true);
 assert.equal(e.measured_spiking.ion_channels_calibrated,false);
 assert.equal(e.active_reference_comparison.workflow_run_id,43289598017);
 assert.equal(e.active_reference_comparison.observed_human_spikes,4);
 assert.equal(e.active_reference_comparison.simulated_reference_spikes,0);
 assert.equal(e.active_reference_comparison.reference_rmse_mV,7.042124);
 assert.equal(e.active_reference_comparison.sodium_density_increased_50_percent_simulated_spikes,0);
 assert.equal(e.active_reference_comparison.allen_active_fitted_models_for_this_specimen,0);
 assert.equal(e.active_reference_comparison.active_human_ion_channels_validated,false);
 assert.equal(e.active_reference_comparison.heldout_human_ephys_validated,false);
 assert.equal(e.active_multisweep_calibration.workflow_run_id,43294699060);
 assert.deepEqual(e.active_multisweep_calibration.training.map(x=>x.sweep),[26,37]);
 assert.equal(e.active_multisweep_calibration.validation.sweep,44);
 assert.equal(e.active_multisweep_calibration.validation.observed_spikes,2);
 assert.equal(e.active_multisweep_calibration.validation.simulated_spikes,0);
 assert.equal(e.active_multisweep_calibration.validation.rmse_mV,4.343179);
 assert.equal(e.active_multisweep_calibration.holdout_used_for_parameter_selection,false);
 assert.equal(e.active_multisweep_calibration.human_active_channels_reconstructed,false);
 const cohort=e.human_cross_specimen_transfer;
 assert.equal(cohort.workflow_run_id,43299079259);
 assert.equal(cohort.additional_human_specimens.length,2);
 assert.deepEqual(cohort.additional_human_specimens.map(x=>x.specimen_id),[529898751,508410761]);
 assert.deepEqual(cohort.additional_human_specimens.map(x=>x.high_current.observed_spikes),[3,2]);
 assert.deepEqual(cohort.additional_human_specimens.map(x=>x.high_current.simulated_spikes),[0,0]);
 assert.deepEqual(cohort.additional_human_specimens.map(x=>x.high_current.rmse_mV),[7.778253,7.340096]);
 assert.equal(cohort.cross_cell_active_refit,false);
 assert.equal(cohort.selected_on_voltage_or_spike_labels,false);
 assert.equal(cohort.distinct_donors_verified,false);
 assert.equal(cohort.human_channel_kinetics_fitted,false);
 const naive=e.original_NaK_human_fit_v2;
 assert.equal(naive.workflow_run_id,43302961099);
 assert.equal(naive.locked_holdout.observed_spikes,2);
 assert.equal(naive.locked_holdout.predicted_spikes,1);
 assert.equal(naive.locked_holdout.rmse_mV,12.562798);
 assert.deepEqual(naive.external.map(x=>x.specimen_id),[529898751,508410761]);
 assert.deepEqual(naive.external.map(x=>x.predicted_spikes),[1,1]);
 assert.deepEqual(naive.external.map(x=>x.observed_spikes),[3,2]);
 assert.equal(naive.waveform_rmse_improved_over_HH,false);
 assert.equal(naive.physiologically_validated_human_channels,false);
 assert.equal(naive.other_specimens_retrained,false);





 assert.equal(e.measured_nwb.independent_holdout,false);
 assert.equal(e.measured_nwb.active_kinetics_calibrated,false);
 assert.equal(e.workflow_run_id,43264994852);
});

test('visible voltage graph is calculated from human passive data, not claimed as NWB recording',()=>{
 const data=biologicalResearchSnapshot();
 assert.equal(data.status,'research-readonly-frozen-receipt');
 assert.equal(data.predicted_trace.origin,'calculated-not-measured');
 assert.equal(data.protocol.measured_sweep_replayed,false);
 assert.equal(data.protocol.current_pA,-10);
 assert.equal(data.predicted_trace.values.length,120);
 const y=data.predicted_trace.values;
 assert.ok(Math.abs(y[0]-data.protocol.baseline_mV)<1e-5,'recorded membrane model rounds display voltage');
 assert.ok(y[60]<y[20]-0.9,'real membrane equation responds causally to negative current');
 assert.ok(y[110]>y[65],'voltage rebounds after physical current removal');
 assert.equal(data.model.human_active_channels_fitted,false);
 assert.equal(data.interpretation.human_brain_emulated,false);
 assert.equal(data.interpretation.brain_decisions_affected_by_this_research,false);
 assert.equal(data.interpretation.llm_used,false);
});

test('amygdala/glia/body/development status is honest and references real biological evidence',()=>{
 const entries=biologicalResearchSnapshot().subsystems;
 assert.equal(entries.length,8);
 assert.equal(entries.find(x=>x.id==='amygdala').status,'atlas-only');
 assert.equal(entries.find(x=>x.id==='amygdala').source,'NCBI GEO GSE342709');
 for(const id of ['active','synapse','cortical','glia','body','development']){
   assert.notEqual(entries.find(x=>x.id===id)?.status,'measured-and-modeled',id);
 }
});

test('biological lab is embedded in same AURA brain-and-dialogue page',()=>{
 assert.match(BRAIN_OPERATIONS_HTML,/id="bioEvidencePanel"/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="graphCanvas"/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="chatInput"/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="bioVoltageCanvas"/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="bioLabTrigger"/);
 assert.match(BRAIN_OPERATIONS_HTML,/aria-controls="bioEvidencePanel" aria-expanded="false"/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="bioBackdrop"[^>]*hidden/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="bioEvidencePanel"[^>]*hidden/);
 assert.doesNotMatch(BRAIN_OPERATIONS_HTML,/data-focus="bioEvidencePanel"/);
 assert.match(BRAIN_BIOPHYSICS_CSS,/#bioEvidencePanel\[hidden\]/);
 assert.match(BRAIN_BIOPHYSICS_CSS,/#bioEvidencePanel\.bio-research\{position:absolute/);
 assert.match(BRAIN_BIOPHYSICS_SCRIPT,/bioSetOpen\(/);
 assert.doesNotMatch(BRAIN_OPERATIONS_HTML,/__BIO_HTML__|__BIO_CSS__/);
 assert.ok(BRAIN_BIOPHYSICS_HTML.includes('aucune donnée')===false);
 assert.match(BRAIN_BIOPHYSICS_CSS,/bio-research/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/bioLoadEvidence/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="bioFitDetails"/);
 assert.match(BRAIN_BIOPHYSICS_SCRIPT,/bioFitSummary/);
 assert.match(BRAIN_BIOPHYSICS_HTML,/<details class="bio-fit-details"/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="bioCohortDetails"/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="bioHumanNaKV2Details"/);
 assert.match(BRAIN_BIOPHYSICS_SCRIPT,/bioNaKV2Summary/);
 assert.doesNotMatch(BRAIN_BIOPHYSICS_HTML,/<details class="bio-fit-details" id="bioHumanNaKV2Details" open/);

 assert.match(BRAIN_BIOPHYSICS_SCRIPT,/bioCohortSummary/);
 assert.doesNotMatch(BRAIN_BIOPHYSICS_HTML,/<details class="bio-fit-details" id="bioCohortDetails" open/);

 assert.doesNotMatch(BRAIN_BIOPHYSICS_HTML,/<details class="bio-fit-details"[^>]*open/);

 assert.match(BRAIN_BIOPHYSICS_SCRIPT,/calculated-not-measured/);
 assert.match(BRAIN_BIOPHYSICS_SCRIPT,/HH témoin/);
 assert.doesNotMatch(BRAIN_BIOPHYSICS_SCRIPT,/Math\.random|fakeSpike|fakePulse/);
});

test('server evidence endpoint cannot publish raw donor files or mutate persistent soul',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const matcher=/app\.get\('\/api\/research\/biophysics\/evidence',[\s\S]*?\n\}\);/;
 assert.match(server,matcher);
 const route=server.match(matcher)[0];
 assert.match(route,/biologicalResearchSnapshot\(\)/);
 assert.doesNotMatch(route,/readFile|fetch\(|saveSoul|kernel\.chat|runMicrocircuit/);
});
