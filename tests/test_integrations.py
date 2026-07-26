import pytest

from auralive.automation import ActionSpec, Automation, AutomationEngine, AutomationRegistry, Event
from auralive.integrations.mairaiy import clean_live_reply, install_mairaiy_actions
from auralive.integrations.obs import install_obs_actions
from auralive.integrations.twitch import install_twitch_actions


class FakeTwitch:
    def __init__(self) -> None:
        self.calls = []

    async def call(self, operation, payload):
        self.calls.append((operation, payload))
        return {"ok": True}


class FakeObs(FakeTwitch):
    pass


class FakeMairaiy:
    async def ask(self, prompt, **kwargs):
        return f"Réponse cohérente à : {prompt}"

    async def speak(self, text, *, voice=None):
        return {"spoken": text, "voice": voice}

    async def remember(self, user_id, fact):
        return {"user_id": user_id, "fact": fact}

    async def forget(self, user_id, query=None):
        return {"user_id": user_id, "query": query}


@pytest.mark.asyncio
async def test_native_gateways_are_called() -> None:
    registry = AutomationRegistry()
    install_twitch_actions(registry)
    install_obs_actions(registry)
    install_mairaiy_actions(registry)
    twitch = FakeTwitch()
    obs = FakeObs()
    engine = AutomationEngine(
        registry,
        services={"twitch": twitch, "obs": obs, "mairaiy": FakeMairaiy()},
    )
    engine.upsert(
        Automation(
            id="native",
            name="Natif",
            trigger="internal.test",
            actions=[
                ActionSpec("twitch.chat.send", {"message": "Bonjour {{event.user_name}}"}),
                ActionSpec("obs.scene.switch", {"sceneName": "Gameplay"}),
                ActionSpec("mairaiy.ask", {"prompt": "Présente-toi", "max_characters": 120}),
            ],
        )
    )

    report = (await engine.dispatch(Event("internal.test", {"user_name": "Sansa"})))[0]

    assert report.ok is True
    assert twitch.calls[0] == ("chat.send", {"message": "Bonjour Sansa"})
    assert obs.calls[0] == ("SetCurrentProgramScene", {"sceneName": "Gameplay"})
    assert report.steps[2].output.startswith("Réponse cohérente")


def test_intermediate_thinking_message_is_rejected() -> None:
    with pytest.raises(ValueError, match="intermédiaire"):
        clean_live_reply("@SANSAHD je réfléchis…")
