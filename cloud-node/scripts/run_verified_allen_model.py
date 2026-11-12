#!/usr/bin/env python3
"""Optional OFFLINE active human cell model run via official AllenSDK + NEURON.

Do not run in Hostinger, CI, or production AURA. Run only on a trusted
research workstation after inspecting Allen model MOD mechanisms.
The source model files must be checksum-verified before compiling any code.

Usage:
  python scripts/run_verified_allen_model.py --model-dir /path/to/model --verify-only
  python scripts/run_verified_allen_model.py --model-dir /path/to/model --run

Requires a verified download from download_allen_human_active_model.py.
The official Allen model runner selects sweeps via manifest.json; this
wrapper does NOT claim biological validation.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

SCHEMA = 'aura-allen-human-active-model-package-v1'


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        while chunk := handle.read(1 << 20):
            digest.update(chunk)
    return digest.hexdigest()


def verify_manifest(model_dir):
    root = Path(model_dir).resolve(strict=True)
    metadata = root / 'aura_model_provenance.json'
    record = json.loads(metadata.read_text(encoding='utf-8'))
    if record.get('schema_version') != SCHEMA or record.get('species') != 'Homo sapiens':
        raise ValueError('Expected Allen HUMAN active model provenance')
    if not record.get('source', {}).get('cell_species_filter') == 'CellTypesApi.HUMAN':
        raise ValueError('Human source filter missing')
    if not isinstance(record.get('specimen_id'), int) or record['specimen_id'] <= 0:
        raise ValueError('Human specimen ID missing')
    files = record.get('files')
    if not isinstance(files, list) or not files or len(files) > 2000:
        raise ValueError('Unbounded or missing Allen files')
    seen = set()
    for item in files:
        if not isinstance(item, dict):
            raise ValueError('Unexpected model manifest entry')
        relative = item.get('path')
        if (not isinstance(relative, str) or relative in seen
                or Path(relative).is_absolute() or '..' in Path(relative).parts):
            raise ValueError('Invalid relative model file path')
        seen.add(relative)
        file = (root / relative).resolve(strict=True)
        if not file.is_relative_to(root) or not file.is_file():
            raise ValueError('File is outside model package')
        if file.stat().st_size != item.get('bytes'):
            raise ValueError('File size does not match Allen model manifest')
        if sha256(file) != item.get('sha256'):
            raise ValueError('SHA-256 mismatch: ' + relative)
    return {'schema_version': SCHEMA,
            'specimen_id': record['specimen_id'],
            'neuronal_model_id': record['neuronal_model_id'],
            'verified_files': len(seen),
            'sha256_verified': True,
            'human_source_label_only': True,
            'human_biological_fidelity_validated': False}


def run_offline(model_dir):
    result = verify_manifest(model_dir)
    root = Path(model_dir).resolve(strict=True)
    if not (root / 'modfiles').is_dir() or not (root / 'manifest.json').is_file():
        raise ValueError('NEURON MOD source and Allen manifest are required')
    if shutil.which('nrnivmodl') is None:
        raise RuntimeError('Install matching NEURON research environment first')
    # Model MOD files contain executable code. This function is NEVER called
    # automatically by any endpoint, workflow or production process.
    subprocess.run(['nrnivmodl', './modfiles'], cwd=root, check=True)
    subprocess.run(['python3', '-m', 'allensdk.model.biophysical.runner',
                    'manifest.json'], cwd=root, check=True)
    return {**result,
            'model_executed': True,
            'heldout_experimental_validation': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-dir', type=Path, required=True)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--verify-only', action='store_true')
    modes.add_argument('--run', action='store_true')
    opts = parser.parse_args()
    result = run_offline(opts.model_dir) if opts.run else verify_manifest(opts.model_dir)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
