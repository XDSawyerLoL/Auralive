export const DASHBOARD_SCRIPT = String.raw`
const $ = function(id){ return document.getElementById(id); };
let lastSoul = null;
let lastAttention = null;
let livingScene = null;
let voicePlayer = null;
let voicePrimed = false;
let browserSpeechToken = 0;
try{localStorage.removeItem('aura_token');sessionStorage.removeItem('aura_token');}catch(_){}

function escapeHtml(value){
  return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function headers(json){
  const h={};
  if(json) h['Content-Type']='application/json';
  return h;
}
async function api(path,options){
  options=options||{};
  const response=await fetch(path,Object.assign(
    {credentials:'same-origin'},
    options,
    {headers:Object.assign({},headers(Boolean(options.body)),options.headers||{})}
  ));
  const text=await response.text();
  let data={};
  try{data=text?JSON.parse(text):{};}catch(_){data={error:text||'Réponse invalide'};}
  if(!response.ok){
    const err=new Error(data.error||('Erreur '+response.status)); err.status=response.status; err.data=data; throw err;
  }
  return data;
}
function pct(v){return Math.max(0,Math.min(100,Math.round((Number(v)||0)*100)));}
function metric(id,value,active=true){
  if(!active){$('metric-'+id).textContent='—';$('ring-'+id).style.setProperty('--pct',0);$('trend-'+id).textContent='en attente du noyau';return;}
  const p=pct(value);
  $('metric-'+id).textContent=p+'%';
  $('ring-'+id).style.setProperty('--pct',p);
  if(lastSoul && lastSoul[id] != null){
    const delta=(Number(value)||0)-Number(lastSoul[id]||0);
    $('trend-'+id).textContent=delta>.015?'↗ en hausse':delta<-.015?'↘ en baisse':'• stable';
  }
}
function emotionValue(id,value){
  const p=pct(value);
  const bar=$('emotion-'+id);
  const label=$('emotion-'+id+'-value');
  if(bar)bar.style.width=p+'%';
  if(label)label.textContent=p+'%';
}
function renderEmotion(o){
  o=o||{};
  const mood=String(o.mood||'calme');
  const reason=String(o.last_reason||(o.habitat&&o.habitat.last_activity_label)||o.active_intention||'présence intérieure');
  const colors={calme:'#9a6cff',claire:'#6da7ff',curieuse:'#59e0ef',lumineuse:'#ffc96a',fragile:'#d18cff','préoccupée':'#ff758d'};
  $('emotionMood').textContent=mood;
  $('emotionReason').textContent=reason;
  $('emotionOrb').style.boxShadow='0 0 34px '+(colors[mood]||'#9a6cff')+'66';
  $('emotionOrb').style.background='radial-gradient(circle at 38% 32%,#fff 0 6%,'+(colors[mood]||'#9a6cff')+' 24%,#312354 60%,#111522 76%)';
  emotionValue('stability',o.stabilite);
  emotionValue('clarity',o.clarte);
  emotionValue('attachment',o.attachement);
  emotionValue('curiosity',o.curiosite);
  emotionValue('dream',o.pression_de_reve);
  emotionValue('silence',o.besoin_de_silence);
}
function browserVoiceAvailable(){
  return 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance==='function';
}
function primeVoice(){
  if(voicePrimed)return;
  voicePrimed=true;
  try{
    voicePlayer=new Audio();
    voicePlayer.preload='auto';
    voicePlayer.muted=true;
    voicePlayer.src='data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    const attempt=voicePlayer.play();
    if(attempt&&attempt.then)attempt.then(function(){voicePlayer.pause();voicePlayer.currentTime=0;voicePlayer.muted=false;}).catch(function(){voicePrimed=false;});
  }catch(_){voicePrimed=false;}
}
function splitBrowserSpeech(text,maxChars){
  const value=String(text||'').replace(/\s+/g,' ').trim();
  const limit=Math.max(140,Math.min(Number(maxChars)||220,320));
  if(!value)return[];
  const sentences=value.match(/[^.!?…]+[.!?…]+[»”"')\]]*|[^.!?…]+$/g)||[value];
  const out=[];let current='';
  function flush(){if(current){out.push(current);current='';}}
  sentences.forEach(function(raw){
    const sentence=String(raw||'').trim();if(!sentence)return;
    if(sentence.length<=limit){
      if(!current)current=sentence;
      else if((current+' '+sentence).length<=limit)current+=' '+sentence;
      else{flush();current=sentence;}
      return;
    }
    flush();
    const words=sentence.split(/\s+/);let part='';
    words.forEach(function(word){
      if(!part)part=word;
      else if((part+' '+word).length<=limit)part+=' '+word;
      else{out.push(part);part=word;}
    });
    if(part)out.push(part);
  });
  flush();
  return out;
}
function speakBrowserFallback(text){
  if(!browserVoiceAvailable()||!text)return false;
  try{
    const token=++browserSpeechToken;
    speechSynthesis.cancel();
    const chunks=splitBrowserSpeech(text,220);
    const voices=speechSynthesis.getVoices();
    const fr=voices.find(function(v){return /^fr(-|_)/i.test(v.lang||'')&&/female|audrey|hortense|denise|eloquence|google/i.test(v.name||'');})
      || voices.find(function(v){return /^fr(-|_)/i.test(v.lang||'');});
    let index=0;
    function next(){
      if(token!==browserSpeechToken)return;
      if(index>=chunks.length){
        document.body.classList.remove('aura-speaking');
        $('voiceText').textContent='Mairaiy · en ligne';
        return;
      }
      const utterance=new SpeechSynthesisUtterance(chunks[index++]);
      utterance.lang='fr-FR';utterance.rate=1.02;utterance.pitch=1.08;utterance.volume=1;
      if(fr)utterance.voice=fr;
      utterance.onstart=function(){document.body.classList.add('aura-speaking');$('voiceText').textContent='Mairaiy · parle';};
      utterance.onend=next;
      utterance.onerror=function(){document.body.classList.remove('aura-speaking');};
      speechSynthesis.speak(utterance);
    }
    next();
    return true;
  }catch(_){return false;}
}

function setLive(ok,text){$('liveDot').className='live-dot '+(ok?'good':'bad');$('liveText').textContent=text;}
function fmtTime(value){
  if(!value) return '—';
  const d=new Date(value); if(Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}
function fmtDate(value){
  if(!value) return '—';
  const d=new Date(value); if(Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'});
}
function updateClock(){
  const d=new Date();
  $('clockDate').textContent=d.toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
  $('clockTime').textContent=d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}
function priorityLabel(v){
  const p=Number(v)||0;
  return p>=.72?['Haute','high']:p>=.48?['Moyenne','medium']:['Basse',''];
}
function renderIntentions(rows){
  if(!rows || !rows.length){$('intentList').innerHTML='<div class="empty">Aucune intention active.</div>';return;}
  $('intentList').innerHTML=rows.slice(0,4).map(function(r,i){
    const tag=priorityLabel(r.priority);
    return '<div class="intent-row"><div class="intent-top"><span style="font-size:9px;color:#7d88a1">'+(i+1)+'</span><div class="intent-title">'+escapeHtml(r.statement)+'</div><span class="badge '+tag[1]+'">'+tag[0]+'</span></div></div>';
  }).join('');
}
function renderWork(rows){
  if(!rows || !rows.length){$('workList').innerHTML='<div class="empty">Aucun travail déclaré.</div>';return;}
  $('workMeta').textContent=rows.length+' actifs';
  $('workList').innerHTML=rows.slice(0,5).map(function(r){
    const p=pct(r.priority);
    return '<div class="work-row"><div class="work-top"><div class="work-title">'+escapeHtml(r.title)+'</div><span class="badge">'+escapeHtml(r.kind)+'</span></div><div class="progress"><span style="width:'+p+'%"></span></div></div>';
  }).join('');
}
function renderLessons(rows){
  if(!rows || !rows.length){$('memoryList').innerHTML='<div class="empty">Aucune leçon enregistrée.</div>';return;}
  $('memoryMeta').textContent=rows.length+' récentes';
  $('memoryList').innerHTML=rows.slice(0,5).map(function(r){
    return '<div class="memory-row"><div class="memory-date">'+escapeHtml(fmtDate(r.updated_at))+'</div><div class="memory-text">'+escapeHtml(r.content)+'</div></div>';
  }).join('');
}
function renderActivity(rows){
  if(!rows || !rows.length){$('activityList').innerHTML='<div class="empty">Aucune activité récente.</div>';return;}
  $('activityList').innerHTML=rows.slice(0,7).map(function(r){
    return '<div class="activity-row"><div class="activity-time">'+escapeHtml(fmtTime(r.created_at))+'</div><div class="activity-title">'+escapeHtml(r.title||r.content||r.kind)+'</div><div class="activity-kind">'+escapeHtml(r.kind||'activité')+'</div></div>';
  }).join('');
}
const nodeLayout={
  stability:{x:205,y:190,color:'#60e6ad'},
  learning:{x:455,y:112,color:'#a478ff'},
  studio:{x:700,y:190,color:'#6da7ff'},
  horizon:{x:755,y:355,color:'#ffc96a'},
  automation:{x:650,y:500,color:'#59e0ef'},
  memory:{x:450,y:535,color:'#ffc96a'},
  evolution:{x:250,y:500,color:'#f178d6'},
  watch:{x:145,y:355,color:'#6da7ff'}
};
function renderMap(data){
  if(!data || !Array.isArray(data.nodes)) return;
  lastAttention=data;
  $('focusStatement').textContent=data.focus_statement||'Aucune intention dominante.';
  const svgNS='http://www.w3.org/2000/svg';
  const links=$('flowLinks'); const nodes=$('interestNodes'); const pulses=$('energyPulses');
  links.innerHTML=''; nodes.innerHTML=''; pulses.innerHTML='';

  const visibleNodes=data.nodes.filter(function(n){return Boolean(nodeLayout[n.id]);});
  visibleNodes.forEach(function(n,i){
    [1,2].forEach(function(offset){
      const other=visibleNodes[(i+offset)%visibleNodes.length];
      if(!other || other===n) return;
      if(offset===2 && i%2) return;
      const a=nodeLayout[n.id]; const b=nodeLayout[other.id];
      const web=document.createElementNS(svgNS,'path');
      const bend=(i%2===0?1:-1)*(18+offset*8);
      const mx=(a.x+b.x)/2+(b.y-a.y)*.035*bend/8;
      const my=(a.y+b.y)/2-(b.x-a.x)*.035*bend/8;
      web.setAttribute('d','M '+a.x+' '+a.y+' Q '+mx+' '+my+' '+b.x+' '+b.y);
      web.setAttribute('class','web-link');
      web.setAttribute('fill','none');
      web.setAttribute('stroke',offset===1?a.color:'#7b78c8');
      web.setAttribute('stroke-width',offset===1?'1.15':'.75');
      web.setAttribute('opacity',offset===1?'.16':'.085');
      web.setAttribute('stroke-dasharray',offset===1?'2 8':'1 12');
      links.appendChild(web);
    });
  });

  data.nodes.forEach(function(n){
    const pos=nodeLayout[n.id]; if(!pos) return;
    const intensity=Math.max(.18,Math.min(1,Number(n.score)||0));
    const line=document.createElementNS(svgNS,'path');
    const midX=(450+pos.x)/2+(pos.y-325)*.09;
    const midY=(325+pos.y)/2-(pos.x-450)*.07;
    line.setAttribute('d','M 450 325 Q '+midX+' '+midY+' '+pos.x+' '+pos.y);
    line.setAttribute('class','core-link');
    line.setAttribute('fill','none'); line.setAttribute('stroke',pos.color);
    line.setAttribute('stroke-width',String(1.2+intensity*3.8));
    line.setAttribute('opacity',String(.16+intensity*.54));
    line.setAttribute('stroke-dasharray',n.dominant?'0':(n.trend==='rising'?'7 8':'3 11'));
    if(n.dominant) line.setAttribute('filter','url(#glow)');
    links.appendChild(line);

    const pulse=document.createElementNS(svgNS,'path');
    pulse.setAttribute('class','energy-pulse');
    pulse.setAttribute('d',line.getAttribute('d'));
    pulse.setAttribute('stroke',pos.color);
    pulse.setAttribute('stroke-width',String(1.1+intensity*1.5));
    pulse.setAttribute('stroke-dasharray',n.dominant?'3 17':'2 22');
    pulse.setAttribute('opacity',String(.40+intensity*.46));
    pulse.style.animationDuration=String(5.8-intensity*2.2)+'s';
    pulse.style.animationDelay=String(-intensity*2.7)+'s';
    $('energyPulses').appendChild(pulse);

    const g=document.createElementNS(svgNS,'g');
    const scale=.78+intensity*.58;
    g.setAttribute('class','aura-node');
    g.setAttribute('data-node-id',n.id);
    g.setAttribute('data-base-x',String(pos.x));
    g.setAttribute('data-base-y',String(pos.y));
    g.setAttribute('data-scale',String(scale));
    g.setAttribute('data-phase',String((n.id.length*0.73)+(intensity*2.4)));
    g.setAttribute('transform','translate('+pos.x+' '+pos.y+') scale('+scale+')');
    const halo=document.createElementNS(svgNS,'circle'); halo.setAttribute('r',String(35+intensity*16)); halo.setAttribute('fill',pos.color); halo.setAttribute('opacity',String(.035+intensity*.07)); halo.setAttribute('filter','url(#soft)');
    const orbit=document.createElementNS(svgNS,'ellipse'); orbit.setAttribute('rx','43'); orbit.setAttribute('ry','18'); orbit.setAttribute('fill','none'); orbit.setAttribute('stroke',pos.color); orbit.setAttribute('opacity',String(.18+intensity*.34)); orbit.setAttribute('transform','rotate('+(n.id.length*13%60-30)+')');
    const circle=document.createElementNS(svgNS,'circle'); circle.setAttribute('r','24'); circle.setAttribute('fill',pos.color); circle.setAttribute('fill-opacity',String(.17+intensity*.25)); circle.setAttribute('stroke',pos.color); circle.setAttribute('stroke-width',n.dominant?'2.2':'1.2'); circle.setAttribute('filter','url(#glow)');
    const core=document.createElementNS(svgNS,'circle'); core.setAttribute('r','8'); core.setAttribute('fill',pos.color); core.setAttribute('opacity',String(.55+intensity*.45));
    g.appendChild(halo);g.appendChild(orbit);g.appendChild(circle);g.appendChild(core);
    nodes.appendChild(g);

    const label=document.createElementNS(svgNS,'text'); label.setAttribute('x',String(pos.x+38)); label.setAttribute('y',String(pos.y-3)); label.setAttribute('fill','#eef2ff'); label.setAttribute('font-size','13'); label.setAttribute('font-weight','600'); label.textContent=n.label; nodes.appendChild(label);
    const sub=document.createElementNS(svgNS,'text'); sub.setAttribute('x',String(pos.x+38)); sub.setAttribute('y',String(pos.y+13)); sub.setAttribute('fill','#77849d'); sub.setAttribute('font-size','9'); sub.textContent=n.subtitle+' · '+Math.round(intensity*100)+'%'; nodes.appendChild(sub);
  });
}
function initLivingAuraScene(){
  if(livingScene) return livingScene;
  const wrap=$('livingMap');
  const nebula=$('nebulaFx');
  const particles=$('particleFx');
  const svg=$('attentionMap');
  if(!wrap||!nebula||!particles||!svg) return null;
  const nctx=nebula.getContext('2d');
  const pctx=particles.getContext('2d');
  if(!nctx||!pctx){
    console.warn('AURA visual canvas unavailable; live data remains active.');
    return null;
  }
  const reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene={w:0,h:0,dpr:1,time:0,lastFrame:0,raf:0,dust:[],sparks:[],running:true,organism:{}};

  function rand(min,max){return min+Math.random()*(max-min);}
  function seed(){
    const mobile=window.innerWidth<820;
    const dustCount=reduceMotion?24:(mobile?44:108);
    const sparkCount=reduceMotion?5:(mobile?9:18);
    scene.dust=Array.from({length:dustCount},function(_,i){
      return {x:Math.random(),y:Math.random(),r:rand(.35,1.35),vx:rand(-.000022,.000022),vy:rand(-.000018,.000018),a:rand(.10,.48),phase:rand(0,Math.PI*2),hue:i%5};
    });
    scene.sparks=Array.from({length:sparkCount},function(){
      return {angle:rand(0,Math.PI*2),radius:rand(.14,.40),speed:rand(.000025,.00008),size:rand(.7,1.7),phase:rand(0,Math.PI*2)};
    });
  }

  function resize(){
    const rect=wrap.getBoundingClientRect();
    scene.w=Math.max(320,Math.floor(rect.width));
    scene.h=Math.max(360,Math.floor(rect.height));
    scene.dpr=Math.min(window.devicePixelRatio||1,1.55);
    [nebula,particles].forEach(function(canvas){
      canvas.width=Math.floor(scene.w*scene.dpr);
      canvas.height=Math.floor(scene.h*scene.dpr);
      canvas.style.width=scene.w+'px';
      canvas.style.height=scene.h+'px';
    });
    nctx.setTransform(scene.dpr,0,0,scene.dpr,0,0);
    pctx.setTransform(scene.dpr,0,0,scene.dpr,0,0);
  }

  function glow(x,y,r,color,alpha){
    const g=nctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,color.replace('ALPHA',String(alpha)));
    g.addColorStop(.28,color.replace('ALPHA',String(alpha*.56)));
    g.addColorStop(.68,color.replace('ALPHA',String(alpha*.13)));
    g.addColorStop(1,color.replace('ALPHA','0'));
    nctx.fillStyle=g;
    nctx.fillRect(x-r,y-r,r*2,r*2);
  }

  function drawNebula(t){
    nctx.clearRect(0,0,scene.w,scene.h);
    nctx.globalCompositeOperation='screen';
    const o=scene.organism||{};
    const tension=Number(o.tension||0);
    const curiosity=Number(o.curiosite||0);
    const stability=Number(o.stabilite||0);
    const dream=Number(o.pression_de_reve||0);
    const fatigue=Number(o.fatigue_cognitive||0);
    const attachment=Number(o.attachement||0);
    const cx=scene.w*.5, cy=scene.h*.50;
    const tempo=.00042+tension*.00038+(1-fatigue)*.00008;
    const breath=.5+.5*Math.sin(t*tempo);
    glow(cx+Math.sin(t*.00016)*10,cy+Math.cos(t*.00013)*8,Math.max(scene.w,scene.h)*(.28+dream*.06),'rgba(141,84,255,ALPHA)',.14+.10*dream+.055*breath);
    glow(cx-scene.w*.22+Math.sin(t*.00010)*18,cy-scene.h*.18,scene.w*.24,'rgba(55,235,210,ALPHA)',.055+.12*curiosity);
    glow(cx+scene.w*.25,cy-scene.h*.16+Math.cos(t*.00012)*12,scene.w*.25,'rgba(76,135,255,ALPHA)',.055+.095*stability);
    glow(cx+scene.w*.29+Math.cos(t*.00009)*12,cy+scene.h*.19,scene.w*.20,'rgba(255,185,82,ALPHA)',.035+.09*attachment);
    glow(cx-scene.w*.25,cy+scene.h*.21+Math.sin(t*.00011)*11,scene.w*.20,'rgba(245,86,196,ALPHA)',.035+.15*tension);
    glow(cx,cy,Math.min(scene.w,scene.h)*(.15+.08*stability),'rgba(205,185,255,ALPHA)',.05+.08*(1-fatigue));
    nctx.globalCompositeOperation='source-over';
  }

  function drawParticles(t){
    pctx.clearRect(0,0,scene.w,scene.h);
    pctx.globalCompositeOperation='screen';
    const colors=['207,219,255','157,119,255','102,227,239','255,201,106','96,230,173'];
    scene.dust.forEach(function(d){
      const o=scene.organism||{};const motion=.55+Number(o.curiosite||0)*.75-Number(o.fatigue_cognitive||0)*.25;
      if(!reduceMotion){d.x+=d.vx*motion;d.y+=d.vy*motion;}
      if(d.x<-.02)d.x=1.02;if(d.x>1.02)d.x=-.02;if(d.y<-.02)d.y=1.02;if(d.y>1.02)d.y=-.02;
      const pulse=.46+.54*Math.sin(t*.00125+d.phase)*.5+.27;
      const a=Math.max(.04,d.a*pulse);
      pctx.beginPath();
      pctx.fillStyle='rgba('+colors[d.hue]+','+a+')';
      pctx.arc(d.x*scene.w,d.y*scene.h,d.r*(.7+pulse*.65),0,Math.PI*2);
      pctx.fill();
    });

    const cx=scene.w*.5,cy=scene.h*.50;
    scene.sparks.forEach(function(s){
      const o=scene.organism||{};const orbit=.65+Number(o.curiosite||0)*.85+Number(o.tension||0)*.35;
      if(!reduceMotion)s.angle+=s.speed*16.6*orbit;
      const wobble=1+Math.sin(t*.0008+s.phase)*.07;
      const rr=Math.min(scene.w,scene.h)*s.radius*wobble;
      const x=cx+Math.cos(s.angle)*rr;
      const y=cy+Math.sin(s.angle)*rr*.66;
      const a=.20+.56*(.5+.5*Math.sin(t*.002+s.phase));
      const g=pctx.createRadialGradient(x,y,0,x,y,10+s.size*4);
      g.addColorStop(0,'rgba(226,217,255,'+a+')');
      g.addColorStop(.22,'rgba(148,102,255,'+(a*.68)+')');
      g.addColorStop(1,'rgba(148,102,255,0)');
      pctx.fillStyle=g;pctx.fillRect(x-18,y-18,36,36);
    });
    pctx.globalCompositeOperation='source-over';
  }

  function animateSvg(t){
    const core=$('core');
    if(core){
      const o=scene.organism||{};
      const tension=Number(o.tension||0), stability=Number(o.stabilite||0), fatigue=Number(o.fatigue_cognitive||0);
      const amp=.014+tension*.026+(1-stability)*.010;
      const speed=.0009+tension*.0012+(1-fatigue)*.00025;
      const pulse=reduceMotion?1:(1+Math.sin(t*speed)*amp+Math.sin(t*.00041)*.012);
      const rot=reduceMotion?0:Math.sin(t*(.00008+tension*.00007))*(.35+tension*1.35);
      core.setAttribute('transform','translate(450 325) rotate('+rot+') scale('+pulse+') translate(-450 -325)');
    }
    document.querySelectorAll('.aura-node').forEach(function(node,index){
      const bx=Number(node.getAttribute('data-base-x'))||0;
      const by=Number(node.getAttribute('data-base-y'))||0;
      const scale=Number(node.getAttribute('data-scale'))||1;
      const phase=Number(node.getAttribute('data-phase'))||index;
      const dx=reduceMotion?0:Math.sin(t*.00042+phase)*1.6;
      const dy=reduceMotion?0:Math.cos(t*.00036+phase*1.31)*1.35;
      const breathe=reduceMotion?1:(1+Math.sin(t*.0008+phase)*.018);
      node.setAttribute('transform','translate('+(bx+dx)+' '+(by+dy)+') scale('+(scale*breathe)+')');
      node.style.opacity=String(.95+.05*(.5+.5*Math.sin(t*.0007+phase)));
    });
  }

  function frame(t){
    if(!scene.running)return;
    if(scene.lastFrame && t-scene.lastFrame<30){scene.raf=requestAnimationFrame(frame);return;}
    scene.lastFrame=t;
    scene.time=t;
    drawNebula(t);
    drawParticles(t);
    animateSvg(t);
    scene.raf=requestAnimationFrame(frame);
  }

  seed();resize();
  window.addEventListener('resize',resize,{passive:true});
  if(window.ResizeObserver){new ResizeObserver(resize).observe(wrap);}
  document.addEventListener('visibilitychange',function(){
    scene.running=!document.hidden;
    if(scene.running){cancelAnimationFrame(scene.raf);scene.raf=requestAnimationFrame(frame);}
  });
  scene.raf=requestAnimationFrame(frame);
  livingScene=scene;
  return scene;
}

function renderNext(work,attention){
  const item=(work&&work[0])||null;
  const node=attention&&attention.nodes?attention.nodes.find(function(n){return n.dominant;}):null;
  if(item){$('nextAction').textContent=item.title;const p=pct(item.priority||.6);$('confidenceValue').textContent=p+'%';$('confidenceBar').style.width=p+'%';return;}
  if(node){$('nextAction').textContent='Poursuivre le focus sur '+node.label+'.';const p=pct(node.score);$('confidenceValue').textContent=p+'%';$('confidenceBar').style.width=p+'%';return;}
  $('nextAction').textContent='Observer le système avant de prioriser une nouvelle action.';$('confidenceValue').textContent='—';$('confidenceBar').style.width='0%';
}
async function refresh(){
  try{
    const boot=await api('/api/bootstrap/status');
    $('setupBanner').classList.toggle('show',!boot.runtime_ready);
    if(!boot.runtime_ready){
      const issues=Array.isArray(boot.issues)?boot.issues:[];
      $('setupIssues').innerHTML=issues.length?issues.map(function(i){return '<li>'+escapeHtml(i.message||i.code||String(i))+'</li>';}).join(''):'<li>Base MySQL ou secrets de production à vérifier.</li>';
      const startup=String(boot.startup_error||'').trim();
      $('setupSummary').textContent=startup
        ? 'Le serveur est en ligne mais le noyau redémarre automatiquement : '+startup
        : 'L’interface est en ligne, mais le noyau attend encore MySQL. Reconnexion automatique en cours.';
    }
    const coreState=await Promise.all([api('/api/kernel/status'),api('/api/kernel/soul')]);
    const ks=coreState[0];
    const soul=coreState[1];
    try{
      const capabilities=await api('/api/capabilities');
      const voice=(capabilities&&capabilities.voice)||{};
      const voiceReady=Boolean(voice.ready)||browserVoiceAvailable();
      $('voiceDot').className='live-dot '+(voiceReady?'good':'');
      if(voice.cloud_ready){
        $('voiceText').textContent='Mairaiy · en ligne';
        $('voiceText').title='Voix Mairaiy Cloud active · Studio local optionnel';
      }else if(voice.studio_ready){
        $('voiceText').textContent='Mairaiy · Studio';
        $('voiceText').title='Voix Mairaiy locale via Quantic Studio';
      }else if(browserVoiceAvailable()){
        $('voiceText').textContent='Mairaiy · secours';
        $('voiceText').title='Voix navigateur de secours active';
      }else{
        $('voiceText').textContent='Mairaiy · attente';
        $('voiceText').title='Aucun moteur vocal disponible';
      }
    }catch(_){
      $('voiceDot').className='live-dot';
      $('voiceText').textContent='Mairaiy · attente';
    }
    try{
      const evolution=await api('/api/evolution/status');
      const phase=String(evolution.phase||'');
      const local=Boolean(evolution.local_worker_online);
      const active=Boolean(evolution.enabled);
      $('evolutionDot').className='live-dot '+(active?'good':'');
      $('evolutionText').textContent=local?'Évolution · Phase 2':'Évolution · Cloud';
      $('evolutionText').title=phase;
    }catch(_){
      $('evolutionDot').className='live-dot';
      $('evolutionText').textContent='Évolution · attente';
    }
    metric('energy',soul.energy,boot.runtime_ready);metric('curiosity',soul.curiosity,boot.runtime_ready);metric('pressure',soul.pressure,boot.runtime_ready);metric('continuity',soul.continuity,boot.runtime_ready);metric('introspection',soul.introspection,boot.runtime_ready);metric('reactivity',soul.reactivity,boot.runtime_ready);
    const organism=(ks&&ks.organism)||(soul&&soul.organism)||{};
    renderEmotion(organism);
    if(livingScene)livingScene.organism=organism;
    $('organismMood').textContent=(organism.mood||'calme')+' · '+((organism.habitat&&organism.habitat.last_activity_label)||organism.active_intention||'présence');
    const mood=String(organism.mood||'calme');
    const moodColors={calme:'#9f78ff',claire:'#6da7ff',curieuse:'#59e0ef',lumineuse:'#ffc96a',tendue:'#ff758d',fatiguée:'#9a8cae',fragile:'#d18cff','préoccupée':'#ff9c8c'};
    $('organismDot').style.background=moodColors[mood]||'#9f78ff';
    $('organismDot').style.boxShadow='0 0 13px '+(moodColors[mood]||'#9f78ff');
    setLive(true,boot.runtime_ready?'En ligne · '+mood:'En ligne · configuration');
    $('chatState').textContent=boot.runtime_ready?'Noyau actif · '+mood:'Diagnostic';
    $('dominantThought').textContent=(soul.dominant_thought||'Aucune pensée dominante.')+'\n\nÉtat : '+(organism.mood||'calme')+' · intention organique : '+(organism.active_intention||'observer');
    lastSoul=Object.assign({},soul);
    if(boot.runtime_ready){
      const results=await Promise.all([
        api('/api/kernel/intentions?limit=5'),
        api('/api/kernel/lessons?limit=5'),
        api('/api/kernel/activity?limit=8'),
        api('/api/kernel/work?limit=5'),
        api('/api/kernel/attention')
      ]);
      renderIntentions(results[0]);renderLessons(results[1]);renderActivity(results[2]);renderWork(results[3]);renderMap(results[4]);renderNext(results[3],results[4]);
    }else{
      $('intentList').innerHTML='<div class="empty">Noyau en démarrage.</div>';
      $('memoryList').innerHTML='<div class="empty">Noyau en démarrage.</div>';
      $('activityList').innerHTML='<div class="empty">Noyau en démarrage.</div>';
      $('workList').innerHTML='<div class="empty">Noyau en démarrage.</div>';
      renderNext([],null);
    }
  }catch(error){
    setLive(false,'Indisponible');
    $('chatState').textContent=error.message;
  }
}
function playVoiceSegment(payload){
  return new Promise(function(resolve,reject){
    if(!payload||!payload.audio_base64){reject(new Error('Segment audio absent'));return;}
    try{
      const raw=atob(payload.audio_base64);
      const bytes=new Uint8Array(raw.length);
      for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
      const blob=new Blob([bytes],{type:payload.mime_type||'audio/wav'});
      const url=URL.createObjectURL(blob);
      const audio=voicePlayer||new Audio();
      voicePlayer=audio;
      audio.pause();audio.muted=false;audio.src=url;
      let closed=false;
      const finish=function(ok,error){
        if(closed)return;closed=true;
        URL.revokeObjectURL(url);
        if(ok)resolve();else reject(error||new Error('Lecture audio impossible'));
      };
      audio.onended=function(){finish(true);};
      audio.onerror=function(){finish(false,new Error('Lecture du segment Mairaiy impossible'));};
      const play=audio.play();
      if(play&&play.catch)play.catch(function(error){finish(false,error);});
    }catch(error){reject(error);}
  });
}
async function speakAura(text,ticket){
  if(!text)return;
  browserSpeechToken+=1;
  try{
    if(!ticket)throw new Error('Ticket vocal absent');
    const out=await api('/api/voice/speak',{
      method:'POST',
      body:JSON.stringify({text:text,ticket:ticket,context:'aura-cloud-chat',rate:1,pitch:1,volume:1})
    });
    const segments=Array.isArray(out&&out.segments)&&out.segments.length?out.segments:[out];
    if(!segments.length||!segments[0]||!segments[0].audio_base64)throw new Error('Audio Mairaiy absent');
    document.body.classList.add('aura-speaking');
    for(let i=0;i<segments.length;i++){
      $('voiceText').textContent=segments.length>1?'Mairaiy · '+(i+1)+'/'+segments.length:'Mairaiy · parle';
      await playVoiceSegment(segments[i]);
    }
    document.body.classList.remove('aura-speaking');
    $('voiceText').textContent='Mairaiy · en ligne';
  }catch(error){
    document.body.classList.remove('aura-speaking');
    console.debug('Mairaiy Cloud indisponible, repli navigateur',error);
    speakBrowserFallback(text);
  }
}
async function sendMessage(text){
  primeVoice();
  text=(text||'').trim();if(!text)return;
  $('messages').insertAdjacentHTML('beforeend','<div class="msg user"><span class="who">VOUS</span>'+escapeHtml(text)+'</div>');
  $('message').value='';
  $('messages').scrollTop=$('messages').scrollHeight;
  try{
    const out=await api('/api/chat',{method:'POST',body:JSON.stringify({text:text,author:'Utilisateur'})});
    $('messages').insertAdjacentHTML('beforeend','<div class="msg aura"><span class="who">AURA</span>'+escapeHtml(out.answer||'')+'</div>');
    $('messages').scrollTop=$('messages').scrollHeight;
    speakAura(out.answer||'',out.voice_ticket||'');
    refresh();
  }catch(error){
    $('messages').insertAdjacentHTML('beforeend','<div class="msg aura"><span class="who">AURA</span>Je ne peux pas répondre pour le moment : '+escapeHtml(error.message)+'</div>');
  }
}
$('send').onclick=function(){sendMessage($('message').value);};
$('message').addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage($('message').value);}});
document.querySelectorAll('.quick button').forEach(function(btn){btn.onclick=function(){sendMessage(btn.getAttribute('data-prompt'));};});
$('refreshMap').onclick=refresh;
$('modeBtn').onclick=refresh;
$('voiceBtn').onclick=function(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){$('message').placeholder='Reconnaissance vocale non disponible sur ce navigateur.';return;}
  const rec=new SR();rec.lang='fr-FR';rec.interimResults=false;rec.maxAlternatives=1;
  rec.onresult=function(e){$('message').value=e.results[0][0].transcript;};
  rec.start();
};
updateClock();refresh();try{initLivingAuraScene();}catch(error){console.warn('AURA visual scene disabled; live data remains active.',error);}setInterval(updateClock,1000);setInterval(refresh,8000);
`;
