"""Offline tests of authentic human model selection; no AllenSDK/network."""
import tempfile
import unittest
from pathlib import Path
from run_verified_allen_model import verify_manifest
from download_allen_human_active_model import (
    ALLOWED_MODEL_TEMPLATE_IDS,
    checked_human_models,
    write_manifest,
)

SID = 643625553
TEMPLATE = sorted(ALLOWED_MODEL_TEMPLATE_IDS)[0]


class ActiveHumanModelTests(unittest.TestCase):
    def test_filter_human_and_associated_model_only(self):
        candidates = [
            {'id': 901, 'specimen_id': SID, 'neuronal_model_template_id': TEMPLATE},
            {'id': 902, 'specimen_id': 143, 'neuronal_model_template_id': TEMPLATE},
            {'id': 903, 'specimen_id': SID, 'neuronal_model_template_id': 0},
        ]
        models = checked_human_models(SID,
                                      [{'id': SID, 'species': 'Homo sapiens'}],
                                      candidates)
        self.assertEqual(models, [{'model_id': 901,
                                   'template_id': TEMPLATE,
                                   'specimen_id': SID}])

    def test_no_model_does_not_synthesize_parameter_set(self):
        self.assertEqual(checked_human_models(
            SID, [{'id': SID, 'species': 'human'}], []), [])

    def test_missing_species_or_mouse_fails_even_if_id_matches(self):
        for species in ('Mus musculus', '', 'unspecified'):
            with self.assertRaises(ValueError):
                checked_human_models(SID,
                                     [{'id': SID, 'species': species}],
                                     [{'id': 901, 'specimen_id': SID,
                                       'neuronal_model_template_id': TEMPLATE}])

    def test_synthetic_file_package_has_sha256_and_no_claim_of_human_brain(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root/'cell.swc').write_text('synthetic test file\n',
                                         encoding='utf-8')
            metadata = write_manifest(root, SID, 901, TEMPLATE)
            import json
            data = json.loads(metadata.read_text(encoding='utf-8'))
            self.assertEqual(data['files'][0]['bytes'], 20)
            self.assertEqual(len(data['files'][0]['sha256']), 64)
            self.assertFalse(data['has_run_in_NEURON'])
            self.assertFalse(data['validated_on_heldout_experiment'])
            self.assertFalse(data['is_brain_region_reconstruction'])
            self.assertEqual(data['species'], 'Homo sapiens')
            self.assertEqual(data['source']['cell_species_filter'],
                             'CellTypesApi.HUMAN')


    def test_checksum_validation_rejects_modified_model_and_path_traversal(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root/'soma.swc').write_text('synthetic morphology\\n', encoding='utf-8')
            file = write_manifest(root, SID, 901, TEMPLATE)
            verified = verify_manifest(root)
            self.assertTrue(verified['sha256_verified'])
            self.assertFalse(verified['human_biological_fidelity_validated'])
            (root/'soma.swc').write_text('tampered content\\n', encoding='utf-8')
            with self.assertRaises(ValueError):
                verify_manifest(root)
            import json
            doc = json.loads(file.read_text(encoding='utf-8'))
            doc['files'][0]['path'] = '../outside.swc'
            file.write_text(json.dumps(doc), encoding='utf-8')
            with self.assertRaises(ValueError):
                verify_manifest(root)



if __name__ == '__main__':
    unittest.main()
