from __future__ import annotations

from .automation import ActionSpec, Automation, ConditionSpec, FailurePolicy


def system_automations() -> list[Automation]:
    """Automatisations système fournies par Aura Live sans dépendre d’un bot tiers."""
    return [
        Automation(
            id="system-mairaiy-direct-mention",
            name="Mairaiy répond aux mentions",
            description=(
                "Réponse conversationnelle finale, puis voix et avatar OBS. "
                "Aucun message intermédiaire n’est envoyé."
            ),
            trigger="twitch.chat.message",
            conditions=[
                ConditionSpec(
                    "text.regex",
                    {
                        "path": "event.message_text",
                        "pattern": r"(?i)(?:^|\s)@?(?:mairaiy|miraïy|aura)(?:\b|\s|[,.!?;:])",
                        "ignore_case": True,
                    },
                )
            ],
            actions=[
                ActionSpec(
                    "mairaiy.ask",
                    {
                        "prompt": "{{event.message_text}}",
                        "user_id": "{{event.user_id}}",
                        "max_characters": 380,
                    },
                    timeout_seconds=130,
                    retries=1,
                    retry_delay_seconds=1,
                    save_as="mairaiy_response",
                ),
                ActionSpec(
                    "twitch.chat.send",
                    {
                        "message": "@{{event.user_name}} {{local.mairaiy_response}}",
                        "reply_to": None,
                    },
                    timeout_seconds=20,
                    retries=1,
                    retry_delay_seconds=1,
                    failure_policy=FailurePolicy.CONTINUE,
                ),
                ActionSpec(
                    "mairaiy.speak",
                    {"text": "{{local.mairaiy_response}}", "voice": None},
                    timeout_seconds=15,
                    failure_policy=FailurePolicy.CONTINUE,
                ),
            ],
            enabled=True,
            priority=10,
            queue_key="mairaiy-chat",
            cooldown_seconds=4,
            cooldown_scope="viewer",
            max_concurrency=1,
            tags=["system", "mairaiy", "chat"],
        ),
        Automation(
            id="system-raid-welcome",
            name="Accueil intelligent des raids",
            description="Mairaiy accueille le raid dans le chat et sur l’avatar.",
            trigger="twitch.raid.in",
            actions=[
                ActionSpec(
                    "mairaiy.ask",
                    {
                        "prompt": (
                            "Prépare un accueil Twitch très court pour le raid de "
                            "{{event.from_broadcaster_user_name}} avec {{event.viewers}} viewers. "
                            "N’invente aucune information sur cette chaîne."
                        ),
                        "max_characters": 280,
                    },
                    timeout_seconds=130,
                    save_as="raid_message",
                ),
                ActionSpec(
                    "twitch.chat.announcement",
                    {"message": "{{local.raid_message}}", "color": "purple"},
                    failure_policy=FailurePolicy.CONTINUE,
                ),
                ActionSpec(
                    "mairaiy.speak",
                    {"text": "{{local.raid_message}}"},
                    failure_policy=FailurePolicy.CONTINUE,
                ),
                ActionSpec(
                    "overlay.publish",
                    {
                        "channel": "alerts",
                        "payload": {
                            "type": "raid",
                            "title": "RAID EN APPROCHE",
                            "user": "{{event.from_broadcaster_user_name}}",
                            "value": "{{event.viewers}}",
                        },
                    },
                    failure_policy=FailurePolicy.CONTINUE,
                ),
            ],
            priority=20,
            queue_key="alerts",
            tags=["system", "alerts", "mairaiy"],
        ),
        Automation(
            id="system-follow-alert",
            name="Alerte follow",
            description="Affiche le nouveau follow dans l’overlay d’alertes.",
            trigger="twitch.follow",
            actions=[
                ActionSpec(
                    "overlay.publish",
                    {
                        "channel": "alerts",
                        "payload": {
                            "type": "follow",
                            "title": "NOUVEAU FOLLOW",
                            "user": "{{event.user_name}}",
                        },
                    },
                ),
                ActionSpec(
                    "variables.increment",
                    {"scope": "global", "name": "follow_count", "amount": 1},
                    failure_policy=FailurePolicy.CONTINUE,
                ),
            ],
            priority=30,
            queue_key="alerts",
            tags=["system", "alerts"],
        ),
        Automation(
            id="system-emergency-shield",
            name="Bouclier Twitch d’urgence",
            description="Active le mode bouclier Twitch lorsque le mode urgence est déclenché.",
            trigger="aura.emergency",
            conditions=[ConditionSpec("event.equals", {"key": "active", "value": True})],
            actions=[
                ActionSpec(
                    "twitch.shield_mode.set",
                    {"active": True},
                    failure_policy=FailurePolicy.CONTINUE,
                )
            ],
            priority=0,
            tags=["system", "emergency-safe"],
        ),
    ]
