(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const api = async (url, options={}) => {
    const response = await fetch(url, {headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options});
    if (!response.ok) throw new Error((await response.text()).replace(/^"|"$/g,''));
    return response.status === 204 ? {} : response.json();
  };
  const naturalVoices = [
    ['Aoede','Aérée et naturelle'], ['Sulafat','Chaleureuse'], ['Leda','Jeune et vive'],
    ['Achernar','Douce'], ['Laomedeia','Enjouée'], ['Vindemiatrix','Délicate'],
    ['Callirrhoe','Détendue'], ['Erinome','Claire'], ['Kore','Assurée']
  ];
  async function runtime(){
    try{return await api('/api/avatar/runtime')}catch{return null}
  }
  function installVoicePicker(){
    const input=$('#avatar-voice'); if(!input) return;
    input.placeholder='Aoede — voix naturelle par défaut';
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
      note.textContent='Gemini TTS expressif. Laisse vide pour Aoede.';
      label.append(note);
    }
  }
  async function load(){
    const form=$('#avatar-settings-form'); if(!form) return;
    try{
      const data=await api('/api/avatar/settings');
      $('#avatar-enabled').checked=Boolean(data.enabled);
      $('#avatar-voice').value=data.voice||'';
      $('#avatar-rate').value=Number(data.rate||1);
      $('#avatar-pitch').value=Number(data.pitch||1);
      $('#avatar-volume').value=Number(data.volume??1);
      $('#avatar-subtitles').checked=Boolean(data.subtitles);
    }catch(error){ if(typeof toast==='function') toast(error.message,true); }
  }
  function setup(){
    const form=$('#avatar-settings-form'); if(!form) return;
    installVoicePicker();
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
        await api('/api/avatar/test',{method:'POST',body:JSON.stringify({text:'Bonsoir le Spot. Je suis Mairaiy, et cette fois ma voix devrait vraiment vous donner l’impression que je suis là, juste à côté de vous.'})});
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