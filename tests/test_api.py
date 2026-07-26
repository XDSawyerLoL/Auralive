from pathlib import Path

from fastapi.testclient import TestClient

from auralive.api import create_app
from auralive.runtime import AuraRuntime


def test_api_crud_simulation_and_emergency(tmp_path: Path) -> None:
    runtime = AuraRuntime(database_path=tmp_path / "aura.db", services={})
    app = create_app(runtime)
    document = {
        "id": "api-test",
        "name": "Test API",
        "trigger": "internal.test",
        "enabled": True,
        "actions": [
            {
                "type": "variables.set",
                "config": {"scope": "global", "name": "message", "value": "{{event.message}}"},
            }
        ],
    }

    with TestClient(app) as client:
        assert client.get("/").status_code == 200
        health = client.get("/api/health").json()
        assert health["ok"] is True
        assert health["actions"] >= 20

        saved = client.post("/api/automations", json=document)
        assert saved.status_code == 200
        assert saved.json()["id"] == "api-test"
        assert len(client.get("/api/automations").json()) == 1

        simulation = client.post(
            "/api/automations/api-test/simulate",
            json={"type": "internal.test", "payload": {"message": "bonjour"}},
        )
        assert simulation.status_code == 200
        assert simulation.json()["steps"][0]["output"]["config"]["value"] == "bonjour"

        emergency = client.post("/api/emergency", json={"active": True})
        assert emergency.json() == {"active": True}
        assert client.get("/api/health").json()["emergency"] is True

        assert client.delete("/api/automations/api-test").status_code == 204
        assert client.get("/api/automations").json() == []


def test_catalog_exposes_native_platform_nodes(tmp_path: Path) -> None:
    app = create_app(AuraRuntime(database_path=tmp_path / "aura.db", services={}))
    with TestClient(app) as client:
        catalog = client.get("/api/catalog").json()

    action_names = {item["name"] for item in catalog["actions"]}
    trigger_names = {item["type"] for item in catalog["triggers"]}
    assert "twitch.chat.send" in action_names
    assert "obs.scene.switch" in action_names
    assert "mairaiy.ask" in action_names
    assert "twitch.follow" in trigger_names
    assert "obs.scene.changed" in trigger_names
