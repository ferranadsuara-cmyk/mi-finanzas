const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','jarvis-web.js'),'utf8');
const context={window:{},String,RegExp,encodeURIComponent,fetch:async()=>{}};
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
