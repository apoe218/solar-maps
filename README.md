# Orrery — a "Google Maps" for the Solar System

A self-hosted, static, 3D site for panning, zooming and flying to any body in the solar system, with real orbital positions for any date. See [CLAUDE.md](CLAUDE.md) for goals, architecture and hard rules.

Stack: Vite + TypeScript (strict), vanilla Three.js, Vitest. No backend, no API keys.

## Local setup

Requires Node.js 20+ (22 recommended).

```bash
npm install
npm run dev       # dev server with hot reload
```

| Script | What it does |
| ------ | ------------ |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc`) and build to `dist/` |
| `npm run preview` | Serve the production build locally (at `/solar-maps/`) |
| `npm test` | Run the Vitest unit tests once |

## Ephemeris ground truth

`tests/fixtures/horizons.json` holds JPL Horizons heliocentric ecliptic-J2000 vectors that the ephemeris is tested against. Regenerate or extend it (edit `TARGETS`/`EPOCHS` in the script) with:

```bash
node scripts/fetch-horizons.mjs
```

Behind an HTTPS proxy on Node 22, prefix it with `NODE_USE_ENV_PROXY=1`.

## Deploy (GitHub Pages)

Deployment is automatic via `.github/workflows/deploy.yml`: every push to `main` runs tests, builds, and publishes `dist/` to GitHub Pages.

One-time setup: in the GitHub repo go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.

The site is served at `https://<user>.github.io/solar-maps/`. Vite's `base` is set to `/solar-maps/` for production builds in `vite.config.ts`; if you rename the repo, update `REPO_NAME` there (or set the `VITE_BASE` env var in the workflow).

## Textures

Only public-domain (NASA/JPL/USGS) or CC-BY textures. Record every source and license in `public/textures/CREDITS.md`.
