from app.main_v2 import app


def test_v2_keeps_legacy_routes_and_adds_automation_studio():
    paths = {getattr(route, "path", "") for route in app.routes}
    legacy = {
        "/",
        "/api/status",
        "/api/commands",
        "/overlay",
        "/overlay/avatar",
        "/ws/overlay",
    }
    assert legacy.issubset(paths)
    assert "/automation" in paths
    assert "/api/automation/catalog" in paths
    assert "/api/automation/definitions" in paths
    assert app.version == "2.0.1-alpha"
