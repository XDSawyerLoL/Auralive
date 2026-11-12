#!/usr/bin/env python3
"""AURA — deterministic multi-sweep *effective* Na/K HH density fitting.

Real Allen Homo sapiens specimen with real SWC; active kinetics are historic
squid Hodgkin-Huxley, NOT human channel gating. Training uses two distinct
human NWB stimuli; a third recorded sweep is locked away until the final
candidate has been chosen. Results can be negative. A validation sweep is
held out from THIS optimizer, not necessarily from Allen's original extraction
of passive vrest, resistance and tau.

NEVER use as a production AURA brain. No model provider, no donor raw
recordings uploaded, no stochastic search or fake neuron activities.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

from analyze_human_spiking_nwb import spike_report
from export_allen_human_features import select_heldout_trace
from run_human_swc_neuron import passive_geometry_parameters, read_human_features
from run_human_active_hh_control import detect_events


def select_prespecified_sweeps(metadata):
    """Deterministic selection based ONLY on stimulus type, amplitude and ID.

    We do not inspect voltage, recorded spikes or metadata num_spikes here.
    Holdout middle amplitude tests interpolation between training currents.
    """
    choices = []
    for sweep in metadata:
        try:
            number = sweep.get('sweep_number')
            amp = float(sweep.get('stimulus_absolute_amplitude'))
            stimulus = str(sweep.get('stimulus_name', '')).strip().lower()
        except (TypeError, ValueError):
            continue
        if (isinstance(number, int) and not isinstance(number, bool)
            and number >= 0 and math.isfinite(amp)
            and 0 < amp <= 2000 and 'long square' in stimulus):
            choices.append((amp, number))
    # Unique stimulus amplitudes; repeated sweeps may share the same settings
    # and cannot count as independent stimulus *conditions*.
    conditions={}
    for amp,num in sorted(choices, key=lambda row:(row[0], row[1])):
        conditions.setdefault(round(amp,5),num)
    ordered=sorted((amp,num) for amp,num in conditions.items())
    if len(ordered)<3:
        raise ValueError('At least three distinct positive long-square currents required')
    left=ordered[0][1]
    right=ordered[-1][1]
    median=ordered[(len(ordered)-1)//2][1]
    if len(set((left,right,median)))!=3:
        raise ValueError('Training and validation sweep leakage')
    return {
        'training_sweep_numbers':[left,right],
        'validation_sweep_numbers':[median],
        'selection_policy':'smallest and largest positive distinct long-square currents for training; median for validation',
        'selected_using_spike_counts':False,
        'training_conditions_pA':[ordered[0][0],ordered[-1][0]],
        'validation_condition_pA':ordered[(len(ordered)-1)//2][0],
        'distinct_current_conditions':len(ordered),
    }


def fixed_candidate_grid():
    # Distinct, predeclared effective densities and one optional axonal
    # *proxy* region; does not imply measured AIS morphology or channel fits.
    return [
        {'na':1.,'k':1.,'axon':0.},
        {'na':2.,'k':1.,'axon':0.},
        {'na':4.,'k':.6,'axon':0.},
        {'na':1.,'k':.6,'axon':0.},
        {'na':2.,'k':.6,'axon':1.},
        {'na':4.,'k':.6,'axon':1.},
        {'na':2.,'k':1.,'axon':1.},
        {'na':4.,'k':1.,'axon':1.},
    ]


def select_fit_candidate(candidates, training_sweeps, evaluator):
    if len(training_sweeps)<2 or len(set(training_sweeps))!=len(training_sweeps):
        raise ValueError('Requires at least two unique training sweeps')
    if not candidates:raise ValueError('No predeclared candidate parameters')
    trials=[]
    for candidate in candidates:
        scores=[evaluator(candidate,num) for num in training_sweeps]
        if any(not math.isfinite(x['loss']) for x in scores):
            raise ArithmeticError('Nonfinite training loss')
        loss=sum(x['loss'] for x in scores)/len(scores)
        trials.append({'candidate':dict(candidate),'train_loss':round(loss,6),
                       'training':scores})
    best=min(enumerate(trials),key=lambda x:(x[1]['train_loss'],x[0]))[1]
    return best,trials


def normalized_error(observed, simulated, dt):
    if len(observed)!=len(simulated) or not observed:
        raise ValueError('Non-aligned observed/predicted voltage')
    if not all(math.isfinite(v) for v in observed+simulated):
        raise ArithmeticError('Non-finite membrane voltage')
    obs_spikes=detect_events(observed,dt)
    pred_spikes=detect_events(simulated,dt)
    squared=sum((o-p)**2 for o,p in zip(observed,simulated))/len(observed)
    rmse=math.sqrt(squared)
    # Spike-count mismatch must matter more than minor baseline noise;
    # explicitly predeclared and unchanged across all candidates/sweeps.
    spike_error=abs(len(pred_spikes)-len(obs_spikes))
    loss=rmse+5*spike_error
    return {
        'observed_spikes':len(obs_spikes),
        'predicted_spikes':len(pred_spikes),
        'spike_count_error':len(pred_spikes)-len(obs_spikes),
        'rmse_mV':round(rmse,6),
        'mae_mV':round(sum(abs(o-p) for o,p in zip(observed,simulated))/len(observed),6),
        'loss':round(loss,6),
        'loss_definition':'RMSE(mV) + 5mV * abs(spike_count_difference)',
        'observation_origin':'real-Allen-NWB',
        'model_origin':'historic-squid-HH-kinetics-on-human-SWC',
    }


class ReusableNeuronModel:
    def __init__(self, swc_file, features):
        from neuron import h
        self.h=h
        swc=Path(swc_file)
        if not swc.is_file() or swc.stat().st_size>15_000_000:
            raise ValueError('Missing/too-large human morphology SWC')
        h.load_file('stdrun.hoc')
        h.load_file('import3d.hoc')
        reader=h.Import3d_SWC_read()
        reader.input(str(swc.resolve()))
        import3d=h.Import3d_GUI(reader,0)
        class Cell:pass
        self.cell=Cell()
        import3d.instantiate(self.cell)
        sections=list(h.allsec())
        if len(sections)<2 or len(sections)>15000:
            raise ValueError('SWC has unsupported section count')
        self.soma=[sec for sec in sections if 'soma' in sec.name().lower()]
        self.axon=[sec for sec in sections if 'axon' in sec.name().lower()]
        if not self.soma:raise ValueError('Human soma section not found')
        for sec in sections:
            if not (0<sec.L<=1e6 and 0<sec.diam<=2000):
                raise ValueError('Invalid neuronal geometry')
            n=max(1,min(201,math.ceil(sec.L/20)))
            sec.nseg=n if n%2 else n+1
        h.define_shape()
        surface=sum(h.area(seg.x,sec=sec) for sec in sections for seg in sec)
        self.passive=passive_geometry_parameters(features,surface)
        self.vrest=features['features']['vrest_mV']
        for sec in sections:
            sec.Ra=120 # unmeasured effective axial resistivity
            sec.cm=self.passive['cm_uF_cm2']
            sec.insert('pas')
            for seg in sec:
                seg.pas.g=self.passive['g_pas_S_cm2']
                seg.pas.e=self.vrest
        # The first axonal section is only a structural PROXY for a proximal
        # active region. It is NOT a measured axon initial segment.
        self.active_soma=self.soma
        self.active_axon=self.axon[:1]
        for sec in self.active_soma+self.active_axon:
            sec.insert('hh')
            for seg in sec:
                seg.hh.gl=0
                seg.hh.el=self.vrest
                seg.ena=50;seg.ek=-77
        self.electrode=h.IClamp(self.soma[0](.5))
        self.electrode.delay=0
        h.celsius=34
        h.cvode_active(0)
        self.section_count=len(sections)
        self.spatial_model='human-SWC-soma-plus-optional-first-axon-section-proxy'

    def set_candidate(self,params):
        for key in ('na','k','axon'):
            if not isinstance(params.get(key),(int,float)) or not math.isfinite(params[key]):
                raise ValueError('Invalid active density parameter')
        if not (.1<=params['na']<=5 and .1<=params['k']<=5 and 0<=params['axon']<=2):
            raise ValueError('Active density out of declared research bounds')
        for sec in self.active_soma:
            for seg in sec:
                seg.hh.gnabar=.12*params['na']
                seg.hh.gkbar=.036*params['k']
        for sec in self.active_axon:
            for seg in sec:
                seg.hh.gnabar=.12*params['na']*params['axon']
                seg.hh.gkbar=.036*params['k']*params['axon']

    def simulate(self,trace,params):
        self.set_candidate(params)
        h=self.h
        dt=trace['dt_ms']
        if not .01<=dt<=.1 or len(trace['voltage_mV'])>15000:
            raise ValueError('NWB sample budget exceeded')
        h.dt=dt
        h.steps_per_ms=1/dt
        self.electrode.dur=len(trace['voltage_mV'])*dt+1
        h.finitialize(float(trace['voltage_mV'][0]))
        output=[]
        for current in trace['stimulus_current_pA']:
            self.electrode.amp=current/1000
            h.fadvance()
            v=float(self.soma[0](.5).v)
            if not math.isfinite(v) or abs(v)>300:
                raise ArithmeticError('Numerically unstable active neuron')
            output.append(v)
        return normalized_error(trace['voltage_mV'],output,dt)


def build_report(selection, model, traces, *, candidates=None):
    train=selection['training_sweep_numbers']
    hold=selection['validation_sweep_numbers']
    if len(hold)!=1 or len(set(train+hold))!=len(train)+len(hold):
        raise ValueError('Training-validation isolation broken')
    if not all(k in traces for k in train+hold):
        raise ValueError('Missing measured human NWB sweep')
    for num in train+hold:
        record=traces[num]
        if record['source'].get('origin')!='Allen Cell Types Database':
            raise ValueError('No reliable source label')
        if len(record['voltage_mV'])!=len(record['stimulus_current_pA']):
            raise ValueError('NWB stimulus/response mismatch')
    candidates=fixed_candidate_grid() if candidates is None else candidates
    # The training evaluator cannot look up the reserved validation trace.
    # Evaluating holdout candidates or choosing parameters from its score
    # would invalidate the experiment.
    def training_eval(candidate,num):
        if num not in train:raise ValueError('Holdout accessed during fit')
        return {'sweep_number':num,**model.simulate(traces[num],candidate)}
    best,trials=select_fit_candidate(candidates,train,training_eval)
    holdout_num=hold[0]
    validation={'sweep_number':holdout_num,
                **model.simulate(traces[holdout_num],best['candidate'])}
    return {
        'schema':'aura-active-human-multisweep-research-v1',
        'specimen_id':traces[train[0]]['specimen_id'],
        'selection':selection,
        'candidate_count':len(candidates),
        'fixed_candidate_grid':candidates,
        'best_fit_parameters':best['candidate'],
        'training_mean_loss':best['train_loss'],
        'training_metrics':best['training'],
        'validation_metrics':validation,
        'all_training_trials':trials,
        'validation_used_for_model_selection':False,
        'different_stimulus_conditions':True,
        'same_donor_features_precomputed_by_Allen':True,
        'independent_from_active_optimizer':True,
        'independent_of_Allen_original_feature_extraction':False,
        'calibrated_parameter_scope':'relative HH Na/K densities and one axonal proxy',
        'channel_gating_source':'historic squid HH not human kinetics',
        'true_human_active_channels_reconstructed':False,
        'validated_human_neuron_model':False,
        'human_brain_reconstructed':False,
        'pass_fail':'not_assessed',
        'research_only':True,'no_llm':True,'production_state_modified':False,
    }


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--specimen-id',type=int,default=643582610)
    parser.add_argument('--manifest',type=Path,required=True)
    parser.add_argument('--swc',type=Path,required=True)
    parser.add_argument('--features',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    if args.specimen_id<1000:parser.error('Valid human Allen specimen required')
    features=read_human_features(args.features)
    if features['specimen_id']!=args.specimen_id:
        raise ValueError('Human ephys features specimen ID mismatch')
    from allensdk.core.cell_types_cache import CellTypesCache
    cache=CellTypesCache(manifest_file=str(args.manifest))
    selection=select_prespecified_sweeps(cache.get_ephys_sweeps(args.specimen_id))
    nwb_path=args.manifest.parent/('specimen_'+str(args.specimen_id))/'ephys.nwb'
    nwbdataset=cache.get_ephys_data(args.specimen_id,file_name=str(nwb_path))
    records={}
    for num in selection['training_sweep_numbers']+selection['validation_sweep_numbers']:
        record=select_heldout_trace(nwbdataset,specimen_id=args.specimen_id,
                                    sweep_number=num,max_samples=10000)
        records[num]=record
    model=ReusableNeuronModel(args.swc,features)
    report=build_report(selection,model,records)
    report['source_morphology_sha256']=hashlib.sha256(args.swc.read_bytes()).hexdigest()
    # Do NOT export raw donor traces, derivative training voltage series,
    # personal identifiers or compiled MOD files.
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({
        'trained_sweeps':selection['training_sweep_numbers'],
        'heldout_sweep':selection['validation_sweep_numbers'],
        'observed_validation_spikes':report['validation_metrics']['observed_spikes'],
        'predicted_validation_spikes':report['validation_metrics']['predicted_spikes'],
        'heldout_rmse_mV':report['validation_metrics']['rmse_mV'],
        'provenance':'human NWB observations / historical HH channel kinetics'},indent=2))


if __name__=='__main__':main()
