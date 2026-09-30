import { NEURAL_FIELD_PALETTE_SCRIPT } from './neural-field-palette.js';
import { NEURAL_FIELD_LAYOUT_SCRIPT } from './neural-field-layout.js';
import { NEURAL_FIELD_INTERACTION_SCRIPT } from './neural-field-interaction.js';

export const NEURAL_FIELD_SCRIPT = String.raw`
${NEURAL_FIELD_PALETTE_SCRIPT}
${NEURAL_FIELD_LAYOUT_SCRIPT}
const installNeuralInteraction=${NEURAL_FIELD_INTERACTION_SCRIPT};

(function(){
  const state={
    canvas:null,
    ctx:null,
    field:null,
    hovered:'',
    stars:[],
    dust:[],
    pulses:[],
    raf:0,
    last:0,
    width:900,
    height:650,
    dpr:1,
    reduced:false,
    focus:null,
    filaments:[],
    constellation:[]
  };

  function hash01(value){ return neuralHash(value); }
  function color(cluster,status){
    if(String(status||'').match(/error|offline|degraded|unhealthy/)) return AURA_NEURAL_PALETTE.danger;
    return AURA_NEURAL_PALETTE[cluster]||AURA_NEURAL_PALETTE.fabric;
  }
  function rgba(hex,a){
    const raw=String(hex||'#ffffff').replace('#','');
    const v=parseInt(raw.length===3?raw.split('').map(c=>c+c).join(''):raw,16);
    return 'rgba('+((v>>16)&255)+','+((v>>8)&255)+','+(v&255)+','+a+')';
  }
  function seedSpace(){
    state.stars=Array.from({length:state.reduced?90:320},(_,i)=>({
      x:hash01('sx'+i),y:hash01('sy'+i),r:.35+hash01('sr'+i)*1.35,
      a:.10+hash01('sa'+i)*.55,phase:hash01('sp'+i)*Math.PI*2
    }));
    state.dust=Array.from({length:state.reduced?28:118},(_,i)=>({
      x:hash01('dx'+i),y:hash01('dy'+i),r:10+hash01('dr'+i)*42,
      a:.008+hash01('da'+i)*.026,phase:hash01('dp'+i)*Math.PI*2
    }));
    state.filaments=Array.from({length:state.reduced?8:28},(_,i)=>({
      x1:hash01('fx1'+i),y1:hash01('fy1'+i),
      x2:hash01('fx2'+i),y2:hash01('fy2'+i),
      bend:(hash01('fb'+i)-.5)*.22,
      a:.018+hash01('fa'+i)*.035,
      hue:i%4
    }));
    state.constellation=Array.from({length:state.reduced?12:38},(_,i)=>({
      x:hash01('cx'+i),y:hash01('cy'+i),
      a:.12+hash01('ca'+i)*.35,
      r:.55+hash01('cr'+i)*1.45
    }));
  }
  function resize(){
    if(!state.canvas)return;
    const rect=state.canvas.getBoundingClientRect();
    state.width=Math.max(320,Math.floor(rect.width));
    state.height=Math.max(320,Math.floor(rect.height));
    state.dpr=Math.min(window.devicePixelRatio||1,1.7);
    state.canvas.width=Math.floor(state.width*state.dpr);
    state.canvas.height=Math.floor(state.height*state.dpr);
    state.ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
  }
  function px(node){return {x:node.x*state.width,y:node.y*state.height};}
  function drawBackground(t){
    const ctx=state.ctx,w=state.width,h=state.height;
    const g=ctx.createRadialGradient(w*.5,h*.5,10,w*.5,h*.5,Math.max(w,h)*.7);
    g.addColorStop(0,'#101538');g.addColorStop(.25,'#091329');g.addColorStop(.65,'#050914');g.addColorStop(1,'#02040a');
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    for(const cloud of state.dust){
      const x=cloud.x*w+Math.sin(t*.00008+cloud.phase)*18;
      const y=cloud.y*h+Math.cos(t*.00006+cloud.phase)*14;
      const rg=ctx.createRadialGradient(x,y,0,x,y,cloud.r*3.2);
      rg.addColorStop(0,'rgba(80,158,255,'+cloud.a+')');
      rg.addColorStop(.42,'rgba(125,82,255,'+(cloud.a*.55)+')');
      rg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=rg;ctx.beginPath();ctx.arc(x,y,cloud.r*3.2,0,Math.PI*2);ctx.fill();
    }
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    const filamentColors=['92,205,255','142,106,255','241,120,214','255,201,106'];
    for(const f of state.filaments){
      const x1=f.x1*w,y1=f.y1*h,x2=f.x2*w,y2=f.y2*h;
      const mx=(x1+x2)/2+(y2-y1)*f.bend;
      const my=(y1+y2)/2-(x2-x1)*f.bend*.55;
      ctx.strokeStyle='rgba('+filamentColors[f.hue]+','+f.a+')';
      ctx.lineWidth=.45;
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.quadraticCurveTo(mx,my,x2,y2);ctx.stroke();
    }
    ctx.restore();
    for(const star of state.stars){
      const tw=.55+.45*Math.sin(t*.0007+star.phase);
      ctx.fillStyle='rgba(210,232,255,'+(star.a*tw)+')';
      ctx.beginPath();ctx.arc(star.x*w,star.y*h,star.r,0,Math.PI*2);ctx.fill();
    }
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    for(let i=0;i<state.constellation.length-1;i++){
      const a=state.constellation[i],b=state.constellation[i+1];
      if(i%3===2)continue;
      ctx.strokeStyle='rgba(132,181,255,'+(.020+Math.min(a.a,b.a)*.06)+')';
      ctx.lineWidth=.35;
      ctx.beginPath();ctx.moveTo(a.x*w,a.y*h);ctx.lineTo(b.x*w,b.y*h);ctx.stroke();
    }
    for(const star of state.constellation){
      ctx.fillStyle='rgba(225,239,255,'+star.a+')';
      ctx.beginPath();ctx.arc(star.x*w,star.y*h,star.r,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function drawAuraBloom(t){
    if(!state.field)return;
    const aura=state.field.byId&&state.field.byId.aura;
    if(!aura)return;
    const ctx=state.ctx,p=px(aura);
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    const breathe=.94+.06*Math.sin(t*.0007);
    const outer=Math.min(state.width,state.height)*.26*breathe;
    const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,outer);
    g.addColorStop(0,'rgba(255,255,255,.10)');
    g.addColorStop(.08,'rgba(214,197,255,.12)');
    g.addColorStop(.22,'rgba(151,104,255,.10)');
    g.addColorStop(.46,'rgba(86,130,255,.055)');
    g.addColorStop(.72,'rgba(241,120,214,.022)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,outer,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function drawAuraCosmicArms(t){
    if(!state.field)return;
    const aura=state.field.byId&&state.field.byId.aura;
    if(!aura)return;
    const ctx=state.ctx,p=px(aura);
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    const arms=[
      {color:'#8f72ff',phase:0,scale:1},
      {color:'#5ee4f0',phase:Math.PI*.72,scale:.82},
      {color:'#f178d6',phase:Math.PI*1.28,scale:.68},
      {color:'#ffc96a',phase:Math.PI*1.66,scale:.58},
    ];
    for(const arm of arms){
      ctx.strokeStyle=rgba(arm.color,.035);
      ctx.lineWidth=1;
      ctx.shadowBlur=12;
      ctx.shadowColor=rgba(arm.color,.22);
      ctx.beginPath();
      for(let i=0;i<=64;i++){
        const q=i/64;
        const a=arm.phase+q*Math.PI*2.15+t*.000025*(1.2-arm.scale*.3);
        const rr=(22+q*Math.min(state.width,state.height)*.42)*arm.scale;
        const x=p.x+Math.cos(a)*rr;
        const y=p.y+Math.sin(a)*rr*.58;
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawClusterNebula(t){
    const ctx=state.ctx;
    if(!state.field)return;
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    for(const node of state.field.nodes){
      if(node.id==='aura')continue;
      const activity=Math.max(.04,Math.min(1,Number(node.activity)||0));
      if(activity<.22)continue;
      const p=px(node);
      const c=color(node.cluster,node.status);
      const breathe=.84+.16*Math.sin(t*.00045+hash01(node.id)*Math.PI*2);
      const radius=(42+activity*78)*breathe;
      const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,radius);
      g.addColorStop(0,rgba(c,.028+activity*.042));
      g.addColorStop(.24,rgba(c,.020+activity*.030));
      g.addColorStop(.60,rgba(c,.007+activity*.014));
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g;
      ctx.beginPath();ctx.ellipse(p.x,p.y,radius,radius*.58,hash01(node.id+':neb')*Math.PI,0,Math.PI*2);ctx.fill();
      if(activity>.48&&!state.reduced){
        ctx.strokeStyle=rgba(c,.025+activity*.055);
        ctx.lineWidth=.55;
        for(let arm=0;arm<2;arm++){
          ctx.beginPath();
          const offset=arm*Math.PI;
          for(let s=0;s<=24;s++){
            const q=s/24;
            const a=offset+q*Math.PI*2.1;
            const rr=8+q*radius*.82;
            const x=p.x+Math.cos(a)*rr;
            const y=p.y+Math.sin(a)*rr*.48;
            if(s===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
          }
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function drawGlialMesh(t){
    if(!state.field)return;
    const ctx=state.ctx;
    const groups={};
    for(const node of state.field.nodes){
      if(node.id==='aura')continue;
      const sourceKey=String(node.cluster||'fabric');
      const key=sourceKey==='fabric'?'infrastructure':sourceKey;
      (groups[key]||(groups[key]=[])).push(node);
    }
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    for(const key of Object.keys(groups)){
      const rows=groups[key];
      const c=color(key,'active');
      for(let i=0;i<rows.length;i++){
        const a=rows[i],ap=px(a);
        const candidates=rows
          .filter(function(b){return b!==a;})
          .map(function(b){
            const bp=px(b);
            return {b:b,bp:bp,d:Math.hypot(bp.x-ap.x,bp.y-ap.y)};
          })
          .sort(function(x,y){return x.d-y.d;})
          .slice(0,2);
        for(const item of candidates){
          if(item.d>state.width*.34)continue;
          const b=item.b,bp=item.bp;
          const activity=Math.max(.05,Math.min(1,(Number(a.activity||0)+Number(b.activity||0))/2));
          const bend=(hash01(a.id+'~'+b.id)-.5)*26;
          const mx=(ap.x+bp.x)/2+(bp.y-ap.y)*.035+bend;
          const my=(ap.y+bp.y)/2-(bp.x-ap.x)*.035-bend*.32;
          ctx.strokeStyle=rgba(c,.018+activity*.05);
          ctx.lineWidth=.28+activity*.28;
          ctx.beginPath();ctx.moveTo(ap.x,ap.y);ctx.quadraticCurveTo(mx,my,bp.x,bp.y);ctx.stroke();
          if(activity>.52&&!state.reduced){
            const phase=(t*.00008+hash01(a.id+b.id))%1;
            const q=1-phase;
            const x=q*q*ap.x+2*q*phase*mx+phase*phase*bp.x;
            const y=q*q*ap.y+2*q*phase*my+phase*phase*bp.y;
            ctx.fillStyle=rgba(c,.08+activity*.12);
            ctx.beginPath();ctx.arc(x,y,.7+activity*1.2,0,Math.PI*2);ctx.fill();
          }
        }
      }
    }
    ctx.restore();
  }

  function drawSynapses(t){
    const ctx=state.ctx;
    for(const edge of state.field?.links||[]){
      const a=px(edge.a),b=px(edge.b);
      const activity=Math.max(.05,Math.min(1,Number(edge.activity)||0));
      const weight=Math.max(.08,Math.min(1,Number(edge.weight)||.5));
      const c=color(edge.a.cluster,edge.a.status);
      ctx.save();
      const targetColor=color(edge.b.cluster,edge.b.status);
      const grad=ctx.createLinearGradient(a.x,a.y,b.x,b.y);
      grad.addColorStop(0,rgba(c,.08+activity*.27));
      grad.addColorStop(.55,rgba(c,.06+activity*.18));
      grad.addColorStop(1,rgba(targetColor,.08+activity*.27));
      const edgeDistance=Math.hypot(b.x-a.x,b.y-a.y);
      ctx.globalAlpha=edgeDistance>state.width*.48?.62:1;
      ctx.lineWidth=.82+weight*2.25;
      ctx.strokeStyle=grad;
      ctx.shadowBlur=activity>0.38?12:3;ctx.shadowColor=rgba(c,.48);
      ctx.beginPath();ctx.moveTo(a.x,a.y);
      const bend=(hash01(edge.source+'>'+edge.target)-.5)*34;
      const mx=(a.x+b.x)/2+(b.y-a.y)*.04+bend;
      const my=(a.y+b.y)/2-(b.x-a.x)*.04-bend*.35;
      ctx.quadraticCurveTo(mx,my,b.x,b.y);ctx.stroke();
      if(activity>.60){
        ctx.lineWidth=.35;
        ctx.strokeStyle=rgba('#ffffff',.04+activity*.08);
        ctx.beginPath();ctx.moveTo(a.x,a.y);
        ctx.quadraticCurveTo(mx+2,my-2,b.x,b.y);ctx.stroke();
      }
      ctx.restore();

      if(activity>.38&&!state.reduced){
        const phase=(t*.00018*(.7+activity)+hash01(edge.source+edge.target))%1;
        const q=1-phase;
        const sx=q*q*a.x+2*q*phase*mx+phase*phase*b.x;
        const sy=q*q*a.y+2*q*phase*my+phase*phase*b.y;
        const glow=ctx.createRadialGradient(sx,sy,0,sx,sy,4+activity*10);
        glow.addColorStop(0,'rgba(255,255,255,'+(.55+activity*.35)+')');
        glow.addColorStop(.3,rgba(color(edge.b.cluster,edge.b.status),.52));
        glow.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=glow;ctx.beginPath();ctx.arc(sx,sy,5+activity*10,0,Math.PI*2);ctx.fill();
      }
    }
  }
  function drawDendrites(node,p,t){
    if(node.id==='aura')return;
    const ctx=state.ctx,c=color(node.cluster,node.status);
    const intensity=Math.max(.08,Math.min(1,Number(node.activity)||0));
    const role=String(node.role||'capability');
    const count=role==='product'?2:4+Math.round(intensity*5);
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    for(let i=0;i<count;i++){
      const seed=hash01(node.id+':branch:'+i);
      const angle=seed*Math.PI*2+Math.sin(t*.00010+i*1.7)*.06;
      const length=(role==='product'?12:22)+hash01(node.id+':len:'+i)*32+intensity*20;
      const x=p.x+Math.cos(angle)*length;
      const y=p.y+Math.sin(angle)*length*.78;
      const cx1=p.x+Math.cos(angle+.22)*length*.42;
      const cy1=p.y+Math.sin(angle-.18)*length*.34;
      const cx2=p.x+Math.cos(angle-.16)*length*.74;
      const cy2=p.y+Math.sin(angle+.15)*length*.60;
      ctx.strokeStyle=rgba(c,.10+intensity*.20);
      ctx.lineWidth=.50+intensity*.55;
      ctx.shadowBlur=3+intensity*5;
      ctx.shadowColor=rgba(c,.28+intensity*.30);
      ctx.beginPath();ctx.moveTo(p.x,p.y);
      ctx.bezierCurveTo(cx1,cy1,cx2,cy2,x,y);ctx.stroke();

      if(role!=='product'){
        const forkAngle=angle+(hash01(node.id+':fork:'+i)>.5?.38:-.38);
        const forkLen=length*(.26+hash01(node.id+':forklen:'+i)*.20);
        const fx=x+Math.cos(forkAngle)*forkLen;
        const fy=y+Math.sin(forkAngle)*forkLen*.75;
        ctx.strokeStyle=rgba(c,.06+intensity*.13);
        ctx.lineWidth=.35+intensity*.30;
        ctx.beginPath();ctx.moveTo(x,y);
        ctx.quadraticCurveTo(
          x+Math.cos(forkAngle+.14)*forkLen*.48,
          y+Math.sin(forkAngle-.12)*forkLen*.38,
          fx,fy
        );
        ctx.stroke();
        ctx.fillStyle=rgba(c,.20+intensity*.34);
        ctx.beginPath();ctx.arc(fx,fy,.9+intensity*1.25,0,Math.PI*2);ctx.fill();
      }

      ctx.fillStyle=rgba(c,.34+intensity*.40);
      ctx.beginPath();ctx.arc(x,y,1.2+intensity*1.6,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function drawMicroNetwork(node,p,t){
    if(node.id==='aura')return;
    const ctx=state.ctx;
    const c=color(node.cluster,node.status);
    const activity=Math.max(.05,Math.min(1,Number(node.activity)||0));
    const centrality=Math.max(.05,Math.min(1,Number(node.centrality)||0));
    const count=node.role==='product'
      ? 4+Math.round(activity*4)
      : 8+Math.round(activity*7+centrality*5);
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    let prev=null;
    for(let i=0;i<count;i++){
      const base=hash01(node.id+':micro:'+i)*Math.PI*2;
      const drift=Math.sin(t*.00012+i*1.9+hash01(node.id))*0.08;
      const dist=24+hash01(node.id+':md:'+i)*(36+activity*26);
      const x=p.x+Math.cos(base+drift)*dist;
      const y=p.y+Math.sin(base+drift)*dist*.66;
      const r=.8+hash01(node.id+':mr:'+i)*1.7+activity*.45;
      const a=.16+activity*.34;
      ctx.strokeStyle=rgba(c,.055+activity*.105);
      ctx.lineWidth=.32+activity*.28;
      ctx.beginPath();ctx.moveTo(p.x,p.y);
      const mx=(p.x+x)/2+(y-p.y)*.06;
      const my=(p.y+y)/2-(x-p.x)*.06;
      ctx.quadraticCurveTo(mx,my,x,y);ctx.stroke();
      if(prev&&i%2===1){
        ctx.strokeStyle=rgba(c,.018+activity*.035);
        ctx.lineWidth=.25;
        ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(x,y);ctx.stroke();
      }
      const glow=ctx.createRadialGradient(x,y,0,x,y,r*5.5);
      glow.addColorStop(0,'rgba(255,255,255,'+(.30+activity*.34)+')');
      glow.addColorStop(.22,rgba(c,.42+activity*.34));
      glow.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,r*5.5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=rgba(c,.58+activity*.30);ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
      prev={x,y};
    }
    ctx.restore();
  }

  function drawClusterConstellation(node,p,t){
    if(node.id==='aura'||node.role==='product')return;
    const activity=Math.max(.05,Math.min(1,Number(node.activity)||0));
    const centrality=Math.max(.05,Math.min(1,Number(node.centrality)||0));
    if(activity<.20&&centrality<.45)return;
    const ctx=state.ctx;
    const c=color(node.cluster,node.status);
    const count=10+Math.round(activity*8+centrality*7);
    const points=[];
    const baseRadius=34+centrality*24+activity*18;

    ctx.save();
    ctx.globalCompositeOperation='lighter';

    for(let i=0;i<count;i++){
      const seed=hash01(node.id+':cluster:'+i);
      const ring=i%3;
      const angle=seed*Math.PI*2+t*.000035*(ring%2?1:-1)+(i/count)*Math.PI*.65;
      const radius=baseRadius*(.52+ring*.28)+hash01(node.id+':cluster-r:'+i)*16;
      const x=p.x+Math.cos(angle)*radius;
      const y=p.y+Math.sin(angle)*radius*.62;
      points.push({x,y,seed,ring});

      const g=ctx.createRadialGradient(x,y,0,x,y,8+activity*8);
      g.addColorStop(0,'rgba(255,255,255,'+(.34+activity*.36)+')');
      g.addColorStop(.24,rgba(c,.38+activity*.30));
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g;
      ctx.beginPath();ctx.arc(x,y,8+activity*8,0,Math.PI*2);ctx.fill();

      ctx.fillStyle=rgba(c,.62+activity*.28);
      ctx.beginPath();ctx.arc(x,y,1.2+centrality*1.5+activity*.8,0,Math.PI*2);ctx.fill();

      ctx.strokeStyle=rgba(c,.06+activity*.08);
      ctx.lineWidth=.35+activity*.28;
      ctx.beginPath();ctx.moveTo(p.x,p.y);
      const mx=(p.x+x)/2+(y-p.y)*.08;
      const my=(p.y+y)/2-(x-p.x)*.08;
      ctx.quadraticCurveTo(mx,my,x,y);ctx.stroke();
    }

    for(let i=0;i<points.length;i++){
      const a=points[i];
      const b=points[(i+1)%points.length];
      if(i%2===0){
        ctx.strokeStyle=rgba(c,.025+activity*.055);
        ctx.lineWidth=.28+.18*activity;
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      }
      if(i%5===0&&points[i+3]){
        const d=points[i+3];
        ctx.strokeStyle=rgba(c,.018+activity*.04);
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(d.x,d.y);ctx.stroke();
      }
    }

    if(activity>.5&&!state.reduced){
      const phase=(t*.00018+hash01(node.id+':cluster-pulse'))%1;
      const idx=Math.floor(phase*Math.max(1,points.length-1));
      const a=points[idx],b=points[(idx+1)%points.length];
      if(a&&b){
        const q=(phase*points.length)%1;
        const x=a.x+(b.x-a.x)*q;
        const y=a.y+(b.y-a.y)*q;
        const pulse=ctx.createRadialGradient(x,y,0,x,y,9);
        pulse.addColorStop(0,'rgba(255,255,255,.86)');
        pulse.addColorStop(.25,rgba(c,.58));
        pulse.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=pulse;ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawNeuron(node,t){
    const ctx=state.ctx,p=px(node);
    const c=color(node.cluster,node.status);
    const intensity=Math.max(.06,Math.min(1,Number(node.activity)||0));
    if(node.id==='aura'){
      const breath=.94+.06*Math.sin(t*.0012);
      const r=72*breath;
      const halo=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*3.8);
      halo.addColorStop(0,'rgba(255,255,255,.95)');
      halo.addColorStop(.10,'rgba(220,199,255,.82)');
      halo.addColorStop(.34,'rgba(154,108,255,.56)');
      halo.addColorStop(.70,'rgba(81,64,180,.16)');
      halo.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=halo;ctx.beginPath();ctx.arc(p.x,p.y,r*2.9,0,Math.PI*2);ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      for(let ring=0;ring<4;ring++){
        const rr=r*(1.05+ring*.34)+Math.sin(t*.0008+ring)*2.4;
        ctx.strokeStyle=ring===0?'rgba(231,220,255,.58)':ring===1?'rgba(130,198,255,.20)':ring===2?'rgba(241,120,214,.14)':'rgba(255,201,106,.08)';
        ctx.lineWidth=ring===0?1.35:.75;
        ctx.beginPath();ctx.arc(p.x,p.y,rr,0,Math.PI*2);ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle='rgba(249,247,255,.99)';ctx.font='760 22px Inter,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('AURA',p.x,p.y);
      return;
    }
    const role=String(node.role||'capability');
    drawClusterConstellation(node,p,t);
    drawMicroNetwork(node,p,t);
    drawDendrites(node,p,t);
    if(intensity>.42&&role!=='product'){
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.strokeStyle=rgba(c,.06+intensity*.12);
      ctx.lineWidth=.55;
      const spin=t*.00018*(hash01(node.id+':spin')>.5?1:-1);
      ctx.beginPath();ctx.ellipse(p.x,p.y,22+intensity*19,10+intensity*9,spin+hash01(node.id)*Math.PI,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle=rgba('#ffffff',.025+intensity*.035);
      ctx.beginPath();ctx.ellipse(p.x,p.y,31+intensity*22,14+intensity*11,-spin*.7+hash01(node.id+':o2')*Math.PI,0,Math.PI*2);ctx.stroke();
      ctx.restore();
    }
    const strongest=(state.field?.links||[])
      .filter(function(edge){return edge.a.id===node.id||edge.b.id===node.id;})
      .sort(function(a,b){return (Number(b.activity)||0)-(Number(a.activity)||0);})[0];
    if(strongest){
      const other=strongest.a.id===node.id?strongest.b:strongest.a;
      const op=px(other);
      const dx=op.x-p.x,dy=op.y-p.y,d=Math.sqrt(dx*dx+dy*dy)||1;
      const reach=Math.min(44,d*.30);
      const ax=p.x+(dx/d)*reach,ay=p.y+(dy/d)*reach;
      ctx.save();
      ctx.strokeStyle=rgba(c,.10+intensity*.20);
      ctx.lineWidth=.75+intensity*.55;
      ctx.shadowBlur=4;ctx.shadowColor=rgba(c,.35);
      ctx.beginPath();ctx.moveTo(p.x,p.y);
      ctx.quadraticCurveTo(p.x+dx*.10-dy*.05,p.y+dy*.10+dx*.05,ax,ay);
      ctx.stroke();ctx.restore();
    }
    const base=role==='product'?6.5:role==='fabric-capability'?6.0:11.5;
    const centralBoost=(Number(node.centrality)||0)*8.0;
    const r=base+intensity*9.0+centralBoost;
    const halo=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*4.1);
    halo.addColorStop(0,rgba(c,.58+intensity*.30));halo.addColorStop(.24,rgba(c,.22+intensity*.18));halo.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=halo;ctx.beginPath();ctx.arc(p.x,p.y,r*4.1,0,Math.PI*2);ctx.fill();
    ctx.save();
    ctx.translate(p.x,p.y);
    ctx.rotate((hash01(node.id+':rot')-.5)*.8);
    ctx.fillStyle=rgba(c,.24+intensity*.44);ctx.strokeStyle=rgba(c,.50+intensity*.40);
    ctx.lineWidth=node.dominant?2:1;ctx.shadowBlur=node.dominant?14:5;ctx.shadowColor=rgba(c,.68);
    ctx.beginPath();
    const points=14;
    for(let i=0;i<=points;i++){
      const a=(i/points)*Math.PI*2;
      const wobble=1+(hash01(node.id+':soma:'+i)-.5)*.15+Math.sin(t*.001+a*3)*.025*intensity;
      const rx=Math.cos(a)*r*wobble;
      const ry=Math.sin(a)*r*(.86+.08*hash01(node.id+':oval'));
      if(i===0)ctx.moveTo(rx,ry);else ctx.lineTo(rx,ry);
    }
    ctx.closePath();ctx.fill();ctx.stroke();ctx.shadowBlur=0;
    ctx.strokeStyle=rgba('#ffffff',.08+intensity*.10);ctx.lineWidth=.55;
    ctx.beginPath();ctx.ellipse(0,0,r*.72,r*.56,0,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,'+(.42+intensity*.48)+')';
    ctx.beginPath();ctx.arc(-r*.08,-r*.05,Math.max(1.6,r*.24),0,Math.PI*2);ctx.fill();
    ctx.restore();

    const visibleLabels=(state.field?.nodes||[])
      .filter(function(x){return x.id!=='aura';})
      .sort(function(a,b){
        const as=(Number(a.activity)||0)*.62+(Number(a.centrality)||0)*.38;
        const bs=(Number(b.activity)||0)*.62+(Number(b.centrality)||0)*.38;
        return bs-as;
      })
      .slice(0,8)
      .map(function(x){return x.id;});
    const show=node.dominant||state.hovered===node.id||visibleLabels.includes(node.id);
    if(show){
      const dx=p.x-state.width*.5;const dy=p.y-state.height*.5;const d=Math.sqrt(dx*dx+dy*dy)||1;
      const lx=p.x+(dx/d)*(r+12),ly=p.y+(dy/d)*(r+10);
      ctx.font='650 13px Inter,system-ui,sans-serif';ctx.textAlign=dx<0?'right':'left';ctx.textBaseline='middle';
      ctx.lineWidth=3;ctx.strokeStyle='rgba(3,5,10,.88)';ctx.strokeText(node.label,lx,ly);ctx.fillStyle='#eef2ff';ctx.fillText(node.label,lx,ly);
    }
  }
  function galaxyAnchor(cluster,index){
    const anchors={
      perception:{x:.34,y:.24},
      memory:{x:.63,y:.25},
      cognition:{x:.66,y:.52},
      agency:{x:.62,y:.76},
      regulation:{x:.34,y:.60},
      infrastructure:{x:.44,y:.77},
      fabric:{x:.52,y:.76},
      ecosystem:{x:.32,y:.43},
    };
    if(anchors[cluster])return anchors[cluster];
    const angle=(index*.91+hash01(cluster)*Math.PI*2);
    return {x:.5+Math.cos(angle)*.30,y:.5+Math.sin(angle)*.24};
  }

  function layoutCognitiveGalaxies(field){
    if(!field)return;
    const groups={};
    for(const node of field.nodes){
      if(node.id==='aura'){
        node.x=.5;node.y=.5;node.fixed=true;node.vx=0;node.vy=0;
        continue;
      }
      const key=String(node.cluster||'fabric');
      (groups[key]||(groups[key]=[])).push(node);
    }
    const galaxies=[];
    let gi=0;
    for(const key of Object.keys(groups)){
      const rows=groups[key].sort(function(a,b){
        const as=(Number(a.activity)||0)*.55+(Number(a.centrality)||0)*.45;
        const bs=(Number(b.activity)||0)*.55+(Number(b.centrality)||0)*.45;
        return bs-as;
      });
      const anchor=galaxyAnchor(key,gi++);
      const hub=rows[0]||null;
      const avg=rows.length
        ? rows.reduce(function(sum,n){return sum+Number(n.activity||0);},0)/rows.length
        : .2;
      const radius=.052+Math.min(.045,rows.length*.006)+avg*.016;
      rows.forEach(function(node,i){
        if(i===0){
          node.x=anchor.x;node.y=anchor.y;
        }else{
          const seed=hash01(node.id+':galaxy-layout');
          const ring=1+Math.floor((i-1)/5);
          const angle=seed*Math.PI*2+i*.92;
          const rr=radius*(.56+ring*.34)+hash01(node.id+':galaxy-r')*.014;
          node.x=anchor.x+Math.cos(angle)*rr;
          node.y=anchor.y+Math.sin(angle)*rr*.72;
        }
        node.fixed=true;node.vx=0;node.vy=0;
      });
      galaxies.push({
        id:key,
        x:anchor.x,
        y:anchor.y,
        nodes:rows,
        hub:hub,
        activity:Math.max(.08,Math.min(1,avg)),
        centrality:hub?Math.max(.08,Math.min(1,Number(hub.centrality||0))):.4,
      });
    }
    field.galaxies=galaxies;
  }

  function drawCognitiveDust(t){
    const ctx=state.ctx,w=state.width,h=state.height;
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    for(let arm=0;arm<5;arm++){
      const phase=arm*Math.PI*.4+t*.000018*(arm%2?1:-1);
      const hue=arm%3===0?'#9d76ff':arm%3===1?'#64dfff':'#ef7ad9';
      for(let i=0;i<90;i++){
        const q=i/89;
        const radius=38+q*Math.min(w,h)*.56;
        const angle=phase+q*Math.PI*2.55;
        const jitter=(hash01('v8-dust-'+arm+'-'+i)-.5)*18;
        const x=w*.5+Math.cos(angle)*(radius+jitter);
        const y=h*.5+Math.sin(angle)*(radius+jitter)*.58;
        const alpha=.018+.115*(1-q)*(.45+.55*Math.sin(t*.0007+i));
        const r=.45+hash01('v8-dust-r-'+arm+'-'+i)*1.8;
        ctx.fillStyle=rgba(hue,alpha);
        ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawFunctionalRibbonsV8(t){
    if(!state.field)return;
    const ctx=state.ctx;
    for(const edge of state.field.links||[]){
      const a=px(edge.a),b=px(edge.b);
      const activity=Math.max(.06,Math.min(1,Number(edge.activity)||0));
      const weight=Math.max(.08,Math.min(1,Number(edge.weight)||.5));
      const ca=color(edge.a.cluster,edge.a.status);
      const cb=color(edge.b.cluster,edge.b.status);
      const dx=b.x-a.x,dy=b.y-a.y;
      const len=Math.hypot(dx,dy)||1;
      const curve=(hash01(edge.source+'|'+edge.target)-.5)*Math.min(120,len*.28);
      const nx=-dy/len,ny=dx/len;
      const c1x=a.x+dx*.34+nx*curve;
      const c1y=a.y+dy*.34+ny*curve;
      const c2x=a.x+dx*.66+nx*curve;
      const c2y=a.y+dy*.66+ny*curve;
      const grad=ctx.createLinearGradient(a.x,a.y,b.x,b.y);
      grad.addColorStop(0,rgba(ca,.08+activity*.16));
      grad.addColorStop(.5,'rgba(255,255,255,'+(.018+activity*.045)+')');
      grad.addColorStop(1,rgba(cb,.08+activity*.16));

      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.strokeStyle=grad;
      ctx.lineWidth=.65+weight*1.55;
      ctx.shadowBlur=7+activity*9;
      ctx.shadowColor=rgba(cb,.18+activity*.18);
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.bezierCurveTo(c1x,c1y,c2x,c2y,b.x,b.y);ctx.stroke();

      if(!state.reduced&&activity>.30){
        const p=(t*.00012*(.72+activity)+hash01(edge.source+edge.target))%1;
        const q=1-p;
        const x=q*q*q*a.x+3*q*q*p*c1x+3*q*p*p*c2x+p*p*p*b.x;
        const y=q*q*q*a.y+3*q*q*p*c1y+3*q*p*p*c2y+p*p*p*b.y;
        const pulse=ctx.createRadialGradient(x,y,0,x,y,7+activity*8);
        pulse.addColorStop(0,'rgba(255,255,255,.90)');
        pulse.addColorStop(.22,rgba(cb,.62));
        pulse.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=pulse;ctx.beginPath();ctx.arc(x,y,7+activity*8,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawGalaxyV8(galaxy,t){
    const ctx=state.ctx;
    const center={x:galaxy.x*state.width,y:galaxy.y*state.height};
    const c=color(galaxy.id,'active');
    const activity=galaxy.activity;
    const centrality=galaxy.centrality;
    const scale=.90+.10*Math.sin(t*.00045+hash01(galaxy.id)*Math.PI*2);
    const R=(58+activity*40+centrality*26)*scale;

    ctx.save();
    ctx.globalCompositeOperation='lighter';

    const neb=ctx.createRadialGradient(center.x,center.y,0,center.x,center.y,R*1.85);
    neb.addColorStop(0,rgba(c,.15+activity*.16));
    neb.addColorStop(.22,rgba(c,.07+activity*.085));
    neb.addColorStop(.58,rgba(c,.016+activity*.024));
    neb.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=neb;
    ctx.beginPath();ctx.ellipse(center.x,center.y,R*1.85,R*1.20,hash01(galaxy.id)*Math.PI,0,Math.PI*2);ctx.fill();

    for(let ring=0;ring<3;ring++){
      const rr=R*(.62+ring*.34);
      ctx.strokeStyle=rgba(c,.045+activity*.055);
      ctx.lineWidth=.55;
      ctx.beginPath();
      ctx.ellipse(center.x,center.y,rr,rr*(.54+ring*.06),t*.00004*(ring%2?1:-1)+hash01(galaxy.id+ring)*Math.PI,0,Math.PI*2);
      ctx.stroke();
    }

    const microCount=state.reduced?34:Math.min(120,54+galaxy.nodes.length*10+Math.round(activity*28));
    const points=[];
    for(let i=0;i<microCount;i++){
      const seed=hash01(galaxy.id+':v8:'+i);
      const arm=i%4;
      const q=.12+.88*hash01(galaxy.id+':vq:'+i);
      const angle=arm*Math.PI*.5+q*Math.PI*2.1+t*.00005*(arm%2?1:-1)+seed*.85;
      const rr=14+Math.pow(q,.78)*R*(.72+hash01(galaxy.id+':vr:'+i)*.65);
      const x=center.x+Math.cos(angle)*rr;
      const y=center.y+Math.sin(angle)*rr*.62;
      const pr=.6+hash01(galaxy.id+':vp:'+i)*1.65;
      points.push({x,y,pr,seed});
      const glow=ctx.createRadialGradient(x,y,0,x,y,pr*5.5);
      glow.addColorStop(0,'rgba(255,255,255,'+(.20+activity*.30)+')');
      glow.addColorStop(.28,rgba(c,.24+activity*.24));
      glow.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,pr*5.5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=rgba(c,.46+activity*.34);ctx.beginPath();ctx.arc(x,y,pr,0,Math.PI*2);ctx.fill();
    }

    for(let i=0;i<points.length;i+=2){
      const a=points[i],b=points[(i+7)%points.length];
      if(!a||!b)continue;
      const d=Math.hypot(b.x-a.x,b.y-a.y);
      if(d>R*.82)continue;
      ctx.strokeStyle=rgba(c,.018+activity*.035);
      ctx.lineWidth=.28;
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
    ctx.restore();

    for(const node of galaxy.nodes){
      const p=px(node);
      const intensity=Math.max(.06,Math.min(1,Number(node.activity)||0));
      const nc=color(node.cluster,node.status);
      const isHub=node===galaxy.hub;
      const r=isHub?15+intensity*11:6+intensity*5;
      const halo=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*4.8);
      halo.addColorStop(0,'rgba(255,255,255,'+(isHub?.80:.58)+')');
      halo.addColorStop(.18,rgba(nc,isHub?.60:.38));
      halo.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=halo;ctx.beginPath();ctx.arc(p.x,p.y,r*4.8,0,Math.PI*2);ctx.fill();

      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.strokeStyle=rgba(nc,.22+intensity*.22);
      ctx.lineWidth=isHub?1.1:.55;
      ctx.beginPath();ctx.arc(p.x,p.y,r*(1.4+.08*Math.sin(t*.001+hash01(node.id))),0,Math.PI*2);ctx.stroke();
      ctx.restore();

      ctx.fillStyle=rgba(nc,.60+intensity*.30);
      ctx.beginPath();ctx.arc(p.x,p.y,r*.56,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(255,255,255,'+(.62+intensity*.32)+')';
      ctx.beginPath();ctx.arc(p.x-r*.10,p.y-r*.10,Math.max(1.3,r*.16),0,Math.PI*2);ctx.fill();
    }

    const hub=galaxy.hub;
    if(hub){
      const hp=px(hub);
      ctx.textAlign='left';ctx.textBaseline='middle';
      ctx.font='720 15px Inter,system-ui,sans-serif';
      ctx.lineWidth=4;ctx.strokeStyle='rgba(2,4,10,.90)';ctx.strokeText(hub.label,hp.x+26,hp.y-3);
      ctx.fillStyle='#f3f6ff';ctx.fillText(hub.label,hp.x+26,hp.y-3);

      const companions=galaxy.nodes.slice(1,4).map(function(n){return n.label;}).filter(Boolean);
      if(companions.length){
        ctx.font='520 8.5px Inter,system-ui,sans-serif';
        ctx.fillStyle='rgba(190,202,226,.76)';
        ctx.fillText(companions.join(' · '),hp.x+26,hp.y+15);
      }
    }
  }

  function drawAuraCoreV8(t){
    const aura=state.field?.byId?.aura;
    if(!aura)return;
    const ctx=state.ctx,p=px(aura);
    const breath=.965+.035*Math.sin(t*.0012);
    const r=78*breath;

    ctx.save();
    ctx.globalCompositeOperation='lighter';
    const outer=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*4.6);
    outer.addColorStop(0,'rgba(255,255,255,.22)');
    outer.addColorStop(.06,'rgba(234,220,255,.28)');
    outer.addColorStop(.18,'rgba(181,125,255,.24)');
    outer.addColorStop(.42,'rgba(109,73,239,.11)');
    outer.addColorStop(.72,'rgba(74,102,255,.035)');
    outer.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=outer;ctx.beginPath();ctx.arc(p.x,p.y,r*4.6,0,Math.PI*2);ctx.fill();

    for(let arm=0;arm<5;arm++){
      for(let i=0;i<72;i++){
        const q=i/71;
        const a=arm*Math.PI*.4+q*Math.PI*2.0+t*.00006*(arm%2?1:-1);
        const rr=r*(1.15+q*1.55);
        const x=p.x+Math.cos(a)*rr;
        const y=p.y+Math.sin(a)*rr*.56;
        const pr=.55+(1-q)*1.5;
        ctx.fillStyle=arm%2?rgba('#77dfff',.05+(1-q)*.15):rgba('#c48cff',.06+(1-q)*.17);
        ctx.beginPath();ctx.arc(x,y,pr,0,Math.PI*2);ctx.fill();
      }
    }

    for(let ring=0;ring<5;ring++){
      const rr=r*(1.06+ring*.27)+Math.sin(t*.0008+ring)*2.2;
      ctx.strokeStyle=ring===0?'rgba(241,231,255,.52)':ring===1?'rgba(176,126,255,.28)':ring===2?'rgba(104,217,255,.17)':'rgba(241,120,214,.08)';
      ctx.lineWidth=ring===0?1.45:.72;
      ctx.beginPath();ctx.ellipse(p.x,p.y,rr,rr*(.90-ring*.055),t*.00006*(ring%2?1:-1),0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();

    const sphere=ctx.createRadialGradient(p.x-r*.24,p.y-r*.30,4,p.x,p.y,r);
    sphere.addColorStop(0,'rgba(255,255,255,1)');
    sphere.addColorStop(.12,'rgba(235,220,255,.98)');
    sphere.addColorStop(.32,'rgba(185,135,255,.94)');
    sphere.addColorStop(.66,'rgba(107,68,222,.94)');
    sphere.addColorStop(1,'rgba(40,27,92,.98)');
    ctx.fillStyle=sphere;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();

    ctx.strokeStyle='rgba(246,239,255,.72)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='rgba(255,255,255,.98)';ctx.font='760 24px Inter,system-ui,sans-serif';ctx.fillText('AURA',p.x,p.y-6);
    ctx.fillStyle='rgba(221,212,244,.78)';ctx.font='600 8px Inter,system-ui,sans-serif';ctx.fillText('EN ÉVOLUTION',p.x,p.y+17);
  }

  function frame(t){
    if(!state.canvas||!state.ctx)return;
    state.last=t;
    drawBackground(t);
    if(state.field){
      drawCognitiveDust(t);
      drawFunctionalRibbonsV8(t);
      for(const galaxy of state.field.galaxies||[]) drawGalaxyV8(galaxy,t);
      drawAuraCoreV8(t);
    }
    state.raf=requestAnimationFrame(frame);
  }

  function init(){
    if(state.canvas)return;
    state.canvas=document.getElementById('neuralFieldCanvas');
    if(!state.canvas)return;
    state.ctx=state.canvas.getContext('2d',{alpha:false});
    if(!state.ctx)return;
    state.reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    seedSpace();resize();
    window.addEventListener('resize',resize,{passive:true});
    installNeuralInteraction(state.canvas,state,function(node,x,y){
      const tooltip=document.getElementById('neuralTooltip');
      const focus=document.getElementById('focusStatement');
      if(node){
        if(tooltip){
          tooltip.classList.add('show');
          tooltip.style.left=Math.max(8,Math.min(78,x*100))+'%';
          tooltip.style.top=Math.max(8,Math.min(82,y*100))+'%';
          tooltip.innerHTML='<strong>'+String(node.label||'')+'</strong><span>'+String(node.cluster||'')+' · activité '+Math.round((Number(node.activity)||0)*100)+'% · centralité '+Math.round((Number(node.centrality)||0)*100)+'%</span>';
        }
        if(focus)focus.textContent=String(node.label||'')+' · '+Math.round((Number(node.activity)||0)*100)+'%';
      }else{
        if(tooltip)tooltip.classList.remove('show');
        if(focus)focus.textContent=String(state.field?.raw?.focus_statement||'Aucune intention dominante.');
      }
    });
    state.raf=requestAnimationFrame(frame);
  }
  function render(data){
    init();
    if(!state.canvas||!data||!Array.isArray(data.nodes))return;
    state.field=initializeNeuralField(data,state.field);
    layoutCognitiveGalaxies(state.field);
    const stats=document.getElementById('mapStats');
    if(stats){
      const s=data.stats||{};
      stats.textContent=(s.nodes||data.nodes.length)+' neurones · '+(s.synapses||(data.links||[]).length)+' synapses · '+(s.active||0)+' actifs';
    }
    const focus=document.getElementById('focusStatement');
    if(focus)focus.textContent=String(data.focus_statement||'Aucune intention dominante.');
  }

  function destroy(){
    if(state.raf)cancelAnimationFrame(state.raf);
    state.raf=0;
  }
  window.AURANeuralField={init,render,destroy,state};
})();
`;
