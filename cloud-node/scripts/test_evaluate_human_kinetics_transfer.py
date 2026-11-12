"""Cross-cell data isolation and frozen kinetic-parameter compliance tests."""
import unittest
from fit_human_kinetics_v2 import preregistered_candidates, SCHEMA, SOURCE
from evaluate_human_kinetics_transfer import (
    validate_frozen_reference, prepare_external_result,
)


def reference():
    return {'schema':SCHEMA,'reference_specimen':643582610,
            'locked_holdout_used_for_selection':False,
            'winner':preregistered_candidates()[0]}


def cohort():
    return {'transfer_test_specimens':[
        {'specimen_id':529898751,'challenge_sweep_number':54,
         'challenge_current_pA':230},
        {'specimen_id':508410761,'challenge_sweep_number':58,
         'challenge_current_pA':350}],
        'selection_used_spike_count':False,
        'selection_used_voltage':False}


def scores():
    return {'model_origin':SOURCE,'rmse_mV':7.7,'mae_mV':5.4,
            'observed_spikes':3,'predicted_spikes':2}


class TransferComplianceTests(unittest.TestCase):
    def test_valid_fixed_fit_and_two_prespecified_targets(self):
        r=reference()
        self.assertEqual(validate_frozen_reference(r,cohort(),529898751,54),
                         r['winner'])
        self.assertEqual(validate_frozen_reference(r,cohort(),508410761,58),
                         r['winner'])

    def test_must_not_evaluate_fitting_cell_or_nonprespecified_sweep(self):
        for sid,sweep in [(643582610,54),(529898751,55),
                          (508410761,54),(1000,54)]:
            with self.assertRaises(ValueError):
                validate_frozen_reference(reference(),cohort(),sid,sweep)

    def test_no_leakage_from_heldout_or_external_voltage_spikes(self):
        r=reference()
        r['locked_holdout_used_for_selection']=True
        with self.assertRaises(ValueError):
            validate_frozen_reference(r,cohort(),529898751,54)
        c=cohort()
        c['selection_used_spike_count']=True
        with self.assertRaises(ValueError):
            validate_frozen_reference(reference(),c,529898751,54)

    def test_verifiable_no_claims_about_molecular_kinetics(self):
        result=prepare_external_result(reference(),cohort(),529898751,54,
                                         scores(),'a'*64,'b'*64)
        self.assertEqual(result['observed_spikes'],3)
        self.assertEqual(result['predicted_spikes'],2)
        self.assertFalse(result['molecular_kinetics_identified'])
        self.assertFalse(result['target_active_data_used_for_fit'])
        self.assertFalse(result['two_distinct_donors_verified'])
        self.assertFalse(result['model_biological_fidelity_validated'])
        self.assertTrue(result['no_llm'])

    def test_finite_scores_and_correct_mechanism_source_required(self):
        bad=scores()
        bad['rmse_mV']=float('nan')
        with self.assertRaises(ValueError):
            prepare_external_result(reference(),cohort(),529898751,54,
                                    bad,'a'*64,'b'*64)
        bad=scores()
        bad['model_origin']='historical-squid-HH'
        with self.assertRaises(ValueError):
            prepare_external_result(reference(),cohort(),529898751,54,
                                    bad,'a'*64,'b'*64)


if __name__=='__main__': unittest.main()
