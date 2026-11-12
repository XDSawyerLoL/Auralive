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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--specimen-id', type=int, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--manifest', type=Path,
                        default=Path('.allen-cell-types-cache/manifest.json'))
    args = parser.parse_args()
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


if __name__ == '__main__':
    main()
