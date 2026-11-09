// Prioritize the actual task over incidental greetings or negated greetings.
// This extracts task intent without delegating AURA's identity or permissions.
const fold=text=>String(text||'').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,"'")
 .replace(/\s+/g,' ').trim();
const action=/\b(?:analyse|analyser|diagnostique|diagnostiquer|debug|debogue|corrige|corriger|verifie|verifier|examine|examiner|explique|expliquer|cherche|chercher|trouve|trouver|teste|tester|audite|auditer|compare|comparer|resous|resoudre|investigue|investiguer)\b/;
const specific=/\b(?:pourquoi|comment|probleme|erreur|serveur|site|code|projet|module|fonction|programme|bug|panne|fichier|rapport|application|resultat|solution|preuve|difference|base de donnees|memoire|securite|arbitrage|decision|systeme|documentation|web|internet|api)\b/;
const courtesy=/\b(?:bonjour|salut|bonsoir|coucou|hello|bienvenue)\b/;
export function substantiveRequest(text){
 const q=fold(text);
 if(!q||q.length<12||!action.test(q)||!specific.test(q))return false;
 // "ne ... pas juste bonjour : analyse" must not be classified as greeting.
 // Also support requests with courteous preambles of any length.
 return true;
}
export function hasGreetingPrelude(text){return courtesy.test(fold(text));}
