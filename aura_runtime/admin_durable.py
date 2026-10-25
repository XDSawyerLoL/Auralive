"""Local durable AURA review/approval/reminder journal (stdlib SQLite only).

No network, no model, no autonomous financial action, no implicit notification.
Only an explicit human action may mark a review or approve a reminder.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import os
import re
import sqlite3
from typing import Any
from uuid import uuid4

TASK_RE = re.compile(r"^[a-f0-9]{16}$")
VALID_DECISIONS = {"reviewed", "dismissed"}


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def local_db_path(folder: Path) -> Path:
    """State lives outside analyzed documents; one DB per authorized folder."""
    root = folder.expanduser().resolve(strict=True)
    if not root.is_dir():
        raise NotADirectoryError(str(root))
    base = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / ".aura"))
    code = sha256(os.fsencode(str(root))).hexdigest()[:24]
    return base / "AURA" / "administratif" / f"{code}.sqlite3"


def _digest(task: dict[str, Any]) -> str:
    evidence = {name: task.get(name) for name in ("id", "category", "title", "detail", "source", "evidence")}
    return sha256(json.dumps(evidence, ensure_ascii=False, sort_keys=True,
                             separators=(",", ":")).encode("utf-8")).hexdigest()


class DurableReviews:
    """Local persistence only; not a remote authorization endpoint."""

    def __init__(self, path: Path):
        self.path = Path(path).expanduser().absolute()
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if self.path.is_symlink() or self.path.parent.is_symlink():
            raise PermissionError("Base AURA ou répertoire sous forme de lien symbolique interdit")
        if self.path.exists() and not self.path.is_file():
            raise PermissionError("La base locale n'est pas un fichier régulier")
        with self._open() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS reviews (
                    task_id TEXT PRIMARY KEY, category TEXT NOT NULL,
                    title TEXT NOT NULL, source TEXT NOT NULL,
                    proof_digest TEXT NOT NULL, status TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1,
                    first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
                    reviewed_at TEXT
                );
                CREATE TABLE IF NOT EXISTS reminders (
                    id TEXT PRIMARY KEY, task_id TEXT NOT NULL,
                    due_at TEXT NOT NULL, state TEXT NOT NULL,
                    created_at TEXT NOT NULL, approved_at TEXT,
                    acknowledged_at TEXT,
                    FOREIGN KEY(task_id) REFERENCES reviews(task_id)
                );
                CREATE INDEX IF NOT EXISTS reminders_due ON reminders(state, due_at);
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    at TEXT NOT NULL, event TEXT NOT NULL,
                    target TEXT NOT NULL
                );
            """)
        if os.name != "nt":
            os.chmod(self.path, 0o600)

    @contextmanager
    def _open(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA foreign_keys=ON")
            db.execute("PRAGMA busy_timeout=10000")
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("PRAGMA synchronous=FULL")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def _event(self, db: sqlite3.Connection, event: str, target: str) -> None:
        db.execute("INSERT INTO events(at,event,target) VALUES (?,?,?)", (utcnow(), event, target))

    def save_snapshot(self, board: dict[str, Any]) -> dict[str, int | bool]:
        """Persist metadata, not document contents or excerpts.

        A changed evidence digest invalidates a previous review and cancels
        its pending reminder. Partial scans cannot retire unobserved tasks.
        """
        if not (board.get("type") == "admin.followup" and board.get("ok") is True
                and board.get("verified") is True and board.get("read_only") is True):
            raise ValueError("Tableau non vérifié : aucune sauvegarde")
        tasks = board.get("tasks")
        if not isinstance(tasks, list) or len(tasks) > 80 or board.get("task_count") != len(tasks):
            raise ValueError("Tableau incomplet, malformé ou trop long")
        ids = [task.get("id") for task in tasks if isinstance(task, dict)]
        if len(ids) != len(tasks) or len(set(ids)) != len(ids) or any(
            not isinstance(item, str) or not TASK_RE.fullmatch(item) for item in ids
        ):
            raise ValueError("Identifiants de tâches invalides ou dupliqués")
        added = changed = 0
        with self._open() as db:
            db.execute("BEGIN IMMEDIATE")
            for task in tasks:
                key = task["id"]
                proof = _digest(task)
                title = str(task.get("title") or "")[:120]
                source = str(task.get("source") or "")[:240]
                category = str(task.get("category") or "")[:64]
                if not title or not source or not category:
                    raise ValueError("Tâche sans titre, source ou catégorie")
                existing = db.execute(
                    "SELECT proof_digest FROM reviews WHERE task_id=?", (key,)
                ).fetchone()
                stamp = utcnow()
                if existing is None:
                    db.execute("""INSERT INTO reviews
                        (task_id,category,title,source,proof_digest,status,active,first_seen,last_seen)
                        VALUES (?,?,?,?,?,'pending',1,?,?)""",
                        (key, category, title, source, proof, stamp, stamp))
                    added += 1
                    self._event(db, "task_observed", key)
                elif existing["proof_digest"] != proof:
                    db.execute("""UPDATE reviews SET category=?,title=?,source=?,proof_digest=?,
                        status='pending',active=1,last_seen=?,reviewed_at=NULL WHERE task_id=?""",
                        (category, title, source, proof, stamp, key))
                    db.execute("""UPDATE reminders SET state='cancelled'
                        WHERE task_id=? AND state IN ('proposed','approved')""", (key,))
                    changed += 1
                    self._event(db, "evidence_changed_review_reset", key)
                else:
                    db.execute("UPDATE reviews SET active=1,last_seen=? WHERE task_id=?", (stamp, key))
            if not board.get("partial", True):
                if ids:
                    db.execute("UPDATE reviews SET active=0 WHERE task_id NOT IN (" +
                               ",".join("?" for _ in ids) + ")", ids)
                else:
                    db.execute("UPDATE reviews SET active=0")
                db.execute("""UPDATE reminders SET state='cancelled' WHERE
                    state IN ('proposed','approved') AND task_id IN
                    (SELECT task_id FROM reviews WHERE active=0)""")
            self._event(db, "snapshot_recorded", f"{len(tasks)} tasks")
        return {"saved": len(tasks), "new": added, "changed_reset": changed,
                "partial": bool(board.get("partial"))}

    def list_reviews(self, *, active_only: bool = True) -> list[dict[str, Any]]:
        with self._open() as db:
            rows = db.execute("""SELECT task_id,category,title,source,status,active,last_seen
                FROM reviews WHERE active=1 ORDER BY category,task_id""" if active_only else
                "SELECT task_id,category,title,source,status,active,last_seen FROM reviews ORDER BY category,task_id")
            return [dict(row) for row in rows]

    def decide(self, task_id: str, decision: str) -> None:
        if not TASK_RE.fullmatch(task_id) or decision not in VALID_DECISIONS:
            raise ValueError("Décision ou identifiant invalide")
        with self._open() as db:
            db.execute("BEGIN IMMEDIATE")
            task = db.execute("SELECT active FROM reviews WHERE task_id=?", (task_id,)).fetchone()
            if task is None or not task["active"]:
                raise ValueError("Tâche inactive ou inconnue")
            db.execute("UPDATE reviews SET status=?,reviewed_at=? WHERE task_id=?",
                       (decision, utcnow(), task_id))
            if decision == "dismissed":
                db.execute("UPDATE reminders SET state='cancelled' WHERE task_id=? AND state IN ('proposed','approved')", (task_id,))
            self._event(db, "human_" + decision, task_id)

    def propose_reminder(self, task_id: str, when: str) -> str:
        if not TASK_RE.fullmatch(task_id):
            raise ValueError("Tâche inconnue")
        try:
            due = datetime.fromisoformat(when)
        except ValueError as exc:
            raise ValueError("Date ISO invalide") from exc
        if due.tzinfo is None or due.utcoffset() is None:
            raise ValueError("Une heure avec fuseau est obligatoire, par exemple +01:00")
        due = due.astimezone(timezone.utc)
        if due <= datetime.now(timezone.utc):
            raise ValueError("Rappel dans le passé")
        key = uuid4().hex
        with self._open() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT status,active FROM reviews WHERE task_id=?", (task_id,)).fetchone()
            if row is None or row["status"] != "reviewed" or not row["active"]:
                raise ValueError("La vérification doit être revue par l'utilisateur d'abord")
            db.execute("INSERT INTO reminders(id,task_id,due_at,state,created_at) VALUES (?,?,?,'proposed',?)",
                       (key, task_id, due.isoformat(), utcnow()))
            self._event(db, "reminder_proposed", key)
        return key

    def approve_reminder(self, reminder_id: str) -> None:
        with self._open() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("""SELECT r.state,v.status,v.active FROM reminders r
                JOIN reviews v ON v.task_id=r.task_id WHERE r.id=?""", (reminder_id,)).fetchone()
            if row is None or row["state"] != "proposed" or row["status"] != "reviewed" or not row["active"]:
                raise ValueError("Approbation impossible sans décision humaine valide")
            db.execute("UPDATE reminders SET state='approved',approved_at=? WHERE id=?",
                       (utcnow(), reminder_id))
            self._event(db, "reminder_approved", reminder_id)

    def due_reminders(self, *, at: datetime | None = None) -> list[dict[str, str]]:
        now = at or datetime.now(timezone.utc)
        if now.tzinfo is None:
            raise ValueError("Horodatage sans fuseau")
        with self._open() as db:
            rows = db.execute("""SELECT r.id,r.task_id,r.due_at,v.title FROM reminders r
                JOIN reviews v ON v.task_id=r.task_id
                WHERE r.state='approved' AND v.status='reviewed' AND v.active=1
                  AND r.due_at<=? ORDER BY r.due_at,r.id LIMIT 50""",
                (now.astimezone(timezone.utc).isoformat(),))
            return [dict(x) for x in rows]

    def acknowledge_reminder(self, reminder_id: str) -> None:
        """Call only *after* the local UI actually presents the notification."""
        with self._open() as db:
            db.execute("BEGIN IMMEDIATE")
            result = db.execute("""UPDATE reminders SET state='acknowledged',acknowledged_at=?
                WHERE id=? AND state='approved'""", (utcnow(), reminder_id))
            if result.rowcount != 1:
                raise ValueError("Rappel inconnu ou déjà traité")
            self._event(db, "reminder_display_acknowledged", reminder_id)

    def audit_events(self) -> list[dict[str, Any]]:
        with self._open() as db:
            return [dict(row) for row in db.execute(
                "SELECT at,event,target FROM events ORDER BY id DESC LIMIT 100")]
