"""AURA's bounded, deterministic everyday file and data capabilities.

No LLM, network, database, package dependency, shell, or secret lookup.
Paths must have been checked by RuntimeOperator._resolve_path.
"""
from __future__ import annotations

import csv
from decimal import Decimal, InvalidOperation
from difflib import unified_diff
import hashlib
import io
import os
from pathlib import Path
import uuid
from typing import Any

SEARCH_SUFFIXES = frozenset({'.txt', '.md', '.csv', '.json', '.log'})
MAX_FILE_BYTES = 200_000
MAX_CSV_BYTES = 1_000_000


def _sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _safe_bytes(path: Path, limit: int = MAX_FILE_BYTES) -> bytes:
    if path.is_symlink() or not path.is_file():
        raise ValueError('Fichier absent, non régulier ou lien symbolique interdit')
    if path.stat().st_size > limit:
        raise ValueError('Fichier trop volumineux pour la tâche')
    with path.open('rb') as handle:
        data = handle.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Fichier trop volumineux pour la tâche')
    return data


def search_text(directory: Path, phrase: str, *, max_files: int = 100, max_hits: int = 30) -> dict[str, Any]:
    needle = str(phrase or '').strip()
    if not 2 <= len(needle) <= 120 or '\x00' in needle or '\n' in needle:
        raise ValueError('Recherche de 2 à 120 caractères, sans saut de ligne')
    if not directory.is_dir():
        raise NotADirectoryError(str(directory))
    found: list[dict[str, Any]] = []
    scanned = 0
    skipped = 0
    directories_seen = 0
    files_seen = 0
    truncated = False
    for current, folders, filenames in os.walk(directory, followlinks=False):
        directories_seen += 1
        if directories_seen > 300:
            truncated = True
            break
        folders[:] = [name for name in sorted(folders)
                      if not name.startswith('.') and not (Path(current) / name).is_symlink()]
        for filename in sorted(filenames):
            files_seen += 1
            if files_seen > 2000 or scanned >= max_files or len(found) >= max_hits:
                truncated = True
                break
            candidate = Path(current) / filename
            relative = candidate.relative_to(directory)
            if filename.startswith('.') or candidate.is_symlink():
                continue
            if not candidate.is_file() or candidate.suffix.lower() not in SEARCH_SUFFIXES:
                continue
            scanned += 1
            try:
                raw = _safe_bytes(candidate)
                content = raw.decode('utf-8-sig')
            except (ValueError, UnicodeError, OSError):
                skipped += 1
                continue
            for line_number, line in enumerate(content.splitlines(), 1):
                if needle.casefold() not in line.casefold():
                    continue
                found.append({
                    'file': str(relative), 'line': line_number, 'excerpt': line[:200],
                    'file_sha256': _sha(raw),
                })
                if len(found) >= max_hits:
                    break
        if truncated:
            break
    return {
        'type': 'files.search', 'ok': True, 'query': needle,
        'directory': str(directory), 'files_scanned': scanned,
        'files_skipped': skipped, 'matches': found,
        'matches_count': len(found), 'limit_reached': truncated or scanned >= max_files or len(found) >= max_hits,
        'verified': True,
    }


def _numeric(value: str) -> Decimal | None:
    value = value.strip().replace('\u00a0', '').replace(' ', '')
    if not value:
        return None
    if ',' in value and '.' in value:
        # Disallow ambiguous grouping and prefer the last punctuation as decimal.
        last_comma = value.rfind(',')
        last_dot = value.rfind('.')
        if last_comma > last_dot:
            value = value.replace('.', '').replace(',', '.')
        else:
            value = value.replace(',', '')
    else:
        value = value.replace(',', '.')
    try:
        number = Decimal(value)
        return number if number.is_finite() else None
    except InvalidOperation:
        return None


def summarize_csv(path: Path) -> dict[str, Any]:
    raw = _safe_bytes(path, MAX_CSV_BYTES)
    text = raw.decode('utf-8-sig')
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=',;\t')
    except csv.Error:
        dialect = csv.excel
    rows = csv.DictReader(io.StringIO(text), dialect=dialect)
    columns = rows.fieldnames or []
    if not columns or len(columns) > 32 or any(not item for item in columns):
        raise ValueError('CSV sans colonnes exploitables ou plus de 32 colonnes')
    if len(set(columns)) != len(columns):
        raise ValueError('En-têtes de colonnes dupliqués')
    stats: dict[str, list[Decimal]] = {column: [] for column in columns}
    invalid: dict[str, int] = {column: 0 for column in columns}
    count = 0
    for row in rows:
        count += 1
        if count > 5000:
            raise ValueError('CSV supérieur à 5000 lignes')
        if None in row:
            raise ValueError('CSV malformé: trop de colonnes dans une ligne')
        for column in columns:
            value = str(row.get(column) or '')
            if not value.strip():
                continue
            number = _numeric(value)
            if number is None:
                invalid[column] += 1
            else:
                stats[column].append(number)
    numeric_stats: dict[str, dict[str, str | int]] = {}
    for column in columns:
        values = stats[column]
        if not values or invalid[column]:
            continue
        total = sum(values, Decimal(0))
        numeric_stats[column] = {
            'count': len(values), 'sum': str(total),
            'average': str(total / len(values)),
            'minimum': str(min(values)), 'maximum': str(max(values)),
        }
    return {
        'type': 'data.csv.summary', 'ok': True, 'path': str(path),
        'rows': count, 'columns': columns, 'numeric': numeric_stats,
        'source_sha256': _sha(raw), 'verified': True,
    }


def compare_text(left: Path, right: Path) -> dict[str, Any]:
    a, b = _safe_bytes(left), _safe_bytes(right)
    try:
        left_lines = a.decode('utf-8-sig').splitlines()
        right_lines = b.decode('utf-8-sig').splitlines()
    except UnicodeError as error:
        raise ValueError('Comparaison de fichiers texte UTF-8 uniquement') from error
    diff = list(unified_diff(left_lines, right_lines, fromfile=left.name, tofile=right.name, lineterm=''))
    return {
        'type': 'files.compare', 'ok': True, 'identical': a == b,
        'left': str(left), 'right': str(right),
        'left_sha256': _sha(a), 'right_sha256': _sha(b),
        'diff_lines': diff[:100], 'truncated': len(diff) > 100,
        'verified': True,
    }


def backup_file(source: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    raw = _safe_bytes(source, 2_000_000)
    destination = source.with_name(f'{source.name}.aura-backup-{uuid.uuid4().hex[:12]}.bak')
    try:
        with destination.open('xb') as output:
            output.write(raw)
        observed = _safe_bytes(destination, 2_000_000)
        if observed != raw:
            raise RuntimeError('Sauvegarde non vérifiée')
        result = {
            'type': 'files.backup', 'ok': True, 'source': str(source),
            'backup': str(destination), 'bytes': len(observed),
            'sha256': _sha(observed), 'verified': True,
        }
        return result, {'type': 'files.backup', 'path': str(destination), 'created': True}
    except Exception:
        if destination.exists():
            destination.unlink()
        raise
