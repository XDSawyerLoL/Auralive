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
      const key=String(node.cluster||'fabric');
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
      ctx.lineWidth=.72+weight*2.15;
      ctx.strokeStyle=grad;
      ctx.shadowBlur=activity>0.42?9:2;ctx.shadowColor=rgba(c,.48);
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
  function drawNeuron(node,t){
    const ctx=state.ctx,p=px(node);
    const c=color(node.cluster,node.status);
    const intensity=Math.max(.06,Math.min(1,Number(node.activity)||0));
    if(node.id==='aura'){
      const breath=.94+.06*Math.sin(t*.0012);
      const r=52*breath;
      const halo=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*3.25);
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
      ctx.fillStyle='rgba(249,247,255,.99)';ctx.font='700 18px Inter,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('AURA',p.x,p.y);
      return;
    }
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
    const role=String(node.role||'capability');
    const base=role==='product'?5.5:role==='fabric-capability'?5.2:9.0;
    const centralBoost=(Number(node.centrality)||0)*3.2;
    const r=base+intensity*7.4+centralBoost;
    const halo=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*4.1);
    halo.addColorStop(0,rgba(c,.45+intensity*.26));halo.addColorStop(.28,rgba(c,.16+intensity*.16));halo.addColorStop(1,'rgba(0,0,0,0)');
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
      ctx.font='600 11px Inter,system-ui,sans-serif';ctx.textAlign=dx<0?'right':'left';ctx.textBaseline='middle';
      ctx.lineWidth=3;ctx.strokeStyle='rgba(3,5,10,.88)';ctx.strokeText(node.label,lx,ly);ctx.fillStyle='#eef2ff';ctx.fillText(node.label,lx,ly);
    }
  }
  function frame(t){
    if(!state.canvas||!state.ctx)return;
    const dt=Math.min(32,Math.max(0,t-state.last||16));state.last=t;
    drawBackground(t);
    if(state.field){
      if(!state.reduced&&dt) stepNeuralField(state.field);
      drawAuraCosmicArms(t);
      drawClusterNebula(t);
      drawGlialMesh(t);
      drawSynapses(t);
      const ordered=[...state.field.nodes].sort((a,b)=>(a.id==='aura'?1:0)-(b.id==='aura'?1:0));
      ordered.forEach(node=>drawNeuron(node,t));
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
    const previous=state.field;
    state.field=initializeNeuralField(data,previous);
    settleNeuralField(state.field,state.reduced?40:110);
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
