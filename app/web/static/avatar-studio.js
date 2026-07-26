(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const api = async (url, options={}) => {
    const response = await fetch(url, {headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options});
    if (!response.ok) throw new Error((await response.text()).replace(/^"|"$/g,''));
    return response.status === 204 ? {} : response.json();
  };
  const esc = value => String(value??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[c]);
  const naturalVoices = [
    ['Leda','Jeune, vive et lumineuse'], ['Laomedeia','Enjouée mais plus posée'],
    ['Aoede','Aérée et naturelle'], ['Sulafat','Chaleureuse'], ['Achernar','Douce'],
    ['Vindemiatrix','Délicate'], ['Callirrhoe','Détendue'], ['Erinome','Claire'], ['Kore','Assurée']
  ];
  let cohostProfile=null;

  async function runtime(){
    try{return await api('/api/avatar/runtime')}catch{return null}
  }
  function installVoicePicker(){
    const input=$('#avatar-voice'); if(!input) return;
    input.placeholder='Leda — jeune et vive';
    input.setAttribute('list','mairaiy-natural-voices');
    let list=$('#mairaiy-natural-voices');
    if(!list){
      list=document.createElement('datalist');
      list.id='mairaiy-natural-voices';
      list.innerHTML=naturalVoices.map(([voice,label])=>`<option value="${voice}">${label}</option>`).join('');
      document.body.append(list);
    }
    const label=input.closest('label');
    if(label && !label.querySelector('.natural-voice-note')){
      const note=document.createElement('small');
      note.className='natural-voice-note';
      note.textContent='Preset conseillé : Leda · vitesse 1.12 · hauteur 1.14.';
      label.append(note);
    }
  }
  function installVoiceControlButton(){
    const heading=$('[data-page-panel="avatar"] .page-heading');
    if(!heading||$('#voice-control-open'))return;
    const link=document.createElement('a');
    link.id='voice-control-open';
    link.className='secondary-button';
    link.href='/voice-control';
    link.target='_blank';
    link.rel='noopener';
    link.innerHTML='<svg><use href="#i-mic"></use></svg>Parler à Mairaiy';
    heading.append(link);
    $('.preview-identity')?.remove();
  }
  async function load(){
    const form=$('#avatar-settings-form'); if(!form) return;
    try{
      const data=await api('/api/avatar/settings');
      $('#avatar-enabled').checked=Boolean(data.enabled);
      $('#avatar-voice').value=data.voice||'Leda';
      $('#avatar-rate').value=Number(data.rate||1.12);
      $('#avatar-pitch').value=Number(data.pitch||1.14);
      $('#avatar-volume').value=Number(data.volume??1);
      $('#avatar-subtitles').checked=Boolean(data.subtitles);
    }catch(error){ if(typeof toast==='function') toast(error.message,true); }
  }

  function campaign(id){
    return (cohostProfile?.cta_campaigns||[]).find(item=>item.id===id)||{};
  }
  function installCohostPanel(){
    if($('#cohost-modal')) return;
    const heading=$('[data-page-panel="avatar"] .page-heading')||$('[data-page-panel="ai"] .page-heading');
    if(heading && !$('#cohost-open')){
      const button=document.createElement('button');
      button.id='cohost-open';
      button.className='secondary-button';
      button.type='button';
      button.textContent='Configurer l’assistante';
      heading.append(button);
    }
    const modal=document.createElement('div');
    modal.className='modal';
    modal.id='cohost-modal';
    modal.innerHTML=`
      <div class="modal-card" style="max-width:980px;max-height:92vh;overflow:auto">
        <button class="modal-close" id="cohost-close">×</button>
        <span class="modal-kicker">COANIMATION AUTONOME</span>
        <h2>Mairaiy connaît la chaîne et prend des initiatives</h2>
        <p>Les informations enregistrées ici alimentent ses réponses, ses interventions, les CTA naturels et l’analyse du programme OBS.</p>
        <div class="settings-columns">
          <section>
            <h3>Ce qu’elle sait</h3>
            <label>Faits vérifiés sur Sansa<textarea id="cohost-facts" rows="6" placeholder="Un fait par ligne"></textarea></label>
            <label>Thèmes de la chaîne<textarea id="cohost-themes" rows="4" placeholder="Un thème par ligne"></textarea></label>
            <label>Jeux récurrents<textarea id="cohost-games" rows="4" placeholder="Un jeu par ligne"></textarea></label>
            <label>JustPlayer<input id="cohost-justplayer" placeholder="https://justplayer.fr"></label>
            <label>Discord<input id="cohost-discord" placeholder="Lien Discord ou !discord"></label>
          </section>
          <section>
            <h3>Initiative</h3>
            <label class="toggle-row"><span><b>Interventions autonomes</b><small>Rebondit sur le chat sans attendre d’être appelée.</small></span><input id="cohost-initiative" type="checkbox"></label>
            <label class="toggle-row"><span><b>Compréhension du programme OBS</b><small>Analyse seulement ce qui est réellement diffusé, jamais le bureau privé.</small></span><input id="cohost-screen" type="checkbox"></label>
            <div class="form-row">
              <label>Intervalle minimum (min)<input id="cohost-interval" type="number" min="2" max="60"></label>
              <label>Maximum par heure<input id="cohost-max-hour" type="number" min="0" max="10"></label>
            </div>
            <label>Analyse écran toutes les secondes<input id="cohost-screen-interval" type="number" min="60" max="900"></label>
            <h3>CTA naturels</h3>
            <label class="toggle-row"><span><b>JustPlayer</b><small>Maximum limité par live.</small></span><input id="cohost-cta-justplayer" type="checkbox"></label>
            <label class="toggle-row"><span><b>Discord</b><small>Activable dès que le lien ou la commande est valide.</small></span><input id="cohost-cta-discord" type="checkbox"></label>
            <label class="toggle-row"><span><b>Suivre la chaîne</b><small>Une suggestion discrète, jamais répétitive.</small></span><input id="cohost-cta-follow" type="checkbox"></label>
          </section>
        </div>
        <div class="info-box" id="cohost-runtime">Chargement du contexte…</div>
        <div class="button-row">
          <button class="secondary-button" id="cohost-test-screen" type="button">Analyser l’écran OBS</button>
          <button class="secondary-button" id="cohost-test-initiative" type="button">Prévisualiser une initiative</button>
          <button class="secondary-button" id="cohost-test-cta" type="button">Prévisualiser JustPlayer</button>
          <button class="primary-button" id="cohost-save" type="button">Enregistrer l’assistante</button>
        </div>
        <pre id="cohost-preview" class="console-output"></pre>
      </div>`;
    document.body.append(modal);

    $('#cohost-open')?.addEventListener('click', async()=>{
      modal.classList.add('open');
      await loadCohost();
    });
    $('#cohost-close')?.addEventListener('click',()=>modal.classList.remove('open'));
    modal.addEventListener('click',event=>{if(event.target===modal)modal.classList.remove('open')});
    $('#cohost-save')?.addEventListener('click',saveCohost);
    $('#cohost-test-screen')?.addEventListener('click',async()=>{
      try{
        $('#cohost-preview').textContent='Analyse du programme OBS…';
        const result=await api('/api/cohost/screen/analyze',{method:'POST'});
        $('#cohost-preview').textContent=result.summary||result.error||'Aucun changement notable détecté.';
        await renderCohostRuntime();
      }catch(error){$('#cohost-preview').textContent=error.message;}
    });
    $('#cohost-test-initiative')?.addEventListener('click',async()=>{
      try{
        $('#cohost-preview').textContent='Mairaiy prépare une intervention…';
        const result=await api('/api/cohost/test/initiative',{method:'POST',body:JSON.stringify({publish:false})});
        $('#cohost-preview').textContent=result.text||'SKIP — aucun moment naturel pour intervenir.';
      }catch(error){$('#cohost-preview').textContent=error.message;}
    });
    $('#cohost-test-cta')?.addEventListener('click',async()=>{
      try{
        $('#cohost-preview').textContent='Mairaiy intègre le CTA au contexte…';
        const result=await api('/api/cohost/test/cta',{method:'POST',body:JSON.stringify({campaign_id:'justplayer',publish:false})});
        $('#cohost-preview').textContent=result.text||'SKIP — moment inadapté.';
      }catch(error){$('#cohost-preview').textContent=error.message;}
    });
  }

  async function loadCohost(){
    try{
      cohostProfile=await api('/api/cohost/profile');
      const owner=cohostProfile.owner||{};
      const channel=cohostProfile.channel||{};
      const links=cohostProfile.links||{};
      const assistant=cohostProfile.assistant||{};
      $('#cohost-facts').value=(owner.facts||[]).join('\n');
      $('#cohost-themes').value=(channel.themes||[]).join('\n');
      $('#cohost-games').value=(channel.recurring_games||[]).join('\n');
      $('#cohost-justplayer').value=links.justplayer_url||'';
      $('#cohost-discord').value=links.discord_url||links.discord_command||'';
      $('#cohost-initiative').checked=Boolean(assistant.initiative_enabled);
      $('#cohost-screen').checked=Boolean(assistant.screen_awareness_enabled);
      $('#cohost-interval').value=Number(assistant.initiative_min_interval_minutes||4);
      $('#cohost-max-hour').value=Number(assistant.max_initiatives_per_hour||3);
      $('#cohost-screen-interval').value=Number(assistant.screen_interval_seconds||150);
      $('#cohost-cta-justplayer').checked=Boolean(campaign('justplayer').enabled);
      $('#cohost-cta-discord').checked=Boolean(campaign('discord').enabled);
      $('#cohost-cta-follow').checked=Boolean(campaign('follow').enabled);
      await renderCohostRuntime();
    }catch(error){
      $('#cohost-runtime').textContent=error.message;
    }
  }

  async function renderCohostRuntime(){
    const [status,audio]=await Promise.all([
      api('/api/cohost/status').catch(()=>null),
      runtime(),
    ]);
    const live=status?.live_context||{};
    const screen=status?.screen||{};
    const budget=audio?.audio?.budget||{};
    $('#cohost-runtime').innerHTML=`
      <b>${status?.stream_online?'Live détecté':'Hors ligne'}</b> ·
      jeu ${esc(live.game_name||'inconnu')} · scène ${esc(screen.scene||'inconnue')}<br>
      Observation : ${esc(screen.summary||screen.error||'en attente')}<br>
      Voix Gemini : ${Number(budget.audio_minutes_today||0).toFixed(2)} min aujourd’hui ·
      coût maximal estimé ${Number(budget.estimated_usd_today||0).toFixed(3)} $ /
      plafond ${Number(budget.daily_limit_usd||0).toFixed(2)} $`;
  }

  async function saveCohost(){
    try{
      const lines=id=>$(id).value.split('\n').map(v=>v.trim()).filter(Boolean);
      const profile=structuredClone(cohostProfile||{});
      profile.owner={...(profile.owner||{}),facts:lines('#cohost-facts')};
      profile.channel={
        ...(profile.channel||{}),
        themes:lines('#cohost-themes'),
        recurring_games:lines('#cohost-games')
      };
      const discord=$('#cohost-discord').value.trim();
      profile.links={
        ...(profile.links||{}),
        justplayer_url:$('#cohost-justplayer').value.trim(),
        discord_url:/^https?:/i.test(discord)?discord:'',
        discord_command:/^https?:/i.test(discord)?(profile.links?.discord_command||'!discord'):(discord||'!discord')
      };
      profile.assistant={
        ...(profile.assistant||{}),
        initiative_enabled:$('#cohost-initiative').checked,
        screen_awareness_enabled:$('#cohost-screen').checked,
        initiative_min_interval_minutes:Number($('#cohost-interval').value||4),
        max_initiatives_per_hour:Number($('#cohost-max-hour').value||3),
        screen_interval_seconds:Number($('#cohost-screen-interval').value||150)
      };
      profile.cta_campaigns=(profile.cta_campaigns||[]).map(item=>{
        if(item.id==='justplayer') return {...item,enabled:$('#cohost-cta-justplayer').checked,target:profile.links.justplayer_url};
        if(item.id==='discord') return {...item,enabled:$('#cohost-cta-discord').checked,target:profile.links.discord_url||profile.links.discord_command};
        if(item.id==='follow') return {...item,enabled:$('#cohost-cta-follow').checked};
        return item;
      });
      cohostProfile=await api('/api/cohost/profile',{method:'PUT',body:JSON.stringify(profile)});
      if(typeof toast==='function') toast('Connaissances et initiatives de Mairaiy enregistrées');
      await renderCohostRuntime();
    }catch(error){if(typeof toast==='function')toast(error.message,true);}
  }

  function setup(){
    const form=$('#avatar-settings-form'); if(!form) return;
    installVoicePicker();
    installVoiceControlButton();
    installCohostPanel();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const payload={
        enabled:$('#avatar-enabled').checked,
        voice:$('#avatar-voice').value.trim(),
        rate:Number($('#avatar-rate').value),
        pitch:Number($('#avatar-pitch').value),
        volume:Number($('#avatar-volume').value),
        subtitles:$('#avatar-subtitles').checked,
        subtitle_seconds:12,
      };
      try{
        await api('/api/avatar/settings',{method:'PUT',body:JSON.stringify(payload)});
        if(typeof toast==='function') toast('Avatar et voix enregistrés');
      }catch(error){ if(typeof toast==='function') toast(error.message,true); }
    });
    $('#avatar-test-button')?.addEventListener('click', async () => {
      try{
        const preview=$('.avatar-preview-stage');
        preview?.classList.add('is-speaking');
        setTimeout(()=>preview?.classList.remove('is-speaking'),7000);
        await api('/api/avatar/test',{method:'POST',body:JSON.stringify({text:'Excellente nouvelle : l’explosion a parfaitement éliminé toute l’équipe. Sansa compris, évidemment.'})});
        const status=await runtime();
        if(!status?.avatar_overlay_connected){
          throw new Error('La source /overlay/avatar n’est pas connectée. Ouvre-la dans OBS ou dans un onglet, puis relance le test.');
        }
        const audio=status?.audio||{};
        if(audio.last_error){
          if(typeof toast==='function') toast(`Audio en repli : ${audio.last_error}`,true);
        }else if(typeof toast==='function'){
          const engine=audio.engine==='gemini-tts'?'Gemini naturel':audio.engine||'audio';
          toast(`${engine} · ${audio.voice||'voix automatique'} · ${audio.last_generation_ms||0} ms`);
        }
      }catch(error){ if(typeof toast==='function') toast(error.message,true); }
    });
    load();
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',setup):setup();
})();
