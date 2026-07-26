const C = (selector, root=document) => root.querySelector(selector);
const CA = (selector, root=document) => [...root.querySelectorAll(selector)];
const completeState = {summary:null,faq:[],permits:[],restrictions:[],audience:[],connectors:[],clipRules:[],features:[]};

async function cApi(url, options={}) {
  const response = await fetch(url,{headers:{"Content-Type":"application/json"},...options});
  const text=await response.text(); let payload={};
  try{payload=text?JSON.parse(text):{}}catch{payload={detail:text}}
  if(!response.ok) throw new Error(payload.detail||payload.message||`Erreur ${response.status}`);
  return payload;
}
function cEsc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c])}
function cDate(value){if(!value)return"—";const d=new Date(value);return Number.isNaN(d.getTime())?value:new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(d)}
function cToast(message,error=false){if(typeof toast==="function")toast(message,error);else console[error?"error":"log"](message)}
function setBusy(node,busy){node?.classList.toggle("complete-loading",busy)}

window.loadCompletePage = async function(page){
  const loaders={
    gamesplus:loadCompleteGames,knowledge:loadKnowledge,audience:loadAudience,
    livefinish:loadLiveFinish,"advanced-overlays":async()=>{},connectors:loadConnectors,coverage:loadCoverage
  };
  if(loaders[page])await loaders[page]();
};

async function loadCompleteSummary(){completeState.summary=await cApi('/api/complete/summary');return completeState.summary}
async function loadCompleteGames(){
  const [summary,topwords]=await Promise.all([loadCompleteSummary(),cApi('/api/complete/topwords')]);
  const active=summary.active_games||[];
  C('#complete-game-summary').innerHTML=[
    [active.length,'Sessions actives'],[(topwords?.results||[]).reduce((s,r)=>s+Number(r.votes||0),0),'Votes TopWords'],['10','Mini-jeux chat'],['Temps réel','Overlays']
  ].map(([v,l])=>`<article class="summary-card"><small>${l}</small><b>${cEsc(v)}</b></article>`).join('');
  renderTopwords(topwords);
  const bingo=active.find(g=>g.game_type==='bingo');
  if(C('#bingo-last-number')){let state={};try{state=typeof bingo?.state==='string'?JSON.parse(bingo.state):bingo?.state||{}}catch{};C('#bingo-last-number').textContent=(state.drawn||[]).at(-1)||'—'}
}
function renderTopwords(data){const node=C('#topwords-panel');if(!node)return;if(!data){node.innerHTML='<div class="complete-empty">Aucun TopWords actif.</div>';return}const total=Math.max(1,(data.results||[]).reduce((s,r)=>s+Number(r.votes||0),0));node.innerHTML=`<h4 class="complete-section-title">${cEsc(data.title)}</h4><div class="topword-results">${(data.results||[]).map(r=>`<div class="topword-result"><b>${cEsc(r.option)}</b><div class="bar"><i style="width:${Math.round(Number(r.votes||0)*100/total)}%"></i></div><span>${r.votes||0}</span></div>`).join('')}</div>`}

async function loadKnowledge(){
  [completeState.faq,completeState.permits,completeState.restrictions]=await Promise.all([cApi('/api/complete/faq'),cApi('/api/complete/permits'),cApi('/api/complete/restrictions')]);
  renderFAQ();renderPermits();renderRestrictions();
}
function renderFAQ(){const node=C('#faq-list');if(!node)return;node.innerHTML=completeState.faq.length?completeState.faq.map(row=>`<div class="complete-item"><div><h4>${cEsc(row.question)}</h4><p>${cEsc(row.answer)}</p><p>${(row.keywords||[]).map(k=>`#${cEsc(k)}`).join(' ')}</p></div><div class="actions"><button class="danger" data-faq-delete="${row.id}">Supprimer</button></div></div>`).join(''):'<div class="complete-empty">Aucune FAQ.</div>'}
function renderPermits(){const node=C('#permit-list');if(!node)return;node.innerHTML=completeState.permits.length?completeState.permits.map(row=>`<div class="complete-item"><div><h4>${cEsc(row.display_name||row.login)}</h4><p>Expire ${cDate(row.expires_at)} · par ${cEsc(row.issued_by)}</p></div><div class="actions"><button class="danger" data-permit-delete="${cEsc(row.user_id)}">Retirer</button></div></div>`).join(''):'<div class="complete-empty">Aucun permis actif.</div>'}
function renderRestrictions(){const node=C('#restriction-list');if(!node)return;node.innerHTML=completeState.restrictions.length?completeState.restrictions.map(row=>`<div class="complete-item"><div><h4>${cEsc(row.display_name||row.login)}</h4><p>${cEsc(row.reason)} · jusqu'au ${cDate(row.expires_at)}</p></div><div class="actions"><button class="danger" data-restriction-delete="${cEsc(row.user_id)}">Lever</button></div></div>`).join(''):'<div class="complete-empty">Aucune restriction active.</div>'}

async function loadAudience(){completeState.audience=await cApi('/api/complete/audience');renderAudience()}
function renderAudience(){const active=completeState.audience.filter(r=>r.active);const followers=active.filter(r=>r.kind==='follower');const subs=active.filter(r=>r.kind==='subscriber');const ended=completeState.audience.filter(r=>r.kind==='follower'&&!r.active);C('#audience-summary').innerHTML=[[followers.length,'Followers actifs'],[subs.length,'Abonnés actifs'],[ended.length,'Unfollowers détectés'],[completeState.audience.length,'Profils historisés']].map(([v,l])=>`<article class="summary-card"><small>${l}</small><b>${v}</b></article>`).join('');C('#audience-active').innerHTML=active.slice(0,200).map(r=>`<div class="complete-table-row"><div><b>${cEsc(r.display_name||r.login)}</b><small>@${cEsc(r.login)} · ${cEsc(r.kind)}</small></div><span>${cDate(r.first_seen)}</span><span class="state-dot active">Actif</span></div>`).join('')||'<div class="complete-empty">Aucune donnée. Lance une synchronisation.</div>';C('#audience-ended').innerHTML=ended.slice(0,200).map(r=>`<div class="complete-table-row"><div><b>${cEsc(r.display_name||r.login)}</b><small>@${cEsc(r.login)}</small></div><span>${cDate(r.ended_at)}</span><span>Unfollow</span></div>`).join('')||'<div class="complete-empty">Aucun unfollow détecté.</div>'}

async function loadLiveFinish(){completeState.clipRules=await cApi('/api/complete/clip-rules');renderClipRules()}
function renderClipRules(){const node=C('#clip-rule-list');if(!node)return;const labels={'channel.cheer':'Bits élevés','channel.raid':'Gros raid','channel.hype_train.end':'Fin de Hype Train'};node.innerHTML=completeState.clipRules.map(row=>`<div class="complete-item" data-clip-rule="${cEsc(row.event_type)}"><div><h4>${labels[row.event_type]||cEsc(row.event_type)}</h4><p>Seuil : ${row.threshold} · délai : ${row.delay_seconds}s</p></div><div class="actions"><label class="switch"><input type="checkbox" data-clip-enabled ${row.enabled?'checked':''}><span></span></label><button data-clip-edit>Configurer</button></div></div>`).join('')}

async function loadConnectors(){completeState.connectors=await cApi('/api/complete/connectors');renderConnectors()}
function renderConnectors(){const node=C('#connector-list');if(!node)return;node.innerHTML=completeState.connectors.length?completeState.connectors.map(row=>`<div class="complete-item"><div><h4>${cEsc(row.name)}</h4><p>${cEsc(row.kind)} · ${row.enabled?'activé':'désactivé'} · ${cEsc(row.last_status||'non testé')}</p></div><div class="actions"><button data-connector-test="${row.id}">Tester</button><button class="danger" data-connector-delete="${row.id}">Supprimer</button></div></div>`).join(''):'<div class="complete-empty">Aucun connecteur externe configuré.</div>'}

async function loadCoverage(){completeState.features=await cApi('/api/complete/features');const node=C('#feature-matrix');node.innerHTML=completeState.features.map(row=>`<article class="feature-row"><div><small>${cEsc(row.group)}</small><h3>${cEsc(row.name)}</h3><p>${cEsc(row.detail)}</p></div><span class="feature-status ${cEsc(row.status)}">${row.status==='ready'?'Prêt':row.status==='configured'?'À configurer':'Externe'}</span></article>`).join('')}

C('#drop-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await cApi('/api/complete/games/drop',{method:'POST',body:JSON.stringify({amount:Number(C('#drop-amount').value),actor:'Sansa'})});cToast('Drop lancé');await loadCompleteGames()}catch(err){cToast(err.message,true)}});
C('#decrypt-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await cApi('/api/complete/games/decrypt',{method:'POST',body:JSON.stringify({word:C('#decrypt-word').value,actor:'Sansa'})});cToast('Décryptage lancé');await loadCompleteGames()}catch(err){cToast(err.message,true)}});
C('#bingo-start')?.addEventListener('click',async()=>{try{await cApi('/api/complete/games/bingo',{method:'POST',body:JSON.stringify({actor:'Sansa'})});cToast('Bingo ouvert');await loadCompleteGames()}catch(e){cToast(e.message,true)}});
C('#bingo-draw')?.addEventListener('click',async()=>{try{const r=await cApi('/api/complete/games/bingo/draw',{method:'POST'});C('#bingo-last-number').textContent=r.number||'—';if(r.number)await cApi('/api/chat/send',{method:'POST',body:JSON.stringify({message:`Bingo : numéro ${r.number}.`})})}catch(e){cToast(e.message,true)}});
C('#bingo-end')?.addEventListener('click',async()=>{try{await cApi('/api/complete/games/bingo/end',{method:'POST'});cToast('Bingo terminé');await loadCompleteGames()}catch(e){cToast(e.message,true)}});
C('#topwords-form')?.addEventListener('submit',async e=>{e.preventDefault();const options=C('#topwords-options').value.split('|').map(v=>v.trim()).filter(Boolean);try{await cApi('/api/complete/topwords',{method:'POST',body:JSON.stringify({title:C('#topwords-title').value,options,actor:'Sansa',minutes:5})});cToast('TopWords lancé');await loadCompleteGames()}catch(err){cToast(err.message,true)}});
C('#topwords-close')?.addEventListener('click',async()=>{try{const r=await cApi('/api/complete/topwords/close',{method:'POST'});cToast(r.message);await loadCompleteGames()}catch(e){cToast(e.message,true)}});
C('#complete-refresh-games')?.addEventListener('click',()=>loadCompleteGames().catch(e=>cToast(e.message,true)));

C('#faq-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await cApi('/api/complete/faq',{method:'POST',body:JSON.stringify({question:C('#faq-question').value,answer:C('#faq-answer').value,keywords:C('#faq-keywords').value.split(',').map(v=>v.trim()).filter(Boolean),enabled:true})});e.target.reset();cToast('FAQ ajoutée');await loadKnowledge()}catch(err){cToast(err.message,true)}});
C('#permit-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await cApi('/api/complete/permits',{method:'POST',body:JSON.stringify({login:C('#permit-login').value,minutes:Number(C('#permit-minutes').value),issued_by:'Sansa'})});e.target.reset();C('#permit-minutes').value=5;cToast('Permis accordé');await loadKnowledge()}catch(err){cToast(err.message,true)}});
C('#restriction-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await cApi('/api/complete/restrictions',{method:'POST',body:JSON.stringify({login:C('#restriction-login').value,minutes:Number(C('#restriction-minutes').value),reason:C('#restriction-reason').value,issued_by:'Sansa'})});e.target.reset();C('#restriction-minutes').value=10;C('#restriction-reason').value='Restriction temporaire';cToast('Restriction appliquée');await loadKnowledge()}catch(err){cToast(err.message,true)}});
document.addEventListener('click',async e=>{const faq=e.target.closest('[data-faq-delete]');const permit=e.target.closest('[data-permit-delete]');const restriction=e.target.closest('[data-restriction-delete]');const connector=e.target.closest('[data-connector-delete]');const connectorTest=e.target.closest('[data-connector-test]');const copy=e.target.closest('[data-copy-complete]');const clip=e.target.closest('[data-clip-edit]');try{if(faq){await cApi(`/api/complete/faq/${faq.dataset.faqDelete}`,{method:'DELETE'});await loadKnowledge()}if(permit){await cApi(`/api/complete/permits/${permit.dataset.permitDelete}`,{method:'DELETE'});await loadKnowledge()}if(restriction){await cApi(`/api/complete/restrictions/${restriction.dataset.restrictionDelete}`,{method:'DELETE'});await loadKnowledge()}if(connector){await cApi(`/api/complete/connectors/${connector.dataset.connectorDelete}`,{method:'DELETE'});await loadConnectors()}if(connectorTest){const r=await cApi(`/api/complete/connectors/${connectorTest.dataset.connectorTest}/test`,{method:'POST'});cToast(r.status,!r.ok);await loadConnectors()}if(copy){const url=`${location.origin}${copy.dataset.copyComplete}`;await navigator.clipboard.writeText(url);cToast('Lien copié')}if(clip){const card=clip.closest('[data-clip-rule]');const eventType=card.dataset.clipRule;const current=completeState.clipRules.find(r=>r.event_type===eventType);const threshold=Number(prompt('Seuil de déclenchement',current?.threshold??0));if(Number.isNaN(threshold))return;const delay=Number(prompt('Délai avant le clip (0 à 30 secondes)',current?.delay_seconds??0));await cApi(`/api/complete/clip-rules/${encodeURIComponent(eventType)}`,{method:'PUT',body:JSON.stringify({threshold,delay_seconds:delay,enabled:card.querySelector('[data-clip-enabled]').checked})});cToast('Règle mise à jour');await loadLiveFinish()}}catch(err){cToast(err.message,true)}});

document.addEventListener('change',async e=>{if(!e.target.matches('[data-clip-enabled]'))return;const card=e.target.closest('[data-clip-rule]');const eventType=card.dataset.clipRule;const current=completeState.clipRules.find(r=>r.event_type===eventType);try{await cApi(`/api/complete/clip-rules/${encodeURIComponent(eventType)}`,{method:'PUT',body:JSON.stringify({threshold:Number(current?.threshold||0),delay_seconds:Number(current?.delay_seconds||0),enabled:e.target.checked})});cToast('Règle enregistrée');await loadLiveFinish()}catch(err){cToast(err.message,true)}});

C('#audience-sync')?.addEventListener('click',async e=>{setBusy(e.currentTarget,true);try{const r=await cApi('/api/complete/audience/sync',{method:'POST'});cToast(`Synchronisé : ${r.followers} followers, ${r.subscribers} abonnés`);await loadAudience()}catch(err){cToast(err.message,true)}finally{setBusy(e.currentTarget,false)}});
C('#credits-start')?.addEventListener('click',async()=>{try{await cApi('/api/complete/credits/start',{method:'POST'});cToast('Générique envoyé à l’overlay')}catch(e){cToast(e.message,true)}});
C('#title-ai-form')?.addEventListener('submit',async e=>{e.preventDefault();const node=C('#title-ai-result');node.textContent='Génération…';try{node.textContent=(await cApi('/api/complete/ai/title',{method:'POST',body:JSON.stringify({text:C('#title-ai-text').value})})).result}catch(err){node.textContent=err.message}});
C('#enhance-ai-form')?.addEventListener('submit',async e=>{e.preventDefault();const node=C('#enhance-ai-result');node.textContent='Génération…';try{node.textContent=(await cApi('/api/complete/ai/enhance',{method:'POST',body:JSON.stringify({text:C('#enhance-ai-text').value})})).result}catch(err){node.textContent=err.message}});
C('#recap-ai')?.addEventListener('click',async()=>{const node=C('#recap-ai-result');node.textContent='Génération…';try{node.textContent=(await cApi('/api/complete/ai/recap',{method:'POST'})).result}catch(err){node.textContent=err.message}});
C('#ping-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await cApi('/api/complete/pings',{method:'POST',body:JSON.stringify({title:'TEST PING',message:C('#ping-message-input').value,priority:'normal',actor:'Dashboard'})});cToast('Ping envoyé')}catch(err){cToast(err.message,true)}});
C('#connector-form')?.addEventListener('submit',async e=>{e.preventDefault();try{let config={};try{config=JSON.parse(C('#connector-config').value||'{}')}catch{throw new Error('Configuration JSON invalide')}await cApi('/api/complete/connectors',{method:'POST',body:JSON.stringify({name:C('#connector-name').value,kind:C('#connector-kind').value,config,enabled:C('#connector-enabled').checked})});e.target.reset();C('#connector-config').value='{}';cToast('Connecteur enregistré');await loadConnectors()}catch(err){cToast(err.message,true)}});

setInterval(()=>{if(location.hash==='#gamesplus')loadCompleteGames().catch(()=>{})},5000);
