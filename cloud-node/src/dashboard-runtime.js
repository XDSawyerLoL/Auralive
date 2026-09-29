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
function renderMap(data){
  if(!data || !Array.isArray(data.nodes)) return;
  lastAttention=data;
  const focus=$('focusStatement');
  if(focus) focus.textContent=data.focus_statement||'Aucune intention dominante.';
  if(window.AURANeuralField&&typeof window.AURANeuralField.render==='function'){
    window.AURANeuralField.render(data);
    livingScene=window.AURANeuralField.state||livingScene;
  }
}
function initLivingAuraScene(){
  if(window.AURANeuralField&&typeof window.AURANeuralField.init==='function'){
    window.AURANeuralField.init();
    livingScene=window.AURANeuralField.state||null;
  }
  return livingScene;
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
