from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any


class ModelScorecard:
    """Mémoire locale des performances des modèles AURA.

    Les mesures sont conservées par modèle ET par rôle. Le routeur peut ainsi
    apprendre qu'un modèle est fiable pour le code mais moins bon pour une
    autre classe de tâches. Le score reste borné : l'historique améliore le
    routage sans pouvoir écraser complètement le profil statique du modèle.
    """

    VERSION = "aura-model-scorecard-v1"

    def __init__(self, path: str | Path | None = None, *, exploration: float = 0.08):
        self.path = Path(path) if path else None
        self.exploration = max(0.0, min(float(exploration or 0.0), 0.2))
        self.models: dict[str, dict[str, dict[str, Any]]] = {}
        self.total_calls = 0
        self.loaded = False

    @staticmethod
    def _key(value: str) -> str:
        return str(value or "").strip().casefold()

    def load(self) -> None:
        if self.loaded:
            return
        self.loaded = True
        if not self.path or not self.path.is_file():
            return
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            return
        raw_models = payload.get("models") if isinstance(payload, dict) else None
        if not isinstance(raw_models, dict):
            return
        clean: dict[str, dict[str, dict[str, Any]]] = {}
        total = 0
        for model, roles in raw_models.items():
            if not isinstance(roles, dict):
                continue
            model_key = self._key(model)
            if not model_key:
                continue
            clean[model_key] = {}
            for role, row in roles.items():
                if not isinstance(row, dict):
                    continue
                calls = max(0, int(row.get("calls") or 0))
                successes = max(0, min(calls, int(row.get("successes") or 0)))
                failures = max(0, min(calls, int(row.get("failures") or max(0, calls - successes))))
                quality_samples = max(0, int(row.get("quality_samples") or 0))
                clean[model_key][self._key(role) or "general"] = {
                    "calls": calls,
                    "successes": successes,
                    "failures": failures,
                    "ema_latency_ms": max(0.0, float(row.get("ema_latency_ms") or 0.0)),
                    "ema_quality": max(0.0, min(1.0, float(row.get("ema_quality") or 0.5))),
                    "quality_samples": quality_samples,
                    "last_source": str(row.get("last_source") or "")[:80],
                }
                total += calls
        self.models = clean
        self.total_calls = total

    def _persist(self) -> None:
        if not self.path:
            return
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temp = self.path.with_suffix(self.path.suffix + ".tmp")
            temp.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "scorecard_version": self.VERSION,
                        "total_calls": self.total_calls,
                        "models": self.models,
                    },
                    ensure_ascii=False,
                    indent=2,
                    sort_keys=True,
                ),
                encoding="utf-8",
            )
            temp.replace(self.path)
        except Exception:
            # La télémétrie ne doit jamais empêcher AURA de répondre.
            return

    def _bucket(self, model: str, role: str) -> dict[str, Any]:
        self.load()
        model_key = self._key(model)
        role_key = self._key(role) or "general"
        roles = self.models.setdefault(model_key, {})
        return roles.setdefault(
            role_key,
            {
                "calls": 0,
                "successes": 0,
                "failures": 0,
                "ema_latency_ms": 0.0,
                "ema_quality": 0.5,
                "quality_samples": 0,
                "last_source": "",
            },
        )

    def record(
        self,
        model: str,
        role: str,
        *,
        success: bool,
        latency_ms: int | float = 0,
        quality: float | None = None,
        source: str = "inference",
    ) -> None:
        if not self._key(model):
            return
        row = self._bucket(model, role)
        row["calls"] = int(row["calls"]) + 1
        row["successes"] = int(row["successes"]) + (1 if success else 0)
        row["failures"] = int(row["failures"]) + (0 if success else 1)
        elapsed = max(0.0, float(latency_ms or 0.0))
        if elapsed > 0:
            previous = float(row.get("ema_latency_ms") or 0.0)
            row["ema_latency_ms"] = elapsed if previous <= 0 else previous * 0.8 + elapsed * 0.2
        if quality is not None:
            measured = max(0.0, min(1.0, float(quality)))
            previous = float(row.get("ema_quality") or 0.5)
            samples = int(row.get("quality_samples") or 0)
            row["ema_quality"] = measured if samples <= 0 else previous * 0.8 + measured * 0.2
            row["quality_samples"] = samples + 1
        row["last_source"] = str(source or "")[:80]
        self.total_calls += 1
        self._persist()

    def metrics(self, model: str, role: str) -> dict[str, Any]:
        self.load()
        model_key = self._key(model)
        role_key = self._key(role) or "general"
        row = dict(self.models.get(model_key, {}).get(role_key, {}))
        calls = max(0, int(row.get("calls") or 0))
        successes = max(0, int(row.get("successes") or 0))
        # Beta(1,1) évite de sur-récompenser un modèle après un seul succès.
        success_rate = (successes + 1) / (calls + 2)
        latency = max(0.0, float(row.get("ema_latency_ms") or 0.0))
        quality_samples = max(0, int(row.get("quality_samples") or 0))
        quality = max(0.0, min(1.0, float(row.get("ema_quality") or 0.5)))

        reliability_bonus = max(-0.16, min(0.16, (success_rate - 0.5) * 0.32))
        quality_bonus = (
            max(-0.18, min(0.18, (quality - 0.5) * 0.36))
            if quality_samples > 0
            else 0.0
        )
        if latency <= 0:
            latency_bonus = 0.0
        elif latency <= 1500:
            latency_bonus = 0.08
        elif latency <= 4000:
            latency_bonus = 0.04
        elif latency >= 15000:
            latency_bonus = -0.10
        else:
            latency_bonus = 0.0

        exploration_bonus = 0.0
        if self.exploration > 0:
            exploration_bonus = min(
                0.18,
                self.exploration * math.sqrt(math.log(self.total_calls + 2) / (calls + 1)),
            )
        learned_bonus = reliability_bonus + quality_bonus + latency_bonus
        return {
            "calls": calls,
            "successes": successes,
            "failures": max(0, int(row.get("failures") or 0)),
            "success_rate": round(success_rate, 4),
            "ema_latency_ms": round(latency, 1),
            "ema_quality": round(quality, 4),
            "quality_samples": quality_samples,
            "learned_bonus": round(learned_bonus, 4),
            "exploration_bonus": round(exploration_bonus, 4),
            "last_source": str(row.get("last_source") or ""),
        }

    def snapshot(self) -> dict[str, Any]:
        self.load()
        return {
            "version": self.VERSION,
            "total_calls": self.total_calls,
            "models": self.models,
        }
