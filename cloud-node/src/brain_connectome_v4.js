export const BRAIN_CONNECTOME_V4 = String.raw`
const V4_GROUPS={conversation:'ENTRÉE / SORTIE',core:'COGNITION',memory:'MÉMOIRE',language:'LANGAGE',provider:'INFÉRENCE',security:'CONTRÔLE',tools:'OUTILS',execution:'ACTION',research:'EXPLORATION'};
const V4_COLORS={conversation:'247,194,135',core:'176,147,249',memory:'210,143,249',language:'107,223,240',provider:'126,167,251',security:'253,143,182',tools:'107,229,193',execution:'255,180,116',research:'180,146,251'};
function v4Path(a,b,c){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(c.x,c.y,b.x,b.y);}
function v4Point(a,b,c,t){const u=1-t;return {x:u*u*a.x+2*u*t*c.x+t*t*b.x,y:u*u*a.y+2*u*t*c.y+t*t*b.y};}
function v4Curve(a,b,index){const dx=b.x-a.x,dy=b.y-a.y,mag=Math.max(1,Math.hypot(dx,dy));const bend=Math.min(25*scale,mag*.13)*((index%3)-1);return{x:(a.x+b.x)*.5-dy/mag*bend,y:(a.y+b.y)*.5+dx/mag*bend};}
function v4FitText(text,max=27){return text.length>max?text.slice(0,max-1)+'…':text;}
function v4Round(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function v4Counters(){
 const d=state.data,edges=d?.edges||[],nodes=d?.nodes||[];
 const verified=edges.filter(e=>Number(e.observed_count||0)>0).length;
 const recent=edges.filter(e=>e.signal_recent===true&&
    Number.isFinite(Date.parse(e.last_observed_at||''))&&
    Date.now()-Date.parse(e.last_observed_at||'')<60000).length;
 setText('graphV4Nodes',nodes.length+' modules');
 setText('graphV4Links',edges.length+' liaisons');
 setText('graphV4Events',verified+' observées');
 const live=$('graphV4Live');
 if(live){live.textContent=recent?recent+' récentes':'Aucune récente';live.dataset.active=recent?'yes':'no';}
}
function v4Base(){
 ctx.fillStyle='#070d19';ctx.fillRect(0,0,canvasW,canvasH);
 const g=ctx.createRadialGradient(canvasW*.5,canvasH*.48,3,canvasW*.5,canvasH*.48,Math.max(canvasW,canvasH)*.66);
 g.addColorStop(0,'rgba(40,56,101,.24)');g.addColorStop(.55,'rgba(19,30,63,.13)');g.addColorStop(1,'rgba(7,12,24,0)');
 ctx.fillStyle=g;ctx.fillRect(0,0,canvasW,canvasH);
 ctx.strokeStyle='rgba(124,153,207,.07)';ctx.lineWidth=.7;
 const step=34;
 for(let x=(state.panX*.06)%step;x<canvasW;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvasH);ctx.stroke();}
 for(let y=(state.panY*.06)%step;y<canvasH;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvasW,y);ctx.stroke();}
 ctx.setLineDash([3,12]);ctx.strokeStyle='rgba(164,185,248,.08)';
 for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(canvasW*.5,canvasH*.50,(205+i*105)*scale,(130+i*63)*scale,0,0,Math.PI*2);ctx.stroke();}
 ctx.setLineDash([]);
}

/* Static biomorphic outline, informed by cerebral morphology. It is
 * structural art, NOT simulated neural activity. Only recorded hops glow. */
function v5CerebralMorphology(){
 const cx=canvasW*.5,cy=canvasH*(canvasW<=600?.27:.46);
 const rx=Math.min(canvasW*.31,canvasH*.34)*Math.min(1.25,Math.max(.75,state.zoom));
 const ry=Math.min(canvasH*.36,canvasW*.22)*Math.min(1.25,Math.max(.75,state.zoom));
 if(rx<45||ry<45)return;
 const stream=Number(state.data?.recent_signal_count)||0;
 const intensity=Math.min(1,Math.max(0,stream)/10);
 ctx.save();
 const halo=ctx.createRadialGradient(cx,cy,rx*.15,cx,cy,rx*1.65);
 halo.addColorStop(0,'rgba(58,130,161,'+(.07+intensity*.08)+')');
 halo.addColorStop(.57,'rgba(56,91,141,.035)');
 halo.addColorStop(1,'rgba(3,9,17,0)');
 ctx.fillStyle=halo;ctx.beginPath();ctx.ellipse(cx,cy,rx*1.65,ry*1.6,0,0,Math.PI*2);ctx.fill();
 for(const hemi of [-1,1]){
  const x=cx+hemi*6;
  ctx.save();ctx.translate(x,cy);ctx.scale(hemi,1);
  const shape=ctx.createLinearGradient(0,-ry,rx*.96,ry);
  shape.addColorStop(0,'rgba(78,176,192,'+(.055+intensity*.026)+')');
  shape.addColorStop(.48,'rgba(53,115,150,.09)');
  shape.addColorStop(1,'rgba(52,44,126,.025)');
  ctx.fillStyle=shape;
  ctx.strokeStyle='rgba(112,206,218,'+(.25+intensity*.16)+')';
  ctx.shadowColor='rgba(85,199,233,.16)';ctx.shadowBlur=22;
  ctx.lineWidth=1.15;
  ctx.beginPath();ctx.moveTo(0,-ry*.82);
  ctx.bezierCurveTo(rx*.2,-ry*1.13,rx*.64,-ry*.91,rx*.67,-ry*.71);
  ctx.bezierCurveTo(rx*1.12,-ry*.77,rx*1.07,-ry*.34,rx*.95,-ry*.14);
  ctx.bezierCurveTo(rx*1.17,ry*.24,rx*.85,ry*.51,rx*.72,ry*.63);
  ctx.bezierCurveTo(rx*.66,ry*1.03,rx*.19,ry*.88,0,ry*.68);
  ctx.bezierCurveTo(-rx*.07,ry*.20,-rx*.02,-ry*.18,0,-ry*.82);
  ctx.closePath();ctx.fill();ctx.stroke();ctx.shadowBlur=0;
  ctx.strokeStyle='rgba(129,179,217,'+(.10+intensity*.06)+')';
  ctx.lineWidth=.85;
  for(let i=0;i<11;i++){
   // Resting sulcal contours are fixed graphic geometry, not activated neurons.
   const fy=-ry*.72+i*ry*.135;
   const start=rx*(.12+(i%3)*.035);
   const end=rx*(.60+(i%4)*.07);
   ctx.beginPath();ctx.moveTo(start,fy);
   ctx.bezierCurveTo(start+rx*.11,fy-ry*.12,end-rx*.06,fy+ry*.12,end,fy+ry*.05);
   ctx.stroke();
  }
  ctx.restore();
 }
 ctx.strokeStyle='rgba(127,192,218,.12)';ctx.lineWidth=1;ctx.setLineDash([3,13]);
 for(let i=0;i<3;i++){
  ctx.beginPath();ctx.ellipse(cx,cy,rx*(1.09+i*.17),ry*(1.17+i*.16),
     i%2?.20:-.12,0,Math.PI*2);ctx.stroke();
 }
 ctx.setLineDash([]);ctx.restore();
}

function v4Regions(){
 const d=state.data,nodes=d.nodes||[];
 const groups=[...new Set(nodes.map(n=>n.group))];
 for(const group of groups){
  const pp=nodes.filter(n=>n.group===group).map(n=>project(n.id));
  if(!pp.length)continue;
  const xs=pp.map(p=>p.x),ys=pp.map(p=>p.y);
  const x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2;
  const rx=Math.max(54,(Math.max(...xs)-Math.min(...xs))*.59+22*scale);
  const ry=Math.max(43,(Math.max(...ys)-Math.min(...ys))*.67+18*scale);
  const hue=V4_COLORS[group]||'127,175,220';
  ctx.save();ctx.globalAlpha=state.focusGroup==='all'||group===state.focusGroup?1:.16;
  const g=ctx.createRadialGradient(x,y,0,x,y,Math.max(rx,ry));
  g.addColorStop(0,'rgba('+hue+',.12)');g.addColorStop(1,'rgba('+hue+',0)');
  ctx.fillStyle=g;ctx.fillRect(x-rx,y-ry,rx*2,ry*2);
  ctx.strokeStyle='rgba('+hue+',.14)';ctx.lineWidth=.9;ctx.setLineDash([3,8]);
  ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.stroke();
  ctx.restore();
 }
}
function draw(){
 if(!state.data)return;
 sizeCanvas();ctx.clearRect(0,0,canvasW,canvasH);
 ctx.save();v4Base();v5CerebralMorphology();v4Regions();
 const d=state.data,now=Date.now(),edges=d.edges||[],nodes=d.nodes||[];
 const inLens=id=>state.focusGroup==='all'||findNode(id)?.group===state.focusGroup;
 const replay=replayPosition();
 const steps=replay.steps,elapsed=replay.elapsed,replaying=replay.replaying;
 const current=steps[replay.index]||null;
 const route=new Set(steps.map(s=>s.from+'>'+s.to));
 const visited=new Set(steps.slice(0,replay.index).map(s=>s.from+'>'+s.to));
 if(state.replayRendered!==replay.index)syncTraceConsole();
 for(let i=0;i<edges.length;i++){
  const edge=edges[i];if(!findNode(edge.from)||!findNode(edge.to))continue;
  const a=project(edge.from),b=project(edge.to),c=v4Curve(a,b,i);
  const observed=Number(edge.observed_count||0)>0,focused=edge.from===state.selected||edge.to===state.selected;
  const age=edge.last_observed_at?now-Date.parse(edge.last_observed_at):Infinity;
  const recent=observed&&edge.signal_recent===true&&age>=0&&age<20000;
  const highlight=Boolean(current&&current.from===edge.from&&current.to===edge.to);
  const edgeKey=edge.from+'>'+edge.to;
  const inRoute=route.has(edgeKey),hasBeenVisited=visited.has(edgeKey);
  const suppressed=state.activityOnly&&!observed&&!focused&&!inRoute;
  const alpha=(inLens(edge.from)||inLens(edge.to)?1:.12)*(suppressed?.10:1);
  const hue=V4_COLORS[findNode(edge.from)?.group]||'120,162,220';
  ctx.save();ctx.globalAlpha=alpha;
  ctx.strokeStyle=highlight?'rgba(255,206,135,.98)':recent?'rgba(102,255,227,.93)':
   hasBeenVisited?'rgba(241,166,100,.66)':inRoute?'rgba(182,174,223,.52)':
   observed?'rgba(170,195,242,.59)':focused?'rgba(168,197,241,.43)':'rgba(103,142,207,.26)';
  ctx.lineWidth=highlight||recent?2.6:hasBeenVisited?1.8:inRoute?1.6:observed?1.4:focused?1.2:.85;
  if(highlight||recent){ctx.shadowBlur=12;ctx.shadowColor=highlight?'#ffc987':'#5cffe2';}
  v4Path(a,b,c);ctx.stroke();ctx.shadowBlur=0;
  if(!suppressed){
   // Dendrite-like subdivisions follow *existing declared edges only*.
   const count=Math.min(16,Math.max(6,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/16)));
   for(let k=1;k<count;k++){
    const p=v4Point(a,b,c,k/count);
    ctx.fillStyle='rgba('+(recent||highlight?'133,255,235':hue)+','+(recent?.85:observed?.51:.33)+')';
    ctx.beginPath();ctx.arc(p.x,p.y,recent?1.4:observed?1.05:.85,0,Math.PI*2);ctx.fill();
   }
  }
  ctx.restore();
  if(!reduced&&(highlight&&replaying||recent&&age<1600)){
   const t=highlight&&replaying?replay.phase:Math.min(1,age/1600);
   const p=v4Point(a,b,c,t),radius=12;
   const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,radius);
   const rgb=highlight?'255,196,113':'109,255,221';
   g.addColorStop(0,'#ffffff');g.addColorStop(.22,'rgba('+rgb+',.95)');g.addColorStop(1,'rgba('+rgb+',0)');
   ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();
  }
 }
 v5DrawReceiptPulses();
 state.screen=[];
 const labels=[];
 for(const node of nodes){
  const p=project(node.id),selected=node.id===state.selected,hovered=node.id===state.hovered;
  const observed=isRecent(node),core=ANCHORS.has(node.id),hue=V4_COLORS[node.group]||'150,180,215';
  const radius=Math.max(4,(selected?14:observed?11:core?9:6.4)*Math.min(scale,1.15));
  const alpha=(inLens(node.id)?1:.20)*(state.activityOnly&&!observed&&!selected?.31:1);
  state.screen.push({id:node.id,x:p.x,y:p.y,r:Math.max(17,radius+8)});
  ctx.save();ctx.globalAlpha=alpha;
  const glow=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,radius*(selected||observed?4:2.7));
  glow.addColorStop(0,'rgba('+(observed?'92,255,218':selected?'255,198,139':hue)+','+(selected||observed?.55:.23)+')');
  glow.addColorStop(1,'rgba('+hue+',0)');
  ctx.fillStyle=glow;ctx.beginPath();ctx.arc(p.x,p.y,radius*(selected||observed?4:2.7),0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#08111e';ctx.strokeStyle='rgba('+hue+','+(selected||observed?.98:.68)+')';
  ctx.lineWidth=selected?2.3:1.5;ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle=observed?'#6dffe6':selected?'#ffd89a':'rgba('+hue+',.94)';
  ctx.beginPath();ctx.arc(p.x,p.y,radius*.54,0,Math.PI*2);ctx.fill();
  if(selected||hovered){
   ctx.setLineDash([2,6]);ctx.strokeStyle='rgba('+hue+',.8)';
   ctx.beginPath();ctx.arc(p.x,p.y,radius+10,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  }
  ctx.restore();
  if(selected||hovered||observed||core||state.showAllLabels||state.zoom>1.48)
   labels.push({node,p,radius,selected,hovered,observed,priority:selected?100:hovered?92:observed?75:core?55:10});
 }
 // Region titles derive their counts from the live module registry.
 if(canvasW>500){
  const occupied=[];
  for(const group of [...new Set(nodes.map(n=>n.group))]){
   if(state.focusGroup!=='all'&&state.focusGroup!==group)continue;
   const pp=nodes.filter(n=>n.group===group).map(n=>project(n.id));
   if(!pp.length)continue;
   const hue=V4_COLORS[group]||'150,190,230';
   const label=(V4_GROUPS[group]||group)+'  /  '+pp.length;
   ctx.font='600 10px system-ui';const w=ctx.measureText(label).width+20;
   const x=Math.max(7,Math.min(canvasW-w-7,Math.min(...pp.map(p=>p.x))-14));
   const y=Math.max(42,Math.min(canvasH-30,Math.min(...pp.map(p=>p.y))-33));
   // Region headings are metadata; never overlap a prominent module label.
   const prominent=nodes.filter(n=>ANCHORS.has(n.id)).map(n=>project(n.id));
   if(prominent.some(p=>p.x>=x-18&&p.x<=x+w+18&&p.y>=y-26&&p.y<=y+35))continue;
   if(occupied.some(b=>x<b.x+b.w+7&&x+w+7>b.x&&y<b.y+30&&y+30>b.y))continue;
   occupied.push({x,y,w});
   ctx.fillStyle='rgba(6,15,29,.85)';v4Round(x,y,w,24,8);ctx.fill();
   ctx.strokeStyle='rgba('+hue+',.37)';ctx.lineWidth=.7;ctx.stroke();
   ctx.fillStyle='rgba('+hue+',.87)';ctx.fillText(label,x+10,y+16);
  }
 }
 const placed=[];labels.sort((a,b)=>b.priority-a.priority);
 for(const it of labels){
  const {node,p,radius,selected,hovered,observed}=it;
  if(!inLens(node.id)&&!selected)continue;
  const font=13;ctx.font=(selected?'700 ':'600 ')+font+'px system-ui';
  const label=v4FitText(node.label);
  const w=ctx.measureText(label).width+22,h=31;
  const tries=[[radius+9,-h/2],[-radius-w-9,-h/2],[radius+9,17],[-radius-w-9,17]];
  let box=null;
  for(const [dx,dy] of tries){
   const x=p.x+dx,y=p.y+dy;
   if(x<7||x+w>canvasW-7||y<43||y+h>canvasH-7)continue;
   if(placed.some(b=>x<b.x+b.w+8&&x+w+8>b.x&&y<b.y+b.h+8&&y+h+8>b.y))continue;
   box={x,y,w,h};break;
  }
  if(!box)continue;placed.push(box);
  const hue=observed?'104,255,223':selected?'255,205,134':V4_COLORS[node.group]||'156,188,232';
  ctx.fillStyle='rgba(7,14,27,.96)';v4Round(box.x,box.y,w,h,8);ctx.fill();
  ctx.strokeStyle='rgba('+hue+','+(selected?.95:observed?.7:.4)+')';ctx.lineWidth=selected?1.4:.8;ctx.stroke();
  ctx.fillStyle='rgba('+hue+',.95)';ctx.fillRect(box.x+2,box.y+7,2,h-14);
  ctx.fillStyle=selected?'#fff4d9':'#ebf2ff';ctx.fillText(label,box.x+12,box.y+20);
 }
 ctx.restore();
 if(edges.some(e=>e.signal_recent===true&&Date.now()-Date.parse(e.last_observed_at||'')<1650)||replaying||(!reduced&&!document.hidden&&(state.v5Pulses||[]).length))scheduleDraw();
}
`;
