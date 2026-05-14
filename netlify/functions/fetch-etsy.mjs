/**
 * fetch-etsy
 * --------------------------------------------------------------------
 * POST { url } → returns parsed Etsy listing data:
 *   { name, price, description, images: [url, ...], etsyUrl }
 *
 * Strategy: fetch the listing page server-side (with a browser-like
 * User-Agent so Etsy returns the full HTML) and extract structured data
 * from the JSON-LD <script> blocks that Etsy reliably embeds.
 *
 * Requires Netlify Identity auth: the caller must include a valid
 * Identity JWT in the Authorization header. Netlify automatically
 * decodes it into context.clientContext.user.
 */

export const handler = async (event, context) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return cors(204, '');
  }

  // Auth: only logged-in Identity users
  if (!context.clientContext?.user) {
    return cors(401, { error: 'Not authenticated. Sign in at /admin first.' });
  }

  if (event.httpMethod !== 'POST') {
    return cors(405, { error: 'Method not allowed; use POST.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return cors(400, { error: 'Invalid JSON body.' });
  }

  const url = (body.url || '').trim();
  if (!/^https?:\/\/(www\.)?etsy\.com\//i.test(url) &&
      !/^https?:\/\/[^/]*\.etsy\.com\//i.test(url)) {
    return cors(400, { error: 'Please provide a valid Etsy listing URL.' });
  }

  let html;
  try {
    const res = await fetch(url, {
      headers: {
        // Etsy serves a degraded page to bare fetch UAs; mimic a real browser.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 ' +
          '(KHTML, like Gecko) Version/16.6 Safari/605.1.15',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      redirect: 'follow',
    });
    if (!res.ok) {
      return cors(502, { error: `Etsy returned ${res.status} ${res.statusText}` });
    }
    html = await res.text();
  } catch (err) {
    return cors(502, { error: `Could not fetch Etsy URL: ${err.message}` });
  }

  // Pull every <script type="application/ld+json">…</script> block.
  // Etsy puts a Product schema in one of them.
  const ldBlocks = [...html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g
  )];

  let product = null;
  for (const m of ldBlocks) {
    try {
      const data = JSON.parse(m[1].trim());
      const candidates = Array.isArray(data) ? data : [data];
      for (const c of candidates) {
        // Some entries are wrapped in @graph
        const items = c['@graph'] ? c['@graph'] : [c];
        for (const item of items) {
          if (item['@type'] === 'Product') { product = item; break; }
        }
        if (product) break;
      }
    } catch { /* skip malformed blocks */ }
    if (product) break;
  }

  // Build the response from whatever signal we found.
  const name        = product?.name        || pickMeta(html, 'og:title')       || '';
  const description = product?.description || pickMeta(html, 'og:description') || '';

  // Price can live in offers (single) or offers[] or aggregateOffer.
  let price = '';
  let currency = 'GBP';
  if (product?.offers) {
    const off = Array.isArray(product.offers) ? product.offers[0] : product.offers;
    if (off?.price)         price    = String(off.price);
    if (off?.priceCurrency) currency = off.priceCurrency;
  }
  // Format with a symbol if we recognise the currency.
  const symbols = { GBP: '£', USD: '$', EUR: '€' };
  const prettyPrice = price ? `${symbols[currency] || ''}${price}` : '';

  // Images: schema.org spec says image can be a string OR array of strings/ImageObject.
  let images = [];
  if (product?.image) {
    const raw = Array.isArray(product.image) ? product.image : [product.image];
    images = raw
      .map(i => (typeof i === 'string' ? i : (i.url || i.contentUrl || '')))
      .filter(Boolean);
  }
  if (!images.length) {
    const og = pickMeta(html, 'og:image');
    if (og) images = [og];
  }
  // Strip query strings and dedupe.
  images = [...new Set(images.map(u => u.split('?')[0]))];

  return cors(200, {
    name:        cleanString(name),
    price:       prettyPrice,
    description: cleanString(description),
    images,
    etsyUrl:     url,
  });
};

// --------------------- helpers ---------------------

function pickMeta(html, prop) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  return html.match(re)?.[1] || '';
}

function cleanString(s) {
  return (s || '')
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type, Authorization',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}
