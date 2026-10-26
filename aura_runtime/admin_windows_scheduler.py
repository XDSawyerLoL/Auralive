"""Consent-only Windows Task Scheduler registration for local AURA reminders.

No VPS, internet, permanent background daemon, or startup registry edits.
The user explicitly enables or disables each folder's hourly task.
"""
from __future__ import annotations

from hashlib import sha256
from pathlib import Path
import os
import subprocess
import sys


def task_name(root: Path) -> str:
    folder = root.expanduser().resolve(strict=True)
    if not folder.is_dir():
        raise NotADirectoryError(str(folder))
    digest = sha256(os.fsencode(str(folder))).hexdigest()[:16]
    return f"AURA-Administrative-Reminder-{digest}"


def task_command(root: Path, *, interpreter: Path | None = None) -> str:
    """Registered action quotes only fixed Python executable and chosen folder."""
    script = Path(__file__).resolve().with_name("admin_reminder_notifier.py")
    if not script.is_file():
        raise FileNotFoundError(str(script))
    python = Path(interpreter or sys.executable).resolve()
    pythonw = python.with_name("pythonw.exe")
    if pythonw.is_file():
        python = pythonw
    if any('"' in str(item) for item in (python, script, root)):
        raise ValueError("Guillemets interdits dans les chemins")
    return f'"{python}" "{script}" --root "{root}"'


def scheduled_task(root: Path, *, enable: bool, execute=subprocess.run) -> dict:
    """Create/remove an interactive, non-elevated Windows job by explicit UI action.

    It runs at a bounded hourly cadence only while the user is logged in.
    No task is ever created by import or by analysis of a document.
    """
    if sys.platform != "win32":
        raise RuntimeError("Le Planificateur de tâches de Windows est requis")
    folder = root.expanduser().resolve(strict=True)
    if not folder.is_dir():
        raise NotADirectoryError(str(folder))
    name = task_name(folder)
    if enable:
        action = task_command(folder)
        command = [
            "schtasks.exe", "/create", "/f", "/sc", "MINUTE", "/mo", "60",
            "/tn", name, "/tr", action, "/it", "/rl", "LIMITED",
        ]
    else:
        command = ["schtasks.exe", "/delete", "/tn", name, "/f"]
    outcome = execute(
        command, timeout=15, check=False, capture_output=True, text=True,
        shell=False,
    )
    if outcome.returncode != 0:
        # Never copy system stderr into chats; it may include private paths.
        raise RuntimeError(f"Planificateur de tâches Windows : code {outcome.returncode}")
    return {
        "ok": True, "enabled": bool(enable), "task_name": name,
        "cadence_minutes": 60 if enable else 0, "interactive_only": True,
        "user_consent_required": True, "paid_calls": 0,
    }
