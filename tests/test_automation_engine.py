import pytest

from auralive.automation import (
    ActionSpec,
    Automation,
    AutomationEngine,
    AutomationRegistry,
    ConditionSpec,
    Event,
    RunMode,
    install_builtins,
)


@pytest.fixture
def engine() -> AutomationEngine:
    registry = AutomationRegistry()
    install_builtins(registry)
    return AutomationEngine(registry)


@pytest.mark.asyncio
async def test_dispatch_executes_matching_automation(engine: AutomationEngine) -> None:
    engine.upsert(
        Automation(
            id="follow-thanks",
            name="Remercier un follow",
            trigger="twitch.follow",
            conditions=[ConditionSpec("event.equals", {"key": "user_name", "value": "Valentin"})],
            actions=[ActionSpec("variables.increment", {"scope": "global", "name": "follows"})],
        )
    )

    reports = await engine.dispatch(Event("twitch.follow", {"user_name": "Valentin"}))

    assert reports[0].ok is True
    assert engine.global_variables["follows"] == 1


@pytest.mark.asyncio
async def test_condition_can_skip_automation(engine: AutomationEngine) -> None:
    engine.upsert(
        Automation(
            id="mods-only",
            name="Action modération",
            trigger="twitch.chat.message",
            conditions=[ConditionSpec("viewer.role", {"roles": ["moderator"]})],
            actions=[ActionSpec("debug.capture", {"message": "ok"})],
        )
    )

    reports = await engine.dispatch(
        Event("twitch.chat.message", {"user_id": "1", "roles": ["viewer"]})
    )

    assert reports[0].skipped is True
    assert reports[0].steps == []


@pytest.mark.asyncio
async def test_simulation_does_not_mutate_state(engine: AutomationEngine) -> None:
    engine.upsert(
        Automation(
            id="simulation",
            name="Simulation",
            trigger="internal.test",
            actions=[ActionSpec("variables.set", {"scope": "global", "name": "danger", "value": 1})],
        )
    )

    report = await engine.simulate("simulation", Event("internal.test", {}))

    assert report.ok is True
    assert "danger" not in engine.global_variables
    assert report.steps[0].output == "simulation"


@pytest.mark.asyncio
async def test_parallel_actions(engine: AutomationEngine) -> None:
    engine.upsert(
        Automation(
            id="parallel",
            name="Parallèle",
            trigger="internal.parallel",
            run_mode=RunMode.PARALLEL,
            actions=[
                ActionSpec("flow.delay", {"seconds": 0}),
                ActionSpec("debug.capture", {"message": "done"}),
            ],
        )
    )

    report = (await engine.dispatch(Event("internal.parallel", {})))[0]

    assert report.ok is True
    assert len(report.steps) == 2
