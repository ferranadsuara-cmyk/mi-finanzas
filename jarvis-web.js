(function(){
 'use strict';
 const LOCATION_KEY='jarvis_shopping_location_v1';
 function norm(v){return String(v||'').toLocaleLowerCase('es-ES').normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
 function detect(question){
  const original=String(question||'').trim(),q=norm(original);
  const explicit=/\b(busca|buscar|buscame|búscame|encuentra|encuentrame|encuéntrame|investiga|investigame|investígame|consulta|consultame|consúltame|averigua|averiguame|mira en internet|revisa en internet|busca en internet|en internet|por internet|en la web|en la red|en tiendas|donde comprar|donde puedo comprar|compara precios|compara tiendas|ofertas|precio actual|precios actuales|cuanto cuesta|cuanto valen|quiero comprar|me quiero comprar|estoy buscando)\b/.test(q);
  const fresh=/\b(hoy|ahora mismo|actualidad|actualizado|actualizada|actuales|actual|ultima hora|ultimas noticias|ultimos datos|esta semana|este mes|reciente|recientes|novedades|noticias de hoy|que ha pasado|que esta pasando)\b/.test(q);
  const directResearch=/^(?:¿?\s*)?(?:quien es|quien fue|que es|que significa|como funciona|cuando se fundo|cuando ocurrio|donde esta|donde se encuentra)\b/.test(q);
  if(!explicit&&!fresh&&!directResearch)return null;
  let query=original.replace(/^[¿¡\s]+|[?!\s]+$/g,'').replace(/^(?:jarvis[, ]*)?(?:busca(?:me)?|buscar|encuentra(?:me)?|investiga(?:me)?|consulta(?:me)?|averigua(?:me)?|compara(?:me)?(?: los)? precios de|compara precios de|dime donde comprar|donde puedo comprar|donde comprar|cuanto cuesta|cuanto valen|quiero comprar(?:me)?|me quiero comprar|estoy buscando|mira en internet|revisa en internet|busca en internet)\s*/i,'').replace(/\b(?:en internet|por internet|en la web|en la red|en tiendas online|en tiendas)\b/ig,'').trim();
  if(!query)query=original;
  const commerceWords=/\b(precio|precios|comprar|comprarme|compra|tienda|tiendas|sucursal|sucursales|oferta|ofertas|barato|barata|baratos|baratas|coste|cuesta|valen|descuento|rebaja|stock|disponible|comparar|comparame|recomiendame|recomienda|mejor precio|donde sale|vale|auriculares|cascos|movil|móvil|telefono|teléfono|portatil|portátil|ordenador|tablet|televisor|zapatillas|mochila|nevera|lavadora|consola|aspirador|cafetera|monitor|teclado|raton|ratón|ropa|perfume|bicicleta|silla|mesa|producto)\b/i.test(original);
  const purchasePhrase=/\b(?:quiero|me quiero|necesito|busco|estoy buscando|me recomiendas)\s+(?:comprar|comprarme|un|una|unos|unas|el|la|los|las)\b/i.test(q);
  const genericProductSearch=/\b(?:busca(?:me)?|encuentra(?:me)?|dime donde comprar|donde puedo comprar)\b/i.test(original)&&!/\b(?:informacion|información|noticias|historia|definicion|definición|como funciona|cómo funciona|que es|qué es|reseñas|opiniones)\b/i.test(q);
  const informationalSearch=/\b(?:informacion|información|noticias|historia|definicion|definición|como funciona|cómo funciona|que es|qué es|reseñas|opiniones|quien es|quien fue|que significa)\b/i.test(q);
  const shopping=!informationalSearch&&(commerceWords||purchasePhrase||genericProductSearch);
  return {query:query.slice(0,180),shopping};
 }
 function getLocation(){try{return localStorage.getItem(LOCATION_KEY)||''}catch(_){return ''}}
 function setLocation(value){const v=String(value||'').trim().slice(0,80);try{if(v)localStorage.setItem(LOCATION_KEY,v);else localStorage.removeItem(LOCATION_KEY)}catch(_){}return v}
 function locationCommand(question){
  const q=String(question||'').trim();
  const m=q.match(/^(?:mi (?:codigo postal|código postal|localidad|ciudad|zona) es|busca sucursales cerca de)\s+(.+)$/i);
  if(m){setLocation(m[1]);return 'He guardado tu zona de búsqueda: '+m[1]+'. La usaré para buscar tiendas físicas y sucursales cuando los resultados permitan identificar precios locales. Puedes cambiarla diciendo «mi código postal es …».'}
  if(/^(?:qué zona tienes guardada|que zona tienes guardada|mi zona de busqueda|mi zona de búsqueda)$/i.test(q))return getLocation()?'Tu zona de búsqueda guardada es: '+getLocation()+'.':'Todavía no has indicado una zona. Dime «mi código postal es …» para buscar sucursales cercanas.';
  return null;
 }
 async function search(query,options){
  const opts=options||{},params=new URLSearchParams({q:query});
  if(opts.shopping)params.set('shopping','1');
  const location=opts.location||getLocation();if(location)params.set('location',location);
  const response=await fetch('/api/jarvis-search?'+params.toString(),{method:'GET',headers:{Accept:'application/json'},credentials:'same-origin'});
  let payload={};try{payload=await response.json()}catch(_){}
  if(!response.ok)throw new Error(payload.error||'No se ha podido completar la búsqueda web.');
  if(!Array.isArray(payload.results))throw new Error('La respuesta del buscador no tiene un formato válido.');
  return payload;
 }
 async function inspect(url){const params=new URLSearchParams({url:String(url||'')});const response=await fetch('/api/jarvis-product?'+params.toString(),{headers:{Accept:'application/json'},credentials:'same-origin'});let payload={};try{payload=await response.json()}catch(_){}if(!response.ok)throw new Error(payload.error||'No se ha podido analizar la página del producto.');return payload.product;}
 function evidence(payload){return (payload.results||[]).map((r,i)=>{const local=String(r.queryType||'').includes('sucursales en ');return (i+1)+'. Tienda/retailer: '+(r.store||'no identificada')+'\nÁmbito: '+(local?'búsqueda local (no confirma sucursal concreta)':'resultado web/online (no confirma stock)')+'\n'+r.title+'\nURL: '+r.url+'\nPrecio detectado en fragmento: '+(r.price===null?'no detectado':r.price+' €')+'\nOrigen del precio: '+(r.priceSource==='search-snippet'?'fragmento del buscador, pendiente de verificar en la tienda':'no detectado')+'\nResumen: '+(r.snippet||'Sin descripción disponible')}).join('\n\n')}
 window.JarvisWeb={detect,search,inspect,evidence,getLocation,setLocation,locationCommand};
})();