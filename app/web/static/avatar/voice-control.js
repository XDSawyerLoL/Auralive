(() => {
  const button = document.querySelector('#mic-button');
  const hint = document.querySelector('#mic-hint');
  const transcript = document.querySelector('#transcript');
  const answer = document.querySelector('#answer');
  const statusNode = document.querySelector('#system-status');
  const sendChat = document.querySelector('#send-chat');
  const handsFree = document.querySelector('#hands-free');
  const micRuntime = document.querySelector('#mic-runtime');
  const visionRuntime = document.querySelector('#vision-runtime');

  if (!button || !hint || !transcript || !answer || !statusNode || !sendChat || !handsFree || !micRuntime || !visionRuntime) {
    console.error('Interface vocale Mairaiy incomplète');
    return;
  }

  let state = 'idle';
  let audioContext = null;
  let stream = null;
  let source = null;
  let processor = null;
  let silentGain = null;
  let chunks = [];
  let preRoll = [];
  let sampleRate = 48000;
  let startedAt = 0;
  let stopTimer = null;
  let rearmTimer = null;
  let requestTimer = null;
  let maxSeconds = 20;
  let requestSerial = 0;
  let speechFrames = 0;
  let candidateSpeechMs = 0;
  let voicedMs = 0;
  let silenceMs = 0;
  let noiseFloor = 0.004;
  let speechThreshold = 0.012;
  let stopQueued = false;
  let autoStartAttempted = false;
  let calibrated = false;
  let calibrationUntil = 0;
  let calibrationSamples = [];

  const PRE_ROLL_FRAMES = 14;
  const START_FRAMES = 3;
  const START_VOICE_MS = 170;
  const END_SILENCE_MS = 1100;
  const MIN_UTTERANCE_MS = 650;
  const MIN_VOICED_MS = 220;
  const CALIBRATION_MS = 1400;
  const REQUEST_TIMEOUT_MS = 75000;
  const MAX_REARM_MS = 45000;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const setHint = (title, detail = '', error = false) => {
    hint.innerHTML = `<b class="${error ? 'error' : ''}">${title}</b>${detail}`;
  };

  function setState(next) {
    state = next;
    renderState();
  }

  function renderState() {
    button.classList.toggle('listening', state === 'calibrating' || state === 'listening');
    button.classList.toggle('recording', state === 'capturing');
    button.classList.toggle('processing', state === 'processing' || state === 'cooldown');
    button.disabled = state === 'processing' || state === 'cooldown';

    if (state === 'calibrating') button.innerHTML = 'Réglage<br>du micro';
    else if (state === 'listening') button.innerHTML = 'Écoute<br>active';
    else if (state === 'capturing') button.innerHTML = 'Mairaiy<br>t’écoute';
    else if (state === 'processing') button.innerHTML = 'Mairaiy<br>répond';
    else if (state === 'cooldown') button.innerHTML = 'Pause<br>anti-écho';
    else button.innerHTML = handsFree.checked ? 'Activer<br>l’écoute' : 'Cliquer<br>pour parler';

    if (state === 'calibrating') micRuntime.textContent = 'Calibration du bruit ambiant';
    else if (state === 'listening') micRuntime.textContent = `Mains libres · seuil ${speechThreshold.toFixed(3)}`;
    else if (state === 'capturing') micRuntime.textContent = 'Phrase détectée';
    else if (state === 'processing') micRuntime.textContent = 'Transcription, réponse et voix';
    else if (state === 'cooldown') micRuntime.textContent = 'Attente de la fin de sa voix';
    else micRuntime.textContent = 'Micro en pause';
  }

  function visionLabel(data) {
    const awareness = data?.live_awareness;
    const vision = awareness?.vision;
    if (!vision) return 'Service non chargé';
    if (vision.active) {
      return `Active · ${vision.captures || 0} captures · ${vision.reactions || 0} réactions`;
    }
    const labels = {
      service_non_demarre: 'service non démarré',
      live_hors_ligne: 'live hors ligne',
      vision_desactivee: 'vision désactivée',
      obs_desactive: 'OBS désactivé',
      gemini_non_configure: 'Gemini non configuré',
    };
    const blockers = (vision.blockers || []).map(item => labels[item] || item);
    return blockers.length ? `En attente · ${blockers.join(', ')}` : 'En attente';
  }

  async function refreshStatus() {
    try {
      const response = await fetch('/api/voice/status', { cache: 'no-store' });
      const data = await response.json();
      maxSeconds = Number(data.max_seconds || 20);
      const visionActive = Boolean(data?.live_awareness?.vision?.active);
      statusNode.textContent = data.configured
        ? (data.avatar_connected
          ? (visionActive ? 'PRÊTE · MICRO + VISION' : 'PRÊTE · MICRO')
          : 'PRÊTE · OUVRE L’AVATAR OBS')
        : 'CONFIGURATION GEMINI MANQUANTE';
      statusNode.style.color = data.configured ? '#a9f7df' : '#ff9ab2';
      visionRuntime.textContent = visionLabel(data);
    } catch {
      statusNode.textContent = 'SERVEUR LOCAL INJOIGNABLE';
      statusNode.style.color = '#ff9ab2';
      visionRuntime.textContent = 'Serveur local injoignable';
    }
  }

  function hardwareAlive() {
    const track = stream?.getAudioTracks?.()[0];
    return Boolean(track && track.readyState === 'live' && audioContext && audioContext.state !== 'closed');
  }

  async function disposeHardware() {
    clearTimeout(stopTimer);
    clearTimeout(rearmTimer);
    clearTimeout(requestTimer);
    stopTimer = null;
    rearmTimer = null;
    requestTimer = null;
    try { processor?.disconnect(); } catch {}
    try { source?.disconnect(); } catch {}
    try { silentGain?.disconnect(); } catch {}
    stream?.getTracks?.().forEach(track => track.stop());
    try { await audioContext?.close(); } catch {}
    audioContext = stream = source = processor = silentGain = null;
    calibrated = false;
  }

  function frameRms(frame) {
    let sum = 0;
    for (let i = 0; i < frame.length; i += 1) sum += frame[i] * frame[i];
    return Math.sqrt(sum / Math.max(1, frame.length));
  }

  function finishCalibration() {
    const samples = calibrationSamples.filter(Number.isFinite).sort((a, b) => a - b);
    const index = Math.max(0, Math.min(samples.length - 1, Math.floor(samples.length * 0.72)));
    noiseFloor = samples.length ? samples[index] : 0.004;
    noiseFloor = clamp(noiseFloor, 0.0015, 0.025);
    speechThreshold = clamp((noiseFloor * 2.45) + 0.0015, 0.006, 0.055);
    calibrationSamples = [];
    calibrated = true;
    setState('listening');
    setHint('Écoute mains libres active', 'Dis « Mairaiy » puis ta phrase. Le niveau du micro est calibré.');
  }

  function beginDetectedSpeech() {
    setState('capturing');
    chunks = preRoll.slice();
    preRoll = [];
    startedAt = Date.now();
    silenceMs = 0;
    voicedMs = candidateSpeechMs;
    candidateSpeechMs = 0;
    stopQueued = false;
    setHint('Je t’écoute', 'Continue ta phrase. Elle sera envoyée après un court silence.');
    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => queueStopRecording(true), Math.max(3, maxSeconds) * 1000);
  }

  function handleAudioFrame(event) {
    const frame = new Float32Array(event.inputBuffer.getChannelData(0));
    const rms = frameRms(frame);
    const frameMs = (frame.length / Math.max(1, sampleRate)) * 1000;

    if (state === 'calibrating') {
      calibrationSamples.push(rms);
      if (Date.now() >= calibrationUntil) finishCalibration();
      return;
    }

    if (state === 'listening') {
      preRoll.push(frame);
      if (preRoll.length > PRE_ROLL_FRAMES) preRoll.shift();

      if (rms < speechThreshold * 0.82) {
        noiseFloor = (noiseFloor * 0.985) + (rms * 0.015);
        speechThreshold = clamp((noiseFloor * 2.55) + 0.0015, 0.006, 0.055);
      }

      if (rms >= speechThreshold) {
        speechFrames += 1;
        candidateSpeechMs += frameMs;
      } else {
        speechFrames = Math.max(0, speechFrames - 1);
        candidateSpeechMs = Math.max(0, candidateSpeechMs - frameMs * 0.45);
      }

      if (speechFrames >= START_FRAMES && candidateSpeechMs >= START_VOICE_MS) {
        speechFrames = 0;
        beginDetectedSpeech();
      }
      return;
    }

    if (state !== 'capturing') return;
    chunks.push(frame);
    if (rms >= speechThreshold * 0.82) {
      voicedMs += frameMs;
      silenceMs = 0;
    } else {
      silenceMs += frameMs;
    }

    const duration = Date.now() - startedAt;
    if (duration >= MIN_UTTERANCE_MS && silenceMs >= END_SILENCE_MS) {
      queueStopRecording(true);
    }
  }

  async function ensureHardware() {
    if (hardwareAlive()) {
      if (audioContext.state === 'suspended') await audioContext.resume();
      return;
    }

    await disposeHardware();
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Ce navigateur ne donne pas accès au microphone.');
    }

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    await audioContext.resume();
    sampleRate = audioContext.sampleRate;
    source = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    processor.onaudioprocess = handleAudioFrame;
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);

    const track = stream.getAudioTracks()[0];
    track.addEventListener('ended', () => {
      setState('idle');
      calibrated = false;
      setHint('Micro déconnecté', 'Reconnecte le périphérique puis clique une fois pour réactiver.', true);
      disposeHardware();
    }, { once: true });
  }

  async function startHandsFree() {
    if (!handsFree.checked || state === 'processing' || state === 'capturing') return;
    clearTimeout(rearmTimer);
    rearmTimer = null;

    // Le minuteur anti-écho appelle cette fonction depuis l’état cooldown.
    // Il faut impérativement libérer cet état avant de réarmer le micro.
    if (state === 'cooldown') setState('idle');

    try {
      await ensureHardware();
      chunks = [];
      preRoll = [];
      speechFrames = 0;
      candidateSpeechMs = 0;
      voicedMs = 0;
      silenceMs = 0;
      if (!calibrated) {
        calibrationSamples = [];
        calibrationUntil = Date.now() + CALIBRATION_MS;
        setState('calibrating');
        setHint('Calibration du micro', 'Reste silencieux une seconde, puis parle normalement.');
      } else {
        setState('listening');
        setHint('Écoute mains libres active', 'Dis « Mairaiy » puis ta phrase. Aucun bouton à maintenir.');
      }
    } catch (error) {
      setState('idle');
      setHint('Autorisation du micro nécessaire', error.message || 'Clique une fois puis autorise le microphone.', true);
    }
  }

  function pauseListening(message = '') {
    clearTimeout(stopTimer);
    clearTimeout(rearmTimer);
    clearTimeout(requestTimer);
    stopTimer = null;
    rearmTimer = null;
    requestTimer = null;
    chunks = [];
    preRoll = [];
    speechFrames = 0;
    candidateSpeechMs = 0;
    voicedMs = 0;
    silenceMs = 0;
    setState('idle');
    if (message) setHint('Écoute en pause', message);
  }

  async function startManualRecording() {
    if (state !== 'idle') return;
    try {
      await ensureHardware();
      chunks = [];
      preRoll = [];
      startedAt = Date.now();
      voicedMs = MIN_VOICED_MS;
      setState('capturing');
      setHint('Je t’écoute', 'Clique de nouveau pour envoyer ta phrase.');
      stopTimer = setTimeout(() => queueStopRecording(false), Math.max(3, maxSeconds) * 1000);
    } catch (error) {
      setState('idle');
      setHint('Micro inaccessible', error.message || 'Autorise le microphone dans le navigateur.', true);
    }
  }

  function queueStopRecording(requireWakeWord) {
    if (stopQueued || state !== 'capturing') return;
    stopQueued = true;
    queueMicrotask(() => stopRecording(requireWakeWord));
  }

  async function returnToListening(title, detail) {
    setState('idle');
    setHint(title, detail);
    if (handsFree.checked) {
      clearTimeout(rearmTimer);
      rearmTimer = setTimeout(() => startHandsFree(), 250);
    }
  }

  function scheduleRearm(delayMs, title = 'Écoute mains libres active') {
    clearTimeout(rearmTimer);
    const wait = clamp(Number(delayMs) || 2800, 350, MAX_REARM_MS);
    setState('cooldown');
    setHint(title, `Le micro se réactive dans ${(wait / 1000).toFixed(1)} s.`);

    rearmTimer = setTimeout(async () => {
      rearmTimer = null;
      if (state !== 'cooldown') return;
      setState('idle');
      if (handsFree.checked) await startHandsFree();
      else pauseListening('Clique quand tu veux lui reparler.');
    }, wait);
  }

  async function stopRecording(requireWakeWord) {
    if (state !== 'capturing') return;
    clearTimeout(stopTimer);
    stopTimer = null;
    const duration = Date.now() - startedAt;
    stopQueued = false;

    if (!chunks.length || duration < MIN_UTTERANCE_MS || (requireWakeWord && voicedMs < MIN_VOICED_MS)) {
      chunks = [];
      await returnToListening('Bruit ignoré', 'Aucune phrase complète détectée. L’écoute reste active.');
      return;
    }

    setState('processing');
    setHint('Transcription et réponse en cours', requireWakeWord
      ? 'Elle répond uniquement si la phrase contient « Mairaiy ».'
      : 'La phrase est envoyée à Mairaiy.');

    const serial = ++requestSerial;
    const wav = encodeWav(chunks, sampleRate);
    chunks = [];
    preRoll = [];
    const controller = new AbortController();
    requestTimer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const payload = {
        audio_base64: arrayBufferToBase64(wav),
        mime_type: requireWakeWord ? 'audio/wav; mode=handsfree' : 'audio/wav',
        send_to_chat: sendChat.checked,
      };
      const response = await fetch('/api/voice/talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(requestTimer);
      requestTimer = null;

      const raw = await response.text();
      let data = {};
      try { data = JSON.parse(raw); } catch { data = { detail: raw }; }
      if (!response.ok) throw new Error(data.detail || 'Dialogue vocal impossible');
      if (serial !== requestSerial) return;

      transcript.textContent = data.transcript || '—';
      answer.textContent = data.answer || '—';

      if (data.ignored) {
        const noise = data.ignore_reason === 'silence_or_noise';
        scheduleRearm(
          Math.max(450, Number(data.rearm_after_ms || 650)),
          noise ? 'Bruit ou silence ignoré' : 'Mot d’appel manquant',
        );
        return;
      }

      const details = `${data.latency_ms || 0} ms${data.sent_to_chat ? ' · publiée dans Twitch' : ''}`;
      setHint('Réponse reçue', details);
      scheduleRearm(Math.max(1200, Number(data.rearm_after_ms || 2800)), 'Mairaiy parle');
      await refreshStatus();
    } catch (error) {
      clearTimeout(requestTimer);
      requestTimer = null;
      const aborted = error?.name === 'AbortError';
      setState('idle');
      setHint(
        aborted ? 'Réponse trop longue' : 'Mairaiy n’a pas pu répondre',
        aborted ? 'La requête a été interrompue après 75 secondes. Le micro va se réarmer.' : (error.message || String(error)),
        true,
      );
      if (handsFree.checked) {
        rearmTimer = setTimeout(() => startHandsFree(), aborted ? 8000 : 1200);
      }
    }
  }

  function encodeWav(parts, rate) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    let peak = 0;
    for (const part of parts) {
      for (let i = 0; i < part.length; i += 1) peak = Math.max(peak, Math.abs(part[i]));
    }
    const gain = peak >= 0.004 ? clamp(0.78 / peak, 1, 6) : 1;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);
    const write = (offset, text) => {
      for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
    };
    write(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, length * 2, true);
    let offset = 44;
    for (const part of parts) {
      for (let i = 0; i < part.length; i += 1) {
        const value = clamp(part[i] * gain, -1, 1);
        view.setInt16(offset, value < 0 ? value * 32768 : value * 32767, true);
        offset += 2;
      }
    }
    return buffer;
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode(...bytes.subarray(i, i + step));
    }
    return btoa(binary);
  }

  async function recoverWithoutReload() {
    if (audioContext?.state === 'suspended') {
      try { await audioContext.resume(); } catch {}
    }
    if (handsFree.checked && !['processing', 'capturing', 'calibrating'].includes(state)) {
      if (state === 'cooldown') setState('idle');
      await startHandsFree();
    }
    refreshStatus();
  }

  async function autoStart() {
    if (autoStartAttempted || !handsFree.checked) return;
    autoStartAttempted = true;
    try {
      if (navigator.permissions?.query) {
        const permission = await navigator.permissions.query({ name: 'microphone' });
        if (permission.state === 'denied') {
          setHint('Micro bloqué', 'Autorise le microphone dans les paramètres du navigateur.', true);
          return;
        }
      }
    } catch {}
    await startHandsFree();
  }

  button.addEventListener('click', event => {
    event.preventDefault();
    if (handsFree.checked) {
      if (['listening', 'calibrating'].includes(state)) pauseListening('Clique de nouveau pour reprendre.');
      else if (state === 'idle') startHandsFree();
      return;
    }
    if (state === 'idle') startManualRecording();
    else if (state === 'capturing') queueStopRecording(false);
  });

  handsFree.addEventListener('change', () => {
    if (handsFree.checked) startHandsFree();
    else pauseListening('Mode manuel : un clic démarre, un second envoie.');
  });

  window.addEventListener('keydown', event => {
    if (handsFree.checked || event.repeat || event.code !== 'Space') return;
    if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement?.tagName)) return;
    event.preventDefault();
    startManualRecording();
  });

  window.addEventListener('keyup', event => {
    if (handsFree.checked || event.code !== 'Space' || state !== 'capturing') return;
    event.preventDefault();
    queueStopRecording(false);
  });

  window.addEventListener('pageshow', recoverWithoutReload);
  window.addEventListener('focus', recoverWithoutReload);
  window.addEventListener('online', recoverWithoutReload);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') recoverWithoutReload();
  });
  navigator.mediaDevices?.addEventListener?.('devicechange', async () => {
    await disposeHardware();
    setState('idle');
    calibrated = false;
    if (handsFree.checked) startHandsFree();
  });
  window.addEventListener('beforeunload', () => disposeHardware());

  renderState();
  refreshStatus();
  autoStart();
  setInterval(refreshStatus, 10000);
})();