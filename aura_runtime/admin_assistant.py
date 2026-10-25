"""Bounded French-language administrative intents with deterministic, local actions.

This is a transparent intent router, not general language understanding.
Sensitive external actions (paying, filing, messaging) are never dispatched.
"""
from __future__ import annotations

from collections import Counter
import os
from pathlib import Path
import re
import unicodedata

ALLOWED_EXTENSIONS = frozenset({
    '.txt', '.md', '.pdf', '.csv', '.odt', '.doc', '.docx',
    '.xls', '.xlsx', '.png', '.jpg', '.jpeg', '.webp', '.json',
})
CATEGORIES = {
    'factures': ('facture', 'quittance', 'energie', 'electricite', 'gaz', 'internet', 'telephone'),
    'impots': ('impot', 'fiscal', 'taxe', 'declaration', 'avis_imposition'),
    'emploi': ('salaire', 'paie', 'bulletin', 'contrat_travail', 'emploi', 'attestation_employeur'),
    'assurances': ('assurance', 'mutuelle', 'responsabilite', 'sinistre'),
    'logement': ('loyer', 'bail', 'logement', 'habitation', 'copropriete'),
    'banque': ('banque', 'releve', 'credit', 'rib', 'budget'),
    'identite': ('identite', 'passeport', 'permis', 'etat_civil', 'naissance'),
    'sante': ('sante', 'medical', 'ordonnance', 'consultation', 'remboursement'),
}
EXT_RE = re.compile(r'(?<![\w./\\])([\w.-]{1,100}\.(?:txt|md|csv|json|log|pdf|docx|xlsx))\b', re.IGNORECASE)
QUOTED_RE = re.compile(r'["«“]([^"»”\r\n]{1,180})["»”]')


def normalize(text: str) -> str:
    text = unicodedata.normalize('NFKD', str(text or '').casefold())
    return ''.join(ch for ch in text if not unicodedata.combining(ch))


def administrative_inventory(root: Path, *, max_entries: int = 1000,
                             max_directories: int = 150) -> dict:
    """Classify filenames ONLY: never open a document, never expose its name."""
    if not root.is_dir():
        raise NotADirectoryError(str(root))
    counts: Counter[str] = Counter()
    ext_counts: Counter[str] = Counter()
    scanned_entries = 0
    directories = 0
    counted = 0
    truncated = False

    for current, folders, filenames in os.walk(root, followlinks=False):
        directories += 1
        if directories > max_directories:
            truncated = True
            break
        folders[:] = [
            name for name in sorted(folders) if not name.startswith('.')
            and not (Path(current) / name).is_symlink()
        ]
        for name in sorted(filenames):
            scanned_entries += 1
            if scanned_entries > max_entries:
                truncated = True
                break
            path = Path(current) / name
            if name.startswith('.') or path.is_symlink() or not path.is_file():
                continue
            extension = path.suffix.lower()
            if extension not in ALLOWED_EXTENSIONS:
                continue
            counted += 1
            ext_counts[extension] += 1
            normalized = normalize(path.stem).replace('-', '_').replace(' ', '_')
            category = next((
                label for label, keywords in CATEGORIES.items()
                if any(word in normalized for word in keywords)
            ), 'a_identifier')
            counts[category] += 1
        if truncated:
            break
    return {
        'type': 'admin.inventory', 'ok': True, 'verified': True,
        'mode': 'local-filenames-only', 'read_only': True,
        'files_scanned': scanned_entries, 'files_counted': counted,
        'directories_scanned': min(directories, max_directories),
        'categories': {name: counts[name] for name in (*CATEGORIES, 'a_identifier')},
        'extensions': dict(sorted(ext_counts.items())),
        'truncated': truncated,
        'limitations': [
            'Classement approximatif selon les noms de fichiers uniquement.',
            'Aucun PDF ni document n a été lu ou compris.',
            'Aucun dossier déplacé, aucune démarche administrative effectuée.',
            'Les dossiers cachés et les liens symboliques ne sont pas inspectés.',
        ],
        'next_steps': [
            *(['Examiner les documents non identifiés avant de les classer.']
              if counts['a_identifier'] else []),
            *(['Vérifier quelles périodes sont couvertes par les factures.']
              if counts['factures'] else []),
            *(['Vérifier les années couvertes par les documents fiscaux, sans présumer des obligations.']
              if counts['impots'] else []),
            'Choisir les documents à examiner avant toute décision.',
            'Autoriser explicitement toute opération qui modifierait les fichiers.',
        ],
    }


def locate_documents(root: Path, term: str, *, max_entries: int = 1000, max_hits: int = 30) -> dict:
    """Local-only lookup by filename, including PDF/Office; no document content."""
    needle = normalize(term).strip()
    if not 2 <= len(needle) <= 100 or '/' in needle or '\\' in needle:
        raise ValueError('Terme de recherche invalide')
    if not root.is_dir():
        raise NotADirectoryError(str(root))
    entries = 0
    matches = []
    truncated = False
    directories = 0
    for current, folders, filenames in os.walk(root, followlinks=False):
        directories += 1
        if directories > 150:
            truncated = True
            break
        folders[:] = [
            name for name in sorted(folders)
            if not name.startswith('.') and not (Path(current) / name).is_symlink()
        ]
        for name in sorted(filenames):
            entries += 1
            if entries > max_entries or len(matches) >= max_hits:
                truncated = True
                break
            path = Path(current) / name
            if name.startswith('.') or path.is_symlink() or not path.is_file():
                continue
            if path.suffix.lower() not in ALLOWED_EXTENSIONS:
                continue
            if needle in normalize(path.stem):
                matches.append(str(path.relative_to(root)))
        if truncated:
            break
    return {
        'type': 'admin.locate', 'ok': True, 'verified': True,
        'read_only': True, 'mode': 'local-filename-match',
        'query': term, 'files_scanned': entries,
        'matches': matches, 'matches_count': len(matches),
        'truncated': truncated,
        'limitations': ['Recherche uniquement dans les noms, pas dans les PDF ou documents.'],
    }


def _filenames(text: str) -> list[str]:
    values = [item.strip() for item in QUOTED_RE.findall(text)]
    values += [match.strip() for match in EXT_RE.findall(text)]
    candidates = []
    for value in values:
        # Only one relative filename, not a URI or an arbitrary path.
        if (value and value not in candidates and '/' not in value and '\\' not in value
                and not value.startswith('.') and value not in {'.', '..'}
                and '..' not in value):
            candidates.append(value)
    return candidates[:3]


def plan_french_administrative_request(raw_request: str) -> dict | None:
    """Return a transparent typed plan for recognizable French intents.

    None means this is NOT an administrative intent and the normal planner
    may be used. For administrative requests that cannot safely be completed,
    return an empty action list with explicit missing parameters; never
    send these requests to an unbounded generative action planner.
    """
    raw = str(raw_request or '').strip()
    if not raw:
        return None
    request = normalize(raw)
    if len(raw) > 1800:
        return {
            'planner': 'deterministic-french-administrative-v1',
            'intent': 'request-too-long',
            'summary': 'Demande trop longue, aucune action lancée.',
            'actions': [], 'needs': ['Rédiger une demande plus précise et courte.'],
            'confidence': 'none',
            'limitations': 'Entrée refusée pour éviter un plan incomplet ou risqué.',
        }
    domain = (
        'administrat', 'document', 'papier', 'factur', 'impot', 'declar',
        'depense', 'budget', 'justificatif', 'contrat', 'salaire', 'releve',
        'dossier', 'fichier', 'sauvegard', 'compar', 'assuranc',
        'bulletin', 'paie', 'mutuelle', 'sante', 'logement', 'identit', 'retraite',
        'copie de securite', 'impos', 'quittance', 'fiscal', 'loyer',
        'pdf',
        'sauvegard',
    )
    # Whole-word patterns prevent "triste", "étrange" and unrelated
    # "classement de jeux" from launching a private folder scan.
    admin_verbs = bool(re.search(
        r'\b(?:organiser?|organisation|organisez|organisons|ranger|range|rangez|classer|classe|classez|trier|trie|triez|tri)\b',
        request,
    ))
    def outcome(intent, summary, actions=(), needs=(), *, confidence='limited'):
        return {
            'planner': 'deterministic-french-administrative-v1',
            'intent': intent, 'summary': summary, 'actions': list(actions),
            'needs': list(needs), 'confidence': confidence,
            'limitations': 'Compréhension bornée : aucune gestion globale de la vie administrative.',
        }

    # Block external or destructive operations, even if another keyword
    # would otherwise produce a safe file action.
    dangerous_verbs = (
        'paie', 'paye', 'payer', 'payez', 'achete', 'acheter',
        'transfere', 'transferer', 'envoie', 'envoyer', 'envoyez',
        'expedie', 'expedier', 'depose', 'deposer', 'transmets', 'transmettre',
        'televerse', 'televerser', 'supprime', 'supprimer', 'efface', 'effacer',
        'detruis', 'detruire', 'declare', 'declarer', 'signe', 'signer',
        'resilie', 'resilier', 'annule', 'annuler', 'soumettre', 'publier',
    )
    # Match verbs anywhere, not merely "envoie mes". Do not confuse the
    # document phrase "bulletin de paie" with an order to pay.
    risky_command = False
    for matched in re.finditer(r'\b(?:' + '|'.join(dangerous_verbs) + r')\b', request):
        token = matched.group(0)
        before = request[max(0, matched.start() - 3):matched.start()]
        if token == 'paie' and before == 'de ':
            continue
        risky_command = True
        break
    if risky_command or 'virement' in request or 'signature electronique' in request:
        return outcome(
            'external-or-destructive-request',
            'Action externe ou destructive non autorisée par AURA Runtime.',
            needs=('Obtenir un accord explicite et une capacité dédiée, actuellement absente.',),
        )

    # External/destructive requests are refused even if they do not contain
    # an administrative keyword. They must never fall back to free-form
    # model planning with browser/automation permissions.
    if not any(key in request for key in domain) and not admin_verbs:
        return None

    # One explicitly named PDF may be inspected locally. Extraction is
    # bounded, not an LLM summary or an automatic administrative decision.
    if (re.search(r'\b(?:lis|lire|ouvre|ouvrir|inspecte|inspecter|examine|examiner|extrais|extraire)\b', request)
            and ('pdf' in request or 'document' in request or 'factur' in request)):
        files = _filenames(raw)
        pdf_files = [name for name in files if name.lower().endswith('.pdf')]
        if len(pdf_files) == 1 and len(files) == 1:
            return outcome(
                'pdf-inspect',
                'Lire localement le texte du PDF désigné et relever ses dates explicites.',
                ({'type': 'admin.pdf.inspect', 'path': pdf_files[0]},),
                confidence='explicit-pdf',
            )
        return outcome(
            'pdf-needs-file',
            'Lecture PDF non lancée : indiquer un seul fichier PDF précis.',
            needs=('Indiquer le nom exact du PDF, sans chemin externe.',),
        )

    if any(key in request for key in ('sauvegard', 'copie de securite')):
        files = _filenames(raw)
        if len(files) == 1:
            return outcome('backup', 'Créer une sauvegarde vérifiée du fichier nommé.',
                           ({'type': 'files.backup', 'path': files[0]},),
                           confidence='explicit-file')
        return outcome('backup-needs-file',
                       'Sauvegarde non lancée : il faut désigner un fichier exact.',
                       needs=('Fournir le nom du fichier à sauvegarder.',))

    if any(key in request for key in ('compar', 'differenc', 'changement entre')):
        files = _filenames(raw)
        if len(files) == 2:
            supported = {'.txt', '.md', '.csv', '.json', '.log'}
            if any(Path(name).suffix.lower() not in supported for name in files):
                return outcome(
                    'compare-unsupported-format',
                    'Comparaison non exécutée : seuls les fichiers texte UTF-8 sont pris en charge.',
                    needs=('Convertir les deux documents en texte UTF-8, après validation humaine.',),
                )
            return outcome('compare', 'Comparer deux versions textuelles désignées.',
                           ({'type': 'files.compare', 'left': files[0], 'right': files[1]},),
                           confidence='explicit-files')
        return outcome('compare-needs-files', 'Comparaison impossible sans deux fichiers précis.',
                       needs=('Indiquer les deux noms des documents à comparer.',))

    if any(key in request for key in ('depense', 'budget', 'total', 'somme')):
        csv_files = [f for f in _filenames(raw) if f.lower().endswith('.csv')]
        if len(csv_files) == 1:
            return outcome('csv-summary', 'Calculer les statistiques du CSV désigné.',
                           ({'type': 'data.csv.summary', 'path': csv_files[0]},),
                           confidence='explicit-file')
        return outcome('budget-needs-csv',
                       'Budget non calculé : aucun fichier CSV exact désigné.',
                       needs=('Choisir un fichier CSV de dépenses.',))

    if any(key in request for key in ('retrouv', 'trouv', 'cherche', 'recherch',
                                      'ou sont', 'sont ou', 'ou est', 'ou se trouve',
                                      'montre', 'affiche', 'voir mes', 'voir mon', 'voir ma')):
        # Search only an explicit quotation or a narrow, known subject.
        quoted = [q.strip() for q in QUOTED_RE.findall(raw)]
        if quoted and len(quoted[0]) <= 120:
            term = quoted[0]
        else:
            term = next((word for key, word in [
                ('factur', 'facture'), ('impot', 'impot'), ('justificatif', 'justificatif'),
                ('contrat', 'contrat'), ('salaire', 'salaire'),
                ('bulletin', 'bulletin'), ('paie', 'paie'),
                ('assuran', 'assurance'), ('mutuelle', 'mutuelle'),
                ('sante', 'sante'), ('logement', 'logement'),
                ('identit', 'identite'), ('retraite', 'retraite'),
                ('impos', 'impos'), ('fiscal', 'fiscal'),
                ('quittance', 'quittance'), ('loyer', 'loyer'),
            ] if key in request), '')
        if term:
            if quoted:
                return outcome('search', 'Rechercher une expression dans les fichiers texte autorisés.',
                               ({'type': 'files.search', 'path': '.', 'query': term},),
                               confidence='exact-expression')
            return outcome('locate', 'Retrouver les documents par leur nom, y compris PDF et fichiers Office.',
                           ({'type': 'admin.locate', 'path': '.', 'query': term},),
                           confidence='filename-keyword')
        return outcome('search-needs-term', 'Recherche non lancée : sujet trop imprécis.',
                       needs=('Préciser un mot ou une expression à rechercher.',))

    if admin_verbs or any(key in request for key in ('administrat', 'papier', 'document', 'dossier')):
        return outcome(
            'administrative-inventory',
            'Inventorier les documents administratifs sans les déplacer ni lire leur contenu.',
            ({'type': 'admin.inventory', 'path': '.'},),
            confidence='first-step-only',
        )

    return outcome(
        'ambiguous-administrative-request',
        'Demande administrative identifiée, action non déterminable sans précision.',
        needs=('Indiquer la tâche et les fichiers concernés.',),
    )
