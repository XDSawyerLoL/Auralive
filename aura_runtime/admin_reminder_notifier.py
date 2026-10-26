"""Hourly interactive reminder check for a single user-authorized folder.

This file can run directly under Windows Task Scheduler (working directory
does not matter). Failure/partial scans never acknowledge reminders.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from aura_runtime.admin_durable import DurableReviews, local_db_path
    from aura_runtime.admin_portfolio import analyze_portfolio
    from aura_runtime.admin_followup import build_followup_board
else:
    from .admin_durable import DurableReviews, local_db_path
    from .admin_portfolio import analyze_portfolio
    from .admin_followup import build_followup_board


def check_due(root: Path) -> tuple[DurableReviews | None, dict]:
    folder = root.expanduser().resolve(strict=True)
    if not folder.is_dir():
        raise NotADirectoryError(str(folder))
    db_file = local_db_path(folder)
    if not db_file.is_file():
        return None, {"state": "not-configured", "due": []}
    store = DurableReviews(db_file)
    pending = store.due_reminders()
    if not pending:
        return store, {"state": "no-approved-reminders-due", "due": []}
    fresh = build_followup_board(analyze_portfolio(folder))
    if fresh.get("partial"):
        return store, {"state": "document-recheck-incomplete", "due": []}
    store.save_snapshot(fresh)
    return store, {"state": "verified-before-alert",
                   "due": store.due_reminders()[:10]}


def run(root: Path, *, show_alert: bool = True) -> dict:
    store, status = check_due(root)
    due = status.get("due") or []
    if not due or not show_alert:
        return {"ok": True, "state": status["state"], "shown": 0}
    # Only the explicitly logged-in Windows session can display this alert.
    import tkinter as tk
    from tkinter import messagebox
    window = tk.Tk()
    window.withdraw()
    try:
        displayed = messagebox.showinfo(
            "AURA — vérifications administratives",
            "\n".join(
                f"{item['title']} — {item['due_at']}"
                for item in due
            ) + "\n\nLes échéances et paiements restent à confirmer.",
        )
        # The native dialog is blocking: only after it has been shown to the
        # logged-in user and closed can the notifier acknowledge delivery.
        if displayed != "ok":
            return {"ok": False, "state": "not-confirmed-shown", "shown": 0}
        for item in due:
            store.acknowledge_reminder(item["id"])
        return {"ok": True, "state": "shown-and-acknowledged", "shown": len(due)}
    finally:
        window.destroy()


def main() -> int:
    parser = argparse.ArgumentParser(description="Rappels administratifs locaux AURA")
    parser.add_argument("--root", required=True)
    parser.add_argument("--dry-run", action="store_true",
                        help="Vérifier sans montrer ni acquitter de notifications")
    args = parser.parse_args()
    try:
        result = run(Path(args.root), show_alert=not args.dry_run)
    except Exception as error:
        result = {"ok": False, "state": "error",
                  "error_type": type(error).__name__}
    # No document names, values, source excerpts or local folder paths in logs.
    if args.dry_run:
        print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
