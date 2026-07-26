from pathlib import Path


def test_windows_dependency_probe_is_non_fatal_and_repairs_missing_imports():
    script = Path("scripts/run.ps1").read_text(encoding="utf-8-sig")

    assert "function Test-AuraPythonImports" in script
    assert '$ErrorActionPreference = "Continue"' in script
    assert "2>&1" in script
    assert "$exitCode = $LASTEXITCODE" in script
    assert "$ErrorActionPreference = $previousPreference" in script
    assert "$ImportsReady = Test-AuraPythonImports" in script
    assert "pip install -r $RequirementsPath" in script
    assert "PIL" in script
