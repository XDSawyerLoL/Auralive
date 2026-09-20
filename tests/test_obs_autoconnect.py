from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "app" / "config.py"
ENV_EXAMPLE = ROOT / ".env.example"


def test_obs_is_not_auto_connected_or_selected_anymore() -> None:
    source = CONFIG.read_text(encoding="utf-8")
    assert 'obs_auto_connect: bool = False' in source
    assert 'obs_enabled: bool = False' in source
    assert 'broadcast_engine: str = "native"' in source
    assert '_OBS_LOCAL: dict[str, object] = {}' in source


def test_env_example_does_not_enable_obs() -> None:
    source = ENV_EXAMPLE.read_text(encoding="utf-8")
    assert "AURA_BROADCAST_ENGINE=native" in source
    assert "OBS_AUTO_CONNECT=true" not in source
    assert "OBS_ENABLED=true" not in source
