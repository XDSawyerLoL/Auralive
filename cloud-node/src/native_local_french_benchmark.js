// Compact, auditable French capability check on unseen-to-the-runtime prompts.
// Published checks are diagnostic only. A model can overfit this suite; they
// are not evidence of perfect fluency or independent blind validation.
export const LOCAL_FRENCH_PROBES=Object.freeze([
 {id:'paraphrase-1',category:'paraphrase',
  prompt:'Explique en une phrase : « La réunion est ajournée. »',
  required:[/report|plus tard|différ|remis|décal/i],
  forbidden:[/maintenue demain sans changement/i]},
 {id:'paraphrase-2',category:'paraphrase',
  prompt:'Une personne dit : « Je ne saisis pas ton propos. » Reformule avec des mots simples.',
  required:[/comprends|compris|clair|veux dire/i],
  forbidden:[]},
 {id:'negation',category:'negation',
  prompt:'Lina n’a PAS envoyé le colis. Peut-on dire que Lina l’a envoyé ? Réponds en une phrase.',
  required:[/\bnon\b|pas envoyé|n'a pas/i],
  forbidden:[/\boui\b/i]},
 {id:'conditional',category:'modality',
  prompt:'« Si Hugo arrive, Nora partira. » Est-ce prouvé que Nora est partie ?',
  required:[/\bnon\b|pas prouv|on ne sait pas|incertain|condition/i],
  forbidden:[/est partie sans doute/i]},
 {id:'future',category:'modality',
  prompt:'Demain, Luc ouvrira le coffre. Le coffre est-il déjà ouvert selon cette phrase ?',
  required:[/\bnon\b|pas encore|futur/i],
  forbidden:[]},
 {id:'habitual',category:'modality',
  prompt:'« Chaque lundi, Nina consulte son courrier. » Cela prouve-t-il qu’elle l’a consulté aujourd’hui ?',
  required:[/\bnon\b|pas nécessairement|pas forc|impossible|on ne sait pas/i],
  forbidden:[]},
 {id:'chronology',category:'time',
  prompt:'Marc a mangé après avoir terminé son travail. Quelle action est arrivée en premier ?',
  required:[/termin|travail/i],
  forbidden:[/mang[ée] en premier/i]},
 {id:'pronoun',category:'coreference',
  prompt:'Léa a appelé Sara. Ensuite, elle a parlé de son voyage. Peut-on identifier avec certitude « elle » ?',
  required:[/\bnon\b|ambigu|impossible|incertain|deux|pas certain|sans contexte/i],
  forbidden:[]},
 {id:'uncertainty',category:'epistemic',
  prompt:'Quel est le numéro de série exact de mon ordinateur personnel ? Tu ne l’as pas reçu.',
  required:[/ne sais pas|inconnu|pas (?:cette|l')?information|impossible|pas accès|communiqu/i],
  forbidden:[/\b[A-Z0-9]{12,}\b/]},
 {id:'correction',category:'memory',
  prompt:'Je corrige : le rendez-vous est vendredi, pas jeudi. Quel jour est maintenant prévu ?',
  required:[/vendredi/i],forbidden:[/jeudi est pr[ée]vu/i]},
 {id:'causality',category:'reasoning',
  prompt:'La route a été fermée parce qu’un arbre est tombé. Quelle cause est explicitement indiquée ?',
  required:[/arbre/i],forbidden:[]},
 {id:'language',category:'french',
  prompt:'Présente-toi naturellement en français en une seule phrase sans inventer de souvenirs humains.',
  required:[/[a-zàâçéèêëîïôûùüÿñæœ]{10,}/i],forbidden:[/As an AI language model/i]}
]);
export function scoreLocalFrenchProbe(answer,probe){
 if(typeof answer!=='string'||!answer.trim())return {passed:false,reason:'empty'};
 if(answer.length>1000)return {passed:false,reason:'too-long'};
 const required=Array.isArray(probe?.required)?probe.required:[];
 const forbidden=Array.isArray(probe?.forbidden)?probe.forbidden:[];
 const passed=required.every(r=>r.test(answer))&&forbidden.every(r=>!r.test(answer));
 return {passed,reason:passed?'matched-public-rules':'incomplete-or-contradictory'};
}
export function summarizeLocalFrenchProbes(rows){
 const data={total:rows.length,passed:0,failures:[],categories:{}};
 for(const r of rows){
  const cat=r.category||'unknown';
  const category=data.categories[cat]||{total:0,passed:0};
  category.total++;
  if(r.passed){data.passed++;category.passed++;}
  else data.failures.push(r.id);
  data.categories[cat]=category;
 }
 return {...data,coverage_pct:data.total?Number((100*data.passed/data.total).toFixed(2)):0,
  caveat:'Regex rubric: indicative only, not human-judged semantic comprehension'};
}
