const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','jarvis-research.js'),'utf8');
const context={window:{},String,URL,Set,Math};
vm.runInNewContext(source,context);
const research=context.window.JarvisResearch;

test('plans complementary queries for a person profile',()=>{
 const p=research.plan('Quién es Marie Curie');
 assert.equal(p.kind,'profile');
 assert.equal(p.queries.length,2);
 assert.match(p.queries[1],/biografía|biografia/);
 assert.ok(p.fallbackQuery);
});
test('plans current-event research with recent and official sources',()=>{
 const p=research.plan('Últimas noticias sobre inteligencia artificial hoy');
 assert.equal(p.kind,'current');
 assert.match(p.queries[1],/fuentes oficiales/);
 assert.match(p.fallbackQuery,/fechas datos recientes/);
});
test('plans comparison and explanatory research differently',()=>{
 assert.equal(research.plan('Compara energía solar y eólica').kind,'comparison');
 assert.equal(research.plan('Cómo funciona un motor eléctrico').kind,'explanatory');
});
test('normalizes accents and punctuation for query deduplication',()=>{
 assert.equal(research.normalize('¿Qué es la energía?'),'que es la energia');
});
test('merges search batches, removes tracking duplicates and rejects unsafe URLs',()=>{
 const merged=research.mergeResults([
  [{title:'A',url:'https://fuente.es/a?utm_source=one',snippet:'dato'}],
  [{title:'A duplicado',url:'https://fuente.es/a?utm_source=two'},{title:'B',url:'https://otra.org/b'}],
  [{title:'Inseguro',url:'javascript:alert(1)'}]
 ],10);
 assert.equal(merged.length,2);
 assert.equal(merged[0].title,'A');
 assert.equal(merged[1].title,'B');
});
