const stage=document.querySelector('#avatar-stage');
const caption=document.querySelector('#caption');
const captionText=document.querySelector('#caption-text');
const audio=document.querySelector('#avatar-audio')||document.body.appendChild(Object.assign(document.createElement('audio'),{id:'avatar-audio',preload:'auto'}));
let settings={enabled:true,voice:'',rate:1,pitch:1,volume:1,subtitles:true,subtitle_seconds:12};
let speaking=false;
let queue=[];
let safetyTimer;

function cleanText(value){return String(value||'').replace(/^@\w+\s*/,'').trim()}
async function loadSettings(){
  try{const r=await fetch('/api/avatar/settings',{cache:'no-store'});if(r.ok)settings={...settings,...await r.json()}}catch{}
  const params=new URLSearchParams(location.search);
  if(params.get('compact')==='1')stage.classList.add('compact');
  if(params.get('subtitles')==='0')settings.subtitles=false;
}
function chooseVoice(event={}){
  const voices=speechSynthesis.getVoices();
  const wanted=String(event.voice||settings.voice||'').toLowerCase();
  return voices.find(v=>wanted&&v.name.toLowerCase().includes(wanted))||voices.find(v=>/^fr(-|_)/i.test(v.lang))||voices[0];
}
function setSpeaking(value){speaking=value;stage.classList.toggle('speaking',value);stage.classList.toggle('idle',!value)}
function showCaption(text){
  if(!settings.subtitles)return;
  captionText.textContent=text;caption.classList.remove('hidden');
}
function hideCaption(){caption.classList.add('hidden')}
function armSafety(text){
  clearTimeout(safetyTimer);
  safetyTimer=setTimeout(finishSpeech,Math.max(5000,text.length*140));
}
function finishSpeech(){
  clearTimeout(safetyTimer);
  audio.onplay=audio.onended=audio.onerror=null;
  setSpeaking(false);
  setTimeout(hideCaption,Math.max(1200,Number(settings.subtitle_seconds||12)*1000));
  const next=queue.shift();if(next)setTimeout(()=>speak(next.text,next.event),180);
}
function browserSpeak(text,event={}){
  if(!('speechSynthesis' in window)){setSpeaking(true);armSafety(text);return}
  speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.lang='fr-FR';
  utterance.rate=Number(event.rate||settings.rate||1);
  utterance.pitch=Number(event.pitch||settings.pitch||1);
  utterance.volume=Number(event.volume??settings.volume??1);
  const voice=chooseVoice(event);if(voice)utterance.voice=voice;
  utterance.onstart=()=>{setSpeaking(true);armSafety(text)};
  utterance.onend=finishSpeech;
  utterance.onerror=finishSpeech;
  setSpeaking(true);armSafety(text);speechSynthesis.speak(utterance);
}
function playGeneratedAudio(text,event={}){
  let fallbackStarted=false;
  const fallback=()=>{
    if(fallbackStarted)return;
    fallbackStarted=true;
    audio.pause();audio.removeAttribute('src');
    browserSpeak(text,event);
  };
  audio.pause();
  audio.src=`${event.audio_url}${event.audio_url.includes('?')?'&':'?'}v=${Date.now()}`;
  audio.volume=Math.max(0,Math.min(1,Number(event.volume??settings.volume??1)));
  audio.currentTime=0;
  audio.onplay=()=>{setSpeaking(true);armSafety(text)};
  audio.onended=finishSpeech;
  audio.onerror=fallback;
  setSpeaking(true);armSafety(text);
  const promise=audio.play();
  if(promise&&typeof promise.catch==='function')promise.catch(fallback);
}
function speak(raw,event={}){
  const text=cleanText(raw);if(!text||!settings.enabled)return;
  if(speaking){queue.push({text,event});return}
  showCaption(text);
  if(event.audio_url)playGeneratedAudio(text,event);else browserSpeak(text,event);
}
function handle(event){
  if(event.type==='avatar_voice'&&event.speak!==false)speak(event.text||event.message,event);
  if(event.type==='aura_message'&&event.speak!==false)speak(event.text||event.message,event);
  if(event.type==='avatar_test'&&event.speak!==false)speak(event.text||event.message||'Test vocal de Mairaiy.',event);
  if(event.type==='tts'&&event.speak!==false)speak(event.text||event.message,event);
}
function connect(){
  const protocol=location.protocol==='https:'?'wss':'ws';
  const socket=new WebSocket(`${protocol}://${location.host}/ws/overlay?client=avatar`);
  socket.onmessage=e=>{try{handle(JSON.parse(e.data))}catch{}};
  socket.onopen=()=>socket.send('overlay-avatar-ready');
  socket.onclose=()=>setTimeout(connect,1800);
}
loadSettings().then(connect);
if('speechSynthesis' in window)speechSynthesis.onvoiceschanged=()=>chooseVoice();
