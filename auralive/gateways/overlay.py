from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4


class OverlayHub:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)
        self._latest: dict[str, dict[str, Any]] = {}

    async def publish(self, channel: str, payload: dict[str, Any]) -> dict[str, Any]:
        message = {
            "id": str(uuid4()),
            "channel": str(channel),
            **dict(payload),
        }
        self._latest[str(channel)] = message
        for queue in tuple(self._subscribers[str(channel)]):
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                queue.put_nowait(message)
        return {"published": True, "id": message["id"], "listeners": len(self._subscribers[str(channel)])}

    async def subscribe(self, channel: str) -> AsyncIterator[dict[str, Any]]:
        key = str(channel)
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=50)
        self._subscribers[key].add(queue)
        latest = self._latest.get(key)
        if latest is not None:
            queue.put_nowait(latest)
        try:
            while True:
                yield await queue.get()
        finally:
            self._subscribers[key].discard(queue)

    def listener_count(self, channel: str) -> int:
        return len(self._subscribers[str(channel)])
