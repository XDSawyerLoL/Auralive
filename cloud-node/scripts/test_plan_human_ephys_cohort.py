"""Deterministic cohort-selection tests; all specimen IDs/data below synthetic."""
import unittest
from plan_human_ephys_cohort import (candidate_ids, select_cohort, SEED)


def cells():
    return [{'id': i, 'species': 'Homo sapiens'}
            for i in (10001, 10002, 10003, 10004, 10005, 10006)]


def features():
    return [{'specimen_id': i, 'vrest': -67.0,
             'ri': 150.0, 'tau': 15.0}
            for i in (10001, 10002, 10003, 10004, 10005, 10006)]


def sweeps(sid):
    # Available waveforms are positive long-square current metadata only.
    return [{'sweep_number': int(str(sid)[-3:]) * 10 + j,
             'stimulus_name': 'Long Square',
             'stimulus_absolute_amplitude': 50 * j,
             'num_spikes': sid * (j + 1)}
            for j in (1, 2, 3, 4)]


class CohortSelectionTests(unittest.TestCase):
    def test_reproducible_selection_uses_no_spike_counts(self):
        before = select_cohort(cells(), features(), sweeps, count=2)
        after = select_cohort(list(reversed(cells())),
                              list(reversed(features())), sweeps, count=2)
        self.assertEqual(before, after)
        self.assertEqual(before['selection_seed'], SEED)
        self.assertEqual(len(before['transfer_test_specimens']), 2)
        self.assertTrue(before['distinct_specimens'])
        self.assertFalse(before['distinct_donors_verified'])
        self.assertFalse(before['selection_used_spike_count'])
        self.assertFalse(before['selection_used_voltage'])
        self.assertEqual(before['transferred_parameters'],
                         {'na': 2.0, 'k': 1.0, 'axon': 1.0})

    def test_rejects_nonhuman_missing_and_invalid_features(self):
        human = cells()
        human[0]['species'] = 'Mus musculus'
        feat = features()
        feat[1]['ri'] = float('nan')
        feat[2]['tau'] = None
        eligible = candidate_ids(human, feat)
        self.assertNotIn(10001, eligible)
        self.assertNotIn(10002, eligible)
        self.assertNotIn(10003, eligible)
        self.assertEqual(len(eligible), 3)

    def test_nonspiking_conditions_are_not_excluded_by_response(self):
        def never_spikes(sid):
            out = sweeps(sid)
            for s in out:
                s['num_spikes'] = 0
            return out
        a = select_cohort(cells(), features(), sweeps, count=2)
        b = select_cohort(cells(), features(), never_spikes, count=2)
        self.assertEqual(a, b)

    def test_fail_closed_if_fewer_than_requested_candidates(self):
        with self.assertRaises(ValueError):
            select_cohort(cells()[:1], features(), sweeps, count=2)
        with self.assertRaises(ValueError):
            select_cohort(cells(), features(), lambda _: [], count=2)
        with self.assertRaises(ValueError):
            select_cohort(cells(), features(), sweeps, count=6)

    def test_selected_sweeps_are_median_and_require_three_currents(self):
        report = select_cohort(cells(), features(), sweeps, count=2)
        for s in report['transfer_test_specimens']:
            self.assertTrue(s['validation_sweep_number'] > 0)
            self.assertEqual(s['validation_current_pA'], 100)
            self.assertEqual(s['challenge_current_pA'], 200)
            self.assertNotEqual(s['challenge_sweep_number'],
                                s['validation_sweep_number'])
            self.assertEqual(s['available_current_conditions'], 4)


if __name__ == '__main__':
    unittest.main()
