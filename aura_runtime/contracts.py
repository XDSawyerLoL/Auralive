from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class AuraRuntimeHost(Protocol):
    """Optional capability host consumed by AuraRuntimeWorker.

    Implementations may expose any subset of:
    - ai
    - cognitive
    - avatar_audio
    - image
    - evolution
    """

    ai: Any
    cognitive: Any
    avatar_audio: Any
    image: Any
    evolution: Any


class EmptyRuntimeHost:
    """Minimal host for standalone compute/mesh operation."""

    ai = None
    cognitive = None
    avatar_audio = None
    image = None
    evolution = None
