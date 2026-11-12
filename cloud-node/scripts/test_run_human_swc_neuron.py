"""Offline dimensional tests for the optional NEURON human-cell runner."""
import json
import tempfile
import unittest
from pathlib import Path
from run_human_swc_neuron import read_human_features, load_stimulus, passive_geometry_parameters


def feature_record():
    return {
        'schema_version':'aura-allen-cell-types-human-ephys-v1',
        'species':'Homo sapiens','specimen_id':643625553,
        'features':{'vrest_mV':-65.0,'input_resistance_MOhm':200.0,
                    'membrane_tau_ms':20.0},
        'source':{
            'dataset':'Allen Cell Types Database',
            'species_filter':'CellTypesApi.HUMAN',
            'human_specimen_verified':True,
            'feature_units':{'vrest':'mV','ri':'MOhm','tau':'ms'},
        },
    }


class NeuronResearchRunnerTests(unittest.TestCase):
    def test_dimensional_surface_conversion(self):
        x=passive_geometry_parameters(feature_record(),10000)
        self.assertAlmostEqual(x['leak_total_nS'],5.0)
        self.assertAlmostEqual(x['cap_total_pF'],100.0)
        self.assertAlmostEqual(x['g_pas_S_cm2'],.00005)
        self.assertAlmostEqual(x['cm_uF_cm2'],1.0)
        self.assertIn('isopotential',x['fit_assumption'])

    def test_rejects_untrusted_human_metadata_and_incomplete_features(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'features.json'
            data=feature_record()
            path.write_text(json.dumps(data))
            self.assertEqual(read_human_features(path)['specimen_id'],643625553)
            data['species']='Mus musculus'
            path.write_text(json.dumps(data))
            with self.assertRaises(ValueError):read_human_features(path)
            data=feature_record();del data['features']['membrane_tau_ms']
            path.write_text(json.dumps(data))
            with self.assertRaises(ValueError):read_human_features(path)

    def test_stimulus_is_bounded_and_not_passed_as_nwbdataset(self):
        stim=load_stimulus(None,dt_ms=.05,duration_ms=100,current_pA=20)
        self.assertEqual(len(stim['current_pA']),2000)
        self.assertEqual(stim['measured_mV'],None)
        self.assertEqual(stim['current_pA'][0],0)
        self.assertEqual(stim['current_pA'][800],20)
        with self.assertRaises(ValueError):
            load_stimulus(None,duration_ms=5000)
        with self.assertRaises(ValueError):
            load_stimulus(None,current_pA=10000)


if __name__ == '__main__':
    unittest.main()
