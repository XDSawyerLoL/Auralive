#!/usr/bin/env python3
"""Download an EXISTING human-specimen Allen active cell model, if available.

An Allen single-cell *active* biophysical model can contain NEURON channel
mechanisms and anatomical morphology. It is not a brain-region model.
Nothing is invented when an authenticated HUMAN specimen lacks such a model.

Requires optional offline research tools: pip install allensdk
Running the downloaded model later also needs NEURON, a matching environment
and model-specific compiled MOD mechanisms. Do not execute model files
downloaded from an untrusted source. This script never runs MOD code.
"""
import argparse
import hashlib
import json
from pathlib import Path

ALLOWED_MODEL_TEMPLATE_IDS = frozenset((491455321, 329230710))


def checked_human_models(specimen_id, cells, models):
    """Pure classifier that must run BEFORE any model download."""
    if not isinstance(specimen_id, int) or specimen_id <= 0:
        raise ValueError('Specimen ID must be a positive integer')
    matches = [c for c in cells if int(c.get('id', -1)) == specimen_id]
    if len(matches) != 1:
        raise ValueError('Specimen absent/duplicate in Allen human-filtered list')
    cell = matches[0]
    if str(cell.get('species', '')).lower() not in ('human', 'homo sapiens'):
        raise ValueError('Allen specimen species is not explicitly human')
    selected = []
    for item in models:
        try:
            model_id = int(item.get('id', -1))
            associated = int(item.get('specimen_id', -1))
            template = int(item.get('neuronal_model_template_id', -1))
        except (TypeError, ValueError):
            continue
        if (model_id > 0 and associated == specimen_id
                and template in ALLOWED_MODEL_TEMPLATE_IDS):
            selected.append({'model_id': model_id,
                             'template_id': template,
                             'specimen_id': associated})
    return sorted(selected, key=lambda x: (x['template_id'], x['model_id']))


def sha256_contents(path):
    digest = hashlib.sha256()
    with path.open('rb') as f:
        while data := f.read(1024 * 1024):
            digest.update(data)
    return digest.hexdigest()


def write_manifest(directory, specimen_id, model_id, model_template_id):
    files = []
    for p in sorted(directory.rglob('*')):
        if p.is_file() and p.name != 'aura_model_provenance.json':
            files.append({
                'path': str(p.relative_to(directory)),
                'bytes': p.stat().st_size,
                'sha256': sha256_contents(p),
            })
    if not files:
        raise ValueError('No real Allen biophysical model files downloaded')
    data = {
        'schema_version': 'aura-allen-human-active-model-package-v1',
        'species': 'Homo sapiens',
        'specimen_id': specimen_id,
        'neuronal_model_id': model_id,
        'neuronal_model_template_id': model_template_id,
        'source': {
            'dataset': 'Allen Cell Types Database',
            'api': 'AllenSDK BiophysicalApi.get_neuronal_models/cache_data',
            'cell_species_filter': 'CellTypesApi.HUMAN',
        },
        'files': files,
        'has_run_in_NEURON': False,
        'is_brain_region_reconstruction': False,
        'validated_on_heldout_experiment': False,
        'human_model_available': True,
    }
    target = directory / 'aura_model_provenance.json'
    target.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n',
                      encoding='utf-8')
    return target


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--specimen-id', type=int, required=True)
    ap.add_argument('--output', type=Path, required=True)
    ap.add_argument('--model-id', type=int,
                    help='Optional exact model id from AllenSDK human specimen')
    ap.add_argument('--cache', type=Path,
                    default=Path('.allen-cell-types-cache/manifest.json'))
    args = ap.parse_args()
    try:
        from allensdk.core.cell_types_cache import CellTypesCache
        from allensdk.api.queries.cell_types_api import CellTypesApi
        from allensdk.api.queries.biophysical_api import BiophysicalApi
    except ImportError as exc:
        raise SystemExit('Optional AllenSDK missing: pip install allensdk') from exc
    args.cache.parent.mkdir(parents=True, exist_ok=True)
    ctc = CellTypesCache(manifest_file=str(args.cache))
    cells = ctc.get_cells(species=[CellTypesApi.HUMAN])
    bp = BiophysicalApi()
    models = bp.get_neuronal_models([args.specimen_id])
    matches = checked_human_models(args.specimen_id, cells, models)
    if args.model_id is not None:
        matches = [m for m in matches if m['model_id'] == args.model_id]
    if not matches:
        raise SystemExit('No independently associated Allen biophysical '
                         'model for this HUMAN specimen; no fallback is fabricated')
    if len(matches) > 1:
        raise SystemExit('Several real models available: use --model-id to '
                         'choose one explicitly: ' +
                         ', '.join(str(m['model_id']) for m in matches))
    selected = matches[0]
    if args.output.exists() and any(args.output.iterdir()):
        raise SystemExit('Output is not empty; refuse to mix research model files')
    args.output.mkdir(parents=True, exist_ok=True)
    bp.cache_stimulus = True
    bp.cache_data(selected['model_id'],
                  working_directory=str(args.output.resolve()))
    manifest = write_manifest(args.output, args.specimen_id,
                              selected['model_id'], selected['template_id'])
    print(str(manifest))


if __name__ == '__main__':
    main()
