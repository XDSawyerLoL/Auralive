from __future__ import annotations

from pathlib import Path

from app.config import RUNTIME_DIR
from aura_runtime.voice_kokoro import LocalKokoroVoice as RuntimeKokoroVoice


class LocalKokoroVoice(RuntimeKokoroVoice):
    """Compatibilité Quantic Studio vers le moteur Kokoro d'AURA Runtime."""

    def __init__(self, output_dir: Path):
        super().__init__(output_dir, runtime_dir=RUNTIME_DIR)
