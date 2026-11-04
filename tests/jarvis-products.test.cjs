const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','jarvis-products.js'),'utf8');
function setup(){const store=new Map();const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v)};const window={localStorage};vm.runInNewContext(source,{window,URL,Date,Number,String,Array,JSON,RegExp,Error});return window.JarvisProducts}
test('extrae precios en euros sin inventarlos',()=>{const p=setup();assert.equal(p.parseEuroPrice('Oferta: 1.299,99 €'),1299.99);assert.equal(p.parseEuroPrice('Precio 89 euros'),89);assert.equal(p.parseEuroPrice('Consultar precio'),null)});
test('guarda, actualiza y elimina productos por URL',()=>{const p=setup();p.save({title:'Auriculares',url:'https://tienda.example/a',snippet:'79,90 €'});assert.equal(p.list().length,1);assert.equal(p.list()[0].price,79.9);p.save({title:'Auriculares nuevos',url:'https://tienda.example/a',snippet:'69,90 €'});assert.equal(p.list().length,1);assert.equal(p.list()[0].title,'Auriculares nuevos');p.remove('https://tienda.example/a');assert.equal(p.list().length,0)});
test('rechaza URLs no seguras y datos sin título',()=>{const p=setup();assert.throws(()=>p.save({title:'Producto',url:'javascript:alert(1)'}));assert.throws(()=>p.save({url:'https://tienda.example'}))});
test('compara productos guardados y exporta/importa la biblioteca',()=>{const p=setup();p.save({title:'A',url:'https://a.example',snippet:'10 €'});p.save({title:'B',url:'https://b.example',snippet:'20 €'});assert.equal(p.compare().length,2);const backup=p.exportData();const q=setup();assert.equal(q.importData(backup),2);assert.equal(q.list().length,2);assert.equal(q.compare().find(x=>x.title==='A').price,10)});
