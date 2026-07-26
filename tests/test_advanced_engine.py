import pytest

from auralive.automation import ActionSpec, Automation, AutomationEngine, AutomationRegistry, Event
from auralive.automation import install_builtins


@pytest.fixture
def engine() -> AutomationEngine:
    registry = AutomationRegistry()
    install_builtins(registry)
    return AutomationEngine(registry)


@pytest.mark.asyncio
async def test_wildcard_trigger_and_template_resolution(engine: AutomationEngine) -> None:
    @engine.registry.action("test.echo")
    async def echo(config, event, context):
        return config["value"]

    engine.upsert(
        Automation(
            id="wildcard",
            name="Tous les événements Twitch",
            trigger="twitch.*",
            actions=[
                ActionSpec(
                    "test.echo",
                    {"value": "Bonjour {{event.user_name}}"},
                    save_as="greeting",
                ),
                ActionSpec("variables.set", {"scope": "global", "name": "last", "value": "{{local.greeting}}"}),
            ],
        )
    )

    report = (await engine.dispatch(Event("twitch.follow", {"user_name": "Valentin"})))[0]

    assert report.ok is True
    assert engine.global_variables["last"] == "Bonjour Valentin"


@pytest.mark.asyncio
async def test_retry_recovers_from_transient_failure(engine: AutomationEngine) -> None:
    attempts = 0

    @engine.registry.action("test.flaky")
    async def flaky(config, event, context):
        nonlocal attempts
        attempts += 1
        if attempts < 2:
            raise RuntimeError("temporaire")
        return "ok"

    engine.upsert(
        Automation(
            id="retry",
            name="Relance",
            trigger="internal.retry",
            actions=[ActionSpec("test.flaky", retries=2)],
        )
    )

    report = (await engine.dispatch(Event("internal.retry", {})))[0]

    assert report.ok is True
    assert report.steps[0].attempts == 2


@pytest.mark.asyncio
async def test_viewer_cooldown_is_isolated(engine: AutomationEngine) -> None:
    engine.upsert(
        Automation(
            id="cooldown",
            name="Cooldown viewer",
            trigger="twitch.chat.message",
            cooldown_seconds=60,
            cooldown_scope="viewer",
            actions=[ActionSpec("debug.capture")],
        )
    )

    first = (await engine.dispatch(Event("twitch.chat.message", {"user_id": "1"})))[0]
    second = (await engine.dispatch(Event("twitch.chat.message", {"user_id": "1"})))[0]
    other = (await engine.dispatch(Event("twitch.chat.message", {"user_id": "2"})))[0]

    assert first.ok is True and first.skipped is False
    assert second.skipped is True
    assert other.skipped is False


@pytest.mark.asyncio
async def test_simulation_resolves_templates_without_mutating(engine: AutomationEngine) -> None:
    engine.upsert(
        Automation(
            id="simulate-template",
            name="Simulation",
            trigger="internal.test",
            actions=[
                ActionSpec(
                    "variables.set",
                    {"scope": "global", "name": "viewer", "value": "{{event.user_name}}"},
                )
            ],
        )
    )

    report = await engine.simulate(
        "simulate-template", Event("internal.test", {"user_name": "Sansa"})
    )

    assert report.steps[0].output["config"]["value"] == "Sansa"
    assert "viewer" not in engine.global_variables
