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
| `npm run dev` | Start the Vite dev server at http://localhost:5173/solar-maps/ |
| `npm run build` | Type-check (`tsc`) and build to `dist/` |
| `npm run preview` | Serve the production build at http://localhost:4173/solar-maps/ |
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

## Using it

| | Mouse / keyboard | Touch |
| --- | --- | --- |
| Orbit the focused body | drag, or arrow keys | one-finger drag |
| Zoom toward a point | scroll wheel (toward the cursor), or `+` / `-` | pinch |
| Pan | right-drag (or Ctrl/⌘-drag) | two-finger drag |
| Tilt toward the horizon | Shift-drag | — |
| Select a body | click | tap |
| Fly to a body | double-click (body or label), **Enter** on the selection, a search result, or *Fly to* in the info panel | double-tap, or *Fly to* |
| Search (fuzzy, names and aliases like "Luna") | **/** then type, ↑/↓, **Enter** | tap the search box |
| Back to the solar-system view | **Esc** | — |
| Focus the Sun | **Home** | — |

Zoom steps are a fixed fraction of your altitude above the focused body, so one scroll does the same thing from 1,000 AU or from 10 km above a moon. Fly-to follows a zoom-out/travel/zoom-in curve whose duration grows with log distance, targets where the body *will be* on arrival (time keeps running), and stops as soon as you touch the controls.

- **Labels**: overlapping labels are hidden by priority (Sun > planets > dwarf planets > moons), far-away ones fade, and moon labels appear only around the focused planet. Click a label to select, double-click to fly.
- **Info panel** (right, collapsible): type, radius, live distance from the Sun and Earth, orbital period, day length, known moons, and a short description for the selected (or focused) body.
- **Shareable URL**: the address bar always describes the view, e.g. `#body=mars&dist=20000km&view=15,27&t=2026-11-11`. `dist` is from the body's centre (`km`, `AU` or `m`), `view` is azimuth,elevation in degrees, and `t` (UTC date or `YYYY-MM-DDTHH:MMZ`) is omitted while the clock follows real time. Opening such a link restores the view; editing the hash flies there. *Copy link* (top right) copies it.
- **Scale** (top right): *Explorer* keeps every body at least a few pixels across; *True scale* shows real sizes.
- **Time bar** (bottom): play/pause, speed (1×, 1 day/s, 1 month/s, 1 yr/s), ⇄ reverse, *Now*. The date turns amber outside 1800–2050, where planet positions are less accurate.
- **`` ` `` (backtick)**: debug overlay — fps, focus and nearest body with altitude, the camera's float64 world position, and scene-coordinate magnitudes with their float32 precision. Add `?debug` to the URL to start with it open (this also exposes `window.__orrery` for automated tests).

## Textures

2k textures live in `public/textures/2k/` and are committed. To (re)download them:

```bash
node scripts/fetch-textures.mjs
```

They come from [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0). Each file, its source URL and licence are listed in [`public/textures/CREDITS.md`](public/textures/CREDITS.md). Only public-domain (NASA/JPL/USGS) or CC BY textures are allowed; record every new one there. A body whose texture is missing renders in its flat `render.color` from `bodies.json` (Pluto, for now).
