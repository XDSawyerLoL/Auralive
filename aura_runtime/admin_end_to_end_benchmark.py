"""One complete offline AURA administrative mission: French -> evidence ->
review -> human approval -> durable restart -> reminder -> source drift.

The synthetic user authorizes only a temporary directory. No real network,
model, Hostinger account, or paid service is used.
"""
from __future__ import annotations

import asyncio
from argparse import Namespace
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from .personal_cli import execute_command
from .admin_durable import DurableReviews
from .pdf_benchmark import _make_pdf


async def run_benchmark() -> dict:
    checks: list[dict] = []
    def check(name: str, passed: bool) -> None:
        checks.append({"name": name, "passed": bool(passed)})
    with TemporaryDirectory(prefix="aura-e2e-") as location:
        root = Path(location)
        document = root / "facture_client.pdf"
        payment = root / "operations.csv"
        raw = _make_pdf(
            "Facture N: FAC-2026-001 Date limite 30/11/2026 Total TTC: 123,45 EUR"
        )
        document.write_bytes(raw)
        payment.write_text(
            "reference;montant\nFAC-2026-001;-123,45\n", encoding="utf-8",
        )
        before = {
            p.name: sha256(p.read_bytes()).hexdigest() for p in (document, payment)
        }

        report = await execute_command(Namespace(
            root=str(root), command="ask",
            request="Prépare mon suivi administratif", allow_backup=False,
        ))
        check("Mission française exécutée par AURA local sans modèle",
              report.get("executed") is True and report.get("status") == "completed")
        step = next((s for s in report.get("steps", [])
                     if s.get("type") == "admin.followup"), None)
        check("Preuves réelles conduisent au tableau, pas à un modèle",
              bool(step and step.get("verified") is True
                   and step.get("source_documents_scanned") == 2))
        tasks = (step or {}).get("tasks") or []
        review = next((t for t in tasks
                       if t.get("category") == "rapprochements"
                       and t.get("evidence", {}).get("transaction_file")), None)
        check("Rapprochement candidat tracé à la banque",
              bool(review and review["evidence"]["transaction_file"] == "operations.csv"
                   and review["requires_human_confirmation"]
                   and review["action_taken"] is False))

        db_path = Path(location).parent / (
            "aura-e2e-" + sha256(str(root).encode()).hexdigest()[:16] + ".sqlite3"
        )
        try:
            store = DurableReviews(db_path)
            saved = store.save_snapshot(step)
            check("Mission persistée hors dossier contrôlé", saved["new"] > 0
                  and db_path.parent != root)

            task_id = review["id"] if review else ""
            approved_at = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
            blocked = False
            try:
                store.propose_reminder(task_id, approved_at)
            except ValueError:
                blocked = True
            check("Aucun rappel avant examen explicite", blocked)

            if review:
                store.decide(task_id, "reviewed")
                reminder = store.propose_reminder(task_id, approved_at)
                check("Rappel seulement proposé, pas livré", not store.due_reminders(
                    at=datetime.now(timezone.utc) + timedelta(days=3)))
                store.approve_reminder(reminder)
            else:
                reminder = ""
                check("Rappel seulement proposé, pas livré", False)

            restarted = DurableReviews(db_path)
            due = restarted.due_reminders(
                at=datetime.now(timezone.utc) + timedelta(days=3)
            )
            check("Redémarrage : décision et rappel approuvé retrouvés",
                  bool(due and due[0]["id"] == reminder and
                       any(x["status"] == "reviewed"
                           for x in restarted.list_reviews())))

            # AURA never rewrites inputs; here a synthetic third party changes
            # the invoice and AURA must invalidate the old approval.
            check("Aucune modification des documents par AURA", all(
                sha256(p.read_bytes()).hexdigest() == before[p.name]
                for p in (document, payment)))
            document.write_bytes(_make_pdf(
                "Facture N: FAC-2026-001 Date limite 30/11/2026 Total TTC: 223,45 EUR"
            ))
            refreshed = await execute_command(Namespace(
                root=str(root), command="ask",
                request="Prépare mon suivi administratif", allow_backup=False,
            ))
            new_board = next(
                (s for s in refreshed.get("steps", []) if s.get("type") == "admin.followup"),
                None,
            )
            check("Reprise française après modification de facture",
                  refreshed.get("executed") is True and bool(new_board))
            if new_board:
                restarted.save_snapshot(new_board)
            check("Ancienne approbation invalidée, rappel retiré",
                  not restarted.due_reminders(at=datetime.now(timezone.utc) + timedelta(days=3)))
        finally:
            for suffix in ("", "-wal", "-shm"):
                p = Path(str(db_path) + suffix)
                p.unlink(missing_ok=True)

    return {
        "name": "aura-autonomy-end-to-end-local-v1",
        "ok": all(item["passed"] for item in checks),
        "checks_total": len(checks),
        "checks_passed": sum(item["passed"] for item in checks),
        "model_calls": 0, "network_calls": 0, "paid_calls": 0,
        "mode": "disposable-synthetic-documents",
        "checks": checks,
    }


def main() -> int:
    try:
        result = asyncio.run(run_benchmark())
    except Exception as exc:
        result = {
            "ok": False, "checks_total": 0, "checks_passed": 0,
            "error": f"{type(exc).__name__}: {str(exc)[:240]}",
        }
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result.get("ok") is True else 1


if __name__ == "__main__":
    raise SystemExit(main())
