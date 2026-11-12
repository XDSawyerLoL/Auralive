#!/usr/bin/env python3
"""Quantify *observed* action potentials in public human NWB sweeps.

This analyses measured voltage only; does NOT generate human spikes and does
not validate an active conductance model. Refractory threshold crossings are
an operational detection rule, not verified intracellular spike annotation.
Requires a trace exported by export_allen_human_features.py.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path


def finite_number(v):
    return isinstance(v,(float,int)) and not isinstance(v,bool) and math.isfinite(v)


def spike_report(record, threshold_mV=-20, refractory_ms=2):
    if record.get('source',{}).get('origin')!='Allen Cell Types Database':
        raise ValueError('Allen NWB source label required')
    if record.get('specimen_id') is None or not isinstance(record.get('sweep_number'),int):
        raise ValueError('specimen and sweep numbers required')
    dt=record.get('dt_ms')
    if not finite_number(dt) or not .01<=dt<=.1:
        raise ValueError('unsupported source sample period')
    voltage=record.get('voltage_mV')
    current=record.get('stimulus_current_pA')
    if (not isinstance(voltage,list) or not isinstance(current,list)
        or len(voltage)!=len(current) or not 20<=len(voltage)<=50000):
        raise ValueError('measured voltage and current must be aligned')
    if not all(finite_number(x) for x in voltage+current):
        raise ValueError('nonfinite voltage/current')
    if not all(-150<=x<=100 for x in voltage):
        raise ValueError('voltage outside patch-clamp analysis bounds')
    if not all(-100000<=x<=100000 for x in current):
        raise ValueError('current outside analysis bounds')
    if not -55<=threshold_mV<=15:
        raise ValueError('threshold outside lab bounds')
    last_idx=-10**9
    refractory=int(math.ceil(refractory_ms/dt))
    indices=[]
    for i in range(1,len(voltage)):
        if voltage[i-1]<threshold_mV<=voltage[i] and i-last_idx>=refractory:
            # Local peak within the next 2 ms. Never invent spike morphology.
            peak=max(voltage[i:min(len(voltage),i+max(1,int(2/dt)))])
            if peak<0:
                continue
            indices.append(i)
            last_idx=i
    isi=[(b-a)*dt for a,b in zip(indices,indices[1:])]
    times=[round(i*dt,5) for i in indices]
    stimulus_present=sum(abs(x)>1 for x in current)/len(current)
    max_slope=max((voltage[i]-voltage[i-1])/dt for i in range(1,len(voltage)))
    base={
        'kind':'observed-human-NWB-threshold-events',
        'specimen_id':record['specimen_id'],'sweep_number':record['sweep_number'],
        'samples':len(voltage),'sampling_interval_ms':dt,
        'threshold_mV':threshold_mV,'refractory_ms':refractory_ms,
        'spike_count':len(indices),'event_times_ms':times[:1000],
        'peak_voltage_mV':max(voltage),
        'min_voltage_mV':min(voltage),
        'peak_dvdt_mV_per_ms':round(max_slope,3),
        'injected_current_min_pA':min(current),'injected_current_max_pA':max(current),
        'fraction_stimulus_abs_gt_1pA':round(stimulus_present,5),
        'mean_interspike_interval_ms':round(sum(isi)/len(isi),4) if isi else None,
        'source_recording_sha256':record.get('source',{}).get('nwb_sha256'),
        'source_claim_verified_independently':False,
        'threshold_algorithm':'upward crossing with >=0mV local peak, 2ms refractory',
        'model_active_channels_calibrated':False,
        'synaptic_connectome_validated':False,
        'consciousness_inferred':False,
    }
    return base


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--trace',type=Path,required=True)
    parser.add_argument('--report',type=Path,required=True)
    args=parser.parse_args()
    source_bytes=args.trace.read_bytes()
    trace=json.loads(source_bytes)
    report=spike_report(trace)
    report['exported_trace_sha256']=hashlib.sha256(source_bytes).hexdigest()
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'spikes_observed':report['spike_count'],
      'peak_mV':report['peak_voltage_mV'],
      'sample_count':report['samples'],
      'source':'measured-public-NWB-not-simulated'},ensure_ascii=False))


if __name__=='__main__':main()
