"""Explicit local commands for AURA durable administrative review (no cloud)."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from .admin_durable import DurableReviews, local_db_path


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="AURA — Suivi local persistant, sans API")
    p.add_argument('--root', required=True, help='Dossier administratif autorisé')
    commands = p.add_subparsers(dest='command', required=True)
    commands.add_parser('snapshot', help='Analyser et enregistrer un suivi, localement')
    commands.add_parser('list', help='Lister les contrôles persistants')
    commands.add_parser('audit', help='Consulter le journal des décisions')
    commands.add_parser('due', help='Afficher les rappels approuvés échus, sans les effacer')
    decision = commands.add_parser('review', help='Marquer un contrôle examiné ou écarté')
    decision.add_argument('--id', required=True)
    decision.add_argument('--decision', required=True, choices=('reviewed', 'dismissed'))
    proposal = commands.add_parser('propose', help='Proposer un rappel pour une vérification déjà examinée')
    proposal.add_argument('--id', required=True)
    proposal.add_argument('--when', required=True, help='Date ISO avec fuseau, ex. 2026-11-25T09:00:00+01:00')
    approve = commands.add_parser('approve', help='Approuver explicitement un rappel')
    approve.add_argument('--reminder-id', required=True)
    ack = commands.add_parser('ack', help='Accuser réception après affichage effectif du rappel')
    ack.add_argument('--reminder-id', required=True)
    return p


def run(args: argparse.Namespace) -> dict:
    root = Path(args.root).expanduser().resolve(strict=True)
    if not root.is_dir():
        raise NotADirectoryError(str(root))
    store = DurableReviews(local_db_path(root))
    command = args.command
    if command == 'snapshot':
        from .admin_portfolio import analyze_portfolio
        from .admin_followup import build_followup_board
        board = build_followup_board(analyze_portfolio(root))
        result = store.save_snapshot(board)
        return {'command': 'snapshot', 'ok': True, **result}
    if command == 'list':
        return {'command': 'list', 'reviews': store.list_reviews()}
    if command == 'audit':
        return {'command': 'audit', 'events': store.audit_events()}
    if command == 'due':
        return {'command': 'due', 'reminders': store.due_reminders(),
                'note': 'Rappels non acquittés, aucun envoi automatisé.'}
    if command == 'review':
        store.decide(args.id, args.decision)
        return {'command': 'review', 'ok': True, 'task_id': args.id, 'decision': args.decision,
                'note': 'Décision de lecture humaine, pas confirmation de paiement.'}
    if command == 'propose':
        key = store.propose_reminder(args.id, args.when)
        return {'command': 'propose', 'ok': True, 'reminder_id': key,
                'note': 'Rappel proposé, non activé sans approve.'}
    if command == 'approve':
        store.approve_reminder(args.reminder_id)
        return {'command': 'approve', 'ok': True, 'reminder_id': args.reminder_id}
    if command == 'ack':
        store.acknowledge_reminder(args.reminder_id)
        return {'command': 'ack', 'ok': True, 'reminder_id': args.reminder_id}
    raise ValueError('Commande inconnue')


def main() -> int:
    args = parser().parse_args()
    try:
        result = run(args)
    except (ValueError, OSError) as exc:
        print(json.dumps({'ok': False, 'error': f'{type(exc).__name__}: {exc}'}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
