#!/usr/bin/env python3
"""Select a deterministic multi-specimen human Allen electrophysiology cohort.

No model parameters may be selected from these cells; these constitute
external-specimen tests of parameters already selected on 643582610.
Uses SWC availability, legitimate resting-membrane features and CURRENT
stimulus metadata only. Never uses measured voltage or spike count for
selection. Different specimens do not necessarily mean different donors.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

from fit_human_active_multisweep import select_prespecified_sweeps

SEED = 'aura-human-cross-specimen-v1'
REFERENCE = 643582610


def usable_feature(feature):
    if not isinstance(feature, dict):
        return False
    try:
        r = float(feature['ri'])
        tau = float(feature['tau'])
        v = float(feature['vrest'])
    except (ValueError, TypeError, KeyError):
        return False
    return all(math.isfinite(n) for n in (r, tau, v)) and (
        5 <= r <= 3000 and .1 <= tau <= 500 and -110 <= v <= -35
    )


def candidate_ids(human_reconstructed_cells, features, *, reference=REFERENCE):
    legitimate = {f.get('specimen_id') for f in features if usable_feature(f)}
    available = set()
    for cell in human_reconstructed_cells:
        specimen = cell.get('id')
        if (isinstance(specimen, int) and not isinstance(specimen, bool)
            and specimen >= 1000 and specimen != reference
            and str(cell.get('species', 'Homo sapiens')).lower()
                in ('human', 'homo sapiens')
            and specimen in legitimate):
            available.add(specimen)
    # Hash-based reproducible spread, no response-derived ranking.
    return sorted(available, key=lambda n:
        (hashlib.sha256((SEED + ':' + str(n)).encode()).hexdigest(), n))


def select_cohort(human_reconstructed_cells, features, get_sweeps, *,
                  count=2, max_probes=32, reference=REFERENCE):
    if not 1 <= count <= 5 or not 1 <= max_probes <= 100:
        raise ValueError('Cohort budget outside declared limits')
    candidates = candidate_ids(human_reconstructed_cells, features,
                               reference=reference)
    chosen = []
    errors = []
    for sid in candidates[:max_probes]:
        try:
            split = select_prespecified_sweeps(get_sweeps(sid))
        except (ValueError, KeyError, TypeError) as e:
            errors.append({'specimen_id': sid, 'reason': type(e).__name__})
            continue
        chosen.append({'specimen_id': sid,
                       'validation_sweep_number': split['validation_sweep_numbers'][0],
                       'validation_current_pA': split['validation_condition_pA'],
                       'available_current_conditions': split['distinct_current_conditions']})
        if len(chosen) == count:
            break
    if len(chosen) < count:
        raise ValueError('Not enough eligible reconstructed human specimens with '
                         'distinct positive long-square stimuli; no fabricated cohort')
    return {
        'schema': 'aura-allen-human-cohort-v1',
        'selection_seed': SEED,
        'selection_policy': 'stable SHA256 specimen ranking, required SWC, measured passive features, positive long-square currents; holdout median current',
        'reference_specimen': reference,
        'transfer_test_specimens': chosen,
        'candidate_pool_size': len(candidates),
        'probed': len(chosen) + len(errors),
        'excluded_reasons': errors,
        'selection_used_voltage': False,
        'selection_used_spike_count': False,
        'distinct_specimens': True,
        'distinct_donors_verified': False,
        'source_species': 'Homo sapiens',
        'donor_population_representativeness_established': False,
        'transferred_parameters': {'na': 2.0, 'k': 1.0, 'axon': 1.0},
        'parameter_choice_origin': 'reference-specimen 643582610 training sweeps 26,37',
        'research_only': True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--count', type=int, default=2)
    parser.add_argument('--max-probes', type=int, default=32)
    args = parser.parse_args()
    from allensdk.core.cell_types_cache import CellTypesCache
    from allensdk.api.queries.cell_types_api import CellTypesApi
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    cache = CellTypesCache(manifest_file=str(args.manifest))
    cells = cache.get_cells(species=[CellTypesApi.HUMAN],
                            require_reconstruction=True)
    features = cache.get_ephys_features()
    report = select_cohort(cells, features, cache.get_ephys_sweeps,
                           count=args.count, max_probes=args.max_probes)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n',
                           encoding='utf-8')
    print(json.dumps({'human_specimens': [s['specimen_id']
          for s in report['transfer_test_specimens']],
          'probed': report['probed'], 'selection_no_voltage': True}))


if __name__ == '__main__':
    main()
