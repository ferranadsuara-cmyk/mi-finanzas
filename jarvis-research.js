(function(){
 'use strict';
 function normalize(value){return String(value||'').toLocaleLowerCase('es-ES').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9\\s]/g,' ').replace(/\\s+/g,' ').trim()}
 function compactQuery(value,max=180){return String(value||'').replace(/\\s+/g,' ').trim().slice(0,max)}
 function plan(question){
  const base=compactQuery(question);
  const q=normalize(base);
  if(!base)return {queries:[],fallbackQuery:null,kind:'empty'};
  let additions=[],kind='general';
  if(/\\b(hoy|ahora|actual|actualidad|ultima hora|ultimas noticias|reciente|esta semana|este mes)\\b/.test(q)){
   kind='current';
   additions=[base+' fuentes oficiales últimas noticias',base+' cronología fechas datos recientes'];
  }else if(/\\b(compara|comparacion|diferencias|frente a|versus|vs)\\b/.test(q)){
   kind='comparison';
   additions=[base+' diferencias y criterios de comparación',base+' ventajas desventajas datos fuentes'];
  }else if(/\\b(quien es|quien fue|biografia)\\b/.test(q)){
   kind='profile';
   additions=[base+' biografía trayectoria fuentes oficiales',base+' fechas hitos datos principales'];
  }else if(/\\b(que es|que significa|definicion|como funciona|por que|porque|causas|explica)\\b/.test(q)){
   kind='explanatory';
   additions=[base+' explicación detallada fuentes oficiales',base+' estudios datos ejemplos evidencia'];
  }else{
   additions=[base+' fuentes fiables datos verificables',base+' contexto análisis evidencia'];
  }
  const queries=[base,...additions].map(x=>compactQuery(x));
  const unique=[];const seen=new Set();
  for(const item of queries){const key=normalize(item);if(key&&!seen.has(key)){seen.add(key);unique.push(item)}}
  const fallback=compactQuery(additions[1]||base);
  return {queries:unique.slice(0,2),fallbackQuery:fallback,kind};
 }
 function urlKey(value){
  try{const u=new URL(value);if(!/^https?:$/.test(u.protocol))return '';u.hash='';['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'].forEach(k=>u.searchParams.delete(k));return u.toString()}catch(_){return ''}
 }
 function mergeResults(batches,limit=18){
  const out=[],seen=new Set();
  (batches||[]).forEach((batch,batchIndex)=>(batch&&batch.results||batch||[]).forEach(item=>{
   if(!item||!item.url)return;const key=urlKey(item.url);if(!key||seen.has(key))return;seen.add(key);
   out.push({...item,researchQueryIndex:batchIndex});
  }));
  return out.slice(0,Math.max(1,Math.min(30,Number(limit)||18)));
 }
 window.JarvisResearch={plan,mergeResults,normalize};
})();