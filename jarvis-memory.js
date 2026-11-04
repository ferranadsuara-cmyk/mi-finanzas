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

  const PROJECT_KEY='jarvis_projects_v1';
  const ACTIVE_PROJECT_KEY='jarvis_active_project_v1';
  const MAX_PROJECTS=30,MAX_PROJECT_NOTES=40;
  function loadProjects(){try{const value=JSON.parse(localStorage.getItem(PROJECT_KEY)||'[]');return Array.isArray(value)?value.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&Array.isArray(p.notes)).slice(-MAX_PROJECTS):[]}catch(_){return []}}
  function saveProjects(projects){try{localStorage.setItem(PROJECT_KEY,JSON.stringify(projects.slice(-MAX_PROJECTS)));return true}catch(_){return false}}
  function listProjects(){return loadProjects().sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))}
  function getProject(query){const q=normalize(query);if(!q)return null;const projects=loadProjects();return projects.find(p=>p.id===query)||projects.find(p=>normalize(p.name)===q)||projects.find(p=>normalize(p.name).includes(q)||q.includes(normalize(p.name)))||null}
  function activeProject(){const id=localStorage.getItem(ACTIVE_PROJECT_KEY);return id?loadProjects().find(p=>p.id===id)||null:null}
  function setActiveProject(query){const project=getProject(query);if(!project)return {ok:false,error:'No encuentro ese proyecto.'};try{localStorage.setItem(ACTIVE_PROJECT_KEY,project.id);return {ok:true,project}}catch(_){return {ok:false,error:'No se pudo activar el proyecto.'}}}
  function createProject(name,description){const clean=String(name||'').replace(/\s+/g,' ').trim().slice(0,80);if(!clean)return {ok:false,error:'Indica el nombre del proyecto.'};if(/\b(contrase(?:ñ|n)a|password|pin|cvv|cvc|n[uú]mero de tarjeta)\b/i.test(clean+' '+String(description||''))||/\b\d{13,19}\b/.test(clean+' '+String(description||'')))return {ok:false,error:'No guardaré credenciales ni datos de tarjetas en un proyecto.'};const projects=loadProjects(),existing=projects.find(p=>normalize(p.name)===normalize(clean));if(existing){try{localStorage.setItem(ACTIVE_PROJECT_KEY,existing.id)}catch(_){}return {ok:true,duplicate:true,project:existing};}if(projects.length>=MAX_PROJECTS)return {ok:false,error:'Has alcanzado el límite de 30 proyectos.'};const now=new Date().toISOString(),project={id:uid(),name:clean,description:String(description||'').replace(/\s+/g,' ').trim().slice(0,400),status:'active',notes:[],createdAt:now,updatedAt:now};projects.push(project);if(!saveProjects(projects))return {ok:false,error:'No se pudo guardar el proyecto en este dispositivo.'};try{localStorage.setItem(ACTIVE_PROJECT_KEY,project.id)}catch(_){}return {ok:true,duplicate:false,project}}
  function addProjectNote(query,kind,value){const project=String(query||'').trim()?getProject(query):activeProject();if(!project)return {ok:false,error:'Primero crea o activa un proyecto.'};const text=String(value||'').replace(/\s+/g,' ').trim().slice(0,500);if(!text)return {ok:false,error:'Indica qué quieres guardar en el proyecto.'};if(/\b(contrase(?:ñ|n)a|password|pin|cvv|cvc|n[uú]mero de tarjeta)\b/i.test(text)||/\b\d{13,19}\b/.test(text))return {ok:false,error:'No guardaré credenciales ni datos de tarjetas en un proyecto.'};const allowed=['decision','progress','next','note'];const type=allowed.includes(kind)?kind:'note';const now=new Date().toISOString();project.notes.push({id:uid(),type,text,createdAt:now});project.notes=project.notes.slice(-MAX_PROJECT_NOTES);project.updatedAt=now;if(!saveProjects(loadProjects().map(p=>p.id===project.id?project:p)))return {ok:false,error:'No se pudo guardar la nota.'};return {ok:true,project,note:project.notes[project.notes.length-1]}}
  function updateProject(query,changes){const project=getProject(query);if(!project)return {ok:false,error:'No encuentro ese proyecto.'};if(changes&&typeof changes.name==='string'&&changes.name.trim())project.name=changes.name.trim().slice(0,80);if(changes&&['active','paused','completed'].includes(changes.status))project.status=changes.status;project.updatedAt=new Date().toISOString();saveProjects(loadProjects().map(p=>p.id===project.id?project:p));return {ok:true,project}}
  function removeProject(query){const project=getProject(query);if(!project)return {removed:false};saveProjects(loadProjects().filter(p=>p.id!==project.id));if(localStorage.getItem(ACTIVE_PROJECT_KEY)===project.id)localStorage.removeItem(ACTIVE_PROJECT_KEY);return {removed:true,project}}
  function learnProjectFromMessage(message){const text=String(message||'').replace(/\s+/g,' ').trim();if(!text||text.length>600||/[¿?]/.test(text))return {saved:false};const active=activeProject();if(!active)return {saved:false};const rules=[{type:'decision',pattern:/^(?:en este proyecto[, ]*)?(?:hemos decidido|decidimos|la decision es)\s+(?:que\s+)?(.+)$/i},{type:'next',pattern:/^(?:el siguiente paso|lo siguiente que haremos|queda pendiente)\s+(?:es\s+)?(.+)$/i},{type:'progress',pattern:/^(?:avance|progreso):?\s*(.+)$/i},{type:'progress',pattern:/^(?:he implementado|hemos implementado|he terminado|hemos terminado|ya esta hecho|ya hemos completado)\s+(.+)$/i}];for(const rule of rules){const match=text.match(rule.pattern);if(match){const result=addProjectNote(active.id,rule.type,match[1]);return {saved:!!result.ok,project:result.project,note:result.note,error:result.error||null}}}return {saved:false}}
  function projectContext(query,maxChars){const limit=Math.max(200,Number(maxChars)||1000),projects=loadProjects(),active=activeProject(),q=normalize(query);const ranked=projects.map(p=>({project:p,score:(active&&p.id===active.id?100:0)+(q?relevance({text:p.name+' '+p.description+' '+p.notes.map(n=>n.text).join(' ')},query).score:0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||String(b.project.updatedAt).localeCompare(String(a.project.updatedAt))).slice(0,4);let out='';for(const item of ranked){const p=item.project;const status=p.status==='completed'?'completado':p.status==='paused'?'pausado':'activo';let block='Proyecto '+p.name+' ('+status+')'+(p.description?': '+p.description:'')+'\n';p.notes.slice(-8).forEach(n=>{const label=n.type==='decision'?'Decisión':n.type==='next'?'Siguiente paso':n.type==='progress'?'Avance':'Nota';block+='  - '+label+': '+n.text+'\n'});if(out.length+block.length<=limit)out+=block}return out.trim()}
  const CORRECTION_KEY='jarvis_correction_signals_v1';
  function correctionPreference(message){
    const text=normalize(message);
    const rules=[
      {key:'brevity',match:/\b(mas breve|mas corto|mas conciso|ve al grano|no te enrolles|responde breve)\b/,value:'Prefiero respuestas breves y directas.'},
      {key:'steps',match:/\b(paso a paso|por pasos|uno por uno|desglosa los pasos)\b/,value:'Prefiero explicaciones paso a paso.'},
      {key:'simple',match:/\b(mas sencillo|mas simple|lenguaje sencillo|explicalo facil|facil de entender)\b/,value:'Prefiero explicaciones sencillas y fáciles de entender.'},
      {key:'detail',match:/\b(mas detalle|mas detallad\w*|mas completo|con mas profundidad|no omitas detalles)\b/,value:'Prefiero explicaciones completas y detalladas.'},
      {key:'exam',match:/\b(como en un examen|para examen|respuesta de examen|formato examen)\b/,value:'Cuando estudio, prefiero respuestas redactadas como en un examen.'},
      {key:'no-tables',match:/\b(sin tablas|no uses tablas|no me pongas tablas)\b/,value:'Prefiero que no uses tablas.'},
      {key:'tables',match:/\b(con tablas|usa tablas|ponlo en una tabla)\b/,value:'Prefiero que uses tablas cuando ayuden a organizar la información.'},
      {key:'valencian',match:/\b(en valenciano|en valencia)\b/,value:'Prefiero respuestas en valenciano.'},
      {key:'spanish',match:/\b(en castellano|en espanol)\b/,value:'Prefiero respuestas en castellano.'}
    ];
    return rules.find(rule=>rule.match.test(text))||null;
  }
  function learnFromCorrection(message){
    const text=String(message||'').trim();
    const rule=correctionPreference(text);
    if(!rule)return {recognized:false,saved:false};
    const explicit=/\b(a partir de ahora|siempre|por norma general|en general|cuando te pida|quiero que recuerdes|recuerda que prefiero|mi preferencia es)\b/i.test(text);
    let signals=[];
    try{const stored=JSON.parse(localStorage.getItem(CORRECTION_KEY)||'[]');signals=Array.isArray(stored)?stored:[]}catch(_){}
    const recent=signals.filter(x=>x&&x.key===rule.key).slice(-3);
    const count=recent.length+1;
    signals.push({key:rule.key,at:Date.now()});
    try{localStorage.setItem(CORRECTION_KEY,JSON.stringify(signals.slice(-30)))}catch(_){}
    if(!explicit&&count<2)return {recognized:true,saved:false,count,preference:rule.value};
    const facts=load(),prefix='Preferencia de respuesta: ';
    const textToSave=prefix+rule.value;
    const existing=facts.find(f=>f.text.startsWith(prefix)&&f.text!==textToSave);
    if(existing){
      existing.text=textToSave;existing.updatedAt=new Date().toISOString();
      if(!save(facts))return {recognized:true,saved:false,error:'No se pudo actualizar la memoria.'};
      return {recognized:true,saved:true,updated:true,fact:existing};
    }
    const result=remember(textToSave,{source:'automatic'});
    return {recognized:true,saved:!!result.ok&&!result.duplicate,duplicate:!!result.duplicate,fact:result.fact||null,error:result.error||null};
  }

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
  function exportData(){return {version:3,facts:load(),starredConversations:loadStarred(),projects:loadProjects(),activeProjectId:localStorage.getItem(ACTIVE_PROJECT_KEY)||null}}
  function importData(payload){
    const incoming=payload&&Array.isArray(payload.facts)?payload.facts:[];
    const facts=incoming.filter(f=>f&&typeof f.text==='string').map(f=>({id:String(f.id||uid()),text:f.text.trim().slice(0,MAX_TEXT),createdAt:f.createdAt||new Date().toISOString(),updatedAt:f.updatedAt||f.createdAt||new Date().toISOString()})).filter(f=>f.text).slice(-MAX_FACTS);
    const ok=save(facts);if(Array.isArray(payload&&payload.starredConversations)){try{localStorage.setItem(CHAT_KEY,JSON.stringify(payload.starredConversations.filter(x=>x&&typeof x.id==='string'&&typeof x.title==='string'&&typeof x.summary==='string').slice(-20)))}catch(_){}}if(Array.isArray(payload&&payload.projects)){saveProjects(payload.projects.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&Array.isArray(p.notes)).slice(-MAX_PROJECTS));if(payload.activeProjectId&&loadProjects().some(p=>p.id===payload.activeProjectId))localStorage.setItem(ACTIVE_PROJECT_KEY,payload.activeProjectId)}return ok;
  }
  window.JarvisMemory={list,remember,remove,clear,context,retrieve,learnFromMessage,learnFromCorrection,starConversation,listStarredConversations,unstarConversation,listProjects,getProject,activeProject,setActiveProject,createProject,addProjectNote,updateProject,removeProject,projectContext,learnProjectFromMessage,exportData,importData};
})();