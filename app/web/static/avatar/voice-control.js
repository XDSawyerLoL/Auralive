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

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const WAKE_PATTERN = /\b(mairaiy|mairay|mairai|maïra|maira|mayra|marie)\b/i;
  const POLL_INTERVAL_MS = 500;
  const VOICE_WAIT_LIMIT_MS = 50000;

  let recognition = null;
  let recognitionRunning = false;
  let enabled = localStorage.getItem('mairaiy-continuous-listening') !== 'off';
  let processing = false;
  let waitingVoice = false;
  let wakeArmed = false;
  let phraseParts = [];
  let sendTimer = null;
  let wakeTimer = null;
  let restartTimer = null;
  let requestController = null;

  const setHint = (title, detail = '', error = false) => {
    hint.innerHTML = `<b class="${error ? 'error' : ''}">${title}</b>${detail}`;
  };

  function visionLabel(data) {
    const vision = data?.live_awareness?.vision;
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

  function render() {
    const listening = enabled && recognitionRunning && !processing && !waitingVoice;
    const armed = listening && wakeArmed;
    button.classList.toggle('listening', listening && !armed);
    button.classList.toggle('recording', armed);
    button.classList.toggle('processing', processing || waitingVoice);
    button.disabled = processing || waitingVoice;

    if (processing) button.innerHTML = 'Mairaiy<br>réfléchit';
    else if (waitingVoice) button.innerHTML = 'Mairaiy<br>parle';
    else if (armed) button.innerHTML = 'Mairaiy<br>t’écoute';
    else if (listening) button.innerHTML = 'Écoute<br>continue';
    else button.innerHTML = 'Activer<br>l’écoute';

    if (!Recognition) micRuntime.textContent = 'Reconnaissance continue indisponible';
    else if (processing) micRuntime.textContent = 'Génération de la réponse';
    else if (waitingVoice) micRuntime.textContent = 'Voix Gemini en préparation';
    else if (armed) micRuntime.textContent = 'Mot d’appel détecté';
    else if (listening) micRuntime.textContent = 'Edge/Chrome · français · mains libres';
    else micRuntime.textContent = 'Micro en pause';
  }

  async function refreshStatus() {
    try {
      const response = await fetch('/api/voice/status', { cache: 'no-store' });
      const data = await response.json();
      const visionActive = Boolean(data?.live_awareness?.vision?.active);
      const voiceLocked = Boolean(data?.audio?.voice_identity?.locked);
      statusNode.textContent = data.configured
        ? `${visionActive ? 'PRÊTE · MICRO + VISION' : 'PRÊTE · MICRO'}${voiceLocked ? ' · VOIX VERROUILLÉE' : ''}`
        : 'CONFIGURATION GEMINI MANQUANTE';
      statusNode.style.color = data.configured ? '#a9f7df' : '#ff9ab2';
      visionRuntime.textContent = visionLabel(data);
    } catch {
      statusNode.textContent = 'SERVEUR LOCAL INJOIGNABLE';
      statusNode.style.color = '#ff9ab2';
      visionRuntime.textContent = 'Serveur local injoignable';
    }
  }

  function clearPhrase() {
    wakeArmed = false;
    phraseParts = [];
    clearTimeout(sendTimer);
    clearTimeout(wakeTimer);
    sendTimer = null;
    wakeTimer = null;
    render();
  }

  function hasMeaningfulQuestion(value) {
    const cleaned = String(value || '')
      .replace(WAKE_PATTERN, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
    return cleaned.length >= 2;
  }

  function schedulePhraseSend(delay = 1050) {
    clearTimeout(sendTimer);
    sendTimer = setTimeout(() => {
      const phrase = phraseParts.join(' ').replace(/\s+/g, ' ').trim();
      if (!hasMeaningfulQuestion(phrase)) {
        setHint('Mairaiy a entendu son prénom', 'Continue ta phrase, elle attend la question.');
        wakeTimer = setTimeout(() => {
          clearPhrase();
          setHint('Écoute continue active', 'Dis « Mairaiy » puis ta phrase, sans toucher au bouton.');
        }, 8000);
        return;
      }
      sendPhrase(phrase);
    }, delay);
  }

  function consumeFinal(text) {
    const clean = String(text || '').trim();
    if (!clean || processing || waitingVoice) return;

    if (!wakeArmed) {
      if (!WAKE_PATTERN.test(clean)) {
        transcript.textContent = clean;
        return;
      }
      wakeArmed = true;
      phraseParts = [clean];
      setHint('Mairaiy t’écoute', 'Termine ta phrase normalement.');
      render();
      schedulePhraseSend();
      return;
    }

    phraseParts.push(clean);
    schedulePhraseSend(850);
  }

  function createRecognition() {
    if (!Recognition) return null;
    const instance = new Recognition();
    instance.lang = 'fr-FR';
    instance.continuous = true;
    instance.interimResults = true;
    instance.maxAlternatives = 1;

    instance.onstart = () => {
      recognitionRunning = true;
      render();
      if (!wakeArmed) {
        setHint('Écoute continue active', 'Dis « Mairaiy » puis ta phrase. Aucun push-to-talk.');
      }
    };

    instance.onresult = event => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = String(result?.[0]?.transcript || '').trim();
        if (!text) continue;
        if (result.isFinal) consumeFinal(text);
        else interim += `${text} `;
      }
      if (interim.trim() && !processing && !waitingVoice) {
        transcript.textContent = interim.trim();
        if (WAKE_PATTERN.test(interim)) {
          setHint('Mot d’appel entendu', 'Mairaiy attend la fin de ta phrase.');
        }
      }
    };

    instance.onerror = event => {
      const code = String(event.error || 'unknown');
      recognitionRunning = false;
      if (code === 'aborted' || code === 'no-speech') {
        render();
        return;
      }
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        enabled = false;
        localStorage.setItem('mairaiy-continuous-listening', 'off');
        setHint('Autorisation micro nécessaire', 'Clique sur le bouton puis autorise le microphone dans Edge.', true);
      } else if (code === 'audio-capture') {
        setHint('Micro introuvable', 'Vérifie le périphérique sélectionné dans Windows et Edge.', true);
      } else {
        setHint('Reconnaissance vocale interrompue', `Erreur ${code}. La reprise est automatique.`, true);
      }
      render();
    };

    instance.onend = () => {
      recognitionRunning = false;
      render();
      if (enabled && !processing && !waitingVoice) scheduleRestart(350);
    };

    return instance;
  }

  function scheduleRestart(delay = 300) {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => startRecognition(), delay);
  }

  function startRecognition() {
    if (!enabled || processing || waitingVoice || recognitionRunning || !Recognition) {
      render();
      return;
    }
    if (!recognition) recognition = createRecognition();
    try {
      recognition.start();
    } catch (error) {
      if (error?.name !== 'InvalidStateError') {
        setHint('Micro non démarré', error.message || String(error), true);
      }
      scheduleRestart(700);
    }
  }

  function stopRecognition() {
    clearTimeout(restartTimer);
    restartTimer = null;
    if (!recognition) return;
    try { recognition.abort(); } catch {}
    recognitionRunning = false;
    render();
  }

  async function sendPhrase(phrase) {
    clearTimeout(sendTimer);
    clearTimeout(wakeTimer);
    sendTimer = wakeTimer = null;
    processing = true;
    waitingVoice = false;
    stopRecognition();
    render();
    transcript.textContent = phrase;
    setHint('Mairaiy prépare sa réponse', 'La transcription est déjà faite : elle génère directement sa réponse.');

    requestController = new AbortController();
    const timeout = setTimeout(() => requestController.abort(), 35000);
    try {
      const response = await fetch('/api/voice/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: phrase, send_to_chat: sendChat.checked }),
        signal: requestController.signal,
      });
      const raw = await response.text();
      let data = {};
      try { data = JSON.parse(raw); } catch { data = { detail: raw }; }
      if (!response.ok) throw new Error(data.detail || 'Dialogue vocal impossible');

      if (data.ignored) {
        answer.textContent = '—';
        setHint('Mot d’appel non reconnu', 'Prononce « Mairaiy » au début de la phrase.');
        processing = false;
        clearPhrase();
        scheduleRestart(500);
        return;
      }

      answer.textContent = data.answer || '—';
      processing = false;
      waitingVoice = true;
      clearPhrase();
      render();
      setHint('Réponse prête', 'Mairaiy prépare maintenant sa voix verrouillée.');
      waitForVoiceCompletion();
    } catch (error) {
      processing = false;
      waitingVoice = false;
      clearPhrase();
      const aborted = error?.name === 'AbortError';
      setHint(
        aborted ? 'Réponse trop longue' : 'Mairaiy n’a pas pu répondre',
        aborted ? 'La génération a dépassé 35 secondes.' : (error.message || String(error)),
        true,
      );
      scheduleRestart(aborted ? 2500 : 1000);
    } finally {
      clearTimeout(timeout);
      requestController = null;
      render();
      refreshStatus();
    }
  }

  async function waitForVoiceCompletion() {
    const started = Date.now();
    while (Date.now() - started < VOICE_WAIT_LIMIT_MS) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      try {
        const response = await fetch('/api/voice/status', { cache: 'no-store' });
        const data = await response.json();
        const realtime = data.realtime || {};
        if (realtime.voice_task_running || ['voice_pending', 'voice_generation'].includes(realtime.stage)) {
          continue;
        }

        waitingVoice = false;
        const delivered = Boolean(realtime.last_voice_delivered);
        const delay = Math.max(500, Math.min(45000, Number(realtime.last_rearm_after_ms || 1200)));
        if (delivered) {
          setHint('Mairaiy a répondu', `L’écoute revient après sa voix, dans ${(delay / 1000).toFixed(1)} s.`);
        } else {
          const reason = realtime.last_voice_error || 'La voix Gemini n’a pas été produite.';
          setHint('Réponse écrite prête, voix indisponible', reason, true);
        }
        render();
        setTimeout(() => {
          clearPhrase();
          startRecognition();
        }, delivered ? delay : 1000);
        return;
      } catch {}
    }

    waitingVoice = false;
    render();
    setHint('Voix trop longue', 'La réponse écrite est conservée et l’écoute redémarre.', true);
    scheduleRestart(1200);
  }

  button.addEventListener('click', event => {
    event.preventDefault();
    if (!Recognition) {
      setHint('Navigateur non compatible', 'Ouvre cette page dans une version récente de Microsoft Edge ou Chrome.', true);
      return;
    }
    enabled = !enabled;
    localStorage.setItem('mairaiy-continuous-listening', enabled ? 'on' : 'off');
    if (enabled) {
      clearPhrase();
      startRecognition();
    } else {
      stopRecognition();
      clearPhrase();
      setHint('Écoute en pause', 'Clique une fois pour reprendre l’écoute continue.');
    }
    render();
  });

  handsFree.checked = true;
  handsFree.disabled = true;
  handsFree.closest('.toggle')?.setAttribute('title', 'Le mode continu remplace désormais le push-to-talk.');

  window.addEventListener('focus', () => {
    if (enabled && !processing && !waitingVoice) startRecognition();
  });
  window.addEventListener('pageshow', () => {
    if (enabled && !processing && !waitingVoice) startRecognition();
  });
  window.addEventListener('online', () => {
    if (enabled && !processing && !waitingVoice) startRecognition();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && enabled && !processing && !waitingVoice) startRecognition();
  });
  window.addEventListener('beforeunload', () => {
    enabled = false;
    stopRecognition();
    requestController?.abort();
  });

  render();
  refreshStatus();
  setInterval(refreshStatus, 10000);
  if (!Recognition) {
    enabled = false;
    setHint('Reconnaissance continue indisponible', 'Utilise Microsoft Edge ou Chrome récent.', true);
  } else if (enabled) {
    setHint('Activation du micro', 'Edge peut demander une autorisation une seule fois.');
    setTimeout(startRecognition, 350);
  } else {
    setHint('Écoute en pause', 'Clique une fois pour activer l’écoute continue.');
  }
})();
