const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'jarvis-documents.js'), 'utf8');

function createDocuments() {
  const context = { window: {}, Math, Date, JSON, String, Number, Array, RegExp, Set, Promise };
  vm.runInNewContext(source, context);
  return context.window.JarvisDocuments;
}

test('acepta formatos documentales y de imagen admitidos', () => {
  const docs = createDocuments();
  for (const name of ['informe.pdf','memoria.docx','datos.xlsx','tabla.xls','notas.txt','foto.jpg']) {
    assert.equal(docs.validateFileInfo({name,size:100}).ok, true, name);
  }
  assert.equal(docs.validateFileInfo({name:'archivo.exe',size:100}).ok, false);
});

test('limita tamaño y bloquea nombres de archivos de credenciales', () => {
  const docs = createDocuments();
  assert.equal(docs.validateFileInfo({name:'informe.pdf',size:21*1024*1024}).ok, false);
  assert.equal(docs.validateFileInfo({name:'contraseña.txt',size:100}).ok, false);
  assert.equal(docs.limits.maxFilesPerProject, 30);
});

test('limpia texto HTML y normaliza texto extraído', () => {
  const docs = createDocuments();
  const result = docs.extractPlainText('pagina.html','<h1>Informe</h1><script>secreto()</script><p>Ventas &amp; gastos</p>');
  assert.equal(result.includes('secreto'), false);
  assert.match(result,/Informe/);
  assert.match(result,/Ventas & gastos/);
});

test('clasifica documentos por coincidencia con la consulta', () => {
  const docs = createDocuments();
  assert.ok(docs.rankText('Balance anual de ingresos y gastos','ingresos') > docs.rankText('Acta de reunión del equipo','ingresos'));
});

test('expone exportación y restauración para incluir archivos en la copia completa', () => {
  const docs = createDocuments();
  assert.equal(typeof docs.exportData, 'function');
  assert.equal(typeof docs.importData, 'function');
  assert.equal(docs.limits.maxFileBytes, 20*1024*1024);
});
