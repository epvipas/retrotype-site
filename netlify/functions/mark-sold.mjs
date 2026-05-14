/**
 * mark-sold
 * --------------------------------------------------------------------
 * POST { etsy }   identifies the stock entry by its Etsy URL
 *      or
 * POST { name }   identifies it by its display name
 *
 * Moves the listing from stock.json → archive.json, copies the image
 * file from public/images/stock/<file> to public/images/archive/<file>
 * (leaving the stock copy in place is harmless and saves a Git delete).
 *
 * Optional body field `serial` lets you set the archive entry's S/n.
 */
import { Octokit } from '@octokit/rest';
import { readJson, commitFiles, octokit, repo } from './_github.mjs';

export const handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, '');
  if (event.httpMethod !== 'POST')    return cors(405, { error: 'Use POST.' });
  if (!context.clientContext?.user)   return cors(401, { error: 'Not authenticated.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return cors(400, { error: 'Invalid JSON body.' }); }

  const id = (body.etsy || body.name || '').trim();
  if (!id) return cors(400, { error: 'Provide either etsy URL or name to identify the listing.' });

  // ---- Read both JSON files ----------------------------------------------
  let stock, archive;
  try {
    stock   = await readJson('src/data/stock.json');
    archive = await readJson('src/data/archive.json');
  } catch (err) {
    return cors(500, { error: `Could not read data files: ${err.message}` });
  }

  // ---- Find the entry to move --------------------------------------------
  const idx = stock.listings.findIndex(
    l => (body.etsy && l.etsy === body.etsy) ||
         (body.name && l.name === body.name)
  );
  if (idx < 0) return cors(404, { error: `No stock listing matches "${id}".` });
  const sold = stock.listings[idx];

  // ---- Read the image from /stock/ so we can copy it across --------------
  let imageBuf;
  if (sold.image) {
    try {
      const o = octokit();
      const res = await o.repos.getContent({
        owner: repo.owner,
        repo:  repo.repo,
        path:  `public/images/stock/${sold.image}`,
        ref:   repo.branch,
      });
      imageBuf = Buffer.from(res.data.content, 'base64');
    } catch (err) {
      // Not fatal — owner can re-upload later if needed.
      console.warn(`Image not found in stock folder: ${sold.image}`);
    }
  }

  // ---- Compose the archive entry -----------------------------------------
  const archiveEntry = {
    name:        sold.name,
    ...(body.serial ? { serial: body.serial } : {}),
    image:       sold.image,
    description: appendSoldMarker(sold.description),
  };
  // Newest "Now sold" entries go on top so they're easy to find when
  // editing. The A–Z page re-groups by letter anyway.
  archive.machines.unshift(archiveEntry);

  // Remove from stock
  stock.listings.splice(idx, 1);

  // ---- Commit everything in one go ---------------------------------------
  const files = [
    { path: 'src/data/stock.json',   content: JSON.stringify(stock,   null, 2) + '\n' },
    { path: 'src/data/archive.json', content: JSON.stringify(archive, null, 2) + '\n' },
  ];
  if (imageBuf) {
    files.push({ path: `public/images/archive/${sold.image}`, content: imageBuf });
  }

  try {
    const sha = await commitFiles(files, `Sold: ${sold.name} — moved to archive`);
    return cors(200, { ok: true, commit: sha, moved: sold.name });
  } catch (err) {
    return cors(500, { error: `GitHub commit failed: ${err.message}` });
  }
};

function appendSoldMarker(desc) {
  const base = (desc || '').trim();
  if (/now\s+(gone|sold|found)/i.test(base)) return base;
  return base ? `${base} Now gone to a new owner.` : 'Now gone to a new owner.';
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
