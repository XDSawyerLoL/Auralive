"""Small, offline, guided French assistant for user-authorized local documents."""
from __future__ import annotations

import argparse
import asyncio
from argparse import Namespace
from pathlib import Path
from typing import Any

from .admin_assistant import _filenames, plan_french_administrative_request
from .personal_cli import execute_command


def complete_followup(previous_intent: str, answer: str) -> str | None:
    """Fill one missing safe argument without generating an action implicitly."""
    names = _filenames(answer)
    if previous_intent == 'pdf-needs-file' and len(names) == 1 and names[0].lower().endswith('.pdf'):
        return f'Lis {names[0]}'
    if previous_intent == 'budget-needs-csv' and len(names) == 1 and names[0].lower().endswith('.csv'):
        return f'Fais le total de mes dépenses dans {names[0]}'
    if previous_intent == 'compare-needs-files' and len(names) == 2:
        return f'Compare {names[0]} avec {names[1]}'
    if previous_intent == 'backup-needs-file' and len(names) == 1:
        return f'Sauvegarde {names[0]}'
    if previous_intent == 'search-needs-term':
        query = answer.strip()
        if 2 <= len(query) <= 100 and '\n' not in query and '\r' not in query:
            return f'Cherche "{query}" dans mes documents'
    return None


def render_result(report: dict[str, Any]) -> str:
    if not report.get('executed'):
        reason = str(report.get('reason') or report.get('error') or 'Action non effectuée.')
        missing = report.get('needs') or []
        return reason + (f"\nPrécision nécessaire : {missing[0]}" if missing else "")
    rows = []
    for step in report.get('steps') or []:
        kind = step.get('type')
        if kind == 'admin.inventory':
            rows.append(f"Documents repérés par nom : {step['files_counted']};"
                        f" catégories : " + ', '.join(
                            f"{k}={v}" for k, v in step['categories'].items() if v))
            if step.get('truncated'):
                rows.append('Inventaire partiel : limite de parcours atteinte.')
            rows.append('Aucun document lu, déplacé ou envoyé. Classement à confirmer.')
            rows.extend('Prochaine étape : ' + instruction
                        for instruction in step.get('next_steps', [])[:4])
        elif kind == 'admin.followup':
            rows.append(
                f"Tableau administratif : {step['task_count']} vérification(s) proposées "
                f"sur {step['source_documents_scanned']} document(s)."
            )
            categories = {
                'doublons': 'Doublons à contrôler',
                'dates_candidates': 'Dates possibles',
                'documents_a_lire': 'PDF sans texte',
                'rapprochements': 'Rapprochements à confirmer',
                'fichiers_non_lus': 'Fichiers à examiner',
            }
            rows.extend(
                f"{label} : {step['categories'].get(key, 0)}"
                for key, label in categories.items()
            )
            for item in step.get('tasks', [])[:80]:
                rows.append(f"[À vérifier] {item['title']} — {item['source']}")
                proof = item.get('evidence') or {}
                if proof.get('date'):
                    rows.append(
                        f"  Date candidate : {proof['date']}, page {proof.get('page')}"
                        f" — {proof.get('excerpt', '')}"
                    )
                if proof.get('transaction_file'):
                    rows.append(
                        f"  Opération candidate : {proof['transaction_file']}, "
                        f"ligne {proof.get('transaction_row')} "
                        f"({proof.get('amount_candidate', '?')} EUR)"
                    )
                if item['category'] == 'fichiers_non_lus':
                    rows.append(f"  {item['detail']}")
            if step.get('partial'):
                rows.append('Analyse partielle : des pièces restent non vérifiées.')
            rows.append('Ceci est un tableau provisoire, aucun rappel ni paiement confirmé.')
        elif kind == 'admin.portfolio':
            rows.append(
                f"Documents examinés : {step['documents_scanned']}; "
                f"doublons exacts : {len(step['duplicates_exact_sha256'])}; "
                f"factures : {len(step['invoices'])}."
            )
            for group in step.get('duplicates_exact_sha256', [])[:12]:
                rows.append("Doublons SHA-256 : " + " / ".join(group))
            translations = {
                'candidate_match': 'Rapprochement possible — non confirmé',
                'unmatched_or_ambiguous': 'Aucun rapprochement unique démontré',
                'insufficient_evidence': 'Référence ou montant insuffisant',
                'ambiguous_shared_transaction': 'Même opération associée à plusieurs factures',
            }
            for item in step.get('payment_candidates', [])[:30]:
                detail = translations.get(item.get('status'), 'À examiner')
                rows.append(f"{item['invoice']} : {detail}")
                if item.get('transaction_file'):
                    rows.append(
                        f"   À vérifier : {item['transaction_file']}, "
                        f"ligne {item['transaction_row']} — {item['amount']} EUR"
                    )
            for issue in step.get('errors', [])[:10]:
                rows.append(f"Non examiné : {issue['file']} ({issue['reason']})")
            if step.get('limit_reached') or step.get('errors'):
                rows.append("Analyse partielle : tous les fichiers n'ont pas été analysés.")
            rows.append("Aucun paiement confirmé, aucun document déplacé ou supprimé.")
        elif kind == 'admin.pdf.inspect':
            rows.append(f"PDF : {step['pages']} page(s), {step['characters_extracted']} caractères extraits.")
            rows.append(f"Empreinte SHA-256 : {step['source_sha256']}")
            if not step.get('text_detected'):
                rows.append('Aucune couche texte détectée : une analyse OCR serait nécessaire.')
            rows.extend(
                f"Page {part['page']} : {part['excerpt']}"
                for part in step.get('previews', [])[:4]
            )
            if step.get('dates_observed'):
                rows.append('Dates observées (non vérifiées) : ' + ', '.join(
                    step['dates_observed'][:20]))
            labels = {
                'date_observee': 'Date observée',
                'date_limite_candidate': 'Échéance possible (à confirmer)',
                'montant_observe': 'Montant observé',
                'total_candidat': 'Total possible (à confirmer)',
            }
            for item in step.get('observed_facts', [])[:30]:
                rows.append(
                    f"Page {item['page']} — "
                    f"{labels.get(item['kind'], 'Fait observé')} : "
                    f"{item['raw']} [preuve : {item['evidence']}]"
                )
            if step.get('text_truncated'):
                rows.append('Extraction partielle : limite de texte atteinte.')
            rows.append('Aucune échéance ni obligation administrative déduite automatiquement.')
        elif kind == 'admin.locate':
            rows.append(f"Fichiers dont le nom correspond : {step['matches_count']}")
            rows.extend(' - ' + name for name in step['matches'])
            if step.get('truncated'):
                rows.append('Recherche partielle : limite atteinte.')
        elif kind == 'data.csv.summary':
            rows.append(f"CSV : {step['rows']} lignes.")
            rows.extend(f" - {column} : somme={stats['sum']}, moyenne={stats['average']}"
                        for column, stats in step.get('numeric', {}).items())
        elif kind == 'files.compare':
            rows.append('Documents identiques.' if step['identical'] else 'Différences :')
            if not step['identical']:
                rows.extend(step.get('diff_lines', [])[:25])
        elif kind == 'files.search':
            rows.append(f"Occurrences trouvées dans des textes : {step['matches_count']}")
            rows.extend(f" - {m['file']}:{m['line']}" for m in step.get('matches', []))
        elif kind == 'files.backup':
            rows.append(f"Sauvegarde vérifiée : {step['backup']}")
            rows.append(f"SHA-256 : {step['sha256']}")
        else:
            rows.append(f"Action réalisée : {kind}")
    return '\n'.join(rows) or 'Aucun résultat exploitable.'


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Assistant administratif AURA local")
    parser.add_argument('--root', required=True, help="Dossier autorisé pour cette session")
    return parser.parse_args()


async def run_session(root: str) -> None:
    path = Path(root).expanduser().resolve(strict=True)
    if not path.is_dir():
        raise NotADirectoryError(str(path))
    print('AURA — assistant administratif local, compréhension limitée.')
    print('Lecture des noms et données autorisées uniquement. Aucun envoi sur Internet.')
    print('Exemple : Organise toute ma vie administrative. Tapez quitter pour terminer.')
    pending = ''
    while True:
        try:
            message = input('\nVous > ').strip()
        except (EOFError, KeyboardInterrupt):
            break
        if message.casefold() in {'quitter', 'quit', 'exit'}:
            break
        if not message:
            continue
        if pending:
            resolved = complete_followup(pending, message)
            pending = ''
            if resolved:
                message = resolved
        plan = plan_french_administrative_request(message)
        if plan is None:
            print('AURA > Je ne comprends pas cette demande avec mes capacités actuelles.')
            continue
        if not plan['actions']:
            pending = plan['intent'] if str(plan['intent']).endswith('needs-csv') or plan['intent'] in {
                'compare-needs-files', 'backup-needs-file', 'search-needs-term',
                'pdf-needs-file'
            } else ''
            print('AURA > ' + plan['summary'])
            if plan.get('needs'):
                print('AURA > ' + plan['needs'][0])
            continue

        wants_backup = any(action.get('type') == 'files.backup' for action in plan['actions'])
        if wants_backup:
            print('AURA > Sauvegarde : écriture dans le dossier local autorisé.')
            confirmation = input('Confirmer cette création de fichier ? Tapez OUI : ').strip()
            if confirmation != 'OUI':
                print('AURA > Sauvegarde annulée.')
                continue

        result = await execute_command(Namespace(
            root=str(path), command='ask', request=message, allow_backup=wants_backup,
        ))
        print('AURA > ' + render_result(result))


def main() -> None:
    args = parse_args()
    asyncio.run(run_session(args.root))


if __name__ == '__main__':
    main()
