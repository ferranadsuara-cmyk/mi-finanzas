(function(){
  'use strict';
  const KEY='jarvis_memory_v1';
  const CHAT_KEY='jarvis_starred_conversations_v1';
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
  function remember(value,options){
    const text=String(value||'').replace(/\s+/g,' ').trim().slice(0,MAX_TEXT);
    if(!text)return {ok:false,error:'Dime qué quieres que recuerde.'};
    if(/\b(contrase(?:ñ|n)a|password|pin|cvv|cvc|n[uú]mero de tarjeta|tarjeta bancaria)\b/i.test(text)||/\b\d{13,19}\b/.test(text))return {ok:false,error:'Por seguridad, no guardaré contraseñas, PIN, códigos de seguridad ni números de tarjeta.'};
    const facts=load();
    const existing=facts.find(f=>f.text.toLocaleLowerCase('es-ES')===text.toLocaleLowerCase('es-ES'));
    if(existing)return {ok:true,duplicate:true,fact:existing};
    const now=new Date().toISOString(),fact={id:uid(),text,source:options&&options.source==='automatic'?'automatic':'user',createdAt:now,updatedAt:now};
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
    return String(value||'').toLocaleLowerCase('es-ES').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9ñ]+/g,' ').trim();
  }
  const SYNONYMS={vacaciones:['viaje','viajes'],viaje:['vacaciones'],alimentacion:['comida'],comida:['alimentacion'],ahorrar:['ahorro'],ahorro:['ahorrar'],gastos:['gasto'],gasto:['gastos'],trabajo:['empleo'],empleo:['trabajo'],estudios:['estudiar'],estudiar:['estudios']};
  function terms(value){
    const base=normalize(value).split(/\s+/).filter(word=>word.length>1&&!STOP.has(word));
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
  function loadStarred(){try{const value=JSON.parse(localStorage.getItem(CHAT_KEY)||'[]');return Array.isArray(value)?value.filter(x=>x&&typeof x.id==='string'&&typeof x.title==='string'&&typeof x.summary==='string').slice(-20):[]}catch(_){return []}}
  function listStarredConversations(){return loadStarred().sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)))}
  function starConversation(messages){
    const items=(Array.isArray(messages)?messages:[]).filter(x=>x&&['user','assistant'].includes(x.role)&&typeof x.content==='string').slice(-40).map(x=>({role:x.role,content:x.content.slice(0,1800)}));
    if(items.some(x=>/\b(contrase(?:ñ|n)a|password|pin|cvv|cvc|n[uú]mero de tarjeta|tarjeta bancaria)\b/i.test(x.content)||/\b\d{13,19}\b/.test(x.content)))return {ok:false,error:'No guardaré una conversación que contenga contraseñas, PIN, códigos de seguridad o números de tarjeta.'};
    const userMessages=items.filter(x=>x.role==='user').map(x=>x.content.trim()).filter(Boolean);
    if(!userMessages.length)return {ok:false,error:'Todavía no hay mensajes que guardar en esta conversación.'};
    const summary=userMessages.join(' · ').slice(0,1400),title=(userMessages[0].replace(/\s+/g,' ').slice(0,64)||'Conversación favorita');
    const chats=loadStarred(),fingerprint=summary.toLocaleLowerCase('es-ES');
    const duplicate=chats.find(x=>x.summary.toLocaleLowerCase('es-ES')===fingerprint);
    if(duplicate)return {ok:true,duplicate:true,conversation:duplicate};
    const saved={id:uid(),title,summary,messages:items,savedAt:new Date().toISOString()};
    chats.push(saved);
    try{localStorage.setItem(CHAT_KEY,JSON.stringify(chats.slice(-20)));return {ok:true,duplicate:false,conversation:saved}}catch(_){return {ok:false,error:'No hay espacio disponible para guardar esta conversación en el dispositivo.'}}
  }
  function unstarConversation(id){const chats=loadStarred(),kept=chats.filter(x=>x.id!==String(id)),removed=chats.length-kept.length;if(removed)localStorage.setItem(CHAT_KEY,JSON.stringify(kept));return removed}
  function learnFromMessage(message){
    const text=String(message||'').replace(/\s+/g,' ').trim();
    if(!text||text.length<8||text.length>2000||/[¿?]/.test(text))return {saved:false};
    const patterns=[
      /\b(prefiero|no me gustan|no me gusta|me gustan|me gusta|me encantan|me encanta|me interesan|me interesa)\s+([^.!?\n]{3,120})/i,
      /\b(mi objetivo es|mi meta es|estoy ahorrando para|quiero ahorrar para|estudio|trabajo en|me dedico a)\s+([^.!?\n]{3,140})/i,
      /\bquiero que me (respondas|expliques|hables)\s+([^.!?\n]{3,120})/i
    ];
    for(const pattern of patterns){const match=text.match(pattern);if(!match)continue;const fact=(match[1]+' '+match[2]).replace(/\s+/g,' ').trim();const result=remember(fact,{source:'automatic'});return {saved:!!result.ok&&!result.duplicate,duplicate:!!result.duplicate,fact:result.fact||null,error:result.error||null}}
    return {saved:false};
  }
  function context(maxChars,query){
    const limit=Math.max(200,Number(maxChars)||1400);
    const facts=query?retrieve(query,12):load().slice(-MAX_FACTS).reverse();
    const chats=loadStarred().filter(chat=>!query||relevance({text:chat.title+' '+chat.summary},query).score>0).slice(0,4);
    let out='';
    for(const fact of facts){
      const line='- '+fact.text+'\n';
      if(out.length+line.length>limit)continue;
      out+=line;
    }
    for(const chat of chats){
      const line='- Conversación favorita «'+chat.title+'»: '+chat.summary+'\n';
      if(out.length+line.length>limit)continue;
      out+=line;
    }
    return out.trim();
  }
  function exportData(){return {version:2,facts:load(),starredConversations:loadStarred()}}
  function importData(payload){
    const incoming=payload&&Array.isArray(payload.facts)?payload.facts:[];
    const facts=incoming.filter(f=>f&&typeof f.text==='string').map(f=>({id:String(f.id||uid()),text:f.text.trim().slice(0,MAX_TEXT),createdAt:f.createdAt||new Date().toISOString(),updatedAt:f.updatedAt||f.createdAt||new Date().toISOString()})).filter(f=>f.text).slice(-MAX_FACTS);
    const ok=save(facts);if(Array.isArray(payload&&payload.starredConversations)){try{localStorage.setItem(CHAT_KEY,JSON.stringify(payload.starredConversations.filter(x=>x&&typeof x.id==='string'&&typeof x.title==='string'&&typeof x.summary==='string').slice(-20)))}catch(_){}}return ok;
  }
  window.JarvisMemory={list,remember,remove,clear,context,retrieve,learnFromMessage,starConversation,listStarredConversations,unstarConversation,exportData,importData};
})();