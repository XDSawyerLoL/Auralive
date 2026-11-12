#!/usr/bin/env python3
"""Test the FIXED AURA human active-reference parameters on a NEW human cell.

Transfers the active Na/K/axon-proxy multipliers selected using reference
specimen 643582610 only. Target-cell passive vrest/ri/tau and morphology are
measured, NOT transferred. The target's NWB trace is evaluated exactly once,
not optimized, to test whether these active multipliers generalize.

Caution: NEURON built-in HH kinetics originate from squid, not calibrated
human ion channels. Individual Allen specimens may share donor provenance.
No production AURA mutation; no LLM; no raw human voltage in summary.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

from run_human_swc_neuron import read_human_features
from export_allen_human_features import build_record, select_heldout_trace, file_sha256
from fit_human_active_multisweep import ReusableNeuronModel
from analyze_human_spiking_nwb import spike_report

PARAMETERS = {'na': 2.0, 'k': 1.0, 'axon': 1.0}
REFERENCE_SPECIMEN = 643582610


def validate_target(specimen, sweep, cohort):
    if specimen == REFERENCE_SPECIMEN:
        raise ValueError('Cannot reuse reference specimen in transfer cohort')
    rows = cohort.get('transfer_test_specimens') or []
    eligible = [row for row in rows
                if row.get('specimen_id') == specimen
                and row.get('validation_sweep_number') == sweep]
    if len(eligible) != 1:
        raise ValueError('Specimen/sweep must appear exactly once in prespecified cohort')
    if cohort.get('selected_using_spike_counts') or cohort.get('selection_used_voltage'):
        raise ValueError('Cohort selection contains electrophysiological leakage')
    if cohort.get('transferred_parameters') != PARAMETERS:
        raise ValueError('Transferred active parameters must be frozen')
    return eligible[0]


def summarise_transfer(specimen, sweep, candidate, simulated, observed,
                       morphology_sha256, nwb_sha256):
    if observed.get('specimen_id') != specimen or observed.get('sweep_number') != sweep:
        raise ValueError('Cross-specimen contamination')
    if simulated.get('model_origin') != 'historic-squid-HH-kinetics-on-human-SWC':
        raise ValueError('Unexpected ionic-channel source')
    if any(not math.isfinite(simulated[k]) for k in ('rmse_mV', 'mae_mV')):
        raise ValueError('Numerically invalid transfer result')
    return {
        'schema': 'aura-hh-active-cross-specimen-transfer-v1',
        'reference_specimen': REFERENCE_SPECIMEN,
        'target_specimen': specimen,
        'target_sweep': sweep,
        'target_source_species': 'Homo sapiens',
        'target_recording_sha256': nwb_sha256,
        'target_reconstruction_sha256': morphology_sha256,
        'frozen_reference_parameters': dict(candidate),
        'target_observed_spikes': observed['spike_count'],
        'target_simulated_spikes': simulated['predicted_spikes'],
        'spike_count_error': simulated['spike_count_error'],
        'rmse_mV': simulated['rmse_mV'],
        'mae_mV': simulated['mae_mV'],
        'model': 'historical squid HH gating with human morphology and target passive features',
        'target_sweep_used_for_optimization': False,
        'true_human_ion_channels_validated': False,
        'independent_donors_verified': False,
        'human_brain_reproduced': False,
        'no_llm': True,
        'no_production_write': True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cohort', type=Path, required=True)
    parser.add_argument('--specimen-id', type=int, required=True)
    parser.add_argument('--sweep-number', type=int, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    cohort = json.loads(args.cohort.read_text())
    validate_target(args.specimen_id, args.sweep_number, cohort)

    from allensdk.core.cell_types_cache import CellTypesCache
    from allensdk.api.queries.cell_types_api import CellTypesApi
    cache = CellTypesCache(manifest_file=str(args.manifest))
    humans = cache.get_cells(species=[CellTypesApi.HUMAN], require_reconstruction=True)
    ephys = cache.get_ephys_features()
    record = build_record(args.specimen_id, humans, ephys)
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    swc = args.manifest.parent / f'human_{args.specimen_id}.swc'
    cache.get_reconstruction(args.specimen_id, file_name=str(swc))
    if swc.stat().st_size > 15_000_000 or swc.stat().st_size < 100:
        raise ValueError('Invalid Allen human morphological reconstruction')
    nwb = args.manifest.parent / f'human_{args.specimen_id}.nwb'
    dataset = cache.get_ephys_data(args.specimen_id, file_name=str(nwb))
    measured = select_heldout_trace(dataset, specimen_id=args.specimen_id,
                                    sweep_number=args.sweep_number, max_samples=10000)
    measured['source']['nwb_sha256'] = file_sha256(nwb)
    observed = spike_report(measured)
    model = ReusableNeuronModel(swc, record)
    result = model.simulate(measured, PARAMETERS)
    report = summarise_transfer(args.specimen_id, args.sweep_number, PARAMETERS,
                                result, observed, file_sha256(swc), file_sha256(nwb))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({
        'specimen_id': report['target_specimen'],
        'real_spikes': report['target_observed_spikes'],
        'simulated_spikes': report['target_simulated_spikes'],
        'rmse_mV': report['rmse_mV'],
        'model_human_validated': False,
    }))


if __name__ == '__main__':
    main()
