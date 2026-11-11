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
  - Known issues / manual steps: enable Settings → Pages → Source: GitHub Actions on the repo before the first deploy; the workflow is untested until pushed to `main`; bundle is ~555 kB (Three.js) and triggers Vite's chunk-size warning.
- [x] Phase 1a — ephemeris
  - Done: `src/ephemeris/` (pure, no Three.js): date helpers (Date ↔ JD ↔ centuries since J2000), Newton Kepler solver (tol 1e-8 rad), Standish Table 1 positions for Mercury–Neptune + Pluto, generic moon Keplerian solver (ecliptic or pole-defined reference plane, node/apsis precession), `heliocentricPosition()` that walks the parent chain. All elements + NASA fact-sheet physical data in `src/data/bodies.json` (Sun, 8 planets, Pluto, Moon), validated by `src/data/bodies.ts`. Tests: Kepler (e = 0/0.2/0.9), time, Earth ≈ 1 AU, Moon distance, purity guard, and Horizons comparison (`tests/fixtures/horizons.json`, regenerate with `scripts/fetch-horizons.mjs`).
  - Known accuracy (measured vs Horizons, 1800–2050): inner planets < 0.001 AU; Jupiter ≤ 0.008 AU; Uranus/Neptune/Pluto ≤ 0.01 AU; **Saturn 0.012–0.029 AU** (Table 1's stated ~600″ limit), so its fixture entry uses `toleranceAu: 0.03`. "Earth" is the Earth–Moon barycentre (≤ 4,700 km off).
- [x] Phase 1b — render the solar system
  - Done: `bodies/Body` built purely from bodies.json (sphere, IAU pole + prime meridian W = W0 + Ẇd, so Earth's day/night and the Moon's near side are right); Sun is emissive + point light (no falloff); `OrbitLine` samples 360 points over one period from the ephemeris, re-sampling as the body moves so the line stays through it; Saturn's rings (textured, in the equatorial plane); 2k Solar System Scope textures (CC BY 4.0, `scripts/fetch-textures.mjs`, `public/textures/CREDITS.md`) with flat-colour fallback; Explorer / True scale toggle (Explorer = real radius with a min on-screen diameter, 6 px, Sun 12 px); `ui/clock` SimClock (play/pause, 1×, day/s, month/s, yr/s, reverse, now, amber outside 1800–2050) + time bar; temporary Focus dropdown that follows a body. `scene/units.ts`: 1 unit = 10⁶ km, ecliptic → Y-up. bodies.json gained `rotation` (IAU WGCCRE) and `render`. Tests cover units, scale modes, clock, IAU orientation vs fact sheets, sub-solar point, Moon tidal lock, and the built scene graph.
  - Fixed along the way: fact-sheet values for Venus tilt (177.36), Pluto tilt (119.51) and radius (1188) — now verified against the NASA pages; `vite preview` base path (base is now `/solar-maps/` in dev, build and preview).
  - Known issues: no floating origin yet — orbit-line vertices are float32 at up to ~7,000 units (≈500–800 km quantisation at Neptune/Pluto distances) and 360-segment polygons visibly miss the body when zoomed right in on outer planets; Explorer-enlarged bodies can swallow their moons when zoomed out; the Moon's pole is fixed at its J2000 value; Pluto has no texture; no labels, picking, search, URL state, or ring shadows; textures are ~5 MB and all load eagerly at 2k.
  - Next: floating origin (hard rule 2), camera controller + fly-to, labels (`CSS2DRenderer`), click-to-select, search, info panel, URL state; other moons as data.
- [x] Phase 1c — precision & navigation
  - Done: floating origin — `Body.world` is float64 km (CPU only); `SolarSystem.render` places every object at world − camera, so the Three camera never leaves (0,0,0). 1 scene unit = 1 km (`scene/units.ts`, the only conversion point). Log depth buffer with near 1 m / far 10¹¹ km. `nav/CameraController` replaces OrbitControls: float64 state around a focus body, altitude-proportional zoom (wheel + pinch), drag speed that makes the ground follow the cursor, tilt toward the horizon (clamped to the horizon angle), altitude floor max(100 m, 2.5e-4 × radius). Orbit lines are stored relative to their body (precise up close, always through the body) and drawn from the osculating ellipse each time step (`ephemeris/ellipse.ts`; 0.36 ms/frame CPU at 1 yr/s). Explorer: sphere ≥ 6 px real size, enlarged between 1–6 px, flat dot when sub-pixel (True scale: 2 px dot), with 0.8/1.2 px hysteresis. Debug overlay on backtick. Phobos added as data (JPL SSD + IAU) and checked vs Horizons; Moon/Phobos relative entries in the fixture. Tests simulate float32 GPU rounding (10 km above Phobos: < 1 cm, ≪ 0.01 px).
  - Flight test (headless Chromium, SwiftShader): 10 km above Phobos and 10 km / 1.6 km above Earth with time at 1×, horizon steady to median 0.06 px, worst σ 0.25 px over 60 frames (residual = facets/texture rotating through the limb); zoom-out from 10 km to 1,000 AU never lost Phobos and switched sphere → dot exactly once; no console errors.
  - Known issues: below ~1.6 km over Earth (generally < 2.5e-4 R) a single-mesh sphere would jitter, hence the floor — going lower needs tiled spheres with local origins (terrain LOD); 128×64 sphere facets are visible as straight chords on Earth's horizon at low altitude; 2k textures are very blurry close up; Phobos is an untextured sphere (real shape is 26×23×18 km); the camera only avoids the focused body (zooming out from Phobos can pass through Mars); simplified moon elements: Moon ≤ ~11,000 km, Phobos ≤ ~550 km vs Horizons.
  - Next: tiled sphere LOD + higher-res textures for close approach; labels (`CSS2DRenderer`), click-to-select, search + fly-to, info panel, URL state; more moons as data.
