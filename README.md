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
