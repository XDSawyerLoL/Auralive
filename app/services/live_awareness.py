from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import os
import random
import re
import time
from collections import deque
from typing import Any

import aiohttp
from PIL import Image

from app.services import twitch as twitch_service

logger = logging.getLogger(__name__)

_CHATTERS_SCOPE = "moderator:read:chatters"
_KNOWN_BOTS = {
    "streamelements", "nightbot", "wizebot", "moobot", "fossabot",
    "sery_bot", "soundalerts",
}


def _clean(value: Any, limit: int = 500) -> str:
    return " ".join(str(value or "").replace("\n", " ").split()).strip()[:limit]


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().casefold() in {"1", "true", "yes", "oui", "on"}


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        return max(minimum, min(maximum, int(os.getenv(name, str(default)))))
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        return max(minimum, min(maximum, float(os.getenv(name, str(default)))))
    except (TypeError, ValueError):
        return default


def _extract_text(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates") or []
    if not candidates:
        return ""
    parts = candidates[0].get("content", {}).get("parts", []) or []
    return " ".join(
        _clean(part.get("text"), 1200)
        for part in parts
        if not part.get("thought") and _clean(part.get("text"), 1200)
    ).strip()


def _json_object(value: str) -> dict[str, Any]:
    text = str(value or "").strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
    text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return {}
    try:
        payload = json.loads(text[start : end + 1])
        return payload if isinstance(payload, dict) else {}
    except json.JSONDecodeError:
        return {}


def _perceptual_hash(image_bytes: bytes) -> int:
    with Image.open(io.BytesIO(image_bytes)) as image:
        gray = image.convert("L").resize((16, 9), Image.Resampling.BILINEAR)
        pixels = list(gray.getdata())
    average = sum(pixels) / max(1, len(pixels))
    result = 0
    for value in pixels:
        result = (result << 1) | int(value >= average)
    return result


def _hash_distance(left: int | None, right: int | None) -> float:
    if left is None or right is None:
        return 1.0
    return (left ^ right).bit_count() / 144.0


class LiveAwarenessService:
    """Perception OBS proche du direct et accueil raisonné des nouveaux chatters."""

    def __init__(self, aura: Any, db: Any, cohost: Any, settings: Any):
        self.aura = aura
        self.db = db
        self.cohost = cohost
        self.settings = settings
        self.task: asyncio.Task[None] | None = None
        self.started = False
        self.last_error = ""

        self.last_capture_at = 0.0
        self.last_analysis_at = 0.0
        self.last_reaction_at = 0.0
        self.last_scene = ""
        self.previous_hash: int | None = None
        self.previous_image_b64 = ""
        self.last_change_ratio = 0.0
        self.last_visual_event = ""
        self.last_visual_reaction = ""
        self.analysis_times: deque[float] = deque(maxlen=200)
        self.reaction_times: deque[float] = deque(maxlen=50)
        self.capture_count = 0
        self.analysis_count = 0
        self.reaction_count = 0
        self.skipped_unchanged = 0

        self.last_chatters_poll_at = 0.0
        self.chatters_baseline_ready = False
        self.seen_chatters: set[str] = set()
        self.pending_chatters: dict[str, dict[str, Any]] = {}
        self.welcomed_chatters: set[str] = set()
        self.arrival_queue: deque[tuple[str, str]] = deque(maxlen=100)
        self.last_welcome_at = 0.0
        self.welcomed_count = 0
        self.chatters_count = 0
        self.chatters_scope_missing = False
        self.last_chatters_error = ""
        self._stream_was_online = False
        self._tick_lock = asyncio.Lock()

    def _assistant(self) -> dict[str, Any]:
        return dict(self.cohost.profile.get("assistant") or {})

    @property
    def vision_enabled(self) -> bool:
        assistant = self._assistant()
        default = bool(assistant.get("screen_awareness_enabled", True))
        return _env_bool(
            "LIVE_VISION_ENABLED",
            bool(assistant.get("live_vision_enabled", default)),
        )

    @property
    def capture_seconds(self) -> int:
        return _env_int("LIVE_VISION_CAPTURE_SECONDS", 8, 5, 120)

    @property
    def analysis_cooldown_seconds(self) -> int:
        return _env_int("LIVE_VISION_ANALYSIS_COOLDOWN_SECONDS", 30, 15, 600)

    @property
    def change_threshold(self) -> float:
        return _env_float("LIVE_VISION_CHANGE_THRESHOLD", 0.18, 0.03, 0.95)

    @property
    def max_analyses_per_hour(self) -> int:
        return _env_int("LIVE_VISION_MAX_ANALYSES_PER_HOUR", 40, 1, 240)

    @property
    def max_reactions_per_hour(self) -> int:
        assistant = self._assistant()
        default = int(assistant.get("live_vision_max_reactions_per_hour", 5))
        return _env_int("LIVE_VISION_MAX_REACTIONS_PER_HOUR", default, 0, 30)

    @property
    def reaction_cooldown_seconds(self) -> int:
        return _env_int("LIVE_VISION_REACTION_COOLDOWN_SECONDS", 75, 30, 900)

    @property
    def arrivals_enabled(self) -> bool:
        assistant = self._assistant()
        return _env_bool(
            "WELCOME_ARRIVALS_ENABLED",
            bool(assistant.get("welcome_arrivals_enabled", True)),
        )

    @property
    def chatters_poll_seconds(self) -> int:
        return _env_int("WELCOME_ARRIVALS_POLL_SECONDS", 45, 30, 300)

    @property
    def welcome_cooldown_seconds(self) -> int:
        return _env_int("WELCOME_ARRIVALS_COOLDOWN_SECONDS", 90, 30, 900)

    @property
    def welcome_max_per_stream(self) -> int:
        return _env_int("WELCOME_ARRIVALS_MAX_PER_STREAM", 12, 0, 100)

    @property
    def welcome_batch_size(self) -> int:
        return _env_int("WELCOME_ARRIVALS_BATCH_SIZE", 3, 1, 6)

    async def start(self) -> None:
        if self.started:
            return
        await self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS live_awareness_activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                content TEXT NOT NULL,
                context TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        self.started = True
        self.reset_session()
        self.task = asyncio.create_task(self._loop(), name="mairaiy-live-awareness")

    async def close(self) -> None:
        self.started = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            self.task = None

    def reset_session(self) -> None:
        self.last_capture_at = 0.0
        self.last_analysis_at = 0.0
        self.last_reaction_at = 0.0
        self.last_scene = ""
        self.previous_hash = None
        self.previous_image_b64 = ""
        self.last_change_ratio = 0.0
        self.last_visual_event = ""
        self.last_visual_reaction = ""
        self.analysis_times.clear()
        self.reaction_times.clear()
        self.capture_count = 0
        self.analysis_count = 0
        self.reaction_count = 0
        self.skipped_unchanged = 0

        self.last_chatters_poll_at = 0.0
        self.chatters_baseline_ready = False
        self.seen_chatters.clear()
        self.pending_chatters.clear()
        self.welcomed_chatters.clear()
        self.arrival_queue.clear()
        self.last_welcome_at = 0.0
        self.welcomed_count = 0
        self.chatters_count = 0
        self.last_chatters_error = ""

    def _online(self) -> bool:
        return bool(self.aura.stream_online or self.cohost.live_context.get("online"))

    async def _loop(self) -> None:
        while self.started:
            await asyncio.sleep(2)
            online = self._online()
            if online and not self._stream_was_online:
                self.reset_session()
            self._stream_was_online = online
            if not online:
                continue
            try:
                async with self._tick_lock:
                    now = time.monotonic()
                    if self.vision_enabled and now - self.last_capture_at >= self.capture_seconds:
                        await self._capture_tick(now)
                    if self.arrivals_enabled and now - self.last_chatters_poll_at >= self.chatters_poll_seconds:
                        await self._poll_chatters(now)
                    await self._flush_arrivals(now)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.last_error = _clean(exc, 500)
                logger.exception("Perception live Mairaiy en erreur")

    def _prune_limits(self, now: float) -> None:
        while self.analysis_times and now - self.analysis_times[0] > 3600:
            self.analysis_times.popleft()
        while self.reaction_times and now - self.reaction_times[0] > 3600:
            self.reaction_times.popleft()

    async def _capture_tick(self, now: float) -> None:
        self.last_capture_at = now
        if not self.settings.obs_enabled:
            self.last_error = "OBS est désactivé : perception visuelle suspendue"
            return
        if self.settings.ai_mode != "gemini" or not self.settings.ai_api_key:
            self.last_error = "La perception visuelle nécessite Gemini"
            return

        scene_data = await self.aura.obs.call("GetCurrentProgramScene")
        scene_name = _clean(scene_data.get("currentProgramSceneName"), 140)
        shot = await self.aura.obs.call(
            "GetSourceScreenshot",
            {
                "sourceName": scene_name,
                "imageFormat": "jpg",
                "imageWidth": 640,
                "imageHeight": 360,
                "imageCompressionQuality": 62,
            },
        )
        data_url = str(shot.get("imageData") or "")
        if "," not in data_url:
            raise RuntimeError("OBS n'a renvoyé aucune capture exploitable")
        encoded = data_url.split(",", 1)[1]
        image = base64.b64decode(encoded)
        current_hash = _perceptual_hash(image)
        change = _hash_distance(self.previous_hash, current_hash)
        scene_changed = bool(self.last_scene and scene_name != self.last_scene)
        self.capture_count += 1
        self.last_change_ratio = round(change, 3)
        self.cohost.obs_context["scene"] = scene_name

        previous_encoded = self.previous_image_b64
        self.previous_hash = current_hash
        self.previous_image_b64 = encoded
        self.last_scene = scene_name

        if not previous_encoded:
            self.last_error = ""
            return
        if not scene_changed and change < self.change_threshold:
            self.skipped_unchanged += 1
            self.last_error = ""
            return

        self._prune_limits(now)
        if now - self.last_analysis_at < self.analysis_cooldown_seconds:
            return
        if len(self.analysis_times) >= self.max_analyses_per_hour:
            return

        self.last_analysis_at = now
        self.analysis_times.append(now)
        await self._analyze_pair(
            previous_encoded,
            encoded,
            scene_name=scene_name,
            scene_changed=scene_changed,
            change_ratio=change,
            now=now,
        )

    async def _analyze_pair(
        self,
        previous_encoded: str,
        current_encoded: str,
        *,
        scene_name: str,
        scene_changed: bool,
        change_ratio: float,
        now: float,
    ) -> None:
        await self.aura.ai.start()
        model = str(self.settings.ai_model or "")
        if not model.startswith("gemini-"):
            model = "gemini-3.5-flash-lite"
        endpoint = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent"
        )
        game = _clean(self.cohost.live_context.get("game_name") or "inconnu", 120)
        title = _clean(self.cohost.live_context.get("title") or "", 220)
        prompt = f"""Tu observes deux captures consécutives du programme OBS réellement diffusé.
La première image est AVANT, la seconde est MAINTENANT.
Contexte Twitch vérifié : jeu={game}; titre={title or 'inconnu'}; scène={scene_name}.
Changement de scène détecté={str(scene_changed).lower()}; différence visuelle locale={change_ratio:.2f}.

Retourne uniquement un objet JSON valide :
{{
  "summary": "une phrase factuelle sur ce qui est clairement visible maintenant",
  "importance": 0,
  "reaction": "SKIP"
}}

Règles :
- importance 0 ou 1 pour du mouvement ordinaire, un menu banal ou une image ambiguë ;
- importance 2 ou 3 seulement pour un événement clair : victoire, défaite, mort/élimination fictive, explosion évidente, écran de résultat, changement majeur de scène, situation visiblement absurde ;
- reaction doit être SKIP sauf si une coanimatrice apporte réellement quelque chose ;
- si tu réagis, écris une seule phrase française naturelle de 180 caractères maximum ;
- humour noir enjoué autorisé uniquement pour la violence manifestement fictive du jeu ;
- n'invente jamais un score, un nom, une émotion, un dialogue ou un événement illisible."""
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {"text": "IMAGE AVANT"},
                        {"inlineData": {"mimeType": "image/jpeg", "data": previous_encoded}},
                        {"text": "IMAGE MAINTENANT"},
                        {"inlineData": {"mimeType": "image/jpeg", "data": current_encoded}},
                    ]
                }
            ],
            "generationConfig": {
                "maxOutputTokens": 220,
                "temperature": 0.25,
                "responseMimeType": "application/json",
                "thinkingConfig": {
                    "thinkingLevel": "minimal",
                    "includeThoughts": False,
                },
            },
        }
        assert self.aura.ai.session
        async with self.aura.ai.session.post(
            endpoint,
            headers={
                "x-goog-api-key": self.settings.ai_api_key,
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=aiohttp.ClientTimeout(total=28, connect=10),
        ) as response:
            body = await response.json(content_type=None)
            if response.status >= 400:
                detail = (body.get("error") or {}).get("message") if isinstance(body, dict) else str(body)
                raise RuntimeError(f"Vision Gemini {response.status}: {detail or 'erreur inconnue'}")

        self.analysis_count += 1
        parsed = _json_object(_extract_text(body))
        summary = _clean(parsed.get("summary"), 400)
        reaction = _clean(parsed.get("reaction"), 220)
        try:
            importance = max(0, min(3, int(parsed.get("importance", 0))))
        except (TypeError, ValueError):
            importance = 0

        if summary and summary.casefold() != "skip":
            self.last_visual_event = summary
            self.cohost.last_screen_summary = summary
            self.cohost.last_screen_error = ""
            await self.cohost._log(
                "screen-live",
                summary,
                {
                    "scene": scene_name,
                    "game": game,
                    "importance": importance,
                    "change_ratio": round(change_ratio, 3),
                },
            )

        self._prune_limits(now)
        can_react = (
            importance >= 2
            and reaction
            and reaction.casefold() != "skip"
            and self.max_reactions_per_hour > 0
            and len(self.reaction_times) < self.max_reactions_per_hour
            and now - self.last_reaction_at >= self.reaction_cooldown_seconds
            and self.aura.twitch.chat_connected
            and not bool(await self.db.get_setting("bot.silent", False))
        )
        if can_react:
            validated = self.cohost._validate_public_message(reaction)
            if validated and await self.cohost._publish(validated, kind="vision"):
                self.last_visual_reaction = validated
                self.last_reaction_at = now
                self.reaction_times.append(now)
                self.reaction_count += 1
        self.last_error = ""

    async def _get_chatters(self) -> list[dict[str, Any]]:
        broadcaster_id = str(self.aura.twitch.broadcaster_user_id or "")
        if not broadcaster_id:
            return []
        rows: list[dict[str, Any]] = []
        cursor = ""
        for _ in range(10):
            params: dict[str, Any] = {
                "broadcaster_id": broadcaster_id,
                "moderator_id": broadcaster_id,
                "first": 100,
            }
            if cursor:
                params["after"] = cursor
            payload = await self.aura.twitch.request(
                "GET",
                "/chat/chatters",
                role="broadcaster",
                params=params,
            )
            rows.extend(payload.get("data") or [])
            cursor = str((payload.get("pagination") or {}).get("cursor") or "")
            if not cursor:
                break
        return rows

    async def _poll_chatters(self, now: float) -> None:
        self.last_chatters_poll_at = now
        token = await self.db.get_token("broadcaster")
        scopes = {str(item) for item in (token or {}).get("scopes", [])}
        self.chatters_scope_missing = _CHATTERS_SCOPE not in scopes
        if self.chatters_scope_missing:
            self.last_chatters_error = (
                "Reconnecte SANSAHD pour autoriser moderator:read:chatters"
            )
            return

        try:
            rows = await self._get_chatters()
        except Exception as exc:
            self.last_chatters_error = _clean(exc, 400)
            return

        current: dict[str, str] = {}
        ignored_ids = {
            str(self.aura.twitch.bot_user_id or ""),
            str(self.aura.twitch.broadcaster_user_id or ""),
        }
        bot_login = str(self.settings.twitch_bot_login or "").casefold()
        for row in rows:
            user_id = str(row.get("user_id") or "")
            login = str(row.get("user_login") or "").casefold()
            name = _clean(row.get("user_name") or login, 80)
            if (
                not user_id
                or user_id in ignored_ids
                or login in _KNOWN_BOTS
                or login == bot_login
                or not name
            ):
                continue
            current[user_id] = name
        self.chatters_count = len(current)

        if not self.chatters_baseline_ready:
            self.seen_chatters.update(current)
            self.chatters_baseline_ready = True
            self.last_chatters_error = ""
            return

        for user_id, name in current.items():
            if user_id in self.seen_chatters or user_id in self.welcomed_chatters:
                continue
            pending = self.pending_chatters.setdefault(
                user_id,
                {"name": name, "seen": 0},
            )
            pending["name"] = name
            pending["seen"] = int(pending.get("seen", 0)) + 1

        for user_id in list(self.pending_chatters):
            if user_id not in current:
                self.pending_chatters.pop(user_id, None)
                continue
            pending = self.pending_chatters[user_id]
            if int(pending.get("seen", 0)) < 2:
                continue
            name = _clean(pending.get("name"), 80)
            self.pending_chatters.pop(user_id, None)
            self.seen_chatters.add(user_id)
            self.welcomed_chatters.add(user_id)
            if name:
                self.arrival_queue.append((user_id, name))
        self.last_chatters_error = ""

    async def _flush_arrivals(self, now: float) -> None:
        if not self.arrivals_enabled or not self.arrival_queue:
            return
        if now - self.last_welcome_at < self.welcome_cooldown_seconds:
            return
        maximum = self.welcome_max_per_stream
        if maximum and self.welcomed_count >= maximum:
            self.arrival_queue.clear()
            return
        remaining = maximum - self.welcomed_count if maximum else self.welcome_batch_size
        take = max(1, min(self.welcome_batch_size, remaining, len(self.arrival_queue)))
        names = [self.arrival_queue.popleft()[1] for _ in range(take)]
        if not names:
            return

        game = _clean(self.cohost.live_context.get("game_name"), 100)
        if len(names) == 1:
            variants = [
                f"Bienvenue sur le Spot, {names[0]} ! Installe-toi, le direct est déjà bien lancé.",
                f"Salut {names[0]}, bienvenue ! Tu arrives juste à temps pour voir ce que Sansa va encore provoquer.",
            ]
        else:
            joined = ", ".join(names[:-1]) + f" et {names[-1]}"
            variants = [
                f"Bienvenue sur le Spot, {joined} ! Installez-vous, vous arrivez en plein direct.",
                f"Salut {joined}, bienvenue à vous ! La coanimation est officiellement ravie de vous voir arriver.",
            ]
        message = random.choice(variants)
        if game and len(message) + len(game) < 450 and random.random() < 0.45:
            message = message.rstrip(".!") + f" sur {game}."
        if await self.cohost._publish(message, kind="arrival"):
            self.last_welcome_at = now
            self.welcomed_count += len(names)
            await self._log(
                "arrival",
                message,
                {"names": names, "chatters_count": self.chatters_count},
            )

    async def _log(self, kind: str, content: str, context: dict[str, Any]) -> None:
        await self.db.execute(
            "INSERT INTO live_awareness_activity(kind,content,context) VALUES(?,?,?)",
            (kind, content[:500], json.dumps(context, ensure_ascii=False)),
        )

    def diagnostic(self) -> dict[str, Any]:
        now = time.monotonic()
        self._prune_limits(now)
        return {
            "started": self.started,
            "online": self._online(),
            "vision": {
                "enabled": self.vision_enabled,
                "capture_seconds": self.capture_seconds,
                "analysis_cooldown_seconds": self.analysis_cooldown_seconds,
                "change_threshold": self.change_threshold,
                "max_analyses_per_hour": self.max_analyses_per_hour,
                "max_reactions_per_hour": self.max_reactions_per_hour,
                "captures": self.capture_count,
                "analyses": self.analysis_count,
                "reactions": self.reaction_count,
                "analyses_last_hour": len(self.analysis_times),
                "reactions_last_hour": len(self.reaction_times),
                "last_change_ratio": self.last_change_ratio,
                "last_event": self.last_visual_event,
                "last_reaction": self.last_visual_reaction,
                "scene": self.last_scene,
                "memory_only_frames": True,
                "skipped_unchanged": self.skipped_unchanged,
            },
            "arrivals": {
                "enabled": self.arrivals_enabled,
                "scope": _CHATTERS_SCOPE,
                "reauthorization_required": self.chatters_scope_missing,
                "poll_seconds": self.chatters_poll_seconds,
                "chatters_visible": self.chatters_count,
                "baseline_ready": self.chatters_baseline_ready,
                "pending": len(self.pending_chatters),
                "queued": len(self.arrival_queue),
                "welcomed_this_stream": self.welcomed_count,
                "max_per_stream": self.welcome_max_per_stream,
                "last_error": self.last_chatters_error,
                "coverage": "utilisateurs connectés au chat Twitch, pas tous les spectateurs de la page",
            },
            "last_error": self.last_error,
        }


def install_live_awareness(
    aura: Any,
    db: Any,
    cohost: Any,
    settings: Any,
) -> LiveAwarenessService:
    existing = getattr(aura, "live_awareness", None)
    if existing:
        return existing

    if _CHATTERS_SCOPE not in twitch_service.BROADCASTER_SCOPES:
        twitch_service.BROADCASTER_SCOPES.append(_CHATTERS_SCOPE)

    service = LiveAwarenessService(aura, db, cohost, settings)
    aura.live_awareness = service

    original_start = cohost.start
    original_close = cohost.close
    original_status = cohost.status

    async def start() -> None:
        await original_start()
        await service.start()

    async def close() -> None:
        await service.close()
        await original_close()

    async def status() -> dict[str, Any]:
        payload = await original_status()
        payload["live_awareness"] = service.diagnostic()
        return payload

    async def legacy_screen_tick() -> bool:
        return False

    cohost.start = start
    cohost.close = close
    cohost.status = status
    cohost._maybe_analyze_screen = legacy_screen_tick
    return service
