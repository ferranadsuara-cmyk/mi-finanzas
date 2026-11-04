'use strict';

const RATE_WINDOW_MS=60_000, RATE_LIMIT=12, requestLog=new Map();
const RETAILERS=[
 {name:'Amazon',domain:'amazon.es'},
 {name:'PcComponentes',domain:'pccomponentes.com'},
 {name:'MediaMarkt',domain:'mediamarkt.es'},
 {name:'Fnac',domain:'fnac.es'},
 {name:'El Corte Inglés',domain:'elcorteingles.es'},
 {name:'Carrefour',domain:'carrefour.es'}
];
function decodeEntities(v){return String(v||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(Number(d)))}
function cleanText(v){return decodeEntities(String(v||'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim()}
function safeUrl(href){if(!href)return null;let d=decodeEntities(href).trim();try{if(d.startsWith('//'))d='https:'+d;const p=new URL(d,'https://duckduckgo.com');if(p.hostname.endsWith('duckduckgo.com')){const t=p.searchParams.get('uddg');if(t)d=t}const u=new URL(d);if(!['https:','http:'].includes(u.protocol)||['duckduckgo.com','html.duckduckgo.com'].includes(u.hostname))return null;return u.toString()}catch(_){return null}}
function extractPrice(text){const s=String(text||'').replace(/\u00a0/g,' ');const m=s.match(/(?:€\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)|((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)\s*(?:€|euros?))/i);if(!m)return null;const n=Number((m[1]||m[2]).replace(/\./g,'').replace(',','.'));return Number.isFinite(n)&&n>0?n:null}
function parseResults(html,limit=6,query=''){const blocks=String(html||'').split(/<div[^>]+class=["'][^"']*result[^"']*["'][^>]*>/i).slice(1),out=[],seen=new Set();for(const block of blocks){const m=block.match(/<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)||block.match(/<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);if(!m)continue;const url=safeUrl(m[1]),title=cleanText(m[2]);if(!url||!title||seen.has(url))continue;const sm=block.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|td|div)/i),snippet=cleanText(sm&&sm[1]);const host=new URL(url).hostname.replace(/^www\./,'');const retailer=RETAILERS.find(r=>host===r.domain||host.endsWith('.'+r.domain));out.push({title:title.slice(0,180),snippet:snippet.slice(0,420),url,store:retailer?retailer.name:(query.includes('sucursales en ')?query.split(' · ')[0]:query||host),domain:host,price:extractPrice(snippet+' '+title),priceSource:extractPrice(snippet+' '+title)===null?'not-detected':'search-snippet',queryType:query});seen.add(url);if(out.length>=limit)break}return out}
function allowedQuery(q){return typeof q==='string'&&q.trim().length>=3&&q.trim().length<=180&&!/[\u0000-\u001f]/.test(q)}
function rateLimited(ip,now=Date.now()){const ts=(requestLog.get(ip)||[]).filter(t=>now-t<RATE_WINDOW_MS);if(ts.length>=RATE_LIMIT){requestLog.set(ip,ts);return true}ts.push(now);requestLog.set(ip,ts);return false}
async function fetchSearch(q){const response=await fetch('https://html.duckduckgo.com/html/?q='+encodeURIComponent(q),{headers:{'User-Agent':'Mozilla/5.0 (compatible; MiFinanzas-JARVIS/1.0)','Accept':'text/html,application/xhtml+xml'},signal:AbortSignal.timeout(9000)});if(!response.ok)throw new Error('search_unavailable');return response.text()}
async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Método no permitido.'})}
 const q=typeof req.query?.q==='string'?req.query.q.trim():'',shopping=req.query?.shopping==='1',location=typeof req.query?.location==='string'?req.query.location.trim().slice(0,80):'';
 if(!allowedQuery(q))return res.status(400).json({error:'La búsqueda debe tener entre 3 y 180 caracteres.'});
 if(location&&/[\u0000-\u001f]/.test(location))return res.status(400).json({error:'Ubicación no válida.'});
 const ip=String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket?.remoteAddress||'unknown';
 if(rateLimited(ip))return res.status(429).json({error:'Has realizado demasiadas búsquedas seguidas. Espera un minuto.'});
 try{
  const searches=shopping?[
   {q:q+' precio comprar España',type:'general'},
   ...RETAILERS.map(r=>({q:q+' precio site:'+r.domain,type:r.name})),
   ...(location?RETAILERS.map(r=>({q:q+' precio tienda física '+location+' site:'+r.domain,type:r.name+' · sucursales en '+location})):[])
  ]:[{q,type:'general'}];
  const pages=await Promise.all(searches.map(async s=>{try{return {type:s.type,html:await fetchSearch(s.q)}}catch(_){return {type:s.type,html:''}}}));
  const results=[],seen=new Set();
  for(const page of pages){for(const item of parseResults(page.html,shopping?4:6,page.type)){if(seen.has(item.url))continue;seen.add(item.url);results.push(item)}}
  const limited=results.slice(0,shopping?(location?36:24):6);
  if(!limited.length)return res.status(503).json({error:'El buscador no ha devuelto resultados. Puede haber limitado temporalmente la consulta.'});
  res.setHeader('Cache-Control','public, s-maxage=120, stale-while-revalidate=300');
  return res.status(200).json({provider:'DuckDuckGo',query:q,shopping,location:location||null,searchedAt:new Date().toISOString(),results:limited,retailersSearched:shopping?RETAILERS.map(r=>r.name):[],locationSearch:!!(shopping&&location),availabilityNote:'Los resultados no confirman stock. Un precio local solo se considera confirmado si la fuente identifica explícitamente la sucursal.'});
 }catch(_){return res.status(504).json({error:'La búsqueda ha tardado demasiado o no hay conexión. Inténtalo de nuevo.'})}
}
module.exports=handler;module.exports.parseResults=parseResults;module.exports.cleanText=cleanText;module.exports.allowedQuery=allowedQuery;module.exports.extractPrice=extractPrice;