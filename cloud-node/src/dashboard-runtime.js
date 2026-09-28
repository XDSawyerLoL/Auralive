export const DASHBOARD_SCRIPT = String.raw`
const $ = function(id){ return document.getElementById(id); };
let lastSoul = null;
let lastAttention = null;
let livingScene = null;
let neuralField = null;
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
const neuralPalette={
  core:'#b490ff',
  regulation:'#62e1b2',
  perception:'#5ee4f0',
  memory:'#ffc96a',
  cognition:'#a883ff',
  agency:'#f178d6',
  infrastructure:'#6da7ff',
  ecosystem:'#9a86ff',
  fabric:'#7fc7ff'
};
function hash01(value){
  let h=2166136261;
  const s=String(value||'');
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0)/4294967295;
}
function selfText(value){
  return String(value||'')
    .replace(/Je viens de recevoir un signal direct\s*:/gi,'J’ai intégré un nouveau contexte interne :')
    .replace(/Je le rattache à mon état et à mes intentions avant de répondre\.?/gi,'Je l’évalue avant de décider s’il devient une intention.')
    .replace(/ce qu’AURA peut/gi,'ce que je peux')
    .replace(/AURA doit/gi,'je dois')
    .replace(/AURA peut/gi,'je peux')
    .replace(/AURA veut/gi,'je veux')
    .replace(/AURA est/gi,'je suis')
    .replace(/pour AURA/gi,'pour moi')
    .replace(/\s+/g,' ')
    .trim();
}
function initNeuralField(data){
  const old=neuralField&&neuralField.nodes?neuralField:null;
  const oldById={};
  if(old) old.nodes.forEach(function(n){oldById[n.id]=n;});
  const nodes=(data.nodes||[]).map(function(source,index){
    if(source.id==='aura'){
      return Object.assign({},source,{x:450,y:325,vx:0,vy:0,fixed:true});
    }
    const prior=oldById[source.id];
    if(prior){
      return Object.assign({},source,{x:prior.x,y:prior.y,vx:prior.vx||0,vy:prior.vy||0,fixed:false});
    }
    const role=String(source.role||'capability');
    const seed=hash01(source.id);
    const seed2=hash01(source.id+':y');
    let radius=125+seed*85;
    if(role==='product') radius=250+seed*42;
    if(role==='fabric-capability') radius=205+seed*32;
    const angle=seed*Math.PI*2+index*.31;
    return Object.assign({},source,{
      x:450+Math.cos(angle)*radius+(seed2-.5)*22,
      y:325+Math.sin(angle)*radius*.72+(seed-.5)*14,
      vx:0,vy:0,fixed:false
    });
  });
  const byId={};nodes.forEach(function(n){byId[n.id]=n;});
  const links=(data.links||[]).map(function(edge){
    return Object.assign({},edge,{a:byId[edge.source],b:byId[edge.target]});
  }).filter(function(edge){return edge.a&&edge.b;});
  neuralField={nodes:nodes,links:links,byId:byId};
  return neuralField;
}
function neuralStep(field){
  const nodes=field.nodes,links=field.links;
  // Repulsion: prevents visual clumps and lets functional assemblies form naturally.
  for(let i=0;i<nodes.length;i++){
    const a=nodes[i]; if(a.fixed) continue;
    for(let j=i+1;j<nodes.length;j++){
      const b=nodes[j]; if(a===b) continue;
      let dx=a.x-b.x,dy=a.y-b.y;
      let d2=dx*dx+dy*dy;
      if(d2<25){dx+=(hash01(a.id+b.id)-.5)*7;dy+=(hash01(b.id+a.id)-.5)*7;d2=dx*dx+dy*dy;}
      const d=Math.sqrt(d2)||1;
      const min=(a.role==='product'||b.role==='product')?54:46;
      const strength=d<min?1.7:Math.min(.34,550/d2);
      const fx=(dx/d)*strength,fy=(dy/d)*strength;
      if(!a.fixed){a.vx+=fx;a.vy+=fy;}
      if(!b.fixed){b.vx-=fx;b.vy-=fy;}
    }
  }
  // Functional synapses attract related capabilities.
  links.forEach(function(edge){
    const a=edge.a,b=edge.b;
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.sqrt(dx*dx+dy*dy)||1;
    const weight=Math.max(.1,Math.min(1,Number(edge.weight)||.5));
    let target=92;
    if(a.role==='product'||b.role==='product') target=145;
    if(a.role==='fabric-capability'||b.role==='fabric-capability') target=118;
    if(a.id==='aura'||b.id==='aura') target=112;
    const force=(d-target)*(.0018+.0042*weight);
    const fx=(dx/d)*force,fy=(dy/d)*force;
    if(!a.fixed){a.vx+=fx;a.vy+=fy;}
    if(!b.fixed){b.vx-=fx;b.vy-=fy;}
  });
  nodes.forEach(function(n){
    if(n.fixed){n.x=450;n.y=325;n.vx=0;n.vy=0;return;}
    // Soft orbital constraints by role: products remain peripheral, cognition remains closer.
    const dx=n.x-450,dy=n.y-325,d=Math.sqrt(dx*dx+dy*dy)||1;
    let targetRadius=155;
    if(n.role==='product') targetRadius=285;
    else if(n.role==='fabric-capability') targetRadius=220;
    else if(n.domain==='infrastructure') targetRadius=205;
    const radial=(targetRadius-d)*.0013;
    n.vx+=(dx/d)*-radial;
    n.vy+=(dy/d)*-radial*.8;
    // Very mild gravity towards the living core.
    n.vx+=(450-n.x)*.00018;
    n.vy+=(325-n.y)*.00018;
    n.vx*=.83;n.vy*=.83;
    n.x+=n.vx;n.y+=n.vy;
    n.x=Math.max(45,Math.min(855,n.x));
    n.y=Math.max(50,Math.min(600,n.y));
  });
}
function settleNeuralField(field,iterations){
  for(let i=0;i<iterations;i++) neuralStep(field);
}
function renderMap(data){
  if(!data || !Array.isArray(data.nodes)) return;
  lastAttention=data;
  $('focusStatement').textContent=selfText(data.focus_statement)||'Aucune intention dominante.';
  const stats=$('mapStats');
  if(stats){
    const s=data.stats||{};
    stats.textContent=(s.nodes||data.nodes.length)+' neurones · '+(s.synapses||(data.links||[]).length)+' synapses';
  }
  const field=initNeuralField(data);
  settleNeuralField(field,90);

  const svgNS='http://www.w3.org/2000/svg';
  const links=$('flowLinks'),nodesLayer=$('interestNodes'),pulses=$('energyPulses');
  links.innerHTML='';nodesLayer.innerHTML='';pulses.innerHTML='';

  field.links.forEach(function(edge,index){
    const a=edge.a,b=edge.b;
    const weight=Math.max(.1,Math.min(1,Number(edge.weight)||.5));
    const line=document.createElementNS(svgNS,'line');
    line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);
    line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);
    line.setAttribute('class','neural-synapse');
    line.setAttribute('stroke',neuralPalette[a.domain]||'#8b7fd0');
    line.setAttribute('stroke-width',String(.45+weight*1.6));
    line.setAttribute('opacity',String(.07+weight*.25));
    links.appendChild(line);
    if(weight>.68 || a.dominant || b.dominant){
      const pulse=document.createElementNS(svgNS,'line');
      pulse.setAttribute('x1',a.x);pulse.setAttribute('y1',a.y);
      pulse.setAttribute('x2',b.x);pulse.setAttribute('y2',b.y);
      pulse.setAttribute('class','energy-pulse');
      pulse.setAttribute('stroke',neuralPalette[b.domain]||'#b490ff');
      pulse.setAttribute('stroke-width',String(.8+weight));
      pulse.setAttribute('stroke-dasharray','2 22');
      pulse.setAttribute('opacity',String(.24+weight*.44));
      pulse.style.animationDuration=String(6.2-weight*2.8)+'s';
      pulse.style.animationDelay=String(-index*.23)+'s';
      pulses.appendChild(pulse);
    }
  });

  field.nodes.forEach(function(n){
    const intensity=Math.max(.08,Math.min(1,Number(n.score)||0));
    const color=neuralPalette[n.domain]||neuralPalette.fabric;
    const role=String(n.role||'capability');
    const radius=n.id==='aura'?34:(role==='product'?5.4:role==='fabric-capability'?4.8:7+intensity*5.5);

    const g=document.createElementNS(svgNS,'g');
    g.setAttribute('class','neural-neuron'+(n.dominant?' dominant':''));
    g.setAttribute('transform','translate('+n.x+' '+n.y+')');
    g.setAttribute('data-node-id',n.id);

    const title=document.createElementNS(svgNS,'title');
    title.textContent=n.label+' · '+Math.round(intensity*100)+'%'+(n.status?' · '+n.status:'');
    g.appendChild(title);

    if(n.id!=='aura'){
      // Visual micro-neurons: decorative substrate attached to a real capability.
      // They add biological density without pretending to be extra semantic capabilities.
      const microCount=role==='product'?1:(2+Math.round(intensity*3));
      for(let m=0;m<microCount;m++){
        const angle=hash01(n.id+':micro:'+m)*Math.PI*2;
        const dist=radius+11+hash01(n.id+':dist:'+m)*18;
        const mx=Math.cos(angle)*dist,my=Math.sin(angle)*dist*.78;
        const dendrite=document.createElementNS(svgNS,'line');
        dendrite.setAttribute('x1','0');dendrite.setAttribute('y1','0');
        dendrite.setAttribute('x2',String(mx));dendrite.setAttribute('y2',String(my));
        dendrite.setAttribute('stroke',color);dendrite.setAttribute('stroke-width','.55');
        dendrite.setAttribute('opacity',String(.08+intensity*.14));
        g.appendChild(dendrite);
        const micro=document.createElementNS(svgNS,'circle');
        micro.setAttribute('cx',String(mx));micro.setAttribute('cy',String(my));
        micro.setAttribute('r',String(1.2+intensity*1.2));
        micro.setAttribute('fill',color);micro.setAttribute('opacity',String(.24+intensity*.36));
        g.appendChild(micro);
      }

      const glow=document.createElementNS(svgNS,'circle');
      glow.setAttribute('r',String(radius+10+intensity*8));
      glow.setAttribute('fill',color);
      glow.setAttribute('opacity',String(.018+intensity*.05));
      glow.setAttribute('filter','url(#soft)');
      g.appendChild(glow);

      const shell=document.createElementNS(svgNS,'circle');
      shell.setAttribute('r',String(radius));
      shell.setAttribute('fill',color);
      shell.setAttribute('fill-opacity',role==='product'?'.22':String(.18+intensity*.28));
      shell.setAttribute('stroke',color);
      shell.setAttribute('stroke-opacity',String(.28+intensity*.42));
      shell.setAttribute('stroke-width',n.dominant?'2':'1');
      if(n.dominant) shell.setAttribute('filter','url(#glow)');
      g.appendChild(shell);

      const core=document.createElementNS(svgNS,'circle');
      core.setAttribute('r',String(Math.max(1.7,radius*.3)));
      core.setAttribute('fill','#fff');
      core.setAttribute('opacity',String(.36+intensity*.5));
      g.appendChild(core);
    }

    g.addEventListener('mouseenter',function(){
      const tooltip=$('neuralTooltip');
      if(tooltip){
        tooltip.classList.add('show');
        tooltip.innerHTML='<strong>'+escapeHtml(n.label)+'</strong><span>'+escapeHtml(n.domain)+' · '+Math.round(intensity*100)+'%'+(n.status?' · '+escapeHtml(n.status):'')+'</span>';
        const px=Math.max(10,Math.min(76,(n.x/900)*100));
        const py=Math.max(8,Math.min(82,(n.y/650)*100));
        tooltip.style.left=px+'%';tooltip.style.top=py+'%';
      }
      if(n.id!=='aura') $('focusStatement').textContent=n.label+' · '+Math.round(intensity*100)+'%';
    });
    g.addEventListener('mouseleave',function(){
      const tooltip=$('neuralTooltip');if(tooltip)tooltip.classList.remove('show');
      $('focusStatement').textContent=selfText(lastAttention?.focus_statement)||'Aucune intention dominante.';
    });
    nodesLayer.appendChild(g);

    // Only the active assembly is named in the field. Everything else stays visual.
    if(n.dominant && n.id!=='aura'){
      const label=document.createElementNS(svgNS,'text');
      const ldx=n.x-450,ldy=n.y-325,ld=Math.sqrt(ldx*ldx+ldy*ldy)||1;
      const lx=n.x+(ldx/ld)*(radius+13);
      const ly=n.y+(ldy/ld)*(radius+10);
      label.setAttribute('x',String(lx));
      label.setAttribute('y',String(ly));
      label.setAttribute('text-anchor',ldx<0?'end':'start');
      label.setAttribute('class','dominant-neural-label');
      label.setAttribute('fill','#eef2ff');
      label.setAttribute('font-size','10');
      label.setAttribute('font-weight','700');
      label.textContent=n.label;
      nodesLayer.appendChild(label);
    }
  });

  // AURA is the living center of the same network, not a separate object below it.
  const aura=field.byId.aura;
  if(aura){
    const core=$('core');
    if(core) core.setAttribute('transform','translate('+(aura.x-450)+' '+(aura.y-325)+')');
  }
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

function renderCommandCenter(command,work,attention){
  if(!command){
    $('commandState').textContent='Indisponible';
    $('commandFleet').textContent='—';
    $('commandMode').textContent='—';
    $('commandCount').textContent='—';
    renderNext(work,attention);
    return;
  }
  const fleet=command.fleet||{};
  const counts=command.counts||{};
  const active=Number(counts.queued||0)+Number(counts.running||0)+Number(counts.waiting||0);
  $('commandState').textContent=command.running?'Cycle actif':(command.enabled?'Autonome':'Arrêté');
  $('commandFleet').textContent=fleet.score==null?'En observation':String(fleet.score)+'%';
  $('commandFleet').className=(fleet.score!=null&&Number(fleet.score)>=80)?'good':((fleet.score!=null&&Number(fleet.score)<60)?'warn':'');
  $('commandMode').textContent=command.github_write_authority?'Agit + observe':'Observe + planifie';
  $('commandMode').className=command.github_write_authority?'good':'warn';
  $('commandCount').textContent=active+' active'+(active>1?'s':'');
  const top=command.top_initiative||null;
  if(top){
    $('nextAction').textContent=String(top.title||top.objective||'Initiative autonome');
    const priority=pct(top.priority||0);
    const confidence=pct(top.confidence||0);
    $('confidenceValue').textContent=priority+'% / '+confidence+'%';
    $('confidenceBar').style.width=priority+'%';
    return;
  }
  renderNext(work,attention);
}
function renderCuriosity(status){
  const list=$('curiosityList');
  const meta=$('curiosityMeta');
  if(!list||!meta)return;
  if(!status||!status.enabled){
    meta.textContent='Arrêtée';
    list.innerHTML='<div class="empty">Moteur de curiosité indisponible.</div>';
    return;
  }
  meta.textContent=String(Number(status.questions_last_hour||0))+' question'+(Number(status.questions_last_hour||0)>1?'s':'')+'/h';
  const rows=Array.isArray(status.recent_questions)?status.recent_questions:[];
  if(!rows.length){
    list.innerHTML='<div class="empty">AURA observe avant de formuler une nouvelle question.</div>';
    return;
  }
  list.innerHTML=rows.slice(0,4).map(function(row){
    const target=String(row.target||'system');
    const domain=String(row.domain||'aura');
    return '<div class="intent-row"><div class="intent-top"><div class="intent-title">'+escapeHtml(row.content||'')+'</div><span class="badge">'+escapeHtml(target)+'</span></div><div class="memory-date">'+escapeHtml(domain)+'</div></div>';
  }).join('');
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
    const auth=await api('/api/auth/session');
    const privateView=Boolean(auth&&auth.authenticated);
    const coreState=await Promise.all([
      api('/api/kernel/status'),
      api(privateView?'/api/kernel/soul':'/api/kernel/public')
    ]);
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
    let commandStatus=null;
    let curiosityStatus=null;
    try{commandStatus=await api('/api/command/status');}catch(_){commandStatus=null;}
    try{curiosityStatus=await api('/api/curiosity/status');}catch(_){curiosityStatus=null;}
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
        api(privateView?'/api/kernel/intentions?limit=5':'/api/kernel/public/intentions?limit=5'),
        api(privateView?'/api/kernel/lessons?limit=5':'/api/kernel/public/lessons?limit=5'),
        api(privateView?'/api/kernel/activity?limit=8':'/api/kernel/public/activity?limit=8'),
        api(privateView?'/api/kernel/work?limit=5':'/api/kernel/public/work?limit=5'),
        api(privateView?'/api/kernel/attention':'/api/kernel/public/attention')
      ]);
      renderIntentions(results[0]);
      renderLessons(results[1]);
      renderActivity(results[2]);
      renderWork(results[3]);
      renderMap(results[4]);
      renderCommandCenter(commandStatus,results[3],results[4]);
      renderCuriosity(curiosityStatus);
    }else{
      $('intentList').innerHTML='<div class="empty">Noyau en démarrage.</div>';
      $('memoryList').innerHTML='<div class="empty">Noyau en démarrage.</div>';
      $('activityList').innerHTML='<div class="empty">Noyau en démarrage.</div>';
      $('workList').innerHTML='<div class="empty">Noyau en démarrage.</div>';
      renderCommandCenter(commandStatus,[],null);
      renderCuriosity(curiosityStatus);
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
