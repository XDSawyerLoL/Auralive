"""Conservative, offline fact extraction from untrusted administrative PDF text.

Facts are observations, not advice, debts or legally verified deadlines.
All evidence is traceable to a page and excerpt. No model or network.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
import re
from typing import Any

DATE = re.compile(
    r"(?<!\d)(?P<day>0?[1-9]|[12]\d|3[01])[/.-]"
    r"(?P<month>0?[1-9]|1[012])[/.-]"
    r"(?P<year>20\d\d)(?!\d)"
)
# Euro sign is not a word character, so its trailing boundary is optional.
AMOUNT = re.compile(
    r"(?<![\w\d.,])(?P<sign>[-−]?[ \u00a0\u202f]*)(?P<number>(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d{1,9})"
    r"(?:[,.]\d{1,2})?)\s*(?P<currency>€|EUR)(?![A-Za-z])",
    re.IGNORECASE,
)
DUE_HINT = re.compile(
    r"(?:date\s+limite|date\s+d['’]?[ée]ch[ée]ance|[ée]ch[ée]ance|"
    r"[àa]\s+r[ée]gler\s+avant|paiement\s+avant|avant\s+le)",
    re.IGNORECASE,
)
TOTAL_HINT = re.compile(
    r"(?:total\s+ttc|montant\s+[àa]\s+payer|net\s+[àa]\s+payer|total\s+d[uû])",
    re.IGNORECASE,
)


def _context(text: str, start: int, end: int, *, before: int = 75, after: int = 45) -> str:
    """Short evidence excerpt; line boundaries are meaningful for labelling."""
    left = text.rfind("\n", max(0, start - before), start)
    right = text.find("\n", end, min(len(text), end + after))
    from_pos = max(0, start - before, left + 1 if left >= 0 else 0)
    to_pos = min(len(text), end + after, right if right >= 0 else len(text))
    return " ".join(text[from_pos:to_pos].split())[:175]


def _prefix(text: str, start: int, *, max_chars: int = 65) -> str:
    """Only preceding content on the SAME line can label a value."""
    previous_line = text.rfind("\n", max(0, start - max_chars), start)
    beginning = max(0, start - max_chars, previous_line + 1)
    return text[beginning:start]


def collect_pdf_facts(pages: list[str], *, max_facts: int = 30) -> list[dict[str, Any]]:
    """Observe facts present verbatim on specific pages, in bounded numbers."""
    facts: list[dict[str, Any]] = []
    for page_number, text in enumerate(pages, 1):
        if len(facts) >= max_facts:
            break
        for match in DATE.finditer(text):
            try:
                actual = date(int(match["year"]), int(match["month"]), int(match["day"]))
            except ValueError:
                continue
            context = _context(text, match.start(), match.end())
            prefix = _prefix(text, match.start()).strip()
            kind = "date_limite_candidate" if DUE_HINT.search(prefix) else "date_observee"
            facts.append({
                "kind": kind, "page": page_number, "raw": match.group(0),
                "value": actual.isoformat(), "evidence": context,
                "certainty": "texte_observe_non_verifie",
            })
            if len(facts) >= max_facts:
                break
        if len(facts) >= max_facts:
            break
        for match in AMOUNT.finditer(text):
            number = match["number"].replace(" ", "").replace("\u00a0", "").replace("\u202f", "")
            try:
                amount = Decimal(number.replace(",", "."))
                if "-" in match["sign"] or "−" in match["sign"]:
                    amount = -amount
                if not amount.is_finite():
                    continue
            except InvalidOperation:
                continue
            context = _context(text, match.start(), match.end())
            prefix = context[:context.find(match.group(0))].strip()
            kind = "total_candidat" if TOTAL_HINT.search(prefix) else "montant_observe"
            facts.append({
                "kind": kind, "page": page_number, "raw": match.group(0),
                "value": str(amount), "currency": "EUR", "evidence": context,
                "certainty": "texte_observe_non_verifie",
            })
            if len(facts) >= max_facts:
                break
    return facts


INVOICE_REF = re.compile(
    r'\b(?:facture|invoice)\s*'
    r'(?:n(?:[°ºo.]|(?=\s*:))|num[eé]ro|#|r[eé]f[eé]rence)\s*[:#-]?\s*'
    r'(?P<reference>[A-Z0-9][A-Z0-9-]{6,31})\b',
    re.IGNORECASE,
)


def collect_invoice_references(pages: list[str], *, max_hits: int = 12) -> list[dict[str, Any]]:
    """Only explicitly labelled invoice references with page-backed evidence."""
    found = []
    for page_number, text in enumerate(pages, 1):
        for match in INVOICE_REF.finditer(text):
            found.append({
                'page': page_number,
                'reference': match['reference'].upper(),
                'evidence': _context(text, match.start(), match.end()),
                'certainty': 'texte_observe_non_verifie',
            })
            if len(found) >= max_hits:
                return found
    return found
