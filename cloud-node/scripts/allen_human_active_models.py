#!/usr/bin/env python3
"""Safely select downloadable Allen fitted neuronal models for a verified HUMAN specimen.

This tool downloads *data and model source*, never compiles or executes NMODL
automatically. Running native cell mechanisms requires a separate research
environment and review of downloaded code. No Hostinger production access.
Requires optional AllenSDK: pip install allensdk.
"""
import argparse
import hashlib
import json
from pathlib import Path

ALLEN_API = 'AllenSDK.BiophysicalApi.get_neuronal_models'
ALLOWED_BIOPHYSICAL_TEMPLATES = frozenset((491455321, 329230710))


def model_records(specimen_id, human_cells, models):
    if not isinstance(specimen_id, int) or isinstance(specimen_id, bool) or specimen_id < 1000:
        raise ValueError('valid specimen id required')
    matches = [c for c in human_cells if c.get('id') == specimen_id]
    if len(matches) != 1 or str(matches[0].get('species', '')).lower() not in ('homo sapiens', 'human'):
        raise ValueError('specimen not independently matched to Allen HUMAN cell list')
    if not isinstance(models, list):
        raise TypeError('model list required')
    results = []
    for item in models:
        if not isinstance(item, dict):
            raise TypeError('invalid neuronal model record')
        model_id = item.get('id')
        sample_id = item.get('specimen_id')
        template_id = item.get('neuronal_model_template_id')
        if template_id not in ALLOWED_BIOPHYSICAL_TEMPLATES:
            continue
        if not isinstance(model_id, int) or isinstance(model_id, bool) or model_id < 1000:
            raise ValueError('invalid Allen neuronal model ID')
        if sample_id != specimen_id:
            # No model is ever silently reassigned to a different donor cell.
            raise ValueError('neuronal model specimen differs from authenticated human cell')
        results.append({'model_id': model_id, 'specimen_id': specimen_id,
                        'neuronal_model_type_id': item.get('neuronal_model_template_id'),
                        'data_origin': 'Allen Cell Types Database'})
    return sorted(results, key=lambda row: row['model_id'])


def download_human_model(specimen_id, model_id, out_dir, cells, models, api):
    options = model_records(specimen_id, cells, models)
    if not any(row['model_id'] == model_id for row in options):
        raise ValueError('requested neuronal model not associated with verified human specimen')
    out_dir = Path(out_dir)
    if out_dir.exists() and any(out_dir.iterdir()):
        raise FileExistsError('target must be empty; no overwriting downloaded model files')
    out_dir.mkdir(parents=True, exist_ok=True)
    # AllenSDK retrieves manifest, parameter fit, morphology, mechanisms.
    # Do not compile or run downloaded .mod code here.
    # Official NEURON runner needs its original stimulus NWB file.
    # This happens ONLY in an explicitly executed offline research command.
    api.cache_stimulus = True
    api.cache_data(model_id, working_directory=str(out_dir.resolve()))
    files = []
    for item in out_dir.rglob('*'):
        if not item.is_file():
            continue
        if item.is_symlink() or item.stat().st_size > 250_000_000:
            raise ValueError('unsafe downloaded model file')
        relative = item.relative_to(out_dir).as_posix()
        if '..' in relative.split('/'):
            raise ValueError('unsafe path in downloaded model')
        files.append({'path': relative,
                      'bytes': item.stat().st_size,
                      'sha256': hashlib.sha256(item.read_bytes()).hexdigest()})
    if not files:
        raise RuntimeError('Allen model archive empty')
    manifest = {
        'research_bundle_version': 1, 'species': 'Homo sapiens',
        'specimen_id': specimen_id, 'neuronal_model_id': model_id,
        'source_api': ALLEN_API, 'native_mechanisms_not_executed': True,
        'human_parameter_fit_independently_validated': False,
        'amygdala_region_validated': False,
        'files': sorted(files, key=lambda entry: entry['path']),
    }
    (out_dir / 'aura-model-provenance.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--specimen-id', type=int, required=True)
    parser.add_argument('--model-id', type=int)
    parser.add_argument('--out-dir', type=Path, default=Path('research-output/allen-fitted-model'))
    args = parser.parse_args()
    try:
        from allensdk.core.cell_types_cache import CellTypesCache
        from allensdk.api.queries.cell_types_api import CellTypesApi
        from allensdk.api.queries.biophysical_api import BiophysicalApi
    except ImportError as exc:
        raise SystemExit('AllenSDK required in offline research environment') from exc
    cache = CellTypesCache(manifest_file=str(args.out_dir.parent / 'allen-cache-manifest.json'))
    human = cache.get_cells(species=[CellTypesApi.HUMAN])
    api = BiophysicalApi()
    models = api.get_neuronal_models(specimen_ids=[args.specimen_id])
    selected = model_records(args.specimen_id, human, models)
    if args.model_id is None:
        print(json.dumps({'specimen_id': args.specimen_id, 'available_models': selected}, indent=2))
        return
    manifest = download_human_model(args.specimen_id, args.model_id,
                                    args.out_dir, human, models, api)
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
