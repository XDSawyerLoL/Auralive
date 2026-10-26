from pathlib import Path
from tempfile import TemporaryDirectory
from datetime import datetime, timedelta, timezone
import copy, os, pytest
from aura_runtime.admin_durable import DurableReviews, local_db_path


def task(idx='a'*16, value='2026-11-30'):
    return dict(id=idx, title='À vérifier', category='dates_candidates', source='facture.pdf',
                detail='Date trouvée', evidence={'date':value, 'source_sha256':'f'*64})


def board(*tasks, partial=False):
    return dict(type='admin.followup', ok=True, verified=True, read_only=True,
                tasks=list(tasks), task_count=len(tasks),partial=partial)


def test_survives_process_reopen(tmp_path):
    path=tmp_path/'state.db'
    first=DurableReviews(path)
    assert first.save_snapshot(board(task()))['new']==1
    first.decide('a'*16,'reviewed')
    second=DurableReviews(path)
    assert second.list_reviews()[0]['status']=='reviewed'
    assert second.save_snapshot(board(task()))['new']==0
    assert second.list_reviews()[0]['status']=='reviewed'
    assert [x['event'] for x in second.audit_events() if 'human_' in x['event']] == ['human_reviewed']


def test_evidence_changed_resets_and_cancels_approval(tmp_path):
    store=DurableReviews(tmp_path/'s.db')
    store.save_snapshot(board(task()))
    store.decide('a'*16, 'reviewed')
    due=(datetime.now(timezone.utc)+timedelta(days=2)).isoformat()
    reminder_id=store.propose_reminder('a'*16,due)
    store.approve_reminder(reminder_id)
    assert store.save_snapshot(board(task(value='2026-12-25')))['changed_reset']==1
    assert store.list_reviews()[0]['status']=='pending'
    assert store.due_reminders(at=datetime.now(timezone.utc)+timedelta(days=4))==[]
    with pytest.raises(ValueError): store.approve_reminder(reminder_id)


def test_unapproved_and_unreviewed_reminder_never_due(tmp_path):
    store=DurableReviews(tmp_path/'s.db');store.save_snapshot(board(task()))
    due=(datetime.now(timezone.utc)+timedelta(seconds=1)).isoformat()
    with pytest.raises(ValueError): store.propose_reminder('a'*16,due)
    store.decide('a'*16,'reviewed')
    reminder=store.propose_reminder('a'*16,due)
    future=datetime.now(timezone.utc)+timedelta(days=1)
    assert store.due_reminders(at=future)==[]
    store.approve_reminder(reminder)
    items=store.due_reminders(at=future)
    assert len(items)==1 and items[0]['id']==reminder
    # No auto delivery, explicit acknowledgement only after displaying
    assert len(DurableReviews(tmp_path/'s.db').due_reminders(at=future))==1
    store.acknowledge_reminder(reminder)
    assert store.due_reminders(at=future)==[]
    with pytest.raises(ValueError): store.acknowledge_reminder(reminder)


def test_no_automatic_reminder_from_candidate_date(tmp_path):
    store=DurableReviews(tmp_path/'s.db')
    store.save_snapshot(board(task()))
    assert store.due_reminders(at=datetime.now(timezone.utc)+timedelta(days=1000))==[]
    assert len(store.list_reviews())==1


def test_partial_scan_does_not_retire_tasks(tmp_path):
    store=DurableReviews(tmp_path/'s.db')
    store.save_snapshot(board(task(), task('b'*16)))
    store.save_snapshot(board(task(), partial=True))
    assert len(store.list_reviews())==2
    store.save_snapshot(board(task(),partial=False))
    assert len(store.list_reviews())==1
    with pytest.raises(ValueError):store.decide('b'*16,'reviewed')


def test_approval_cancels_when_dismissed(tmp_path):
    store=DurableReviews(tmp_path/'s.db');store.save_snapshot(board(task()))
    store.decide('a'*16,'reviewed')
    reminder=store.propose_reminder('a'*16,(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat())
    store.approve_reminder(reminder)
    store.decide('a'*16,'dismissed')
    assert store.due_reminders(at=datetime.now(timezone.utc)+timedelta(days=5))==[]


def test_refuse_unverified_or_duplicate_board(tmp_path):
    store=DurableReviews(tmp_path/'s.db')
    bad=board(task());bad['verified']=False
    with pytest.raises(ValueError):store.save_snapshot(bad)
    with pytest.raises(ValueError):store.save_snapshot(board(task(),task()))
    assert store.list_reviews()==[]


def test_never_store_raw_doc_text(tmp_path):
    store=DurableReviews(tmp_path/'s.db')
    t=task(); t['evidence']['excerpt']='SPECIAL_PRIVATE_DOCUMENT_BODY'
    store.save_snapshot(board(t))
    assert b'SPECIAL_PRIVATE_DOCUMENT_BODY' not in (tmp_path/'s.db').read_bytes()


def test_timezone_mandatory(tmp_path):
    store=DurableReviews(tmp_path/'s.db');store.save_snapshot(board(task()));store.decide('a'*16,'reviewed')
    with pytest.raises(ValueError):store.propose_reminder('a'*16,'2027-01-01T12:00:00')


def test_default_db_scoped_outside_documents(tmp_path,monkeypatch):
    monkeypatch.setenv('LOCALAPPDATA',str(tmp_path/'appdata'))
    folder=tmp_path/'docs';folder.mkdir()
    path=local_db_path(folder)
    assert folder not in path.parents
    assert path.name.endswith('.sqlite3')
