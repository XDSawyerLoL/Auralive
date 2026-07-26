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
    assert "/api/avatar/runtime" in paths
    assert "/voice-control" in paths
    assert "/api/voice/status" in paths
    assert "/api/voice/talk" in paths
    assert "/api/cohost/status" in paths
    assert "/api/cohost/profile" in paths
    assert "/api/cohost/screen/analyze" in paths
    assert "/api/cohost/test/initiative" in paths
    assert "/api/cohost/test/cta" in paths
    assert "/api/twitch/eventsub" in paths
    assert "/api/twitch/oauth" in paths
    assert "/api/security/diagnostic" in paths
    assert "/api/security/block-domain" in paths
    assert app.version == "2.1.0-alpha"
