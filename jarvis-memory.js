(function(){
  'use strict';
  const KEY='jarvis_memory_v1';
  const MAX_FACTS=100;
  const MAX_TEXT=240;
  const uid=()=>((typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():'mem-'+Date.now()+'-'+Math.random().toString(36).slice(2,10));
  function load(){
    try{
      const parsed=JSON.parse(localStorage.getItem(KEY)||'{}');
      const facts=Array.isArray(parsed)?parsed:(Array.isArray(parsed.facts)?parsed.facts:[]);
      return facts.filter(f=>f&&typeof f.text==='string').map(f=>({id:String(f.id||uid()),text:f.text.trim().slice(0,MAX_TEXT),createdAt:f.createdAt||new Date().toISOString(),updatedAt:f.updatedAt||f.createdAt||new Date().toISOString()})).filter(f=>f.text).slice(-MAX_FACTS);
    }catch(_){return []}
  }
  function save(facts){try{localStorage.setItem(KEY,JSON.stringify({version:1,facts:facts.slice(-MAX_FACTS)}));return true}catch(_){return false}}
  function list(){return load()}
  function remember(value){
    const text=String(value||'').replace(/\s+/g,' ').trim().slice(0,MAX_TEXT);
    if(!text)return {ok:false,error:'Dime qué quieres que recuerde.'};
    if(/\b(contrase(?:ñ|n)a|password|pin|cvv|cvc|n[uú]mero de tarjeta|tarjeta bancaria)\b/i.test(text)||/\b\d{13,19}\b/.test(text))return {ok:false,error:'Por seguridad, no guardaré contraseñas, PIN, códigos de seguridad ni números de tarjeta.'};
    const facts=load();
    const existing=facts.find(f=>f.text.toLocaleLowerCase('es-ES')===text.toLocaleLowerCase('es-ES'));
    if(existing)return {ok:true,duplicate:true,fact:existing};
    const now=new Date().toISOString(),fact={id:uid(),text,createdAt:now,updatedAt:now};
    facts.push(fact);
    if(!save(facts))return {ok:false,error:'No hay espacio disponible para guardar el recuerdo en este dispositivo.'};
    return {ok:true,duplicate:false,fact};
  }
  function remove(query){
    const q=String(query||'').trim().toLocaleLowerCase('es-ES');
    if(!q)return {removed:0};
    const facts=load(),kept=facts.filter(f=>!f.text.toLocaleLowerCase('es-ES').includes(q));
    const removed=facts.length-kept.length;
    if(removed)save(kept);
    return {removed};
  }
  function clear(){const n=load().length;save([]);return n}
  function context(maxChars){
    const facts=load(),limit=Math.max(200,Number(maxChars)||1400);
    let out='';
    for(const fact of facts.slice(-MAX_FACTS).reverse()){
      const line='- '+fact.text+'\n';
      if(out.length+line.length>limit)break;
      out+=line;
    }
    return out.trim();
  }
  function exportData(){return {version:1,facts:load()}}
  function importData(payload){
    const incoming=payload&&Array.isArray(payload.facts)?payload.facts:[];
    const facts=incoming.filter(f=>f&&typeof f.text==='string').map(f=>({id:String(f.id||uid()),text:f.text.trim().slice(0,MAX_TEXT),createdAt:f.createdAt||new Date().toISOString(),updatedAt:f.updatedAt||f.createdAt||new Date().toISOString()})).filter(f=>f.text).slice(-MAX_FACTS);
    return save(facts);
  }
  window.JarvisMemory={list,remember,remove,clear,context,exportData,importData};
})();