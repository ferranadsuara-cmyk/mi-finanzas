const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanText, extractPage, isPublicIp } = require('../api/jarvis-page.js');

test('extrae título, descripción, encabezados y texto principal', () => {
  const html = '<html><head><title>Artículo de prueba</title><meta name="description" content="Resumen útil"><meta property="article:published_time" content="2026-10-01"></head><body><nav>Menú oculto</nav><main><h1>Investigación</h1><p>Este es el contenido principal.</p><script>no ejecutar</script><footer>Pie oculto</footer></main></body></html>';
  const page = extractPage(html, 'https://example.org/article');
  assert.equal(page.title, 'Artículo de prueba');
  assert.equal(page.description, 'Resumen útil');
  assert.equal(page.publishedAt, '2026-10-01');
  assert.deepEqual(page.headings, ['Investigación']);
  assert.match(page.text, /contenido principal/);
  assert.doesNotMatch(page.text, /Menú oculto|Pie oculto|no ejecutar/);
});
test('limpia entidades HTML y limita el texto extraído', () => {
  assert.equal(cleanText('<p>Hola&nbsp; &amp; adiós</p>'), 'Hola & adiós');
  const page = extractPage('<title>Grande</title><main>' + '<p>' + 'x'.repeat(12000) + '</p></main>', 'https://example.org');
  assert.equal(page.text.length, 9000);
  assert.equal(page.truncated, true);
});
test('rechaza direcciones IP privadas y especiales', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '192.168.1.2', '169.254.1.1', '::1', 'fc00::1', '::ffff:127.0.0.1']) assert.equal(isPublicIp(ip), false, ip);
  assert.equal(isPublicIp('8.8.8.8'), true);
  assert.equal(isPublicIp('2606:4700:4700::1111'), true);
});
