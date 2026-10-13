import { randomUUID } from 'node:crypto';

// In-process background conversation queue. It prevents the Hostinger nginx
// gateway from waiting on slow CPU-only inference. Jobs are session-bound
// and bounded; a process restart honestly invalidates unfinished jobs.
export class ChatJobs {
  constructor({now=Date.now,retentionMs=10*60_000,maxPending=5,maxStored=24}={}){
    this.now=now;this.retentionMs=retentionMs;
    this.maxPending=maxPending;this.maxStored=maxStored;
    this.jobs=new Map();this.queue=[];this.running=false;
  }
  prune(){
    const time=this.now();
    for(const [id,item] of this.jobs){
      if((item.status==='done'||item.status==='failed')
        &&time-item.finishedAt>this.retentionMs)this.jobs.delete(id);
    }
    // Finished jobs may be reclaimed early if a new submission needs space.
    if(this.jobs.size>=this.maxStored){
      for(const [id,item] of this.jobs){
        if(item.status!=='done'&&item.status!=='failed')continue;
        this.jobs.delete(id);
        if(this.jobs.size<this.maxStored)break;
      }
    }
  }
  submit({sessionId,work}){
    const owner=String(sessionId||'');
    if(!owner||typeof work!=='function')throw Error('chat-job-invalid');
    this.prune();
    if([...this.jobs.values()].some(item=>item.owner===owner
      &&(item.status==='queued'||item.status==='running'))){
      const e=Error('chat-job-already-pending');e.code='CHAT_JOB_PENDING';throw e;
    }
    const pending=this.queue.length+(this.running?1:0);
    if(pending>=this.maxPending||this.jobs.size>=this.maxStored){
      const e=Error('chat-jobs-busy');e.code='CHAT_JOBS_BUSY';throw e;
    }
    const id=randomUUID();
    const item={id,owner,status:'queued',createdAt:this.now(),finishedAt:0,result:null,error:''};
    item.work=work;
    this.jobs.set(id,item);this.queue.push(id);
    void this.drain();
    return {job_id:id,status:item.status,poll_after_ms:1700};
  }
  get(id,sessionId){
    this.prune();
    const item=this.jobs.get(String(id||''));
    if(!item||item.owner!==String(sessionId||''))return null;
    if(item.status==='done')return {job_id:item.id,status:'done',result:item.result};
    if(item.status==='failed')return {job_id:item.id,status:'failed',error_code:item.error};
    return {job_id:item.id,status:item.status,poll_after_ms:1700};
  }
  async drain(){
    if(this.running)return;
    this.running=true;
    try{
      while(this.queue.length){
        const item=this.jobs.get(this.queue.shift());
        if(!item)continue;
        item.status='running';
        try{
          item.result=await item.work();
          item.status='done';
        }catch{
          // Don't echo arbitrary errors, SQL details, or user prompts in the API.
          item.error='chat-processing-failed';item.status='failed';
        }finally{
          item.work=null;item.finishedAt=this.now();
        }
      }
    }finally{this.running=false;}
  }
}
