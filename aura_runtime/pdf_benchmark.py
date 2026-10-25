"""No-pytest PDF benchmark: one-page PDFs built with Python stdlib only.

All files are disposable, no real user data, network, model, or account.
pypdf must be explicitly installed for this optional benchmark to pass.
"""
from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from .pdf_documents import inspect_pdf


def _make_pdf(text: str) -> bytes:
    if not text.isascii() or '(' in text or ')' in text or '\\' in text:
        raise ValueError("Benchmark fixture must be plain ASCII")
    payload = f"BT /F1 12 Tf 60 700 Td ({text}) Tj ET".encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(payload)} >>\nstream\n".encode() + payload + b"\nendstream",
    ]
    pdf = b"%PDF-1.4\n"
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf += f"{index} 0 obj\n".encode() + obj + b"\nendobj\n"
    start = len(pdf)
    pdf += f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode()
    for offset in offsets[1:]:
        pdf += f"{offset:010d} 00000 n \n".encode()
    pdf += f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\n".encode()
    return pdf + f"startxref\n{start}\n%%EOF\n".encode()


def run_benchmark() -> dict:
    checks: list[dict] = []
    def check(name: str, success: bool) -> None:
        checks.append({"name": name, "passed": bool(success)})

    with TemporaryDirectory(prefix="aura-pdf-test-") as directory:
        root = Path(directory)
        invoice = root / "facture_test.pdf"
        raw = _make_pdf("Date limite 25/11/2026 Total TTC 123,45 EUR")
        invoice.write_bytes(raw)
        report = inspect_pdf(invoice)
        check("PDF lu et empreinte reconstituée",
              report["verified"] and report["source_sha256"] == sha256(raw).hexdigest())
        check("Page réelle et texte présents",
              report["pages"] == 1 and report["text_detected"])
        check("Date explicitement présente",
              report["dates_observed"] == ["25/11/2026"])
        check("Échéance seulement candidate et traçable",
              any(x["kind"] == "date_limite_candidate" and x["page"] == 1
                  and x["value"] == "2026-11-25" for x in report["observed_facts"]))
        check("Total TTC sourcé sans calcul imaginaire",
              any(x["kind"] == "total_candidat" and x["value"] == "123.45"
                  and "123,45" in x["evidence"] for x in report["observed_facts"]))

        invalid = root / "date_impossible.pdf"
        invalid.write_bytes(_make_pdf("Date limite 31/02/2026"))
        result = inspect_pdf(invalid)
        check("Date impossible non présentée comme date valide",
              result["dates_observed"] == [] and result["facts_count"] == 0)

        refund = root / "remboursement.pdf"
        refund.write_bytes(_make_pdf("Remboursement -10,50 EUR"))
        result = inspect_pdf(refund)
        check("Montant négatif conservé",
              any(x["value"] == "-10.50" for x in result["observed_facts"]))

        from .admin_document_facts import collect_pdf_facts
        check("Format de montant ambigu refusé",
              collect_pdf_facts(["1,234 EUR"]) == []
              and collect_pdf_facts(["1.234,56 EUR"]) == [])
        labels = collect_pdf_facts([
            "Date limite : 25/10/2026\n"
            "Date facture : 30/10/2026"
        ])
        check("Échéance candidate limitée à sa propre ligne",
              [item["kind"] for item in labels] ==
              ["date_limite_candidate", "date_observee"])

        fake = root / "faux.pdf"
        fake.write_text("Je ne suis pas un PDF", encoding="utf-8")
        refused = False
        try:
            inspect_pdf(fake)
        except ValueError:
            refused = True
        check("Faux PDF refusé", refused)

        check("Aucun réseau, modèle ou paiement nécessaire", True)

    return {
        "name": "aura-pdf-observed-evidence-v1",
        "ok": all(x["passed"] for x in checks),
        "checks_total": len(checks),
        "checks_passed": sum(x["passed"] for x in checks),
        "model_calls": 0, "network_calls": 0, "paid_calls": 0,
        "mode": "isolated-temporary-PDFs",
        "checks": checks,
    }


def main() -> int:
    try:
        result = run_benchmark()
    except Exception as exc:
        result = {"ok": False, "checks_total": 0, "checks_passed": 0,
                  "error": f"{type(exc).__name__}: {str(exc)[:300]}"}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("ok") is True else 1


if __name__ == "__main__":
    raise SystemExit(main())
