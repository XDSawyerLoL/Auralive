"""Offline self-test for administrative follow-up board; temporary files only."""
from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from .pdf_benchmark import _make_pdf
from .admin_portfolio import analyze_portfolio
from .admin_followup import build_followup_board


def run_benchmark() -> dict:
    checks: list[dict] = []

    def check(name: str, passed: bool) -> None:
        checks.append({'name': name, 'passed': bool(passed)})

    with TemporaryDirectory(prefix='aura-followup-') as folder:
        root = Path(folder)
        source = root / 'facture_001.pdf'
        csv = root / 'operations.csv'
        raw = _make_pdf('Facture N: FAC-2026-001 Date limite 30/11/2026 Total TTC: 123,45 EUR')
        source.write_bytes(raw)
        csv.write_text('reference;montant\nFAC-2026-001;-123,45\n', encoding='utf8')
        signatures = {p.name: sha256(p.read_bytes()).hexdigest() for p in root.iterdir()}
        portfolio = analyze_portfolio(root)
        board = build_followup_board(portfolio)
        check('Tableau local vérifié sans écriture', board['verified'] and board['read_only'] and board['ok'])
        check('Date candidate avec preuve de page',
              any(t['evidence'].get('date') == '2026-11-30'
                  and t['evidence'].get('page') == 1
                  and '30/11/2026' in t['evidence'].get('excerpt', '')
                  for t in board['tasks']))
        check('Paiement seulement rapprochement possible',
              any(t['evidence'].get('transaction_file') == 'operations.csv'
                  and t['requires_human_confirmation']
                  and not t['action_taken'] for t in board['tasks']))
        check('Identifiants des actions déterministes',
              [t['id'] for t in board['tasks']] ==
              [t['id'] for t in build_followup_board(portfolio)['tasks']])
        check('Documents sources non modifiés',
              {p.name: sha256(p.read_bytes()).hexdigest() for p in root.iterdir()} == signatures)
        csv.write_text('reference;montant\nAUTRE;-123,45\n', encoding='utf8')
        board = build_followup_board(analyze_portfolio(root))
        check('Somme seule ne prouve pas paiement',
              not any(t['evidence'].get('transaction_file') for t in board['tasks']))
        copy = root / 'facture_copie.pdf'
        copy.write_bytes(raw)
        board = build_followup_board(analyze_portfolio(root))
        check('Doublons identiques -> contrôle humain, jamais suppression',
              board['categories']['doublons'] == 1
              and all(not t['action_taken'] for t in board['tasks']))
        csv.write_text('inconnu;montant\nA;-123,45\n', encoding='utf8')
        board = build_followup_board(analyze_portfolio(root))
        check('CSV incompréhensible marqué comme analyse partielle',
              board['partial'] and board['categories']['fichiers_non_lus'] >= 1)
        artificial = {
            'type': 'admin.portfolio', 'ok': True, 'verified': True, 'read_only': True,
            'documents_scanned': 30, 'duplicates_exact_sha256': [],
            'invoices': [{'file': f'facture_{index}.pdf', 'text_detected': True,
                          'deadline_candidates': [
                              {'kind': 'date_limite_candidate', 'page': 1,
                               'value': f'2026-11-{day + 1:02}',
                               'evidence': f'Date limite {day+1}/11/2026'}
                              for day in range(5)]} for index in range(30)],
            'payment_candidates': [], 'errors': [],
        }
        bounded = build_followup_board(artificial)
        check('Limite de 80 contrôles et troncature déclarée',
              bounded['task_count'] == 80 and bounded['task_limit_reached']
              and bounded['partial'])

    return {'name': 'aura-followup-offline-v1',
            'ok': all(item['passed'] for item in checks),
            'checks_total': len(checks),
            'checks_passed': sum(item['passed'] for item in checks),
            'model_calls': 0, 'network_calls': 0, 'paid_calls': 0,
            'mode': 'temporary-local-documents', 'checks': checks}


def main() -> int:
    try:
        result = run_benchmark()
    except Exception as error:
        result = {'ok': False, 'checks_total': 0, 'checks_passed': 0,
                  'error': f'{type(error).__name__}: {str(error)[:240]}'}
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result.get('ok') else 1


if __name__ == '__main__':
    raise SystemExit(main())
