"""Offline security and species tests for the human Allen model importer."""
import tempfile
import unittest
from pathlib import Path
from allen_human_active_models import model_records, download_human_model
from run_verified_allen_model import verify_manifest

SPECIMEN=643625553
MODEL_ID=758443311  # synthetic test ID, never asserted to exist at Allen


def human(): return [{'id': SPECIMEN, 'species': 'Homo sapiens'}]
def record(): return [{'id': MODEL_ID, 'specimen_id': SPECIMEN,
                      'neuronal_model_template_id': 491455321}]


class StubAPI:
    cache_stimulus = True
    called = False
    def cache_data(self, model_id, working_directory):
        self.called = True
        p=Path(working_directory)
        (p / 'manifest.json').write_text('{"source":"synthetic test"}\n')


class HumanBiophysicalModelTests(unittest.TestCase):
    def test_species_and_model_association_are_both_required(self):
        selected=model_records(SPECIMEN,human(),record())
        self.assertEqual(selected[0]['model_id'],MODEL_ID)
        self.assertEqual(selected[0]['specimen_id'],SPECIMEN)
        with self.assertRaises(ValueError):
            model_records(SPECIMEN,[{'id':SPECIMEN,'species':'Mus musculus'}],
                          record())
        with self.assertRaises(ValueError):
            model_records(SPECIMEN,human(),[{'id':MODEL_ID,'specimen_id':9999999}])
        with self.assertRaises(ValueError):
            model_records(SPECIMEN,human(),[{'id':'bad','specimen_id':SPECIMEN, 'neuronal_model_template_id':491455321}])

    def test_non_biophysical_glif_templates_cannot_be_fetched_as_active_neurons(self):
        invalid=[{'id': MODEL_ID, 'specimen_id': SPECIMEN,
                  'neuronal_model_template_id': 395310498}]
        self.assertEqual(model_records(SPECIMEN,human(),invalid),[])

    def test_only_explicit_matching_model_may_download(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp) / 'model'
            api=StubAPI()
            with self.assertRaises(ValueError):
                download_human_model(SPECIMEN, MODEL_ID+1,out,human(),record(),api)
            self.assertFalse(api.called)
            result=download_human_model(SPECIMEN,MODEL_ID,out,human(),record(),api)
            self.assertTrue(api.called)
            self.assertTrue(api.cache_stimulus)
            self.assertEqual(result['species'],'Homo sapiens')
            self.assertTrue(result['native_mechanisms_not_executed'])
            self.assertFalse(result['human_parameter_fit_independently_validated'])
            self.assertEqual(len(result['files']),1)
            with self.assertRaises(FileExistsError):
                download_human_model(SPECIMEN,MODEL_ID,out,human(),record(),api)


    def test_checksum_verified_and_tampering_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'model'
            download_human_model(SPECIMEN,MODEL_ID,root,human(),record(),StubAPI())
            report=verify_manifest(root)
            self.assertTrue(report['sha256_verified'])
            self.assertFalse(report['human_biological_fidelity_validated'])
            (root/'manifest.json').write_text('tampered!',encoding='utf-8')
            with self.assertRaises(ValueError):
                verify_manifest(root)
            import json
            provenance=root/'aura-model-provenance.json'
            data=json.loads(provenance.read_text(encoding='utf-8'))
            data['files'][0]['path']='../escape'
            provenance.write_text(json.dumps(data),encoding='utf-8')
            with self.assertRaises(ValueError):
                verify_manifest(root)


if __name__=='__main__': unittest.main()
