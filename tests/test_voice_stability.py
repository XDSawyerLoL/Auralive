from __future__ import annotations

import io
import math
import wave
from array import array

from app.services.voice_stability import (
    _is_hands_free,
    _normalize_wav_level,
    _wav_duration_ms,
)


def test_hands_free_detection() -> None:
    assert _is_hands_free("audio/wav; mode=handsfree", False) is True
    assert _is_hands_free("audio/wav", True) is True
    assert _is_hands_free("audio/wav", False) is False


def test_wav_duration_is_read_from_file(tmp_path) -> None:
    path = tmp_path / "voice.wav"
    rate = 24_000
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(b"\x00\x00" * rate)

    assert 990 <= _wav_duration_ms(path) <= 1010


def _wav_with_peak(peak: float, rate: int = 16_000) -> bytes:
    samples = array(
        "h",
        (
            round(math.sin(index / 18) * peak * 32767)
            for index in range(rate)
        ),
    )
    target = io.BytesIO()
    with wave.open(target, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(samples.tobytes())
    return target.getvalue()


def test_weak_voice_is_normalized() -> None:
    original = _wav_with_peak(0.08)
    normalized, peak, gain = _normalize_wav_level(original)

    assert normalized.startswith(b"RIFF")
    assert 0.07 <= peak <= 0.09
    assert gain > 1.0
    assert len(normalized) == len(original)


def test_near_silence_is_not_amplified() -> None:
    original = _wav_with_peak(0.003)
    normalized, peak, gain = _normalize_wav_level(original)

    assert normalized == original
    assert peak < 0.008
    assert gain == 1.0
