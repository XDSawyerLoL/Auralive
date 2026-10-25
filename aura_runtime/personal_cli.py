"""Use AURA's existing Runtime operator for everyday local tasks, no LLM/cloud."""
from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

from .operator import RuntimeOperator


class NoModel:
    async def generate(self, *_args, **_kwargs):
        raise RuntimeError("Aucun modèle n'est requis pour une action structurée")


def argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="AURA — fichiers et CSV sur un dossier explicitement autorisé, sans API"
    )
    parser.add_argument("--root", required=True, help="Dossier autorisé pour cette commande uniquement")
    sub = parser.add_subparsers(dest="command", required=True)
    search = sub.add_parser("search", help="Chercher une expression dans les fichiers texte")
    search.add_argument("--path", default=".", help="Sous-dossier relatif au dossier autorisé")
    search.add_argument("--query", required=True)
    csv = sub.add_parser("csv", help="Additionner les colonnes numériques d'un CSV")
    csv.add_argument("--path", required=True)
    diff = sub.add_parser("compare", help="Comparer deux documents texte UTF-8")
    diff.add_argument("--left", required=True)
    diff.add_argument("--right", required=True)
    backup = sub.add_parser("backup", help="Créer une copie vérifiée (opération d'écriture explicite)")
    backup.add_argument("--path", required=True)
    ask = sub.add_parser("ask", help="Demande administrative libre en français (compréhension bornée)")
    ask.add_argument("--request", required=True, help="Ex : organise mes papiers administratifs")
    ask.add_argument("--allow-backup", action="store_true",
                     help="Autorise explicitement une sauvegarde, jamais un envoi/suppression")
    return parser


async def execute_command(args: argparse.Namespace) -> dict:
    root = Path(args.root).expanduser().resolve(strict=True)
    if not root.is_dir():
        raise NotADirectoryError(str(root))
    actions = {
        "search": {"type": "files.search", "path": args.path, "query": args.query}
        if args.command == "search" else None,
        "csv": {"type": "data.csv.summary", "path": args.path}
        if args.command == "csv" else None,
        "compare": {"type": "files.compare", "left": args.left, "right": args.right}
        if args.command == "compare" else None,
        "backup": {"type": "files.backup", "path": args.path}
        if args.command == "backup" else None,
    }
    action = actions.get(args.command)
    if args.command != "ask" and action is None:
        raise ValueError("Commande non prise en charge")
    settings = SimpleNamespace(
        aura_runtime_operator_roots=[root],
        aura_runtime_operator_allowed_risks={"safe", "local-write"},
        aura_runtime_operator_commands=set(),
        aura_runtime_operator_domains=set(),
        aura_runtime_operator_max_file_bytes=200_000,
        aura_runtime_browser_enabled=False,
        aura_runtime_deep_web_enabled=False,
    )
    operator = RuntimeOperator(NoModel(), settings)
    risk = "local-write" if args.command == "backup" else "safe"
    if args.command == "ask":
        return await operator.operate(
            args.request,
            requested_risks={"safe", "local-write"} if args.allow_backup else {"safe"},
            source="aura-personal-cli",
        )
    return await operator.operate(
        json.dumps({"summary": "Tâche locale", "actions": [action]}, ensure_ascii=False),
        requested_risks={risk},
        source="aura-personal-cli",
    )


def main() -> int:
    parser = argument_parser()
    args = parser.parse_args()
    try:
        result = asyncio.run(execute_command(args))
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0 if result.get("executed") is True and result.get("status") == "completed" else 1
    except Exception as error:
        print(json.dumps(
            {"executed": False, "status": "error",
             "reason": f"{type(error).__name__}: {str(error)[:300]}"},
            ensure_ascii=False,
        ))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
