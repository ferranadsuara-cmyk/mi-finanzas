(function(){
  'use strict';
  function detect(question){
    const original=String(question||'').trim();
    const q=original.toLocaleLowerCase('es-ES').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const trigger=/\b(busca|buscar|encuentra|investiga|en internet|por internet|en la web|en tiendas|donde comprar|donde puedo comprar|compar(a|ar) precios|compara tiendas|ofertas|precio actual|precios actuales|cuanto cuesta|cuanto valen)\b/.test(q);
    if(!trigger)return null;
    let query=original
      .replace(/^[¿¡\s]+|[?!\s]+$/g,'')
      .replace(/^(?:jarvis[, ]*)?(?:busca(?:me)?|buscar|encuentra(?:me)?|investiga(?:me)?|compara(?:me)?(?: los)? precios de|compara precios de|dime donde comprar|donde puedo comprar|donde comprar|cuanto cuesta|cuanto valen)\s*/i,'')
      .replace(/\b(?:en internet|por internet|en la web|en tiendas online|en tiendas)\b/ig,'')
      .trim();
    if(!query)query=original;
    const shopping=/\b(precio|precios|comprar|tienda|tiendas|oferta|ofertas|barato|barata|baratos|baratas|coste|cuesta|valen)\b/i.test(original);
    return {query:query.slice(0,180),shopping};
  }
  async function search(query){
    const url='/api/jarvis-search?q='+encodeURIComponent(query);
    const response=await fetch(url,{method:'GET',headers:{Accept:'application/json'},credentials:'same-origin'});
    let payload={};
    try{payload=await response.json()}catch(_){}
    if(!response.ok)throw new Error(payload.error||'No se ha podido completar la búsqueda web.');
    if(!Array.isArray(payload.results))throw new Error('La respuesta del buscador no tiene un formato válido.');
    return payload;
  }
  function evidence(payload){
    return (payload.results||[]).map((r,i)=>(i+1)+'. '+r.title+'\nURL: '+r.url+'\nResumen: '+(r.snippet||'Sin descripción disponible')).join('\n\n');
  }
  window.JarvisWeb={detect,search,evidence};
})();