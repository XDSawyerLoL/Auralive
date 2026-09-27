"""Compatibility adapter for the standalone AURA Runtime package.

Quantic Studio hosts AURA Runtime today for backward compatibility. The
implementation lives in the top-level aura_runtime package so no product owns
AURA's execution plane.
"""

from __future__ import annotations

from typing import Any

from aura_runtime.worker import AuraRuntimeWorker
from app.cognitive.evolution_fleet import EvolutionFleet


class AuraCloudWorker(AuraRuntimeWorker):
    """Legacy Studio-facing name backed by product-agnostic AURA Runtime."""

    def __init__(self, aura: Any, settings: Any):
        super().__init__(
            aura,
            settings,
            fleet_factory=EvolutionFleet,
            host_product="quantic-studio",
            packaging="embedded-compatibility-host",
        )
