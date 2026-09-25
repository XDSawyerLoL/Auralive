from __future__ import annotations

import math
from typing import Any


class ActiveInferenceEngine:
    """Petit noyau mathématique d'allocation de calcul et de décision.

    Il ne remplace pas le noyau AURA. Il mesure l'incertitude du champ
    d'intentions, la surprise et le compromis valeur/information/risque/coût.
    """

    VERSION = "aura-active-inference-v1.1"

    @staticmethod
    def _softmax(values: list[float], temperature: float = 0.18) -> list[float]:
        if not values:
            return []
        t = max(0.03, float(temperature))
        peak = max(values)
        exps = [math.exp((value - peak) / t) for value in values]
        total = sum(exps) or 1.0
        return [value / total for value in exps]

    def normalized_entropy(self, potentials: dict[str, float]) -> float:
        values = [float(value) for value in potentials.values() if math.isfinite(float(value))]
        if len(values) <= 1:
            return 0.0
        probs = self._softmax(values)
        entropy = -sum(p * math.log(max(p, 1e-12)) for p in probs)
        maximum = math.log(len(probs))
        return max(0.0, min(1.0, entropy / maximum if maximum else 0.0))

    @staticmethod
    def surprise(prior_probability: float) -> float:
        probability = max(1e-9, min(1.0, float(prior_probability)))
        # Normalisé : p=1 -> 0 ; p~0.001 -> proche de 1.
        return max(0.0, min(1.0, -math.log(probability) / 7.0))

    @staticmethod
    def information_gain(
        posterior: dict[str, float],
        prior: dict[str, float],
    ) -> float:
        keys = set(posterior) | set(prior)
        if not keys:
            return 0.0
        total = 0.0
        for key in keys:
            p = max(1e-9, float(posterior.get(key, 1e-9)))
            q = max(1e-9, float(prior.get(key, 1e-9)))
            total += p * math.log(p / q)
        return max(0.0, min(1.0, total / 6.0))

    @staticmethod
    def score_plan(
        *,
        value: float,
        information_gain: float,
        coherence: float,
        risk: float,
        compute_cost: float,
        alpha: float = 0.35,
        beta: float = 0.30,
        gamma: float = 0.55,
        delta: float = 0.25,
    ) -> float:
        score = (
            float(value)
            + alpha * float(information_gain)
            + beta * float(coherence)
            - gamma * float(risk)
            - delta * float(compute_cost)
        )
        return round(score, 6)

    def assess(
        self,
        organism: dict[str, Any],
        *,
        novelty: float = 0.0,
        risk: float = 0.0,
    ) -> dict[str, Any]:
        field = organism.get("intention_field") if isinstance(organism, dict) else {}
        potentials = (
            field.get("potentials")
            if isinstance(field, dict) and isinstance(field.get("potentials"), dict)
            else {}
        )
        uncertainty = self.normalized_entropy(
            {str(k): float(v) for k, v in potentials.items()}
        )
        clarity = float(organism.get("clarte", 0.7) or 0.7)
        stability = float(organism.get("stabilite", 0.7) or 0.7)
        novelty = max(0.0, min(1.0, float(novelty)))
        risk = max(0.0, min(1.0, float(risk)))

        # L'entropie brute du champ d'intentions est naturellement élevée
        # parce qu'AURA garde plusieurs intentions concurrentes actives. Elle ne doit
        # donc pas, à elle seule, déclencher un gros modèle. La nouveauté et le risque
        # pèsent davantage dans l'escalade de calcul.
        difficulty = (
            uncertainty * 0.18
            + (1.0 - clarity) * 0.18
            + (1.0 - stability) * 0.12
            + novelty * 0.30
            + risk * 0.22
        )

        if difficulty < 0.16:
            tier = "native"
            model_role = "fast"
            budget = 0
        elif difficulty < 0.45:
            tier = "fast"
            model_role = "conversation"
            budget = 180
        elif difficulty < 0.72:
            tier = "deep"
            model_role = "reasoning"
            budget = 700
        else:
            tier = "verified"
            model_role = "critic"
            budget = 1000

        return {
            "version": self.VERSION,
            "uncertainty": round(uncertainty, 4),
            "belief_clarity": round(1.0 - uncertainty, 4),
            "difficulty": round(difficulty, 4),
            "novelty": round(novelty, 4),
            "risk": round(risk, 4),
            "compute_tier": tier,
            "model_role": model_role,
            "token_budget": budget,
        }
