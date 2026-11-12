"""Offline action potential detection on synthetic fixtures; no fake human data."""
import unittest
from analyze_human_spiking_nwb import spike_report


def recording(spikes=True):
    voltage=[-65.0]*1000
    if spikes:
        for t in [250,450,700]:
            # Synthetic AP with rise, positive overshoot and return.
            voltage[t-1]=-55;voltage[t]=0;voltage[t+1]=32
            voltage[t+2]=10;voltage[t+3]=-30;voltage[t+4]=-65
    current=[0.0]*1000
    for t in range(160,850):current[t]=120
    return {
        'source':{'origin':'Allen Cell Types Database',
                  'nwb_sha256':'test-source-only'},
        'specimen_id':643582610,'sweep_number':5,'dt_ms':.05,
        'voltage_mV':voltage,'stimulus_current_pA':current,
    }


class SpikeAnalysisTests(unittest.TestCase):
    def test_true_threshold_events_and_timebase_in_synthetic_unit_fixture(self):
        report=spike_report(recording())
        self.assertEqual(report['spike_count'],3)
        self.assertEqual(report['event_times_ms'],[12.5,22.5,35])
        self.assertEqual(report['peak_voltage_mV'],32)
        self.assertEqual(report['mean_interspike_interval_ms'],11.25)
        self.assertFalse(report['model_active_channels_calibrated'])
        self.assertFalse(report['consciousness_inferred'])

    def test_subthreshold_trace_has_no_spikes(self):
        report=spike_report(recording(False))
        self.assertEqual(report['spike_count'],0)
        self.assertEqual(report['event_times_ms'],[])
        self.assertIsNone(report['mean_interspike_interval_ms'])

    def test_fake_data_or_corrupted_units_are_rejected(self):
        for corrupted in [
            {'source':{'origin':'generated-by-LLM'}},
            {'dt_ms':0}, {'specimen_id':None},
            {'voltage_mV':[float('nan')]*1000},
            {'stimulus_current_pA':[]},
        ]:
            row=recording()
            row.update(corrupted)
            with self.assertRaises((ValueError,TypeError)):
                spike_report(row)


if __name__=='__main__':unittest.main()
