from __future__ import annotations

from argparse import Namespace
import hashlib
from pathlib import Path

import pytest

from aura_runtime.personal_tasks import backup_file, compare_text, search_text, summarize_csv
from aura_runtime.personal_cli import execute_command
from aura_runtime.personal_benchmark import run_benchmark
from aura_runtime.operator import RuntimeOperator
from test_aura_runtime_operator import FakeAI, settings


def test_search_finds_an_actual_text_and_skips_hidden_files(tmp_path):
    (tmp_path / "notes.txt").write_text("Rendez-vous mardi\nPayer facture vendredi\n", encoding="utf-8")
    (tmp_path / ".env").write_text("payer facture confidentiel", encoding="utf-8")
    result = search_text(tmp_path, "facture")
    assert result["matches_count"] == 1
    assert result["matches"][0]["file"] == "notes.txt"
    assert result["matches"][0]["line"] == 2
    assert result["matches"][0]["file_sha256"] == hashlib.sha256(
        (tmp_path / "notes.txt").read_bytes()
    ).hexdigest()


def test_real_budget_csv_with_french_decimal_separator(tmp_path):
    source = tmp_path / "mes_depenses.csv"
    source.write_text("categorie;montant\nCourses;12,50\nTransport;3,20\nCafé;2,30\n", encoding="utf-8")
    result = summarize_csv(source)
    assert result["rows"] == 3
    assert result["numeric"]["montant"]["sum"] == "18.00"
    assert result["numeric"]["montant"]["count"] == 3
    assert result["source_sha256"] == hashlib.sha256(source.read_bytes()).hexdigest()


def test_real_text_comparison_reports_diff(tmp_path):
    old = tmp_path / "v1.md"
    new = tmp_path / "v2.md"
    old.write_text("Bonjour\nAncien\n", encoding="utf-8")
    new.write_text("Bonjour\nNouveau\n", encoding="utf-8")
    result = compare_text(old, new)
    assert result["identical"] is False
    assert "-Ancien" in result["diff_lines"]
    assert "+Nouveau" in result["diff_lines"]


def test_backup_makes_verified_copy_without_overwriting_original(tmp_path):
    source = tmp_path / "important.txt"
    source.write_text("Texte important et privé", encoding="utf-8")
    result, rollback = backup_file(source)
    target = Path(result["backup"])
    assert target != source
    assert target.read_bytes() == source.read_bytes()
    assert result["sha256"] == hashlib.sha256(target.read_bytes()).hexdigest()
    assert rollback["created"] is True


def test_files_oversize_and_symlink_are_rejected(tmp_path):
    big = tmp_path / "oversize.txt"
    big.write_bytes(b"A" * 200_001)
    with pytest.raises(ValueError, match="volumineux"):
        compare_text(big, big)
    source = tmp_path / "original.txt"
    source.write_text("secret", encoding="utf-8")
    link = tmp_path / "symlink.txt"
    try:
        link.symlink_to(source)
    except (OSError, NotImplementedError):
        pytest.skip("symlinks not permitted on this machine")
    with pytest.raises(ValueError, match="symbolique"):
        compare_text(link, source)


def test_csv_invalid_data_cannot_be_counted_as_numeric(tmp_path):
    malformed = tmp_path / "malformed.csv"
    malformed.write_text("a,b\n1,2,3\n", encoding="utf-8")
    with pytest.raises(ValueError, match="malformé"):
        summarize_csv(malformed)
    nan = tmp_path / "nan.csv"
    nan.write_text("amount\nNaN\nInfinity\n", encoding="utf-8")
    assert not summarize_csv(nan)["numeric"]


@pytest.mark.asyncio
async def test_cli_runs_real_search_inside_user_selected_folder(tmp_path):
    (tmp_path / "notes.txt").write_text("Consulter la banque vendredi", encoding="utf-8")
    result = await execute_command(Namespace(
        root=str(tmp_path), command="search", path=".", query="banque"
    ))
    assert result["executed"] is True
    assert result["steps"][0]["matches_count"] == 1


@pytest.mark.asyncio
async def test_cli_refuses_path_escape(tmp_path):
    result = await execute_command(Namespace(
        root=str(tmp_path), command="search", path="../", query="banque"
    ))
    assert result["executed"] is False
    assert "hors workspace" in result["error"]


@pytest.mark.asyncio
async def test_cli_backup_is_independently_verified(tmp_path):
    source = tmp_path / "notes.txt"
    source.write_text("Texte à sauvegarder", encoding="utf-8")
    result = await execute_command(Namespace(
        root=str(tmp_path), command="backup", path="notes.txt"
    ))
    assert result["executed"] is True
    receipt = result["steps"][0]
    assert receipt["verified"] is True
    assert Path(receipt["backup"]).read_bytes() == source.read_bytes()


@pytest.mark.asyncio
async def test_operator_refuses_backup_without_write_permission(tmp_path):
    (tmp_path / "notes.txt").write_text("original", encoding="utf-8")
    operator = RuntimeOperator(FakeAI(), settings(tmp_path))
    result = await operator.operate(
        '{"actions":[{"type":"files.backup","path":"notes.txt"}]}',
        requested_risks={"safe"},
    )
    assert result["executed"] is False
    assert list(tmp_path.glob("*.bak")) == []


@pytest.mark.asyncio
async def test_operator_rolls_back_backup_when_next_step_fails(tmp_path):
    (tmp_path / "notes.txt").write_text("original", encoding="utf-8")
    operator = RuntimeOperator(FakeAI(), settings(tmp_path))
    result = await operator.operate(
        '{"actions":[{"type":"files.backup","path":"notes.txt"},'
        '{"type":"process.run","command":"bash","args":[]}]}',
        requested_risks={"local-write", "process"},
    )
    assert result["executed"] is False
    assert list(tmp_path.glob("*.bak")) == []
    assert result["rollback"][0]["type"] == "files.backup"
    assert result["rollback"][0]["ok"] is True


@pytest.mark.asyncio
async def test_real_world_benchmark_is_measured_without_llm_or_network():
    report = await run_benchmark()
    assert report["checks_total"] == 7
    assert report["checks_passed"] == 7
    assert report["ok"] is True
    assert report["network_calls"] == 0
    assert report["model_calls"] == 0
