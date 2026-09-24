from __future__ import annotations

import json
import re
from typing import Any

from app.database import Database, utcnow


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


class RelationalSignalEngine:
    """Proto-empathie calibrée et non diagnostique.

    Le moteur estime uniquement des signaux conversationnels observables
    (valence, engagement, urgence linguistique, incertitude, correction).
    Il ne prétend pas lire l'esprit ni diagnostiquer une émotion/condition.
    """

    VERSION = "aura-relational-signals-v1"

    def __init__(self, db: Database):
        self.db = db

    async def initialize(self) -> None:
        await self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS aura_relational_state (
                participant TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                interactions INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            );
            """
        )

    @staticmethod
    def analyze(text: str) -> dict[str, Any]:
        raw = " ".join(str(text or "").split()).strip()
        q = raw.casefold()
        words = re.findall(r"[\wÀ-ÿ'-]+", q)

        positive = sum(
            token in q
            for token in ("merci", "super", "parfait", "content", "heureux", "bravo", "aime", "génial", "genial")
        )
        negative = sum(
            token in q
            for token in ("bug", "erreur", "problème", "probleme", "nul", "déçu", "decu", "énerv", "enerve", "triste")
        )
        corrections = sum(
            token in q
            for token in ("non", "pas ça", "pas ca", "tu te trompes", "c'est faux", "rien à voir", "rien a voir")
        )
        uncertainty = sum(
            token in q
            for token in ("peut-être", "peut etre", "je pense", "je crois", "pas sûr", "pas sur", "?", "j'hésite", "j hesite")
        )
        urgency = sum(
            token in q
            for token in ("vite", "urgent", "maintenant", "tout de suite", "immédiat", "immediat", "bloqué", "bloque")
        )
        exclamations = raw.count("!")
        engagement = _clamp(min(len(words), 80) / 80 + min(raw.count("?"), 3) * 0.08)
        valence = _clamp(0.5 + (positive - negative) * 0.12)
        return {
            "valence": round(valence, 4),
            "engagement": round(engagement, 4),
            "correction_signal": round(_clamp(corrections * 0.28), 4),
            "uncertainty_signal": round(_clamp(uncertainty * 0.18), 4),
            "urgency_signal": round(_clamp(urgency * 0.25 + exclamations * 0.04), 4),
            "confidence": round(_clamp(0.42 + min(len(words), 50) / 160), 4),
            "basis": "surface-language-signals-only",
        }

    async def observe(self, participant: str, text: str) -> dict[str, Any]:
        key = " ".join(str(participant or "Utilisateur").split()).strip()[:160]
        current_row = await self.db.fetchone(
            "SELECT state,interactions FROM aura_relational_state WHERE participant=?",
            (key,),
        )
        current: dict[str, Any] = {}
        if current_row:
            try:
                current = json.loads(str(current_row.get("state") or "{}"))
            except json.JSONDecodeError:
                current = {}

        observed = self.analyze(text)
        interactions = int((current_row or {}).get("interactions") or 0) + 1
        alpha = 0.35 if interactions < 6 else 0.18
        state: dict[str, Any] = {
            "version": self.VERSION,
            "participant": key,
            "interactions": interactions,
            "updated_at": utcnow(),
            "basis": "conversation-observation-not-mind-reading",
        }
        for name in (
            "valence",
            "engagement",
            "correction_signal",
            "uncertainty_signal",
            "urgency_signal",
        ):
            previous = float(current.get(name, observed[name]) or observed[name])
            state[name] = round(
                _clamp(previous * (1 - alpha) + float(observed[name]) * alpha),
                4,
            )
        state["confidence"] = observed["confidence"]

        await self.db.execute(
            """
            INSERT INTO aura_relational_state(participant,state,interactions,updated_at)
            VALUES(?,?,?,?)
            ON CONFLICT(participant) DO UPDATE SET
                state=excluded.state,
                interactions=excluded.interactions,
                updated_at=excluded.updated_at
            """,
            (key, json.dumps(state, ensure_ascii=False), interactions, state["updated_at"]),
        )
        return state

    @staticmethod
    def response_guidance(state: dict[str, Any]) -> str:
        parts: list[str] = []
        if float(state.get("correction_signal", 0)) >= 0.34:
            parts.append("corriger clairement l'incohérence avant d'ajouter de nouvelles informations")
        if float(state.get("urgency_signal", 0)) >= 0.38:
            parts.append("répondre de façon très directe et opérationnelle")
        if float(state.get("uncertainty_signal", 0)) >= 0.30:
            parts.append("distinguer les faits établis des hypothèses")
        if float(state.get("engagement", 0)) >= 0.55:
            parts.append("préserver la continuité du sujet sans répétitions")
        return "; ".join(parts) or "réponse naturelle, concise et adaptée au contexte"
