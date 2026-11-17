"""Preregistered action-potential fidelity metrics for real Allen NWB comparisons.

This module does not fit ion channels. It evaluates voltage traces from
measured human cells against frozen NEURON predictions; synthetic traces
are used ONLY as offline unit test fixtures.

A matching tolerance is explicitly stated (default +/- 3 ms). Zero-spike
sweeps cannot demonstrate fidelity of an active neuron, even at 0 RMSE.
"""
import math
from run_human_active_hh_control import detect_events

SCHEMA = 'aura-human-ephys-fidelity-v1'


def _round(x):
    return round(x, 6)


def assess_active_fidelity(observed, predicted, dt_ms, *,
                           matching_tolerance_ms=3,
                           spike_exclusion_ms=3):
    if not isinstance(observed, (tuple, list)) or not isinstance(predicted, (tuple, list)):
        raise TypeError('two voltage traces required')
    if not 20 <= len(observed) <= 50000 or len(predicted) != len(observed):
        raise ValueError('aligned research voltage samples required')
    if (isinstance(dt_ms, bool) or not isinstance(dt_ms, (float, int))
            or not math.isfinite(dt_ms) or not .01 <= dt_ms <= .1):
        raise ValueError('dt_ms outside measured acquisition limits')
    if (not all(isinstance(v, (float, int)) and not isinstance(v, bool)
                and math.isfinite(v) and -150 <= v <= 100 for v in observed)
        or not all(isinstance(v, (float, int)) and not isinstance(v, bool)
                and math.isfinite(v) and -250 <= v <= 250 for v in predicted)):
        raise ValueError('voltage outside finite patch-clamp/simulation bounds')
    if (not isinstance(matching_tolerance_ms, (int, float)) or
        not .5 <= matching_tolerance_ms <= 10 or
        not isinstance(spike_exclusion_ms, (int, float)) or
        not 1 <= spike_exclusion_ms <= 10):
        raise ValueError('invalid preregistered timing tolerances')
    events_observed = detect_events(observed, dt_ms)
    events_predicted = detect_events(predicted, dt_ms)

    # Monotone two-pointer one-to-one matching is optimal for the number
    # of matches with a fixed absolute time tolerance in ordered series.
    i = j = 0
    matches = []
    tol = matching_tolerance_ms / dt_ms
    while i < len(events_observed) and j < len(events_predicted):
        obs, pred = events_observed[i], events_predicted[j]
        if abs(obs - pred) <= tol + 1e-9:
            matches.append((obs, pred))
            i += 1
            j += 1
        elif pred < obs:
            j += 1
        else:
            i += 1

    tp = len(matches)
    fp = len(events_predicted) - tp
    fn = len(events_observed) - tp
    # Undefined values remain null; a no-spike sweep is not proof of
    # biophysical action potential accuracy.
    precision = (tp / len(events_predicted)) if events_predicted else None
    recall = (tp / len(events_observed)) if events_observed else None
    if events_observed and events_predicted:
        f1 = (2 * tp / (2 * tp + fp + fn)) if (2 * tp + fp + fn) else None
    elif events_observed:
        f1 = 0.0
    elif events_predicted:
        f1 = 0.0
    else:
        f1 = None

    diffs = [pred - obs for obs, pred in zip(observed, predicted)]
    rmse = math.sqrt(sum(v * v for v in diffs) / len(diffs))
    mae = sum(abs(v) for v in diffs) / len(diffs)
    # Mask BOTH measured and predicted spike neighborhoods to avoid
    # rewarding a model whose spikes simply drift outside the reference.
    margin = math.ceil(spike_exclusion_ms / dt_ms)
    mask = bytearray(b'\x01') * len(observed)
    for event in events_observed + events_predicted:
        low = max(0, event - margin)
        high = min(len(observed), event + margin + 1)
        mask[low:high] = b'\x00' * (high - low)
    residuals = [v for v, permitted in zip(diffs, mask) if permitted]
    sub_rmse = (math.sqrt(sum(v * v for v in residuals) / len(residuals))
                if residuals else None)

    errors_ms = [(pred - obs) * dt_ms for obs, pred in matches]
    timing_mae = (sum(abs(x) for x in errors_ms) / len(errors_ms)
                  if errors_ms else None)
    first_latency_err = ((events_predicted[0] - events_observed[0]) * dt_ms
                         if events_observed and events_predicted else None)

    def mean_isi_cv(indices):
        if len(indices) < 3:
            return None
        intervals = [(b - a) * dt_ms for a, b in zip(indices, indices[1:])]
        mean = sum(intervals) / len(intervals)
        return math.sqrt(sum((x - mean)**2 for x in intervals) /
                         len(intervals)) / mean if mean else None

    # Peak slope and overshoot are descriptive; unmatched waveform peaks
    # must NOT be represented as a reconstructed human AP.
    observed_dvdt = max((observed[k] - observed[k - 1]) / dt_ms
                        for k in range(1, len(observed)))
    predicted_dvdt = max((predicted[k] - predicted[k - 1]) / dt_ms
                         for k in range(1, len(predicted)))
    # Screening gate is a PREDECLARED research diagnostic, not a human
    # physiological equivalence certification. A quiescent control cannot
    # pass even with identical voltages.
    screen = (len(events_observed) >= 2 and len(events_predicted) >= 2
              and f1 is not None and f1 >= .8
              and timing_mae is not None and timing_mae <= 2
              and rmse <= 10
              and sub_rmse is not None and sub_rmse <= 8
              and abs(max(observed)-max(predicted)) <= 15)
    return {
        'phenomenological_screen_passed': bool(screen),
        'screen_thresholds': {'min_recorded_spikes': 2, 'min_predicted_spikes': 2,
                              'event_f1_min': .8, 'timing_mae_max_ms': 2,
                              'voltage_rmse_max_mV': 10,
                              'subthreshold_rmse_max_mV': 8,
                              'absolute_peak_voltage_error_max_mV': 15},
        'screen_is_biological_equivalence_certificate': False,
        'schema': SCHEMA,
        'samples': len(observed),
        'dt_ms': dt_ms,
        'event_detector': 'upward -20mV crossing, positive 2ms overshoot, 2ms refractory',
        'matching_tolerance_ms': matching_tolerance_ms,
        'spike_exclusion_ms': spike_exclusion_ms,
        'observed_spikes': len(events_observed),
        'predicted_spikes': len(events_predicted),
        'matched_spikes': tp,
        'false_positive_spikes': fp,
        'missed_spikes': fn,
        'event_precision': _round(precision) if precision is not None else None,
        'event_recall': _round(recall) if recall is not None else None,
        'event_f1': _round(f1) if f1 is not None else None,
        'timing_mae_ms': _round(timing_mae) if timing_mae is not None else None,
        'first_spike_latency_error_ms': (_round(first_latency_err)
                                         if first_latency_err is not None else None),
        'observed_isi_cv': (_round(mean_isi_cv(events_observed))
                            if mean_isi_cv(events_observed) is not None else None),
        'predicted_isi_cv': (_round(mean_isi_cv(events_predicted))
                             if mean_isi_cv(events_predicted) is not None else None),
        'voltage_rmse_mV': _round(rmse),
        'voltage_mae_mV': _round(mae),
        'subthreshold_rmse_mV': _round(sub_rmse) if sub_rmse is not None else None,
        'subthreshold_fraction': _round(len(residuals) / len(observed)),
        'observed_max_dvdt_mV_per_ms': _round(observed_dvdt),
        'predicted_max_dvdt_mV_per_ms': _round(predicted_dvdt),
        'observed_peak_mV': _round(max(observed)),
        'predicted_peak_mV': _round(max(predicted)),
        'active_firing_validated': False,
        'metrics_from_real_data_verified_here': False,
        'comparison_not_genome_or_brain_equivalence': True,
        'raw_voltage_exported': False,
    }
