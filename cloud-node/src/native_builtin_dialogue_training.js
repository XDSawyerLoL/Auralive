// Deterministic offline learning from synthetic, labelled French speech.
// This acquires bounded syntax, not fluent dialogue or a pretrained LLM.
import {createHash} from 'node:crypto';
import {NativeConstructionLearner} from './native_construction_learning.js';
const patterns=[
 'Ce matin, @agent a @verb @det @patient.',
 'Hier soir, @agent a @verb @det @patient.',
 'Pendant la réunion, @agent a @verb @det @patient.',
 'Au bureau, @agent a @verb @det @patient.',
 'Le soir, @agent a @verb @det @patient.',
 'À midi, @agent a @verb @det @patient.',
 'Dans la cour, @agent a @verb @det @patient.',
 'Sous la pluie, @agent a @verb @det @patient.',
 'Après la réunion, @agent a @verb @det @patient.',
 'En fin de journée, @agent a @verb @det @patient.',
 "À l'atelier, @agent a @verb @det @patient.",
 'Sur le quai, @agent a @verb @det @patient.',
 'Devant le théâtre, @agent a @verb @det @patient.',
 'Au petit matin, @agent a @verb @det @patient.',
];
const people=['Romain','Camille','Nadia','Solène','Baptiste','Noémie','Hugo','Sarah','Yanis','Adèle','Gabriel','Lina'];
const verbs=[['fermé','fermer'],['ouvert','ouvrir'],['déplacé','deplacer'],
 ['déposé','deposer'],['trouvé','trouver'],['caché','cacher'],
 ['signé','signer'],['donné','donner'],['choisi','choisir'],['gardé','garder']];
const objects=[['la','porte'],['le','dossier'],['la','boîte'],['la','fenêtre'],
 ['le','portail'],['la','caisse'],['le','coffre'],['le','colis'],
 ['le','document'],['le','registre'],['le','carnet'],['le','paquet']];
export function curatedFrenchDialogueExamples(){
 const examples=[];
 for(let j=0;j<patterns.length;j++)for(let k=0;k<12;k++){
  const agent=people[(j+k)%people.length];
  const [surface,predicate]=verbs[(k*3+j)%verbs.length];
  const [article,patient]=objects[(k*5+j)%objects.length];
  const sentence=patterns[j].replace('@agent',agent).replace('@verb',surface)
   .replace('@det',article).replace('@patient',patient);
  examples.push({sentence,agent,predicate,patient});
 }
 return examples;
}
export function trainNativeDialogueConstructions(){
 const examples=curatedFrenchDialogueExamples();
 const learner=new NativeConstructionLearner();let accepted=0;
 for(const row of examples)if(learner.observe(row).accepted)accepted++;
 const ready=learner.status().ready;
 if(accepted!==168||ready!==14)throw Error('native-dialogue-training-evidence-incomplete');
 const training_sha256=createHash('sha256').update(JSON.stringify(examples)).digest('hex');
 return {learner,audit:Object.freeze({
  schema:'aura-native-dialogue-training-v1',accepted,rejected:examples.length-accepted,
  acquired_constructions:ready,training_sha256,
  dataset:'curated-synthetic-annotated-utterances',
  split:'train-only; heldout participants and objects not included',
  licensed_french_corpus:'UD_French-GSD morphological lexicon CC BY-SA 4.0',
  pretrained_llm:false,paid_api_calls:0,external_inference:false,
  open_domain_fluency_proven:false,
 })};
}
