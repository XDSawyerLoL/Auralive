"""Read-only cross-document administrative audit on a user-approved folder.

Only SHA-256 duplicates are certain; invoice/payment links are candidates.
No file moving, emailing, payment, filing, AI model, OCR or network call.
"""
from __future__ import annotations

from collections import defaultdict
from decimal import Decimal, InvalidOperation
import csv
from hashlib import sha256
import io
import os
from pathlib import Path
import re
from typing import Any

from .pdf_documents import inspect_pdf

MAX_FILES = 60
MAX_ENTRIES = 500
MAX_DIRS = 100
MAX_TOTAL_BYTES = 20_000_000
PDF_LIMIT = 3_000_000
CSV_LIMIT = 1_000_000
REF = re.compile(r"\b(?:facture|invoice)\s*(?:n(?:[°ºo.]|(?=\s*:))|num[eé]ro|#|r[eé]f[eé]rence)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{6,31})\b", re.I)


def _safe_read(path: Path, maximum: int) -> bytes:
    if path.is_symlink() or not path.is_file() or path.stat().st_size > maximum:
        raise ValueError('Fichier non régulier, lien symbolique ou limite dépassée')
    with path.open('rb') as file:
        raw = file.read(maximum + 1)
    if len(raw) > maximum:
        raise ValueError('Taille de fichier dépassée')
    return raw


def _money(value: str) -> Decimal | None:
    clean = str(value).strip().replace('\u00a0', '').replace('\u202f', '').replace(' ', '')
    if not re.fullmatch(r'-?\d{1,9}(?:[,.]\d{1,2})?', clean):
        return None
    try:
        amount = Decimal(clean.replace(',', '.'))
        return amount if amount.is_finite() else None
    except InvalidOperation:
        return None


def _rows(raw: bytes) -> list[dict[str, str]]:
    source = raw.decode('utf-8-sig')
    head = source[:3000]
    delimiter = ';' if head.count(';') > head.count(',') else ','
    reader = csv.DictReader(io.StringIO(source), delimiter=delimiter)
    if not reader.fieldnames or len(reader.fieldnames) > 24:
        raise ValueError('CSV sans en-têtes ou trop de colonnes')
    if not {'reference', 'référence', 'ref', 'libelle', 'libellé', 'description'}.intersection(
        name.strip().casefold() for name in reader.fieldnames
    ):
        raise ValueError('CSV sans référence ou libellé explicite')
    rows = []
    for number, row in enumerate(reader, 1):
        if number > 2000:
            raise ValueError('CSV avec plus de 2 000 lignes')
        if None in row or any(value is None for value in row.values()):
            raise ValueError('Ligne CSV mal formée')
        rows.append({k.strip().casefold(): str(v or '').strip() for k, v in row.items()})
    return rows


def _payment_candidates(records: list[tuple[str, bytes]]) -> list[dict[str, Any]]:
    matches = []
    for filename, raw in records:
        try:
            for row_number, row in enumerate(_rows(raw), 2):
                reference = ' '.join(row.get(k, '') for k in ('reference', 'référence', 'ref', 'libelle', 'libellé', 'description'))
                debit = row.get('débit') or row.get('debit')
                amount = _money(debit) if debit else _money(row.get('montant', ''))
                if amount is None:
                    continue
                if debit:
                    amount = -abs(amount)
                if amount >= 0:
                    continue
                matches.append({'file': filename, 'row': row_number, 'description': reference[:180], 'amount': str(-amount)})
        except (UnicodeError, ValueError, csv.Error):
            continue
    return matches[:2000]


def analyze_portfolio(root: Path) -> dict[str, Any]:
    """Inspect selected folder, never operate on any document after reporting."""
    if root.is_symlink() or not root.is_dir():
        raise ValueError('Le dossier doit être réel et autorisé')
    documents = []
    ignored = 0
    errors = []
    visited = 0
    total_bytes = 0
    limit_reached = False
    for current, folders, files in os.walk(root, followlinks=False):
        visited += 1
        if visited > MAX_DIRS:
            limit_reached = True
            break
        folders[:] = [name for name in sorted(folders) if not name.startswith('.') and not (Path(current) / name).is_symlink()]
        for filename in sorted(files):
            if len(documents) >= MAX_FILES or len(documents) + ignored >= MAX_ENTRIES:
                limit_reached = True
                break
            path = Path(current) / filename
            suffix = path.suffix.lower()
            if filename.startswith('.') or path.is_symlink() or suffix not in {'.pdf', '.csv'}:
                ignored += 1
                continue
            limit = PDF_LIMIT if suffix == '.pdf' else CSV_LIMIT
            try:
                raw = _safe_read(path, limit)
                if total_bytes + len(raw) > MAX_TOTAL_BYTES:
                    limit_reached = True
                    break
            except (ValueError, OSError) as exc:
                errors.append({'file': str(path.relative_to(root)), 'reason': type(exc).__name__})
                continue
            total_bytes += len(raw)
            documents.append({'name': str(path.relative_to(root)), 'path': path, 'bytes': raw,
                              'sha256': sha256(raw).hexdigest(), 'type': suffix})
        if limit_reached:
            break

    hashes: dict[str, list[str]] = defaultdict(list)
    for doc in documents:
        hashes[doc['sha256']].append(doc['name'])
    duplicates = [sorted(group) for group in hashes.values() if len(group) > 1]
    duplicates.sort()

    invoices = []
    for doc in documents:
        if doc['type'] != '.pdf' or not re.search(r'factur|invoice', doc['name'], re.I):
            continue
        try:
            pdf = inspect_pdf(doc['path'])
        except (ValueError, RuntimeError, OSError) as exc:
            errors.append({'file': doc['name'], 'reason': type(exc).__name__})
            continue
        if pdf['source_sha256'] != doc['sha256']:
            errors.append({'file': doc['name'], 'reason': 'Fichier modifié pendant lecture'})
            continue
        total_candidates = sorted({x['value'] for x in pdf['observed_facts'] if x['kind'] == 'total_candidat'})
        references = sorted({found.upper() for preview in pdf['previews']
                             for found in REF.findall(preview['excerpt'])})
        invoices.append({'file': doc['name'], 'source_sha256': doc['sha256'],
                         'references': references, 'total_candidates': total_candidates,
                         'text_detected': pdf['text_detected'],
                         'deadline_candidates': [x for x in pdf['observed_facts'] if x['kind'] == 'date_limite_candidate'][:5]})
    transactions = _payment_candidates([(x['name'], x['bytes']) for x in documents if x['type'] == '.csv'])
    proposals = []
    claimed_transactions = defaultdict(list)
    for invoice in invoices:
        reference = invoice['references']
        amount = invoice['total_candidates']
        if len(reference) != 1 or len(amount) != 1:
            proposals.append({'invoice': invoice['file'], 'status': 'insufficient_evidence',
                              'reason': 'Référence ou total unique absent', 'requires_confirmation': True})
            continue
        exact = [t for t in transactions if re.search(r'(?<![A-Z0-9-])' + re.escape(reference[0]) + r'(?![A-Z0-9-])', t['description'].upper())
                 and _money(t['amount']) == _money(amount[0])]
        if len(exact) != 1:
            proposals.append({'invoice': invoice['file'], 'status': 'unmatched_or_ambiguous',
                              'candidate_count': len(exact), 'requires_confirmation': True})
            continue
        key = (exact[0]['file'], exact[0]['row'])
        claimed_transactions[key].append(invoice['file'])
        proposals.append({'invoice': invoice['file'], 'status': 'candidate_match',
                          'transaction_file': key[0], 'transaction_row': key[1],
                          'reference': reference[0], 'amount': amount[0],
                          'requires_confirmation': True})
    for proposal in proposals:
        if proposal['status'] == 'candidate_match' and len(claimed_transactions[
            (proposal['transaction_file'], proposal['transaction_row'])]) != 1:
            proposal['status'] = 'ambiguous_shared_transaction'
    return {'type': 'admin.portfolio', 'ok': True, 'verified': True, 'read_only': True,
            'mode': 'local-multi-document-evidence', 'documents_scanned': len(documents),
            'bytes_scanned': total_bytes, 'duplicates_exact_sha256': duplicates,
            'invoices': invoices[:30], 'payment_candidates': proposals[:30],
            'errors': errors[:30], 'limit_reached': limit_reached,
            'limitations': [
                'Doublons certains uniquement pour des octets identiques (SHA-256).',
                'Rapprochements candidats uniquement : même référence explicite et montant unique.',
                'Aucune preuve de règlement définitif ou obligation fiscale déduite.',
                'Lecture du contenu PDF limitée aux fichiers de type facture et aux aperçus.',
                'Aucun fichier déplacé, modifié, envoyé ou supprimé.',
            ]}
