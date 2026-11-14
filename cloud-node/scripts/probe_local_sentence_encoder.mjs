// This probe runs REAL local model weights; no mocks and no remote network.
// Nonzero exit means deployment remains unverified.
import {NativeLocalSemanticEncoder,dotSimilarity}
 from '../src/native_local_sentence_encoder.js';
const encoder=new NativeLocalSemanticEncoder();
if(!encoder.config.ready){
 console.error(JSON.stringify({ok:false,diagnostic:encoder.diagnostic(),
  reason:'Install offline ONNX assets before trying to benchmark local inference'}));
 process.exitCode=2;
}else{
 const start=performance.now();
 const sentences=[
  'Le chat se repose sur le canapé.',
  'Un félin dort sur le sofa.',
  'Le train arrive à la gare.',
  'Le train ne vient pas à la gare.'
 ];
 const vectors=[];
 for(const text of sentences){
  const vector=await encoder.embed(text);
  if(!vector)break;
  vectors.push(vector);
 }
 const duration_ms=Math.round(performance.now()-start);
 const rss_mb=Math.round(process.memoryUsage().rss/1048576);
 const output={
  ok:vectors.length===4,
  model:encoder.diagnostic().model,
  vectors:vectors.length,
  semantic_paraphrase_cosine:vectors.length===4?dotSimilarity(vectors[0],vectors[1]):null,
  unrelated_cosine:vectors.length===4?dotSimilarity(vectors[0],vectors[2]):null,
  negation_cosine:vectors.length===4?dotSimilarity(vectors[2],vectors[3]):null,
  elapsed_ms:duration_ms,rss_mb,
  diagnostic:encoder.diagnostic(),
  caveat:'Similarity is not entailment and cannot establish that an event happened'
 };
 console.log(JSON.stringify(output,null,2));
 if(!output.ok)process.exitCode=1;
}
