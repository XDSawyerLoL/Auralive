"""Offline verification of Allen human exporter, without AllenSDK or network."""
import unittest
from export_allen_human_features import build_record, select_heldout_trace

SPECIMEN=643625553  # example identifier; test values below are SYNTHETIC


def cell():
    return {'id': SPECIMEN, 'species': 'Homo sapiens'}


def features():
    return {'specimen_id': SPECIMEN, 'vrest': -65.0, 'ri': 170.0,
            'tau': 18.5}


class HumanAllenExporterTests(unittest.TestCase):
    def test_human_metadata_and_units_pass_without_fabrication(self):
        record = build_record(SPECIMEN, [cell()], [features()],
                              software='unit-test-synthetic')
        self.assertEqual(record['species'], 'Homo sapiens')
        self.assertEqual(record['features']['input_resistance_MOhm'], 170.0)
        self.assertEqual(record['features']['membrane_tau_ms'], 18.5)
        self.assertEqual(record['source']['feature_units']['tau'], 'ms')
        self.assertEqual(record['source']['species_filter'], 'CellTypesApi.HUMAN')

    def test_mixed_species_or_duplicate_human_specimen_rejected(self):
        with self.assertRaises(ValueError):
            build_record(SPECIMEN, [{'id': SPECIMEN,'species':'Mus musculus'}],
                         [features()])
        with self.assertRaises(ValueError):
            build_record(SPECIMEN, [cell(),cell()], [features()])

    def test_missing_feature_is_not_replaced_by_default(self):
        for key in ('vrest','ri','tau'):
            incomplete=features()
            del incomplete[key]
            with self.assertRaises(ValueError):
                build_record(SPECIMEN,[cell()],[incomplete])

    def test_nan_and_nonhuman_or_out_of_bounds_records_rejected(self):
        invalid=features()
        invalid['ri']=float('nan')
        with self.assertRaises(ValueError):
            build_record(SPECIMEN,[cell()],[invalid])
        invalid=features()
        invalid['tau']=-1
        with self.assertRaises(ValueError):
            build_record(SPECIMEN,[cell()],[invalid])
        with self.assertRaises(ValueError):
            build_record(123456789,[cell()],[features()])



class FakeNwbDataset:
    def get_sweep(self, sweep_number):
        if sweep_number!=7:raise ValueError('not found')
        return {
            'sampling_rate':20000,
            'response':[-.065 + n*.000001 for n in range(100)],
            'stimulus':[2e-11 if 20<=n<70 else 0.0 for n in range(100)],
            'index_range':(10,90),
        }


class AllenHumanNwbTraceTests(unittest.TestCase):
    def test_si_units_and_explicit_independence_uncertainty(self):
        result=select_heldout_trace(
            FakeNwbDataset(),specimen_id=SPECIMEN,sweep_number=7)
        self.assertEqual(result['specimen_id'],SPECIMEN)
        self.assertEqual(result['sweep_number'],7)
        self.assertAlmostEqual(result['dt_ms'],.05)
        self.assertAlmostEqual(result['voltage_mV'][0],-64.99)
        self.assertEqual(result['stimulus_current_pA'][10],20.0)
        self.assertFalse(result['independence_verified'])
        self.assertEqual(result['source']['original_units']['response'],'V')

    def test_invalid_sweep_fails_without_fallback(self):
        with self.assertRaises(ValueError):
            select_heldout_trace(FakeNwbDataset(),specimen_id=SPECIMEN,
                                 sweep_number=6)

if __name__ == '__main__':
    unittest.main()
