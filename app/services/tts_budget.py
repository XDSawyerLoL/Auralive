from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.services.voice_signature import install_voice_signature

_AUDIO_USD_PER_SECOND = 20.0 * 25.0 / 1_000_000.0


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().casefold() in {"1", "true", "yes", "oui", "on"}


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _estimate_seconds(text: str) -> float:
    words = max(1, len(str(text or "").split()))
    return max(1.2, words / 2.55 + 0.45)


class TTSBudgetGuard:
    """Plafond conservateur basé sur le tarif payant Gemini TTS 3.1 Flash."""

    def __init__(self, audio: Any):
        self.audio = audio
        self.path = Path(audio.output_dir) / "usage.json"
        self.enabled = _bool_env("TTS_BUDGET_ENABLED", True)
        self.daily_limit_usd = max(0.0, _float_env("TTS_MAX_DAILY_USD", 0.50))
        self.last_block_reason = ""
        self._original_gemini = audio._synthesize_gemini
        self._original_diagnostic = audio.diagnostic

    def _today(self) -> str:
        return datetime.now(timezone.utc).date().isoformat()

    def _load(self) -> dict[str, Any]:
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            if payload.get("date") == self._today():
                return payload
        except Exception:
            pass
        return {"date": self._today(), "seconds": 0.0, "estimated_usd": 0.0, "requests": 0}

    def _save(self, payload: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    async def guarded_gemini(self, text: str, **kwargs: Any) -> str | None:
        usage = self._load()
        predicted_seconds = _estimate_seconds(text)
        predicted_cost = predicted_seconds * _AUDIO_USD_PER_SECOND
        if (
            self.enabled
            and self.daily_limit_usd > 0
            and float(usage.get("estimated_usd", 0.0)) + predicted_cost > self.daily_limit_usd
        ):
            self.last_block_reason = (
                f"Plafond Gemini TTS atteint ({self.daily_limit_usd:.2f} USD/jour); "
                "bascule automatique sur la voix Windows"
            )
            self.audio.last_provider_error = self.last_block_reason
            self.audio.last_error = self.last_block_reason
            return None

        result = await self._original_gemini(text, **kwargs)
        if result:
            actual_seconds = max(
                predicted_seconds,
                float(getattr(self.audio, "last_audio_duration_ms", 0) or 0) / 1000.0,
            )
            usage["seconds"] = round(float(usage.get("seconds", 0.0)) + actual_seconds, 3)
            usage["estimated_usd"] = round(usage["seconds"] * _AUDIO_USD_PER_SECOND, 6)
            usage["requests"] = int(usage.get("requests", 0)) + 1
            self._save(usage)
            self.last_block_reason = ""
        return result

    def diagnostic(self) -> dict[str, Any]:
        result = self._original_diagnostic()
        usage = self._load()
        result["budget"] = {
            "enabled": self.enabled,
            "daily_limit_usd": self.daily_limit_usd,
            "estimated_usd_today": round(float(usage.get("estimated_usd", 0.0)), 4),
            "audio_minutes_today": round(float(usage.get("seconds", 0.0)) / 60.0, 2),
            "requests_today": int(usage.get("requests", 0)),
            "paid_rate_estimate_usd_per_minute": round(_AUDIO_USD_PER_SECOND * 60.0, 4),
            "remaining_usd": round(max(0.0, self.daily_limit_usd - float(usage.get("estimated_usd", 0.0))), 4),
            "last_block_reason": self.last_block_reason,
            "note": "Estimation conservatrice au tarif payant; le niveau gratuit peut facturer 0 USD.",
        }
        return result


def install_tts_budget(audio: Any) -> TTSBudgetGuard:
    existing = getattr(audio, "budget_guard", None)
    if existing:
        return existing
    install_voice_signature(audio)
    guard = TTSBudgetGuard(audio)
    audio.budget_guard = guard
    audio._synthesize_gemini = guard.guarded_gemini
    audio.diagnostic = guard.diagnostic
    return guard
