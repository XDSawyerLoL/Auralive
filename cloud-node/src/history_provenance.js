import {createHash} from 'node:crypto';

const KINDS=new Set(['action','misunderstanding','observation']);
const SOURCES=new Set(['machine-verified','founder-feedback','external-report']);
const ACTIONS=new Set(['respond','verify','clarify','attentive','task_first']);
const utc=v=>{if(typeof v!=='string'||!Number.isFinite(Date.parse(v))||!v.endsWith('Z'))throw new Error('UTC timestamp required');return new Date(v).toISOString();};
const digest=v=>createHash('sha256').update(v,'utf8').digest('hex');

// Portable canonical field order; the outcome is a separate immutable receipt.
export function episodeDigest(previous,e){
  return digest(String(previous)+'\n'+JSON.stringify({
    ts:utc(e.ts),mission_id:e.mission_id??null,kind:e.kind,
    context_tag:e.context_tag,action:e.action,prediction:e.prediction??null,
    confidence:e.confidence??null,
  }));
}
export function historyChoice({context,baseline='respond',rows=[],excludedEpisodes=[]}={}){
  if(!ACTIONS.has(baseline))throw new Error('Invalid baseline action');
  const excluded=new Set(excludedEpisodes.map(Number));
  const candidates=rows.filter(p=>Number(p.active)===1&&
    p.hypothesis_status==='promoted'&&p.context_tag===context&&ACTIONS.has(p.rule_action))
   .map(p=>({...p,used_evidence:(p.evidence||[]).filter(e=>e.source==='machine-verified'
      &&e.polarity==='support'&&Number(e.ablated)===0&&!excluded.has(Number(e.episode_id)))}))
   .filter(p=>p.used_evidence.length>=2)
   .sort((a,b)=>Number(b.confidence)-Number(a.confidence)||Number(a.policy_id)-Number(b.policy_id));
  const choice=candidates[0];
  return {action:choice?.rule_action||baseline,
    changed:Boolean(choice&&choice.rule_action!==baseline),
    provenance:choice?[
      {item_type:'policy',item_id:choice.policy_id,rank:1},
      {item_type:'hypothesis',item_id:choice.hypothesis_id,rank:2},
      ...choice.used_evidence.map((e,i)=>({item_type:'episode',item_id:e.episode_id,rank:i+3})),
    ]:[],reason:choice?'promoted-verified-history':'no-eligible-history'};
}
export function ablationComparison(input){
  const withHistory=historyChoice(input);
  const withoutHistory=historyChoice({...input,rows:[]});
  const ids=input.rows.flatMap(p=>(p.evidence||[]).map(e=>e.episode_id));
  const withoutEpisodes=historyChoice({...input,excludedEpisodes:ids});
  return {withHistory,withoutHistory,withoutEpisodes,
    causalChange:withHistory.action!==withoutHistory.action&&
      withHistory.action!==withoutEpisodes.action};
}
export class HistoryLedger {
  constructor({db,clock=()=>new Date().toISOString()}={}){
    if(!db)throw new Error('Database adapter required');this.db=db;this.clock=clock;
  }
  async beginEpisode({mission_id=null,kind='action',context_tag,action,prediction=null,confidence=null}={}){
    if(!KINDS.has(kind)||!context_tag||!action||
      (confidence!==null&&(!Number.isFinite(confidence)||confidence<0||confidence>1)))
      throw new Error('Invalid episode');
    const ts=utc(this.clock()),conn=await this.db.getConnection();
    try{
      await conn.beginTransaction();
      const [heads]=await conn.query('SELECT last_hash FROM aura_history_head WHERE id=1 FOR UPDATE');
      if(heads.length!==1)throw new Error('History head missing');
      const prev_hash=heads[0].last_hash;
      const hash=episodeDigest(prev_hash,{ts,mission_id,kind,context_tag,action,prediction,confidence});
      const [r]=await conn.execute(
        'INSERT INTO aura_history_episodes (ts,mission_id,kind,context_tag,action,prediction,confidence,prev_hash,hash,ablated) VALUES(?,?,?,?,?,?,?,?,?,0)',
        [ts,mission_id,kind,context_tag,action,prediction,confidence,prev_hash,hash]);
      await conn.execute('UPDATE aura_history_head SET last_hash=?,last_episode_id=? WHERE id=1',[hash,r.insertId]);
      await conn.commit();return {id:r.insertId,hash,prev_hash};
    }catch(error){await conn.rollback();throw error;}finally{conn.release();}
  }
  async recordOutcome(episodeId,{outcome,success=null,source='external-report'}={}){
    if(!Number.isSafeInteger(Number(episodeId))||Number(episodeId)<=0||
       !SOURCES.has(source)||(success!==null&&success!==0&&success!==1)||!outcome)
      throw new Error('Invalid outcome');
    // Feedback evaluates an interaction, not the success of an external task.
    const verified=source==='machine-verified'?success:null,at=utc(this.clock());
    const receipt=digest(JSON.stringify({episode_id:Number(episodeId),outcome,success:verified,source,at}));
    await this.db.execute(
      'INSERT INTO aura_history_outcomes (episode_id,outcome,success,source,observed_at,hash) VALUES(?,?,?,?,?,?)',
      [episodeId,String(outcome).slice(0,4000),verified,source,at,receipt]);
    return {episode_id:episodeId,source,calibrated:verified!==null};
  }
  async retrieve(context_tag){
    const [policies]=await this.db.execute(
      'SELECT p.id AS policy_id,p.hypothesis_id,p.rule_action,p.active,h.status AS hypothesis_status,h.scope_context AS context_tag,h.confidence '+
      'FROM aura_history_policies p JOIN aura_history_hypotheses h ON h.id=p.hypothesis_id '+
      "WHERE p.active=1 AND h.status='promoted' AND h.scope_context=? "+
      'ORDER BY h.confidence DESC,p.id LIMIT 12',[context_tag]);
    if(!policies.length)return [];
    const [evidence]=await this.db.execute(
      'SELECT he.hypothesis_id,he.episode_id,ep.ablated,o.source,he.polarity FROM aura_history_hypothesis_evidence he '+
      'JOIN aura_history_episodes ep ON ep.id=he.episode_id JOIN aura_history_outcomes o ON o.episode_id=ep.id '+
      'WHERE he.hypothesis_id IN ('+policies.map(()=>'?').join(',')+') AND ep.ablated=0 '+
      "AND o.source='machine-verified' ORDER BY he.hypothesis_id,he.episode_id LIMIT 200",
      policies.map(p=>p.hypothesis_id));
    return policies.map(p=>({...p,active:Number(p.active),
      evidence:evidence.filter(e=>e.hypothesis_id===p.hypothesis_id&&e.polarity==='support')
        .map(e=>({...e,ablated:Number(e.ablated)})),
    }));
  }
  async decide({context_tag,baseline='respond',run_id,situation_id,excludedEpisodes=[]}={}){
    const rows=await this.retrieve(context_tag);
    const choice=historyChoice({context:context_tag,baseline,rows,excludedEpisodes});
    const conn=await this.db.getConnection();
    try{
      await conn.beginTransaction();
      const confidence=rows.find(x=>x.policy_id===choice.provenance[0]?.item_id)?.confidence??null;
      const [r]=await conn.execute(
        'INSERT INTO aura_history_decisions (ts,run_id,situation_id,chosen_action,confidence,raw_output) VALUES(?,?,?,?,?,NULL)',
        [utc(this.clock()),String(run_id),String(situation_id),choice.action,confidence]);
      for(const item of choice.provenance)
        await conn.execute(
          'INSERT INTO aura_history_decision_provenance (decision_id,item_type,item_id,retrieval_rank) VALUES(?,?,?,?)',
          [r.insertId,item.item_type,item.item_id,item.rank]);
      await conn.commit();return {...choice,decision_id:r.insertId};
    }catch(error){await conn.rollback();throw error;}finally{conn.release();}
  }
}
