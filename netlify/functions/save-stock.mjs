/**
 * save-stock
 * --------------------------------------------------------------------
 * POST { listing: { name, price, description, etsy, image: { url, filename? } } }
 *
 * - Downloads the chosen image from Etsy's CDN (i.etsystatic.com)
 * - Commits the image to public/images/stock/<filename>
 * - Appends the listing to src/data/stock.json
 * - Both in ONE commit, which triggers exactly one Netlify rebuild.
 */
import { readJson, commitFiles, slugify } from './_github.mjs';

export const handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, '');
  if (event.httpMethod !== 'POST')    return cors(405, { error: 'Use POST.' });
  if (!context.clientContext?.user)   return cors(401, { error: 'Not authenticated.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return cors(400, { error: 'Invalid JSON body.' }); }

  const listing = body.listing;
  if (!listing?.name || !listing?.image?.url) {
    return cors(400, { error: 'Listing must include at least name and image.url.' });
  }

  // ---- Pick a safe filename ------------------------------------------------
  const urlExt = (listing.image.url.split('?')[0].match(/\.(jpe?g|png|webp|gif)$/i) || [])[0]
                 || '.jpg';
  const filename = listing.image.filename?.trim() || `${slugify(listing.name)}${urlExt}`;
  if (!/^[a-z0-9._-]+$/i.test(filename)) {
    return cors(400, { error: 'Filename must be alphanumeric, dot, dash, underscore.' });
  }

  // ---- Fetch the image -----------------------------------------------------
  let imageBuf;
  try {
    const res = await fetch(listing.image.url, {
      headers: { 'User-Agent': 'retrotype-site/1.0 (admin tools)' },
    });
    if (!res.ok) return cors(502, { error: `Image fetch failed: ${res.status}` });
    imageBuf = Buffer.from(await res.arrayBuffer());
    if (imageBuf.length > 5_000_000) {
      return cors(413, { error: 'Image larger than 5 MB — please pick a smaller version.' });
    }
  } catch (err) {
    return cors(502, { error: `Could not download image: ${err.message}` });
  }

  // ---- Read + update stock.json -------------------------------------------
  let stock;
  try { stock = await readJson('src/data/stock.json'); }
  catch (err) {
    return cors(500, { error: `Could not read stock.json: ${err.message}` });
  }
  if (!Array.isArray(stock.listings)) {
    return cors(500, { error: 'stock.json is malformed: missing listings array.' });
  }

  // Prevent accidental duplicate on rapid double-clicks.
  if (stock.listings.some(l => l.etsy === listing.etsy)) {
    return cors(409, { error: 'A listing with this Etsy URL already exists.' });
  }

  // Push the new entry. Note the field-naming matches what stock.astro expects.
  stock.listings.unshift({
    name:        listing.name.trim(),
    price:       (listing.price || '').trim(),
    image:       filename,
    etsy:        listing.etsy?.trim() || '',
    description: (listing.description || '').trim(),
  });

  // ---- Commit both files in one go ----------------------------------------
  try {
    const sha = await commitFiles([
      { path: `public/images/stock/${filename}`, content: imageBuf },
      { path: 'src/data/stock.json',
        content: JSON.stringify(stock, null, 2) + '\n' },
    ], `Add stock listing: ${listing.name}`);
    return cors(200, { ok: true, commit: sha, filename });
  } catch (err) {
    return cors(500, { error: `GitHub commit failed: ${err.message}` });
  }
};

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
