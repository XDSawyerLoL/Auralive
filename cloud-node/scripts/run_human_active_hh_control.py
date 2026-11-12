#!/usr/bin/env python3
"""Run a REAL NEURON simulation on a HUMAN SWC morphology under an Allen NWB stimulus.

CRITICAL: the active Na/K channel kinetics come from NEURON's built-in HH
(squid-derived Hodgkin-Huxley), NOT measured human channels. This is a
falsifiable active-control experiment, not a validated human active neuron.

The human cell's measured resting voltage, input resistance and tau set
the passive properties. The model is stimulated with the recorded NWB
current and tested against a human measured *spiking* voltage trace.

No LLM, downloaded MOD compilation, production state changes or fake spikes.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

from run_human_swc_neuron import (
    read_human_features, load_stimulus, passive_geometry_parameters,
)
from analyze_human_spiking_nwb import spike_report


def detect_events(voltages, dt_ms, threshold_mV=-20, refractory_ms=2):
    if not voltages or dt_ms<=0:
        raise ValueError('sampled voltage trace required')
    last=-10**9
    refractory=max(1,math.ceil(refractory_ms/dt_ms))
    window=max(1,math.ceil(2/dt_ms))
    indices=[]
    for i in range(1,len(voltages)):
        if voltages[i-1]<threshold_mV<=voltages[i] and i-last>=refractory:
            if max(voltages[i:min(len(voltages),i+window)])>=0:
                indices.append(i)
                last=i
    return indices


def run_human_morphology_squid_hh(swc_path, features, stimulus, *,
                                  gna_scale=1, gk_scale=1, ra_ohm_cm=120,
                                  temperature_c=34):
    """Conductance-based compartmental NEURON model with nonhuman HH kinetics."""
    from neuron import h
    if not (.1<=gna_scale<=5 and .1<=gk_scale<=5):
        raise ValueError('active channel density multiplier out of research bounds')
    if not 20<=ra_ohm_cm<=400 or not 20<=temperature_c<=38:
        raise ValueError('illustrative research assumptions out of bounds')
    swc=Path(swc_path)
    if not swc.is_file() or swc.stat().st_size>15_000_000:
        raise ValueError('missing or too-large SWC')
    h.load_file('stdrun.hoc')
    h.load_file('import3d.hoc')
    reader=h.Import3d_SWC_read()
    reader.input(str(swc.resolve()))
    importer=h.Import3d_GUI(reader,0)
    class MorphologicalCell: pass
    cell=MorphologicalCell()
    importer.instantiate(cell)
    sections=list(h.allsec())
    somas=[sec for sec in sections if 'soma' in sec.name().lower()]
    if not sections or not somas or len(sections)>15000:
        raise ValueError('bad SWC morphology')
    for sec in sections:
        if not (0<sec.L<=1e6 and 0<sec.diam<=2000):
            raise ValueError('invalid cell geometry')
        n=max(1,min(201,math.ceil(sec.L/20)))
        sec.nseg=n if n%2 else n+1
    h.define_shape()
    area=sum(h.area(seg.x,sec=sec) for sec in sections for seg in sec)
    params=passive_geometry_parameters(features,area)
    for sec in sections:
        sec.Ra=ra_ohm_cm
        sec.cm=params['cm_uF_cm2']
        sec.insert('pas')
        for seg in sec:
            seg.pas.g=params['g_pas_S_cm2']
            seg.pas.e=features['features']['vrest_mV']
    # Explicit *active* conductances only on somatic membrane, which is
    # NOT a physiological reconstruction of AIS/dendritic channel maps.
    for sec in somas:
        sec.insert('hh')
        for seg in sec:
            seg.hh.gnabar=.12*gna_scale  # S/cm2, classic HH reference
            seg.hh.gkbar=.036*gk_scale  # S/cm2, classic HH reference
            seg.hh.gl=0               # avoid double-counting passive leak
            seg.hh.el=features['features']['vrest_mV']
            seg.ena=50               # squid reference reversal, not human fit
            seg.ek=-77
    soma=somas[0]
    electrode=h.IClamp(soma(.5))
    electrode.delay=0
    electrode.dur=len(stimulus['current_pA'])*stimulus['dt_ms']+1
    h.celsius=temperature_c
    h.cvode_active(0)
    h.dt=stimulus['dt_ms']
    h.steps_per_ms=1/h.dt
    measured=stimulus.get('measured_mV')
    if measured is None:
        raise ValueError('real NWB voltage required: no synthetic validation')
    if not all(math.isfinite(v) and -150<=v<=100 for v in measured):
        raise ValueError('bad observed voltage trace')
    h.finitialize(float(measured[0]))
    predicted=[]
    for pA in stimulus['current_pA']:
        electrode.amp=pA/1000
        h.fadvance()
        prediction=float(soma(.5).v)
        if not math.isfinite(prediction) or abs(prediction)>300:
            raise ArithmeticError('unstable active membrane integration')
        predicted.append(prediction)
    error=[x-y for x,y in zip(predicted,measured)]
    expected_spikes=detect_events(measured,stimulus['dt_ms'])
    produced_spikes=detect_events(predicted,stimulus['dt_ms'])
    rmse=math.sqrt(sum(x*x for x in error)/len(error))
    return {
        'schema':'aura-human-morphology-hh-reference-v1',
        'kind':'active-reference-control-not-human-active-calibration',
        'source_swc_sha256':hashlib.sha256(swc.read_bytes()).hexdigest(),
        'sample_count':len(predicted),
        'dt_ms':stimulus['dt_ms'],
        'human_membrane_source':'Allen Cell Types human passive vrest/ri/tau',
        'active_channel_source':'NEURON built-in HH reference (squid-derived)',
        'soma_only_active_channels':True,
        'human_channels_calibrated':False,
        'conductances':{
            'gnabar_S_cm2':.12*gna_scale,
            'gkbar_S_cm2':.036*gk_scale,
            'pas_S_cm2':params['g_pas_S_cm2'],
            'cm_uF_cm2':params['cm_uF_cm2'],
            'active_density_multiplier_na':gna_scale,
            'active_density_multiplier_k':gk_scale,
            'sodium_reversal_mV':50,
            'potassium_reversal_mV':-77,
        },
        'unmeasured_assumptions':{
            'temperature_C':temperature_c,
            'axial_resistivity_ohm_cm':ra_ohm_cm,
        },
        'experimental_observed':{
            'spike_count':len(expected_spikes),
            'voltage_max_mV':max(measured),
        },
        'model_predicted':{
            'spike_count':len(produced_spikes),
            'voltage_max_mV':max(predicted),
            'voltage_min_mV':min(predicted),
            'spike_count_error':len(produced_spikes)-len(expected_spikes),
            'rmse_mV':round(rmse,6),
            'mae_mV':round(sum(abs(x) for x in error)/len(error),6),
        },
        'claim':'reference-squid-HH-on-human-morphology-not-biologically-validated',
        'independent_holdout_validated':False,
        'reproduced_human_neuron':False,
        'human_brain_emulated':False,
        'no_llm':True,
        'production_state_changed':False,
    }


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--swc',type=Path,required=True)
    parser.add_argument('--human-features',type=Path,required=True)
    parser.add_argument('--nwb-trace',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--gna-scale',type=float,default=1)
    parser.add_argument('--gk-scale',type=float,default=1)
    options=parser.parse_args()
    features=read_human_features(options.human_features)
    trace=json.loads(options.nwb_trace.read_text(encoding='utf-8'))
    if str(trace.get('specimen_id'))!=str(features['specimen_id']):
        raise ValueError('human NWB and SWC must be same donor specimen')
    checked=spike_report(trace)
    if checked['spike_count']<1:
        raise ValueError('chosen trace has no measured action potentials')
    stimulus=load_stimulus(options.nwb_trace)
    result=run_human_morphology_squid_hh(
        options.swc,features,stimulus,
        gna_scale=options.gna_scale,gk_scale=options.gk_scale)
    result['specimen_id']=features['specimen_id']
    result['sweep_number']=trace['sweep_number']
    result['nwb_source_sha256']=trace['source'].get('nwb_sha256')
    options.output.parent.mkdir(parents=True,exist_ok=True)
    options.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'specimen':result['specimen_id'],
        'sweep':result['sweep_number'],
        'observed':result['experimental_observed']['spike_count'],
        'simulated':result['model_predicted']['spike_count'],
        'rmse_mV':result['model_predicted']['rmse_mV'],
        'active_human_calibration':False}))


if __name__=='__main__':
    main()
