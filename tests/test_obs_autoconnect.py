from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "app" / "config.py"
ENV_EXAMPLE = ROOT / ".env.example"


def test_obs_local_websocket_is_auto_discovered_by_default() -> None:
    source = CONFIG.read_text(encoding="utf-8")
    assert 'OBS_AUTO_CONNECT", True' in source
    assert 'OBS_DISCOVER_LOCAL", True' in source
    assert 'plugin_config" / "obs-websocket" / "config.json"' in source
    assert 'server_port' in source
    assert 'server_password' in source


def test_env_example_keeps_obs_autoconnect_enabled() -> None:
    source = ENV_EXAMPLE.read_text(encoding="utf-8")
    assert "OBS_AUTO_CONNECT=true" in source
    assert "OBS_DISCOVER_LOCAL=true" in source
