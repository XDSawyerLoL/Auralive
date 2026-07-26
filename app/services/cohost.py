from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import os
import re
import time
from collections import deque
from pathlib import Path
from typing import Any

import aiohttp

from app.config import BASE_DIR
from app.database import utcnow

logger = logging.getLogger(__name__)

_DEFAULT_PROFILE = BASE_DIR / "config" / "channel_profile.default.json"
_LIVE_CONTEXT_REFRESH_SECONDS = 180


def _clean_line(value: Any, limit: int = 500) -> str:
    return " ".join(str(value or "").replace("\n", " ").split()).strip()[:limit]


def _safe_list(value: Any) -> list[str]:
    if isinstance(value, str):
        value = value.splitlines()
    if not isinstance(value, list):
        return []
    return [_clean_line(item, 300) for item in value if _clean_line(item, 300)]


def _extract_text(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates") or []
    if not candidates:
        return ""
    parts = candidates[0].get("content", {}).get("parts", []) or []
    return " ".join(
        _clean_line(part.get("text"), 900)
        for part in parts
        if not part.get("thought") and _clean_line(part.get("text"), 900)
    ).strip()


class CohostService:
    """Contexte de chaîne, initiatives, CTA naturels et perception du programme OBS."""

    def __init__(self, aura: Any, db: Any, settings: Any):
        self.aura = aura
        self.db = db
        self.settings = settings
        self.profile_path = BASE_DIR / "data" / "channel_profile.json"
        self.profile: dict[str, Any] = {}
        self.started = False
        self.recent_chat: deque[dict[str, str]] = deque(maxlen=45)
        self.messages_since_action = 0
        self.last_action_at = 0.0
        self.last_context_refresh_at = 0.0
        self.last_screen_analysis_at = 0.0
        self.last_screen_hash = ""
        self.last_screen_summary = ""
        self.last_screen_error = ""
        self.live_context: dict[str, Any] = {}
        self.obs_context: dict[str, Any] = {}
        self.campaign_last_at: dict[str, float] = {}
        self.campaign_counts: dict[str, int] = {}
        self.initiative_times: deque[float] = deque(maxlen=30)
        self.session_started_at = time.monotonic()
        self.last_generated_message = ""
        self.last_generated_kind = ""
        self.last_error = ""
        self._decision_lock = asyncio.Lock()
        self._original_ai_reply = aura.ai.reply

    async def start(self) -> None:
        await self._load_profile()
        await self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS cohost_activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                content TEXT NOT NULL,
                context TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_cohost_activity_created
            ON cohost_activity(id DESC);
            """
        )
        self.started = True
        self.reset_session()
        await self.refresh_live_context(force=True)

    async def close(self) -> None:
        self.started = False

    def reset_session(self) -> None:
        now = time.monotonic()
        self.session_started_at = now
        self.messages_since_action = 0
        self.last_action_at = now
        self.campaign_counts.clear()
        self.initiative_times.clear()
        for campaign in self.profile.get("cta_campaigns", []):
            self.campaign_last_at[str(campaign.get("id") or "")] = now

    async def _load_profile(self) -> None:
        self.profile_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.profile_path.exists():
            source = _DEFAULT_PROFILE
            if source.exists():
                self.profile_path.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")
            else:
                self.profile_path.write_text("{}", encoding="utf-8")
        try:
            data = json.loads(self.profile_path.read_text(encoding="utf-8"))
            self.profile = data if isinstance(data, dict) else {}
        except Exception as exc:
            self.last_error = f"Profil de chaîne illisible: {exc}"
            self.profile = {}

    async def save_profile(self, payload: dict[str, Any]) -> dict[str, Any]:
        cleaned = dict(payload)
        owner = dict(cleaned.get("owner") or {})
        owner["facts"] = _safe_list(owner.get("facts"))
        cleaned["owner"] = owner
        channel = dict(cleaned.get("channel") or {})
        channel["themes"] = _safe_list(channel.get("themes"))
        channel["recurring_games"] = _safe_list(channel.get("recurring_games"))
        cleaned["channel"] = channel
        campaigns = []
        for item in list(cleaned.get("cta_campaigns") or []):
            if not isinstance(item, dict) or not _clean_line(item.get("id"), 80):
                continue
            campaigns.append(
                {
                    **item,
                    "id": _clean_line(item.get("id"), 80),
                    "name": _clean_line(item.get("name"), 120),
                    "objective": _clean_line(item.get("objective"), 500),
                    "target": _clean_line(item.get("target"), 300),
                    "fallback": _clean_line(item.get("fallback"), 450),
                    "enabled": bool(item.get("enabled", True)),
                    "interval_minutes": max(10, int(item.get("interval_minutes", 45))),
                    "max_per_stream": max(0, int(item.get("max_per_stream", 2))),
                }
            )
        cleaned["cta_campaigns"] = campaigns
        assistant = dict(cleaned.get("assistant") or {})
        assistant["initiative_enabled"] = bool(assistant.get("initiative_enabled", True))
        assistant["screen_awareness_enabled"] = bool(assistant.get("screen_awareness_enabled", True))
        assistant["initiative_min_interval_minutes"] = max(2, int(assistant.get("initiative_min_interval_minutes", 4)))
        assistant["max_initiatives_per_hour"] = max(0, min(10, int(assistant.get("max_initiatives_per_hour", 3))))
        assistant["min_chat_messages"] = max(2, int(assistant.get("min_chat_messages", 6)))
        assistant["screen_interval_seconds"] = max(60, int(assistant.get("screen_interval_seconds", 150)))
        cleaned["assistant"] = assistant
        self.profile = cleaned
        self.profile_path.write_text(json.dumps(cleaned, ensure_ascii=False, indent=2), encoding="utf-8")
        self.reset_session()
        return self.profile

    async def observe_event(self, event_type: str, event: dict[str, Any]) -> None:
        if event_type == "stream.online":
            self.aura.stream_online = True
            self.reset_session()
            await self.refresh_live_context(force=True)
            return
        if event_type == "stream.offline":
            self.aura.stream_online = False
            return
        if event_type != "channel.chat.message":
            return
        user_id = str(event.get("chatter_user_id") or "")
        if user_id and user_id == str(self.aura.twitch.bot_user_id or ""):
            return
        login = str(event.get("chatter_user_login") or "").casefold()
        known_bots = {"streamelements", "nightbot", "wizebot", "moobot", str(self.settings.twitch_bot_login).casefold()}
        if login in known_bots:
            return
        message = event.get("message") or {}
        text = _clean_line(message.get("text") if isinstance(message, dict) else message, 420)
        if not text or text.startswith("!"):
            return
        self.recent_chat.append(
            {
                "name": _clean_line(event.get("chatter_user_name") or login or "Viewer", 80),
                "text": text,
            }
        )
        self.messages_since_action += 1

    async def announcement_loop(self) -> None:
        while True:
            await asyncio.sleep(20)
            if not self.started or not self.aura.stream_online:
                continue
            if not self.aura.twitch.chat_connected:
                continue
            if bool(await self.db.get_setting("bot.silent", False)):
                continue
            try:
                await self.refresh_live_context()
                await self._maybe_analyze_screen()
                if await self._maybe_cta():
                    continue
                await self._maybe_initiative()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.last_error = str(exc or exc.__class__.__name__)[:500]
                logger.exception("Boucle de coanimation en erreur")

    async def refresh_live_context(self, *, force: bool = False) -> dict[str, Any]:
        now = time.monotonic()
        if not force and now - self.last_context_refresh_at < _LIVE_CONTEXT_REFRESH_SECONDS:
            return self.live_context
        self.last_context_refresh_at = now
        context: dict[str, Any] = {}
        broadcaster_id = self.aura.twitch.broadcaster_user_id
        if broadcaster_id and self.aura.twitch.session:
            try:
                channels = await self.aura.twitch.request(
                    "GET", "/channels", role="broadcaster", params={"broadcaster_id": broadcaster_id}
                )
                row = (channels.get("data") or [{}])[0]
                context.update(
                    {
                        "title": _clean_line(row.get("title"), 250),
                        "game_name": _clean_line(row.get("game_name"), 120),
                        "language": _clean_line(row.get("broadcaster_language"), 20),
                        "tags": list(row.get("tags") or [])[:10],
                    }
                )
                streams = await self.aura.twitch.request(
                    "GET", "/streams", role="broadcaster", params={"user_id": broadcaster_id}
                )
                stream = (streams.get("data") or [{}])[0]
                context["viewer_count"] = int(stream.get("viewer_count") or 0)
                context["started_at"] = str(stream.get("started_at") or "")
                context["online"] = bool(stream.get("id")) or bool(self.aura.stream_online)
            except Exception as exc:
                context["twitch_error"] = _clean_line(exc, 300)
        self.live_context = context
        if self.settings.obs_enabled:
            try:
                scene = await self.aura.obs.call("GetCurrentProgramScene")
                self.obs_context = {"scene": _clean_line(scene.get("currentProgramSceneName"), 140)}
            except Exception as exc:
                self.obs_context = {"error": _clean_line(exc, 300)}
        return context

    def channel_context_text(self) -> str:
        owner = self.profile.get("owner") or {}
        channel = self.profile.get("channel") or {}
        links = self.profile.get("links") or {}
        facts = "; ".join(_safe_list(owner.get("facts"))) or "aucun fait personnel supplémentaire"
        themes = ", ".join(_safe_list(channel.get("themes")))
        games = ", ".join(_safe_list(channel.get("recurring_games")))
        live = self.live_context
        pieces = [
            f"Diffuseur: {_clean_line(owner.get('display_name') or 'SANSAHD', 80)}.",
            f"Faits établis sur lui: {facts}.",
            f"Positionnement de la chaîne: {_clean_line(channel.get('description'), 500)}.",
            f"Thèmes: {themes or 'jeu vidéo, technologie et création'}.",
            f"Jeux récurrents possibles: {games or 'non renseignés'}; le jeu Twitch actuel reste prioritaire.",
            f"Live actuel: titre={live.get('title') or 'inconnu'}, jeu={live.get('game_name') or 'inconnu'}, viewers={live.get('viewer_count', 0)}.",
            f"Scène OBS: {self.obs_context.get('scene') or 'inconnue'}.",
        ]
        if self.last_screen_summary:
            pieces.append(f"Observation récente du programme OBS: {self.last_screen_summary}.")
        if links.get("justplayer_url"):
            pieces.append(f"Lien partenaire autorisé: {links['justplayer_url']}.")
        if links.get("discord_url") or links.get("discord_command"):
            pieces.append(f"Discord: {links.get('discord_url') or links.get('discord_command')}.")
        pieces.append(
            "N'utilise ces informations que lorsqu'elles sont pertinentes. N'invente jamais ce qui n'est pas indiqué."
        )
        return "\n".join(pieces)

    async def wrapped_ai_reply(
        self,
        viewer_name: str,
        message: str,
        viewer_context: str,
        recent_chat: list[str],
        conversation_history: list[dict[str, str]] | None = None,
    ) -> str:
        combined_context = (
            f"{viewer_context}\n\nCONTEXTE DE CHAÎNE VÉRIFIÉ:\n{self.channel_context_text()}"
        )
        return await self._original_ai_reply(
            viewer_name,
            message,
            combined_context,
            recent_chat,
            conversation_history,
        )

    async def _maybe_analyze_screen(self) -> None:
        assistant = self.profile.get("assistant") or {}
        if not bool(assistant.get("screen_awareness_enabled", True)):
            return
        interval = max(60, int(assistant.get("screen_interval_seconds", 150)))
        if time.monotonic() - self.last_screen_analysis_at < interval:
            return
        if self.messages_since_action < 2 and self.obs_context.get("scene"):
            return
        await self.analyze_screen()

    async def analyze_screen(self, *, force: bool = False) -> dict[str, Any]:
        self.last_screen_analysis_at = time.monotonic()
        if not self.settings.obs_enabled:
            self.last_screen_error = "OBS est désactivé"
            return self.screen_status()
        if self.settings.ai_mode != "gemini" or not self.settings.ai_api_key:
            self.last_screen_error = "La perception visuelle nécessite Gemini"
            return self.screen_status()
        try:
            scene_data = await self.aura.obs.call("GetCurrentProgramScene")
            scene_name = _clean_line(scene_data.get("currentProgramSceneName"), 140)
            shot = await self.aura.obs.call(
                "GetSourceScreenshot",
                {
                    "sourceName": scene_name,
                    "imageFormat": "jpg",
                    "imageWidth": 640,
                    "imageHeight": 360,
                    "imageCompressionQuality": 65,
                },
            )
            data_url = str(shot.get("imageData") or "")
            if "," not in data_url:
                raise RuntimeError("OBS n'a renvoyé aucune capture exploitable")
            encoded = data_url.split(",", 1)[1]
            image = base64.b64decode(encoded)
            digest = hashlib.sha256(image).hexdigest()[:20]
            if not force and digest == self.last_screen_hash:
                return self.screen_status()
            self.last_screen_hash = digest
            await self.aura.ai.start()
            model = str(self.settings.ai_model or "")
            if not model.startswith("gemini-"):
                model = "gemini-3.5-flash-lite"
            endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            prompt = (
                "Tu observes uniquement l'image du programme actuellement diffusé dans OBS. "
                "Décris en une phrase courte et factuelle l'action, le jeu ou le changement réellement visible. "
                "N'invente aucun score, nom, émotion ou événement illisible. "
                "Si rien de distinct n'est compréhensible, réponds exactement SKIP. "
                f"Contexte Twitch: jeu={self.live_context.get('game_name') or 'inconnu'}, scène={scene_name}."
            )
            payload = {
                "contents": [{"parts": [
                    {"text": prompt},
                    {"inlineData": {"mimeType": "image/jpeg", "data": encoded}},
                ]}],
                "generationConfig": {
                    "maxOutputTokens": 80,
                    "temperature": 0.2,
                    "thinkingConfig": {"thinkingLevel": "minimal", "includeThoughts": False},
                },
            }
            assert self.aura.ai.session
            async with self.aura.ai.session.post(
                endpoint,
                headers={"x-goog-api-key": self.settings.ai_api_key, "Content-Type": "application/json"},
                json=payload,
                timeout=aiohttp.ClientTimeout(total=25),
            ) as response:
                body = await response.json(content_type=None)
                if response.status >= 400:
                    detail = (body.get("error") or {}).get("message") if isinstance(body, dict) else str(body)
                    raise RuntimeError(f"Vision Gemini {response.status}: {detail}")
            summary = _extract_text(body)
            if summary and summary.casefold() != "skip":
                self.last_screen_summary = summary[:400]
                await self._log("screen", summary, {"scene": scene_name, "game": self.live_context.get("game_name")})
            self.last_screen_error = ""
            self.obs_context["scene"] = scene_name
        except Exception as exc:
            self.last_screen_error = _clean_line(exc, 500)
        return self.screen_status()

    def screen_status(self) -> dict[str, Any]:
        return {
            "enabled": bool((self.profile.get("assistant") or {}).get("screen_awareness_enabled", True)),
            "scene": self.obs_context.get("scene", ""),
            "summary": self.last_screen_summary,
            "error": self.last_screen_error,
            "last_analysis_seconds_ago": max(0, round(time.monotonic() - self.last_screen_analysis_at)) if self.last_screen_analysis_at else None,
        }

    async def _maybe_cta(self) -> bool:
        if self.messages_since_action < 3:
            return False
        now = time.monotonic()
        for campaign in self.profile.get("cta_campaigns", []):
            if not campaign.get("enabled", True):
                continue
            campaign_id = str(campaign.get("id") or "")
            if not campaign_id:
                continue
            maximum = max(0, int(campaign.get("max_per_stream", 2)))
            if maximum and self.campaign_counts.get(campaign_id, 0) >= maximum:
                continue
            interval = max(10, int(campaign.get("interval_minutes", 45))) * 60
            if now - self.campaign_last_at.get(campaign_id, self.session_started_at) < interval:
                continue
            target = _clean_line(campaign.get("target"), 300)
            if campaign_id == "discord" and not target:
                links = self.profile.get("links") or {}
                target = _clean_line(links.get("discord_url") or links.get("discord_command"), 300)
            if campaign_id == "justplayer" and not target:
                target = _clean_line((self.profile.get("links") or {}).get("justplayer_url"), 300)
            if campaign_id in {"discord", "justplayer"} and not target:
                continue
            text = await self.generate_cta(campaign_id, campaign=campaign, target=target)
            if not text:
                self.campaign_last_at[campaign_id] = now - interval * 0.65
                continue
            await self._publish(text, kind=f"cta:{campaign_id}")
            self.campaign_last_at[campaign_id] = now
            self.campaign_counts[campaign_id] = self.campaign_counts.get(campaign_id, 0) + 1
            return True
        return False

    async def generate_cta(
        self,
        campaign_id: str,
        *,
        campaign: dict[str, Any] | None = None,
        target: str = "",
        force: bool = False,
    ) -> str:
        item = campaign or next(
            (row for row in self.profile.get("cta_campaigns", []) if str(row.get("id")) == campaign_id),
            {},
        )
        target = target or _clean_line(item.get("target"), 300)
        chat = " | ".join(f"{row['name']}: {row['text']}" for row in list(self.recent_chat)[-10:])
        prompt = f"""CONTEXTE VÉRIFIÉ
{self.channel_context_text()}

CHAT RÉCENT
{chat or 'Aucun échange suffisamment clair.'}

MISSION CTA
Objectif: {_clean_line(item.get('objective'), 500)}
Élément exact à mentionner: {target or 'aucun lien'}
Écris une seule intervention française de 150 à 300 caractères, naturelle et crédible, comme une coanimatrice qui rebondit sur le direct.
Le CTA doit être compréhensible mais ne doit pas ressembler à une publicité automatique.
N'invente aucun avantage précis du site ou du Discord.
N'utilise pas « les amis », « incroyable », « n'oubliez pas » ni une formule de vendeur.
Retourne exactement SKIP si le moment est vraiment inadapté."""
        answer = await self.aura.ai.generate(
            prompt,
            "Tu es Mairaiy, coanimatrice du live SANSAHD. Tu sais intégrer un appel à l'action sans casser la conversation.",
            100,
            system_is_complete=True,
        )
        text = self._validate_public_message(answer)
        if not text and force:
            text = _clean_line(item.get("fallback"), 420)
        return text

    async def _maybe_initiative(self) -> bool:
        assistant = self.profile.get("assistant") or {}
        if not bool(assistant.get("initiative_enabled", True)):
            return False
        minimum_messages = max(2, int(assistant.get("min_chat_messages", 6)))
        if self.messages_since_action < minimum_messages:
            return False
        now = time.monotonic()
        interval = max(2, int(assistant.get("initiative_min_interval_minutes", 4))) * 60
        if now - self.last_action_at < interval:
            return False
        while self.initiative_times and now - self.initiative_times[0] > 3600:
            self.initiative_times.popleft()
        maximum = max(0, int(assistant.get("max_initiatives_per_hour", 3)))
        if maximum and len(self.initiative_times) >= maximum:
            return False
        text = await self.generate_initiative()
        if not text:
            self.messages_since_action = max(0, self.messages_since_action - 2)
            return False
        await self._publish(text, kind="initiative")
        self.initiative_times.append(now)
        return True

    async def generate_initiative(self, *, force: bool = False) -> str:
        chat = "\n".join(f"- {row['name']}: {row['text']}" for row in list(self.recent_chat)[-14:])
        prompt = f"""CONTEXTE DE CHAÎNE
{self.channel_context_text()}

CHAT HUMAIN RÉCENT
{chat or '- aucun message récent'}

Décide si une coanimatrice devrait intervenir maintenant.
Interviens seulement si tu peux rebondir logiquement sur un sujet répété, une question ouverte, une réaction collective ou une action visible dans OBS.
Tu peux poser une question courte, relever un détail ou taquiner légèrement SANSAHD.
Ne fais aucun CTA et ne fais aucune publicité ici.
N'affirme jamais avoir vu quelque chose qui n'est pas dans l'observation OBS.
Réponse: soit exactement SKIP, soit un seul message Twitch naturel de 220 caractères maximum."""
        answer = await self.aura.ai.generate(
            prompt,
            "Tu es Mairaiy, véritable coanimatrice autonome mais disciplinée. Une bonne absence d'intervention vaut mieux qu'une phrase artificielle.",
            90,
            system_is_complete=True,
        )
        text = self._validate_public_message(answer)
        if force and not text:
            text = "Je prends le pouls du Spot : vous êtes plutôt concentrés sur la partie ou prêts à compliquer la vie de Sansa ?"
        return text

    def _validate_public_message(self, value: Any) -> str:
        text = _clean_line(value, 480)
        text = re.sub(r"^(message|réponse)\s*:\s*", "", text, flags=re.I)
        text = text.strip('"“” ')
        if not text or text.casefold() in {"skip", "aucune", "rien"}:
            return ""
        if text == self.last_generated_message:
            return ""
        return text[:480]

    async def _publish(self, text: str, *, kind: str) -> bool:
        async with self._decision_lock:
            result = await self.aura.say(text)
            if not result:
                return False
            await self.aura.overlay.emit(
                {
                    "type": "aura_message",
                    "text": text,
                    "message": text,
                    "source_type": kind,
                    "speak": True,
                }
            )
            self.last_generated_message = text
            self.last_generated_kind = kind
            self.last_action_at = time.monotonic()
            self.messages_since_action = 0
            await self._log(kind, text, self.current_context())
            return True

    async def _log(self, kind: str, content: str, context: dict[str, Any]) -> None:
        await self.db.execute(
            "INSERT INTO cohost_activity(kind,content,context,created_at) VALUES(?,?,?,?)",
            (kind, content[:500], json.dumps(context, ensure_ascii=False), utcnow()),
        )

    def current_context(self) -> dict[str, Any]:
        return {
            "live": self.live_context,
            "obs": self.obs_context,
            "screen": self.last_screen_summary,
            "recent_chat": list(self.recent_chat)[-10:],
        }

    async def status(self) -> dict[str, Any]:
        rows = await self.db.fetchall(
            "SELECT kind,content,created_at FROM cohost_activity ORDER BY id DESC LIMIT 15"
        )
        assistant = self.profile.get("assistant") or {}
        return {
            "started": self.started,
            "stream_online": bool(self.aura.stream_online),
            "initiative_enabled": bool(assistant.get("initiative_enabled", True)),
            "screen_awareness_enabled": bool(assistant.get("screen_awareness_enabled", True)),
            "messages_waiting": self.messages_since_action,
            "initiatives_last_hour": len([value for value in self.initiative_times if time.monotonic() - value <= 3600]),
            "campaign_counts": dict(self.campaign_counts),
            "last_message": self.last_generated_message,
            "last_kind": self.last_generated_kind,
            "live_context": self.live_context,
            "screen": self.screen_status(),
            "recent_activity": rows,
            "last_error": self.last_error,
        }


def install_cohost(aura: Any, db: Any, settings: Any) -> CohostService:
    existing = getattr(aura, "cohost", None)
    if existing:
        return existing
    service = CohostService(aura, db, settings)
    aura.cohost = service
    aura._announcement_loop = service.announcement_loop
    aura.ai.reply = service.wrapped_ai_reply
    return service
