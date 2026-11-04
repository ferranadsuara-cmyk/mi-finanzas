const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
if (!scripts.length) throw new Error('No se han encontrado scripts inline.');
scripts.forEach((match, index) => {
  if (match[1].trim()) new vm.Script(match[1], { filename: 'index.html:inline-script-' + (index + 1) });
});
console.log('Sintaxis correcta en ' + scripts.length + ' bloque(s) de JavaScript inline.');
