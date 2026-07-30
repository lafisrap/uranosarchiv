// @ts-check
import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  // GitHub Pages project site (not a *.github.io user/org root site), so both
  // `site` and `base` are required — without `base`, every absolute asset/link
  // Astro generates would 404 once deployed under the /uranosarchiv/ subpath.
  site: 'https://lafisrap.github.io',
  base: '/uranosarchiv',
  integrations: [
    starlight({
      title: 'Uranos Archiv',
      logo: {
        src: './src/assets/hero/watercolor-swatch.jpg',
        alt: '',
      },
      customCss: ['./src/styles/starlight-theme.css'],
      components: {
        Sidebar: './src/components/starlight/CategorySidebar.astro',
        Footer: './src/components/starlight/CategoryFooter.astro',
      },
    }),
    sitemap(),
  ],
});
