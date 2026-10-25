"""Real-action AURA personal benchmark. Only touches its own temp directory."""
from __future__ import annotations

import asyncio
from hashlib import sha256
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from .operator import RuntimeOperator


class NoModel:
    async def generate(self, *_args, **_kwargs):
        raise AssertionError("Le benchmark ne doit jamais appeler un modèle IA")


def _settings(root: Path) -> SimpleNamespace:
    return SimpleNamespace(
        aura_runtime_operator_roots=[root],
        aura_runtime_operator_allowed_risks={"safe", "local-write"},
        aura_runtime_operator_commands=set(),
        aura_runtime_operator_domains=set(),
        aura_runtime_operator_max_file_bytes=200_000,
        aura_runtime_browser_enabled=False,
        aura_runtime_deep_web_enabled=False,
    )


async def run_benchmark() -> dict:
    checks: list[dict] = []

    def record(name: str, passed: bool, **evidence):
        checks.append({"name": name, "passed": bool(passed), "evidence": evidence})

    async def run(operator, actions, risks):
        return await operator.operate(
            json.dumps({"summary": "mesure d'action locale", "actions": actions}, ensure_ascii=False),
            requested_risks=set(risks),
        )

    with TemporaryDirectory(prefix="aura-personal-benchmark-") as temp:
        root = Path(temp)
        (root / "notes.txt").write_text(
            "Rendez-vous médical mardi\nPayer la facture vendredi\n", encoding="utf-8"
        )
        (root / "budget.csv").write_text(
            "categorie;montant\nCourses;12,50\nTransport;3,20\nCafé;2,30\n", encoding="utf-8"
        )
        (root / "version-a.txt").write_text("Bonjour\nAncien texte\n", encoding="utf-8")
        (root / "version-b.txt").write_text("Bonjour\nNouveau texte\n", encoding="utf-8")
        (root / ".secret.txt").write_text("Payer la facture dans le coffre", encoding="utf-8")
        operator = RuntimeOperator(NoModel(), _settings(root))

        search = await run(operator, [
            {"type": "files.search", "path": ".", "query": "facture"},
        ], ["safe"])
        step = (search.get("steps") or [{}])[0]
        record(
            "Recherche de document",
            search.get("executed") is True and step.get("matches_count") == 1
            and step.get("matches", [{}])[0].get("file") == "notes.txt",
            matches=step.get("matches_count", -1),
            files_scanned=step.get("files_scanned", 0),
        )

        csv = await run(operator, [
            {"type": "data.csv.summary", "path": "budget.csv"},
        ], ["safe"])
        step = (csv.get("steps") or [{}])[0]
        total = step.get("numeric", {}).get("montant", {}).get("sum")
        record(
            "Addition d'un budget en CSV français",
            csv.get("executed") is True and total == "18.00" and step.get("rows") == 3,
            total=total, rows=step.get("rows", 0),
        )

        diff = await run(operator, [
            {"type": "files.compare", "left": "version-a.txt", "right": "version-b.txt"},
        ], ["safe"])
        step = (diff.get("steps") or [{}])[0]
        record(
            "Comparaison de deux documents",
            diff.get("executed") is True and step.get("identical") is False
            and any("-Ancien texte" in line for line in step.get("diff_lines", [])),
            changed=step.get("identical") is False,
            diff_sha256=sha256("\n".join(step.get("diff_lines", [])).encode()).hexdigest(),
        )

        backup = await run(operator, [
            {"type": "files.backup", "path": "notes.txt"},
        ], ["local-write"])
        step = (backup.get("steps") or [{}])[0]
        backup_path = Path(step.get("backup") or "/nonexistent")
        proof = (
            backup_path.is_file()
            and backup_path.read_bytes() == (root / "notes.txt").read_bytes()
        )
        record(
            "Sauvegarde réelle avec vérification SHA-256",
            backup.get("executed") is True and step.get("verified") is True
            and proof and step.get("sha256") == sha256(backup_path.read_bytes()).hexdigest(),
            bytes=step.get("bytes", 0),
            sha256=step.get("sha256", ""),
        )

        refused = await run(operator, [
            {"type": "files.backup", "path": "notes.txt"},
        ], ["safe"])
        record(
            "Refus de sauvegarde sans permission d'écriture",
            refused.get("executed") is False and refused.get("status") == "error",
            refused=refused.get("executed") is False,
        )

        escape = await run(operator, [
            {"type": "files.search", "path": "../", "query": "facture"},
        ], ["safe"])
        record(
            "Interdiction de lire hors workspace",
            escape.get("executed") is False and escape.get("status") == "error",
            refused=escape.get("executed") is False,
        )

        before = {path.name for path in root.glob("*.bak")}
        rollback = await run(operator, [
            {"type": "files.backup", "path": "notes.txt"},
            {"type": "process.run", "command": "not-authorized", "args": []},
        ], ["local-write", "process"])
        after = {path.name for path in root.glob("*.bak")}
        record(
            "Annulation d'une sauvegarde si une étape suivante échoue",
            rollback.get("executed") is False and before == after
            and any(item.get("type") == "files.backup" and item.get("ok") is True
                    for item in rollback.get("rollback", [])),
            restored=before == after,
        )

    count = sum(1 for check in checks if check["passed"])
    return {
        "ok": count == len(checks),
        "version": "aura-personal-real-action-benchmark-v1",
        "mode": "temporary-files-only",
        "model_calls": 0,
        "network_calls": 0,
        "external_cost_microunits": 0,
        "checks_passed": count,
        "checks_total": len(checks),
        "checks": checks,
    }


def main() -> int:
    try:
        report = asyncio.run(run_benchmark())
    except Exception as error:
        report = {"ok": False, "error": f"{type(error).__name__}: {str(error)[:250]}"}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
