// AURA Toolbox: a reviewed directory, not 50 autonomous external integrations.
// Each entry is discoverable offline. External data transfers always require an explicit act.
const DATA = `
openalex|OpenAlex|https://openalex.org|research|recherche scientifique articles open access publications études citations|api-conditional|free-tier|public-query|API gratuite sous conditions et budget; ne jamais activer de facturation automatique.
unpaywall|Unpaywall|https://unpaywall.org|research|article scientifique doi accès libre open access gratuit|lookup-only|free|public-query|Recherche Unpaywall retirée en septembre 2026; privilégier OpenAlex pour chercher.
scihub|Sci-Hub|https://sci-hub.se|research|article scientifique piratage paywall|blocked|unknown|unsafe|Exclu des intégrations: risques de droits d'auteur et de sécurité; proposer les voies légales.
openlibrary|Open Library|https://openlibrary.org|research|livre ouvrages emprunt bibliothèque catalogue lecture|public-api|free|public-query|API de découverte ponctuelle; pas de scraping ni de backend massif.
gutenberg|Project Gutenberg|https://www.gutenberg.org|research|littérature classique ebook libre domaine public livre|catalog-only|free|public-query|Respecter la politique d'accès robot; utiliser les catalogues officiels.
coursera|Coursera|https://www.coursera.org|education|formation université cours apprentissage certification|manual|freemium|account|Audit gratuit variable; certification souvent payante.
wolframalpha|WolframAlpha|https://www.wolframalpha.com|education|calcul mathématique équation symbolique dérivation|manual|freemium|public-query|Les fonctionnalités détaillées ou API peuvent être payantes.
removebg|remove.bg|https://www.remove.bg|image|image supprimer fond détourer photo arrière plan|external-upload|freemium|file-transfer|Téléversement vers un tiers; préférer un traitement local pour les images privées.
cleanup|Cleanup.pictures|https://cleanup.pictures|image|effacer objet retouche image photo supprimer|external-upload|freemium|file-transfer|Téléversement externe; accord indispensable.
tinywow|TinyWow|https://tinywow.com|documents|pdf fichiers convertir fusionner compression édition|external-upload|freemium|file-transfer|Ne jamais transférer de documents privés sans consentement.
ilovepdf|iLovePDF|https://www.ilovepdf.com|documents|pdf fusion scinder diviser compresser convertir|external-upload|freemium|file-transfer|Service externe; privilégier une alternative locale pour les pièces sensibles.
photopea|Photopea|https://www.photopea.com|image|image photo retouche graphisme photoshop calque|browser|freemium|browser-session|Éditeur en navigateur; vérifier les conditions de confidentialité et publicités.
squoosh|Squoosh|https://squoosh.app|image|optimiser image compression jpeg png webp avif taille poids|browser-local|free|browser-local|Traitement des images dans le navigateur; le site utilise des mesures analytics.
excalidraw|Excalidraw|https://excalidraw.com|visual|schéma diagramme tableau blanc croquis présentation|self-hostable|free|browser-session|Projet ouvert, auto-hébergement possible; collaboration externe optionnelle.
carbon|Carbon|https://carbon.now.sh|development|capture image code snippet syntaxe|manual|free|public-query|Éviter d'y coller du code propriétaire ou des secrets.
regex101|regex101|https://regex101.com|development|expression régulière regex motif tester déboguer|manual|free|public-query|Ne pas soumettre de données de production; test local préférable.
jsonformatter|JSON Formatter|https://jsonformatter.org|development|json valider formater structurer|manual|free|file-transfer|Ne jamais envoyer un JSON contenant secrets ou données clients.
explainshell|ExplainShell|https://explainshell.com|development|commande terminal linux bash expliquer shell sécurité|manual|free|public-query|Explication uniquement; ne jamais exécuter une commande sur cette base.
alternativeto|AlternativeTo|https://alternativeto.net|discovery|logiciel alternative gratuit opensource solution service|manual|free|public-query|Répertoire participatif; vérifier licences et prix de chaque résultat.
hibp|Have I Been Pwned|https://haveibeenpwned.com|security|fuite donnée breach email mot de passe piratage|sensitive-manual|freemium|personal-data|Une adresse personnelle ne doit pas être transmise automatiquement.
tempmail10|10 Minute Mail|https://10minutemail.com|privacy|email temporaire boîte jetable adresse test|manual|free|account|Ne pas utiliser pour comptes essentiels ou récupération de compte.
privnote|Privnote|https://privnote.com|privacy|note éphémère confidentiel partage secret autodestruction|sensitive-manual|free|file-transfer|Ne pas expédier de secret sans approbation et vérification du service.
radiogarden|Radio Garden|https://radio.garden|media|radio mondial direct musique découverte|manual|free|browser-session|Consultation uniquement; pas d'intégration lecture audio autonome.
endel|Endel|https://endel.io|media|concentration relaxation son ambiance sommeil|manual|freemium|account|Abonnement possible; sans pertinence pour les capacités centrales.
mynoise|myNoise|https://mynoise.net|media|bruit blanc concentration ambiance pluie|manual|freemium|browser-session|Consultation personnelle; hors cœur AURA.
justwatch|JustWatch|https://www.justwatch.com|media|streaming où regarder film série plateforme|manual|free|public-query|Catalogue de disponibilité variable; aucun accès automatique aux contenus protégés.
archive|Internet Archive|https://archive.org|research|archive logiciel histoire livre audio vidéo ancien document source|public-api|free|public-query|API officielle de métadonnées; ne pas confondre archivage et droits d'usage.
wayback|Wayback Machine|https://web.archive.org|research|site disparu page ancienne historique web archive comparaison|manual|free|public-query|Vérifier les conditions des interfaces avant automatisation.
similarweb|Similarweb|https://www.similarweb.com|web-audit|concurrence trafic site audience estimation visiteurs|manual|freemium|public-query|Estimations, non mesures réelles; fonctionnalités avancées payantes.
uptimerobot|UptimeRobot|https://uptimerobot.com|web-audit|monitoring disponibilité serveur site alerte uptime panne|account-required|free-tier|account|Offre gratuite limitée; service externe et compte requis.
pagespeed|PageSpeed Insights|https://pagespeed.web.dev|web-audit|performance vitesse site seo lighthouse audit pagespeed|public-api-optional|free-tier|public-query|N'envoyer que des URL publiques; service Google et quotas possibles.
tinypng|TinyPNG|https://tinypng.com|image|compression png jpeg image poids taille|external-upload|freemium|file-transfer|Téléversement externe; préférer Squoosh local pour les photos privées.
cloudconvert|CloudConvert|https://cloudconvert.com|documents|convertir document video fichier format pdf audio|external-upload|freemium|file-transfer|Quota et conversion externe; jamais de document sensible automatique.
diffchecker|Diffchecker|https://www.diffchecker.com|development|comparer texte fichiers diff code changement|external-upload|freemium|file-transfer|Comparer localement les secrets, contrats et codes sensibles.
tempmail|Temp Mail|https://temp-mail.org|privacy|email temporaire anonyme boîte jetable|manual|free|account|À réserver aux tests sans enjeu de récupération.
obfuscator|Obfuscator.io|https://obfuscator.io|development|javascript obfuscation protection code obscurcir|external-upload|free|file-transfer|L'obfuscation ne protège ni les secrets ni l'authentification.
keybr|Keybr|https://www.keybr.com|education|dactylographie apprendre taper clavier|manual|free|browser-session|Outil personnel, faible intérêt pour l'autonomie.
monkeytype|Monkeytype|https://monkeytype.com|education|clavier vitesse frappe dactylographie|manual|free|browser-session|Outil personnel, faible intérêt pour l'autonomie.
anki|Anki|https://apps.ankiweb.net|education|mémoire répétition espacée cartes révision apprendre|local-install|free|local|Approche répétition espacée réutilisable dans la mémoire AURA.
notion|Notion|https://www.notion.so|organisation|notes organisation projets wiki tâches|account-required|freemium|account|Ne pas rendre la mémoire AURA dépendante de son cloud.
obsidian|Obsidian|https://obsidian.md|organisation|notes markdown connaissance graphe mémoire local|local-app|free-tier|local|Inspiration fichiers locaux et relations; logiciel distinct du noyau AURA.
raindrop|Raindrop.io|https://raindrop.io|organisation|favoris signets liens bibliothèque web|account-required|freemium|account|Synchronisation tierce optionnelle, pas de copie de données automatique.
todoist|Todoist|https://todoist.com|organisation|tâches rappels agenda productivité|account-required|freemium|account|Connecteur non activé sans autorisation.
trello|Trello|https://trello.com|organisation|kanban tâches projet tableau|account-required|freemium|account|Connecteur non activé sans autorisation.
miro|Miro|https://miro.com|visual|tableau blanc brainstorming diagramme collaboration|account-required|freemium|account|Stockage cloud externe; auto-hébergement non présumé.
figma|Figma|https://www.figma.com|visual|maquette design interface prototype ui ux|account-required|freemium|account|Compte externe; ne pas publier un projet sans accord.
canva|Canva|https://www.canva.com|visual|graphisme présentation affiches réseaux sociaux|account-required|freemium|account|Compte externe et contenus créatifs soumis à ses conditions.
ytdlp|yt-dlp|https://github.com/yt-dlp/yt-dlp|media|vidéo téléchargement médias sauvegarde extraction youtube|local-install|free|local|Uniquement contenus détenus ou téléchargements autorisés par leurs droits et conditions.
handbrake|HandBrake|https://handbrake.fr|media|encoder compresser convertir vidéo h264 h265 av1|local-install|free|local|Intégrable plus tard à AURA Runtime local; pas d'exécution dans Cloud Node.
localsend|LocalSend|https://localsend.org|privacy|transfert fichier local pc téléphone réseau lan partage|local-install|free|local|Transfert réseau local privé sans cloud; pertinent pour AURA Runtime.
`.trim();

const ALLOWED_ACCESS = new Set(['api-conditional', 'lookup-only', 'blocked', 'public-api', 'catalog-only', 'manual', 'external-upload', 'browser', 'browser-local', 'self-hostable', 'sensitive-manual', 'account-required', 'public-api-optional', 'local-install', 'local-app']);
const ALLOWED_COST = new Set(['free','free-tier','freemium','unknown']);
const ALLOWED_PRIVACY = new Set(['local','public-query','file-transfer','personal-data','account','browser-session','browser-local','unsafe']);
const STOPWORDS = new Set('avec dans sur pour comme quand quel quels quelle quelles quoi comment peux faire avoir veut souhaite besoin site sites outil outils logiciel service des une les est sont mon mes ton tes votre leurs par plus gratuit gratuite gratuits me moi nous vous cette celui ceci cela depuis entre faut sans'.split(' '));

export function foldResourceQuery(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim().slice(0,600);
}

function parseCatalog(source) {
  const rows = source.split('\n').map((line) => line.split('|'));
  const ids = new Set();
  return rows.map((parts) => {
    if (parts.length !== 9) throw new Error('Invalid AURA Toolbox catalog entry');
    const [id,name,url,category,keywords,access,cost,privacy,note] = parts;
    if (ids.has(id) || !/^https:\/\//.test(url) || !ALLOWED_ACCESS.has(access)
      || !ALLOWED_COST.has(cost) || !ALLOWED_PRIVACY.has(privacy)) {
      throw new Error('Unsafe AURA Toolbox catalog entry: ' + id);
    }
    ids.add(id);
    return Object.freeze({id,name,url,category,keywords,access,cost,privacy,note,
      can_execute_automatically:false,
      consent_required:!['local','browser-local'].includes(privacy),
      blocked:access==='blocked',
    });
  });
}

export const RESOURCE_CATALOG = Object.freeze(parseCatalog(DATA));

export function discoverResources(question, {category='',limit=5,includeBlocked=false} = {}) {
  const text = foldResourceQuery(question);
  const words = [...new Set(text.split(' ').filter((word)=>word.length>2&&!STOPWORDS.has(word)))].slice(0,24);
  if(!words.length)return [];
  const results=RESOURCE_CATALOG.filter((item)=>
    (!category || item.category===String(category))
    && (includeBlocked || !item.blocked)).map((item)=>{
    const name=foldResourceQuery(item.name+' '+item.id);
    const terms=foldResourceQuery(item.keywords);
    const cat=foldResourceQuery(item.category);
    let score=0;
    for(const word of words){
      if(name.split(' ').includes(word))score+=12;
      if(terms.split(' ').includes(word))score+=7;
      else if(terms.includes(word))score+=3;
      if(cat===word)score+=5;
    }
    // Prefer local tools for equal relevance. A free tier is not a promise of zero cost.
    if(score>0&&item.privacy==='local')score+=2;
    if(score>0&&item.privacy==='file-transfer')score-=2;
    return {...item,score};
  }).filter((item)=>item.score>0).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'fr'));
  return results.slice(0,Math.max(1,Math.min(12,Number(limit)||5)));
}

export function isToolDiscoveryRequest(value){
  const text=foldResourceQuery(value);
  return /\b(outil|logiciel|ressource|alternative|boite a outils|site pour|quel site|quelle application|quel service|compresser|compression|convertir|conversion|détourer|detourer|retoucher|diagramme|schema|livre gratuit|ebook|open access|article scientifique|verifier une fuite|telecharger une video|transferer un fichier|audit performance|test de vitesse|favoris)\b/.test(text);
}

export function resourceContext(question, limit=3){
  if(!isToolDiscoveryRequest(question))return '';
  const results=discoverResources(question,{limit});
  if(!results.length)return '';
  return [
    'OUTILS CANDIDATS (catalogue local, liens seulement; AUCUNE consultation, exécution ou transmission de données effectuée)',
    ...results.map((item)=>'- '+item.name+' ('+item.url+') : '+item.note
      +' [mode='+item.access+'; donnees='+item.privacy+'; prix='+item.cost+'; consentement='+item.consent_required+']'),
    'Ne pas promettre de fonctionnalité payante. Ne jamais transmettre de secret, document ou compte sans confirmation.',
  ].join('\n');
}
