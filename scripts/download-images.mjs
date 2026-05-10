#!/usr/bin/env node
/* ========================================================================
   download-images.mjs
   ------------------------------------------------------------------------
   Pulls every image referenced in src/data/*.json from the GoDaddy CDN
   into /public/images/<archive|stock>/ so the site is self-contained and
   no longer depends on GoDaddy after migration.

   Run after `npm install`:
       npm run fetch:images

   Then in src/pages/archive.astro and stock.astro flip:
       const USE_LOCAL = true;
   ...and rebuild.

   Also fetches PDF owner manuals from the GoDaddy 'blobby' bucket into
   /public/manuals/.
   ======================================================================== */

import { writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const CDN_BASE     = 'https://img1.wsimg.com/isteam/ip/eb78fbb0-bda5-4797-86a5-ceaff130aac1';
const BLOBBY_BASE  = 'https://img1.wsimg.com/blobby/go/eb78fbb0-bda5-4797-86a5-ceaff130aac1';

// Larger size than the 600x450 thumbnails used in pages, so future redesigns
// can crop differently without losing fidelity.
const IMG_TRANSFORM = '/:/rs=w:1600,cg:true,m';

/** @param {string} url @param {string} dest */
async function fetchTo(url, dest) {
  try {
    await access(dest);
    console.log(`  ✓ already have ${dest.replace(ROOT + '/', '')}`);
    return;
  } catch { /* fall through and download */ }

  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  ✗ ${res.status} ${res.statusText} — ${url}`);
    return;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  console.log(`  → saved ${dest.replace(ROOT + '/', '')} (${(buf.length / 1024).toFixed(0)} KB)`);
}

async function readJson(rel) {
  const full = resolve(ROOT, rel);
  return JSON.parse(await readFile(full, 'utf8'));
}

console.log('─── Retrotype image / manual mirror ───\n');

// Archive ---------------------------------------------------------------
const archive = (await readJson('src/data/archive.json')).machines;
console.log(`Archive: ${archive.length} entries`);
const seen = new Set();
for (const m of archive) {
  if (!m.image || seen.has(m.image)) continue;
  seen.add(m.image);
  const url  = `${CDN_BASE}/${encodeURIComponent(m.image)}${IMG_TRANSFORM}`;
  const dest = resolve(ROOT, 'public/images/archive', m.image);
  await fetchTo(url, dest);
}

// Stock -----------------------------------------------------------------
const stock = (await readJson('src/data/stock.json')).listings;
console.log(`\nStock: ${stock.length} entries`);
for (const s of stock) {
  if (!s.image) continue;
  const url  = `${CDN_BASE}/${encodeURIComponent(s.image)}${IMG_TRANSFORM}`;
  const dest = resolve(ROOT, 'public/images/stock', s.image);
  await fetchTo(url, dest);
}

// Manuals ---------------------------------------------------------------
const manuals = (await readJson('src/data/manuals.json')).manuals;
console.log(`\nManuals: ${manuals.length} entries`);
for (const m of manuals) {
  const url  = `${BLOBBY_BASE}/${encodeURIComponent(m.file)}`;
  const dest = resolve(ROOT, 'public/manuals', m.file);
  await fetchTo(url, dest);
}

console.log('\nDone. Now flip USE_LOCAL = true in archive.astro and stock.astro,');
console.log('and the URL builder in info.astro, and rebuild with `npm run build`.');
