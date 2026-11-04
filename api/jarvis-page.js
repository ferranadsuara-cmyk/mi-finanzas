'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');
const MAX_BYTES = 1_000_000;
const MAX_TEXT = 9000;
const TIMEOUT_MS = 9000;
const REDIRECTS = 2;

function decode(s) {
  return String(s || '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16))).replace(/&#(\d+);/g, (_, x) => String.fromCodePoint(Number(x)));
}
function cleanText(s) { return decode(String(s || '').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|iframe|form|nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }
function meta(html, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const name = tag.match(/\b(?:property|name)\s*=\s*(["'])(.*?)\1/i);
    const value = tag.match(/\bcontent\s*=\s*(["'])(.*?)\1/i);
    if (name && value && name[2].toLowerCase() === key.toLowerCase()) return decode(value[2]).trim();
  }
  return '';
}
function extractPage(html, pageUrl) {
  const title = cleanText((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || meta(html, 'og:title') || '').slice(0, 220);
  const description = (meta(html, 'description') || meta(html, 'og:description')).slice(0, 500);
  const date = meta(html, 'article:published_time') || meta(html, 'datePublished');
  let body = (html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) || html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) || html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i) || [null, html])[1];
  const headings = [...body.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map(x => cleanText(x[1])).filter(Boolean).slice(0, 20);
  const text = cleanText(body).slice(0, MAX_TEXT);
  const canonicalMatch = html.match(/<link\b(?=[^>]*\brel\s*=\s*["']canonical["'])[^>]*\bhref\s*=\s*["']([^"']+)/i);
  let canonical = pageUrl;
  if (canonicalMatch) { try { const u = new URL(decode(canonicalMatch[1]), pageUrl); if (u.protocol === 'https:') canonical = u.toString(); } catch (_) {} }
  return { url: pageUrl, canonicalUrl: canonical, title, description, publishedAt: date || null, headings, text, truncated: cleanText(body).length > MAX_TEXT };
}
function isPublicIp(ip) {
  if (net.isIPv4(ip)) {
    const a = ip.split('.').map(Number);
    return !(a[0] === 0 || a[0] === 10 || a[0] === 127 || a[0] >= 224 ||
      (a[0] === 169 && a[1] === 254) || (a[0] === 172 && a[1] >= 16 && a[1] <= 31) ||
      (a[0] === 192 && a[1] === 168) || (a[0] === 100 && a[1] >= 64 && a[1] <= 127) ||
      (a[0] === 198 && (a[1] === 18 || a[1] === 19)));
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x.startsWith('::ffff:')) return false;
    return !(x === '::' || x === '::1' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb') || x.startsWith('ff'));
  }
  return false;
}
async function validateHost(url) {
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local') || net.isIP(url.hostname)) throw new Error('URL no permitida: utiliza una página HTTPS pública.');
  const records = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!records.length || records.some(x => !isPublicIp(x.address))) throw new Error('El dominio no resuelve exclusivamente a direcciones públicas.');
}
async function fetchPage(raw) {
  let current = new URL(raw);
  for (let hop = 0; hop <= REDIRECTS; hop++) {
    await validateHost(current);
    const response = await fetch(current, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MiFinanzas-JARVIS/1.0)', Accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if ([301,302,303,307,308].includes(response.status)) {
      const loc = response.headers.get('location');
      if (!loc || hop === REDIRECTS) throw new Error('Demasiadas redirecciones.');
      current = new URL(loc, current); continue;
    }
    if (!response.ok) throw new Error('La página no permite la consulta (HTTP ' + response.status + ').');
    if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type') || '')) throw new Error('La URL no devuelve una página HTML.');
    if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('La página supera el tamaño máximo permitido.');
    const reader = response.body && response.body.getReader ? response.body.getReader() : null;
    if (!reader) throw new Error('No se ha podido leer la página.');
    const chunks = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); throw new Error('La página supera el tamaño máximo permitido.'); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
    return { html: new TextDecoder('utf-8').decode(bytes), url: current.toString() };
  }
  throw new Error('No se ha podido consultar la página.');
}
async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Método no permitido.' }); }
  const raw = typeof req.query?.url === 'string' ? req.query.url : '';
  if (!raw || raw.length > 2048) return res.status(400).json({ error: 'Indica una URL pública válida.' });
  try {
    const url = new URL(raw);
    const page = await fetchPage(url.toString());
    const result = extractPage(page.html, page.url);
    if (!result.title && result.text.length < 80) return res.status(422).json({ error: 'La página no contiene suficiente texto legible.' });
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).json({ page: result, notice: 'Solo se ha extraído el contenido público accesible; puede estar incompleto.' });
  } catch (e) { return res.status(422).json({ error: e.message || 'No se ha podido leer la página.' }); }
}
module.exports = handler;
module.exports.cleanText = cleanText;
module.exports.extractPage = extractPage;
module.exports.isPublicIp = isPublicIp;
