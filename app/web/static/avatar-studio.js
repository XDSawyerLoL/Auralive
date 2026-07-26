(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const api = async (url, options={}) => {
    const response = await fetch(url, {headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options});
    if (!response.ok) throw new Error((await response.text()).replace(/^"|"$/g,''));
    return response.status === 204 ? {} : response.json();
  };
  async function runtime(){
    try{return await api('/api/avatar/runtime')}catch{return null}
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
        setTimeout(()=>preview?.classList.remove('is-speaking'),4200);
        await api('/api/avatar/test',{method:'POST',body:JSON.stringify({text:'Bonjour, je suis Aura. Ma voix et mon avatar sont correctement reliés à OBS.'})});
        const status=await runtime();
        if(!status?.avatar_overlay_connected){
          throw new Error('La source /overlay/avatar n’est pas connectée. Ouvre-la dans OBS ou dans un onglet, puis relance le test.');
        }
        if(status?.audio?.last_error){
          if(typeof toast==='function') toast(`Voix Windows indisponible, repli navigateur : ${status.audio.last_error}`,true);
        }else if(typeof toast==='function'){
          toast(`Test audio envoyé à Mairaiy en ${status?.audio?.last_duration_ms||0} ms`);
        }
      }catch(error){ if(typeof toast==='function') toast(error.message,true); }
    });
    load();
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',setup):setup();
})();
