from __future__ import annotations

import asyncio
import hashlib
import time

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


@pytest.mark.asyncio
async def test_worker_renews_before_minimum_supported_lease_expires(monkeypatch):
    worker = AuraCloudWorker(FakeAura(), settings())
    worker.started = True
    intervals = []

    async def fake_sleep(value):
        intervals.append(float(value))
        raise asyncio.CancelledError

    monkeypatch.setattr("app.services.aura_cloud_worker.asyncio.sleep", fake_sleep)

    with pytest.raises(asyncio.CancelledError):
        await worker._lease_renewer(
            "job-1",
            time.time() * 1000.0 + 15_000.0,
        )

    assert intervals
    assert intervals[0] < 15.0
    assert intervals[0] <= 7.0



class FakeMairaiyAudio:
    def __init__(self, output_dir):
        self.output_dir = output_dir
        self.last_file = ""
        self.last_engine = ""
        self.last_voice = ""
        self.last_audio_duration_ms = 0
        self.last_error = ""

    async def synthesize(self, text, **_kwargs):
        assert text
        self.last_file = "mairaiy-cloud-test.wav"
        self.last_engine = "kokoro-local"
        self.last_voice = "ff_siwis"
        self.last_audio_duration_ms = 900
        path = self.output_dir / self.last_file
        path.write_bytes(b"RIFF" + b"\x00" * 128)
        return f"/media/tts/{self.last_file}"


@pytest.mark.asyncio
async def test_cloud_worker_returns_mairaiy_kokoro_voice_payload(tmp_path):
    aura = FakeAura()
    aura.avatar_audio = FakeMairaiyAudio(tmp_path)
    worker = AuraCloudWorker(aura, settings())

    result = await worker._run_tts(
        {
            "text": "Bonjour, je suis AURA.",
            "rate": 1.0,
            "pitch": 1.0,
            "volume": 1.0,
            "context": "aura-cloud-chat",
        }
    )

    assert result["engine"] == "kokoro-local"
    assert result["voice"] == "ff_siwis"
    assert result["duration_ms"] == 900
    assert result["mime_type"] == "audio/wav"
    assert result["audio_base64"]


@pytest.mark.asyncio
async def test_quantic_worker_executes_trusted_mesh_llm_assignment(monkeypatch):
    worker = AuraCloudWorker(FakeAura(), settings())
    captured = {}

    async def fake_complete(assignment_id, *, result=None, error="", latency_ms=0):
        captured["assignment_id"] = assignment_id
        captured["result"] = result or {}
        captured["error"] = error
        captured["latency_ms"] = latency_ms

    monkeypatch.setattr(worker, "_mesh_complete", fake_complete)

    await worker._run_mesh_assignment(
        {
            "id": "assignment-1",
            "kind": "llm.chat",
            "payload": {
                "messages": [
                    {"role": "system", "content": "Tu es critique."},
                    {"role": "user", "content": "Analyse cette architecture."},
                ],
                "max_tokens": 300,
                "role": "critic",
            },
        }
    )

    assert captured["assignment_id"] == "assignment-1"
    assert captured["error"] == ""
    assert captured["result"]["text"] == "réponse locale:critic"
    assert captured["result"]["model"] == "gemma3:12b"
    assert captured["result"]["runtime"] == "quantic-studio"
    assert worker.mesh_jobs_completed == 1


@pytest.mark.asyncio
async def test_quantic_worker_mesh_hash_is_deterministic(monkeypatch):
    worker = AuraCloudWorker(FakeAura(), settings())
    captured = {}

    async def fake_complete(assignment_id, *, result=None, error="", latency_ms=0):
        captured["result"] = result or {}
        captured["error"] = error

    monkeypatch.setattr(worker, "_mesh_complete", fake_complete)

    await worker._run_mesh_assignment(
        {
            "id": "assignment-hash",
            "kind": "mesh.hash.sha256",
            "payload": {"value": "AURA"},
        }
    )

    assert captured["error"] == ""
    assert captured["result"]["sha256"] == hashlib.sha256(b"AURA").hexdigest()
