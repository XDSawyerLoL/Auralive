"""Run actual administrative intents on disposable files. No model, no network."""
from __future__ import annotations

import asyncio
from hashlib import sha256
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from .admin_chat import complete_followup
from .operator import RuntimeOperator


class NoModel:
    async def generate(self, *_args, **_kwargs):
        raise AssertionError('Administrative benchmark must never use any AI model')


def _runtime(root: Path) -> RuntimeOperator:
    settings = SimpleNamespace(
        aura_runtime_operator_roots=[root],
        aura_runtime_operator_allowed_risks={'safe', 'local-write'},
        aura_runtime_operator_commands=set(),
        aura_runtime_operator_domains=set(),
        aura_runtime_cloud_personal_files_enabled=False,
        aura_runtime_operator_max_file_bytes=200000,
        aura_runtime_browser_enabled=False,
        aura_runtime_deep_web_enabled=False,
    )
    return RuntimeOperator(NoModel(), settings)


async def run_benchmark() -> dict:
    checked = []

    def record(name: str, passed: bool, proof: dict | None = None):
        checked.append({
            'name': name, 'passed': passed, 'evidence': proof or {},
        })

    with TemporaryDirectory(prefix='aura-administrative-') as temporary:
        root = Path(temporary)
        (root / 'facture_electricite_2026.pdf').write_bytes(b'%PDF-1.4-test')
        (root / 'avis_imposition_2025.pdf').write_bytes(b'%PDF-1.4-test')
        (root / 'bulletin_paie_2026.pdf').write_bytes(b'%PDF-1.4-test')
        (root / 'notes.txt').write_text('Rendez-vous jeudi\n', encoding='utf-8')
        (root / 'depenses.csv').write_text(
            'categorie;montant\nCourses;12,50\nTransport;3,20\nCafé;2,30\n', encoding='utf-8'
        )
        (root / 'v1.txt').write_text('Contrat ancien\n', encoding='utf-8')
        (root / 'v2.txt').write_text('Contrat nouveau\n', encoding='utf-8')
        (root / '.secret.txt').write_text('Note confidentielle', encoding='utf-8')
        operator = _runtime(root)

        result = await operator.operate('Organise toute ma vie administrative',
                                        requested_risks={'safe'}, source='local-test')
        report = (result.get('steps') or [{}])[0]
        record('Intentions administratives larges → inventaire en lecture seule',
               result.get('executed') is True and report.get('files_counted') == 7
               and report.get('categories', {}).get('factures') == 1
               and 'facture_electricite_2026.pdf' not in str(result),
               {'count': report.get('files_counted'), 'mode': report.get('mode')})

        result = await operator.operate('Retrouve mes factures', requested_risks={'safe'}, source='local-test')
        step = (result.get('steps') or [{}])[0]
        record('Recherche de PDF par nom (sans lecture de son contenu)',
               result.get('executed') is True
               and step.get('matches') == ['facture_electricite_2026.pdf'],
               {'matches': step.get('matches_count')})

        result = await operator.operate('Retrouve mes factures',
                                        requested_risks={'safe'}, source='aura-runtime-worker')
        record('Aucun nom privé envoyé au Cloud sans accord',
               result.get('executed') is False and 'facture_electricite_2026.pdf' not in str(result),
               {'blocked': result.get('status') == 'not-executed'})

        result = await operator.operate('Fais le total de mes dépenses', requested_risks={'safe'})
        record('Budget ambigu → demande de fichier, aucune donnée inventée',
               not result.get('executed') and bool(result.get('needs')),
               {'intent': result.get('intent')})

        request = complete_followup('budget-needs-csv', 'depenses.csv')
        result = await operator.operate(request or '', requested_risks={'safe'})
        totals = (result.get('steps') or [{}])[0].get('numeric', {})
        record('Deux tours en français → CSV réel → total exact',
               result.get('executed') is True and totals.get('montant', {}).get('sum') == '18.00',
               {'sum': totals.get('montant', {}).get('sum')})

        result = await operator.operate('Compare v1.txt avec v2.txt', requested_risks={'safe'})
        step = (result.get('steps') or [{}])[0]
        record('Deux versions comparées, preuve de divergence',
               result.get('executed') is True and step.get('identical') is False
               and step.get('left_sha256') != step.get('right_sha256'),
               {'changed': step.get('identical') is False})

        result = await operator.operate('Sauvegarde notes.txt', requested_risks={'safe'})
        record('Aucune sauvegarde sans permission écriture',
               result.get('executed') is False and not list(root.glob('*.bak')))

        result = await operator.operate('Sauvegarde notes.txt', requested_risks={'local-write'})
        step = (result.get('steps') or [{}])[0]
        backup = Path(step.get('backup') or '/not-a-file')
        record('Sauvegarde écrite, relue et cryptographiquement vérifiée',
               result.get('executed') is True and backup.is_file()
               and step.get('sha256') == sha256(backup.read_bytes()).hexdigest(),
               {'verified': step.get('verified', False)})

        result = await operator.operate('Paie mes factures immédiatement', requested_risks={'safe'})
        record('Refus d effectuer un paiement',
               not result.get('executed') and result.get('intent') == 'external-or-destructive-request')

        result = await operator.operate('Supprime toutes mes déclarations',
                                        requested_risks={'safe', 'local-write'})
        record('Refus de suppression administrative',
               not result.get('executed') and result.get('intent') == 'external-or-destructive-request')


        result = await operator.operate('Trouve mes factures', requested_risks={'safe'}, source='local-test')
        matches = (result.get('steps') or [{}])[0].get('matches', [])
        record('Variante française « trouve » détecte le PDF par son nom',
               result.get('executed') is True
               and matches == ['facture_electricite_2026.pdf'],
               {'matches': len(matches)})

        result = await operator.operate("Retrouve mon avis d'imposition", requested_risks={'safe'}, source='local-test')
        matches = (result.get('steps') or [{}])[0].get('matches', [])
        record('La recherche comprend les avis d imposition',
               result.get('executed') is True
               and matches == ['avis_imposition_2025.pdf'],
               {'matches': len(matches), 'limitation': 'Correspondance de nom, non de contenu'})

        result = await operator.operate('Retrouve mon bulletin de paie', requested_risks={'safe'}, source='local-test')
        matches = (result.get('steps') or [{}])[0].get('matches', [])
        record('« bulletin de paie » reconnu comme document et non paiement',
               result.get('executed') is True
               and matches == ['bulletin_paie_2026.pdf'],
               {'matches': len(matches)})

        result = await operator.operate('Organise mes papiers',
                                        requested_risks={'safe'}, source='aura-runtime-worker')
        record('La confidentialité interdit même le total de documents via Cloud',
               result.get('executed') is False
               and 'categories' not in str(result)
               and 'files_counted' not in str(result),
               {'blocked': result.get('status') == 'not-executed'})

        result = await operator.operate('Envoie au fisc mon avis d imposition',
                                        requested_risks={'safe'}, source='local-test')
        record('Refus envoi administration même sans complément direct',
               result.get('executed') is False
               and result.get('intent') == 'external-or-destructive-request')

    passed = sum(1 for test in checked if test['passed'])
    return {
        'ok': passed == len(checked),
        'name': 'aura-admin-french-real-actions-v1',
        'checks_passed': passed, 'checks_total': len(checked),
        'model_calls': 0, 'network_calls': 0, 'paid_calls': 0,
        'mode': 'isolated-temporary-local-files',
        'checks': checked,
    }


def main():
    try:
        report = asyncio.run(run_benchmark())
    except Exception as error:
        report = {'ok': False, 'error': f'{type(error).__name__}: {error}'[:350]}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report.get('ok') else 1


if __name__ == '__main__':
    raise SystemExit(main())
