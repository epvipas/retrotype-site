import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://retrotype.co.uk',
  // 'directory' format outputs /archive/index.html etc, which Netlify
  // serves cleanly at /archive (no .html suffix in the URL).
  build: {
    format: 'directory',
  },
  trailingSlash: 'never',
  image: {
    domains: ['img1.wsimg.com', 'isteam.wsimg.com'],
  },
});
