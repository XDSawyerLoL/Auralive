from __future__ import annotations

from pathlib import Path

from aura_runtime.admin_chat import complete_followup, render_result
from aura_runtime.admin_assistant import plan_french_administrative_request


def test_budget_followup_creates_a_bounded_read_only_action():
    result = complete_followup('budget-needs-csv', 'depenses.csv')
    assert result is not None
    plan = plan_french_administrative_request(result)
    assert plan['actions'] == [{'type': 'data.csv.summary', 'path': 'depenses.csv'}]


def test_compare_followup_requires_two_explicit_filenames():
    assert complete_followup('compare-needs-files', 'ancien.txt') is None
    result = complete_followup('compare-needs-files', 'ancien.txt nouveau.txt')
    assert result
    plan = plan_french_administrative_request(result)
    assert plan['actions'][0] == {
        'type': 'files.compare', 'left': 'ancien.txt', 'right': 'nouveau.txt'
    }


def test_backup_followup_does_not_approve_write_automatically():
    result = complete_followup('backup-needs-file', 'notes.txt')
    plan = plan_french_administrative_request(result)
    assert plan['intent'] == 'backup'
    assert plan['actions'][0]['type'] == 'files.backup'
    # Interactive session separately asks for the exact string OUI.


def test_rejects_file_escape_in_a_followup():
    for value in ('../secret.csv', '/etc/passwd', '..\\secret.csv'):
        assert complete_followup('budget-needs-csv', value) is None


def test_render_reports_factual_inventory_without_saying_organised():
    report = {
        'executed': True, 'status': 'completed',
        'steps': [{
            'type': 'admin.inventory', 'files_counted': 4,
            'categories': {'factures': 2, 'impots': 1, 'a_identifier': 1},
            'truncated': False,
        }],
    }
    message = render_result(report)
    assert 'Documents repérés' in message
    assert 'factures=2' in message
    assert 'Aucun document lu, déplacé ou envoyé' in message


def test_render_unknown_action_does_not_pretend_success():
    report = {
        'executed': False, 'status': 'not-executed',
        'reason': 'Nom du CSV manquant',
        'needs': ['Choisir un fichier CSV de dépenses.'],
    }
    message = render_result(report)
    assert 'Nom du CSV manquant' in message
    assert 'Choisir un fichier CSV' in message


def test_admin_pragmatic_payslip_request_is_not_a_payment():
    plan = plan_french_administrative_request('Retrouve mon bulletin de paie')
    assert plan['intent'] == 'locate'
    assert plan['actions'][0]['query'] == 'bulletin'


def test_external_payment_and_removal_not_allowed():
    for sentence in ('Paie mes factures', 'Supprime mes déclarations'):
        plan = plan_french_administrative_request(sentence)
        assert plan['actions'] == []
        assert plan['intent'] == 'external-or-destructive-request'
