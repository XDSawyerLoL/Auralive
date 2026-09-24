from __future__ import annotations

from typing import Any


class CounterfactualWorldModel:
    """Mini world-model déterministe d'AURA.

    Il ne prétend pas prédire le monde entier. Il compare plusieurs politiques
    avant une action avec le même compromis valeur / information / cohérence /
    risque / coût utilisé par l'active inference.
    """

    VERSION = "aura-counterfactual-world-model-v1"

    RISK = {
        "safe": 0.04,
        "ai": 0.06,
        "network": 0.16,
        "local-write": 0.24,
        "process": 0.34,
        "twitch-write": 0.28,
        "obs-write": 0.24,
        "moderation": 0.46,
        "local-control": 0.30,
    }

    @staticmethod
    def _clamp(value: float) -> float:
        return max(0.0, min(1.0, float(value)))

    def forecast_policy(
        self,
        organism: dict[str, Any],
        *,
        uncertainty: float,
        explicit_mission: bool = False,
    ) -> dict[str, Any]:
        stability = float(organism.get("stabilite", 0.7) or 0.7)
        clarity = float(organism.get("clarte", 0.7) or 0.7)
        silence = float(organism.get("besoin_de_silence", 0.0) or 0.0)

        verify_score = (
            uncertainty * 0.48
            + (1 - clarity) * 0.24
            + (1 - stability) * 0.18
            + (0.04 if explicit_mission else 0.10)
        )
        direct_score = (
            clarity * 0.34
            + stability * 0.30
            + (0.28 if explicit_mission else 0.12)
            - uncertainty * 0.16
        )
        wait_score = (
            silence * 0.26
            + (1 - stability) * 0.14
            + (0.16 if not explicit_mission else -0.18)
        )

        scores = {
            "direct": round(direct_score, 4),
            "verify_first": round(verify_score, 4),
            "wait_for_signal": round(wait_score, 4),
        }
        selected = max(scores, key=scores.get)
        if explicit_mission and selected == "wait_for_signal":
            selected = "verify_first"
        return {
            "version": self.VERSION,
            "selected": selected,
            "scores": scores,
            "reason": (
                "mission explicite : agir avec vérification proportionnée"
                if explicit_mission
                else "comparaison contre-factuelle de politiques"
            ),
        }

    def forecast_action(
        self,
        action: dict[str, Any],
        *,
        organism: dict[str, Any],
        uncertainty: float,
    ) -> dict[str, Any]:
        risk_class = str(action.get("risk") or "safe").casefold()
        risk = self.RISK.get(risk_class, 0.35)
        name = str(action.get("name") or action.get("type") or "")
        info_gain = 0.22
        if any(token in name for token in ("get", "read", "status", "search", "discover", "context")):
            info_gain = 0.72
        elif risk_class == "network":
            info_gain = 0.48

        stability = float(organism.get("stabilite", 0.7) or 0.7)
        clarity = float(organism.get("clarte", 0.7) or 0.7)
        coherence = self._clamp((stability + clarity) / 2)
        compute_cost = 0.08 if risk_class in {"safe", "ai"} else 0.16
        value = 0.66 if risk < 0.3 else 0.58

        score = (
            value
            + 0.35 * info_gain
            + 0.30 * coherence
            - 0.55 * risk
            - 0.25 * compute_cost
            - 0.08 * uncertainty
        )
        return {
            "action": name,
            "risk_class": risk_class,
            "risk": round(risk, 4),
            "information_gain": round(info_gain, 4),
            "coherence": round(coherence, 4),
            "compute_cost": round(compute_cost, 4),
            "score": round(score, 4),
        }

    def forecast_plan(
        self,
        actions: list[dict[str, Any]],
        *,
        organism: dict[str, Any],
        uncertainty: float,
    ) -> dict[str, Any]:
        forecasts = [
            self.forecast_action(
                action,
                organism=organism,
                uncertainty=uncertainty,
            )
            for action in actions
        ]
        aggregate = (
            sum(item["score"] for item in forecasts) / len(forecasts)
            if forecasts
            else 0.0
        )
        return {
            "version": self.VERSION,
            "actions": forecasts,
            "aggregate_score": round(aggregate, 4),
            "high_risk_actions": [
                item["action"] for item in forecasts if item["risk"] >= 0.4
            ],
        }
