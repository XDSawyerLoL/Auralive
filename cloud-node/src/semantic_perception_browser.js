export const SEMANTIC_PERCEPTION_BROWSER = String.raw`// Runs inside BRAIN_OPERATIONS_SCRIPT's browser closure after camera/mic setup.
// Strictly opt-in. Browser-only model inference; model assets may be downloaded.
const semantic={recognizer:null,visionEnabled:false,visionBusy:false,
  classifier:null,modelPromise:null,detector:null,detectorPromise:null,visionTimer:null,detectorId:'Xenova/yolos-tiny',modelId:'onnx-community/mobilenet_v2_1.0_224'};
const perceptionMessage=s=>setText('auraPerceptionStatus',s);
async function emitPerception(kind,source,model,payload){
  const response=await fetch('/api/cognition/perception',{
    method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({kind,source,model,measured_at:new Date().toISOString(),payload})
  });
  if(!response.ok)throw Error('perception HTTP '+response.status);
  return response.json();
}
const recognitionButton=$('auraRecognizeSpeech');
const visionButton=$('auraUnderstandScene');
function stopLocalSpeech(){
  if(semantic.recognizer){
    const old=semantic.recognizer;semantic.recognizer=null;
    try{old.abort();}catch{}
  }
  recognitionButton.textContent='Comprendre la parole';
  recognitionButton.setAttribute('aria-pressed','false');
}
recognitionButton.onclick=async()=>{
 if(semantic.recognizer){stopLocalSpeech();perceptionMessage('Écoute linguistique arrêtée.');return;}
 if(!senseState.mic){perceptionMessage('Activer d’abord Ouïe pour autoriser le microphone.');return;}
 // No remote speech fallback: processLocally must be actually available.
 const Speech=window.SpeechRecognition;
 if(!Speech||!Speech.prototype||!('processLocally' in Speech.prototype)||
    typeof Speech.available!=='function'){
   perceptionMessage('Reconnaissance vocale locale indisponible dans ce navigateur. Aucun service distant utilisé.');
   return;
 }
 recognitionButton.disabled=true;
 try{
   const options={langs:['fr-FR'],processLocally:true};
   let availability=await Speech.available(options);
   if(availability==='downloadable'||availability==='downloading'){
     perceptionMessage('Installation du modèle linguistique local français…');
     if(typeof Speech.install!=='function'||!await Speech.install(options))
       throw Error('modèle français local non installé');
     availability=await Speech.available(options);
   }
   if(availability!=='available')throw Error('reconnaissance fr-FR non disponible localement');
   if(!senseState.mic)throw Error('microphone désactivé');
   const recognizer=new Speech();
   if(!('processLocally' in recognizer))throw Error('reconnaissance locale non confirmée');
   recognizer.processLocally=true;
   recognizer.lang='fr-FR';
   recognizer.continuous=false;recognizer.interimResults=false;recognizer.maxAlternatives=1;
   recognizer.onresult=async event=>{
     if(semantic.recognizer!==recognizer)return;
     const item=event.results?.[event.resultIndex]?.[0];
     const transcript=String(item?.transcript||'').trim().slice(0,300);
     if(!transcript)return;
     chatLine('AURA · PERCEPTION VOCALE LOCALE','Transcription proposée : '+transcript,'aura-initiative');
     try{
       await emitPerception('speech-transcription','browser-ondevice-speechrecognition',
         'browser-fr-FR',{text:transcript,language:'fr-FR',final:true});
       perceptionMessage('Parole reconnue sur appareil et transmise comme hypothèse sensorielle, pas comme commande.');
     }catch{perceptionMessage('Parole transcrite localement ; noyau non disponible pour enregistrer le signal.');}
   };
   recognizer.onerror=event=>{
     if(semantic.recognizer===recognizer)
       perceptionMessage('Reconnaissance locale interrompue : '+String(event.error||'inconnue').slice(0,50));
   };
   recognizer.onend=()=>{
     if(semantic.recognizer===recognizer){semantic.recognizer=null;
       recognitionButton.textContent='Comprendre la parole';
       recognitionButton.setAttribute('aria-pressed','false');}
   };
   semantic.recognizer=recognizer;
   recognizer.start();
   recognitionButton.textContent='Arrêter la transcription';
   recognitionButton.setAttribute('aria-pressed','true');
   perceptionMessage('Transcription fr-FR active sur cet appareil, sans fallback distant.');
 }catch(err){
   stopLocalSpeech();
   perceptionMessage('Impossible d’activer la transcription locale : '+String(err?.message||err).slice(0,130));
 }finally{recognitionButton.disabled=false;}
};
function stopVisualMeaning(){
 semantic.visionEnabled=false;
 if(semantic.visionTimer){clearInterval(semantic.visionTimer);semantic.visionTimer=null;}
 visionButton.textContent='Comprendre la scène';visionButton.setAttribute('aria-pressed','false');
}
async function ensureClassifier(){
 if(semantic.classifier)return semantic.classifier;
 if(!semantic.modelPromise){
   semantic.modelPromise=(async()=>{
     // Library and weights are downloaded only after explicit activation.
     // Actual image inference occurs in this browser (WASM), not Hostinger.
     const module=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0');
     return module.pipeline('image-classification',semantic.modelId,{device:'wasm'});
   })().catch(error=>{semantic.modelPromise=null;throw error;});
 }
 semantic.classifier=await semantic.modelPromise;
 return semantic.classifier;
}
async function ensureDetector(){
 if(semantic.detector)return semantic.detector;
 if(!semantic.detectorPromise){
   semantic.detectorPromise=(async()=>{
     const module=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0');
     return module.pipeline('object-detection',semantic.detectorId,{device:'wasm'});
   })().catch(error=>{semantic.detectorPromise=null;throw error;});
 }
 semantic.detector=await semantic.detectorPromise;
 return semantic.detector;
}
async function classifyCurrentView(){
 const video=$('auraCameraPreview');
 if(semantic.visionBusy||!semantic.visionEnabled||!senseState.cam||document.hidden||
   !video.videoWidth||!video.videoHeight)return;
 semantic.visionBusy=true;
 try{
   perceptionMessage('Analyse visuelle locale en cours…');
   const classifier=await ensureClassifier();
   if(!semantic.visionEnabled||!senseState.cam)return;
   const canvas=document.createElement('canvas');canvas.width=224;canvas.height=224;
   canvas.getContext('2d').drawImage(video,0,0,224,224);
   const ranked=await classifier(canvas,{top_k:1});
   // Never transmit the frame or canvas. Top-1 model prediction only.
   const first=Array.isArray(ranked)?ranked[0]:null;
   const label=String(first?.label||'').replace(/[^\p{L}\p{N},.()' /_-]/gu,'').trim().slice(0,90);
   const confidence=Number(first?.score);
   if(!label||!Number.isFinite(confidence))throw Error('résultat de classification absent');
   if(!semantic.visionEnabled||!senseState.cam)return;
   await emitPerception('visual-classification','browser-ondevice-transformers',
     semantic.modelId,{label,confidence});
   // Optional object-level localization. No frame or screenshot is sent.
   // Failure does not suppress the already available image classification.
   try{
     const detector=await ensureDetector();
     if(semantic.visionEnabled&&senseState.cam){
       const detections=await detector(canvas,{threshold:.65});
       const objects=(Array.isArray(detections)?detections:[]).slice(0,8)
         .filter(x=>x?.box&&Number.isFinite(Number(x.score)))
         .map(item=>({
           label:String(item.label||'').replace(/[^\p{L}\p{N},.()' /_-]/gu,'').trim().slice(0,70),
           confidence:Math.max(0,Math.min(1,Number(item.score))),
           box:{
             xmin:Math.max(0,Math.min(1,Number(item.box.xmin)/224)),
             ymin:Math.max(0,Math.min(1,Number(item.box.ymin)/224)),
             xmax:Math.max(0,Math.min(1,Number(item.box.xmax)/224)),
             ymax:Math.max(0,Math.min(1,Number(item.box.ymax)/224)),
           },
         }))
         .filter(x=>x.label.length>=2&&x.box.xmin<x.box.xmax&&x.box.ymin<x.box.ymax);
       if(semantic.visionEnabled&&senseState.cam){
         await emitPerception('visual-objects','browser-ondevice-transformers',
           semantic.detectorId,{objects});
         if(objects.length)chatLine('AURA · LOCALISATION VISUELLE LOCALE',
           objects.slice(0,3).map(x=>x.label+' ('+Math.round(x.confidence*100)+' %)').join(', ')+
           ' — catégories non vérifiées','aura-initiative');
       }
     }
   }catch(error){
     perceptionMessage('Classification active ; localisation indisponible : '+
       String(error?.message||error).slice(0,85));
   }
   chatLine('AURA · HYPOTHÈSE VISUELLE LOCALE',
     label+' · confiance du modèle '+Math.round(confidence*100)+' % (non vérifié)','aura-initiative');
   perceptionMessage('Classification calculée localement ; pas de reconnaissance générale de la scène.');
 }catch(err){
   stopVisualMeaning();
   perceptionMessage('Modèle visuel local indisponible : '+String(err?.message||err).slice(0,135));
 }finally{semantic.visionBusy=false;}
}
visionButton.onclick=async()=>{
 if(semantic.visionEnabled){stopVisualMeaning();perceptionMessage('Classification visuelle arrêtée.');return;}
 if(!senseState.cam){perceptionMessage('Activer d’abord Vue pour autoriser la caméra.');return;}
 semantic.visionEnabled=true;
 visionButton.textContent='Arrêter la vision locale';
 visionButton.setAttribute('aria-pressed','true');
 perceptionMessage('Chargement du modèle de classification local (téléchargement initial possible)…');
 await classifyCurrentView();
 if(semantic.visionEnabled&&!semantic.visionTimer)
   semantic.visionTimer=setInterval(()=>{void classifyCurrentView();},20000);
};
window.addEventListener('pagehide',()=>{stopLocalSpeech();stopVisualMeaning();});
`;
