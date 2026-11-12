"""Active-control tests use synthetic numbers; never human validation claims."""
import unittest
from run_human_active_hh_control import detect_events


class ActiveControlTests(unittest.TestCase):
    def test_detects_actual_voltage_crossings_when_local_peak_is_positive(self):
        voltage=[-70.0]*500
        for k in (80,220,360):
            voltage[k-1]=-40
            voltage[k]=-15
            voltage[k+1]=28
            voltage[k+2]=1
            voltage[k+3]=-45
        self.assertEqual(detect_events(voltage,.05),[80,220,360])

    def test_threshold_crossing_without_positive_peak_not_a_spike(self):
        voltage=[-70.0]*120
        voltage[30]=-16
        voltage[31]=-25
        self.assertEqual(detect_events(voltage,.05),[])

    def test_refractory_suppresses_duplicate_crossings(self):
        voltage=[-70.0]*200
        for k in [50,55,120]:
            voltage[k]=-12
            voltage[k+1]=20
            voltage[k+2]=-60
        self.assertEqual(detect_events(voltage,.05),[50,120])

    def test_rejects_empty_or_invalid_timebase(self):
        with self.assertRaises(ValueError):detect_events([],.04)
        with self.assertRaises(ValueError):detect_events([-65,0],0)


if __name__=='__main__':unittest.main()
