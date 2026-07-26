from __future__ import annotations

from typing import Any

from auralive.automation.models import Event
from auralive.automation.registry import AutomationRegistry

from .base import require_service


OBS_EVENT_CATALOG: list[dict[str, str]] = [
    {"type": "obs.connected", "obs_event": "ConnectionOpened"},
    {"type": "obs.disconnected", "obs_event": "ConnectionClosed"},
    {"type": "obs.scene.changed", "obs_event": "CurrentProgramSceneChanged"},
    {"type": "obs.preview.changed", "obs_event": "CurrentPreviewSceneChanged"},
    {"type": "obs.scene.item.enabled", "obs_event": "SceneItemEnableStateChanged"},
    {"type": "obs.input.mute", "obs_event": "InputMuteStateChanged"},
    {"type": "obs.input.volume", "obs_event": "InputVolumeChanged"},
    {"type": "obs.media.started", "obs_event": "MediaInputPlaybackStarted"},
    {"type": "obs.media.ended", "obs_event": "MediaInputPlaybackEnded"},
    {"type": "obs.stream.started", "obs_event": "StreamStateChanged"},
    {"type": "obs.record.started", "obs_event": "RecordStateChanged"},
    {"type": "obs.replay.saved", "obs_event": "ReplayBufferSaved"},
    {"type": "obs.transition.ended", "obs_event": "SceneTransitionEnded"},
]


def install_obs_actions(registry: AutomationRegistry) -> None:
    def register(
        name: str,
        request_type: str,
        title: str,
        category: str,
        schema: dict[str, Any],
        *,
        risk: str = "local-control",
    ) -> None:
        @registry.action(
            name,
            title=title,
            category=category,
            config_schema=schema,
            risk=risk,
            supports_simulation=False,
        )
        async def handler(config: dict[str, Any], event: Event, context: dict[str, Any]) -> Any:
            gateway = require_service(context.get("services", {}), "obs")
            return await gateway.call(request_type, config)

    register(
        "obs.scene.switch",
        "SetCurrentProgramScene",
        "Changer de scène",
        "OBS · Scènes",
        {"sceneName": "string"},
    )
    register(
        "obs.scene.preview",
        "SetCurrentPreviewScene",
        "Préparer une scène",
        "OBS · Scènes",
        {"sceneName": "string"},
    )
    register(
        "obs.scene.item.set_enabled",
        "SetSceneItemEnabled",
        "Afficher ou masquer une source",
        "OBS · Sources",
        {"sceneName": "string", "sceneItemId": "number", "sceneItemEnabled": "boolean"},
    )
    register(
        "obs.filter.set_enabled",
        "SetSourceFilterEnabled",
        "Activer ou désactiver un filtre",
        "OBS · Filtres",
        {"sourceName": "string", "filterName": "string", "filterEnabled": "boolean"},
    )
    register(
        "obs.input.set_mute",
        "SetInputMute",
        "Couper ou rétablir une entrée",
        "OBS · Audio",
        {"inputName": "string", "inputMuted": "boolean"},
    )
    register(
        "obs.input.set_volume",
        "SetInputVolume",
        "Modifier le volume d’une entrée",
        "OBS · Audio",
        {"inputName": "string", "inputVolumeDb": "number"},
    )
    register(
        "obs.media.action",
        "TriggerMediaInputAction",
        "Piloter un média",
        "OBS · Médias",
        {"inputName": "string", "mediaAction": "string"},
    )
    register(
        "obs.input.settings",
        "SetInputSettings",
        "Modifier les paramètres d’une source",
        "OBS · Sources",
        {"inputName": "string", "inputSettings": "object", "overlay": "boolean"},
    )
    register(
        "obs.transition.trigger",
        "TriggerStudioModeTransition",
        "Déclencher la transition Studio",
        "OBS · Scènes",
        {},
    )
    register(
        "obs.screenshot.save",
        "SaveSourceScreenshot",
        "Enregistrer une capture",
        "OBS · Capture",
        {
            "sourceName": "string",
            "imageFormat": "png|jpg",
            "imageFilePath": "string",
            "imageWidth": "number|null",
            "imageHeight": "number|null",
        },
    )
    register(
        "obs.record.start",
        "StartRecord",
        "Démarrer l’enregistrement",
        "OBS · Diffusion",
        {},
    )
    register(
        "obs.record.stop",
        "StopRecord",
        "Arrêter l’enregistrement",
        "OBS · Diffusion",
        {},
    )
    register(
        "obs.record.pause",
        "PauseRecord",
        "Mettre l’enregistrement en pause",
        "OBS · Diffusion",
        {},
    )
    register(
        "obs.record.resume",
        "ResumeRecord",
        "Reprendre l’enregistrement",
        "OBS · Diffusion",
        {},
    )
    register(
        "obs.replay.start",
        "StartReplayBuffer",
        "Démarrer le replay buffer",
        "OBS · Diffusion",
        {},
    )
    register(
        "obs.replay.save",
        "SaveReplayBuffer",
        "Sauvegarder le replay",
        "OBS · Diffusion",
        {},
    )
    register(
        "obs.stream.start",
        "StartStream",
        "Démarrer le stream",
        "OBS · Diffusion",
        {},
        risk="broadcast-critical",
    )
    register(
        "obs.stream.stop",
        "StopStream",
        "Arrêter le stream",
        "OBS · Diffusion",
        {},
        risk="broadcast-critical",
    )

    @registry.condition(
        "obs.scene.is",
        title="Scène OBS active",
        category="OBS",
        config_schema={"scene": "string"},
    )
    async def scene_is(config: dict[str, Any], event: Event, context: dict[str, Any]) -> bool:
        return context.get("services", {}).get("obs_scene") == config.get("scene")
