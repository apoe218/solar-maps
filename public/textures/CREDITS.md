# Texture credits

Only public-domain (NASA/JPL/USGS) or CC BY textures are allowed (CLAUDE.md, hard rule 6).
Download or refresh the 2k set with `node scripts/fetch-textures.mjs`.

## 2k set (`public/textures/2k/`)

All files below: **Solar System Scope** — <https://www.solarsystemscope.com/textures/> —
licensed **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**. Based on NASA imagery and elevation data.
Attribution: "Textures © Solar System Scope, CC BY 4.0". Files are renamed (prefix `2k_` dropped), otherwise unmodified.

| Local file | Original file | Body |
| ---------- | ------------- | ---- |
| `2k/sun.jpg` | [2k_sun.jpg](https://www.solarsystemscope.com/textures/download/2k_sun.jpg) | Sun |
| `2k/mercury.jpg` | [2k_mercury.jpg](https://www.solarsystemscope.com/textures/download/2k_mercury.jpg) | Mercury |
| `2k/venus_atmosphere.jpg` | [2k_venus_atmosphere.jpg](https://www.solarsystemscope.com/textures/download/2k_venus_atmosphere.jpg) | Venus (cloud tops) |
| `2k/earth_daymap.jpg` | [2k_earth_daymap.jpg](https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg) | Earth |
| `2k/moon.jpg` | [2k_moon.jpg](https://www.solarsystemscope.com/textures/download/2k_moon.jpg) | Moon |
| `2k/mars.jpg` | [2k_mars.jpg](https://www.solarsystemscope.com/textures/download/2k_mars.jpg) | Mars |
| `2k/jupiter.jpg` | [2k_jupiter.jpg](https://www.solarsystemscope.com/textures/download/2k_jupiter.jpg) | Jupiter |
| `2k/saturn.jpg` | [2k_saturn.jpg](https://www.solarsystemscope.com/textures/download/2k_saturn.jpg) | Saturn |
| `2k/saturn_ring_alpha.png` | [2k_saturn_ring_alpha.png](https://www.solarsystemscope.com/textures/download/2k_saturn_ring_alpha.png) | Saturn's rings |
| `2k/uranus.jpg` | [2k_uranus.jpg](https://www.solarsystemscope.com/textures/download/2k_uranus.jpg) | Uranus |
| `2k/neptune.jpg` | [2k_neptune.jpg](https://www.solarsystemscope.com/textures/download/2k_neptune.jpg) | Neptune |

## Missing

- **Pluto** — Solar System Scope has no Pluto map; it renders as a flat colour for now. A public-domain candidate is the
  NASA/JHUAPL/SwRI New Horizons global mosaic (NASA Photojournal). Add it as `2k/pluto.jpg`, set
  `render.texture` in `src/data/bodies.json`, and record it here.
