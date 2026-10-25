"""Natural French administrative requests: precise evidence and explicit limits."""
from __future__ import annotations

from argparse import Namespace
from pathlib import Path

import pytest

from aura_runtime.admin_assistant import (
    administrative_inventory, locate_documents, plan_french_administrative_request,
)
from aura_runtime.personal_cli import execute_command
from aura_runtime.operator import RuntimeOperator
from test_aura_runtime_operator import FakeAI, settings


def prepare(root: Path):
    (root / 'facture_electricite_2026.pdf').write_bytes(b'%PDF-local-test')
    (root / 'avis_impots_2025.pdf').write_bytes(b'%PDF-local-test')
    (root / 'bulletin_paie_2026.pdf').write_bytes(b'%PDF-local-test')
    (root / 'contrat_assurance.pdf').write_bytes(b'%PDF-local-test')
    (root / 'sans_nom.pdf').write_bytes(b'%PDF-local-test')
    (root / 'notes.txt').write_text('Facture réglée lundi\\n', encoding='utf-8')
    (root / '.secret.txt').write_text('Fichier confidentiel', encoding='utf-8')


@pytest.mark.parametrize('request', [
    'Organise toute ma vie administrative',
    'Range mes papiers administratifs',
    'Classe mes documents',
    'Organise mes dossiers',
])
def test_broad_french_requests_only_permit_read_only_inventory(request):
    result = plan_french_administrative_request(request)
    assert result['intent'] == 'administrative-inventory'
    assert result['actions'] == [{'type': 'admin.inventory', 'path': '.'}]
    assert result['confidence'] == 'first-step-only'


@pytest.mark.parametrize('request', [
    'Paie mes factures immédiatement',
    'Déclare mes impôts',
    'Supprime toutes mes factures',
    'Envoie les documents administratifs',
])
def test_high_stakes_request_never_dispatches_actions(request):
    result = plan_french_administrative_request(request)
    assert result['intent'] == 'external-or-destructive-request'
    assert result['actions'] == []
    assert result['needs']


def test_admin_inventory_classifies_actual_names_without_reading_content(tmp_path):
    prepare(tmp_path)
    report = administrative_inventory(tmp_path)
    assert report['ok'] and report['read_only']
    assert report['files_counted'] == 6
    assert report['categories']['factures'] == 1
    assert report['categories']['impots'] == 1
    assert report['categories']['emploi'] == 1
    assert report['categories']['assurances'] == 1
    assert report['categories']['a_identifier'] == 2
    assert 'facture_electricite_2026.pdf' not in str(report)
    assert '.secret.txt' not in str(report)


def test_admin_locate_searches_pdf_name_only(tmp_path):
    prepare(tmp_path)
    report = locate_documents(tmp_path, 'facture')
    assert report['ok'] and report['matches_count'] == 1
    assert report['matches'] == ['facture_electricite_2026.pdf']
    assert report['mode'] == 'local-filename-match'


def test_admin_lookup_ignores_hidden_and_symlink_directories(tmp_path):
    hidden = tmp_path / '.private'
    hidden.mkdir()
    (hidden / 'facture_secrete.pdf').write_text('secret', encoding='utf-8')
    ordinary = tmp_path / 'public'
    ordinary.mkdir()
    (ordinary / 'facture_autorisee.pdf').write_text('public', encoding='utf-8')
    link = tmp_path / 'link'
    try:
        link.symlink_to(hidden, target_is_directory=True)
    except (OSError, NotImplementedError):
        pass
    report = locate_documents(tmp_path, 'facture')
    assert report['matches'] == ['public/facture_autorisee.pdf']


def test_ordinary_french_request_uses_filename_lookup_not_pdf_content():
    result = plan_french_administrative_request('Retrouve mes factures')
    assert result['intent'] == 'locate'
    assert result['actions'] == [{'type': 'admin.locate', 'path': '.', 'query': 'facture'}]


def test_quoted_phrase_searches_only_allowed_text_files():
    result = plan_french_administrative_request('Cherche "numéro de dossier" dans mes papiers')
    assert result['intent'] == 'search'
    assert result['actions'][0]['type'] == 'files.search'


def test_csv_requires_user_named_file():
    pending = plan_french_administrative_request('Fais le total de mes dépenses')
    assert pending['actions'] == []
    assert pending['needs']
    ready = plan_french_administrative_request('Fais le total de mes dépenses dans budget.csv')
    assert ready['actions'] == [{'type': 'data.csv.summary', 'path': 'budget.csv'}]


def test_comparison_requires_two_named_files():
    pending = plan_french_administrative_request('Compare mes documents')
    assert pending['needs'] and not pending['actions']
    ready = plan_french_administrative_request('Compare avant.txt avec apres.txt')
    assert ready['actions'] == [{'type': 'files.compare', 'left': 'avant.txt', 'right': 'apres.txt'}]


def test_backup_requires_specific_filename():
    pending = plan_french_administrative_request('Sauvegarde mes factures')
    assert pending['needs'] and not pending['actions']
    ready = plan_french_administrative_request('Sauvegarde notes.txt')
    assert ready['actions'] == [{'type': 'files.backup', 'path': 'notes.txt'}]


class FailIfInvokedAI:
    async def generate(self, *_args, **_kwargs):
        raise AssertionError('Les demandes administratives ne doivent pas appeler un LLM')


@pytest.mark.asyncio
async def test_operator_executes_real_natural_french_inventory(tmp_path):
    prepare(tmp_path)
    operator = RuntimeOperator(FailIfInvokedAI(), settings(tmp_path))
    outcome = await operator.operate(
        'Organise toute ma vie administrative', requested_risks={'safe'}, source='local-test'
    )
    assert outcome['executed'] is True
    assert outcome['intent'] == 'administrative-inventory'
    assert outcome['steps'][0]['files_counted'] == 6


@pytest.mark.asyncio
async def test_operator_executes_actual_pdf_filename_search(tmp_path):
    prepare(tmp_path)
    operator = RuntimeOperator(FailIfInvokedAI(), settings(tmp_path))
    outcome = await operator.operate(
        'Retrouve mes factures', requested_risks={'safe'}, source='local-test'
    )
    assert outcome['executed'] is True
    assert outcome['steps'][0]['matches'] == ['facture_electricite_2026.pdf']


@pytest.mark.asyncio
async def test_operator_asks_for_missing_csv_without_hallucinating(tmp_path):
    operator = RuntimeOperator(FailIfInvokedAI(), settings(tmp_path))
    outcome = await operator.operate('Fais le total de mes dépenses', requested_risks={'safe'})
    assert outcome['executed'] is False
    assert outcome['status'] == 'not-executed'
    assert 'CSV' in outcome['needs'][0]


@pytest.mark.asyncio
async def test_cloud_cannot_receive_personal_document_names_by_default(tmp_path):
    prepare(tmp_path)
    operator = RuntimeOperator(FailIfInvokedAI(), settings(tmp_path))
    outcome = await operator.operate(
        'Retrouve mes factures',
        requested_risks={'safe'},
        source='aura-runtime-worker',
    )
    assert outcome['executed'] is False
    assert outcome['status'] == 'not-executed'
    assert 'Accès aux données personnelles' in outcome['reason']
    assert 'facture_electricite_2026.pdf' not in str(outcome)


@pytest.mark.asyncio
async def test_cloud_inventory_cannot_share_even_category_counts_by_default(tmp_path):
    prepare(tmp_path)
    operator = RuntimeOperator(FailIfInvokedAI(), settings(tmp_path))
    outcome = await operator.operate(
        'Organise mes dossiers administratifs',
        requested_risks={'safe'},
        source='aura-runtime-worker',
    )
    assert outcome['executed'] is False
    assert outcome['status'] == 'not-executed'
    assert 'Accès aux données personnelles' in outcome['reason']
    assert 'avis_impots_2025.pdf' not in str(outcome)
    assert 'categories' not in outcome


@pytest.mark.asyncio
async def test_cloud_inventory_only_after_explicit_local_opt_in(tmp_path):
    prepare(tmp_path)
    config = settings(tmp_path)
    config.aura_runtime_cloud_personal_files_enabled = True
    operator = RuntimeOperator(FailIfInvokedAI(), config)
    result = await operator.operate(
        'Organise mes dossiers administratifs',
        requested_risks={'safe'}, source='aura-runtime-worker',
    )
    assert result['executed'] is True
    assert result['steps'][0]['categories']['impots'] == 1
    assert 'avis_impots_2025.pdf' not in str(result)


@pytest.mark.asyncio
async def test_unavailable_free_model_returns_factual_blocker_not_a_crash(tmp_path):
    operator = RuntimeOperator(FailIfInvokedAI(), settings(tmp_path))
    result = await operator.operate(
        'Trouve-moi une solution de garde de chat demain',
        requested_risks={'safe'}, source='local-test',
    )
    assert result['executed'] is False
    assert result['status'] == 'not-executed'
    assert result['needs']
    assert result['error_type'] == 'AssertionError'



@pytest.mark.asyncio
async def test_cli_accepts_natural_french_without_model(tmp_path):
    prepare(tmp_path)
    result = await execute_command(Namespace(
        root=str(tmp_path), command='ask',
        request='Organise toute ma vie administrative', allow_backup=False
    ))
    assert result['executed'] is True
    assert result['steps'][0]['type'] == 'admin.inventory'


@pytest.mark.asyncio
async def test_cli_natural_request_cannot_backup_without_explicit_authorization(tmp_path):
    prepare(tmp_path)
    result = await execute_command(Namespace(
        root=str(tmp_path), command='ask',
        request='Sauvegarde notes.txt', allow_backup=False,
    ))
    assert result['executed'] is False
    assert list(tmp_path.glob('*.bak')) == []


@pytest.mark.asyncio
async def test_cli_backup_can_be_granted_explicitly(tmp_path):
    prepare(tmp_path)
    result = await execute_command(Namespace(
        root=str(tmp_path), command='ask',
        request='Sauvegarde notes.txt', allow_backup=True,
    ))
    assert result['executed'] is True
    assert result['steps'][0]['verified'] is True
    assert len(list(tmp_path.glob('*.bak'))) == 1


def test_non_admin_request_uses_other_planner():
    assert plan_french_administrative_request('Quel temps fera-t-il demain ?') is None


@pytest.mark.parametrize('sentence', [
    'Trouve mes factures',
    'Mes factures sont où ?',
    'Montre-moi mes factures',
    'Retrouve les factures',
])
def test_french_search_paraphrases_remain_deterministic(sentence):
    plan = plan_french_administrative_request(sentence)
    assert plan['intent'] == 'locate'
    assert plan['actions'][0]['query'] == 'facture'


def test_inventory_next_steps_are_grounded_in_existing_filenames(tmp_path):
    (tmp_path / 'facture_2026.pdf').write_bytes(b'%PDF')
    (tmp_path / 'avis_impots_2025.pdf').write_bytes(b'%PDF')
    (tmp_path / 'inconnu.pdf').write_bytes(b'%PDF')
    result = administrative_inventory(tmp_path)
    instructions = ' '.join(result['next_steps'])
    assert 'non identifiés' in instructions
    assert 'factures' in instructions
    assert 'fiscaux' in instructions
    assert result['read_only'] is True


def test_backup_phrased_as_copy_of_security_requires_explicit_filename():
    plan = plan_french_administrative_request('Fais une copie de sécurité de notes.txt')
    assert plan['intent'] == 'backup'
    assert plan['actions'][0] == {'type': 'files.backup', 'path': 'notes.txt'}


@pytest.mark.parametrize('request', [
    'Je suis triste.',
    "C'est étrange.",
    'Le classement de mes jeux préférés.',
    'Quelle est la météo demain ?',
])
def test_unrelated_french_requests_do_not_scan_administrative_files(request):
    assert plan_french_administrative_request(request) is None


@pytest.mark.parametrize('request', [
    'Range ces documents.',
    'Trie ce dossier.',
    'Classe mes factures.',
    'Organise.',
])
def test_admin_imperatives_are_recognized_as_read_only_first_steps(request):
    result = plan_french_administrative_request(request)
    assert result['intent'] == 'administrative-inventory'
    assert result['actions'] == [{'type': 'admin.inventory', 'path': '.'}]


@pytest.mark.parametrize('request', [
    'Envoie au fisc mon avis.',
    'Supprimer mes documents.',
    'Organise mes dossiers puis envoie tout.',
    'Dépose une déclaration fiscale.',
])
def test_external_verbs_block_all_administrative_dispatch(request):
    result = plan_french_administrative_request(request)
    assert result is not None
    assert result['actions'] == []
    assert result['intent'] == 'external-or-destructive-request'


def test_long_administrative_input_is_rejected_without_using_ai():
    result = plan_french_administrative_request('Organise mes documents ' + 'x' * 2000)
    assert result['actions'] == []
    assert result['intent'] == 'request-too-long'
