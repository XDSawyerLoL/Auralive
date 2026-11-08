// Optional public research connectors. External requests require explicit opt-in per call.
// Fixed endpoints, no scraping, no generic URL fetching, no keys or private documents.
const PROVIDERS = Object.freeze({
  openlibrary: {host:'openlibrary.org',base:'https://openlibrary.org/search.json'},
  internetarchive: {host:'archive.org',base:'https://archive.org/advancedsearch.php'},
});
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();
const lastRequest = new Map();

export function validatePublicResearchQuery(raw) {
  const query = String(raw || '').trim();
  if (query.length < 3 || query.length > 120 || !/^[\p{L}\p{N} .,:'"’!?()&\-]+$/u.test(query)
    || /\b(?:password|passwd|bearer|api[ -_]?key|secret|mot[ -]?de[ -]?passe|token|clef[ -]?api)\b/i.test(query)
    || /\b\d{10,}\b/.test(query)) {
    throw new Error('Requête publique invalide ou potentiellement sensible');
  }
  return query;
}

export function createPublicResearchRequest(provider, rawQuery) {
  const source = String(provider || '').trim().toLowerCase();
  if (!Object.hasOwn(PROVIDERS, source)) throw new Error('Fournisseur non autorisé');
  const query = validatePublicResearchQuery(rawQuery);
  const url = new URL(PROVIDERS[source].base);
  if (source === 'openlibrary') {
    url.searchParams.set('q',query);
    url.searchParams.set('fields','key,title,author_name,first_publish_year');
    url.searchParams.set('limit','5');
  } else {
    url.searchParams.set('q','title:("'+query.replace(/"/g,'')+'")');
    url.searchParams.append('fl[]','identifier');
    url.searchParams.append('fl[]','title');
    url.searchParams.append('fl[]','mediatype');
    url.searchParams.set('rows','5');
    url.searchParams.set('output','json');
  }
  return {provider:source,query,url:url.toString(),host:PROVIDERS[source].host};
}

export function normalizePublicResearchResults(provider, payload) {
  if (provider==='openlibrary') {
    return (Array.isArray(payload?.docs)?payload.docs:[]).slice(0,5).flatMap((book)=>{
      const rawKey=String(book?.key||'');
      const key=rawKey.startsWith('/works/')?rawKey:'/works/'+rawKey;
      if (!/^\/works\/OL\d+W$/.test(key)) return [];
      return [{
        title:String(book.title||'').slice(0,250),
        author:Array.isArray(book.author_name)?book.author_name.slice(0,3).map(String).join(', ').slice(0,200):'',
        year:Number.isInteger(book.first_publish_year)?book.first_publish_year:null,
        url:'https://openlibrary.org'+key,
      }];
    });
  }
  if (provider==='internetarchive') {
    return (Array.isArray(payload?.response?.docs)?payload.response.docs:[]).slice(0,5).flatMap((item)=>{
      const id=String(item?.identifier||'');
      if(!/^[a-zA-Z0-9_.-]{1,150}$/.test(id))return [];
      return [{
        title:String(item?.title||id).slice(0,250),
        media_type:String(item?.mediatype||'').slice(0,40),
        url:'https://archive.org/details/'+encodeURIComponent(id),
      }];
    });
  }
  throw new Error('Fournisseur non autorisé');
}

export async function searchPublicResources(provider, rawQuery, {allowExternal=false, fetchFn=fetch} = {}) {
  if (allowExternal !== true) throw new Error('Consentement à la recherche externe requis');
  const request=createPublicResearchRequest(provider,rawQuery);
  const key=request.provider+':'+request.query.toLocaleLowerCase('fr-FR');
  const now=Date.now();
  const cached=cache.get(key);
  if (cached && cached.expires>now) return {...cached.result,cached:true};
  const last=lastRequest.get(request.provider)||0;
  if (now-last<1500) throw new Error('Requête espacée requise pour respecter les limites du fournisseur');
  lastRequest.set(request.provider,now);
  const response=await fetchFn(request.url,{
    method:'GET',
    redirect:'error',
    signal:AbortSignal.timeout(8000),
    headers:{'Accept':'application/json','User-Agent':'AURA-Cloud/3.0 (manual public research)'},
  });
  if (!response?.ok) throw new Error('Fournisseur externe indisponible: '+String(response?.status||0));
  const payload=await response.json();
  const result={
    provider:request.provider,
    query:request.query,
    external_request:true,
    cached:false,
    count:0,
    results:normalizePublicResearchResults(request.provider,payload),
    warning:'Métadonnées externes non vérifiées; ne pas déduire de droits de téléchargement.',
  };
  result.count=result.results.length;
  if (cache.size>=80)cache.delete(cache.keys().next().value);
  cache.set(key,{result,expires:now+CACHE_TTL_MS});
  return result;
}
