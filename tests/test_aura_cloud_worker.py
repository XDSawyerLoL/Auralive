from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.aura_cloud_worker import AuraCloudWorker


class FakeAI:
    enabled = True

    def diagnostic(self):
        return {"mode": "ollama", "runtime_model": "gemma3:12b"}

    async def generate(
        self,
        prompt,
        system_instruction="",
        max_tokens=120,
        *,
        system_is_complete=False,
        task_role="auto",
    ):
        assert system_is_complete is True
        return f"réponse locale:{task_role}"


class FakeCognitive:
    operator_allowed_risks = {"safe", "ai", "network"}
    automation = SimpleNamespace(registry=SimpleNamespace(action_definitions={}))

    async def operate(self, task, *, max_steps, requested_risks, source):
        return {
            "task": task,
            "max_steps": max_steps,
            "requested_risks": sorted(requested_risks),
            "source": source,
        }


class FakeAvatar:
    def diagnostic(self):
        return {
            "voice_identity": {
                "primary_engine": "kokoro-local",
                "primary_voice": "ff_siwis",
            }
        }


class FakeImage:
    async def generate(self, prompt, **kwargs):
        return {"ok": True, "path": "", "prompt": prompt, "backend": "fake"}


class FakeAura:
    def __init__(self):
        self.ai = FakeAI()
        self.cognitive = FakeCognitive()
        self.avatar_audio = FakeAvatar()
        self.image = FakeImage()
        self.evolution = None


def settings():
    return SimpleNamespace(
        aura_cloud_worker_enabled=True,
        aura_cloud_base_url="https://example.invalid",
        aura_cloud_token="secret",
        aura_cloud_worker_poll_seconds=1.5,
        aura_cloud_worker_heartbeat_seconds=15,
        aura_cloud_worker_timeout_seconds=95,
        ai_model="gemma3:12b",
        image_default_width=1024,
        image_default_height=1024,
        image_default_steps=8,
    )


@pytest.mark.asyncio
async def test_worker_runs_local_language_engine():
    worker = AuraCloudWorker(FakeAura(), settings())
    result = await worker._run_inference(
        {
            "prompt": "Bonjour",
            "system": "Couche de langage",
            "max_tokens": 120,
            "task_role": "conversation",
        }
    )
    assert result["answer"] == "réponse locale:conversation"
    assert result["diagnostic"]["mode"] == "ollama"


@pytest.mark.asyncio
async def test_cloud_job_cannot_expand_local_operator_policy():
    worker = AuraCloudWorker(FakeAura(), settings())
    result = await worker._run_operator(
        {"task": "Vérifier le réseau", "max_steps": 4},
        ["safe", "network", "process", "moderation"],
    )
    assert result["requested_risks"] == ["network", "safe"]
    assert result["source"] == "aura-cloud-worker"


@pytest.mark.asyncio
async def test_worker_can_execute_local_image_job():
    worker = AuraCloudWorker(FakeAura(), settings())
    result = await worker._run_image(
        {"prompt": "une nébuleuse", "width": 1024, "height": 1024, "steps": 8}
    )
    assert result["backend"] == "fake"
    assert result["prompt"] == "une nébuleuse"
