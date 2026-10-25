"""Actual local multi-document portfolio checks on disposable invoices and CSVs."""
from __future__ import annotations

from hashlib import sha256
from pathlib import Path

import pytest

from aura_runtime.admin_portfolio import analyze_portfolio, _money
from aura_runtime.admin_assistant import plan_french_administrative_request
from aura_runtime.operator import RuntimeOperator
from test_aura_pdf_documents import make_text_pdf
from test_aura_runtime_operator import settings


def prepare(root: Path, ref: str = "FAC-2026-001"):
    (root / "facture_client.pdf").write_bytes(
        make_text_pdf(f"Facture N: {ref} Total TTC: 123,45 EUR"))
    (root / "paiements.csv").write_text(
        f"reference;montant;description\n{ref};-123,45;PAIEMENT\n", encoding="utf8")


def test_explicit_unique_invoice_and_bank_debit_are_only_candidates(tmp_path):
    prepare(tmp_path)
    report = analyze_portfolio(tmp_path)
    assert report["ok"] and report["verified"] and report["read_only"]
    assert report["documents_scanned"] == 2
    assert report["payment_candidates"][0]["status"] == "candidate_match"
    assert report["payment_candidates"][0]["requires_confirmation"]


def test_exact_sha256_duplicates_are_detected_and_shared_payment_is_ambiguous(tmp_path):
    prepare(tmp_path)
    (tmp_path / "facture_copie.pdf").write_bytes(
        (tmp_path / "facture_client.pdf").read_bytes())
    report = analyze_portfolio(tmp_path)
    assert report["duplicates_exact_sha256"] == [
        ["facture_client.pdf", "facture_copie.pdf"]]
    assert all(x["status"] == "ambiguous_shared_transaction"
               for x in report["payment_candidates"])


def test_equal_amount_without_identical_reference_never_means_paid(tmp_path):
    prepare(tmp_path)
    (tmp_path / "paiements.csv").write_text(
        "reference;montant;description\nAUTRE-REF;-123,45;PAIEMENT\n",
        encoding="utf8")
    report = analyze_portfolio(tmp_path)
    assert report["payment_candidates"][0]["status"] == "unmatched_or_ambiguous"


def test_shorter_reference_is_not_matched_inside_longer_reference(tmp_path):
    prepare(tmp_path)
    (tmp_path / "paiements.csv").write_text(
        "reference;montant\nFAC-2026-0012;-123,45\n", encoding="utf8")
    report = analyze_portfolio(tmp_path)
    assert report["payment_candidates"][0]["status"] == "unmatched_or_ambiguous"


def test_hidden_files_and_link_directories_are_not_scanned(tmp_path):
    prepare(tmp_path)
    (tmp_path / ".hidden.csv").write_text(
        "reference;montant\nFAC-2026-001;-123,45\n")
    secret = tmp_path / ".private"
    secret.mkdir()
    (secret / "facture_privee.pdf").write_bytes(make_text_pdf("Secret"))
    try:
        (tmp_path / "link").symlink_to(secret, target_is_directory=True)
    except (OSError, NotImplementedError):
        pass
    report = analyze_portfolio(tmp_path)
    assert report["documents_scanned"] == 2
    assert ".hidden.csv" not in str(report)


def test_invalid_pdf_or_oversize_csv_are_reported_without_claiming_analysis(tmp_path):
    (tmp_path / "facture_fake.pdf").write_bytes(b"%PDF-INVALID")
    (tmp_path / "huge.csv").write_bytes(b"x" * 1_000_001)
    report = analyze_portfolio(tmp_path)
    assert report["payment_candidates"] == []
    assert report["errors"]


def test_money_parser_rejects_ambiguous_numbers():
    assert _money("1,234") is None
    assert _money("1.234,56") is None
    assert str(_money("-123,45")) == "-123.45"


def test_two_bank_debits_with_same_reference_are_ambiguous(tmp_path):
    prepare(tmp_path)
    with (tmp_path / "paiements.csv").open("a", encoding="utf8") as stream:
        stream.write("FAC-2026-001;-123,45;SECOND OPERATION\n")
    result = analyze_portfolio(tmp_path)
    assert result["payment_candidates"][0]["status"] == "unmatched_or_ambiguous"
    assert result["payment_candidates"][0]["candidate_count"] == 2


def test_credit_or_income_is_not_an_outgoing_payment(tmp_path):
    prepare(tmp_path)
    (tmp_path / "paiements.csv").write_text(
        "reference;montant\nFAC-2026-001;123,45\n", encoding="utf8")
    result = analyze_portfolio(tmp_path)
    assert result["payment_candidates"][0]["status"] == "unmatched_or_ambiguous"


def test_analysis_never_changes_file_bytes_or_creates_files(tmp_path):
    prepare(tmp_path)
    before = {p.name: sha256(p.read_bytes()).hexdigest()
              for p in tmp_path.iterdir() if p.is_file()}
    assert analyze_portfolio(tmp_path)["ok"]
    after = {p.name: sha256(p.read_bytes()).hexdigest()
             for p in tmp_path.iterdir() if p.is_file()}
    assert after == before


class NoModel:
    async def generate(self, *_args, **_kwargs):
        raise AssertionError("No model is needed for French portfolio requests")


@pytest.mark.asyncio
async def test_runtime_understands_natural_french_portfolio_without_model(tmp_path):
    prepare(tmp_path)
    plan = plan_french_administrative_request("Analyse mes factures et paiements")
    assert plan["actions"] == [{"type": "admin.portfolio", "path": "."}]
    operator = RuntimeOperator(NoModel(), settings(tmp_path))
    result = await operator.operate(
        "Analyse mes factures et paiements",
        requested_risks={"safe"},
        source="local-test",
    )
    assert result["executed"] is True
    assert result["steps"][0]["payment_candidates"][0]["status"] == "candidate_match"


@pytest.mark.asyncio
async def test_cloud_cannot_read_portfolio_by_default(tmp_path):
    prepare(tmp_path)
    operator = RuntimeOperator(NoModel(), settings(tmp_path))
    result = await operator.operate(
        "Analyse mes factures et paiements",
        requested_risks={"safe"},
        source="aura-runtime-worker",
    )
    assert result["executed"] is False
    assert result["status"] == "not-executed"
    assert "paiements.csv" not in str(result)


def test_invalid_bank_csv_is_reported_instead_of_silently_skipped(tmp_path):
    prepare(tmp_path)
    (tmp_path / "paiements.csv").write_text(
        "colonne_inconnue;montant\nfoo;-123,45\n", encoding="utf8")
    report = analyze_portfolio(tmp_path)
    assert report["errors"] == [{"file": "paiements.csv", "reason": "ValueError"}]
    assert report["payment_candidates"][0]["status"] == "unmatched_or_ambiguous"


def test_modified_invoice_during_read_is_not_used_as_evidence(tmp_path, monkeypatch):
    from aura_runtime import admin_portfolio
    prepare(tmp_path)
    real_inspect = admin_portfolio.inspect_pdf

    def corrupt_before_extract(path):
        path.write_bytes(b"MODIFIED")
        return real_inspect(path)

    monkeypatch.setattr(admin_portfolio, "inspect_pdf", corrupt_before_extract)
    report = analyze_portfolio(tmp_path)
    assert report["invoices"] == []
    assert report["errors"]
