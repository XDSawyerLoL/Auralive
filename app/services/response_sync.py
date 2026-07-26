from __future__ import annotations

import logging
from contextvars import ContextVar
from typing import Any

from app.services.public_identity import install_public_identity

logger = logging.getLogger(__name__)


class ResponseSynchronizer:
    """Prépare la voix avant de publier le même texte dans Twitch.

    Les réponses IA historiques publiaient d'abord dans le chat, puis lançaient la
    génération TTS. Le décalage devenait visible avec une voix générative. Ce
    synchroniseur diffère uniquement les messages produits par answer_ai et le
    moteur de coanimation. Les autres appels à ``aura.say`` restent immédiats.
    """

    def __init__(self, aura: Any, cohost: Any | None = None):
        self.aura = aura
        self.cohost = cohost
        self._active: ContextVar[bool] = ContextVar("mairaiy_sync_active", default=False)
        self._pending: ContextVar[tuple[str, str | None] | None] = ContextVar(
            "mairaiy_sync_pending", default=None
        )
        self._original_say = aura.say
        self._original_emit = aura.overlay.emit
        self._original_answer_ai = aura.answer_ai
        self._original_publish = getattr(cohost, "_publish", None) if cohost else None
        self.last_synced_text = ""
        self.synced_count = 0

    async def _run_synchronized(self, callback: Any, *args: Any, **kwargs: Any) -> Any:
        active_token = self._active.set(True)
        pending_token = self._pending.set(None)
        try:
            return await callback(*args, **kwargs)
        finally:
            leftover = self._pending.get()
            if leftover:
                # Une erreur d'overlay ne doit pas supprimer la réponse textuelle.
                await self._original_say(leftover[0], leftover[1])
                self._pending.set(None)
            self._pending.reset(pending_token)
            self._active.reset(active_token)

    async def say(self, message: str, reply_message_id: str | None = None) -> dict[str, Any] | None:
        if self._active.get():
            self._pending.set((str(message), reply_message_id))
            return {"is_sent": True, "deferred_for_voice": True}
        return await self._original_say(message, reply_message_id)

    async def emit(self, event: dict[str, Any], *, target: str | None = None) -> None:
        pending = self._pending.get()
        event_type = str(event.get("type") or "")
        vocal_response = event_type == "aura_message" and event.get("speak", True) is not False

        if self._active.get() and pending and vocal_response:
            # Le wrapper audio génère d'abord le WAV, puis transmet l'événement à
            # la source avatar. Le chat part juste après, sans plusieurs secondes
            # d'avance sur la voix.
            await self._original_emit(event, target=target)
            self._pending.set(None)
            result = await self._original_say(pending[0], pending[1])
            if result is None:
                logger.warning("Voix prête mais message Twitch non envoyé: %s", pending[0][:160])
            self.last_synced_text = pending[0]
            self.synced_count += 1
            return

        await self._original_emit(event, target=target)

    async def answer_ai(self, *args: Any, **kwargs: Any) -> Any:
        return await self._run_synchronized(self._original_answer_ai, *args, **kwargs)

    async def publish(self, *args: Any, **kwargs: Any) -> Any:
        if not self._original_publish:
            raise RuntimeError("Moteur de coanimation indisponible")
        return await self._run_synchronized(self._original_publish, *args, **kwargs)

    def diagnostic(self) -> dict[str, Any]:
        return {
            "enabled": True,
            "synced_count": self.synced_count,
            "last_synced_text": self.last_synced_text[:160],
            "strategy": "voice-ready-before-chat",
        }


def install_response_sync(aura: Any, cohost: Any | None = None) -> ResponseSynchronizer:
    existing = getattr(aura, "response_sync", None)
    if existing:
        return existing

    synchronizer = ResponseSynchronizer(aura, cohost)
    aura.response_sync = synchronizer
    aura.say = synchronizer.say
    aura.overlay.emit = synchronizer.emit
    aura.answer_ai = synchronizer.answer_ai
    if cohost is not None and synchronizer._original_publish is not None:
        cohost._publish = synchronizer.publish
        install_public_identity(aura, cohost)
    return synchronizer
