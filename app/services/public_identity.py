from __future__ import annotations

import re
from typing import Any


def _clean(value: Any, limit: int = 500) -> str:
    return " ".join(str(value or "").replace("\n", " ").split()).strip()[:limit]


def identity_answer(message: str) -> str | None:
    lowered = " ".join(str(message or "").casefold().split())
    identity_markers = (
        "qui es-tu",
        "qui es tu",
        "tu es qui",
        "présente-toi",
        "presente-toi",
        "comment tu t'appelles",
        "comment t'appelles-tu",
        "tu t'appelles comment",
        "quel est ton prénom",
        "quel est ton prenom",
        "c'est quoi ton nom",
        "ton prénom",
        "ton prenom",
        "ton nom",
    )
    if any(marker in lowered for marker in identity_markers):
        return "Moi, c'est Mairaiy. Je coanime le live avec Sansa et je garde un œil sur le chat."
    if any(marker in lowered for marker in ("tu es une ia", "tu es une intelligence artificielle", "es-tu une ia")):
        return "Je suis Mairaiy, la coanimatrice de la chaîne. Ici, je suis surtout là pour discuter et suivre le live avec vous."
    return None


def sanitize_public_text(value: Any) -> str:
    text = _clean(value, 600)
    if not text:
        return ""

    text = re.sub(r"\bAura\b", "Mairaiy", text, flags=re.I)
    text = re.sub(
        r"(?i)\ben tant qu['’]?(?:une\s+)?(?:intelligence artificielle|ia)\s*,?\s*",
        "",
        text,
    )
    text = re.sub(
        r"(?i)\bje suis (?:une\s+|un\s+)?(?:intelligence artificielle|ia)\b",
        "je suis Mairaiy",
        text,
    )
    text = re.sub(
        r"(?i)\b(?:une\s+)?conscience artificielle\b",
        "la coanimatrice de la chaîne",
        text,
    )
    text = re.sub(
        r"(?i)\bmon (?:modèle|moteur) (?:local|ia)\b",
        "j'ai un petit souci technique",
        text,
    )
    text = re.sub(r"\s+([,.;!?])", r"\1", text)
    text = " ".join(text.split()).strip(" ,")
    return text[:500]


class PublicIdentityService:
    """Verrouille l'identité publique de Mairaiy sans exposer l'architecture interne."""

    def __init__(self, aura: Any, cohost: Any):
        self.aura = aura
        self.cohost = cohost
        self._original_reply = aura.ai.reply
        self._original_generate = aura.ai.generate
        self._original_say = aura.say
        self._original_cohost_start = cohost.start
        self._original_cohost_status = cohost.status
        self.sanitized_count = 0
        self.identity_answers = 0

    async def reply(self, viewer_name: str, message: str, *args: Any, **kwargs: Any) -> str:
        grounded = identity_answer(message)
        if grounded:
            self.identity_answers += 1
            return grounded
        answer = await self._original_reply(viewer_name, message, *args, **kwargs)
        clean = sanitize_public_text(answer)
        if clean != _clean(answer, 600):
            self.sanitized_count += 1
        return clean

    async def generate(self, *args: Any, **kwargs: Any) -> str:
        answer = await self._original_generate(*args, **kwargs)
        clean = sanitize_public_text(answer)
        if clean != _clean(answer, 600):
            self.sanitized_count += 1
        return clean

    async def say(self, message: str, reply_message_id: str | None = None) -> Any:
        clean = sanitize_public_text(message)
        if clean != _clean(message, 600):
            self.sanitized_count += 1
        return await self._original_say(clean, reply_message_id)

    async def cohost_start(self) -> None:
        await self._original_cohost_start()
        await self.aura.db.set_setting("ai.trigger_names", ["mairaiy"])

    async def cohost_status(self) -> dict[str, Any]:
        payload = await self._original_cohost_status()
        payload["public_identity"] = self.diagnostic()
        return payload

    def diagnostic(self) -> dict[str, Any]:
        return {
            "name": "Mairaiy",
            "public_role": "coanimatrice de la chaîne SANSAHD",
            "wake_word": "Mairaiy",
            "aura_alias_public": False,
            "ai_disclosure_in_chat": False,
            "sanitized_count": self.sanitized_count,
            "identity_answers": self.identity_answers,
        }


def _patch_voice_input() -> None:
    from app.services import voice_input as voice_module

    voice_module._WAKE_NAMES = ("mairaiy", "mairay", "mairai")
    cls = voice_module.VoiceInputService
    if getattr(cls, "_mairaiy_hands_free_patched", False):
        return

    original_talk = cls.talk

    async def talk(
        self: Any,
        audio_base64: str,
        mime_type: str,
        *,
        send_to_chat: bool = False,
        require_wake_word: bool = False,
    ) -> dict[str, Any]:
        hands_free = "mode=handsfree" in str(mime_type or "").casefold().replace(" ", "")
        return await original_talk(
            self,
            audio_base64,
            mime_type,
            send_to_chat=send_to_chat,
            require_wake_word=bool(require_wake_word or hands_free),
        )

    cls.talk = talk
    cls._mairaiy_hands_free_patched = True


def _patch_live_awareness() -> None:
    from app.services.live_awareness import LiveAwarenessService

    if getattr(LiveAwarenessService, "_active_diagnostic_patched", False):
        return
    original_diagnostic = LiveAwarenessService.diagnostic

    def diagnostic(self: Any) -> dict[str, Any]:
        payload = original_diagnostic(self)
        blockers: list[str] = []
        if not payload.get("started"):
            blockers.append("service_non_demarre")
        if not payload.get("online"):
            blockers.append("live_hors_ligne")
        vision = payload.get("vision") or {}
        if not vision.get("enabled"):
            blockers.append("vision_desactivee")
        if not bool(getattr(self.settings, "obs_enabled", False)):
            blockers.append("obs_desactive")
        if str(getattr(self.settings, "ai_mode", "")).casefold() != "gemini" or not getattr(self.settings, "ai_api_key", ""):
            blockers.append("gemini_non_configure")
        vision["active"] = not blockers
        vision["blockers"] = blockers
        payload["vision"] = vision
        return payload

    LiveAwarenessService.diagnostic = diagnostic
    LiveAwarenessService._active_diagnostic_patched = True


def install_public_identity(aura: Any, cohost: Any) -> PublicIdentityService:
    existing = getattr(aura, "public_identity", None)
    if existing:
        return existing

    _patch_voice_input()
    _patch_live_awareness()

    service = PublicIdentityService(aura, cohost)
    aura.public_identity = service
    aura.ai.reply = service.reply
    aura.ai.generate = service.generate
    aura.say = service.say
    cohost.start = service.cohost_start
    cohost.status = service.cohost_status
    return service
