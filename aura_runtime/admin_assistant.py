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
            'Vérifier manuellement les catégories proposées.',
            'Choisir les documents à examiner avant toute décision.',
            'Autoriser explicitement toute opération qui modifierait les fichiers.',
        ],
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
    if not raw or len(raw) > 1800:
        return None
    request = normalize(raw)
    domain = (
        'administrat', 'document', 'papier', 'factur', 'impot', 'declar',
        'depense', 'budget', 'justificatif', 'contrat', 'salaire', 'releve',
        'dossier', 'fichier', 'sauvegard', 'compar', 'assuranc',
    )
    if not any(key in request for key in domain):
        return None

    def outcome(intent, summary, actions=(), needs=(), *, confidence='limited'):
        return {
            'planner': 'deterministic-french-administrative-v1',
            'intent': intent, 'summary': summary, 'actions': list(actions),
            'needs': list(needs), 'confidence': confidence,
            'limitations': 'Compréhension bornée : aucune gestion globale de la vie administrative.',
        }

    # Block external or destructive operations, even if another keyword
    # would otherwise produce a safe file action.
    risky = ('paie ', 'payer ', 'virement', 'achete ', 'transfere ',
             'envoie ', 'expedie ', 'depose ', 'transmets ', 'televerse ',
             'supprime ', 'efface ', 'detruis ', 'declare ', 'declarer ',
             'signe ', 'signature ', 'resilie ', 'annule ')
    if any(word in f' {request} ' for word in risky):
        return outcome(
            'external-or-destructive-request',
            'Action administrative externe ou destructive non autorisée.',
            needs=('Définir la démarche exacte, les documents et obtenir une validation humaine.',),
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

    if any(key in request for key in ('retrouv', 'cherche', 'recherch', 'ou sont')):
        # Search only an explicit quotation or a narrow, known subject.
        quoted = [q.strip() for q in QUOTED_RE.findall(raw)]
        if quoted and len(quoted[0]) <= 120:
            term = quoted[0]
        else:
            term = next((word for key, word in [
                ('factur', 'facture'), ('impot', 'impot'), ('justificatif', 'justificatif'),
                ('contrat', 'contrat'), ('salaire', 'salaire'),
            ] if key in request), '')
        if term:
            return outcome('search', 'Rechercher uniquement dans les fichiers texte autorisés.',
                           ({'type': 'files.search', 'path': '.', 'query': term},),
                           confidence='keyword')
        return outcome('search-needs-term', 'Recherche non lancée : sujet trop imprécis.',
                       needs=('Préciser un mot ou une expression à rechercher.',))

    if any(key in request for key in ('organis', 'rang', 'class', 'tri', 'administrat', 'papier', 'document', 'dossier')):
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
