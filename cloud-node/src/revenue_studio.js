// AURA Revenue Desk: truthful founder-owned sales CRM with zero paid dependencies.
// Internal opportunities are not leads harvested from the web.
// Income is always USER-DECLARED, never represented as verified bank balance.
import {randomUUID} from 'node:crypto';
import {query, one, getDb} from './db.js';
import {validateAuditUrl} from './revenue_audit.js';

export const REVENUE_OFFERS=Object.freeze([
  Object.freeze({id:'flash',name:'Diagnostic Flash',price_cents:7900,
    delivery:'Analyse de la page d’accueil, 10 contrôles techniques et trois priorités.'}),
  Object.freeze({id:'action',name:'Audit + Plan d’action',price_cents:19900,
    delivery:'Rapport technique de la page d’accueil et plan de correction hiérarchisé.'}),
  Object.freeze({id:'premium',name:'Dossier optimisation',price_cents:34900,
    delivery:'Rapport, priorisation, spécifications de corrections et suivi de restitution.'}),
]);
const STATUSES=new Set(['new','audited','proposal','contacted','won','lost']);
const eur=(value)=>(Math.round(value)/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const clean=(v,max=200)=>String(v||'').trim().replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').slice(0,max);
const safeUuid=(id)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(id||''));
const now=()=>new Date().toISOString();
export function normalizeLead(raw={}){
  const name=clean(raw.business_name,160);
  if(name.length<2)throw Error('Nom du prospect requis (2 caractères minimum)');
  const url=validateAuditUrl(raw.site_url).toString();
  const contact_name=clean(raw.contact_name,140);
  const contact_email=clean(raw.contact_email,180);
  if(contact_email && !/^[^\s@]{1,64}@[^\s@]{1,100}\.[a-z]{2,}$/i.test(contact_email))
    throw Error('Adresse email de contact invalide');
  const offer=REVENUE_OFFERS.find(o=>o.id===clean(raw.offer,30));
  if(!offer)throw Error('Offre invalide');
  return {business_name:name,site_url:url,contact_name,contact_email,
    offer:offer.id,price_cents:offer.price_cents};
}
export function summarizeRevenue(leads=[],payments=[]){
  const counts={new:0,audited:0,proposal:0,contacted:0,won:0,lost:0};
  for(const item of leads){const status=String(item?.status||'');if(status in counts)counts[status]++;}
  const paidCents=payments.reduce((sum,p)=>sum+Math.max(0,Number(p?.amount_cents)||0),0);
  const pipelineCents=leads.filter(x=>!['won','lost'].includes(x.status))
    .reduce((sum,l)=>sum+Math.max(0,Number(l.price_cents)||0),0);
  return {
    total_leads:leads.length,
    counts,pipeline_eur:Math.round(pipelineCents)/100,
    declared_received_eur:Math.round(paidCents)/100,
    verified_bank_receipts_eur:null,
    source:'Manually entered leads and founder-declared payments in AURA MySQL',
    revenue_verified_by_bank:false,
    currency:'EUR',
  };
}
export function auditToProposal(lead,report){
  const offer=REVENUE_OFFERS.find(x=>x.id===lead.offer);
  if(!offer)throw Error('Offre inconnue');
  if(!report?.checked_at||!Array.isArray(report?.checks))throw Error('Audit préalable indispensable');
  const problems=report.checks.filter(x=>x.status==='review').slice(0,5);
  return [
    '# Proposition — '+clean(lead.business_name,160),
    'Date : '+new Date().toLocaleDateString('fr-FR'),
    'Site étudié : '+lead.site_url,
    '',
    '## Constat initial (page d’accueil)',
    'Contrôle effectué le '+new Date(report.checked_at).toLocaleString('fr-FR')+'.',
    'HTTP '+report.status_code+' ; '+report.pass_count+' points conformes aux contrôles de base ; '+report.review_count+' points à examiner.',
    ...(problems.length?problems.map((x)=>'- '+clean(x.detail,250)):['- Aucun point bloquant détecté par ces contrôles limités.']),
    '',
    '## Prestation proposée',
    '**'+offer.name+' — '+eur(offer.price_cents)+'**',
    offer.delivery,
    'Livrable : rapport et recommandations rédigés. Aucune modification du site sans accord distinct.',
    '',
    '## Limites',
    'Ces observations portent sur le HTML initial de la page d’accueil. Elles ne constituent ni une certification SEO, ni un audit de sécurité, ni une promesse de trafic, de classement ou de chiffre d’affaires.',
    'Le devis doit être validé par le prestataire et le client avant toute facturation.',
    '',
    'Statut : proposition préparée, NON envoyée.',
  ].join('\n');
}
const idCheck=(id)=>{if(!safeUuid(id))throw Error('Identifiant prospect invalide');return id;};
export async function createRevenueLead(payload){
  const lead=normalizeLead(payload);const id=randomUUID(),timestamp=now();
  await query(`INSERT INTO aura_revenue_leads
    (id,business_name,site_url,contact_name,contact_email,offer,status,price_cents,audit_json,proposal,created_at,updated_at,audited_at)
    VALUES(?,?,?,?,?,?,'new',?,'','',?,?,'')`,
    [id,lead.business_name,lead.site_url,lead.contact_name,lead.contact_email,
      lead.offer,lead.price_cents,timestamp,timestamp]);
  return {id,...lead,status:'new',created_at:timestamp,audited_at:''};
}
export async function listRevenueLeads(limit=50){
  return query(`SELECT id,business_name,site_url,contact_name,contact_email,offer,status,price_cents,audited_at,updated_at,created_at,
    CASE WHEN proposal<>'' THEN 1 ELSE 0 END AS proposal_ready
    FROM aura_revenue_leads ORDER BY updated_at DESC LIMIT ?`,[Math.max(1,Math.min(100,Number(limit)||50))]);
}
export async function findRevenueLead(id){
  return one('SELECT * FROM aura_revenue_leads WHERE id=?',[idCheck(id)]);
}
export async function revenueOverview(){
  const [leads,payments]=await Promise.all([
    query('SELECT status,price_cents FROM aura_revenue_leads ORDER BY created_at DESC LIMIT 10000'),
    query('SELECT amount_cents FROM aura_revenue_payments ORDER BY declared_at DESC LIMIT 10000'),
  ]);
  return summarizeRevenue(leads,payments);
}
export async function saveRevenueAudit(id,report){
  const lead=await findRevenueLead(id);if(!lead)throw Error('Prospect introuvable');
  if(!report?.checked_at||!Array.isArray(report.checks)||report.url!==lead.site_url)
    throw Error('Audit incompatible avec le prospect');
  if(JSON.stringify(report).length>25000)throw Error('Résultat audit trop volumineux');
  await query(`UPDATE aura_revenue_leads
    SET audit_json=?,audited_at=?,updated_at=?,status=IF(status='new','audited',status) WHERE id=?`,
    [JSON.stringify(report),report.checked_at,now(),id]);
  return {id,audit:report};
}
export async function createRevenueProposal(id){
  const lead=await findRevenueLead(id);if(!lead)throw Error('Prospect introuvable');
  let audit=null;try{audit=JSON.parse(lead.audit_json||'null');}catch{}
  const proposal=auditToProposal(lead,audit);
  await query(`UPDATE aura_revenue_leads SET proposal=?,updated_at=?,status=IF(status IN ('new','audited'),'proposal',status) WHERE id=?`,
    [proposal,now(),id]);
  return {id,proposal,prepared_only:true,sent:false,price_cents:lead.price_cents};
}
export async function getRevenueProposal(id){
  const lead=await findRevenueLead(id);
  if(!lead)throw Error('Prospect introuvable');
  return {id:lead.id,business_name:lead.business_name,proposal:lead.proposal||'',sent:false};
}
export async function changeRevenueStatus(id,status){
  const newStatus=clean(status,24);
  if(!STATUSES.has(newStatus))throw Error('Étape commerciale inconnue');
  if(newStatus==='won')throw Error('L’état payé découle uniquement d’un paiement déclaré avec référence');
  const result=await query('UPDATE aura_revenue_leads SET status=?,updated_at=? WHERE id=?',
    [newStatus,now(),idCheck(id)]);
  return {id,status:newStatus,updated:Boolean(result?.affectedRows)};
}
export function normalizePayment(raw={}){
  const amount_cents=Number(raw.amount_cents);
  const reference=clean(raw.reference,120);
  if(!Number.isSafeInteger(amount_cents)||amount_cents<1||amount_cents>100000000)
    throw Error('Montant déclaré invalide');
  if(reference.length<6)throw Error('Référence ou preuve du paiement requise (6 caractères minimum)');
  return {amount_cents,reference};
}
export async function declareRevenuePayment(id,payload){
  const payment=normalizePayment(payload);
  idCheck(id);
  const db=getDb();
  const conn=await db.getConnection();
  try{
    await conn.beginTransaction();
    const [rows]=await conn.query('SELECT id FROM aura_revenue_leads WHERE id=? FOR UPDATE',[id]);
    if(!rows.length)throw Error('Prospect introuvable');
    const paymentId=randomUUID(),timestamp=now();
    await conn.query(`INSERT INTO aura_revenue_payments(id,lead_id,amount_cents,reference,declared_at)
      VALUES(?,?,?,?,?)`,[paymentId,id,payment.amount_cents,payment.reference,timestamp]);
    await conn.query(`UPDATE aura_revenue_leads SET status='won',updated_at=? WHERE id=?`,[timestamp,id]);
    await conn.commit();
    return {payment_id:paymentId,lead_id:id,amount_cents:payment.amount_cents,
      declared_at:timestamp,bank_verified:false,
      label:'Paiement déclaré manuellement; aucun accès à la banque et aucune confirmation indépendante.'};
  }catch(error){
    await conn.rollback();
    if(error?.code==='ER_DUP_ENTRY')throw Error('Référence de paiement déjà enregistrée');
    throw error;
  }finally{conn.release();}
}
