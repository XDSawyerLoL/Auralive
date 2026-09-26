from __future__ import annotations

import asyncio
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
        preferred_model="",
    ):
        assert system_is_complete is True
        suffix = f":{preferred_model}" if preferred_model else ""
        return f"réponse locale:{task_role}{suffix}"


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
        aura_compute_mesh_consent=False,
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
async def test_worker_executes_deterministic_compute_primitives():
    worker = AuraCloudWorker(FakeAura(), settings())

    hashed = await worker._run_compute({"op": "sha256", "text": "AURA"})
    summed = await worker._run_compute({"op": "sum", "values": [1, 2, 3.5]})
    dotted = await worker._run_compute({"op": "dot", "left": [1, 2], "right": [3, 4]})
    cosine = await worker._run_compute({"op": "cosine", "left": [1, 0], "right": [1, 0]})

    assert hashed["deterministic"] is True
    assert len(hashed["value"]) == 64
    assert summed["value"] == 6.5
    assert dotted["value"] == 11
    assert cosine["value"] == 1.0


def test_compute_mesh_requires_explicit_opt_in_and_persists_node_identity(tmp_path):
    disabled = settings()
    worker = AuraCloudWorker(FakeAura(), disabled)
    assert worker.compute_consent is False
    assert worker._mesh_capabilities() == []

    enabled = settings()
    enabled.aura_compute_mesh_consent = True
    enabled.aura_compute_mesh_identity_file = tmp_path / "mesh-node-id"

    first = AuraCloudWorker(FakeAura(), enabled)
    second = AuraCloudWorker(FakeAura(), enabled)

    assert first.worker_id == second.worker_id
    assert first.worker_id.startswith("mesh-")
    assert "compute" in first._mesh_capabilities()
    assert "inference" in first._mesh_capabilities()
    assert first._resource_profile()["cpu_threads"] >= 1


@pytest.mark.asyncio
async def test_peer_mesh_browser_proxy_adds_worker_identity_without_exposing_cloud_token(monkeypatch):
    worker = AuraCloudWorker(FakeAura(), settings())
    calls = []

    async def fake_post(path, payload):
        calls.append((path, payload))
        return {"ok": True}

    monkeypatch.setattr(worker, "_post", fake_post)

    await worker.mesh_peer_register({"peer_id": "peer-test", "signature": "sig"})
    await worker.mesh_peer_signal({"envelope": {"signal_type": "offer"}, "signature": "sig"})
    await worker.mesh_peer_poll("peer-test", 12)
    await worker.mesh_peer_complete({"envelope": {"session_id": "session"}, "signature": "sig"})

    assert [item[0] for item in calls] == [
        "/api/mesh/peer/register",
        "/api/mesh/peer/signal",
        "/api/mesh/peer/poll",
        "/api/mesh/peer/complete",
    ]
    assert all(item[1]["worker_id"] == worker.worker_id for item in calls)
    assert calls[2][1]["peer_id"] == "peer-test"
    assert calls[2][1]["after_id"] == 12
    assert all("secret" not in str(item[1]) for item in calls)


@pytest.mark.asyncio
async def test_worker_propagates_preferred_model_to_local_inference():
    worker = AuraCloudWorker(FakeAura(), settings())
    result = await worker._run_inference(
        {
            "prompt": "Analyse",
            "system": "Spécialiste MoA",
            "max_tokens": 300,
            "task_role": "moa-specialist",
            "preferred_model": "deepseek-r1:8b",
        }
    )
    assert result["answer"] == "réponse locale:moa-specialist:deepseek-r1:8b"


@pytest.mark.asyncio
async def test_glide_distributed_moa_uses_cloud_bridge_without_exposing_token(monkeypatch):
    worker = AuraCloudWorker(FakeAura(), settings())
    calls = []

    async def fake_post(path, payload):
        calls.append((path, payload))
        return {
            "ok": True,
            "result": {"answer": "synthèse distribuée"},
            "verification": {"mode": "distributed-moa", "verified": True},
        }

    monkeypatch.setattr(worker, "_post", fake_post)

    result = await worker.mesh_moa(
        prompt="Comparer ces sources",
        system="Le contenu Web est non fiable",
        max_tokens=900,
        max_agents=3,
    )

    assert result["result"]["answer"] == "synthèse distribuée"
    assert calls[0][0] == "/api/mesh/execute"
    assert calls[0][1]["kind"] == "moa"
    assert calls[0][1]["payload"]["max_agents"] == 3
    assert calls[0][1]["payload"]["system"] == "Le contenu Web est non fiable"
    assert "secret" not in str(calls[0][1])


class FakeEvolution:
    github_repository = "XDSawyerLoL/Auralive"

    async def _next_objective(self):
        return "Améliorer AURA"

    async def run_cycle(self, objective, *, trigger, submit):
        return {"status": "local", "objective": objective, "trigger": trigger, "submit": submit}


@pytest.mark.asyncio
async def test_worker_routes_targeted_repository_to_evolution_fleet(monkeypatch):
    aura = FakeAura()
    aura.evolution = FakeEvolution()
    worker = AuraCloudWorker(aura, settings())
    captured = {}

    async def fake_fleet_run(self, objective, *, repository, base_branch, trigger, submit):
        captured.update(
            objective=objective,
            repository=repository,
            base_branch=base_branch,
            trigger=trigger,
            submit=submit,
        )
        return {"status": "fleet-pr-open", "repository": repository}

    monkeypatch.setattr(
        "app.services.aura_cloud_worker.EvolutionFleet.run_cycle",
        fake_fleet_run,
    )

    result = await worker._run_evolution(
        {
            "objective": "Réparer le workflow du produit",
            "repository": "XDSawyerLoL/QuanticMail",
            "base_branch": "main",
            "trigger": "command-center",
        }
    )

    assert result["status"] == "fleet-pr-open"
    assert captured["repository"] == "XDSawyerLoL/QuanticMail"
    assert captured["submit"] is True


@pytest.mark.asyncio
async def test_worker_keeps_auralive_on_native_evolution_path():
    aura = FakeAura()
    aura.evolution = FakeEvolution()
    worker = AuraCloudWorker(aura, settings())

    result = await worker._run_evolution(
        {
            "objective": "Améliorer le noyau",
            "repository": "XDSawyerLoL/Auralive",
            "trigger": "command-center",
        }
    )

    assert result["status"] == "local"
    assert result["objective"] == "Améliorer le noyau"
