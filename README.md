# MELT website

Companion website for the **MELT** (Mouse Embryonic Lineage and Transcriptome)
paper. A static site with five pages: Home, Explore (embeds the data-exploration
tool), Linkage (interactive heatmap), Fate (interactive Sankey), and Download
(Zenodo links).

Built with [Astro](https://astro.build) + React islands. Interactive plots are
custom SVG driven by `d3-scale` / `d3-sankey` — no heavy charting library.

## Quick start

```bash
npm install        # once
npm run dev        # dev server with hot reload
```

Then open the URL printed in the terminal — note the `/melt-website` path:

```
http://localhost:4321/melt-website
```

> **On a remote Linux server?** See [Viewing from a remote server](#viewing-from-a-remote-server) below.

## Commands

| Command           | What it does                                        |
| ----------------- | --------------------------------------------------- |
| `npm run dev`     | Start the dev server (hot reload) on port 4321      |
| `npm run build`   | Build the static site into `dist/`                  |
| `npm run preview` | Serve the built `dist/` locally (production-like)   |

## Viewing from a remote server

The dev server binds to `localhost` on the machine that runs it. To see it in a
browser on your own computer, use **one** of these:

**A. SSH port forwarding (recommended)** — from your local machine:

```bash
ssh -L 4321:localhost:4321 <user>@<server>
# then, on the server:
npm run dev
# then, in your local browser:
#   http://localhost:4321/melt-website
```

**B. Expose on the network** — if your computer can reach the server's IP
directly (e.g. same institute network):

```bash
npm run dev -- --host        # prints a Network URL
# open http://<server-ip>:4321/melt-website from your browser
```

`npm run preview` supports the same `-- --host` flag and SSH-forwarding approach.

## Project structure

```
src/
├── config/site.ts          # EDIT ME: URLs, Zenodo record, citation, stats
├── layouts/Base.astro       # page shell (head, nav, footer)
├── components/              # Nav, Footer, Hero, EmbedFrame, plots
│   ├── LinkageHeatmap.tsx   # heatmap + sidebar (Linkage page)
│   └── FateSankey.tsx       # Sankey with expand-on-select (Fate page)
├── pages/                   # one file per route (index, explore, linkage, fate, download)
├── lib/                     # data types + base-path helper
└── styles/                  # tokens.css (design tokens) + global.css
public/
├── data/                    # linkage.json + fate.json (+ schema README)
└── favicon.svg
```

## Updating content

- **Site config** (explore-tool URL, Zenodo record/DOI, citation, GitHub link,
  Home stat tiles): edit `src/config/site.ts`.
- **Plot data**: replace `public/data/linkage.json` and `public/data/fate.json`.
  The schema is documented in [`public/data/README.md`](public/data/README.md);
  matching it means no code changes. The current files are placeholders
  (regenerate with `node scripts/gen_data.mjs public/data`).
- **Design tokens** (colors, type scale, spacing): `src/styles/tokens.css`.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the site
and publishes it to GitHub Pages at:

```
https://jweissmanlab.github.io/melt-website/
```

Enable it once under **Settings → Pages → Source: GitHub Actions**. The
`base: '/melt-website'` in `astro.config.mjs` matches this project-pages URL; if
the repo/URL changes, update `site` and `base` there.

## Notes

- The **Explore** tool is hosted on a private institute IP, so off-campus
  visitors see a fallback (screenshot + "open in new tab") until it has a public
  URL. Swap `exploreUrl` in `src/config/site.ts` when one exists.
- Placeholders to replace before publication: Zenodo DOI, author list, and the
  full citation (all in `src/config/site.ts`).
