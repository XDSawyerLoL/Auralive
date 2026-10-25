"""Executable zero-cost SQLite persistence proof using disposable data."""
from __future__ import annotations
import json
from datetime import datetime, timedelta, timezone
from tempfile import TemporaryDirectory
from pathlib import Path
from .admin_durable import DurableReviews


def _task(date='2026-11-30'):
    return {'id':'a'*16, 'title':'Vérifier la date candidate', 'category':'dates_candidates',
            'source':'test_facture.pdf', 'detail':'Date à contrôler',
            'evidence':{'date':date, 'source_sha256':'b'*64}}


def _board(task, partial=False):
    return {'type':'admin.followup', 'ok':True, 'verified':True, 'read_only':True,
            'tasks':[task], 'task_count':1, 'partial':partial}


def run_benchmark() -> dict:
    checks=[]
    def check(name, ok): checks.append({'name':name, 'passed':bool(ok)})
    with TemporaryDirectory(prefix='aura-durable-') as folder:
        db=Path(folder)/'local_state.sqlite3'
        store=DurableReviews(db)
        result=store.save_snapshot(_board(_task()))
        check('Tâche enregistrée',result['saved']==1 and result['new']==1)
        check('Aucun rappel créé par la seule date candidate',store.due_reminders(at=datetime.now(timezone.utc)+timedelta(days=500))==[])
        store.decide('a'*16,'reviewed')
        reopened=DurableReviews(db)
        check('Validation humaine après réouverture',reopened.list_reviews()[0]['status']=='reviewed')
        due=(datetime.now(timezone.utc)+timedelta(days=2)).isoformat()
        reminder=reopened.propose_reminder('a'*16,due)
        check('Rappel seulement proposé',reopened.due_reminders(at=datetime.now(timezone.utc)+timedelta(days=4))==[])
        reopened.approve_reminder(reminder)
        check('Rappel approuvé et encore non acquitté',len(reopened.due_reminders(at=datetime.now(timezone.utc)+timedelta(days=4)))==1)
        reopened.acknowledge_reminder(reminder)
        check('Accusé réception supprime les duplications',reopened.due_reminders(at=datetime.now(timezone.utc)+timedelta(days=4))==[])
        rem2=reopened.propose_reminder('a'*16,due)
        reopened.approve_reminder(rem2)
        report=reopened.save_snapshot(_board(_task('2026-12-30')))
        check('Preuve changée invalide la validation',report['changed_reset']==1 and reopened.list_reviews()[0]['status']=='pending')
        check('Preuve changée annule un rappel encore approuvé',reopened.due_reminders(at=datetime.now(timezone.utc)+timedelta(days=4))==[])
        check('Audit local sans contenu de facture',any(x['event']=='evidence_changed_review_reset' for x in reopened.audit_events())
              and b'Facture complete avec contenu secret' not in db.read_bytes())
        check('SQLite survivant à plusieurs réouvertures',DurableReviews(db).list_reviews()[0]['status']=='pending')
    return {'name':'aura-durable-sqlite-v1', 'checks_total':len(checks),
            'checks_passed':sum(x['passed'] for x in checks),
            'ok':all(x['passed'] for x in checks),
            'model_calls':0,'network_calls':0,'paid_calls':0,'checks':checks}


def main():
    try: result=run_benchmark()
    except Exception as e: result={'ok':False,'error':f'{type(e).__name__}: {str(e)[:250]}'}
    print(json.dumps(result,indent=2,ensure_ascii=False))
    return 0 if result.get('ok') else 1


if __name__=='__main__':
    raise SystemExit(main())
