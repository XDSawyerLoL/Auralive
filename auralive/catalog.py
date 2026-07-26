from __future__ import annotations

from typing import Any

from .integrations.obs import OBS_EVENT_CATALOG
from .integrations.twitch import TWITCH_EVENT_CATALOG

LOCAL_EVENT_CATALOG: list[dict[str, Any]] = [
    {"type": "aura.started", "source": "runtime", "title": "Aura Live démarré"},
    {"type": "aura.stopping", "source": "runtime", "title": "Aura Live va s’arrêter"},
    {"type": "aura.emergency", "source": "runtime", "title": "Mode urgence activé"},
    {"type": "timer.interval", "source": "scheduler", "title": "Intervalle écoulé"},
    {"type": "timer.cron", "source": "scheduler", "title": "Planification déclenchée"},
    {"type": "http.webhook", "source": "http", "title": "Webhook HTTP reçu"},
    {"type": "websocket.message", "source": "websocket", "title": "Message WebSocket reçu"},
    {"type": "file.created", "source": "filesystem", "title": "Fichier créé"},
    {"type": "file.changed", "source": "filesystem", "title": "Fichier modifié"},
    {"type": "file.deleted", "source": "filesystem", "title": "Fichier supprimé"},
    {"type": "windows.hotkey", "source": "windows", "title": "Raccourci clavier"},
    {"type": "windows.process.started", "source": "windows", "title": "Programme démarré"},
    {"type": "windows.process.stopped", "source": "windows", "title": "Programme arrêté"},
    {"type": "voice.command", "source": "voice", "title": "Commande vocale"},
    {"type": "midi.message", "source": "midi", "title": "Message MIDI"},
    {"type": "streamdeck.action", "source": "streamdeck", "title": "Action Stream Deck"},
    {"type": "discord.webhook", "source": "discord", "title": "Événement Discord"},
    {"type": "donation.received", "source": "donation", "title": "Don reçu"},
    {"type": "internal.test", "source": "simulation", "title": "Événement de test"},
]


def trigger_catalog() -> list[dict[str, Any]]:
    return [*TWITCH_EVENT_CATALOG, *OBS_EVENT_CATALOG, *LOCAL_EVENT_CATALOG]
