# Portfolio Website

Static site served from `public/` on GitHub Pages (deployed on every push to `master`, see `.github/workflows/deploy.yml`).

## Layout

| File | What it does |
| --- | --- |
| `public/src/javascript/scripts.js` | Shared `<site-header>` and `<site-footer>` (nav, socials, scroll-to-top) and Google Analytics. Edit nav links here once, every page updates. |
| `public/src/javascript/projects.js` | The list of personal projects. Builds the home page cards and filters, and each project page's title block and prev/next links. |
| `public/src/css/input.css` | Tailwind source plus the shared component classes (`.panel`, `.tag`, `.hl`, `.doc`, …). |
| `public/src/css/output.css` | Compiled CSS. Generated, don't edit by hand. |
| `public/tiers/` | Game tier list page (`/tiers/`) and its editor (`/tiers/edit/`). |
| `public/src/javascript/tiers.js`, `tier-editor.js` | Tier list rendering and the editor. |
| `public/data/tiers.json` | Tier list data. Written by the editor, don't edit by hand. |
| `worker/` | Cloudflare Worker behind the editor (password check, IGDB search, commits to GitHub). Setup: [worker/README.md](worker/README.md). |

## Adding a personal project

1. Add an entry to `PROJECTS` in `public/src/javascript/projects.js` (title, page, thumbnail, summary, date, tags, filters).
2. Copy any page in `public/pages/portfolio/` and replace what's inside `<article class="panel doc …">`.
   Plain HTML is styled automatically: `<h2>` numbered section, `<h3>` sub-section, `<h4>` small heading,
   `<strong>`, `<code>` (inline code highlight), `<ul class="features">` (feature grid),
   `<div class="video"><iframe …></div>`, and `<figure class="code"><figcaption>File.cpp</figcaption><pre><code class="language-cpp">…</code></pre></figure>`.
3. Rebuild the CSS.

## Building CSS

```bash
npm install
npm run build:css     # one-off build
npm run watch:css     # rebuild on save while editing
```

Commit `public/src/css/output.css` after building; the deploy publishes `public/` as-is.
