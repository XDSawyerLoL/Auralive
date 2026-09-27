from pathlib import Path


def test_main_integrity_sentinel_guards_pr_only_main_flow():
    workflow = (
        Path(__file__).resolve().parents[1]
        / ".github"
        / "workflows"
        / "main-integrity-sentinel.yml"
    ).read_text(encoding="utf-8")
    assert "pull_request:" in workflow
    assert "push:" in workflow
    assert "branches: [main]" in workflow
    assert "/commits/$SHA/pulls" in workflow
    assert "Push direct sur main détecté" in workflow
    assert "gh issue create" in workflow
