#!/usr/bin/env python3
"""Export only verified human electrophysiology features from AllenSDK.

Optional research-only dependency: pip install allensdk
No calls to AURA's production state, no protected donor data, no API key.
Example:
  python scripts/export_allen_human_features.py --specimen-id 643625553 --output /tmp/allen-human-643625553.json

Values are taken from the Allen EphysFeature table. No defaults, templates,
or synthetic features can be substituted for absent measurements.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

ALLEN_URL = 'https://celltypes.brain-map.org/data?donor__species=Homo+Sapiens'


def checked_float(feature, name):
    value = feature.get(name)
    if isinstance(value, bool) or not isinstance(value, (float, int)):
        raise ValueError(f'Allen electrophysiology feature {name} unavailable')
    value = float(value)
    if not math.isfinite(value):
        raise ValueError(f'Allen electrophysiology feature {name} non-finite')
    return value


def build_record(specimen_id, cells, features, software='AllenSDK.CellTypesCache'):
    """Strict species cross-check, source trace and no inferred measurements."""
    matched = [cell for cell in cells if int(cell.get('id', -1)) == specimen_id]
    if len(matched) != 1:
        raise ValueError('Specimen ID not found uniquely among HUMAN cells')
    cell = matched[0]
    # This function receives a list already filtered using
    # species=[CellTypesApi.HUMAN] and checks metadata when available.
    species = cell.get('species')
    if species is not None and str(species).strip().lower() not in (
            'homo sapiens', 'human'):
        raise ValueError('Allen metadata does not identify Homo sapiens')
    ephys = [entry for entry in features
             if int(entry.get('specimen_id', -1)) == specimen_id]
    if len(ephys) != 1:
        raise ValueError('Specimen has missing or conflicting ephys features')
    data = ephys[0]
    rest = checked_float(data, 'vrest')
    resistance = checked_float(data, 'ri')
    tau = checked_float(data, 'tau')
    if not (-110 <= rest <= -35 and 5 <= resistance <= 3000
            and 0.1 <= tau <= 500):
        raise ValueError('Measured features fall outside laboratory bounds')
    return {
        'schema_version': 'aura-allen-cell-types-human-ephys-v1',
        'species': 'Homo sapiens',
        'specimen_id': specimen_id,
        'features': {
            'vrest_mV': rest,
            'input_resistance_MOhm': resistance,
            'membrane_tau_ms': tau,
        },
        'source': {
            'dataset': 'Allen Cell Types Database',
            'method': 'AllenSDK.CellTypesCache.get_ephys_features',
            'human_specimen_verified': True,
            'url': ALLEN_URL,
            'feature_units': {'vrest': 'mV', 'ri': 'MOhm', 'tau': 'ms'},
            'extraction_software': software,
            'origin_feature_columns': ['vrest', 'ri', 'tau'],
            'species_filter': 'CellTypesApi.HUMAN',
        },
    }


def file_sha256(path):
    digest=hashlib.sha256()
    with Path(path).open('rb') as stream:
        while chunk:=stream.read(1024*1024):
            digest.update(chunk)
    return digest.hexdigest()


def select_heldout_trace(dataset, *, specimen_id, sweep_number,
                         max_samples=10000, target_dt_ms=.05):
    """Extract a public NWB trace in SI units without fabricated values.

    Features vrest/ri/tau may have been estimated using the very same NWB
    experiment. 'Not used directly for fitting' is not proof of independent
    hold-out. Explicitly expose that uncertainty to the research consumer.
    """
    if not isinstance(sweep_number, int) or sweep_number<0:
        raise ValueError('explicit sweep number required')
    wave=dataset.get_sweep(sweep_number)
    rate=wave.get('sampling_rate')
    if not isinstance(rate,(int,float)) or not math.isfinite(rate) or rate<=0:
        raise ValueError('NWB sampling frequency missing')
    samples=wave.get('response')
    stimulus=wave.get('stimulus')
    if samples is None or stimulus is None or len(samples)!=len(stimulus):
        raise ValueError('NWB stimulus/response mismatch')
    range_values=wave.get('index_range')
    if not range_values or len(range_values)!=2:
        raise ValueError('NWB experiment index range absent')
    start=max(0,int(range_values[0]))
    stop=min(len(samples),int(range_values[1])+1)
    if stop<=start:
        raise ValueError('NWB experiment has no usable samples')
    factor=max(1,round(target_dt_ms*rate/1000))
    dt_ms=1000*factor/rate
    if not .01<=dt_ms<=.1:
        raise ValueError('NWB sampling rate outside NEURON protocol limits')
    last=min(stop,start+factor*max_samples)
    voltage=[];current=[]
    for i in range(start,last,factor):
        j=min(i+factor,last)
        volts=[float(x) for x in samples[i:j]]
        amps=[float(x) for x in stimulus[i:j]]
        if not all(math.isfinite(x) for x in volts+amps):
            raise ValueError('NWB has NaN/Inf samples')
        voltage.append(sum(volts)/len(volts)*1e3) # V to mV
        current.append(sum(amps)/len(amps)*1e12) # A to pA
    if len(voltage)<5:
        raise ValueError('NWB sweep has too few samples')
    return {
        'specimen_id':specimen_id,'sweep_number':sweep_number,
        'used_for_fit':False,
        'independence_verified':False,
        'source':{
            'origin':'Allen Cell Types Database',
            'api':'AllenSDK.CellTypesCache.get_ephys_data',
            'original_units':{'stimulus':'A','response':'V','rate':'Hz'},
            'data_extraction':'averaged-nwb-samples',
            'sample_factor':factor,
            'nwb_sampling_rate_hz':rate,
            'absolute_source_authentication_by_receiver':False,
        },
        'stimulus_current_pA':current,
        'voltage_mV':voltage,
        'dt_ms':dt_ms,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--specimen-id', type=int, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--manifest', type=Path,
                        default=Path('.allen-cell-types-cache/manifest.json'))
    parser.add_argument('--reconstruction-output',type=Path,
                        help='Optional human SWC reconstruction; unavailable cells fail closed')
    parser.add_argument('--heldout-output',type=Path,
                        help='Optional NWB voltage/current trace output (large download)')
    parser.add_argument('--sweep-number',type=int,
                        help='Required with --heldout-output')
    args = parser.parse_args()
    if bool(args.heldout_output) != (args.sweep_number is not None):
        parser.error('--heldout-output and --sweep-number must be provided together')
    if args.specimen_id < 1000:
        parser.error('Invalid Allen specimen identifier')
    try:
        from allensdk.core.cell_types_cache import CellTypesCache
        from allensdk.api.queries.cell_types_api import CellTypesApi
    except ImportError as exc:
        raise SystemExit('Install optional AllenSDK separately: pip install allensdk') from exc
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    cache = CellTypesCache(manifest_file=str(args.manifest))
    cells = cache.get_cells(species=[CellTypesApi.HUMAN])
    features = cache.get_ephys_features()
    record = build_record(args.specimen_id, cells, features)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n',
                           encoding='utf-8')
    print(f"Verified human specimen {args.specimen_id}: {args.output}")
    if args.reconstruction_output:
        if not any(int(c.get('id',-1))==args.specimen_id and
                   c.get('has_reconstruction') is True for c in cells):
            # AllenSDK field may differ by version; get_reconstruction itself
            # also fails if a reconstruction is not actually available.
            print('Human specimen reconstruction metadata not explicitly flagged; verifying via AllenSDK')
        args.reconstruction_output.parent.mkdir(parents=True,exist_ok=True)
        cache.get_reconstruction(args.specimen_id,
                                 file_name=str(args.reconstruction_output))
        raw=args.reconstruction_output.read_text(encoding='utf-8')
        if not raw.strip() or args.reconstruction_output.stat().st_size>25_000_000:
            raise ValueError('Allen SWC missing or exceeds research limit')
        print('Human SWC downloaded: SHA-256',file_sha256(args.reconstruction_output))
    if args.heldout_output:
        sweeps=cache.get_ephys_sweeps(args.specimen_id)
        if not any(int(s.get('sweep_number',-1))==args.sweep_number for s in sweeps):
            raise ValueError('Sweep is not associated with human specimen')
        nwb_path=args.manifest.parent/('specimen_'+str(args.specimen_id))/'ephys.nwb'
        nwb_path.parent.mkdir(parents=True,exist_ok=True)
        data=cache.get_ephys_data(args.specimen_id,file_name=str(nwb_path))
        heldout=select_heldout_trace(data,specimen_id=args.specimen_id,
                                     sweep_number=args.sweep_number)
        heldout['source']['nwb_sha256']=file_sha256(nwb_path)
        args.heldout_output.parent.mkdir(parents=True,exist_ok=True)
        args.heldout_output.write_text(
            json.dumps(heldout,ensure_ascii=False,indent=2)+'\\n',
            encoding='utf-8')
        print('Human NWB trace downloaded: ',args.heldout_output)
        print('Independence from Allen precomputed features NOT verified.')


if __name__ == '__main__':
    main()
