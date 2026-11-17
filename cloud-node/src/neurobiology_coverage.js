// Code capability audit, NOT a certification of human-brain equivalence.
// Each item is an explicitly bounded status rather than a percent 'complete'.
export const NEUROBIOLOGY_COVERAGE_SCHEMA='aura-neurobiology-coverage-v1';
const rows=[
 ['genome_and_gene_regulation','research-toy','digital_protogenome.js;neurodevelopmental_genome.js;human_reference_genome.js','Offline GRCh38 reference FASTA integrity check added; real gene regulation, transcriptomics and protein expression still absent'],
 ['neuronal_membrane_passive','human-measurement-fitted-subset','human_ephys_calibration.js','Human single-cell passive features, not an active neuron or brain'],
 ['active_sodium_potassium_channels','research-toy','biophysical_microcircuit.js','Squid HH baseline and unvalidated human active-gate fitting'],
 ['calcium_channels_and_pumps','not-reconstructed','','Ion pumps, calcium channels and gradients absent'],
 ['neuronal_morphology_and_compartments','human-measurement-fitted-subset','biophysical_morphology.js','Human SWC compartmented passive cell only'],
 ['excitatory_inhibitory_synapses','research-toy','biophysical_synapses.js','AMPA/NMDA/GABA receptor constants not human calibrated'],
 ['synaptic_short_term_plasticity','research-toy','neural_plasticity.js','Release-resource and facilitation model exists; vesicles and human rates not fitted'],
 ['synaptic_long_term_plasticity','research-toy','neural_plasticity.js;anatomical_circuit_motifs.js','Event-timing STDP toy and independent rate coactivity; not human LTP/LTD pathways'],
 ['astrocyte_ion_and_glutamate_homeostasis','research-toy','biophysical_glia.js','Uncalibrated ion buffering and uptake equations'],
 ['microglia_and_immune','research-toy','biophysical_glia.js','Slow scalar inflammation, no human immune network'],
 ['oligodendrocytes_and_myelin','research-toy','biophysical_glia.js','Myelin proxy, no tested conduction mechanisms'],
 ['blood_brain_barrier_and_glymphatic','not-reconstructed','','Barrier transport and glymphatic flow absent'],
 ['neurovascular_oxygen_and_glucose','research-toy','anatomical_circuit_motifs.js','Oxygen/glucose/ATP rate coupling is toy dynamics, not vessel network or measured perfusion'],
 ['cortical_laminar_microcircuits','research-toy','anatomical_circuit_motifs.js','Six named cortical layers and inhibitory motifs are rate populations, not human laminar cell ensembles'],
 ['thalamocortical_relay_reticular_nucleus','research-toy','anatomical_circuit_motifs.js','Thalamic relay-reticular motif; anatomical strengths and oscillations unvalidated'],
 ['prefrontal_executive_networks','software-analogue','cognition.js','Not dlPFC/vmPFC/OFC neural models'],
 ['hippocampus_dentate_CA3_CA1_subiculum','research-toy','anatomical_circuit_motifs.js','DG-CA3-CA1-subiculum motif; no human hippocampal physiology or memory verification'],
 ['amygdala_basolateral_central_intercalated','research-toy','biophysical_microcircuit.js','A named cell, no subnuclear human circuit'],
 ['basal_ganglia_direct_indirect_hyperdirect','research-toy','anatomical_circuit_motifs.js','D1/D2-GPe-GPi-STN motifs; dopamine circuits and parameters not human calibrated'],
 ['dopamine_noradrenaline_serotonin_acetylcholine','software-analogue','brain_physiology.js','Derived indexes, not neuromodulator concentrations'],
 ['cerebellum_Purkinje_deep_nuclei','research-toy','anatomical_circuit_motifs.js','Purkinje, granule and deep nucleus motifs; no detailed human cerebellar microcircuit'],
 ['insula_interoceptive_network','research-toy','biophysical_microcircuit.js','One named node, no visceral relay physiology'],
 ['hypothalamic_autonomic_endocrine_HPA','research-toy','biophysical_microcircuit.js','HPA chain illustrated with uncalibrated constants'],
 ['brainstem_reticular_arousal_and_vagus','software-analogue','functional_medulla.js','Runtime restarts are not brainstem neurons'],
 ['sleep_circadian_and_consolidation','software-analogue','offline_consolidation.js','No biological circadian or sleep-stage circuitry'],
 ['retina_vision_and_visual_cortex','software-analogue','semantic_perception_browser.js','Browser classifier, no retinal neuronal pathway'],
 ['cochlea_auditory_pathways','software-analogue','voice.js','Audio operations, no cochlea or auditory neuronal pathway'],
 ['somatosensory_motor_spinal_loop','not-reconstructed','','Motor, spinal and proprioceptive loops absent'],
 ['language_frontotemporal_arcuate_networks','software-analogue','native_semantic_grammar.js','French parsing does not recreate Broca/Wernicke networks'],
 ['neurological_development_migration_pruning','research-toy','neurodevelopmental_genome.js','Numerical developmental parameter, no human neurogenesis'],
 ['social_communication_policy','software-analogue','social_homeostasis.js','Learned contact choices, not social neurocircuit'],
 ['subjective_experience','not-measurable-here','','No established demonstration of subjective consciousness']
];
const tiers=['human-measurement-fitted-subset','research-toy','software-analogue','not-reconstructed','not-measurable-here'];
const systems=Object.freeze(rows.map(([id,status,refs,missing])=>Object.freeze({
 id,status,module_refs:refs?refs.split(';').map(n=>'cloud-node/src/'+n):[],
 missing,brain_equivalent_verified:false})));
export function neurobiologyCoverageAudit(){
 return {schema:NEUROBIOLOGY_COVERAGE_SCHEMA,examined_systems:systems.length,
  counts:Object.fromEntries(tiers.map(t=>[t,systems.filter(s=>s.status===t).length])),
  systems,whole_human_brain_equivalent:false,molecular_human_genome_equivalent:false,
  validated_human_spiking_network:false,production_brain_driven_by_biophysical_model:false,
  human_gene_or_protein_dataset_embedded:false,
  evidence_basis:'code-module-audit-not-biological-certification',
  sources:['https://alleninstitute.github.io/abc_atlas_access/descriptions/WHB-taxonomy.html',
   'https://celltypes.brain-map.org/',
   'https://www.genome.gov/about-genomics/fact-sheets/Deoxyribonucleic-Acid-Fact-Sheet'],
  transparency:'A catalogue of proxies is not a reconstructed human brain'};
}