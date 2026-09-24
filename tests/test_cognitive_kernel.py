from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from app.automation.models import ExecutionReport, ExecutionStatus, ExecutionStep
from app.cognitive.kernel import CognitiveKernel
from app.database import Database
from app.services.cohost import CohostService


class FakeAI:
    def __init__(self):
        self.calls = []

    async def generate(
        self,
        prompt,
        system_instruction="",
        max_tokens=120,
        *,
        system_is_complete=False,
    ):
        self.calls.append(
            {
                "prompt": prompt,
                "system": system_instruction,
                "max_tokens": max_tokens,
                "system_is_complete": system_is_complete,
            }
        )
        if "motif d'échec" in prompt:
            return (
                '{"diagnosis":"échec réseau répété","proposal":"ajouter une vérification avant retry",'
                '"validation_plan":"simuler puis rejouer un événement de test","risk":"review"}'
            )
        return (
            '{"title":"Lecture du contexte","summary":"Un signal mérite une vérification.",'
            '"hypothesis":"Une dépendance peut être instable.","next_action":"Vérifier la dépendance.",'
            '"memory":"Vérifier une dépendance instable avant de répéter la même action.",'
            '"intention":"Réduire les répétitions aveugles.","confidence":0.82}'
        )


class FakeEngine:
    def __init__(self):
        self.listeners = []
        self.services = {}

    def add_listener(self, listener):
        if listener not in self.listeners:
            self.listeners.append(listener)

    def set_service(self, name, service):
        self.services[name] = service


class FakeAutomation:
    def __init__(self):
        self.engine = FakeEngine()
        self.event_listeners = []
        self.events = []

    def add_event_listener(self, listener):
        if listener not in self.event_listeners:
            self.event_listeners.append(listener)

    async def dispatch(self, event_type, payload=None, *, source="aura"):
        self.events.append((event_type, payload or {}, source))
        return []


class FakeHorizon:
    async def context_for_ai(self):
        return "[ÉVÉNEMENT HORIZON] Transport: perturbation confirmée"


def make_settings():
    return SimpleNamespace(
        cognitive_enabled=True,
        cognitive_tick_seconds=3600,
        cognitive_reflection_seconds=300,
        cognitive_max_reflections_per_hour=6,
        aura_cloud_token="",
    )


@pytest.mark.asyncio
async def test_unified_kernel_persists_soul_and_creates_reflection(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    automation = FakeAutomation()
    aura = SimpleNamespace(ai=FakeAI())
    kernel = CognitiveKernel(aura, db, automation, FakeHorizon(), make_settings())

    await kernel.start()
    result = await kernel.tick(trigger="test", text="Vérifie la situation.", force=True)
    status = await kernel.status()
    reflections = await kernel.reflections()
    lessons = await kernel.lessons()

    assert result["ok"] is True
    assert reflections[0]["title"] == "Interaction active"
    assert lessons == []
    assert status["soul"]["cycles"] >= 1
    assert status["self_learning"] is True
    assert status["native_cognition"]["independent_from_language_model"] is True
    assert status["language_model_role"] == "semantic-support-and-verbalisation-only"
    assert status["self_modifying_code"] is False
    assert aura.ai.calls == []
    assert any(event[0] == "aura.cognitive.reflection" for event in automation.events)

    await kernel.close()


@pytest.mark.asyncio
async def test_repeated_automation_failures_become_a_durable_lesson(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    automation = FakeAutomation()
    aura = SimpleNamespace(ai=FakeAI())
    kernel = CognitiveKernel(aura, db, automation, FakeHorizon(), make_settings())
    await kernel.initialize()

    for _ in range(3):
        report = ExecutionReport(
            automation_id="network-check",
            event_type="automation.timer",
            ok=False,
            status=ExecutionStatus.FAILED,
            steps=[
                ExecutionStep(
                    "http.request",
                    False,
                    error="503 upstream unavailable",
                    finished_at="2026-09-24T00:00:00+00:00",
                )
            ],
            finished_at="2026-09-24T00:00:00+00:00",
        )
        await kernel.observe_report(report)

    lessons = await kernel.lessons()
    assert any(row["lesson_key"].startswith("failure:network-check:") for row in lessons)
    assert any(int(row["evidence_count"]) >= 1 for row in lessons)


@pytest.mark.asyncio
async def test_routine_runs_as_cognitive_event_and_reflection(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    automation = FakeAutomation()
    aura = SimpleNamespace(ai=FakeAI())
    kernel = CognitiveKernel(aura, db, automation, FakeHorizon(), make_settings())
    await kernel.initialize()

    await kernel.add_routine("veille", "Relis les signaux utiles.", 60)
    results = await kernel.run_due_routines()

    assert results
    assert any(event[0] == "aura.cognitive.routine" for event in automation.events)
    assert any(event[0] == "aura.cognitive.reflection" for event in automation.events)


@pytest.mark.asyncio
async def test_public_context_does_not_expose_private_intentions(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    automation = FakeAutomation()
    aura = SimpleNamespace(ai=FakeAI())
    kernel = CognitiveKernel(aura, db, automation, FakeHorizon(), make_settings())
    await kernel.initialize()
    await kernel.add_intention("SECRET-INTENTION", priority=0.9)

    private_context = await kernel.context_for_ai(private=True)
    public_context = await kernel.context_for_ai(private=False)

    assert "SECRET-INTENTION" in private_context
    assert "SECRET-INTENTION" not in public_context


def test_cohost_wrapper_accepts_world_context():
    import inspect

    signature = inspect.signature(CohostService.wrapped_ai_reply)
    assert "world_context" in signature.parameters


@pytest.mark.asyncio
async def test_chat_can_express_aura_identity_without_language_model(tmp_path: Path):
    db = Database(tmp_path / "aura.db")
    await db.initialize()
    automation = FakeAutomation()
    aura = SimpleNamespace(ai=FakeAI())
    kernel = CognitiveKernel(aura, db, automation, FakeHorizon(), make_settings())
    await kernel.initialize()

    result = await kernel.chat("Qui es-tu ?", private=True)

    assert result["ok"] is True
    assert result["language_model_used_for_decision"] is False
    assert result["semantic_support_used"] is False
    assert "modèle de langage" in result["answer"].casefold()
    assert aura.ai.calls == []
