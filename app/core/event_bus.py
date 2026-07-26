from __future__ import annotations

import asyncio
from typing import Any

from fastapi import WebSocket


class OverlayBus:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.client_labels: dict[WebSocket, str] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        label = str(websocket.query_params.get("client", "") or "").strip().casefold()
        async with self._lock:
            self.clients.add(websocket)
            if label:
                self.client_labels[websocket] = label

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self.clients.discard(websocket)
            self.client_labels.pop(websocket, None)

    def count(self, label: str | None = None) -> int:
        if not label:
            return len(self.clients)
        normalized = str(label).strip().casefold()
        return sum(1 for client in self.clients if self.client_labels.get(client) == normalized)

    def summary(self) -> dict[str, int]:
        result: dict[str, int] = {"unidentified": 0}
        for client in self.clients:
            label = self.client_labels.get(client) or "unidentified"
            result[label] = result.get(label, 0) + 1
        return result

    async def emit(
        self,
        event: dict[str, Any],
        *,
        target: str | None = None,
    ) -> None:
        stale: list[WebSocket] = []
        normalized_target = str(target or "").strip().casefold()
        async with self._lock:
            if normalized_target:
                targets = [
                    client
                    for client in self.clients
                    if self.client_labels.get(client) == normalized_target
                ]
            else:
                targets = list(self.clients)
        for client in targets:
            try:
                await client.send_json(event)
            except Exception:
                stale.append(client)
        if stale:
            async with self._lock:
                for client in stale:
                    self.clients.discard(client)
                    self.client_labels.pop(client, None)
