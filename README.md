# satvik-site

Personal site + blog. Built with [Astro](https://astro.build), deployed to GitHub Pages.

## Local development

```bash
npm install
npm run dev          # http://localhost:4321
npm run build        # outputs to ./dist
npm run preview      # serve the built site locally
```

## Project layout

```
src/
├── pages/
│   ├── index.astro          # /  (about / profile)
│   ├── blog/
│   │   ├── index.astro      # /blog
│   │   └── [...slug].astro  # /blog/<post-slug>
│   └── 404.astro
├── layouts/
│   ├── BaseLayout.astro
│   └── PostLayout.astro
├── components/
│   ├── Header.astro
│   └── Footer.astro
├── content/
│   └── blog/                # markdown posts go here
│       └── hello-world.md
├── styles/
│   └── global.css
└── content.config.ts        # blog frontmatter schema
```

## Adding a blog post

1. Create `src/content/blog/<slug>.md`.
2. Frontmatter:
   ```yaml
   ---
   title: "Post title"
   description: "One-sentence summary, shown on the index and in social cards."
   date: 2026-05-12
   draft: false
   ---
   ```
3. Write Markdown below the frontmatter. Code fences, tables, blockquotes, and inline `code` all styled in `src/styles/global.css`.
4. `npm run dev` to preview locally; commit and push to deploy.

Set `draft: true` to keep a post out of the index and out of production builds.

## Deploying to GitHub Pages

1. Create a repo on GitHub. Two options:
   - **User site** &mdash; name the repo `<your-username>.github.io`. Site lives at `https://<your-username>.github.io/`. Leave `astro.config.mjs` `base` unset.
   - **Project site** &mdash; any repo name. Site lives at `https://<your-username>.github.io/<repo-name>/`. In `astro.config.mjs`, uncomment and set `base: '/<repo-name>'`.
2. Edit `astro.config.mjs` and set `site` to the canonical URL of the deployed site.
3. Push:
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin git@github.com:<your-username>/<repo>.git
   git push -u origin main
   ```
4. In the repo on GitHub: **Settings → Pages → Build and deployment → Source → GitHub Actions**.
5. The workflow at `.github/workflows/deploy.yml` builds and deploys on every push to `main`.

## Customization checklist

Things to edit before going live:

- `src/pages/index.astro` &mdash; profile copy, GitHub/X handles.
- `src/components/Footer.astro` &mdash; GitHub link.
- `src/components/Header.astro` &mdash; brand text if you want something other than your name.
- `src/layouts/PostLayout.astro` &mdash; contact email at the bottom of every post.
- `astro.config.mjs` &mdash; `site` URL and (if a project site) `base`.
- `public/favicon.svg` &mdash; the single-letter favicon.

## Tech notes

- **Astro 5** with the content layer (glob loader). Zero JS shipped to the browser by default.
- **Markdown** posts validated against the schema in `src/content.config.ts`. Builds fail fast on missing/malformed frontmatter, which is the behavior you want.
- **Shiki** for syntax highlighting at build time (no client runtime).
- **Dark mode** via `prefers-color-scheme`. No toggle &mdash; the system handles it.
- **No analytics, no JS frameworks, no tracking.** Add what you want; the default is empty.
