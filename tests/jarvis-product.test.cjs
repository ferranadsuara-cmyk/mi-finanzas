const test=require('node:test');
const assert=require('node:assert/strict');
const {extractProduct,isPublicIp}=require('../api/jarvis-product.js');
test('extrae producto, marca, modelo, precio y especificaciones JSON-LD',()=>{
 const html='<html><head><title>Fallback</title></head><body><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Auriculares X","brand":{"@type":"Brand","name":"Acme"},"model":"X-100","description":"Auriculares inalámbricos","additionalProperty":[{"@type":"PropertyValue","name":"Autonomía","value":"40 horas"}],"offers":{"@type":"Offer","price":"89.99","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}</script></body></html>';
 const p=extractProduct(html,'https://shop.example/product');
 assert.equal(p.title,'Auriculares X');assert.equal(p.brand,'Acme');assert.equal(p.model,'X-100');assert.equal(p.price,89.99);assert.equal(p.currency,'EUR');assert.equal(p.availability,'listed-in-stock');assert.deepEqual(p.specifications[0],{name:'Autonomía',value:'40 horas'});
});
test('usa metadatos cuando no hay JSON-LD de producto y no inventa precio',()=>{
 const p=extractProduct('<html><head><meta property="og:title" content="Teclado mecánico"><meta property="og:description" content="Switches rojos"></head></html>','https://shop.example/k');
 assert.equal(p.title,'Teclado mecánico');assert.equal(p.description,'Switches rojos');assert.equal(p.price,null);assert.equal(p.availability,'not-confirmed');
});
test('rechaza rangos IP privados, loopback y link-local',()=>{
 for(const ip of ['127.0.0.1','10.0.0.2','192.168.1.1','169.254.10.2','::1','fc00::1','fe80::1'])assert.equal(isPublicIp(ip),false,ip);
 assert.equal(isPublicIp('8.8.8.8'),true);assert.equal(isPublicIp('2606:4700:4700::1111'),true);
});
