import { defineConfig } from 'astro/config';

// If you deploy to https://<username>.github.io/  -> leave `base` unset.
// If you deploy to https://<username>.github.io/<repo>/  -> set base to '/<repo>/'.
export default defineConfig({
  site: 'https://satvik13o7.github.io',
  // base is intentionally unset — this is a user site at root.
  markdown: {
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
  },
  build: {
    format: 'directory',
  },
});
