// AURA Revenue Desk — one user-authorized, bounded public HTTPS homepage audit.
// No scraping of contacts, no automated outreach, no paid APIs or investment trades.
import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
import {performance} from 'node:perf_hooks';

export function validateAuditUrl(input){
  const raw=String(input||'').trim();
  if(raw.length>240 || raw.length<12)throw Error('Adresse HTTPS publique invalide');
  let url;try{url=new URL(raw);}catch{throw Error('Adresse HTTPS publique invalide');}
  if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash
    ||url.search||url.pathname!=='/' || !/^[a-z0-9.-]+$/i.test(url.hostname)
    ||!url.hostname.includes('.')||net.isIP(url.hostname)
    ||/(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(url.hostname)
    ||url.hostname.endsWith('.arpa')||url.hostname.includes('..')){
    throw Error('Utiliser uniquement une page d’accueil HTTPS publique, sans paramètres ni port');
  }
  return url;
}
export function isPublicIPv4(ip){
  if(net.isIP(ip)!==4)return false;
  const a=ip.split('.').map(Number),[x,y,z]=a;
  return !(
    x===0||x===10||x===127||x>=224
    ||(x===100&&y>=64&&y<=127)
    ||(x===169&&y===254)||(x===172&&y>=16&&y<=31)
    ||(x===192&&(y===168||y===0||y===88&&z===99||y===0&&z===2))
    ||(x===198&&(y===18||y===19||y===51&&z===100))
    ||(x===203&&y===0&&z===113)
    ||(x===192&&y===0&&z===2)
  );
}
function textOf(html,pattern){
  const m=String(html||'').match(pattern);
  return m?String(m[1]||'').replace(/<[^>]*>/g,' ').replace(/&(?:amp|nbsp|quot|lt|gt);/g,' ').replace(/\s+/g,' ').trim().slice(0,180):'';
}
function tagAttr(tag,attr){
  const match=String(tag||'').match(new RegExp('\\b'+attr+'\\s*=\\s*["\\x27]([^"\\x27]*)["\\x27]','i'));
  return match?match[1]:'';
}
export function evaluateHomepage(source, {status=0,headers={},duration_ms=0,url=''}={}){
  const html=String(source||'').slice(0,300000);
  const title=textOf(html,/<title[^>]*>([\s\S]*?)<\/title>/i);
  const head=html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1]||html.slice(0,50000);
  const meta=(head.match(/<meta\b[^>]*>/gi)||[]);
  const description=meta.find(t=>tagAttr(t,'name').toLowerCase()==='description');
  const viewport=meta.some(t=>tagAttr(t,'name').toLowerCase()==='viewport');
  const robots=meta.find(t=>tagAttr(t,'name').toLowerCase()==='robots');
  const desc=description?tagAttr(description,'content').slice(0,240):'';
  const h1=(html.match(/<h1(?:\s|>)/gi)||[]).length;
  const imageTags=html.match(/<img\b[^>]*>/gi)||[];
  const withoutAlt=imageTags.filter(tag=>!/(?:\s)alt\s*=/.test(tag)).length;
  const h={};for(const [key,value] of Object.entries(headers||{}))h[key.toLowerCase()]=String(value||'');
  const observations=[
    {id:'https',status:'pass',detail:'Connexion HTTPS demandée (un certificat valide reste requis).'},
    {id:'http_status',status:status===200?'pass':'review',detail:'Statut HTTP '+(status||'inconnu')},
    {id:'title',status:title?'pass':'review',detail:title?'Titre présent : '+title:'Balise title absente dans la réponse analysée'},
    {id:'description',status:desc?'pass':'review',detail:desc?'Meta description présente':'Meta description absente de la réponse analysée'},
    {id:'viewport',status:viewport?'pass':'review',detail:viewport?'Viewport mobile déclaré':'Meta viewport non détectée'},
    {id:'h1',status:h1===1?'pass':'review',detail:h1+' balise(s) H1 détectée(s)'},
    {id:'image_alt',status:withoutAlt===0?'pass':'review',detail:withoutAlt+' image(s) sans attribut alt sur '+imageTags.length},
    {id:'hsts',status:h['strict-transport-security']?'pass':'review',detail:h['strict-transport-security']?'En-tête HSTS présent':'En-tête HSTS non détecté'},
    {id:'nosniff',status:h['x-content-type-options']?.toLowerCase()==='nosniff'?'pass':'review',detail:h['x-content-type-options']?'X-Content-Type-Options : '+h['x-content-type-options']:'X-Content-Type-Options absent'},
    {id:'robots',status:robots&&/noindex/i.test(tagAttr(robots,'content'))?'review':'pass',detail:robots?'Directive robots : '+tagAttr(robots,'content').slice(0,120):'Pas de meta robots détectée'},
  ];
  return {
    url:String(url||'').slice(0,240),status_code:Number(status)||0,
    duration_ms:Math.round(Number(duration_ms)||0),
    checked_at:new Date().toISOString(),
    title,description:desc,h1_count:h1,image_count:imageTags.length,images_missing_alt:withoutAlt,
    checks:observations,pass_count:observations.filter(x=>x.status==='pass').length,
    review_count:observations.filter(x=>x.status==='review').length,
    scope:'Page d’accueil uniquement, HTML initial (pas de rendu JavaScript). Vérification indicative, pas un audit de sécurité, un classement SEO ou un test Core Web Vitals.',
    paid_api_calls:0,
  };
}
// Resolve and pin the audited destination IP. No redirects, proxy URLs, ports,
// private addresses, HTML beyond 300 KB, or responses kept in storage.
async function requestHomepage(url){
  const host=url.hostname;
  const ips=await dns.lookup(host,{all:true,verbatim:true});
  if(!ips?.length || ips.some(entry=>entry.family!==4||!isPublicIPv4(entry.address)))
    throw Error('La cible ne possède pas exclusivement des adresses IPv4 publiques autorisées');
  const ip=ips[0].address;
  const start=performance.now();
  return new Promise((resolve,reject)=>{
    let done=false;
    const finish=(err,result)=>{if(done)return;done=true;err?reject(err):resolve(result);};
    const req=https.request(url,{
      method:'GET',
      timeout:8500,
      lookup:(_hostname,options,callback)=>{
        const cb=typeof options==='function'?options:callback;
        cb(null,ip,4);
      },
      headers:{
        'Accept':'text/html',
        'User-Agent':'AURA-Revenue-Audit/1.0 (manual public homepage diagnostics)',
        'Connection':'close',
      },
      maxHeaderSize:16384,
    },res=>{
      const status=Number(res.statusCode)||0;
      if(status>=300&&status<400){res.destroy();return finish(Error('Redirection refusée : saisir l’URL finale HTTPS')); }
      const type=String(res.headers['content-type']||'');
      if(!/text\/html/i.test(type)){res.destroy();return finish(Error('Le site ne sert pas de page HTML analysable')); }
      let size=0;const chunks=[];
      res.on('data',chunk=>{
        size+=chunk.length;
        if(size>300000){res.destroy();return finish(Error('La page HTML dépasse la limite de 300 Ko')); }
        chunks.push(chunk);
      });
      res.on('end',()=>finish(null,{
        html:Buffer.concat(chunks).toString('utf8'),
        status,headers:res.headers,duration_ms:performance.now()-start,
      }));
      res.on('error',err=>finish(err));
    });
    req.on('timeout',()=>req.destroy(Error('Délai de connexion dépassé')));
    req.on('error',err=>finish(err));
    req.end();
  });
}
export async function auditPublicHomepage(raw,{request=requestHomepage}={}){
  const url=validateAuditUrl(raw);
  const page=await request(url);
  return evaluateHomepage(page.html,{...page,url:url.toString()});
}
