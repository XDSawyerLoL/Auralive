"""No real scheduled task is installed by these offline Windows API tests."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from aura_runtime import admin_windows_scheduler
from aura_runtime.admin_reminder_notifier import check_due, run
from aura_runtime.admin_durable import DurableReviews, local_db_path
from aura_runtime.admin_followup import build_followup_board
from aura_runtime.admin_portfolio import analyze_portfolio
from aura_runtime.pdf_benchmark import _make_pdf


def fixtures(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "appdata"))
    root = tmp_path / "dossiers"
    root.mkdir()
    (root / "facture_client.pdf").write_bytes(
        _make_pdf("Facture N: FAC-2026-001 Date limite 30/11/2026 Total TTC 123,45 EUR")
    )
    (root / "operations.csv").write_text(
        "reference;montant\nFAC-2026-001;-123,45\n", encoding="utf8"
    )
    db = DurableReviews(local_db_path(root))
    board = build_followup_board(analyze_portfolio(root))
    db.save_snapshot(board)
    candidate = next(t for t in board["tasks"] if t["category"] == "rapprochements")
    db.decide(candidate["id"], "reviewed")
    identifier = db.propose_reminder(
        candidate["id"], (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    )
    db.approve_reminder(identifier)
    return root, db, identifier


def test_task_scheduler_registers_only_by_explicit_function_call(tmp_path, monkeypatch):
    monkeypatch.setattr(admin_windows_scheduler.sys, "platform", "win32")
    root = tmp_path / "dossier"
    root.mkdir()
    commands = []
    def fake_run(args, **kwargs):
        commands.append((args, kwargs))
        return SimpleNamespace(returncode=0)
    result = admin_windows_scheduler.scheduled_task(
        root, enable=True, execute=fake_run
    )
    assert result["enabled"] and result["interactive_only"]
    args, kwargs = commands[0]
    assert args[0] == "schtasks.exe"
    assert "/it" in args and "/rl" in args and "LIMITED" in args
    assert "60" in args and "--root" in args[args.index("/tr") + 1]
    assert kwargs["shell"] is False
    assert "HIGHEST" not in args


def test_scheduler_can_be_removed_without_touching_database(tmp_path, monkeypatch):
    monkeypatch.setattr(admin_windows_scheduler.sys, "platform", "win32")
    folder = tmp_path / "dossier"
    folder.mkdir()
    commands = []
    def fake_run(args, **kwargs):
        commands.append(args)
        return SimpleNamespace(returncode=0)
    admin_windows_scheduler.scheduled_task(folder, enable=False, execute=fake_run)
    assert "/delete" in commands[0]
    assert "/create" not in commands[0]


def test_no_database_means_no_notification(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "appdata"))
    folder = tmp_path / "dossier"
    folder.mkdir()
    assert run(folder, show_alert=False)["state"] == "not-configured"


def test_future_reminder_causes_no_early_notification(tmp_path, monkeypatch):
    root, db, reminder = fixtures(tmp_path, monkeypatch)
    assert check_due(root)[1]["state"] == "no-approved-reminders-due"
    assert run(root, show_alert=False)["shown"] == 0


def test_changed_invoice_invalidates_approved_reminder_before_alert(tmp_path, monkeypatch):
    root, db, reminder = fixtures(tmp_path, monkeypatch)
    # Simulate the due date: we don't bypass the database checks by faking
    # a clock. Only documents drift is tested here.
    (root / "facture_client.pdf").write_bytes(
        _make_pdf("Facture N: FAC-2026-001 Date limite 30/11/2026 Total TTC 223,45 EUR")
    )
    assert check_due(root)[1]["state"] == "no-approved-reminders-due"
    # On its actual due date, the check re-analyzes and cancels the stale item.
    assert db.due_reminders(at=datetime.now(timezone.utc)+timedelta(days=2))


def test_partial_document_recheck_keeps_approved_reminder(tmp_path, monkeypatch):
    root, db, reminder = fixtures(tmp_path, monkeypatch)
    # Existing approved reminder is not due until tomorrow.
    # Bad input must never automatically cancel it on an incomplete scan.
    (root / "operations.csv").write_text(
        "INVALID_HEADER;montant\nx;-123,45\n", encoding="utf8"
    )
    board = build_followup_board(analyze_portfolio(root))
    assert board["partial"]
    assert db.due_reminders(at=datetime.now(timezone.utc)+timedelta(days=2))
    assert db.list_reviews()
