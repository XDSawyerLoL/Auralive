import { ProcessSomaticSensor } from './somatic_dynamics.js';

// Independent process observer. Sampling CPU/RAM is never labelled a thought.
// Starts with Node, not with a browser request, and keeps a bounded in-memory history.
export class ObservedProcessMonitor {
  constructor({sensor=new ProcessSomaticSensor(),intervalMs=5000,
    clock=()=>Date.now(),schedule=setInterval,unschedule=clearInterval}={}){
    this.sensor=sensor;
    this.intervalMs=Math.max(2000,Math.min(60000,Number(intervalMs)||5000));
    this.clock=clock;
    this.schedule=schedule;this.unschedule=unschedule;
    this.timer=null;this.records=[];this.sequence=0;
  }
  sample(){
    const raw=this.sensor.sample();
    const stamp=Date.parse(String(raw?.sampled_at||''));
    if(!Number.isFinite(stamp)||raw?.source!=='node-process')return null;
    const normalized={
      source:'node-process',sampled_at:new Date(stamp).toISOString(),
      cpu_utilization:Number.isFinite(raw.cpu_utilization)?Math.max(0,Math.min(1,raw.cpu_utilization)):null,
      heap_utilization:Number.isFinite(raw.heap_utilization)?Math.max(0,Math.min(1,raw.heap_utilization)):null,
      compute_pressure:Number.isFinite(raw.compute_pressure)?Math.max(0,Math.min(1,raw.compute_pressure)):null,
      rss_bytes:Number.isFinite(raw.rss_bytes)?raw.rss_bytes:null,
      sequence:++this.sequence,
    };
    this.records.push(normalized);
    if(this.records.length>60)this.records.splice(0,this.records.length-60);
    return normalized;
  }
  start(){
    if(this.timer)return;
    this.sample();
    this.timer=this.schedule(()=>this.sample(),this.intervalMs);
    this.timer?.unref?.();
  }
  stop(){
    if(this.timer)this.unschedule(this.timer);
    this.timer=null;
  }
  snapshot(){
    const now=this.clock();
    const available=this.records.filter(s=>{
      const t=Date.parse(s.sampled_at);
      return Number.isFinite(t)&&t<=now+2000&&now-t>=0&&now-t<=120000;
    });
    return {
      version:'node-observed-process-v1',interval_ms:this.intervalMs,
      active:this.timer!==null,latest:available.at(-1)||null,
      history:available.slice(-60).map(r=>({
        at:r.sampled_at,sequence:r.sequence,cpu:r.cpu_utilization,
        heap:r.heap_utilization,pressure:r.compute_pressure,
      })),
      source:'ProcessSomaticSensor / Node process',
    };
  }
}
