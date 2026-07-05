import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

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
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
  build: {
    format: 'directory',
  },
});
