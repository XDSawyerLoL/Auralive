#!/usr/bin/env python3
"""External-human-specimen test of frozen AURA effective Na/K kinetics.

The selected channel parameters come from reference specimen 643582610
ONLY, fitted before any target NWB voltage/spikes were read. Target cells
contribute SWC + their measured passive vrest/ri/tau as an explicitly
declared adaptation. No target active-channel calibration, LLM, or AURA
production mutation. Mechanisms are original, not Allen's noncommercial MOD.
"""
import argparse
import json
import math
from pathlib import Path

from export_allen_human_features import build_record, select_heldout_trace, file_sha256
from fit_human_kinetics_v2 import (
    OriginalGatingCell, SCHEMA, SOURCE, validate_candidate,
)


def validate_frozen_reference(fit, cohort, specimen, sweep):
    if fit.get('schema') != SCHEMA or fit.get('reference_specimen') != 643582610:
        raise ValueError('No legitimate frozen reference calibration')
    if fit.get('locked_holdout_used_for_selection') is not False:
        raise ValueError('Reference fit reused reserved test')
    candidate=fit.get('winner')
    validate_candidate(candidate)
    if specimen==fit['reference_specimen']:
        raise ValueError('Cannot call reference specimen an external test')
    rows=cohort.get('transfer_test_specimens')
    if not isinstance(rows,list) or len(rows)<2:
        raise ValueError('Preselected external human cohort missing')
    approved=[row for row in rows if row.get('specimen_id')==specimen
              and row.get('challenge_sweep_number')==sweep]
    if len(approved)!=1:
        raise ValueError('Only prespecified high-current target sweep can be evaluated')
    if cohort.get('selection_used_spike_count') is not False or cohort.get('selection_used_voltage') is not False:
        raise ValueError('External cohort selection used labels')
    return candidate


def prepare_external_result(fit, cohort, specimen, sweep, metrics, swc_sha, nwb_sha):
    candidate=validate_frozen_reference(fit,cohort,specimen,sweep)
    if metrics.get('model_origin')!=SOURCE:
        raise ValueError('Unexpected channel kinetics')
    required=['rmse_mV','mae_mV','observed_spikes','predicted_spikes']
    for name in required[:2]:
        if isinstance(metrics.get(name),bool) or not isinstance(metrics.get(name),(int,float)) or not math.isfinite(metrics[name]):
            raise ValueError('Nonfinite measured-predicted validation score')
    if not all(isinstance(metrics.get(k),int) and metrics[k]>=0 for k in required[2:]):
        raise ValueError('Invalid spike count')
    return {
        'schema':'aura-human-effective-gating-cross-cell-v1',
        'reference_specimen':fit['reference_specimen'],
        'external_specimen':specimen,
        'external_sweep':sweep,
        'external_current_pA':next(row['challenge_current_pA']
                 for row in cohort['transfer_test_specimens']
                 if row['specimen_id']==specimen),
        'external_cell_swcid_sha256':swc_sha,
        'external_nwb_sha256':nwb_sha,
        'transferred_active_parameters':dict(candidate),
        'observed_spikes':metrics['observed_spikes'],
        'predicted_spikes':metrics['predicted_spikes'],
        'rmse_mV':metrics['rmse_mV'],
        'mae_mV':metrics['mae_mV'],
        'molecular_kinetics_identified':False,
        'kinetics_model_origin':SOURCE,
        'target_passive_features_used':True,
        'target_active_data_used_for_fit':False,
        'target_spikes_used_for_selection':False,
        'two_distinct_donors_verified':False,
        'model_biological_fidelity_validated':False,
        'human_brain_emulated':False,
        'no_llm':True,
        'no_production_mutation':True,
    }


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference-fit',type=Path,required=True)
    parser.add_argument('--cohort',type=Path,required=True)
    parser.add_argument('--specimen-id',type=int,required=True)
    parser.add_argument('--sweep-number',type=int,required=True)
    parser.add_argument('--manifest',type=Path,required=True)
    parser.add_argument('--mechanism-library',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    fit=json.loads(args.reference_fit.read_text())
    cohort=json.loads(args.cohort.read_text())
    params=validate_frozen_reference(fit,cohort,args.specimen_id,args.sweep_number)
    from allensdk.core.cell_types_cache import CellTypesCache
    from allensdk.api.queries.cell_types_api import CellTypesApi
    args.manifest.parent.mkdir(parents=True,exist_ok=True)
    cache=CellTypesCache(manifest_file=str(args.manifest))
    humans=cache.get_cells(species=[CellTypesApi.HUMAN],require_reconstruction=True)
    features=build_record(args.specimen_id,humans,cache.get_ephys_features())
    swc=args.manifest.parent/f'cell_{args.specimen_id}.swc'
    cache.get_reconstruction(args.specimen_id,file_name=str(swc))
    nwbf=args.manifest.parent/f'cell_{args.specimen_id}.nwb'
    dataset=cache.get_ephys_data(args.specimen_id,file_name=str(nwbf))
    trace=select_heldout_trace(dataset,specimen_id=args.specimen_id,
                                sweep_number=args.sweep_number,max_samples=10000)
    model=OriginalGatingCell(swc,features,args.mechanism_library)
    metrics=model.simulate(trace,params)
    result=prepare_external_result(fit,cohort,args.specimen_id,args.sweep_number,
                                   metrics,file_sha256(swc),file_sha256(nwbf))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'specimen':result['external_specimen'],
      'observed_spikes':result['observed_spikes'],
      'predicted_spikes':result['predicted_spikes'],
      'rmse_mV':result['rmse_mV'],
      'fitted_on_target':False}))


if __name__=='__main__':main()
