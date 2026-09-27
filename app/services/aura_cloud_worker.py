from __future__ import annotations

from typing import Any

from aura_runtime.worker import AuraRuntimeWorker
from app.cognitive.evolution_fleet import EvolutionFleet


class AuraCloudWorker(AuraRuntimeWorker):
    """Compatibilité Quantic Studio -> AURA Runtime.

    Quantic Studio fournit aujourd'hui ses moteurs locaux au Runtime via cet
    adaptateur. Le transport, les jobs, les leases et le Compute Mesh vivent
    désormais dans le package indépendant aura_runtime.
    """

    def __init__(self, aura: Any, settings: Any):
        super().__init__(
            aura,
            settings,
            fleet_factory=EvolutionFleet,
            host_product="quantic-studio",
            runtime_packaging="embedded-compatibility-host",
        )
