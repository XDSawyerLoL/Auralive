from __future__ import annotations

import copy
from dataclasses import asdict
from typing import Any

from .advanced import install_frontier_nodes
from .models import ActionSpec, Automation, ConditionSpec, Event, ExecutionStep
from .permissions import AutomationPermissionPolicy
from .runtime import AutomationStudioRuntime


class FrontierAutomationRuntime(AutomationStudioRuntime):
    """Automation Studio étendu sur la base fonctionnelle V1.2."""

    def __init__(self, aura: Any, db: Any, settings: Any):
        super().__init__(aura, db, settings)
        install_frontier_nodes(self.registry)
        self.permission_policy = AutomationPermissionPolicy(db)
        self.engine.services["automation_runtime"] = self
        self.engine.services["permission_policy"] = self.permission_policy
        self._secure_action_handlers()

    def _secure_action_handlers(self) -> None:
        for action_type, original in list(self.registry.actions.items()):
            definition = self.registry.action_definitions[action_type]
            if getattr(original, "_aura_permission_wrapped", False):
                continue

            async def secured(
                config: dict[str, Any],
                event: Event,
                context: dict[str, Any],
                *,
                _handler=original,
                _type=action_type,
                _risk=definition.risk,
            ) -> Any:
                decision = await self.permission_policy.authorize(
                    _type, _risk, config, event, context
                )
                if not decision.allowed:
                    raise PermissionError(
                        f"Bloc {_type} bloqué ({decision.risk}) : {decision.reason}"
                    )
                return await _handler(config, event, context)

            setattr(secured, "_aura_permission_wrapped", True)
            self.registry.actions[action_type] = secured
            definition.handler = secured

    async def initialize(self) -> None:
        await super().initialize()
        await self.permission_policy.initialize()

    async def install_frontier_defaults(self) -> None:
        """Installe des modèles désactivés, sans doubler les réponses V1.2."""
        existing = set(self.engine.automations)
        for definition in self.frontier_templates():
            if definition["id"] not in existing:
                await self.upsert(definition)

    async def execute_inline(
        self,
        actions: list[ActionSpec],
        event: Event,
        context: dict[str, Any],
    ) -> list[dict[str, Any]]:
        steps: list[dict[str, Any]] = []
        for action in actions:
            if not action.enabled:
                continue
            step = await self.engine._execute_action(action, event, context)
            steps.append(self._step_to_dict(step))
            if not step.ok and action.failure_policy.value in {"stop", "rollback"}:
                break
        return steps

    async def evaluate_inline_condition(
        self,
        raw: dict[str, Any],
        event: Event,
        context: dict[str, Any],
    ) -> bool:
        spec = ConditionSpec(
            type=str(raw["type"]),
            config=dict(raw.get("config") or {}),
            negate=bool(raw.get("negate", False)),
            enabled=bool(raw.get("enabled", True)),
        )
        if not spec.enabled:
            return True
        handler = self.registry.conditions.get(spec.type)
        if handler is None:
            raise ValueError(f"Condition inconnue : {spec.type}")
        config = self.engine._resolve(spec.config, context)
        result = bool(await handler(config, event, context))
        return not result if spec.negate else result

    async def call_automation(
        self,
        automation_id: str,
        event: Event,
        context: dict[str, Any],
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        target = self.engine.automations.get(automation_id)
        if target is None:
            raise ValueError(f"Automatisation introuvable : {automation_id}")
        stack = list(context.get("local", {}).get("__automation_stack", []))
        if automation_id in stack:
            raise RuntimeError(f"Boucle d’automatisation détectée : {' → '.join(stack + [automation_id])}")
        if len(stack) >= 8:
            raise RuntimeError("Profondeur maximale d’automatisation atteinte")
        merged_payload = dict(event.payload)
        merged_payload.update(payload or {})
        merged_payload["__automation_stack"] = stack + [automation_id]
        child_event = Event(
            type=f"automation.call.{automation_id}",
            payload=merged_payload,
            source="automation",
        )
        report = await self.engine._run(target, child_event)
        return self.report_to_dict(report)

    async def simulate_document(
        self,
        definition: dict[str, Any],
        event_type: str,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        automation = self.from_dict(definition)
        previous = self.engine.automations.get(automation.id)
        self.engine.upsert(automation)
        try:
            return await self.simulate(automation.id, event_type, payload)
        finally:
            if previous is None:
                self.engine.remove(automation.id)
            else:
                self.engine.upsert(previous)

    async def status(self) -> dict[str, Any]:
        permissions = await self.permission_policy.list_permissions()
        return {
            "started": self.started,
            "automations": len(self.engine.automations),
            "actions": len(self.registry.actions),
            "conditions": len(self.registry.conditions),
            "reports_cached": len(self.engine.history),
            "permissions": permissions,
        }

    @staticmethod
    def _step_to_dict(step: ExecutionStep) -> dict[str, Any]:
        data = asdict(step)
        return data

    @staticmethod
    def trigger_catalog() -> list[dict[str, str]]:
        twitch = [
            ("channel.chat.message", "Message Twitch", "Twitch · Chat"),
            ("channel.chat.notification", "Notification de chat", "Twitch · Chat"),
            ("channel.chat.clear", "Chat vidé", "Twitch · Modération"),
            ("channel.chat.clear_user_messages", "Messages viewer effacés", "Twitch · Modération"),
            ("channel.chat.message_delete", "Message supprimé", "Twitch · Modération"),
            ("channel.suspicious_user.*", "Utilisateur suspect", "Twitch · Sécurité"),
            ("channel.warning.*", "Avertissement Twitch", "Twitch · Sécurité"),
            ("channel.shield_mode.*", "Mode bouclier", "Twitch · Sécurité"),
            ("channel.follow", "Nouveau follow", "Twitch · Communauté"),
            ("channel.subscribe", "Abonnement", "Twitch · Communauté"),
            ("channel.subscription.*", "Événement abonnement", "Twitch · Communauté"),
            ("channel.cheer", "Bits", "Twitch · Communauté"),
            ("channel.raid", "Raid entrant ou sortant", "Twitch · Communauté"),
            ("channel.channel_points_custom_reward_redemption.*", "Récompense Twitch", "Twitch · Interaction"),
            ("channel.poll.*", "Sondage Twitch", "Twitch · Interaction"),
            ("channel.prediction.*", "Prédiction Twitch", "Twitch · Interaction"),
            ("channel.hype_train.*", "Hype Train", "Twitch · Interaction"),
            ("channel.goal.*", "Objectif Twitch", "Twitch · Chaîne"),
            ("channel.ad_break.begin", "Coupure publicitaire", "Twitch · Chaîne"),
            ("channel.charity_campaign.*", "Campagne caritative", "Twitch · Chaîne"),
            ("channel.shoutout.*", "Shoutout", "Twitch · Communauté"),
            ("channel.vip.*", "Changement VIP", "Twitch · Communauté"),
            ("channel.update", "Titre ou catégorie modifié", "Twitch · Chaîne"),
            ("stream.online", "Début du live", "Twitch · Chaîne"),
            ("stream.offline", "Fin du live", "Twitch · Chaîne"),
        ]
        local = [
            ("obs.*", "Événement OBS", "OBS"),
            ("aura.started", "Aura Live démarré", "Aura Live"),
            ("aura.stopping", "Aura Live s’arrête", "Aura Live"),
            ("automation.manual", "Déclenchement manuel", "Aura Live"),
            ("automation.timer", "Planificateur", "Aura Live"),
            ("automation.call.*", "Appel d’automatisation", "Aura Live"),
            ("*", "Tous les événements", "Avancé"),
        ]
        return [
            {"name": name, "title": title, "category": category}
            for name, title, category in twitch + local
        ]

    @classmethod
    def templates(cls) -> list[dict[str, Any]]:
        return [*super().templates(), *cls.frontier_templates()]

    @staticmethod
    def frontier_templates() -> list[dict[str, Any]]:
        return [
            {
                "id": "frontier-raid-cinematic",
                "name": "Raid cinématique Mairaiy",
                "trigger": "channel.raid",
                "description": "Accueil contextualisé, annonce, voix, overlay et marqueur.",
                "enabled": False,
                "priority": 20,
                "queue_key": "frontier-alerts",
                "actions": [
                    {
                        "type": "aura.ai.generate",
                        "config": {
                            "prompt": "Accueille le raid de {{event.from_broadcaster_user_name}} avec {{event.viewers}} viewers en une phrase énergique sans inventer de fait personnel.",
                            "instruction": "Réponse Twitch naturelle, 220 caractères maximum, sans formule je réfléchis.",
                            "max_tokens": 90,
                            "send_to_chat": False,
                            "speak": False,
                        },
                        "save_as": "raid_text",
                    },
                    {
                        "type": "twitch.announcement",
                        "config": {"message": "{{local.raid_text}}", "color": "purple"},
                    },
                    {
                        "type": "aura.tts.speak",
                        "config": {"text": "{{local.raid_text}}"},
                        "failure_policy": "continue",
                    },
                    {
                        "type": "aura.overlay.emit",
                        "config": {
                            "payload": {
                                "type": "raid",
                                "viewer": "{{event.from_broadcaster_user_name}}",
                                "count": "{{event.viewers}}",
                            }
                        },
                        "failure_policy": "continue",
                    },
                    {
                        "type": "twitch.marker",
                        "config": {"description": "Raid de {{event.from_broadcaster_user_name}}"},
                        "failure_policy": "continue",
                    },
                ],
            },
            {
                "id": "frontier-emergency-shield",
                "name": "Bouclier d’urgence Twitch",
                "trigger": "automation.emergency",
                "description": "Active ou désactive le mode bouclier depuis Aura Live.",
                "enabled": False,
                "priority": 0,
                "tags": ["emergency-safe"],
                "actions": [
                    {
                        "type": "twitch.shield_mode",
                        "config": {"active": "{{event.active}}"},
                    }
                ],
            },
            {
                "id": "frontier-reward-production",
                "name": "Récompense → scène, média et réponse",
                "trigger": "channel.channel_points_custom_reward_redemption.add",
                "description": "Exemple natif complet pour une récompense Twitch.",
                "enabled": False,
                "conditions": [
                    {
                        "type": "data.compare",
                        "config": {
                            "path": "event.reward.title",
                            "operator": "eq",
                            "value": "MAIRAIY_SCENE",
                        },
                    }
                ],
                "actions": [
                    {"type": "obs.scene.set", "config": {"scene": "Just Chatting"}},
                    {
                        "type": "mairaiy.respond",
                        "config": {
                            "message": "{{event.user_input}}",
                            "user_id": "{{event.user_id}}",
                            "user_name": "{{event.user_name}}",
                            "send_to_chat": True,
                            "speak": True,
                            "mention_user": True,
                        },
                    },
                ],
            },
            {
                "id": "frontier-hype-train-visual",
                "name": "Hype Train dynamique",
                "trigger": "channel.hype_train.*",
                "description": "Met à jour l’overlay et fait réagir Mairaiy aux étapes du Hype Train.",
                "enabled": False,
                "priority": 25,
                "cooldown_seconds": 8,
                "actions": [
                    {
                        "type": "aura.overlay.emit",
                        "config": {
                            "payload": {
                                "type": "hype_train",
                                "level": "{{event.level}}",
                                "progress": "{{event.progress}}",
                                "goal": "{{event.goal}}",
                            }
                        },
                    }
                ],
            },
        ]
