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
  const clauses=String(source||'').split(/\s+(?:puis|ensuite)\s+|[.;]\s*/iu)
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
    const frame=parseStatement(prev.agent+' '+match[2]);
    output.push({frame:frame||null,resolved:Boolean(frame)});
  }
  return output;
}
