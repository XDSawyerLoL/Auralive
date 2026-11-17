"""Pure synthetic unit fixtures: never presented as human NWB evidence."""
import unittest
from human_active_validation_metrics import assess_active_fidelity, rank_preregistered_training_candidates, SCHEMA

DT = .05
COUNT = 3000

def trace(spikes=(), baseline=-65):
    volts=[float(baseline)]*COUNT
    for idx in spikes:
        if not 5 <= idx < COUNT-10:
            raise ValueError('fixture spike outside interval')
        volts[idx-1]=-55.
        volts[idx]=-15.
        volts[idx+1]=30.
        volts[idx+2]=12.
        volts[idx+3]=-28.
        volts[idx+4]=-60.
    return volts

class HumanSpikingFidelityTests(unittest.TestCase):
    def test_identical_three_spikes_are_matched_and_not_certified(self):
        volts=trace((400,950,1600))
        x=assess_active_fidelity(volts,volts,DT)
        self.assertEqual(x['schema'],SCHEMA)
        self.assertEqual(x['matched_spikes'],3)
        self.assertEqual(x['event_f1'],1)
        self.assertEqual(x['timing_mae_ms'],0)
        self.assertEqual(x['voltage_rmse_mV'],0)
        self.assertEqual(x['subthreshold_rmse_mV'],0)
        self.assertFalse(x['active_firing_validated'])
        self.assertTrue(x['phenomenological_screen_passed'])
        self.assertFalse(x['screen_is_biological_equivalence_certificate'])
        self.assertFalse(x['metrics_from_real_data_verified_here'])
        self.assertFalse(x['raw_voltage_exported'])
        self.assertGreater(x['observed_max_dvdt_mV_per_ms'],0)

    def test_wrong_spike_timing_fails_even_when_spike_counts_match(self):
        ref=trace((300,800,1300))
        shifted=trace((380,880,1380))
        x=assess_active_fidelity(ref,shifted,DT)
        self.assertEqual(x['observed_spikes'],x['predicted_spikes'])
        self.assertEqual(x['matched_spikes'],0)
        self.assertEqual(x['event_f1'],0)
        self.assertEqual(x['missed_spikes'],3)
        self.assertEqual(x['false_positive_spikes'],3)
        self.assertGreater(x['voltage_rmse_mV'],0)

    def test_nearby_events_match_and_expose_latency_error(self):
        x=assess_active_fidelity(trace((300,900)),
                                 trace((340,940)),DT)
        self.assertEqual(x['matched_spikes'],2)
        self.assertEqual(x['first_spike_latency_error_ms'],2)
        self.assertEqual(x['timing_mae_ms'],2)
        self.assertEqual(x['event_f1'],1)

    def test_missing_event_has_lower_recall_not_a_full_match(self):
        x=assess_active_fidelity(trace((300,900,1600)),
                                 trace((300,1600)),DT)
        self.assertEqual(x['matched_spikes'],2)
        self.assertEqual(x['missed_spikes'],1)
        self.assertEqual(x['event_precision'],1)
        self.assertAlmostEqual(x['event_recall'],.666667,places=6)
        self.assertEqual(x['event_f1'],.8)
        self.assertIsNotNone(x['observed_isi_cv'])

    def test_extra_generated_spikes_penalize_precision(self):
        x=assess_active_fidelity(trace((300,1600)),
                                 trace((300,900,1600)),DT)
        self.assertEqual(x['false_positive_spikes'],1)
        self.assertEqual(x['missed_spikes'],0)
        self.assertAlmostEqual(x['event_precision'],.666667,places=6)

    def test_no_ap_is_not_positive_human_active_fidelity(self):
        ref=trace(())
        x=assess_active_fidelity(ref,ref,DT)
        self.assertIsNone(x['event_f1'])
        self.assertIsNone(x['event_precision'])
        self.assertIsNone(x['event_recall'])
        self.assertIsNone(x['timing_mae_ms'])
        self.assertEqual(x['subthreshold_fraction'],1)
        self.assertEqual(x['voltage_rmse_mV'],0)
        self.assertFalse(x['active_firing_validated'])

    def test_predicted_zero_spikes_against_recorded_spikes_is_failure(self):
        x=assess_active_fidelity(trace((300,900)),trace(()),DT)
        self.assertEqual(x['missed_spikes'],2)
        self.assertEqual(x['event_f1'],0)
        self.assertEqual(x['event_recall'],0)
        self.assertIsNone(x['event_precision'])
        self.assertIsNone(x['first_spike_latency_error_ms'])

    def test_subthreshold_mask_excludes_both_recorded_and_predicted_ap(self):
        ref=trace((300,))
        pred=trace((350,))
        baseline=assess_active_fidelity(ref,pred,DT)
        self.assertLess(baseline['subthreshold_rmse_mV'],
                        baseline['voltage_rmse_mV'])
        self.assertLess(baseline['subthreshold_fraction'],1)
        self.assertGreater(baseline['subthreshold_fraction'],0)

    def test_wrong_voltage_or_clock_rejected(self):
        volts=trace((300,))
        for other in [volts[:99],volts+[0.],[]]:
            with self.assertRaises(ValueError):
                assess_active_fidelity(volts,other,DT)
        for invalid in [0,.001,.11,float('nan'),True]:
            with self.assertRaises(ValueError):
                assess_active_fidelity(volts,volts,invalid)
        nan=volts.copy()
        nan[10]=float('nan')
        with self.assertRaises(ValueError):
            assess_active_fidelity(volts,nan,DT)
        with self.assertRaises(ValueError):
            assess_active_fidelity(volts,volts,DT,matching_tolerance_ms=100)

    def test_spike_order_matching_is_one_to_one(self):
        obs=trace((300,800))
        pred=trace((310,365,800))
        x=assess_active_fidelity(obs,pred,DT)
        self.assertEqual(x['matched_spikes'],2)
        self.assertEqual(x['false_positive_spikes'],1)
        self.assertEqual(x['event_precision'],.666667)


class ModelSelectionIsolationTests(unittest.TestCase):
    def _trial(self, density, missed, rmse):
        return {'candidate':{'na':density},'training':[{
            'timing_fidelity':{
                'schema':SCHEMA,
                'comparison_not_genome_or_brain_equivalence':True,
                'voltage_rmse_mV':rmse,
                'subthreshold_rmse_mV':1,
                'missed_spikes':missed,
                'false_positive_spikes':0,
                'timing_mae_ms':1 if missed==0 else None
            }} for _ in range(2)]}

    def test_ranking_prefers_training_spike_fidelity_not_smaller_voltage_rmse(self):
        result=rank_preregistered_training_candidates([
            self._trial(1,3,1),self._trial(2,0,3)])
        self.assertEqual(result['candidate']['na'],2)
        self.assertEqual(result['candidate_index'],1)
        self.assertTrue(result['training_only'])
        self.assertFalse(result['used_heldout'])
        self.assertFalse(result['criterion_physically_calibrated_to_human_population'])

    def test_missing_timing_in_legacy_mock_skips_comparison_without_claim(self):
        self.assertIsNone(rank_preregistered_training_candidates([
            {'candidate':{'na':1},'training':[{'loss':2}]}]))
        with self.assertRaises(ValueError):
            rank_preregistered_training_candidates([])

if __name__=='__main__': unittest.main()
