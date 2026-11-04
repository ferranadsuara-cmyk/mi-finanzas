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
  const STOP=new Set('a al algo algunas algunos ante antes como con contra cual cuando de del desde donde durante e el ella ellas ello ellos en entre era es esa esas ese eso esos esta estaba estas este esto estos fue ha hacia hasta hay la las le les lo los más mas me mi mis mucho muy no nos o para pero por porque que se sin sobre su sus te tu tus un una unas uno unos y ya'.split(' '));
  function normalize(value){
    return String(value||'').toLocaleLowerCase('es-ES').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9ñ]+/g,' ').trim();
  }
  const SYNONYMS={vacaciones:['viaje','viajes'],viaje:['vacaciones'],alimentacion:['comida'],comida:['alimentacion'],ahorrar:['ahorro'],ahorro:['ahorrar'],gastos:['gasto'],gasto:['gastos'],trabajo:['empleo'],empleo:['trabajo'],estudios:['estudiar'],estudiar:['estudios']};
  function terms(value){
    const base=normalize(value).split(/\\s+/).filter(word=>word.length>1&&!STOP.has(word));
    return Array.from(new Set(base.concat(base.flatMap(word=>SYNONYMS[word]||[]))));
  }
  function relevance(fact,query){
    const q=terms(query),body=terms(fact.text);
    if(!q.length)return 0;
    const counts=new Map();
    body.forEach(word=>counts.set(word,(counts.get(word)||0)+1));
    let score=0,matched=0;
    q.forEach(word=>{
      const count=counts.get(word)||0;
      if(count){matched++;score+=Math.min(2,count);}
    });
    const phrase=normalize(fact.text).includes(normalize(query));
    if(phrase)score+=3;
    return {score,matched,total:q.length,phrase};
  }
  function retrieve(query,limit){
    const max=Math.max(1,Math.min(20,Number(limit)||6));
    const facts=load();
    if(!String(query||'').trim())return facts.slice(-max).reverse();
    return facts.map((fact,index)=>{
      const match=relevance(fact,query);
      return {...fact,score:match.score,matchedTerms:match.matched,_index:index};
    }).filter(f=>f.score>0&&f.matchedTerms>0)
      .sort((a,b)=>b.score-a.score||b._index-a._index)
      .slice(0,max).map(({_index,...fact})=>fact);
  }
  function context(maxChars,query){
    const limit=Math.max(200,Number(maxChars)||1400);
    const facts=query?retrieve(query,12):load().slice(-MAX_FACTS).reverse();
    let out='';
    for(const fact of facts){
      const line='- '+fact.text+'\\n';
      if(out.length+line.length>limit)continue;
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
  window.JarvisMemory={list,remember,remove,clear,context,retrieve,exportData,importData};
})();