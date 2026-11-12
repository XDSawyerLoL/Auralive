#!/usr/bin/env python3
"""Run a reconstructed dendritic cable in NEURON with measured human passive features.

Requires pip install neuron; intentionally isolated from AURA Cloud Node.
This is a passive, multicompartment HUMAN-MORPHOLOGY research calculation,
not a calibrated active human neuron or full brain. Native .mod files are not
compiled or loaded. Morphology is SWC from a separately verified human cell.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

SCHEMA = 'aura-allen-cell-types-human-ephys-v1'


def read_human_features(path):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    if data.get('schema_version') != SCHEMA or data.get('species') != 'Homo sapiens':
        raise ValueError('human Allen record required')
    source = data.get('source', {})
    if (source.get('dataset') != 'Allen Cell Types Database' or
        source.get('species_filter') != 'CellTypesApi.HUMAN' or
        source.get('human_specimen_verified') is not True or
        source.get('feature_units') != {'vrest': 'mV','ri': 'MOhm','tau': 'ms'}):
        raise ValueError('human origin and units not documented')
    features = data.get('features', {})
    specimen = data.get('specimen_id')
    v = features.get('vrest_mV')
    r = features.get('input_resistance_MOhm')
    tau = features.get('membrane_tau_ms')
    if (not isinstance(specimen, int) or isinstance(specimen, bool) or specimen < 1000 or
        not all(isinstance(x, (float, int)) and not isinstance(x, bool) and
                math.isfinite(x) for x in (v, r, tau)) or
        not (-110 <= v <= -35 and 5 <= r <= 3000 and .1 <= tau <= 500)):
        raise ValueError('invalid electrophysiological input')
    return data


def load_stimulus(path=None, *, dt_ms=.05, duration_ms=250, current_pA=35):
    if path:
        record=json.loads(Path(path).read_text(encoding='utf-8'))
        if record.get('used_for_fit') is not False:
            raise ValueError('held-out data must be marked not used for parameter fit')
        dt_ms=record.get('dt_ms')
        currents=record.get('stimulus_current_pA')
        measured=record.get('voltage_mV')
        if (not isinstance(currents, list) or not isinstance(measured, list)
            or len(currents) != len(measured) or not 2<=len(currents)<=20000):
            raise ValueError('held-out current and voltage arrays must match')
        if any(not isinstance(x,(int,float)) or not math.isfinite(x)
               for x in currents+measured):
            raise ValueError('nonfinite held-out measurements')
    else:
        if not (isinstance(duration_ms, (float,int)) and math.isfinite(duration_ms)
                and .5<=duration_ms<=1000):
            raise ValueError('duration out of range')
        if not isinstance(current_pA, (int,float)) or abs(current_pA)>500:
            raise ValueError('stimulus out of range')
        n=math.ceil(duration_ms/dt_ms)
        currents=[current_pA if .15*n <= i < .70*n else 0.0
                  for i in range(n)]
        measured=None
    if (not isinstance(dt_ms,(float,int)) or not math.isfinite(dt_ms)
        or not .01<=dt_ms<=.1 or len(currents)>20000):
        raise ValueError('unsupported integration step')
    return {'dt_ms': float(dt_ms), 'current_pA': currents,
            'measured_mV': measured}


def passive_geometry_parameters(features, area_um2):
    if not math.isfinite(area_um2) or not 10<=area_um2<=1e9:
        raise ValueError('invalid reconstructed membrane area')
    data=features['features']
    leak_total_nS=1000.0/data['input_resistance_MOhm']
    cap_total_pF=leak_total_nS*data['membrane_tau_ms']
    area_cm2=area_um2*1e-8
    g_pas_S_cm2=leak_total_nS*1e-9/area_cm2
    cm_uF_cm2=cap_total_pF*1e-6/area_cm2
    if not all(math.isfinite(x) and x>0 for x in (g_pas_S_cm2,cm_uF_cm2)):
        raise ValueError('invalid membrane parameter conversion')
    return {
        'g_pas_S_cm2':g_pas_S_cm2,'cm_uF_cm2':cm_uF_cm2,
        'leak_total_nS':leak_total_nS,'cap_total_pF':cap_total_pF,
        'surface_um2':area_um2,
        'fit_assumption':'global isopotential RC redistributed uniformly over SWC cable',
    }


def run_reconstructed_passive_cell(swc_path, feature_record, stimulus, *,
                                  ra_ohm_cm=120, temperature_c=34):
    """NEURON performs true compartmental cable calculations.

    Ra and temperature are unmeasured illustrative research settings.
    f-I curves, spikes and active channel currents cannot be inferred here.
    """
    from neuron import h
    swc=Path(swc_path)
    if not swc.is_file() or swc.stat().st_size>15_000_000:
        raise ValueError('SWC file missing or too large')
    if not 20<=temperature_c<=38 or not 20<=ra_ohm_cm<=400:
        raise ValueError('unmeasured research settings out of bounds')
    h.load_file('stdrun.hoc')
    h.load_file('import3d.hoc')
    reader=h.Import3d_SWC_read()
    reader.input(str(swc.resolve()))
    importer=h.Import3d_GUI(reader, 0)

    class MorphologicalCell:
        pass
    cell=MorphologicalCell()
    importer.instantiate(cell)
    sections=list(h.allsec())
    somas=[sec for sec in sections if 'soma' in sec.name().lower()]
    if not sections or not somas:
        raise ValueError('SWC lacks reconstructable sections or soma')
    if len(sections)>15000:
        raise ValueError('morphology exceeds compartment budget')
    for sec in sections:
        if not 0<sec.L<=1e6 or not 0<sec.diam<=2000:
            raise ValueError('invalid imported SWC geometry')
        n=max(1,min(201,int(math.ceil(sec.L/20))))
        sec.nseg=n if n%2 else n+1
    h.define_shape()
    area=sum(h.area(seg.x,sec=sec) for sec in sections for seg in sec)
    params=passive_geometry_parameters(feature_record,area)
    for sec in sections:
        sec.Ra=ra_ohm_cm
        sec.cm=params['cm_uF_cm2']
        sec.insert('pas')
        for seg in sec:
            seg.pas.g=params['g_pas_S_cm2']
            seg.pas.e=feature_record['features']['vrest_mV']

    soma=somas[0]
    electrode=h.IClamp(soma(.5))
    electrode.delay=0
    electrode.dur=len(stimulus['current_pA'])*stimulus['dt_ms']+1
    h.celsius=temperature_c
    h.cvode_active(0)
    h.dt=stimulus['dt_ms']
    h.steps_per_ms=1/h.dt
    initial=stimulus['measured_mV'][0] if stimulus['measured_mV'] else         feature_record['features']['vrest_mV']
    h.finitialize(initial)
    voltage=[]
    for sample in stimulus['current_pA']:
        electrode.amp=sample/1000.0  # pA -> nA
        h.fadvance()
        voltage.append(float(soma(.5).v))
    measured=stimulus['measured_mV']
    quality=None
    if measured is not None:
        if not all(-150<=v<=100 for v in measured):
            raise ValueError('held-out voltages not physiological')
        residual=[p-y for p,y in zip(voltage,measured)]
        quality={
            'rmse_mV':math.sqrt(sum(d*d for d in residual)/len(residual)),
            'mae_mV':sum(abs(d) for d in residual)/len(residual),
            'heldout_source_authenticity_verified':False,
            'scientifically_certified':False,
        }
    return {
        'kind':'allen-human-morphology-passive-multicompartment-neuron',
        'specimen_id':feature_record['specimen_id'],
        'source_swc_sha256':hashlib.sha256(swc.read_bytes()).hexdigest(),
        'source_metadata_verified_externally':False,
        'cellular_model':'NEURON-9-compatible-passive-cable',
        'region_and_cell_class_not_proven':True,
        'n_sections':len(sections),
        'n_segments':sum(sec.nseg for sec in sections),
        'parameters':params,
        'unmeasured_parameters':{
            'axial_resistivity_ohm_cm':ra_ohm_cm,
            'temperature_C':temperature_c,
        },
        'current_source':'recorded-heldout' if measured is not None
            else 'synthetic-rectangular-stimulus',
        'dt_ms':stimulus['dt_ms'], 'voltage_mV':voltage,
        'quality':quality,
        'synaptic_and_active_ion_channels_calibrated':False,
        'human_whole_brain_reproduced':False,
        'llm_used':False, 'production_state_changed':False,
    }


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--swc',type=Path,required=True)
    parser.add_argument('--human-features',type=Path,required=True)
    parser.add_argument('--heldout',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--duration-ms',type=float,default=250)
    parser.add_argument('--current-pa',type=float,default=35)
    args=parser.parse_args()
    features=read_human_features(args.human_features)
    stimulus=load_stimulus(args.heldout,duration_ms=args.duration_ms,
                           current_pA=args.current_pa)
    if args.heldout:
        data=json.loads(args.heldout.read_text(encoding='utf-8'))
        if data.get('specimen_id')!=features['specimen_id']:
            raise ValueError('held-out voltage data belongs to a different human cell')
    result=run_reconstructed_passive_cell(args.swc,features,stimulus)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print('NEURON passive morphology calculation completed. Not a validated human active neuron.')
    print('Result:',args.output)


if __name__=='__main__':
    main()
