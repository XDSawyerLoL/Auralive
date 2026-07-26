from __future__ import annotations

import asyncio
import base64
import hashlib
import inspect
import json
import os
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

import websockets

ObsEventCallback = Callable[[str, dict[str, Any]], Awaitable[None] | None]


@dataclass(slots=True)
class ObsWebSocketGateway:
    host: str = "127.0.0.1"
    port: int = 4455
    password: str = ""
    event_callback: ObsEventCallback | None = None
    rpc_version: int = 1
    event_subscriptions: int = 0x7FFFFFFF
    _socket: Any = field(default=None, init=False, repr=False)
    _reader_task: asyncio.Task[None] | None = field(default=None, init=False, repr=False)
    _pending: dict[str, asyncio.Future[Any]] = field(default_factory=dict, init=False, repr=False)
    _connect_lock: asyncio.Lock = field(default_factory=asyncio.Lock, init=False, repr=False)

    @classmethod
    def from_env(cls) -> "ObsWebSocketGateway":
        return cls(
            host=os.getenv("OBS_HOST", "127.0.0.1"),
            port=int(os.getenv("OBS_PORT", "4455")),
            password=os.getenv("OBS_PASSWORD", ""),
        )

    @property
    def url(self) -> str:
        return f"ws://{self.host}:{self.port}"

    @property
    def connected(self) -> bool:
        return self._socket is not None

    async def connect(self) -> None:
        if self.connected:
            return
        async with self._connect_lock:
            if self.connected:
                return
            socket = await websockets.connect(
                self.url,
                open_timeout=8,
                close_timeout=3,
                ping_interval=20,
                ping_timeout=20,
                max_size=4 * 1024 * 1024,
            )
            hello = json.loads(await socket.recv())
            if hello.get("op") != 0:
                await socket.close()
                raise RuntimeError("OBS n’a pas envoyé de message Hello valide")
            identify: dict[str, Any] = {
                "rpcVersion": self.rpc_version,
                "eventSubscriptions": self.event_subscriptions,
            }
            authentication = hello.get("d", {}).get("authentication")
            if authentication:
                if not self.password:
                    await socket.close()
                    raise RuntimeError("OBS exige un mot de passe WebSocket")
                identify["authentication"] = self._authentication_response(
                    self.password,
                    str(authentication["salt"]),
                    str(authentication["challenge"]),
                )
            await socket.send(json.dumps({"op": 1, "d": identify}))
            identified = json.loads(await socket.recv())
            if identified.get("op") != 2:
                await socket.close()
                raise RuntimeError(f"Identification OBS refusée : {identified}")
            self._socket = socket
            self._reader_task = asyncio.create_task(self._reader(), name="aura-obs-reader")

    async def close(self) -> None:
        reader = self._reader_task
        self._reader_task = None
        socket = self._socket
        self._socket = None
        if socket is not None:
            await socket.close()
        if reader is not None:
            reader.cancel()
            try:
                await reader
            except asyncio.CancelledError:
                pass
        for future in self._pending.values():
            if not future.done():
                future.set_exception(RuntimeError("Connexion OBS fermée"))
        self._pending.clear()

    async def call(self, request_type: str, payload: dict[str, Any]) -> Any:
        if not self.connected:
            await self.connect()
        request_id = str(uuid4())
        loop = asyncio.get_running_loop()
        future: asyncio.Future[Any] = loop.create_future()
        self._pending[request_id] = future
        message = {
            "op": 6,
            "d": {
                "requestType": request_type,
                "requestId": request_id,
                "requestData": payload,
            },
        }
        try:
            await self._socket.send(json.dumps(message))
            return await asyncio.wait_for(future, timeout=15)
        except Exception:
            self._pending.pop(request_id, None)
            raise

    async def _reader(self) -> None:
        try:
            async for raw in self._socket:
                message = json.loads(raw)
                opcode = message.get("op")
                data = message.get("d", {})
                if opcode == 7:
                    request_id = str(data.get("requestId", ""))
                    future = self._pending.pop(request_id, None)
                    if future is None or future.done():
                        continue
                    status = data.get("requestStatus", {})
                    if status.get("result"):
                        future.set_result(data.get("responseData", {}))
                    else:
                        future.set_exception(
                            RuntimeError(
                                f"OBS {status.get('code')}: {status.get('comment', 'requête refusée')}"
                            )
                        )
                elif opcode == 5 and self.event_callback is not None:
                    result = self.event_callback(
                        str(data.get("eventType", "Unknown")),
                        dict(data.get("eventData", {})),
                    )
                    if inspect.isawaitable(result):
                        await result
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            for future in self._pending.values():
                if not future.done():
                    future.set_exception(RuntimeError(f"Connexion OBS interrompue : {exc}"))
            self._pending.clear()
        finally:
            self._socket = None

    @staticmethod
    def _authentication_response(password: str, salt: str, challenge: str) -> str:
        secret_raw = hashlib.sha256(f"{password}{salt}".encode()).digest()
        secret = base64.b64encode(secret_raw).decode()
        auth_raw = hashlib.sha256(f"{secret}{challenge}".encode()).digest()
        return base64.b64encode(auth_raw).decode()
