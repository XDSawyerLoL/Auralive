"""No-network cross-specimen transfer safeguards; synthetic numerical fixtures."""
import unittest

from evaluate_human_transfer_cell import (
    PARAMETERS, REFERENCE_SPECIMEN, validate_target, summarise_transfer,
)


def cohort():
    return {
        'transfer_test_specimens': [
            {'specimen_id': 10001, 'validation_sweep_number': 71,
             'challenge_sweep_number': 81},
            {'specimen_id': 10002, 'validation_sweep_number': 72,
             'challenge_sweep_number': 82},
        ],
        'transferred_parameters': dict(PARAMETERS),
        'selected_using_spike_counts': False,
        'selection_used_voltage': False,
    }


def evaluated():
    return {
        'model_origin': 'historic-squid-HH-kinetics-on-human-SWC',
        'predicted_spikes': 1,
        'spike_count_error': -2,
        'rmse_mV': 11.0,
        'mae_mV': 7.0,
    }


class IndependentHumanTransferTests(unittest.TestCase):
    def test_other_specimen_and_preselected_sweep_are_mandatory(self):
        self.assertEqual(validate_target(10001, 71, cohort())['specimen_id'], 10001)
        self.assertEqual(validate_target(10001, 81, cohort())['specimen_id'], 10001)
        for specimen, sweep in ((REFERENCE_SPECIMEN, 71), (10001, 72),
                                (10003, 71)):
            with self.assertRaises(ValueError):
                validate_target(specimen, sweep, cohort())

    def test_never_reselect_active_parameters_using_target_voltage(self):
        leaky = cohort()
        leaky['selection_used_voltage'] = True
        with self.assertRaises(ValueError):
            validate_target(10001, 71, leaky)
        leaky = cohort()
        leaky['transferred_parameters']['na'] = 5.
        with self.assertRaises(ValueError):
            validate_target(10001, 71, leaky)

    def test_report_reproduces_observation_without_claiming_human_kinetics(self):
        output = summarise_transfer(
            10001, 71, PARAMETERS, evaluated(),
            {'specimen_id': 10001, 'sweep_number': 71, 'spike_count': 3},
            'a'*64, 'b'*64,
        )
        self.assertEqual(output['target_observed_spikes'], 3)
        self.assertEqual(output['target_simulated_spikes'], 1)
        self.assertFalse(output['target_sweep_used_for_optimization'])
        self.assertFalse(output['true_human_ion_channels_validated'])
        self.assertFalse(output['independent_donors_verified'])
        self.assertFalse(output['human_brain_reproduced'])
        self.assertTrue(output['no_llm'])

    def test_rejects_mixed_specimen_and_bad_metrics(self):
        with self.assertRaises(ValueError):
            summarise_transfer(
                10001, 71, PARAMETERS, evaluated(),
                {'specimen_id': 10002, 'sweep_number': 71, 'spike_count': 3},
                'a'*64, 'b'*64)
        wrong = evaluated()
        wrong['rmse_mV'] = float('nan')
        with self.assertRaises(ValueError):
            summarise_transfer(
                10001, 71, PARAMETERS, wrong,
                {'specimen_id': 10001, 'sweep_number': 71, 'spike_count': 3},
                'a'*64, 'b'*64)


if __name__ == '__main__':
    unittest.main()
