// Explicit, provenance-preserving recognition of the authenticated founder.
// No similarity search against arbitrary projects, no inferred personal traits.
// An identity note is a user declaration, NOT independent identification.
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[’']/g,"'").trim();
const personal=/\b(?:profil personnel|profil du fondateur|profil fondateur|profil utilisateur|identite du fondateur|identite de l utilisateur|presentation du fondateur|biographie du fondateur|qui je suis|a propos de moi|mon nom|mon prenom)\b/;
const secret=/\b(?:mot de passe|password|secret|token|cle api|api key|carte bancaire|numero de carte|code pin)\b/;
const admissibleSource=/^(?:fondateur(?::|\/|-)|founder(?::|\/|-)|utilisateur(?::|\/|-)|user(?::|\/|-))/i;
const redact=s=>String(s||'').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[adresse privée]')
  .replace(/\b(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}\b/g,'[numéro privé]')
  .replace(/\b(?:sk-|gsk_|ghp_|gho_)[a-z0-9_-]{12,}\b/gi,'[secret masqué]');
export function selectFounderProfile(notes,{authenticated=false,limit=3}={}){
 if(!authenticated||!Array.isArray(notes))return [];
 const chosen=[];
 for(const note of notes){
  if(!note||note.status!=='active')continue;
  if(!['fact','note'].includes(String(note.kind||'')))continue;
  const source=String(note.source||'');
  if(!admissibleSource.test(source))continue;
  const descriptors=[note.title,note.project,...(Array.isArray(note.tags)?note.tags:[])].map(fold).join(' ');
  if(!personal.test(descriptors))continue;
  if(secret.test(fold(note.title))||secret.test(fold(note.body)))continue;
  const detail=redact(String(note.body||'').replace(/\s+/g,' ')).trim().slice(0,230);
  if(!detail)continue;
  // No duplicate biographical claim is fed to a speech provider.
  if(chosen.some(x=>fold(x.detail)===fold(detail)))continue;
  chosen.push({
    id:note.id??null,
    title:redact(String(note.title||'').slice(0,75)),
    detail,
    provenance:'déclaration du fondateur en mémoire, non vérifiée indépendamment',
  });
  if(chosen.length>=Math.max(1,Math.min(4,Number(limit)||3)))break;
 }
 return chosen;
}

// Read-only derivation from existing authenticated founder chat records.
// It does not introduce automatic background storage or accept arbitrary
// project narratives as personal facts. Name is a self-declaration only.
export function founderIdentityDeclarations(rows,{authenticated=false}={}){
 if(!authenticated||!Array.isArray(rows))return [];
 const excluded=new Set(['aura','assistant','assistant(e)','personne','utilisateur','recherche','personnage','pas','dans','mon']);
 for(const row of rows.slice(0,40)){
  const message=String(row?.content||'').trim().slice(0,900);
  if(!message)continue;
  // Only direct first-person statements; never "X said that I am Y".
  const match=message.match(/\b(?:je m['’]appelle|mon pr[eé]nom est|mon nom est)\s+([\p{L}][\p{L}'’-]{1,34})/iu);
  if(!match)continue;
  const name=match[1].replace(/[’'-]+$/,'');
  if(excluded.has(fold(name)))continue;
  if(/\b(?:fiction|roman|personnage|exemple|imaginons|supposons|citation)\b/i.test(message.slice(0,100)))continue;
  return [{
   title:'Profil du fondateur · prénom déclaré',
   project:'profil personnel',tags:['profil du fondateur'],kind:'fact',
   status:'active',source:'fondateur:conversation',
   body:'Dans une conversation, tu m’as dit que ton prénom ou nom d’usage est '+name+'.',
  }];
 }
 return [];
}
