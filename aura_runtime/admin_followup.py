"""Read-only administrative follow-up board built from observed evidence.

Board entries are suggested human checks, never confirmed obligations, actual
payments, or scheduled reminders. The snapshot does not write state.
"""
from __future__ import annotations

from hashlib import sha256
import json
from typing import Any

BOARD_MAX_TASKS = 80


def _task(category: str, title: str, detail: str, source: str,
          *, proof: dict | None = None) -> dict[str, Any]:
    token = '\0'.join([category, source, detail, json.dumps(proof or {}, sort_keys=True, ensure_ascii=False)])
    return {
        'id': sha256(token.encode('utf-8')).hexdigest()[:16],
        'category': category,
        'title': title[:120],
        'detail': detail[:300],
        'source': source[:240],
        'evidence': proof or {},
        'status': 'a_verifier',
        'requires_human_confirmation': True,
        'action_taken': False,
    }


def build_followup_board(portfolio: dict[str, Any]) -> dict[str, Any]:
    """Convert a truthful local portfolio report into a bounded action checklist.

    Never turns an observed date into a legal deadline or an invoice match into
    proof of payment. Report errors and truncated scans are surfaced.
    """
    if (portfolio.get('type') != 'admin.portfolio' or portfolio.get('ok') is not True
            or portfolio.get('verified') is not True or portfolio.get('read_only') is not True):
        raise ValueError('Rapport de portefeuille non vérifié : aucun suivi produit')

    tasks: list[dict[str, Any]] = []
    seen: set[str] = set()
    truncated = False

    def add(item: dict[str, Any]) -> None:
        nonlocal truncated
        if len(tasks) >= BOARD_MAX_TASKS:
            truncated = True
            return
        if item['id'] not in seen:
            tasks.append(item)
            seen.add(item['id'])

    # Group byte-identical files; this is not permission to remove either one.
    for group in portfolio.get('duplicates_exact_sha256', [])[:30]:
        if not isinstance(group, list) or len(group) < 2:
            continue
        files = sorted(str(x)[:180] for x in group)[:10]
        add(_task('doublons', 'Vérifier les fichiers identiques',
                  'Deux fichiers ou plus ont une empreinte de contenu identique. '
                  'Ne rien supprimer sans examen.', files[0],
                  proof={'files': files, 'method': 'identite_sha256'}))

    for invoice in portfolio.get('invoices', [])[:30]:
        filename = str(invoice.get('file') or '')
        if not filename:
            continue
        for entry in invoice.get('deadline_candidates', [])[:5]:
            if entry.get('kind') != 'date_limite_candidate':
                continue
            day = str(entry.get('value') or '')
            page = entry.get('page')
            evidence = str(entry.get('evidence') or '')[:180]
            # Do not guess today/overdue status; no calendar action is made.
            if not day or not isinstance(page, int) or page < 1 or not evidence:
                continue
            add(_task('dates_candidates', 'Vérifier une date possible',
                      f'Date figurant dans le document : {day}. '
                      'Sa signification et les éventuelles obligations restent à confirmer.',
                      filename, proof={'page': page, 'date': day,
                                       'excerpt': evidence, 'certainty': 'candidate_only'}))
        if not invoice.get('text_detected', False):
            add(_task('documents_a_lire', 'PDF sans texte exploitable',
                      'Lecture de la couche texte impossible ; examen manuel ou OCR local nécessaire.',
                      filename))

    for match in portfolio.get('payment_candidates', [])[:30]:
        filename = str(match.get('invoice') or '')
        if not filename:
            continue
        status = str(match.get('status') or '')
        if status == 'candidate_match':
            origin = str(match.get('transaction_file') or '')
            line = match.get('transaction_row')
            amount = str(match.get('amount') or '')
            reference = str(match.get('reference') or '')
            add(_task('rapprochements', 'Confirmer un rapprochement possible',
                      'Référence et montant semblent correspondre. '
                      'Vérifier avec les justificatifs : aucun paiement n’est déclaré confirmé.',
                      filename, proof={'transaction_file': origin[:180],
                                       'transaction_row': line, 'amount_candidate': amount[:32],
                                       'invoice_reference': reference[:60]}))
        elif status in ('unmatched_or_ambiguous', 'ambiguous_shared_transaction',
                        'insufficient_evidence'):
            explanation = {
                'unmatched_or_ambiguous': 'Aucune transaction bancaire unique et vérifiable.',
                'ambiguous_shared_transaction': 'Une opération correspond à plusieurs factures.',
                'insufficient_evidence': 'Référence ou montant de facture insuffisant.',
            }[status]
            add(_task('rapprochements', 'Contrôler les justificatifs manquants',
                      explanation + ' Ne pas conclure que la facture est impayée.',
                      filename, proof={'source_status': status}))

    for error in portfolio.get('errors', [])[:30]:
        filename = str(error.get('file') or '')
        if not filename:
            continue
        add(_task('fichiers_non_lus', 'Vérifier un document non analysé',
                  'Lecture non effectuée ou invalide : '
                  + str(error.get('reason') or 'erreur non déterminée')[:120], filename))

    partial = bool(truncated or portfolio.get('limit_reached') or portfolio.get('errors'))
    categories = {category: sum(1 for item in tasks if item['category'] == category)
                  for category in ('doublons', 'dates_candidates', 'documents_a_lire',
                                   'rapprochements', 'fichiers_non_lus')}
    return {
        'type': 'admin.followup', 'ok': True, 'verified': True,
        'read_only': True, 'mode': 'observed-administrative-snapshot',
        'task_count': len(tasks), 'categories': categories,
        'task_limit_reached': truncated,
        'tasks': tasks, 'partial': partial,
        'source_documents_scanned': int(portfolio.get('documents_scanned') or 0),
        'requires_human_confirmation': True,
        'limitations': [
            'Tableau instantané, sans état de validation persistant.',
            'Les dates sont des candidates, pas des échéances juridiquement établies.',
            'Un rapprochement candidat ne confirme aucun paiement.',
            'Aucun document modifié, aucun rappel créé, aucune communication transmise.',
            'Analyse incomplète si des fichiers sont illisibles ou limites atteintes.',
        ],
    }
