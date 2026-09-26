from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.cognitive.evolution_fleet import EvolutionFleet


class FakeLab:
    github_repository = "XDSawyerLoL/Auralive"

    def __init__(self):
        self.settings = SimpleNamespace(
            evolution_github_allowed_repositories=(
                "XDSawyerLoL/Auralive,"
                "XDSawyerLoL/QuanticSillage,"
                "XDSawyerLoL/QuanticMail,"
                "XDSawyerLoL/QUANTIC-OS,"
                "XDSawyerLoL/Quantic-Browser,"
                "XDSawyerLoL/Human-Agency-Engine"
            )
        )

    @staticmethod
    def _scan_patch(before: str, after: str, *, auto: bool):
        return []


def test_fleet_accepts_only_explicit_quantic_repositories():
    fleet = EvolutionFleet(FakeLab())
    assert fleet.validate_repository("XDSawyerLoL/QuanticMail") == "XDSawyerLoL/QuanticMail"
    assert fleet.validate_repository("xdsawyerlol/quantic-browser") == "XDSawyerLoL/Quantic-Browser"
    with pytest.raises(RuntimeError, match="hors allowlist"):
        fleet.validate_repository("someone/unknown")
    with pytest.raises(RuntimeError, match="sas Evolution local"):
        fleet.validate_repository("XDSawyerLoL/Auralive")


def test_fleet_path_policy_blocks_sensitive_and_cross_product_surfaces():
    fleet = EvolutionFleet(FakeLab())
    ok, _ = fleet.path_allowed("XDSawyerLoL/QuanticMail", "standalone-relay/main.ts")
    assert ok is True

    for path in (
        ".github/workflows/release.yml",
        "lib/security/crypto.ts",
        "app/auth/session.ts",
        ".env",
        "README.md",
    ):
        allowed, _ = fleet.path_allowed("XDSawyerLoL/QuanticMail", path)
        assert allowed is False, path

    allowed, _ = fleet.path_allowed("XDSawyerLoL/QuanticMail", "services/qagent.py")
    assert allowed is False


def test_fleet_v1_never_declares_cross_product_auto_merge():
    fleet = EvolutionFleet(FakeLab())
    assert fleet.VERSION == "aura-evolution-fleet-v1"
