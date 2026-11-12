"""Offline verification of Allen human exporter, without AllenSDK or network."""
import unittest
from export_allen_human_features import build_record

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


if __name__ == '__main__':
    unittest.main()
