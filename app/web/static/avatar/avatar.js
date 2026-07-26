const stage=document.querySelector('#avatar-stage');
const caption=document.querySelector('#caption');
const captionText=document.querySelector('#caption-text');
let settings={enabled:true,voice:'',rate:1,pitch:1,volume:1,subtitles:true,subtitle_seconds:12};
let speaking=false;
let queue=[];

function cleanText(value){return String(value||'').replace(/^@\w+\s*/,'').trim()}
async function loadSettings(){
  try{const r=await fetch('/api/avatar/settings',{cache:'no-store'});if(r.ok)settings={...settings,...await r.json()}}catch{}
  const params=new URLSearchParams(location.search);
  if(params.get('compact')==='1')stage.classList.add('compact');
  if(params.get('subtitles')==='0')settings.subtitles=false;
}
function chooseVoice(){
  const voices=speechSynthesis.getVoices();
  const wanted=String(settings.voice||'').toLowerCase();
  return voices.find(v=>wanted&&v.name.toLowerCase().includes(wanted))||voices.find(v=>/^fr(-|_)/i.test(v.lang))||voices[0];
}
function setSpeaking(value){speaking=value;stage.classList.toggle('speaking',value);stage.classList.toggle('idle',!value)}
function showCaption(text){
  if(!settings.subtitles)return;
  captionText.textContent=text;caption.classList.remove('hidden');
}
function hideCaption(){caption.classList.add('hidden')}
function finishSpeech(){
  setSpeaking(false);
  setTimeout(hideCaption,Math.max(1200,Number(settings.subtitle_seconds||12)*1000));
  const next=queue.shift();if(next)setTimeout(()=>speak(next),180);
}
function speak(raw){
  const text=cleanText(raw);if(!text||!settings.enabled)return;
  if(speaking){queue.push(text);return}
  showCaption(text);
  if(!('speechSynthesis' in window)){setSpeaking(true);setTimeout(finishSpeech,Math.max(1800,text.length*55));return}
  speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.lang='fr-FR';utterance.rate=Number(settings.rate||1);utterance.pitch=Number(settings.pitch||1);utterance.volume=Number(settings.volume??1);
  const voice=chooseVoice();if(voice)utterance.voice=voice;
  utterance.onstart=()=>setSpeaking(true);utterance.onend=finishSpeech;utterance.onerror=finishSpeech;
  speechSynthesis.speak(utterance);
}
function handle(event){
  if(event.type==='aura_message'&&event.speak!==false)speak(event.text||event.message);
  if(event.type==='avatar_test')speak(event.text||event.message||'Test vocal de Mairaiy.');
}
function connect(){
  const protocol=location.protocol==='https:'?'wss':'ws';const socket=new WebSocket(`${protocol}://${location.host}/ws/overlay`);
  socket.onmessage=e=>{try{handle(JSON.parse(e.data))}catch{}};
  socket.onopen=()=>socket.send('overlay-avatar-ready');socket.onclose=()=>setTimeout(connect,1800);
}
loadSettings().then(connect);
if('speechSynthesis' in window)speechSynthesis.onvoiceschanged=()=>chooseVoice();
