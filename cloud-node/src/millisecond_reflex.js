// Millisecond-resolution lightweight reflex scheduler.
// No database writes, no LLM, no simulated thoughts or fabricated brain hops.
// Node timers are best effort: publish actual measured Hz and lag.
import {performance} from 'node:perf_hooks';

const bounded=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number(v)||lo));
export class MillisecondReflex {
  constructor({intervalMs=1,clock=()=>performance.now(),
    epoch=()=>Date.now(),schedule=setTimeout,unschedule=clearTimeout,
    inspect=()=>({}),onStimulus=async()=>null}={}){
    this.intervalMs=bounded(intervalMs,1,100);
    this.clock=clock;this.epoch=epoch;this.schedule=schedule;this.unschedule=unschedule;
    this.inspect=inspect;this.onStimulus=onStimulus;
    this.timer=null;this.running=false;this.busy=false;
    this.count=0;this.windowCount=0;this.windowAt=0;this.lastAt=0;
    this.lastEpoch=0;this.effectiveHz=0;this.lagMs=0;this.peakLagMs=0;
    this.interrupts=0;this.lastHandledSeq=0;this.lastInterruptAt=0;
    this.lastDecision='not-started';this.lastError='';
  }
  start(){
    if(this.running)return;
    this.running=true;this.windowAt=this.clock();this.lastAt=this.windowAt;
    this.lastDecision='observing';this.arm();
  }
  arm(){
    if(!this.running)return;
    this.timer=this.schedule(()=>this.step(),this.intervalMs);
    this.timer?.unref?.();
  }
  step(){
    if(!this.running)return;
    this.timer=null;
    const t=this.clock(),gap=Math.max(0,t-this.lastAt);
    this.lastAt=t;this.lastEpoch=this.epoch();
    this.count++;this.windowCount++;
    this.lagMs=Number(Math.max(0,gap-this.intervalMs).toFixed(3));
    this.peakLagMs=Math.max(this.peakLagMs,this.lagMs);
    const elapsed=t-this.windowAt;
    if(elapsed>=1000){
      this.effectiveHz=Number((this.windowCount*1000/elapsed).toFixed(1));
      this.windowCount=0;this.windowAt=t;this.peakLagMs=this.lagMs;
    }
    const s=this.inspect()||{};
    const seq=Math.max(0,Math.trunc(Number(s.stimulusSeq)||0));
    const CPU=bounded(s.cpuPressure??0,0,1);
    // This exact micro-reflex checks incoming events and resource gates;
    // no automatic cognition is claimed if nothing new has arrived.
    if(seq>this.lastHandledSeq&&!this.busy&&!s.cognitiveBusy){
      if(s.optionalAllowed===false||CPU>=.80){
        this.lastDecision='resource-gate';
      }else if(this.lastInterruptAt&&this.lastEpoch-this.lastInterruptAt<200){
        this.lastDecision='interrupt-cooldown';
      }else{
        this.busy=true;this.lastDecision='dispatching-stimulus';
        this.lastInterruptAt=this.lastEpoch;
        const seen=seq;
        Promise.resolve().then(()=>this.onStimulus(seen))
          .then(result=>{
            // "skipped" is not proof an operation happened; retry on next tick.
            if(result?.ok===true&&result?.skipped!==true){
              this.lastHandledSeq=Math.max(this.lastHandledSeq,seen);
              this.interrupts++;this.lastDecision='reflex-executed';
            }else this.lastDecision='reflex-skipped';
          })
          .catch(error=>{this.lastError=String(error?.message||error).slice(0,120);this.lastDecision='reflex-error';})
          .finally(()=>{this.busy=false;});
      }
    }
    this.arm();
  }
  snapshot(){
    const age=this.lastEpoch?this.epoch()-this.lastEpoch:null;
    return {
      kind:'lightweight-event-watch-not-full-cognition',
      running:this.running,requested_interval_ms:this.intervalMs,
      effective_hz:this.effectiveHz,lag_ms:this.lagMs,peak_lag_ms:this.peakLagMs,
      total_checks:this.count,interrupted_cycles:this.interrupts,
      observed_at:this.lastEpoch?new Date(this.lastEpoch).toISOString():null,
      freshness:age!==null&&age<=2000?'recent':'stale',
      last_decision:this.lastDecision,reflex_busy:this.busy,
      error_present:Boolean(this.lastError),
      disclaimer:'Millisecond checks are not completed thoughts, conscious experiences or artificial neurons.',
    };
  }
  stop(){
    this.running=false;
    if(this.timer!==null)this.unschedule(this.timer);
    this.timer=null;this.busy=false;
  }
}
