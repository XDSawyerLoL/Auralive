import {nativeUDConstructions} from './native_ud_constructions.js';
// Limited French discourse coreference; no broad conversational or factual claims.
const fold = v => String(v||'').toLocaleLowerCase('fr-FR').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'").trim();
function patientGender(clause, patient) {
  const tokens=fold(clause).replace(/[^\p{L}\p{N} ]/gu,' ').split(/\s+/);
  const phrase=fold(patient).split(' ');
  for(let i=0;i<tokens.length-phrase.length;i++){
    if(phrase.every((w,j)=>tokens[i+1+j]===w)){
      if(['la','une','cette','ma','ta','sa'].includes(tokens[i]))return 'f';
      if(['le','un','ce','cet','mon','ton','son'].includes(tokens[i]))return 'm';
    }
  }
  return null;
}
export function parseBoundedDiscourse(source,parseStatement){
  if(typeof parseStatement!=='function'||/[?？]/u.test(source)||String(source).length>500)return [];
  const cleft=parseObservedCleft(source,parseStatement);
  if(cleft)return [{frame:cleft,resolved:false}];
  const displaced=parseFrontedObject(source,parseStatement);
  if(displaced)return [{frame:displaced,resolved:false}];
  const explicit=parseExplicitTemporal(source,parseStatement);
  if(explicit.length)return explicit;
  const relative=parseExplicitSubjectRelative(source,parseStatement);
  if(relative.length)return relative;
  // Never flatten unsupported subordinate clauses into asserted events.
  if(/\b(?:que|qui|quand|lorsque|si|avant)\b/iu.test(fold(source)))return [];
  const clauses=String(source||'')
    .replace(/\b(il|elle)\s+(\p{L}+)\s+ensuite\s+/iu,'$1 $2 ')
    .split(/\s+(?:puis|ensuite)\s+|\s+et\s+(?=(?:il|elle)\s+)|[.;]\s*/iu)
    .map(s=>s.trim()).filter(Boolean);
  if(!clauses.length||clauses.length>4)return [];
  const output=[];
  for(const clause of clauses){
    const match=fold(clause).match(/^(il|elle|ils|elles)\s+(.+)$/u);
    if(!match){
      output.push({frame:parseStatement(clause),resolved:false});
      continue;
    }
    const prev=output.at(-1)?.frame;
    const gender=patientGender(clauses[output.length-1]||'',prev?.patient);
    // Only singular with one observable actor and a patient of opposite explicit gender.
    if(!prev||prev.kind!=='event'||!prev.polarity||
       !['il','elle'].includes(match[1])||
       gender!==(match[1]==='il'?'f':'m')||!prev.agent||!prev.patient||
       prev.agent===prev.patient){
      output.push({frame:null,resolved:false});
      continue;
    }
    const continuation=match[2].replace(/\s+ensuite\s+/u,' ');
    const frame=parseStatement(prev.agent+' '+continuation);
    output.push({frame:frame||null,resolved:Boolean(frame)});
  }
  return output;
}

// Only assert events from completed indicative temporal constructions.
// A bare "avant que", "si", "quand", or "lorsque" is not evidence of occurrence.
export function parseExplicitTemporal(source,parseStatement){
  if(typeof parseStatement!=='function'||String(source||'').length>400||
     /[?？;]/u.test(source))return [];
  const text=fold(source).replace(/[.!]\s*$/u,'');
  // "Une fois que" may be future or habitual. Only the explicitly
  // completed past on BOTH sides licenses event assertions here.
  const completedPast=/^[\p{L}-]+\s+(?:a|ont)\s+[\p{L}-]+\s+/u;
  const once=text.match(/^(.+?)\s+une fois que\s+(.+)$/u);
  if(once){
    if(!completedPast.test(once[1])||!completedPast.test(once[2]))return [];
    const later=parseStatement(once[1]),prior=parseStatement(once[2]);
    return prior?.kind==='event'&&later?.kind==='event'&&prior.polarity&&later.polarity
      ?[{frame:prior,temporal:'before',resolved:false},
        {frame:later,temporal:'after',resolved:false}]:[];
  }
  let m=text.match(/^apres que (.+?),\s*(.+)$/u);
  if(m){
    const prior=parseStatement(m[1]),later=parseStatement(m[2]);
    return prior&&later?[{frame:prior,temporal:'before',resolved:false},
      {frame:later,temporal:'after',resolved:false}]:[];
  }
  m=text.match(/^(.+?)\s+apres que\s+(.+)$/u);
  if(m){
    const later=parseStatement(m[1]),prior=parseStatement(m[2]);
    return prior&&later?[{frame:prior,temporal:'before',resolved:false},
      {frame:later,temporal:'after',resolved:false}]:[];
  }
  return [];
}
// Relative attached to an overt proper-name antecedent, bounded to two clauses.
// The restrictive form with an implicit antecedent is deliberately unsupported.
export function parseExplicitSubjectRelative(source,parseStatement){
  if(typeof parseStatement!=='function'||String(source||'').length>300||
    /[?？;]/u.test(source))return [];
  const text=fold(source).replace(/[.!]\s*$/u,'');
  const m=text.match(/^([\p{L}-]+),\s*qui\s+([^,]+),\s*(.+)$/u);
  if(!m)return [];
  const subject=m[1],dependent=parseStatement(subject+' '+m[2]);
  const main=parseStatement(subject+' '+m[3]);
  if(!dependent||!main||dependent.agent!==subject||main.agent!==subject||
      dependent.kind!=='event'||main.kind!=='event')return [];
  return [{frame:dependent,relation:'relative-subject',resolved:false},
    {frame:main,relation:'main-clause',resolved:false}];
}


// Narrow French presentational cleft: a single capitalized overt name and
// a finite affirmative relative. Acquired UD evidence gates the normalization;
// subject/predicate/object extraction still uses the existing trained parser.
// Never accept a generic noun phrase, modal, hypothetical, or subordinate.
export function parseObservedCleft(source,parseStatement){
 if(typeof parseStatement!=='function'||String(source||'').length>300||
    /[?？;,\n]/u.test(source)||!nativeUDConstructions.evidenceCleft())return null;
 const raw=String(source||'').trim();
 const match=raw.match(/^[Cc]['’]est\s+([\p{Lu}][\p{L}-]{1,34})\s+qui\s+(.+?)[.!]?\s*$/u);
 if(!match)return null;
 const dependent=match[2].replace(/[.!]\s*$/u,'').trim();
 if(!dependent||/\b(?:si|quand|lorsque|avant|apres|parce|car|que|qui|dit|pense|veut)\b/iu.test(fold(dependent)))return null;
 const frame=parseStatement(match[1]+' '+dependent);
 if(frame?.kind!=='event'||frame.voice!=='active'||
    !frame.polarity||frame.agent!==fold(match[1])||!frame.patient)return null;
 return {...frame,parser:'ud-cleft-construction',
   cleft_evidence:nativeUDConstructions.evidenceCleft()};
}


// Object dislocation: overt definite patient, overt named agent, clitic l'a,
// a single observed participle, and matching grammatical agreement.
// The resulting event is still an unverified user statement.
export function parseFrontedObject(source,parseStatement){
 if(typeof parseStatement!=='function'||String(source||'').length>300||
    /[?？;\n]/u.test(source))return null;
 const raw=String(source||'').trim().replace(/[.!]\s*$/u,'');
 const m=raw.match(/^(Le|La)\s+([\p{L}-]{2,40}),\s+([\p{Lu}][\p{L}-]{1,40})\s+l['’]a\s+([\p{L}-]{3,35})$/u);
 if(!m)return null;
 const feminine=m[1]==='La';
 const participle=fold(m[4]);
 if(feminine&&!participle.endsWith('e'))return null;
 const stem=feminine?participle.slice(0,-1):participle;
 const lemma=nativeUDConstructions.lemma(stem);
 if(!lemma||lemma==='avoir'||lemma==='etre')return null;
 const frame=parseStatement(m[3]+' a '+stem+' '+m[1]+' '+m[2]);
 if(frame?.kind!=='event'||!frame.polarity||frame.agent!==fold(m[3])||
   frame.patient!==fold(m[2])||frame.predicate!==lemma)return null;
 return {...frame,parser:'bounded-object-dislocation'};
}
