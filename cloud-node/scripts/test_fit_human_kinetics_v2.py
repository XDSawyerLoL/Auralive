"""No-network tests: original human-constrained gates, preregistered fit, leakage."""
import unittest
from fit_human_kinetics_v2 import (
    SOURCE, SCHEMA, preregistered_candidates, validate_candidate, fit_reference,
)

SAMPLES=100


def fake_record(n):
    return {
        'specimen_id':643582610,
        'sweep_number':n,
        'source':{'origin':'Allen Cell Types Database'},
        'dt_ms':.05,
        'voltage_mV':[-70.]*SAMPLES,
        'stimulus_current_pA':[120.]*SAMPLES,
    }


class ModelSpy:
    def __init__(self):
        self.calls=[]
    def simulate(self,record,params):
        n=record['sweep_number']
        self.calls.append((n,params['gna_soma']))
        loss=abs(params['gna_soma']-.24)+(0 if n!=44 else 200)
        return {
            'loss':loss,
            'rmse_mV':float(loss),
            'mae_mV':float(loss),
            'observed_spikes':2,
            'predicted_spikes':1,
        }


class OriginalHumanConstrainedGatesTests(unittest.TestCase):
    def test_no_historical_HH_files_or_copy_of_noncommercial_sources(self):
        grid=preregistered_candidates()
        self.assertEqual(len(grid),12)
        self.assertEqual(len({tuple(x.items()) for x in grid}),12)
        for candidate in grid: self.assertTrue(validate_candidate(candidate))
        self.assertEqual(SCHEMA,'aura-human-effective-gating-v2')
        self.assertNotIn('squid',SOURCE.lower())

    def test_rejects_nonfinite_or_unbounded_kinetics(self):
        params=preregistered_candidates()[0]
        for broken in [{'gna_soma':float('nan')},
                       {'tau_na_m':0},
                       {'vhalf_na_m':500},
                       {'axon_gain':100},
                       {'unknown':2}]:
            trial={**params,**broken}
            with self.assertRaises(ValueError):
                validate_candidate(trial)

    def test_train_then_one_holdout_without_lookahead(self):
        grid=preregistered_candidates()[:4]
        model=ModelSpy()
        selection={'training_sweep_numbers':[26,37],
                   'validation_sweep_numbers':[44]}
        records={n:fake_record(n) for n in [26,37,44]}
        out=fit_reference(model,selection,records,candidates=grid)
        self.assertEqual(out['training_candidate_count'],4)
        self.assertEqual(len(model.calls),9)
        self.assertEqual(model.calls[-1][0],44)
        self.assertNotIn(44,[num for num,_ in model.calls[:-1]])
        self.assertEqual(out['locked_holdout_metrics']['rmse_mV'],200.0)
        self.assertFalse(out['locked_holdout_used_for_selection'])
        self.assertFalse(out['human_NaK_direct_voltage_clamp_calibrated'])
        self.assertFalse(out['biologically_validated_human_channel'])
        self.assertFalse(out['production_state_modified'])
        self.assertEqual(out['compiled_modfiles'],['aura_na_eff.mod','aura_k_eff.mod'])

    def test_rejects_duplicate_and_mixed_specimen(self):
        model=ModelSpy()
        selection={'training_sweep_numbers':[26,37],
                   'validation_sweep_numbers':[26]}
        records={n:fake_record(n) for n in (26,37)}
        with self.assertRaises(ValueError):
            fit_reference(model,selection,records,candidates=preregistered_candidates()[:1])
        selection['validation_sweep_numbers']=[44]
        records[44]=fake_record(44)
        records[44]['specimen_id']=529898751
        with self.assertRaises(ValueError):
            fit_reference(model,selection,records,candidates=preregistered_candidates()[:1])



class IndependentEventAwareCalibrationTests(unittest.TestCase):
    def test_train_only_event_aware_candidate_can_differ_from_voltage_winner(self):
        from human_active_validation_metrics import SCHEMA
        class Spy:
            def __init__(self):self.calls=[]
            def simulate(self,record,params):
                n=record['sweep_number']
                self.calls.append((n,params['gna_soma']))
                voltage_loss=1 if params['gna_soma']==.12 else 2
                missed=3 if params['gna_soma']==.12 else 0
                return {
                    'loss':voltage_loss+(100 if n==44 else 0),
                    'observed_spikes':3,
                    'predicted_spikes':0 if missed else 3,
                    'timing_fidelity':{
                        'schema':SCHEMA,
                        'comparison_not_genome_or_brain_equivalence':True,
                        'voltage_rmse_mV':voltage_loss,
                        'subthreshold_rmse_mV':1,
                        'missed_spikes':missed,
                        'false_positive_spikes':0,
                        'timing_mae_ms':None if missed else 1}}
        model=Spy()
        selection={'training_sweep_numbers':[26,37],
                   'validation_sweep_numbers':[44]}
        records={n:fake_record(n) for n in (26,37,44)}
        result=fit_reference(model,selection,records,
            candidates=preregistered_candidates()[:2])
        self.assertEqual(result['winner']['gna_soma'],.12)
        alt=result['event_aware_training_comparison']
        self.assertEqual(alt['alternate_training_selection']['candidate']['gna_soma'],.24)
        self.assertFalse(alt['candidate_selected_using_holdout'])
        self.assertEqual([n for n,_ in model.calls],[26,37,26,37,44,44])
        self.assertEqual(result['locked_holdout_metrics']['loss'],101)
        self.assertEqual(alt['alternate_sealed_holdout_metrics']['loss'],102)
        self.assertTrue(alt['historical_train_winner_retained'])

if __name__=='__main__':unittest.main()
