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
    assert "/api/ai/runtime" in paths
    assert "/api/ai/recover" in paths
    assert "/api/security/diagnostic" in paths
    assert "/api/security/block-domain" in paths
    assert app.version == "2.0.2-alpha"
