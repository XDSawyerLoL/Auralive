from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_runtime_heartbeat_declares_organism_version_without_uploading_state():
    source = (ROOT / "aura_runtime" / "worker.py").read_text(encoding="utf-8")
    start = source.index("async def _heartbeat")
    end = source.index("async def _claim", start)
    block = source[start:end]

    assert '"organism_version"' in block
    assert '"organism_schema_revision"' in block
    assert '"organism_updated_at"' in block
    assert '"organism": organism' not in block


def test_cloud_and_runtime_use_the_same_v9_homeostasis_version():
    cloud = (ROOT / "cloud-node" / "src" / "organism.js").read_text(encoding="utf-8")
    runtime = (ROOT / "app" / "cognitive" / "organism.py").read_text(encoding="utf-8")

    assert "homeostasie_v9_unified" in cloud
    assert "homeostasie_v9_unified" in runtime
    assert "homeostasie_v7_streamlined" not in runtime
    assert "homeostasie_v8_director" not in cloud
