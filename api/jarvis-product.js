'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');
const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 9000;
const REDIRECTS = 3;

function decode(s) {
  return String(s || '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16))).replace(/&#(\d+);/g, (_, x) => String.fromCodePoint(Number(x)));
}
function plain(s) { return decode(String(s || '').replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 1200); }
function meta(html, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const name = tag.match(/\b(?:property|name)\s*=\s*(["'])(.*?)\1/i);
    const value = tag.match(/\bcontent\s*=\s*(["'])(.*?)\1/i);
    if (name && value && name[2].toLowerCase() === key.toLowerCase()) return decode(value[2]).trim();
  }
  return '';
}
function allProducts(value, out) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach(x => allProducts(x, out)); return; }
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  if (types.some(t => /^(Product|ProductGroup)$/i.test(String(t || '').split('/').pop()))) out.push(value);
  if (value['@graph']) allProducts(value['@graph'], out);
  if (value.itemListElement) allProducts(value.itemListElement, out);
}
function extractProduct(html, pageUrl) {
  const products = [];
  const scripts = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const raw = script.replace(/^<script\b[^>]*>|<\/script>$/gi, '').replace(/^\s*<!--|-->\s*$/g, '');
    try { allProducts(JSON.parse(decode(raw)), products); } catch (_) {}
  }
  const p = products[0] || {};
  const offer = Array.isArray(p.offers) ? p.offers[0] : (p.offers || {});
  const brand = typeof p.brand === 'string' ? p.brand : (p.brand && p.brand.name) || '';
  const props = [];
  if (Array.isArray(p.additionalProperty)) for (const x of p.additionalProperty) if (x && (x.name || x.value)) props.push({name: plain(x.name).slice(0,100), value: plain(x.value).slice(0,220)});
  const specs = [];
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows.slice(0, 60)) {
    const cells = (row.match(/<(?:th|td)\b[^>]*>[\s\S]*?<\/(?:th|td)>/gi) || []).map(plain).filter(Boolean);
    if (cells.length >= 2 && cells[0].length < 100 && cells[1].length < 220) specs.push({name:cells[0],value:cells[1]});
  }
  const title = plain(p.name || meta(html,'og:title') || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const description = plain(p.description || meta(html,'og:description') || meta(html,'description'));
  const priceRaw = offer.price ?? (offer.priceSpecification && offer.priceSpecification.price) ?? null;
  const price = priceRaw !== null && Number.isFinite(Number(String(priceRaw).replace(',','.'))) ? Number(String(priceRaw).replace(',','.')) : null;
  const currency = offer.priceCurrency || (price !== null ? 'EUR' : null);
  const availability = String(offer.availability || '');
  return {
    url: pageUrl, title: title.slice(0,220), description,
    brand: plain(brand).slice(0,100) || null,
    model: plain(p.model || p.modelNumber || '').slice(0,100) || null,
    sku: plain(p.sku || p.mpn || '').slice(0,100) || null,
    price, currency, priceSource: price === null ? null : 'structured-data',
    availability: /InStock/i.test(availability) ? 'listed-in-stock' : (/OutOfStock/i.test(availability) ? 'listed-out-of-stock' : 'not-confirmed'),
    specifications: [...props, ...specs].slice(0,40),
    extractedFrom: products.length ? 'schema.org Product' : 'page metadata',
    extractedAt: new Date().toISOString()
  };
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
    return x === '::1' || x === '::' ? false : !(x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb') || x.startsWith('::ffff:'));
  }
  return false;
}
async function validateHost(url) {
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local')) throw new Error('URL no permitida: utiliza una página HTTPS pública.');
  if (net.isIP(url.hostname)) throw new Error('No se permiten direcciones IP directas.');
  const records = await dns.lookup(url.hostname, {all:true, verbatim:true});
  if (!records.length || records.some(x => !isPublicIp(x.address))) throw new Error('El dominio no resuelve exclusivamente a direcciones públicas.');
}
async function fetchPage(url) {
  let current = new URL(url);
  for (let hop=0; hop<=REDIRECTS; hop++) {
    await validateHost(current);
    const response = await fetch(current, {redirect:'manual', headers:{'User-Agent':'Mozilla/5.0 (compatible; MiFinanzas-JARVIS/1.0)','Accept':'text/html,application/xhtml+xml'}, signal:AbortSignal.timeout(TIMEOUT_MS)});
    if ([301,302,303,307,308].includes(response.status)) {
      const loc = response.headers.get('location'); if (!loc || hop===REDIRECTS) throw new Error('Demasiadas redirecciones.');
      current = new URL(loc,current); continue;
    }
    if (!response.ok) throw new Error('La tienda no permite consultar la página (HTTP '+response.status+').');
    const type = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) throw new Error('La URL no parece ser una página HTML de producto.');
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) throw new Error('La página supera el tamaño máximo permitido.');
    const reader = response.body && response.body.getReader ? response.body.getReader() : null;
    if (!reader) throw new Error('No se ha podido leer la página.');
    const chunks=[]; let size=0;
    while (true) { const {done,value}=await reader.read(); if(done)break; size+=value.byteLength; if(size>MAX_BYTES){await reader.cancel();throw new Error('La página supera el tamaño máximo permitido.');} chunks.push(value); }
    const bytes=new Uint8Array(size); let offset=0; for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    return {html:new TextDecoder('utf-8').decode(bytes),url:current.toString()};
  }
  throw new Error('No se ha podido consultar la página.');
}
async function handler(req,res) {
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Método no permitido.'});}
  const raw=typeof req.query?.url==='string'?req.query.url:'';
  if(!raw || raw.length>2048) return res.status(400).json({error:'Indica una URL de producto válida.'});
  try {
    const url=new URL(raw);
    const page=await fetchPage(url.toString());
    const product=extractProduct(page.html,page.url);
    if(!product.title) return res.status(422).json({error:'No he podido identificar los datos del producto en esa página.'});
    res.setHeader('Cache-Control','private, max-age=60');
    return res.status(200).json({product,notice:'Datos extraídos de la página pública. El precio y la disponibilidad pueden cambiar; verifica las condiciones en la tienda.'});
  } catch(e) { return res.status(422).json({error:e.message || 'No se ha podido analizar la página.'}); }
}
module.exports=handler;
module.exports.extractProduct=extractProduct;
module.exports.isPublicIp=isPublicIp;
