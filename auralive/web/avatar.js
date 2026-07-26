const params = new URLSearchParams(location.search);
const stage = document.querySelector("#avatarStage");
const idleImage = document.querySelector("#idleImage");
const talkingImage = document.querySelector("#talkingImage");
const subtitle = document.querySelector("#subtitle");
const connectionState = document.querySelector("#connectionState");
const avatarName = document.querySelector("#avatarName");

const settings = {
  idle: params.get("idle") || "/assets/avatar/mairaiy-idle.png",
  talking: params.get("talk") || "/assets/avatar/mairaiy-talking.png",
  voice: params.get("voice") || "",
  lang: params.get("lang") || "fr-FR",
  rate: Number(params.get("rate") || 1),
  pitch: Number(params.get("pitch") || 1),
  volume: Number(params.get("volume") || 1),
  subtitles: params.get("subtitles") !== "false",
  identity: params.get("identity") !== "false",
  name: params.get("name") || "MAIRAIY",
};

avatarName.textContent = settings.name;
stage.classList.toggle("hide-subtitles", !settings.subtitles);
stage.classList.toggle("hide-identity", !settings.identity);

let loadedImages = 0;
let currentUtterance = null;
let socket = null;
let reconnectTimer = null;
let subtitleTimer = null;
let queuedMessages = [];

function setupImage(element, source) {
  element.addEventListener("load", () => {
    loadedImages += 1;
    if (loadedImages >= 2) stage.classList.add("has-images");
  });
  element.addEventListener("error", () => {
    stage.classList.remove("has-images");
  });
  element.src = source;
}

setupImage(idleImage, settings.idle);
setupImage(talkingImage, settings.talking);

function connect() {
  clearTimeout(reconnectTimer);
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${scheme}://${location.host}/ws/overlay/avatar`);
  socket.addEventListener("open", () => {
    stage.classList.add("connected");
    connectionState.textContent = "PRÊTE";
  });
  socket.addEventListener("message", (event) => {
    try {
      handlePayload(JSON.parse(event.data));
    } catch (error) {
      console.error("Payload avatar invalide", error);
    }
  });
  socket.addEventListener("close", () => {
    stage.classList.remove("connected");
    connectionState.textContent = "RECONNEXION";
    reconnectTimer = setTimeout(connect, 1600);
  });
  socket.addEventListener("error", () => socket.close());
}

function handlePayload(payload) {
  if (payload.type === "speak") {
    speak(String(payload.text || ""), payload);
  } else if (payload.type === "stop") {
    stopSpeaking();
  } else if (payload.type === "expression") {
    stage.dataset.expression = payload.name || "neutral";
  } else if (payload.type === "configure") {
    applyConfiguration(payload);
  }
}

function applyConfiguration(payload) {
  if (payload.idle) idleImage.src = payload.idle;
  if (payload.talking) talkingImage.src = payload.talking;
  if (payload.name) avatarName.textContent = payload.name;
}

function selectVoice(requestedName) {
  const requested = requestedName || settings.voice;
  const voices = speechSynthesis.getVoices();
  if (requested) {
    const exact = voices.find((voice) => voice.name.toLowerCase() === requested.toLowerCase());
    if (exact) return exact;
    const partial = voices.find((voice) => voice.name.toLowerCase().includes(requested.toLowerCase()));
    if (partial) return partial;
  }
  return voices.find((voice) => voice.lang.toLowerCase().startsWith("fr")) || voices[0] || null;
}

function speak(text, options = {}) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return;
  if (!("speechSynthesis" in window)) {
    showSubtitle(clean, estimateDuration(clean));
    animateTalking(estimateDuration(clean));
    return;
  }

  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = options.lang || settings.lang;
  utterance.rate = clamp(Number(options.rate ?? settings.rate), 0.55, 1.8);
  utterance.pitch = clamp(Number(options.pitch ?? settings.pitch), 0.5, 1.7);
  utterance.volume = clamp(Number(options.volume ?? settings.volume), 0, 1);
  const voice = selectVoice(options.voice);
  if (voice) utterance.voice = voice;

  utterance.addEventListener("start", () => {
    currentUtterance = utterance;
    stage.classList.add("talking");
    showSubtitle(clean);
  });
  utterance.addEventListener("boundary", () => {
    stage.classList.toggle("micro-expression");
  });
  const finish = () => {
    if (currentUtterance === utterance) currentUtterance = null;
    stage.classList.remove("talking", "micro-expression");
    hideSubtitleLater(1200);
    drainQueue();
  };
  utterance.addEventListener("end", finish);
  utterance.addEventListener("error", finish);
  speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  queuedMessages = [];
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  currentUtterance = null;
  stage.classList.remove("talking");
  hideSubtitleLater(0);
}

function queueSpeech(text, options = {}) {
  queuedMessages.push({ text, options });
  drainQueue();
}

function drainQueue() {
  if (currentUtterance || !queuedMessages.length) return;
  const next = queuedMessages.shift();
  speak(next.text, next.options);
}

function showSubtitle(text, duration) {
  clearTimeout(subtitleTimer);
  subtitle.textContent = text;
  subtitle.classList.add("visible");
  if (duration) hideSubtitleLater(duration);
}

function hideSubtitleLater(delay) {
  clearTimeout(subtitleTimer);
  subtitleTimer = setTimeout(() => subtitle.classList.remove("visible"), delay);
}

function animateTalking(duration) {
  stage.classList.add("talking");
  setTimeout(() => stage.classList.remove("talking"), duration);
}

function estimateDuration(text) {
  return Math.max(1200, Math.min(18000, text.length * 58));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

window.addEventListener("beforeunload", () => {
  clearTimeout(reconnectTimer);
  stopSpeaking();
  socket?.close();
});

speechSynthesis?.addEventListener?.("voiceschanged", () => drainQueue());
connect();

window.MairaiyAvatar = { speak, queueSpeech, stop: stopSpeaking };
