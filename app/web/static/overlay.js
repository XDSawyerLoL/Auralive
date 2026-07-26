const mode = document.documentElement.dataset.mode || "alerts";
const card = document.querySelector("#alert-card");
const viewer = document.querySelector("#viewer");
const message = document.querySelector("#message");
const label = document.querySelector("#event-label");
const field = document.querySelector("#fx-field");
const dock = document.querySelector("#counter-dock");
const chatDock = document.querySelector("#chat-dock");
const goalWidget = document.querySelector("#goal-widget");
const mediaBox = document.querySelector("#alert-media");
const audio = document.querySelector("#alert-audio");
let hideTimer;
const counters = new Map();
const accents = {aqua:"#2dd4bf",violet:"#7c61ff",orange:"#ff9f43",yellow:"#f5c542",pink:"#ec5fb1",blue:"#2e80ff",red:"#ef4444"};

function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c])}
function speak(event){
  const text=event.text||event.message;if(!("speechSynthesis" in window)||!text)return;
  speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang="fr-FR";
  u.rate=Number(event.rate||1);u.pitch=Number(event.pitch||1);u.volume=Number(event.volume??1);
  const preferred=String(event.voice||"").toLowerCase();
  const voices=speechSynthesis.getVoices();const chosen=voices.find(v=>v.name.toLowerCase().includes(preferred))||voices.find(v=>v.lang.startsWith("fr"));
  if(chosen)u.voice=chosen;speechSynthesis.speak(u);
}
function playSound(path,volume=.8){if(!path)return;audio.pause();audio.src=path;audio.volume=Math.max(0,Math.min(1,Number(volume)));audio.currentTime=0;audio.play().catch(()=>{});}
function setMedia(path){mediaBox.innerHTML="";mediaBox.classList.add("hidden");if(!path)return;const clean=String(path);let node;if(/\.(mp4|webm)(\?|$)/i.test(clean)){node=document.createElement("video");node.autoplay=true;node.loop=true;node.muted=true;node.playsInline=true;}else{node=document.createElement("img");}node.src=clean;mediaBox.append(node);mediaBox.classList.remove("hidden");}
function updateCounter(event){counters.set(event.slug,{label:event.label,value:event.value});dock.innerHTML=[...counters.entries()].map(([slug,item])=>`<div class="counter-chip" data-slug="${slug}"><small>${item.label}</small><strong>${item.value}</strong></div>`).join("")}
function addChat(event){const node=document.createElement("div");node.className="chat-line";node.innerHTML=`<b>${escapeHtml(event.viewer||"Viewer")}</b><span>${escapeHtml(event.message||"")}</span>`;chatDock.append(node);while(chatDock.children.length>7)chatDock.firstElementChild.remove();setTimeout(()=>node.remove(),22000)}
function updateGoal(goal){if(!goal){goalWidget.classList.add("hidden");return}const current=Number(goal.current_value||0),target=Math.max(1,Number(goal.target_value||1));document.querySelector("#goal-title").textContent=goal.title||"OBJECTIF";document.querySelector("#goal-value").textContent=`${current.toLocaleString("fr-FR")} / ${target.toLocaleString("fr-FR")}`;document.querySelector("#goal-progress").style.width=`${Math.min(100,current*100/target)}%`;document.querySelector("#goal-unit").textContent=goal.unit||"";goalWidget.classList.remove("hidden")}
async function loadGoal(){try{const r=await fetch("/api/goal/active");if(r.ok){const data=await r.json();updateGoal(data.goal)}}catch{}}
function hide(event){card.dataset.out=event.animation_out||"fade";card.classList.add("leaving");setTimeout(()=>{card.classList.add("hidden");card.classList.remove("leaving");mediaBox.innerHTML="";},450)}
function show(event){
  if(event.type==="chat_message"){if(mode==="chat")addChat(event);return}
  if(event.type==="counter"){updateCounter(event);return}
  if(event.type==="goal_update"){updateGoal(event.goal);return}
  if(event.type==="sound"){playSound(event.sound_path,event.volume);return}
  if(mode==="chat"||mode==="goal")return;
  const labels={follow:"NOUVEAU SUR LE SPOT",subscribe:"NOUVEL ABONNÉ",gift:"MARÉE GÉNÉREUSE",bits:"BITS",raid:"MARÉE MONTANTE",redemption:"RÉCOMPENSE",moderation:"MAIRAIY MODÈRE",shop_purchase:"CABANE DU SPOT",aura_message:"MAIRAIY",giveaway_open:"CONCOURS",giveaway_winner:"GAGNANT",queue_next:"À TOI DE JOUER",poll:"SONDAGE",prediction:"PRÉDICTION",tts:"VOIX DU SPOT",reward_action:"POINTS TWITCH",custom:"MAIRAIY"};
  document.documentElement.style.setProperty("--accent",accents[event.accent]||event.accent||"#2dd4bf");
  label.textContent=event.label||labels[event.type]||"MAIRAIY";viewer.textContent=event.viewer||"";message.textContent=event.message||"Mairaiy est connectée.";
  card.dataset.layout=event.layout||"card";card.dataset.in=event.animation_in||"pop";card.dataset.out=event.animation_out||"fade";
  setMedia(event.media_path);playSound(event.sound_path,event.volume);
  if(["raid","giveaway_winner","shop_purchase","reward_action"].includes(event.type)){field.classList.remove("go");void field.offsetWidth;field.classList.add("go")}
  if(event.type==="tts"&&event.speak!==false)speak(event);
  card.classList.remove("hidden","leaving");clearTimeout(hideTimer);hideTimer=setTimeout(()=>hide(event),(Number(event.duration)||7)*1000);
}
function connect(){const protocol=location.protocol==="https:"?"wss":"ws";const socket=new WebSocket(`${protocol}://${location.host}/ws/overlay?client=${encodeURIComponent(mode)}`);socket.onmessage=e=>show(JSON.parse(e.data));socket.onopen=()=>socket.send(`overlay-${mode}-ready`);socket.onclose=()=>setTimeout(connect,2000)}
if(mode==="goal")loadGoal();connect();
