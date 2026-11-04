const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','jarvis-web.js'),'utf8');
const context={window:{},String,RegExp,URL,encodeURIComponent,fetch:async()=>{}};
vm.runInNewContext(source,context);
const web=context.window.JarvisWeb;
test('detecta búsquedas web y comparación de precios',()=>{
 assert.equal(web.detect('Busca auriculares Sony por menos de 100 euros').shopping,true);
 assert.equal(web.detect('Busca una mochila para la universidad').shopping,true);
 assert.equal(web.detect('Compara precios de un robot aspirador').shopping,true);
 assert.equal(web.detect('Compara precios de una cafetera DeLonghi').query,'una cafetera DeLonghi');
 assert.equal(web.detect('¿Qué tiempo hace?'),null);
 assert.equal(web.detect('Investiga quién es Marie Curie').shopping,false);
 assert.equal(web.detect('¿Qué ha pasado hoy en el mundo?').shopping,false);
 assert.equal(web.detect('Busca información sobre la historia de la informática').query,'información sobre la historia de la informática');
 assert.equal(web.detect('Busca en internet quién es el actual presidente de Francia').shopping,false);
 assert.equal(web.detect('¿Cuáles son las últimas noticias de tecnología?').shopping,false);
 assert.equal(web.detect('Explícame qué es la fotosíntesis'),null);
 assert.equal(web.detect('Compara mis gastos con el mes anterior'),null);
 assert.equal(web.detect('Busca información sobre cómo funciona un robot aspirador').shopping,false);
});
test('formatea resultados como evidencia con URL',()=>{
 const out=web.evidence({results:[{title:'Tienda',url:'https://shop.example',snippet:'Oferta 49 €'}]});
 assert.match(out,/Tienda/);assert.match(out,/https:\/\/shop\.example/);assert.match(out,/49/);
 const local=web.evidence({results:[{store:'MediaMarkt',title:'Producto',url:'https://mediamarkt.es/item',price:89.9,priceSource:'search-snippet',queryType:'MediaMarkt · sucursales en Valencia'}]});
 assert.match(local,/no confirma sucursal concreta/);assert.match(local,/pendiente de verificar/);
});

test('selecciona hasta tres fuentes de dominios distintos',()=>{
 const chosen=web.selectResearchPages([
  {title:'A',url:'https://www.ejemplo.es/a'},
  {title:'B',url:'https://ejemplo.es/b'},
  {title:'C',url:'https://otra.org/c'},
  {title:'D',url:'https://tercera.net/d'},
  {title:'E',url:'javascript:alert(1)'}
 ],3);
 assert.equal(Array.from(chosen, x=>x.title).join(','),'A,C,D');
});
test('prepara evidencia de lectura con fecha, dominio y errores',()=>{
 const out=web.researchEvidence([{title:'Informe',canonicalUrl:'https://fuente.es/informe',publishedAt:'2026-11-01',description:'Resumen',headings:['Datos'],text:'Contenido útil'},{url:'https://fallo.org',readError:'Bloqueado'}]);
 assert.match(out,/fuente.es/);assert.match(out,/2026-11-01/);assert.match(out,/Contenido útil/);assert.match(out,/Bloqueado/);
});
