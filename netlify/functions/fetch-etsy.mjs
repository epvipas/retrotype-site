/**
 * fetch-etsy
 * --------------------------------------------------------------------
 * POST { url } → returns parsed Etsy listing data + duplicate matches:
 *   {
 *     name, price, description, images: [url, ...], etsyUrl,
 *     source:     'api' | 'scrape',
 *     duplicates: [
 *       { where, name, serial?, etsy?, similarity, exact: bool }, ...
 *     ]
 *   }
 *
 * Two fetch strategies, in order of preference:
 *   1. Etsy Open API v3 (if ETSY_API_KEY env var is set) — reliable,
 *      no scraping, doesn't get blocked.
 *   2. HTML scrape with a full modern browser header set — works
 *      sometimes; Etsy aggressively blocks datacentre IPs.
 *
 * Either way, after a successful fetch we also pull stock.json and
 * archive.json from the repo and look for exact + close-name matches
 * so the admin UI can warn before saving a duplicate.
 */
import { readJson } from './_github.mjs';

const ETSY_API_KEY = process.env.ETSY_API_KEY;

export const handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, '');
  if (!context.clientContext?.user)   return cors(401, { error: 'Not authenticated. Sign in at /admin first.' });
  if (event.httpMethod !== 'POST')    return cors(405, { error: 'Method not allowed; use POST.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return cors(400, { error: 'Invalid JSON body.' }); }

  const url = (body.url || '').trim();
  const listingId = (url.match(/\/listing\/(\d+)/) || [])[1];
  if (!listingId) {
    return cors(400, { error: 'Please provide a valid Etsy listing URL (must contain /listing/<id>/).' });
  }

  // ------------------------------------------------------------------
  // 1. Try the Etsy API if a key is configured.
  // ------------------------------------------------------------------
  let data, source;
  if (ETSY_API_KEY) {
    try {
      data   = await fetchViaApi(listingId);
      source = 'api';
    } catch (err) {
      // Fall through to scraping with a warning attached.
      console.warn('Etsy API failed, falling back to scrape:', err.message);
    }
  }

  // ------------------------------------------------------------------
  // 2. Otherwise (or as fallback) try the HTML scrape.
  // ------------------------------------------------------------------
  if (!data) {
    const scraped = await fetchViaScrape(url);
    if (scraped.error) return cors(scraped.status || 502, scraped);
    data   = scraped.data;
    source = 'scrape';
  }

  // ------------------------------------------------------------------
  // 3. Duplicate check against stock + archive.
  // ------------------------------------------------------------------
  let duplicates = [];
  try {
    const stock   = await readJson('src/data/stock.json');
    const archive = await readJson('src/data/archive.json');
    duplicates = findDuplicates(data, stock.listings || [], archive.machines || []);
  } catch (err) {
    // Non-fatal — owner can still proceed without dupe info.
    console.warn('Duplicate check failed:', err.message);
  }

  return cors(200, { ...data, etsyUrl: url, source, duplicates });
};

// ====================================================================
// Etsy Open API v3
// ====================================================================

async function fetchViaApi(listingId) {
  const url = `https://openapi.etsy.com/v3/application/listings/${encodeURIComponent(listingId)}?includes=Images`;
  const res = await fetch(url, {
    headers: { 'x-api-key': ETSY_API_KEY, 'Accept': 'application/json' },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Etsy API ${res.status}: ${txt.slice(0, 200)}`);
  }
  const j = await res.json();

  // Price: { amount, divisor, currency_code }
  let prettyPrice = '';
  if (j.price?.amount != null && j.price?.divisor) {
    const v = j.price.amount / j.price.divisor;
    const symbol = { GBP: '£', USD: '$', EUR: '€' }[j.price.currency_code] || '';
    prettyPrice = `${symbol}${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)}`;
  }

  // Images: the largest URL per image, ordered by rank.
  const imgs = (j.images || [])
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map(i => i.url_fullxfull || i.url_3000x3000 || i.url_1500x1500 || i.url_750x750)
    .filter(Boolean);

  return {
    name:        cleanString(j.title),
    price:       prettyPrice,
    description: cleanString(j.description),
    images:      imgs,
  };
}

// ====================================================================
// HTML scrape fallback
// ====================================================================

async function fetchViaScrape(url) {
  let html;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 ' +
          '(KHTML, like Gecko) Version/17.5 Safari/605.1.15',
        'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language':           'en-GB,en;q=0.9',
        'Accept-Encoding':           'gzip, deflate, br',
        'Cache-Control':             'no-cache',
        'sec-ch-ua':                 '"Not.A/Brand";v="8", "Chromium";v="124", "Google Chrome";v="124"',
        'sec-ch-ua-mobile':          '?0',
        'sec-ch-ua-platform':        '"macOS"',
        'sec-fetch-dest':            'document',
        'sec-fetch-mode':            'navigate',
        'sec-fetch-site':            'none',
        'sec-fetch-user':            '?1',
        'upgrade-insecure-requests': '1',
        'Referer':                   'https://www.google.com/',
      },
      redirect: 'follow',
    });
    if (!res.ok) {
      const hint = res.status === 403
        ? 'Etsy blocked the automated fetch (most likely because Netlify Functions run on AWS Lambda, which Etsy treats as bot traffic). Switch to manual entry — or configure an ETSY_API_KEY env var (see README).'
        : `Etsy returned ${res.status} ${res.statusText}.`;
      return { error: hint, blocked: res.status === 403, status: res.status === 403 ? 403 : 502 };
    }
    html = await res.text();
    if (/captcha|are you a robot|forbidden/i.test(html.slice(0, 4000))) {
      return { error: 'Etsy returned a CAPTCHA page. Switch to manual entry or use ETSY_API_KEY.', blocked: true, status: 403 };
    }
  } catch (err) {
    return { error: `Could not fetch Etsy URL: ${err.message}`, status: 502 };
  }

  // Pull every JSON-LD block.
  const ldBlocks = [...html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g
  )];
  let product = null;
  for (const m of ldBlocks) {
    try {
      const data = JSON.parse(m[1].trim());
      const candidates = Array.isArray(data) ? data : [data];
      for (const c of candidates) {
        const items = c['@graph'] ? c['@graph'] : [c];
        for (const item of items) {
          if (item['@type'] === 'Product') { product = item; break; }
        }
        if (product) break;
      }
    } catch { /* skip */ }
    if (product) break;
  }

  const name        = product?.name        || pickMeta(html, 'og:title')       || '';
  const description = product?.description || pickMeta(html, 'og:description') || '';

  let price = '', currency = 'GBP';
  if (product?.offers) {
    const off = Array.isArray(product.offers) ? product.offers[0] : product.offers;
    if (off?.price)         price    = String(off.price);
    if (off?.priceCurrency) currency = off.priceCurrency;
  }
  const symbols = { GBP: '£', USD: '$', EUR: '€' };
  const prettyPrice = price ? `${symbols[currency] || ''}${price}` : '';

  let images = [];
  if (product?.image) {
    const raw = Array.isArray(product.image) ? product.image : [product.image];
    images = raw.map(i => (typeof i === 'string' ? i : (i.url || i.contentUrl || ''))).filter(Boolean);
  }
  if (!images.length) {
    const og = pickMeta(html, 'og:image');
    if (og) images = [og];
  }
  images = [...new Set(images.map(u => u.split('?')[0]))];

  return {
    data: {
      name:        cleanString(name),
      price:       prettyPrice,
      description: cleanString(description),
      images,
    },
  };
}

// ====================================================================
// Duplicate detection
// ====================================================================

/**
 * Returns potential duplicates from stock + archive, sorted by
 * similarity (highest first). Threshold is generous (0.5) so the UI can
 * show "you may also want to check…" matches; an exact match (Etsy URL
 * or normalised name) is flagged with `exact: true`.
 */
function findDuplicates(listing, stock, archive) {
  const matches = [];
  const newName = listing.name || '';
  const newEtsy = listing.etsyUrl || '';

  const consider = (entry, where) => {
    if (!entry.name) return;
    const exactEtsy = entry.etsy && newEtsy &&
                      sameUrl(entry.etsy, newEtsy);
    const exactName = normName(entry.name) === normName(newName);
    const sim       = nameSimilarity(entry.name, newName);
    if (exactEtsy || exactName || sim >= 0.5) {
      matches.push({
        where,
        name:    entry.name,
        ...(entry.serial ? { serial: entry.serial } : {}),
        ...(entry.etsy   ? { etsy:   entry.etsy   } : {}),
        similarity: Number(sim.toFixed(2)),
        exact:   exactEtsy || exactName,
        reason:  exactEtsy ? 'same-etsy-url'
                 : exactName ? 'same-name'
                 : 'similar-name',
      });
    }
  };

  for (const s of stock)   consider(s, 'stock');
  for (const a of archive) consider(a, 'archive');

  return matches.sort((x, y) => y.similarity - x.similarity).slice(0, 8);
}

function normName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function sameUrl(a, b) {
  try {
    const ua = new URL(a), ub = new URL(b);
    return ua.pathname.replace(/\/$/, '') === ub.pathname.replace(/\/$/, '');
  } catch { return a === b; }
}
function nameSimilarity(a, b) {
  // Token-set Jaccard similarity, ignoring single-character tokens.
  const tok = s => new Set(
    normName(s).split(/\s+/).filter(t => t.length > 1)
  );
  const A = tok(a), B = tok(b);
  if (!A.size && !B.size) return 0;
  const inter = [...A].filter(x => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
}

// ====================================================================
// Misc
// ====================================================================

function pickMeta(html, prop) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  return html.match(re)?.[1] || '';
}

function cleanString(s) {
  return (s || '')
    .replace(/<[^>]+>/g, ' ')          // strip any HTML tags
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
