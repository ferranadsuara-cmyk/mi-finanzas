const test=require('node:test');
const assert=require('node:assert/strict');
const {parseResults,cleanText,allowedQuery}=require('../api/jarvis-search.js');
test('extrae títulos, fragmentos y URLs seguras de resultados',()=>{
 const html='<div class="result results_links results_links_deep web-result"><div class="result__body"><h2><a rel="nofollow" class="result__a" href="https://example.com/producto">Producto de prueba</a></h2><a class="result__snippet">Precio desde <b>89,99 €</b></a></div></div>';
 const rows=parseResults(html);
 assert.equal(rows.length,1);
 assert.equal(rows[0].title,'Producto de prueba');
 assert.match(rows[0].snippet,/89,99/);
 assert.equal(rows[0].url,'https://example.com/producto');
});
test('decodifica redirecciones y rechaza protocolos inseguros',()=>{
 const target=encodeURIComponent('https://shop.example/item');
 const html='<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg='+target+'">Tienda</a><a class="result__snippet">Producto</a></div>';
 assert.equal(parseResults(html)[0].url,'https://shop.example/item');
 assert.equal(parseResults('<div class="result"><a class="result__a" href="javascript:alert(1)">Peligro</a></div>').length,0);
});
test('limpia entidades y valida límites de búsqueda',()=>{
 assert.equal(cleanText('Precio &amp; envío <b>gratis</b>'),'Precio & envío gratis');
 assert.equal(allowedQuery('auriculares bluetooth'),true);
 assert.equal(allowedQuery('ab'),false);
 assert.equal(allowedQuery('x'.repeat(181)),false);
});
