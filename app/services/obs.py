from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import uuid
from typing import Any

import websockets

from app.config import Settings

logger = logging.getLogger(__name__)


class OBSClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._lock = asyncio.Lock()
        self._avatar_audio_input = ""
        self._avatar_audio_ready = False
        self._avatar_audio_error = ""

    async def call(self, request_type: str, request_data: dict[str, Any] | None = None) -> dict[str, Any]:
        if not self.settings.obs_enabled:
            raise RuntimeError("OBS est désactivé dans .env")
        uri = f"ws://{self.settings.obs_host}:{self.settings.obs_port}"
        async with self._lock:
            async with websockets.connect(uri, open_timeout=5, close_timeout=2) as ws:
                hello = json.loads(await ws.recv())
                if hello.get("op") != 0:
                    raise RuntimeError("Réponse OBS inattendue")
                identify: dict[str, Any] = {"rpcVersion": 1}
                auth = hello.get("d", {}).get("authentication")
                if auth:
                    identify["authentication"] = self._authentication(
                        self.settings.obs_password, auth["salt"], auth["challenge"]
                    )
                await ws.send(json.dumps({"op": 1, "d": identify}))
                identified = json.loads(await ws.recv())
                if identified.get("op") != 2:
                    raise RuntimeError("Authentification OBS refusée")

                request_id = str(uuid.uuid4())
                await ws.send(
                    json.dumps(
                        {
                            "op": 6,
                            "d": {
                                "requestType": request_type,
                                "requestId": request_id,
                                "requestData": request_data or {},
                            },
                        }
                    )
                )
                while True:
                    response = json.loads(await ws.recv())
                    if response.get("op") == 7 and response.get("d", {}).get("requestId") == request_id:
                        status = response["d"]["requestStatus"]
                        if not status.get("result"):
                            raise RuntimeError(status.get("comment", "Requête OBS refusée"))
                        return response["d"].get("responseData", {})

    @staticmethod
    def _authentication(password: str, salt: str, challenge: str) -> str:
        secret = base64.b64encode(
            hashlib.sha256((password + salt).encode("utf-8")).digest()
        ).decode("utf-8")
        return base64.b64encode(
            hashlib.sha256((secret + challenge).encode("utf-8")).digest()
        ).decode("utf-8")

    async def set_scene(self, scene_name: str) -> None:
        await self.call("SetCurrentProgramScene", {"sceneName": scene_name})

    async def toggle_mute(self, input_name: str) -> dict[str, Any]:
        return await self.call("ToggleInputMute", {"inputName": input_name})

    async def ensure_avatar_audio_monitor(self) -> dict[str, Any]:
        """Route automatiquement l'overlay avatar vers le stream ET le casque.

        Aura cherche la Browser Source dont l'URL pointe vers /overlay/avatar,
        active "Control audio via OBS", retire un éventuel mute et force
        Monitor + Output. Aucun nom de source OBS n'est imposé à l'utilisateur.
        """
        if self._avatar_audio_ready and self._avatar_audio_input:
            return {
                "ok": True,
                "input_name": self._avatar_audio_input,
                "monitor_type": "OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT",
                "cached": True,
            }
        if not self.settings.obs_enabled:
            return {"ok": False, "reason": "obs_disabled"}

        try:
            listing = await self.call("GetInputList")
            inputs = list(listing.get("inputs") or [])
            candidates = [
                item
                for item in inputs
                if str(item.get("inputKind") or item.get("unversionedInputKind") or "").casefold()
                in {"browser_source", "browser_source_v2"}
            ]

            matched_name = ""
            for item in candidates:
                input_name = str(item.get("inputName") or "").strip()
                if not input_name:
                    continue
                try:
                    details = await self.call("GetInputSettings", {"inputName": input_name})
                except Exception:
                    continue
                input_settings = details.get("inputSettings") or {}
                url = str(input_settings.get("url") or "")
                if "/overlay/avatar" in url:
                    matched_name = input_name
                    break

            if not matched_name:
                self._avatar_audio_ready = False
                self._avatar_audio_error = "Source OBS /overlay/avatar introuvable"
                return {"ok": False, "reason": "avatar_source_not_found"}

            await self.call(
                "SetInputSettings",
                {
                    "inputName": matched_name,
                    "inputSettings": {"reroute_audio": True},
                    "overlay": True,
                },
            )
            await self.call("SetInputMute", {"inputName": matched_name, "inputMuted": False})
            await self.call(
                "SetInputAudioMonitorType",
                {
                    "inputName": matched_name,
                    "monitorType": "OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT",
                },
            )
            self._avatar_audio_input = matched_name
            self._avatar_audio_ready = True
            self._avatar_audio_error = ""
            logger.info("Audio Mairaiy routé dans OBS via %s (Monitor + Output)", matched_name)
            return {
                "ok": True,
                "input_name": matched_name,
                "monitor_type": "OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT",
                "cached": False,
            }
        except Exception as exc:
            self._avatar_audio_ready = False
            self._avatar_audio_error = str(exc or exc.__class__.__name__)[:300]
            logger.debug("Routage audio automatique OBS indisponible: %s", self._avatar_audio_error)
            return {"ok": False, "reason": "obs_error", "error": self._avatar_audio_error}

    def avatar_audio_diagnostic(self) -> dict[str, Any]:
        return {
            "ready": self._avatar_audio_ready,
            "input_name": self._avatar_audio_input,
            "monitor_type": (
                "OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT" if self._avatar_audio_ready else ""
            ),
            "last_error": self._avatar_audio_error,
        }

    async def test(self) -> dict[str, Any]:
        return await self.call("GetVersion")
