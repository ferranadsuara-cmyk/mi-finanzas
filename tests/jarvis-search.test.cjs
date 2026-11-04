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
 assert.equal(rows[0].price,89.99);
 assert.equal(rows[0].priceSource,'search-snippet');
});
test('decodifica redirecciones y rechaza protocolos inseguros',()=>{
 const target=encodeURIComponent('https://shop.example/item');
 const html='<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg='+target+'">Tienda</a><a class="result__snippet">Producto</a></div>';
 assert.equal(parseResults(html)[0].url,'https://shop.example/item');
 assert.equal(parseResults('<div class="result"><a class="result__a" href="javascript:alert(1)">Peligro</a></div>').length,0);
});
test('identifica tienda por retailer y conserva el precio como fragmento no confirmado',()=>{
 const html='<div class="result"><a class="result__a" href="https://pccomponentes.com/item">Auriculares</a><a class="result__snippet">79,99 €</a></div>';
 const row=parseResults(html,6,'PcComponentes · sucursales en Valencia')[0];
 assert.equal(row.store,'PcComponentes');assert.equal(row.price,79.99);assert.equal(row.priceSource,'search-snippet');assert.match(row.queryType,/Valencia/);
});
test('general web search labels each source by its real domain',()=>{\n const html='<div class="result"><a class="result__a" href="https://example.org/page">Research result</a><a class="result__snippet">Useful information</a></div>';\n const row=parseResults(html,8,'general')[0];\n assert.equal(row.store,'example.org');\n assert.equal(row.queryType,'general');\n});\ntest('limpia entidades y valida límites de búsqueda',()=>{
 assert.equal(cleanText('Precio &amp; envío <b>gratis</b>'),'Precio & envío gratis');
 assert.equal(allowedQuery('auriculares bluetooth'),true);
 assert.equal(allowedQuery('ab'),false);
 assert.equal(allowedQuery('x'.repeat(181)),false);
});
