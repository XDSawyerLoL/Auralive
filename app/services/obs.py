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

    async def test(self) -> dict[str, Any]:
        return await self.call("GetVersion")
