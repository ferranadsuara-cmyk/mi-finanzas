const fs = require('node:fs');
const vm = require('node:vm');

const files = ['index.html', 'nueva-web/index.html'];
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  if (!scripts.length) throw new Error(file + ': no se han encontrado scripts inline.');
  scripts.forEach((match, index) => {
    if (match[1].trim()) new vm.Script(match[1], { filename: file + ':inline-script-' + (index + 1) });
  });
  console.log(file + ': sintaxis correcta en ' + scripts.length + ' bloque(s) inline.');
}
