from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest

from aura_runtime.pdf_documents import inspect_pdf


def make_text_pdf(message: str) -> bytes:
    """One-page actual PDF with builtin Helvetica, no external fixtures."""
    payload = f'BT /F1 12 Tf 60 700 Td ({message}) Tj ET'.encode('ascii')
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        f'<< /Length {len(payload)} >>\nstream\n'.encode() + payload + b'\nendstream',
    ]
    result = b'%PDF-1.4\n'
    offsets = [0]
    for idx, obj in enumerate(objects, 1):
        offsets.append(len(result))
        result += f'{idx} 0 obj\n'.encode() + obj + b'\nendobj\n'
    start_xref = len(result)
    result += f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode()
    for offset in offsets[1:]:
        result += f'{offset:010d} 00000 n \n'.encode()
    result += f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{start_xref}\n%%EOF\n'.encode()
    return result


def test_read_a_real_pdf_and_extract_only_observed_date(tmp_path):
    source = tmp_path / 'facture.pdf'
    source.write_bytes(make_text_pdf('Facture locale date 25/11/2026'))
    report = inspect_pdf(source)
    assert report['ok'] is True
    assert report['pages'] == 1
    assert report['verified'] is True
    assert report['text_detected'] is True
    assert report['dates_observed'] == ['25/11/2026']
    assert 'Facture locale' in report['previews'][0]['excerpt']
    assert report['read_only'] is True


def test_fake_pdf_is_rejected(tmp_path):
    source = tmp_path / 'faux.pdf'
    source.write_bytes(b'ceci est un faux PDF')
    with pytest.raises(ValueError, match='Signature PDF'):
        inspect_pdf(source)


def test_pdf_over_size_limit_is_rejected(tmp_path):
    source = tmp_path / 'huge.pdf'
    source.write_bytes(b'%PDF-' + b'x' * 3_000_000)
    with pytest.raises(ValueError, match='volumineux'):
        inspect_pdf(source)


def test_docx_instead_of_pdf_is_rejected(tmp_path):
    source = tmp_path / 'facture.docx'
    source.write_bytes(b'%PDF-' + b'A' * 15)
    with pytest.raises(ValueError, match='Seuls les fichiers PDF'):
        inspect_pdf(source)


def test_symlink_is_rejected_even_if_it_points_to_valid_pdf(tmp_path):
    source = tmp_path / 'facture.pdf'
    source.write_bytes(make_text_pdf('test'))
    link = tmp_path / 'raccourci.pdf'
    try:
        link.symlink_to(source)
    except (OSError, NotImplementedError):
        pytest.skip('Liens symboliques désactivés sur Windows')
    with pytest.raises(ValueError, match='symbolique'):
        inspect_pdf(link)


def test_pdf_phrase_uses_explicit_single_file_and_never_autoscans():
    from aura_runtime.admin_assistant import plan_french_administrative_request
    planned = plan_french_administrative_request('Lis facture.pdf')
    assert planned['intent'] == 'pdf-inspect'
    assert planned['actions'] == [{'type': 'admin.pdf.inspect', 'path': 'facture.pdf'}]
    pending = plan_french_administrative_request('Lis mes documents PDF')
    assert pending['intent'] == 'pdf-needs-file'
    assert pending['actions'] == []


@pytest.mark.asyncio
async def test_runtime_handles_actual_pdf_locally_without_llm(tmp_path):
    from aura_runtime.personal_cli import execute_command
    from argparse import Namespace
    source = tmp_path / 'facture.pdf'
    source.write_bytes(make_text_pdf('Facture locale date 25/11/2026'))
    result = await execute_command(Namespace(
        root=str(tmp_path), command='ask', request='Lis facture.pdf',
        allow_backup=False,
    ))
    assert result['executed'] is True
    assert result['status'] == 'completed'
    assert result['steps'][0]['dates_observed'] == ['25/11/2026']


def test_pdf_followup_requires_explicit_file():
    from aura_runtime.admin_chat import complete_followup
    assert complete_followup('pdf-needs-file', 'facture.pdf') == 'Lis facture.pdf'
    assert complete_followup('pdf-needs-file', '../facture.pdf') is None


def test_real_pdf_exposes_date_and_total_with_page_source(tmp_path):
    source = tmp_path / 'test_total.pdf'
    source.write_bytes(make_text_pdf('Date limite: 25/11/2026 Total TTC: 123,45 EUR'))
    result = inspect_pdf(source)
    assert result['facts_count'] == len(result['observed_facts'])
    assert any(x['kind'] == 'total_candidat' and x['value'] == '123.45'
               and x['page'] == 1 and '123,45' in x['evidence']
               for x in result['observed_facts'])
    assert any(x['kind'] == 'date_limite_candidate' and x['value'] == '2026-11-25'
               for x in result['observed_facts'])


def test_impossible_date_in_pdf_is_not_reported(tmp_path):
    source = tmp_path / 'invalid_date.pdf'
    source.write_bytes(make_text_pdf('Date limite: 31/02/2026'))
    result = inspect_pdf(source)
    assert result['dates_observed'] == []
    assert result['facts_count'] == 0


def test_negative_total_in_real_pdf_stays_negative(tmp_path):
    source = tmp_path / 'refund.pdf'
    source.write_bytes(make_text_pdf('Remboursement -10,50 EUR'))
    result = inspect_pdf(source)
    assert any(x['kind'] == 'montant_observe' and x['value'] == '-10.50'
               for x in result['observed_facts'])
