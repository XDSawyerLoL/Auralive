"""Real multi-document AURA proof on disposable local PDFs and CSVs."""
from __future__ import annotations
import json
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from .admin_portfolio import analyze_portfolio
from .pdf_benchmark import _make_pdf


def run_benchmark():
    checks = []
    def check(label, passed):
        checks.append({'name': label, 'passed': bool(passed)})
    with TemporaryDirectory(prefix='aura-portfolio-') as location:
        root = Path(location)
        invoice = root / 'facture_client.pdf'
        tx = root / 'paiements.csv'
        original = _make_pdf('Facture N: FAC-2026-001 Total TTC 123,45 EUR')
        invoice.write_bytes(original)
        tx.write_text('reference;montant;description\nFAC-2026-001;-123,45;PAIEMENT\n', encoding='utf8')
        report = analyze_portfolio(root)
        check('Rapport authentique en lecture seule', report['ok'] and report['verified'] and report['read_only'])
        check('Deux fichiers effectivement examinés', report['documents_scanned'] == 2)
        check('Rapprochement explicite seulement candidat', len(report['payment_candidates']) == 1 and report['payment_candidates'][0]['status'] == 'candidate_match' and report['payment_candidates'][0]['requires_confirmation'])
        check('Facture et preuve SHA-256', report['invoices'][0]['source_sha256'] == sha256(original).hexdigest())
        copy = root / 'facture_copie.pdf'
        copy.write_bytes(original)
        report = analyze_portfolio(root)
        check('Doublons réellement identiques détectés', report['duplicates_exact_sha256'] == [['facture_client.pdf', 'facture_copie.pdf']])
        check('Transaction partagée refusée comme preuve', all(item['status'] == 'ambiguous_shared_transaction' for item in report['payment_candidates']))
        copy.unlink()
        tx.write_text('reference;montant\nAUTRE-REF;-123,45\n', encoding='utf8')
        report = analyze_portfolio(root)
        check('Montant identique sans référence refusé', report['payment_candidates'][0]['status'] == 'unmatched_or_ambiguous')
        tx.write_text('reference;montant\nFAC-2026-0012;-123,45\n', encoding='utf8')
        report = analyze_portfolio(root)
        check('Référence incluse dans une autre refusée', report['payment_candidates'][0]['status'] == 'unmatched_or_ambiguous')
        tx.write_text('reference;montant\nFAC-2026-001;123,45\n', encoding='utf8')
        report = analyze_portfolio(root)
        check('Crédit positif non assimilé à un débit', report['payment_candidates'][0]['status'] == 'unmatched_or_ambiguous')
        check('Fichiers de test jamais modifiés par analyse', invoice.read_bytes() == original and tx.is_file())
    return {'name':'aura-multi-document-v1', 'ok': all(row['passed'] for row in checks), 'checks_total': len(checks), 'checks_passed': sum(row['passed'] for row in checks), 'mode':'disposable-local-PDF-CSV', 'paid_calls': 0, 'network_calls': 0, 'model_calls': 0, 'checks': checks}


def main():
    try: result=run_benchmark()
    except Exception as exc: result={'ok':False, 'error':f'{type(exc).__name__}: {str(exc)[:250]}'}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get('ok') else 1


if __name__ == '__main__':
    raise SystemExit(main())
