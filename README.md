# Retrotype.co.uk — Astro / Netlify rebuild

A static rebuild of [retrotype.co.uk](https://retrotype.co.uk), refreshed for
deployment on Netlify and migrated off GoDaddy's Website Builder. Uses
[Astro](https://astro.build) for the static site, [Decap CMS](https://decapcms.org)
for the owner-friendly editor, and Netlify Identity + Git Gateway for free
authentication.

## Quick start

```bash
npm install
npm run dev          # local preview at http://localhost:4321
```

Production build:

```bash
npm run build        # outputs to ./dist
npm run preview      # serve the built site locally
```

## Project layout

```
retrotype/
├── astro.config.mjs        # Astro config (site URL, image domains)
├── netlify.toml            # Netlify build, headers, redirects from old URLs
├── package.json
├── public/
│   ├── admin/              # Decap CMS visual editor
│   │   ├── index.html
│   │   └── config.yml
│   ├── favicon.svg
│   ├── images/             # populated by `npm run fetch:images`
│   │   ├── archive/
│   │   ├── stock/
│   │   └── uploads/        # CMS-uploaded images go here
│   └── manuals/            # PDFs, populated by the same script
├── scripts/
│   └── download-images.mjs # Mirrors images + PDFs from GoDaddy CDN
└── src/
    ├── components/         # Nav, Footer
    ├── data/               # JSON content edited by Decap
    │   ├── archive.json    # 60+ A–Z machine entries
    │   ├── stock.json      # current Etsy listings
    │   └── manuals.json    # downloadable PDF manuals
    ├── layouts/Base.astro  # shared HTML shell, fonts, meta
    ├── pages/              # one .astro file per route
    │   ├── index.astro             # homepage / About
    │   ├── stock.astro             # /stock
    │   ├── archive.astro           # /archive (A–Z grid)
    │   ├── havelocks-haven.astro   # /havelocks-haven
    │   └── info.astro              # /info (blogs, manuals, contact)
    └── styles/global.css   # typography + paper/ink palette
```

## What's been refreshed

| Area              | Before (GoDaddy)                         | After                                       |
| ----------------- | ---------------------------------------- | ------------------------------------------- |
| **Hosting**       | GoDaddy Website Builder (£8–14/month)    | Netlify free tier (£0)                      |
| **CMS**           | Proprietary drag-and-drop                | Decap CMS — free, visual, Git-backed        |
| **Typography**    | Generic Website Builder fonts            | Special Elite headings, Cutive Mono labels, EB Garamond body |
| **URLs**          | `/blogs%2C-manuals-%26-info-1`           | `/info` (with 301 redirect from old)        |
| **Images**        | Lazy-loaded GoDaddy CDN, unoptimised     | Local copies, hashed long-cache headers     |
| **Contact form** | reCAPTCHA + GoDaddy form                  | Netlify Forms (free, no backend)            |
| **Sales links**   | Single Etsy URL on homepage              | Live grid of Etsy listings on `/stock`      |

## Deploying to Netlify

1. **Push this repo to GitHub** (or GitLab/Bitbucket).
2. **Create a new site on Netlify** → "Import from Git" → pick the repo.
3. Netlify auto-detects the build (`npm run build`, publish dir `dist`) from
   `netlify.toml`. Click **Deploy site**.
4. The site is live at a `*.netlify.app` URL within ~30 seconds.

### Connecting the `retrotype.co.uk` domain

You can do this in either order; we recommend domain-first so the site goes
live on the real URL the moment it's switched.

1. **Transfer the domain registrar away from GoDaddy** — to
   [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) (~£8/yr,
   at-cost) or [Namecheap](https://www.namecheap.com)/[Gandi](https://www.gandi.net).
   For `.co.uk`, follow the registrar's "transfer in" instructions; you'll need
   the domain's IPS tag changed (free, takes 1–5 days).
2. **Point DNS at Netlify**. In Netlify: *Domain settings → Add custom domain*
   → `retrotype.co.uk`. Netlify shows you the DNS records to add.
3. **Enable HTTPS**. Netlify provisions a free Let's Encrypt cert
   automatically once DNS resolves.
4. **Cancel GoDaddy hosting** once the new site has been live and stable
   for a week.

### Setting up the owner editor (Decap CMS)

1. Netlify dashboard → *Site configuration → Identity → Enable Identity*.
2. *Identity → Registration preferences → Invite only*.
3. *Identity → Services → Git Gateway → Enable*.
4. *Identity → Invite users* → enter the owner's email address.
5. They click the link in the email, set a password, then log in at
   `https://retrotype.co.uk/admin`.
6. From there they can edit any archive entry, stock listing, or manual list
   without touching code. Each save creates a Git commit, which triggers a
   Netlify rebuild within ~30 seconds.

### Setting up the contact form

The form on `/info` already declares `data-netlify="true"`. After the first
deploy:

1. Netlify dashboard → *Forms* — you'll see a `contact` form auto-detected.
2. Set up an email notification under *Form notifications → Add notification →
   Email notification*.

The free tier covers 100 submissions/month, which is plenty.

## Admin tools (Etsy import + mark-as-sold)

The site has a small custom admin page at **`/admin/tools.html`** that lets the
owner (a) add a new stock listing by pasting an Etsy URL, and (b) move a
sold listing to the A–Z archive with one click. It runs three Netlify
Functions:

| Function | Path | What it does |
| --- | --- | --- |
| `fetch-etsy`  | `/.netlify/functions/fetch-etsy`  | Server-side scrape of an Etsy listing page (uses JSON-LD product schema). Returns title, price, description and image URLs. |
| `save-stock`  | `/.netlify/functions/save-stock`  | Downloads the chosen image, commits it to `public/images/stock/` and appends a new entry to `src/data/stock.json` — in one commit. |
| `mark-sold`   | `/.netlify/functions/mark-sold`   | Moves an entry from `stock.json` to `archive.json`, copies its image into `public/images/archive/`, appends a "now gone" note. |

### One-time setup

The Functions need a GitHub Personal Access Token so they can commit to
the repo on the owner's behalf.

1. **Create a fine-grained PAT** at
   [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new).
   - *Resource owner*: the GitHub account or org that owns this repo
   - *Repository access*: select **only** the `retrotype-site` repo (or whatever you named it)
   - *Permissions* → *Repository permissions*:
     - **Contents**: Read and write
     - **Metadata**: Read-only (auto-selected)
   - Set an expiration that suits you. 1 year is reasonable; remember to rotate.
   - Click *Generate token*, copy it once (you won't see it again).

2. **Add four environment variables to the Netlify site**:
   *Site settings → Environment variables → Add a variable.*

   | Key         | Value                                                 |
   | ----------- | ----------------------------------------------------- |
   | `GH_TOKEN`  | the PAT you just generated                            |
   | `GH_OWNER`  | the GitHub username/org that owns the repo            |
   | `GH_REPO`   | the repo name (e.g. `retrotype-site`)                 |
   | `GH_BRANCH` | `main` (or whichever branch Netlify deploys from)     |

3. **Redeploy once** so the Functions pick up the new env vars
   (*Deploys → Trigger deploy → Deploy site*).

That's it. The admin page is now ready to use at
`https://<your-site>/admin/tools.html`. The owner signs in with the same
Netlify Identity account they use for `/admin/` (the Decap CMS editor).

### Day-to-day workflow

**Adding a new listing:**
1. Log in to `/admin/tools.html`.
2. Paste the full Etsy URL into the "Add a listing" box, click *Fetch*.
3. Tweak any fields, pick which photo to use (Etsy usually has 5–10).
4. Click *Save to stock*. Netlify rebuilds in ~30 seconds. The listing
   appears on the live site at `/stock`.

**Marking a listing as sold:**
1. In the "Current stock" table, click *Sold* next to the listing.
2. Confirm the dialog.
3. Listing moves to the archive (with a "now gone to a new owner" note
   appended to the description). Rebuild takes ~30 seconds.

If anything goes wrong, the page shows the actual error message from the
Function (e.g. "Etsy returned 503" or "GitHub commit failed: …") so you
can take a screenshot and share it.

### When Etsy blocks the auto-fetch

Etsy aggressively detects and blocks server-side scraping from
datacentre IPs (Netlify Functions run on AWS Lambda, which Etsy treats
as bot traffic). When that happens you'll see:

> Etsy blocked the automated fetch… Switch to manual entry.

The admin page automatically drops into **manual entry** mode at this
point. You can also click *Manual entry* up-front to skip the auto-fetch
attempt entirely.

In manual mode the workflow is only slightly more work:

1. Open the Etsy listing in another browser tab.
2. Type/paste the title, price and description into the admin form.
3. On the Etsy listing, right-click the photo you want →
   **Copy image address**.
4. Paste that URL into the *Image URL* field on the admin form.
5. Click *Save to stock*.

The image download itself still works because Etsy's image CDN
(`i.etsystatic.com`) isn't bot-blocked the way the main site is.

#### Permanent fix: ETSY_API_KEY

`fetch-etsy.mjs` already knows how to use Etsy's **Open API v3**. As
soon as you add an `ETSY_API_KEY` environment variable on Netlify the
function uses the API first and only falls back to scraping if the API
call itself fails. The API is reliable, doesn't get IP-blocked, and is
free for read-only listing access (10,000 calls/day, far more than
you'll ever need).

##### How to get a key

1. Sign in with the Retrotype Etsy account at
   [developers.etsy.com](https://developers.etsy.com).
2. Click **"Create a new app"** → fill in the form:
   - *Name*: `Retrotype admin tools` (or whatever)
   - *Description*: "Imports listings from my own Etsy shop into the
     retrotype.co.uk site"
   - *Justification*: "Read-only access to my own listings to populate
     a static catalogue site."
3. Submit. Etsy approves read-only access immediately — no waiting.
4. The app dashboard shows a **Keystring** (e.g. `abc123xyz...`).
   That's your API key.

##### Add it to Netlify

*Site settings → Environment variables → Add a variable:*

| Key             | Value                  |
| --------------- | ---------------------- |
| `ETSY_API_KEY`  | the keystring from Etsy |

Trigger a redeploy (*Deploys → Trigger deploy*) so the function picks
up the new env var. From the next deploy onwards, the auto-fetch in
the admin tools "just works" — no more 403s, no manual entry needed
in the normal case.

### Duplicate detection

After fetching a listing (via API or scrape) the function also checks
your existing `stock.json` and `archive.json` for matches and returns
them to the admin UI. You'll see one of three things in the admin
tools page:

- **No matches** — proceed straight to the preview / save panel.
- **Close matches (similar name)** — yellow panel listing the existing
  entries with a match percentage. Click *Continue* to proceed, or
  *Cancel* if it's the same one you already added.
- **Exact match** — same Etsy URL or identical name. The *Continue*
  button is disabled by default; tick the override checkbox to add
  anyway (useful when restocking a different example of the same model).

Match scoring is a token-set Jaccard similarity on normalised names
(case-folded, punctuation removed). Threshold is 50% similarity — low
enough to catch near-duplicates without being noisy. Up to 8 matches
are shown.

---

## Mirroring images and PDFs off GoDaddy

While you're testing, the site references images on GoDaddy's CDN
(`img1.wsimg.com`) so it works without any extra setup. Before you cancel the
GoDaddy account you should mirror everything locally:

```bash
npm install
npm run fetch:images
```

This reads the JSON data files, downloads each image (1600 px wide, max
quality) into `public/images/archive/` and `public/images/stock/`, and pulls
all the PDF manuals into `public/manuals/`.

Then in `src/pages/archive.astro` and `src/pages/stock.astro`, change:

```ts
const USE_LOCAL = false;   // ← change to true
```

…and the same flag in `src/pages/info.astro`. Commit and push; Netlify
rebuilds automatically.

## Changing the look & feel

All styling lives in `src/styles/global.css`. The palette is defined as CSS
variables at the top:

```css
--paper:        #f4ecd8;   /* manila / aged paper */
--ink:          #2a241a;   /* dark sepia ink */
--ribbon-red:   #8c2f2f;   /* faded typewriter ribbon */
--accent:       #4a6b3a;   /* muted forest green */
```

Fonts are pulled from Google Fonts in `src/layouts/Base.astro`:

- **Special Elite** — typewriter-style headings
- **Cutive Mono** — small caps / nav / labels
- **EB Garamond** — body text

Swap any of these for other Google Fonts (or a self-hosted file) and the rest
of the site picks up the change.

## Estimated annual cost

| Item                                  | Cost        |
| ------------------------------------- | ----------- |
| Domain (`retrotype.co.uk` via Cloudflare) | ~£8/yr      |
| Netlify hosting (free tier)           | £0          |
| Netlify Identity (up to 1,000 users)  | £0          |
| Netlify Forms (100 submissions / mo)  | £0          |
| Decap CMS                             | £0          |
| **Total**                             | **~£8/yr**  |

Compared to GoDaddy Website Builder at roughly £100–160/yr.
