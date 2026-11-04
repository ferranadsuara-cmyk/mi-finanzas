'use strict';

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const requestLog = new Map();

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
}
function cleanText(value) {
  return decodeEntities(String(value || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}
function safeUrl(href) {
  if (!href) return null;
  let decoded = decodeEntities(href).trim();
  try {
    if (decoded.startsWith('//')) decoded = 'https:' + decoded;
    const parsed = new URL(decoded, 'https://duckduckgo.com');
    if (parsed.hostname.endsWith('duckduckgo.com')) {
      const target = parsed.searchParams.get('uddg');
      if (target) decoded = decodeURIComponent(target);
    }
    const url = new URL(decoded);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    if (['duckduckgo.com', 'html.duckduckgo.com'].includes(url.hostname)) return null;
    return url.toString();
  } catch (_) { return null; }
}
function parseResults(html, limit = 6) {
  const source = String(html || '');
  const blocks = source.split(/<div[^>]+class=["'][^"']*result[^"']*["'][^>]*>/i).slice(1);
  const output = [];
  const seen = new Set();
  for (const block of blocks) {
    const titleMatch = block.match(/<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const url = safeUrl(titleMatch[1]);
    const title = cleanText(titleMatch[2]);
    if (!url || !title || seen.has(url)) continue;
    const snippetMatch = block.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|td|div)/i);
    const snippet = cleanText(snippetMatch && snippetMatch[1]);
    output.push({ title: title.slice(0, 180), snippet: snippet.slice(0, 420), url });
    seen.add(url);
    if (output.length >= limit) break;
  }
  return output;
}
function allowedQuery(q) {
  return typeof q === 'string' && q.trim().length >= 3 && q.trim().length <= 180 && !/[\u0000-\u001f]/.test(q);
}
function rateLimited(ip, now = Date.now()) {
  const times = (requestLog.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (times.length >= RATE_LIMIT) { requestLog.set(ip, times); return true; }
  times.push(now); requestLog.set(ip, times); return false;
}
async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  const q = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
  if (!allowedQuery(q)) return res.status(400).json({ error: 'La búsqueda debe tener entre 3 y 180 caracteres.' });
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Has realizado demasiadas búsquedas seguidas. Espera un minuto.' });
  try {
    const endpoint = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q);
    const response = await fetch(endpoint, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MiFinanzas-JARVIS/1.0; +https://mi-finanzas-tbu1.vercel.app)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) return res.status(502).json({ error: 'El buscador externo no está disponible ahora mismo.' });
    const html = await response.text();
    const results = parseResults(html, 6);
    if (!results.length) return res.status(503).json({ error: 'El buscador no ha devuelto resultados. Puede haber limitado temporalmente la consulta.' });
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    return res.status(200).json({
      provider: 'DuckDuckGo',
      query: q,
      searchedAt: new Date().toISOString(),
      results
    });
  } catch (error) {
    return res.status(504).json({ error: 'La búsqueda ha tardado demasiado o no hay conexión. Inténtalo de nuevo.' });
  }
}
module.exports = handler;
module.exports.parseResults = parseResults;
module.exports.cleanText = cleanText;
module.exports.allowedQuery = allowedQuery;
