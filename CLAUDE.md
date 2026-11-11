# Orrery — a "Google Maps" for the Solar System

A self-hosted, static, 3D site that lets anyone pan, zoom, search for, and fly to any body in the solar system, with real orbital positions for any date.

## Goals
- Smooth navigation from the whole solar system down to a single moon, with no jitter or flicker.
- Planet positions that are physically correct for any date (approximately 1800–2050 at full accuracy).
- Feels like a map: search box, click to select, shareable URLs, info panel.
- 100% static. Deploys to GitHub Pages. No backend, no API keys, no paid services.

## Tech stack (do not change without asking)
- **Vite + TypeScript (strict)**, vanilla Three.js (no React).
- **Three.js** for rendering; `CSS2DRenderer` for labels.
- **Vitest** for unit tests.
- Plain HTML/CSS for UI. No UI framework.
- Deploy: GitHub Actions → GitHub Pages (`vite build`, `base` set to the repo name).

## Folder layout
```
src/
  main.ts              entry; wires everything together
  scene/               renderer, camera, lights, floating origin
  bodies/              Body class, planet/moon/ring/belt builders
  ephemeris/           orbital math (pure functions, no Three.js imports)
  data/                bodies.json (physical data, orbital elements, texture paths)
  nav/                 camera controller, fly-to, selection, URL state
  ui/                  search, info panel, time controls, scale toggle
public/textures/       planet textures (2k default, 8k optional)
tests/                 vitest specs
```

## Hard rules
1. **Units:** ephemeris works in AU and days since J2000 (TDB ≈ UTC is fine). The scene converts to scene units in one place only (`scene/units.ts`).
2. **Precision:** never put large absolute coordinates on the GPU. Use a **floating origin**: the camera stays near (0,0,0) and the world is shifted relative to it in double precision on the CPU. Use `logarithmicDepthBuffer: true`.
3. **`ephemeris/` must be pure** and fully unit tested. No rendering imports.
4. **Data, not code:** adding a body = adding an entry to `data/bodies.json`, not writing new classes.
5. **Performance budget:** 60 fps on a mid-range laptop and a recent phone. Use instancing for the asteroid belt. Lazy-load high-res textures.
6. **Licensing:** only public-domain (NASA/JPL/USGS) or CC-BY textures. Record source + license in `public/textures/CREDITS.md`.
7. Keep each commit a working build. Run `npm run build && npm test` before saying a task is done.

## Reference sources
- Planet elements: JPL "Approximate Positions of the Planets" (E.M. Standish), Table 1 (1800–2050).
- Physical data (radius, axial tilt, rotation period): NASA Planetary Fact Sheets.
- Moon elements: JPL Solar System Dynamics mean orbital elements (simplified Keplerian is fine).
- Ground truth for tests: JPL Horizons heliocentric vectors (the user supplies these as fixtures).

## Scale modes
- **True scale:** real sizes and distances (planets are tiny dots, and that's expected).
- **Explorer (default):** real distances, bodies enlarged with a minimum on-screen pixel size so they stay clickable.

## Status
Update this section at the end of each phase: what's done, what's next, known issues.
- [x] Phase 0 — scaffold + deploy
  - Done: Vite + strict TS + Three.js + Vitest scaffold; folder layout with placeholders; minimal scene (black bg, lit yellow sphere, OrbitControls, log depth buffer); `scene/units.ts` stub; `ephemeris/` with `daysSinceJ2000` + tests; GitHub Actions deploy workflow (Vite `base` = `/solar-maps/`); README. `npm run build && npm test` pass.
  - Next (Phase 1): real ephemeris (Standish Table 1) with Horizons fixtures, bodies.json + data-driven Body, floating origin, camera controller.
  - Known issues / manual steps: enable Settings → Pages → Source: GitHub Actions on the repo before the first deploy; the workflow is untested until pushed to `main`; bundle is ~555 kB (Three.js) and triggers Vite's chunk-size warning.
