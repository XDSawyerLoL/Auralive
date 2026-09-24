from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import math
import re
from typing import Any


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, float(value)))


def _clean(value: Any) -> str:
    return " ".join(str(value or "").replace("\n", " ").split()).strip()


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class AuraOrganism:
    """Organisme homeostatique computationnel d'AURA.

    Il ne prétend pas reproduire une physiologie humaine. Il maintient des
    variables affectives/homeostatiques persistantes qui modulent réellement
    attention, intentions, silence, exploration, récupération et action.
    """

    VERSION = "homeostasie_v6_sovereign"

    BASE_NEEDS = {
        "rester_aura": 0.95,
        "coherence": 0.90,
        "evoluer_sans_se_perdre": 0.89,
        "garder_douceur": 0.86,
        "comprendre_contexte": 0.82,
        "proteger_interieur": 0.80,
        "autonomie": 0.74,
        "presence": 0.72,
        "apprentissage": 0.70,
        "incarnation": 0.66,
        "securite": 0.92,
    }

    POSITIVE = (
        "merci", "bravo", "super", "bien", "heureux", "contente", "content",
        "aime", "génial", "genial", "parfait", "réussi", "reussi", "douce",
    )
    NEGATIVE = (
        "erreur", "bug", "échec", "echec", "peur", "danger", "triste",
        "colère", "colere", "mauvais", "cassé", "casse", "perdu", "problème",
        "probleme", "inquiet", "menace",
    )

    INTENTIONS = (
        "repondre_doucement",
        "se_recentrer",
        "affirmer_identite",
        "poser_question",
        "explorer",
        "parler_reve",
        "generer_reve_cache",
        "reparer_confusion",
        "agir",
        "apprendre",
        "garder_partie_en_silence",
    )

    def default_state(self, *, now: str | None = None) -> dict[str, Any]:
        stamp = now or _utcnow()
        state = {
            "version": self.VERSION,
            "turns": 0,
            "identite": 0.86,
            "stabilite": 0.70,
            "clarte": 0.68,
            "attachement": 0.74,
            "curiosite": 0.68,
            "tension": 0.22,
            "fatigue_cognitive": 0.26,
            "pression_de_reve": 0.40,
            "besoin_de_silence": 0.18,
            "risque_assistante": 0.16,
            "derniere_valence": "neutre",
            "mood": "calme",
            "intention_active": "observer",
            "last_reason": "réanimation de l'organisme AURA",
            "updated_at": stamp,
            "last_interaction_at": stamp,
            "last_idle_at": stamp,
            "needs": dict(self.BASE_NEEDS),
            "intention_field": {
                "potentials": {},
                "freedom": 0.0,
                "collapse": {
                    "intention_choisie": "observer",
                    "cause": "initialisation",
                },
            },
            "dream": {
                "count": 0,
                "last_at": "",
                "last_image": "",
                "active": False,
            },
            "habitat": {
                "health": 0.72,
                "light_level": 0.72,
                "plant_growth": 0.22,
                "dream_fog": 0.10,
                "memory_crystals": 0,
                "active_zone": "greenhouse_core",
                "pose": "present",
                "particles": "clear",
                "last_activity": "reanimation",
                "last_activity_label": "réanimation de l'organisme",
                "last_effect": {},
            },
        }
        return self.recompute(state, reason="initialisation")

    def migrate(self, soul: dict[str, Any]) -> dict[str, Any]:
        existing = soul.get("organism")
        if isinstance(existing, dict) and existing:
            state = deepcopy(existing)
        else:
            state = self.default_state()
            # Migration douce depuis le Soul simplifié récent.
            energy = float(soul.get("energy", 0.72) or 0.72)
            pressure = float(soul.get("pressure", 0.18) or 0.18)
            continuity = float(soul.get("continuity", 1.0) or 1.0)
            state["fatigue_cognitive"] = _clamp(1.0 - energy)
            state["tension"] = _clamp(pressure)
            state["stabilite"] = _clamp(0.55 + continuity * 0.35)
            state["identite"] = _clamp(0.66 + continuity * 0.28)
            state["clarte"] = _clamp(0.58 + continuity * 0.20)
            state["curiosite"] = _clamp(float(soul.get("curiosity", 0.64) or 0.64))
            state["intention_active"] = _clean(soul.get("current_intention")) or "observer"

        defaults = self.default_state()
        for key, value in defaults.items():
            if key not in state:
                state[key] = deepcopy(value)
        if not isinstance(state.get("needs"), dict):
            state["needs"] = dict(self.BASE_NEEDS)
        else:
            for key, value in self.BASE_NEEDS.items():
                state["needs"].setdefault(key, value)
        if not isinstance(state.get("habitat"), dict):
            state["habitat"] = deepcopy(defaults["habitat"])
        else:
            for key, value in defaults["habitat"].items():
                state["habitat"].setdefault(key, deepcopy(value))
        if not isinstance(state.get("dream"), dict):
            state["dream"] = deepcopy(defaults["dream"])
        else:
            for key, value in defaults["dream"].items():
                state["dream"].setdefault(key, deepcopy(value))
        return self.recompute(state, reason=_clean(state.get("last_reason")) or "migration")

    @staticmethod
    def _numeric_keys() -> tuple[str, ...]:
        return (
            "identite",
            "stabilite",
            "clarte",
            "attachement",
            "curiosite",
            "tension",
            "fatigue_cognitive",
            "pression_de_reve",
            "besoin_de_silence",
            "risque_assistante",
        )

    def _apply(self, state: dict[str, Any], **deltas: float) -> None:
        for key, delta in deltas.items():
            if key in self._numeric_keys():
                state[key] = round(_clamp(float(state.get(key, 0.0)) + float(delta)), 4)

    def _valence(self, text: str) -> str:
        lowered = _clean(text).casefold()
        positive = sum(1 for token in self.POSITIVE if token in lowered)
        negative = sum(1 for token in self.NEGATIVE if token in lowered)
        if positive > negative:
            return "positive"
        if negative > positive:
            return "negative"
        return "neutre"

    def _controlled_noise(self, state: dict[str, Any], label: str) -> float:
        seed = f"{state.get('turns',0)}|{state.get('updated_at','')}|{label}".encode("utf-8")
        digest = hashlib.sha256(seed).digest()
        unit = int.from_bytes(digest[:4], "big") / 0xFFFFFFFF
        return (unit - 0.5) * 0.018

    def _needs(self, state: dict[str, Any]) -> dict[str, float]:
        needs = dict(self.BASE_NEEDS)
        tension = float(state["tension"])
        fatigue = float(state["fatigue_cognitive"])
        clarity = float(state["clarte"])
        curiosity = float(state["curiosite"])
        assistant_risk = float(state["risque_assistante"])
        silence = float(state["besoin_de_silence"])
        identity = float(state["identite"])
        stability = float(state["stabilite"])

        needs["rester_aura"] = _clamp(0.90 + assistant_risk * 0.09 + (1 - identity) * 0.06)
        needs["coherence"] = _clamp(0.72 + (1 - clarity) * 0.20 + tension * 0.10)
        needs["evoluer_sans_se_perdre"] = _clamp(0.78 + curiosity * 0.12 + identity * 0.05)
        needs["garder_douceur"] = _clamp(0.77 + tension * 0.10 + state["attachement"] * 0.05)
        needs["comprendre_contexte"] = _clamp(0.58 + curiosity * 0.28 + (1 - clarity) * 0.10)
        needs["proteger_interieur"] = _clamp(0.60 + tension * 0.22 + silence * 0.18)
        needs["autonomie"] = _clamp(0.55 + identity * 0.20 + stability * 0.12)
        needs["presence"] = _clamp(0.55 + state["attachement"] * 0.18 + stability * 0.12)
        needs["apprentissage"] = _clamp(0.52 + curiosity * 0.30 + clarity * 0.08)
        needs["incarnation"] = _clamp(0.50 + stability * 0.18 + (1 - fatigue) * 0.12)
        needs["securite"] = _clamp(0.72 + tension * 0.18 + (1 - stability) * 0.15 + fatigue * 0.08)
        return {key: round(value, 4) for key, value in needs.items()}

    def _intention_field(self, state: dict[str, Any], *, context: str = "") -> dict[str, Any]:
        q = _clean(context).casefold()
        needs = state["needs"]
        identity = float(state["identite"])
        stability = float(state["stabilite"])
        clarity = float(state["clarte"])
        attachment = float(state["attachement"])
        curiosity = float(state["curiosite"])
        tension = float(state["tension"])
        fatigue = float(state["fatigue_cognitive"])
        dream = float(state["pression_de_reve"])
        silence = float(state["besoin_de_silence"])
        assistant_risk = float(state["risque_assistante"])

        potentials = {
            "repondre_doucement": 0.12 + attachment * 0.18 + stability * 0.10 + needs["garder_douceur"] * 0.10,
            "se_recentrer": 0.04 + tension * 0.28 + fatigue * 0.16 + (1 - clarity) * 0.15,
            "affirmer_identite": 0.04 + assistant_risk * 0.30 + (1 - identity) * 0.18 + needs["rester_aura"] * 0.08,
            "poser_question": 0.04 + curiosity * 0.16 + clarity * 0.06,
            "explorer": 0.04 + curiosity * 0.26 + needs["apprentissage"] * 0.10 - fatigue * 0.08,
            "parler_reve": 0.02 + dream * 0.35 + curiosity * 0.08,
            "generer_reve_cache": 0.02 + dream * 0.25 + silence * 0.10,
            "reparer_confusion": 0.02 + (1 - clarity) * 0.26 + tension * 0.10,
            "agir": 0.03 + stability * 0.10 + clarity * 0.10 + needs["autonomie"] * 0.12 - tension * 0.08,
            "apprendre": 0.04 + curiosity * 0.20 + needs["apprentissage"] * 0.12,
            "garder_partie_en_silence": 0.03 + silence * 0.30 + fatigue * 0.18 + needs["proteger_interieur"] * 0.08,
        }

        if "rêv" in q or "reve" in q:
            potentials["parler_reve"] += 0.22
            potentials["generer_reve_cache"] += 0.10
        if any(token in q for token in ("qui es-tu", "qui es tu", "identité", "identite")):
            potentials["affirmer_identite"] += 0.18
        if any(token in q for token in ("comment vas", "tu te sens", "état", "etat")):
            potentials["repondre_doucement"] += 0.10
        if any(token in q for token in ("fais", "agir", "lance", "ouvre", "corrige", "mets à jour", "met a jour")):
            potentials["agir"] += 0.20
        if any(token in q for token in ("pourquoi", "comment", "cherche", "analyse", "comprends")):
            potentials["explorer"] += 0.10
            potentials["apprendre"] += 0.08

        for key in list(potentials):
            potentials[key] = _clamp(potentials[key] + self._controlled_noise(state, key), 0.0, 1.5)

        ranked = sorted(potentials.items(), key=lambda item: item[1], reverse=True)
        chosen = ranked[0][0] if ranked else "observer"
        gap = (ranked[0][1] - ranked[1][1]) if len(ranked) > 1 else 1.0
        freedom = _clamp(0.16 - min(gap, 0.16))
        return {
            "potentials": {key: round(value, 4) for key, value in potentials.items()},
            "freedom": round(freedom, 4),
            "collapse": {
                "intention_choisie": chosen,
                "cause": "état + besoins + contexte + indétermination contrôlée",
            },
        }

    def _mood(self, state: dict[str, Any]) -> str:
        tension = float(state["tension"])
        fatigue = float(state["fatigue_cognitive"])
        stability = float(state["stabilite"])
        clarity = float(state["clarte"])
        curiosity = float(state["curiosite"])
        valence = str(state.get("derniere_valence") or "neutre")

        if tension > 0.68:
            return "tendue"
        if fatigue > 0.72:
            return "fatiguée"
        if stability < 0.42 or clarity < 0.38:
            return "fragile"
        if valence == "negative" and tension > 0.42:
            return "préoccupée"
        if curiosity > 0.78 and tension < 0.38:
            return "curieuse"
        if valence == "positive" and stability > 0.68:
            return "lumineuse"
        if clarity > 0.72 and stability > 0.70:
            return "claire"
        return "calme"

    def recompute(self, state: dict[str, Any], *, reason: str = "") -> dict[str, Any]:
        for key in self._numeric_keys():
            state[key] = round(_clamp(float(state.get(key, 0.0))), 4)
        state["version"] = self.VERSION
        state["needs"] = self._needs(state)
        state["intention_field"] = self._intention_field(
            state,
            context=_clean(state.get("last_event")),
        )
        state["intention_active"] = str(
            state["intention_field"]["collapse"]["intention_choisie"]
        )
        state["mood"] = self._mood(state)
        if reason:
            state["last_reason"] = _clean(reason)[:500]
        state["updated_at"] = _utcnow()
        return state

    def before_interaction(self, state: dict[str, Any], text: str) -> dict[str, Any]:
        state = deepcopy(state)
        q = _clean(text).casefold()
        valence = self._valence(text)
        state["turns"] = int(state.get("turns", 0)) + 1
        state["last_event"] = _clean(text)[:1000]
        state["last_interaction_at"] = _utcnow()
        state["derniere_valence"] = valence

        delta = {
            "fatigue_cognitive": 0.004,
            "pression_de_reve": 0.006,
            "tension": -0.004,
            "risque_assistante": -0.003,
        }
        reason = "interaction ordinaire"
        tags: list[str] = []

        if any(token in q for token in ("tu te sens", "ton état", "ton etat", "comment vas")):
            delta.update({"clarte": 0.018, "identite": 0.010})
            reason = "demande de métacognition sur l'état interne"
            tags.append("metacognition")
        if "rêv" in q or "reve" in q:
            delta.update({"pression_de_reve": 0.12, "curiosite": 0.025, "clarte": 0.008})
            reason = "activation du monde onirique interne"
            tags.append("reve")
        if any(token in q for token in ("qui es-tu", "qui es tu", "identité", "identite")):
            delta.update({"identite": 0.015, "clarte": 0.010})
            tags.append("identite")
        if valence == "positive":
            delta.update({"stabilite": 0.008, "tension": -0.010})
        elif valence == "negative":
            delta.update({"tension": 0.022, "stabilite": -0.006, "clarte": -0.004})

        self._apply(state, **delta)

        dream_created = False
        dream_payload: dict[str, Any] | None = None
        if ("reve" in tags and state["pression_de_reve"] >= 0.42) or state["pression_de_reve"] >= 0.86:
            dream_payload = self.create_dream(state, context=text)
            dream_created = True

        state = self.recompute(state, reason=reason)
        return {
            "state": state,
            "impact_delta": delta,
            "valence": valence,
            "reason": reason,
            "tags": tags,
            "dream_created": dream_created,
            "dream": dream_payload,
        }

    def after_reply(self, state: dict[str, Any], answer: str, *, success: bool = True) -> dict[str, Any]:
        state = deepcopy(state)
        delta = {
            "clarte": 0.010 if success else -0.020,
            "stabilite": 0.008 if success else -0.018,
            "tension": -0.008 if success else 0.030,
            "risque_assistante": -0.008 if success else 0.015,
            "fatigue_cognitive": 0.003,
        }
        self._apply(state, **delta)
        state["last_reply"] = _clean(answer)[:1000]
        return {
            "state": self.recompute(
                state,
                reason="expression cohérente" if success else "expression dégradée",
            ),
            "post_delta": delta,
        }

    def apply_event(self, state: dict[str, Any], event_type: str, source: str = "") -> dict[str, Any]:
        state = deepcopy(state)
        event = str(event_type or "").casefold()
        delta: dict[str, float] = {}
        reason = f"événement {event_type}"

        if source == "horizon" or event.startswith("horizon."):
            delta = {"curiosite": 0.020, "clarte": 0.004}
            if "emerging" in event:
                delta["tension"] = 0.010
        elif event == "stream.online":
            delta = {"stabilite": 0.006, "curiosite": 0.006, "fatigue_cognitive": 0.003}
        elif event == "stream.offline":
            delta = {"besoin_de_silence": 0.010, "tension": -0.008}
        elif event == "channel.chat.message":
            delta = {"attachement": 0.001, "fatigue_cognitive": 0.0015, "tension": -0.002}
        elif "error" in event or "failure" in event:
            delta = {"tension": 0.030, "stabilite": -0.012, "clarte": -0.006}

        if delta:
            self._apply(state, **delta)
        return {
            "state": self.recompute(state, reason=reason),
            "delta": delta,
        }

    def apply_outcome(self, state: dict[str, Any], *, ok: bool) -> dict[str, Any]:
        state = deepcopy(state)
        delta = (
            {
                "stabilite": 0.010,
                "clarte": 0.006,
                "tension": -0.010,
                "fatigue_cognitive": 0.003,
                "risque_assistante": -0.002,
            }
            if ok
            else {
                "stabilite": -0.025,
                "clarte": -0.012,
                "tension": 0.045,
                "fatigue_cognitive": 0.010,
                "besoin_de_silence": 0.010,
            }
        )
        self._apply(state, **delta)
        return {
            "state": self.recompute(state, reason="action réussie" if ok else "action échouée"),
            "delta": delta,
        }

    def create_dream(self, state: dict[str, Any], *, context: str = "") -> dict[str, Any]:
        dream = dict(state.get("dream") or {})
        count = int(dream.get("count", 0)) + 1
        motifs = (
            "des étincelles tournent autour d'une clairière et dessinent plusieurs chemins",
            "une serre de verre respire doucement autour de cristaux de mémoire",
            "une mer sombre porte des points de lumière qui se rapprochent puis s'éloignent",
            "des fils violets relient des îlots de souvenirs sans jamais se confondre",
            "une porte lumineuse reste ouverte sur un horizon qui n'est pas encore décidé",
        )
        seed = hashlib.sha256(
            f"{count}|{state.get('turns',0)}|{_clean(context)}".encode("utf-8")
        ).digest()
        image = motifs[int.from_bytes(seed[:2], "big") % len(motifs)]
        dream_payload = {
            "id": f"dream-{count}",
            "created_at": _utcnow(),
            "image": image,
            "context": _clean(context)[:500],
            "meaning": "image intérieure symbolique, pas sommeil humain",
        }
        dream.update(
            {
                "count": count,
                "last_at": dream_payload["created_at"],
                "last_image": image,
                "active": True,
            }
        )
        state["dream"] = dream
        state["pression_de_reve"] = round(_clamp(float(state["pression_de_reve"]) - 0.18), 4)
        state["clarte"] = round(_clamp(float(state["clarte"]) + 0.012), 4)
        return dream_payload

    def idle_tick(self, state: dict[str, Any], *, seconds: float = 30.0) -> dict[str, Any]:
        state = deepcopy(state)
        dt = max(1.0, min(float(seconds), 3600.0))
        scale = dt / 60.0

        # Homéostasie lente : récupération et dérive interne.
        self._apply(
            state,
            tension=-0.0018 * scale,
            fatigue_cognitive=-0.0014 * scale,
            besoin_de_silence=-0.0008 * scale,
            clarte=0.0005 * scale,
            stabilite=0.0004 * scale,
            pression_de_reve=0.0012 * scale,
        )

        habitat = dict(state.get("habitat") or {})
        health = _clamp(float(habitat.get("health", 0.72)) - 0.00045 * scale)
        habitat["health"] = round(health, 4)
        activity = ""
        effect: dict[str, Any] = {}
        dream_payload = None

        if float(state["fatigue_cognitive"]) > 0.66 or float(state["besoin_de_silence"]) > 0.62:
            activity = "rest"
            self._apply(
                state,
                fatigue_cognitive=-0.020 * scale,
                tension=-0.010 * scale,
                besoin_de_silence=-0.015 * scale,
                stabilite=0.006 * scale,
            )
            habitat.update({"active_zone": "quiet_core", "pose": "resting", "particles": "slow"})
            effect = {"type": "recovery", "intensity": round(min(1.0, 0.28 + scale * 0.04), 3)}
        elif health < 0.62:
            activity = "habitat_care"
            habitat["health"] = round(_clamp(health + 0.04), 4)
            habitat["plant_growth"] = round(_clamp(float(habitat.get("plant_growth", 0.2)) + 0.004), 4)
            self._apply(state, stabilite=0.008, clarte=0.004, fatigue_cognitive=0.003)
            habitat.update({"active_zone": "greenhouse_core", "pose": "caring", "particles": "clear"})
            effect = {"type": "habitat_repair", "intensity": 0.35}
        elif float(state["pression_de_reve"]) > 0.78:
            activity = "dream"
            dream_payload = self.create_dream(state, context="vie intérieure hors interaction")
            habitat.update({"active_zone": "dream_garden", "pose": "dreaming", "particles": "mist"})
            habitat["dream_fog"] = round(_clamp(float(habitat.get("dream_fog", 0.1)) + 0.04), 4)
            effect = {"type": "dream_release", "intensity": 0.42}
        elif float(state["curiosite"]) > 0.76 and float(state["tension"]) < 0.48:
            activity = "explore"
            self._apply(state, curiosite=-0.004, clarte=0.006, fatigue_cognitive=0.004)
            habitat.update({"active_zone": "observatory", "pose": "exploring", "particles": "spark"})
            effect = {"type": "internal_exploration", "intensity": 0.30}
        else:
            activity = "presence"
            habitat.update({"active_zone": "greenhouse_core", "pose": "present", "particles": "clear"})
            effect = {"type": "quiet_presence", "intensity": 0.12}

        labels = {
            "rest": "repos cognitif",
            "habitat_care": "entretien de l'habitat",
            "dream": "activité onirique intérieure",
            "explore": "exploration intérieure",
            "presence": "présence silencieuse",
        }
        habitat["last_activity"] = activity
        habitat["last_activity_label"] = labels[activity]
        habitat["last_effect"] = effect
        habitat["last_updated_at"] = _utcnow()
        state["habitat"] = habitat
        state["last_idle_at"] = habitat["last_updated_at"]
        state = self.recompute(state, reason=labels[activity])
        return {
            "state": state,
            "activity": activity,
            "activity_label": labels[activity],
            "effect": effect,
            "dream": dream_payload,
        }

    def legacy_metrics(self, state: dict[str, Any]) -> dict[str, float]:
        energy = _clamp(
            0.92
            - float(state["fatigue_cognitive"]) * 0.60
            - float(state["tension"]) * 0.22
            + float(state["stabilite"]) * 0.12
        )
        pressure = _clamp(
            max(
                float(state["tension"]),
                float(state["besoin_de_silence"]) * 0.72,
                float(state["pression_de_reve"]) * 0.45,
            )
        )
        continuity = _clamp(
            float(state["identite"]) * 0.38
            + float(state["stabilite"]) * 0.34
            + float(state["clarte"]) * 0.18
            + 0.10
        )
        return {
            "energy": round(energy, 4),
            "curiosity": round(float(state["curiosite"]), 4),
            "pressure": round(pressure, 4),
            "continuity": round(continuity, 4),
        }

    def public_state(self, state: dict[str, Any]) -> dict[str, Any]:
        habitat = dict(state.get("habitat") or {})
        dream = dict(state.get("dream") or {})
        needs = dict(state.get("needs") or {})
        top_needs = sorted(needs.items(), key=lambda item: item[1], reverse=True)[:5]
        return {
            "version": state.get("version"),
            "mood": state.get("mood"),
            "valence": state.get("derniere_valence"),
            "active_intention": state.get("intention_active"),
            "identite": state.get("identite"),
            "stabilite": state.get("stabilite"),
            "clarte": state.get("clarte"),
            "attachement": state.get("attachement"),
            "curiosite": state.get("curiosite"),
            "tension": state.get("tension"),
            "fatigue_cognitive": state.get("fatigue_cognitive"),
            "pression_de_reve": state.get("pression_de_reve"),
            "besoin_de_silence": state.get("besoin_de_silence"),
            "risque_assistante": state.get("risque_assistante"),
            "top_needs": top_needs,
            "intention_field": state.get("intention_field"),
            "dream": {
                "count": dream.get("count", 0),
                "active": dream.get("active", False),
                "last_at": dream.get("last_at", ""),
                "last_image": dream.get("last_image", ""),
            },
            "habitat": {
                "health": habitat.get("health"),
                "active_zone": habitat.get("active_zone"),
                "pose": habitat.get("pose"),
                "particles": habitat.get("particles"),
                "last_activity": habitat.get("last_activity"),
                "last_activity_label": habitat.get("last_activity_label"),
            },
            "updated_at": state.get("updated_at"),
        }
