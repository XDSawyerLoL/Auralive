#!/usr/bin/env python3
"""AURA v2: human-NWB-constrained *effective* Na/K gating, not molecular kinetics.

Original, independently written NMODL modules: aura_na_eff, aura_k_eff.
Historical squid HH modules are NEVER inserted in this simulation. Generic
Boltzmann + fixed-tau gates and a proximal axon proxy are hypotheses fit to
human SOMATIC current-clamp traces, not direct human NaV/Kv voltage-clamp data.
Do not conflate effective fitted gates with molecular channel identification.

Train on two Allen NWB currents, choose ONE candidate, then evaluate ONE
sealed third current. External target cells receive exactly the frozen gates
without target-cell active fitting. Never import noncommercial Allen modfiles.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

from export_allen_human_features import select_heldout_trace, file_sha256
from fit_human_active_multisweep import (
    select_prespecified_sweeps, normalized_error, select_fit_candidate,
)
from run_human_swc_neuron import (
    read_human_features, passive_geometry_parameters,
)

SOURCE = 'original-AURA-Boltzmann-NaK-effective-gates-fit-on-human-NWB'
SCHEMA = 'aura-human-effective-gating-v2'


def preregistered_candidates():
    """Limited, precommitted hypotheses; every parameter NOT directly measured.

    Na and K in S/cm². Half-activation and inactivation in mV, time
    constants in ms. The first axonal SWC section is NOT a verified AIS.
    """
    profiles = [
        (-42.,-55.,-32.,.15,1.4,1.1),
        (-35.,-55.,-32.,.15,1.4,1.1),
        (-42.,-48.,-28.,.12,2.0,.8),
        (-35.,-48.,-28.,.12,2.0,.8),
    ]
    conditions = [
        (.12,.035,4.),
        (.24,.035,8.),
        (.36,.025,8.),
    ]
    return [
        {'gna_soma':gna,'gk_soma':gk,'axon_gain':ax,
         'vhalf_na_m':na_m, 'vhalf_na_h':na_h,'vhalf_k':k_m,
         'tau_na_m':tm,'tau_na_h':th,'tau_k':tk}
        for na_m,na_h,k_m,tm,th,tk in profiles
        for gna,gk,ax in conditions
    ]


def validate_candidate(p):
    bounds = {
        'gna_soma':(.005,.6),
        'gk_soma':(.002,.2),
        'axon_gain':(1.,20.),
        'vhalf_na_m':(-60.,-15.),
        'vhalf_na_h':(-85.,-25.),
        'vhalf_k':(-55.,-5.),
        'tau_na_m':(.03,2.),
        'tau_na_h':(.2,20.),
        'tau_k':(.15,10.),
    }
    if not isinstance(p,dict) or set(p)!=set(bounds):
        raise ValueError('Explicit and complete kinetics specification required')
    for key,(low,high) in bounds.items():
        v=p[key]
        if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not low<=v<=high:
            raise ValueError('Invalid experimental parameter '+key)
    return True


def validate_compiled_mechanisms(library):
    library=Path(library)
    if not library.is_file() or library.stat().st_size>100_000_000:
        raise FileNotFoundError('Compiled original AURA mechanisms not found')
    return library.resolve()


class OriginalGatingCell:
    def __init__(self, swc_file, features, library):
        from neuron import h
        self.h=h
        h.load_file('stdrun.hoc')
        h.load_file('import3d.hoc')
        h.nrn_load_dll(str(validate_compiled_mechanisms(library)))
        swc=Path(swc_file)
        if not swc.is_file() or not 100<=swc.stat().st_size<=15_000_000:
            raise ValueError('Cell reconstruction SWC unavailable')
        reader=h.Import3d_SWC_read()
        reader.input(str(swc.resolve()))
        importer=h.Import3d_GUI(reader,0)
        class Cell:pass
        self.cell=Cell()
        importer.instantiate(self.cell)
        sections=list(h.allsec())
        if not 2<=len(sections)<=15000:
            raise ValueError('Expected multicompartment human cell')
        soma=[s for s in sections if 'soma' in s.name().lower()]
        axon=[s for s in sections if 'axon' in s.name().lower()]
        if not soma:raise ValueError('SWC has no soma')
        for sec in sections:
            if not 0<sec.L<=1e6 or not 0<sec.diam<=2000:
                raise ValueError('Invalid morphology geometry')
            n=max(1,min(201,math.ceil(sec.L/20)))
            sec.nseg=n if n%2 else n+1
        h.define_shape()
        area=sum(h.area(seg.x,sec=sec) for sec in sections for seg in sec)
        passive=passive_geometry_parameters(features,area)
        for sec in sections:
            sec.Ra=120 # unmeasured proxy, explicitly declared
            sec.cm=passive['cm_uF_cm2']
            sec.insert('pas')
            for seg in sec:
                seg.pas.g=passive['g_pas_S_cm2']
                seg.pas.e=features['features']['vrest_mV']
        self.active_soma=soma
        self.active_axon=axon[:1]
        for sec in self.active_soma+self.active_axon:
            sec.insert('aura_na_eff')
            sec.insert('aura_k_eff')
            for seg in sec:
                seg.ena=53   # assumed effective reversal, NOT specimen measured
                seg.ek=-90
                seg.aura_na_eff.slope_m=6
                seg.aura_na_eff.slope_h=6
                seg.aura_k_eff.slope_n=10
        self.soma=soma[0]
        self.electrode=h.IClamp(self.soma(.5))
        self.electrode.delay=0
        h.cvode_active(0)
        h.celsius=34
        self.section_count=len(sections)
        self.active_axon_is_measured_AIS=False

    def set_candidate(self,params):
        validate_candidate(params)
        for kind,sections in [('soma',self.active_soma),('axon',self.active_axon)]:
            gain=params['axon_gain'] if kind=='axon' else 1.
            for sec in sections:
                for seg in sec:
                    na=seg.aura_na_eff
                    k=seg.aura_k_eff
                    na.gbar=params['gna_soma']*gain
                    na.vhalf_m=params['vhalf_na_m']
                    na.vhalf_h=params['vhalf_na_h']
                    na.tau_m=params['tau_na_m']
                    na.tau_h=params['tau_na_h']
                    k.gbar=params['gk_soma']*gain
                    k.vhalf_n=params['vhalf_k']
                    k.tau_n=params['tau_k']

    def simulate(self,trace,params):
        self.set_candidate(params)
        dt=trace.get('dt_ms')
        voltage=trace.get('voltage_mV')
        current=trace.get('stimulus_current_pA')
        if not isinstance(voltage,list) or not isinstance(current,list) or len(voltage)!=len(current) or not 20<=len(voltage)<=15000:
            raise ValueError('Measured current-clamp arrays must be aligned and bounded')
        if not isinstance(dt,(float,int)) or not .01<=dt<=.1:
            raise ValueError('Timebase out of range')
        h=self.h
        h.dt=dt
        h.steps_per_ms=1/dt
        self.electrode.dur=len(voltage)*dt+1
        h.finitialize(float(voltage[0]))
        response=[]
        for current_pA in current:
            if not math.isfinite(current_pA) or abs(current_pA)>2000:
                raise ValueError('Current outside research safety bound')
            self.electrode.amp=current_pA/1000
            h.fadvance()
            v=float(self.soma(.5).v)
            if not math.isfinite(v) or abs(v)>250:
                raise ArithmeticError('Unstable original active gating model')
            response.append(v)
        metric=normalized_error(voltage,response,dt)
        metric['model_origin']=SOURCE
        return metric


def fit_reference(model, selection, records, *,candidates=None):
    candidates=preregistered_candidates() if candidates is None else candidates
    train=selection['training_sweep_numbers']
    hold=selection['validation_sweep_numbers']
    if len(train)!=2 or len(hold)!=1 or len(set(train+hold))!=3:
        raise ValueError('Two training and one locked validation current required')
    if not all(s in records for s in train+hold):
        raise ValueError('Missing human NWB from required specimen')
    if len({records[s]['specimen_id'] for s in train+hold})!=1:
        raise ValueError('Mixed human donor specimen')
    for p in candidates:validate_candidate(p)
    # Cap candidates and record every score. This does not inspect validation.
    if len(candidates)>24:
        raise ValueError('Predeclared parameter budget exceeded')
    def evaluate(param,s):
        if s not in train:raise RuntimeError('Heldout trace accessed during fit')
        return {'sweep_number':s,**model.simulate(records[s],param)}
    winner,trials=select_fit_candidate(candidates,train,evaluate)
    holdnum=hold[0]
    validation={'sweep_number':holdnum,**model.simulate(records[holdnum],winner['candidate'])}
    return {
        'schema':SCHEMA,
        'reference_specimen':records[train[0]]['specimen_id'],
        'selection':selection,
        'active_mechanisms_source':SOURCE,
        'mechanism_class':'original-generic-Boltzmann-effective-Na/K-gates',
        'compiled_modfiles':['aura_na_eff.mod','aura_k_eff.mod'],
        'third_party_NMODL_redistributed':False,
        'human_NaK_direct_voltage_clamp_calibrated':False,
        'fitted_to_human_somatic_current_clamp':True,
        'molecular_channel_kinetics_identified':False,
        'human_AIS_anatomy_identified':False,
        'hypothesized_reversal_potentials_mV':{'na':53,'k':-90},
        'hypothesized_slope_mV':{'na_m':6,'na_h':6,'k':10},
        'training_candidate_count':len(candidates),
        'full_candidate_training_metrics':trials,
        'winner':winner['candidate'],
        'mean_training_loss':winner['train_loss'],
        'training_metrics':winner['training'],
        'locked_holdout_metrics':validation,
        'locked_holdout_used_for_selection':False,
        'heldout_independent_of_Allen_passive_feature_extraction':False,
        'independent_cells_evaluated':False,
        'success_firing_on_holdout':validation['observed_spikes']==validation['predicted_spikes'],
        'biologically_validated_human_channel':False,
        'human_brain_simulated':False,
        'no_llm':True,
        'production_state_modified':False,
    }


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--specimen-id',type=int,required=True)
    parser.add_argument('--manifest',type=Path,required=True)
    parser.add_argument('--swc',type=Path,required=True)
    parser.add_argument('--features',type=Path,required=True)
    parser.add_argument('--mechanism-library',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    features=read_human_features(args.features)
    if features['specimen_id']!=args.specimen_id:
        raise ValueError('Human features/specimen mismatch')
    from allensdk.core.cell_types_cache import CellTypesCache
    cache=CellTypesCache(manifest_file=str(args.manifest))
    selection=select_prespecified_sweeps(cache.get_ephys_sweeps(args.specimen_id))
    nwbpath=args.manifest.parent/('specimen_'+str(args.specimen_id))/'ephys.nwb'
    dataset=cache.get_ephys_data(args.specimen_id,file_name=str(nwbpath))
    records={}
    for number in selection['training_sweep_numbers']+selection['validation_sweep_numbers']:
        records[number]=select_heldout_trace(
            dataset,specimen_id=args.specimen_id,sweep_number=number,max_samples=10000)
    cell=OriginalGatingCell(args.swc,features,args.mechanism_library)
    report=fit_reference(cell,selection,records)
    report['morphology_sha256']=file_sha256(args.swc)
    report['nwb_sha256']=file_sha256(nwbpath)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print(json.dumps({
        'reference_specimen':report['reference_specimen'],
        'active_mechanism':SOURCE,
        'train_nwb':selection['training_sweep_numbers'],
        'holdout_nwb':report['locked_holdout_metrics']['sweep_number'],
        'observed_spikes':report['locked_holdout_metrics']['observed_spikes'],
        'predicted_spikes':report['locked_holdout_metrics']['predicted_spikes'],
        'voltage_rmse_mV':report['locked_holdout_metrics']['rmse_mV'],
        'human_molecular_channel_identified':False,
    }))


if __name__=='__main__':
    main()
