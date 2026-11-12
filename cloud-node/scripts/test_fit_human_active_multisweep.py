"""No network: verify strict train/holdout split and scientific claim limits."""
import unittest
from fit_human_active_multisweep import (
    select_prespecified_sweeps, fixed_candidate_grid, select_fit_candidate,
    normalized_error, build_report,
)


def metadata():
    # Different currents, identical waveform class, intentionally unsorted.
    return [
        {'sweep_number':35,'stimulus_name':'Long Square',
         'stimulus_absolute_amplitude':180,'num_spikes':0},
        {'sweep_number':30,'stimulus_name':'Long Square',
         'stimulus_absolute_amplitude':80,'num_spikes':5},
        {'sweep_number':32,'stimulus_name':'Long Square',
         'stimulus_absolute_amplitude':130,'num_spikes':10},
        {'sweep_number':31,'stimulus_name':'Short Square',
         'stimulus_absolute_amplitude':110,'num_spikes':999},
        {'sweep_number':34,'stimulus_name':'Long Square',
         'stimulus_absolute_amplitude':150,'num_spikes':1},
        {'sweep_number':36,'stimulus_name':'Long Square',
         'stimulus_absolute_amplitude':180,'num_spikes':90},
    ]


def fake_record(number):
    return {
        'specimen_id':643582610,
        'sweep_number':number,
        'source':{'origin':'Allen Cell Types Database'},
        'dt_ms':.05,
        'voltage_mV':[-65.0]*120,
        'stimulus_current_pA':[60.0]*120,
    }


class SpyModel:
    def __init__(self):
        self.calls=[]
    def simulate(self,record,params):
        self.calls.append((record['sweep_number'],params['na']))
        # Lower objective for na=2 on training, independent fixed holdout
        loss=(params['na']-2)**2 if record['sweep_number']!=32 else 123
        return {
            'loss':loss, 'observed_spikes':4,
            'predicted_spikes':0 if params['na']!=2 else 2,
            'rmse_mV':float(loss),
        }


class SplitValidationTests(unittest.TestCase):
    def test_selection_is_only_stimulus_based_and_prespecified(self):
        split=select_prespecified_sweeps(metadata())
        self.assertEqual(split['training_sweep_numbers'],[30,35])
        self.assertEqual(split['validation_sweep_numbers'],[32])
        self.assertFalse(split['selected_using_spike_counts'])
        mutated=metadata()
        for item in mutated:item['num_spikes']=99999
        self.assertEqual(select_prespecified_sweeps(mutated),split)

    def test_requires_three_distinct_amplitudes(self):
        with self.assertRaises(ValueError):
            select_prespecified_sweeps(metadata()[:2])
        with self.assertRaises(ValueError):
            select_prespecified_sweeps([
                {'sweep_number':10,'stimulus_name':'Long Square',
                 'stimulus_absolute_amplitude':100},
                {'sweep_number':11,'stimulus_name':'Long Square',
                 'stimulus_absolute_amplitude':100},
                {'sweep_number':12,'stimulus_name':'Long Square',
                 'stimulus_absolute_amplitude':100},
            ])

    def test_tuning_never_touches_validation_until_candidate_is_locked(self):
        split=select_prespecified_sweeps(metadata())
        traces={n:fake_record(n) for n in [30,32,35]}
        model=SpyModel()
        report=build_report(split,model,traces,candidates=[
            {'na':1.,'k':1.,'axon':0.},
            {'na':2.,'k':1.,'axon':0.},
            {'na':4.,'k':1.,'axon':0.},
        ])
        self.assertEqual(report['best_fit_parameters']['na'],2)
        self.assertEqual(model.calls,[(30,1),(35,1),(30,2),(35,2),
                                       (30,4),(35,4),(32,2)])
        self.assertEqual(report['validation_metrics']['loss'],123)
        self.assertFalse(report['validation_used_for_model_selection'])
        self.assertFalse(report['true_human_active_channels_reconstructed'])
        self.assertFalse(report['independent_of_Allen_original_feature_extraction'])
        self.assertEqual(len(fixed_candidate_grid()),8)

    def test_holdout_reuse_is_a_hard_error(self):
        s=select_prespecified_sweeps(metadata())
        s['validation_sweep_numbers']=[s['training_sweep_numbers'][0]]
        with self.assertRaises(ValueError):
            build_report(s,SpyModel(),{n:fake_record(n) for n in [30,32,35]})

    def test_spike_count_is_weighted_and_loss_is_reproducible(self):
        v=[-60.0]*140
        p=[-60.0]*140
        for j in (40,90):
            v[j]=-15
            v[j+1]=25
            v[j+2]=-65
        out=normalized_error(v,p,.05)
        self.assertEqual(out['observed_spikes'],2)
        self.assertEqual(out['predicted_spikes'],0)
        self.assertGreaterEqual(out['loss'],10)
        self.assertEqual(out,normalized_error(v,p,.05))
        self.assertIn('squid',out['model_origin'])
        with self.assertRaises(ValueError):
            normalized_error(v,p[:60],.05)


if __name__=='__main__':unittest.main()
