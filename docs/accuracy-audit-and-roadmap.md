# meethos — accuracy audit & real-data engine roadmap

> Status: honest internal assessment + plan. Written for the owner. No varnish.
> TL;DR: meethos today is a beautifully shot **cinematic illusion of a universe**, not a physically-scaled one. The one genuinely sound piece is the analytic Kepler orbit solver. Everything else — scale, galaxy, cosmic web, neighbor stars, Earth — is procedural mood-lighting with decorative numbers. The good news: a real, data-driven, "Google-Earth-for-the-universe" engine is buildable on top of what exists, and several of the highest-leverage correctness fixes cost almost nothing.

---

## 1. Honest scorecard

Grades are 0–10 per axis. **Scale** = is one render unit a fixed physical length? **Geometry** = correct shapes/frames/orientation. **Motion** = physically-grounded dynamics. **Data** = backed by a real catalog/ephemeris.

| Model | Scale | Geometry | Motion | Data | Overall | One-line verdict |
|---|---|---|---|---|---|---|
| **Scale / coordinate strategy** (units, regimes, scaleManager) | 1 | 3 | 4 | 0 | **2.5** | Six regimes, six arbitrary unit systems, no floating origin, all-f32, no sector index — cross-scale "zoom" is a cross-dissolve between separately-scaled scenes. |
| **Solar system** (solar.ts, kepler.ts, planets.ts) | 5 | 6 | 6 | 5 | **6.0** | The strongest piece. Real a/e/period/inclination, genuinely 3D (not flat) — but no argument of perihelion, fake epoch phases, no axial tilt, exaggerated sizes. |
| **Milky Way galaxy** (galaxy.ts) | 2 | 3 | 4 | 0 | **3.0** | Evocative log-spiral starfield; right headline numbers in spirit, but no catalog, no real frame, no bar, and "neighbor stars" are real names on fake coordinates. |
| **Universe / cosmic web** (universe.ts) | 1 | 2 | 1 | 0 | **2.0** | Topology rhymes with reality (nodes+filaments+voids); every position, the scale, and the "Big Bang" (a smoothstep LERP) are faked. |
| **Earth + civ + surface** (earth.ts, planetField.ts, civilization.ts, surface.ts) | 4 | 3 | 3 | 0 | **3.0** | Spin is right but tiltless and **sunless** (the real Sun lives one scale up and fades to 0 on dive); geography is frozen procedural blobs. |
| **Star-system / exoplanets** (starSystem.ts) | 5 | 5 | 3 | 0 | **3.0** | Correct-but-incomplete Kepler solver wrapped around a PRNG; the real star names (TRAPPIST-1, GJ 581) are a façade — dive in and you get random worlds. |

**What's real today:** planetary semi-major axes, eccentricities, periods, and orbital inclinations (real J2000-ish values, hand-entered, 3–4 sig figs); the Kepler equation solver itself (Newton iteration on `M = E − e·sinE`, correct perifocal→ecliptic rotation); a single absolute, scrubbable sim clock.

**What's faked today:** the entire coordinate/scale system; all ~24k galaxy stars; all 3200 cosmic-web galaxies; the cosmic web filaments; the Big Bang dynamics; every "neighbor star" position; every other-star planetary system; Earth's geography, axial tilt, lighting, and Sun; all inspector distance figures (string literals, not derived from coordinates); and the absolute epoch (no planet is at its true 2026 sky position).

---

## 2. Answering the owner's questions directly

### "Is the universe scale correct?"
**No.** There is no shared meters-per-unit anywhere. Each regime invents its own unit purely for f32 comfort: solar uses `1 AU = 1 unit`, the galaxy uses `disk radius = 120 units`, the universe uses `observable universe = 150 units`, Earth uses `globe radius = 1 unit`. So the *same render unit* means ~1.5×10¹¹ m in the solar scene, ~10³ ly in the galaxy, and ~6.4×10⁶ m at Earth. The "30 orders of magnitude" span is real conceptually but is *faked at render time* by per-regime rescaling — it is never represented in one frame. `AU_METERS` and `LIGHT_YEAR_METERS` exist in `units.ts` but are **dead constants** (zero references). Visual radii are also exaggerated and non-proportional (Jupiter is ~11× Earth's true radius but only ~3× its visual radius), so the geometry isn't even to scale *within* a regime.

For reference, the real span we must cover: 1 AU = 149,597,870,700 m; 1 ly ≈ 9.461×10¹⁵ m = 63,241 AU; 1 pc ≈ 3.0857×10¹⁶ m = 3.2616 ly; observable universe diameter ≈ 93 billion ly (28.5 Gpc comoving). That's ~17 orders of magnitude from 1 AU to the cosmic horizon — far past float32 (~7 digits) and at the edge of float64. This is exactly why we need a sector index + floating origin (Section 4), not one giant coordinate.

### "Where are the real galaxies? Where is Andromeda — and won't we merge with it?"
**There are no real galaxies in meethos today.** A grep for `andromeda`, `m31`, `laniakea`, `virgo`, `local group`, `sdss`, `gaia` returns nothing. The 3200 "galaxies" are PRNG output from a single seed (`mulberry32(0xc05)`), and the "Milky Way" is a randomly-chosen node plus jitter.

The real picture we should build:
- **Andromeda (M31): 765 ± 11 kpc center-to-center ≈ 2.5 million ly.** Heliocentric radial velocity ~ −301 km/s; it is **approaching the Milky Way at 109.3 ± 4.4 km/s**. Gaia eDR3 + HST show a nearly *radial* orbit (small transverse velocity).
- **Will we merge?** The classic answer was "yes, first passage in ~3.75–4.5 Gyr, coalescence into the elliptical 'Milkdromeda' by ~6–10 Gyr." But the **2025 revision (Sawala et al., Nature Astronomy, June 2025)**, using Gaia DR3 + HST and the *full* Local Group (M33 + LMC), drops the merger probability within ~5 Gyr to **< 2%**, and to **~50% within 10 Gyr** — "from near-certainty to a coin flip." M33 nudges M31 toward us (raises odds); the LMC pulls the Milky Way aside (lowers odds). If it does happen, most likely ~7–8 Gyr from now. We should present **both** the canonical ~4.5 Gyr figure and the 2025 coin-flip revision — that contrast is itself a great teaching moment. Stars essentially never physically collide; the two central black holes (Sgr A* ~4×10⁶ M☉ and M31's ~1.4×10⁸ M☉) eventually sink and merge.
- **The rest of the local map** we can place from real distances: M33 (Triangulum) ~859 kpc (2.80 Mly); LMC ~49.6 kpc (~163,000 ly); SMC ~62 kpc (~200,000 ly); the Local Group ~3 Mly across, ~40–100 members; the **Virgo Cluster at 16.5 ± 0.1 Mpc (53.8 Mly)**, the gravitational core of our supercluster, which we are falling toward; and the **Laniakea Supercluster** (~160 Mpc / 520 Mly, ~100,000 galaxies, Tully et al. 2014).

### "Are we using ANY real data?"
**No real catalog or ephemeris data anywhere.** The only "real" content is the hand-typed planetary orbital elements in `planets.ts` (real-ish values, but no epoch phase, no argument of perihelion). No star catalog (Hipparcos/Gaia/HYG), no JPL/VSOP ephemeris, no galaxy survey, no Earth terrain, no `TextureLoader` in `src/`. Every star, galaxy, filament, continent, and neighbor system is procedural. This is the single biggest gap and the thing this roadmap is mostly about closing.

### "Where are the labels?"
There essentially aren't any beyond a few inspector cards, and the cards that exist are **decorative string literals**, not derived from the geometry — e.g. Sol "~26,000 ly from core", Moon "384,400 km", galaxy "100,000 ly". Worse, some contradict the code: the panel says Sol is "two thirds out along a minor arm" while the code places it at ~0.46 of the disk radius. A real labeling system (Section 4) renders **camera-facing billboard** labels with **semantic zoom** (text stays a constant pixel size while geometry scales), **declutters by importance + zoom + screen density** (show only the N brightest/nearest in-frustum, fade by magnitude, collision-cull overlaps), and derives every displayed figure from the actual coordinates so numbers can't drift from reality.

### "Is the solar system wrongly a flat disc?"
**Mostly no — this worry is largely unfounded.** The orbits *are* genuinely 3D: real inclinations are applied (Mercury 7.0°, Venus 3.39°, Mars 1.85°, Saturn 2.49°, etc.), lifting each orbit out of the plane via the `inclDeg`/`nodeDeg` rotation in `kepler.ts`. The real geometry problems are subtler:
- **Argument of perihelion (ω) is entirely missing**, so every ellipse is correctly *tilted* but *mis-oriented within its plane* — perihelion points the wrong way for all 8 planets.
- **Epoch phases are arbitrary**, so planets aren't at any real date's positions.
- **No axial tilt anywhere** — Earth's 23.44°, Uranus's 97.77° "on its side", Venus's 177.4° retrograde exist only in prose; meshes spin upright about world-Y with an identical cosmetic `rotation.y += 0.01`.

And the bigger framing fact the owner will care about: **the ecliptic plane is tilted ~60.2° to the galactic plane.** So when we assemble one coherent frame, the whole solar-system disc must sit ~60° off the Milky Way disc — and that ~60° should *emerge automatically* from chaining the real rotation matrices (ecliptic → equatorial via obliquity 23.439°, → galactic via NGP at RA 192.85948°, Dec +27.12825°, node PA 122.932°), not be hardcoded.

### "What does 'sector 0,0,1 = Earth' imply for a coordinate index?"
It implies the canonical move: replace per-regime arbitrary units with **one global coordinate type** = `{ sector: Int32×3 (or BigInt), local: Vector3 (f32) }`, where each integer sector spans a fixed physical size and the small local offset lives inside it. "Sector 0,0,1 = our system" becomes the canonical Sol cell; addressing, streaming, and floating-origin rebasing all key off that integer id. The natural production form of this for the *sky* is **HEALPix NESTED indexing** — a sector is `(order k, npix i)`, with free parent/child math (`parent = npix >> 2`, children = `(npix << 2) + {0,1,2,3}`) — extended for 3D to `(order k, npix i, radial shell r)` where `r` buckets distance in log space. That single `(k, i[, r])` id is the lazy-loading key that indexes HiPS tiles, our own catalog tiles, and octree nodes uniformly, and it's interoperable with Aladin/MOC/the whole Virtual Observatory ecosystem. (The current "regimes" then become **LOD bands over one frame** instead of separately-scaled scenes.)

### "Can we faithfully model back to the Big Bang?"
**Partly — and honesty here is a feature, not a limitation.** The hard truth: in electromagnetic light, **everything bottoms out at the cosmic microwave background — the surface of last scattering at z ≈ 1090, ~370,000–380,000 yr after the Big Bang, T ~3000 K.** That is the literal observational horizon. We can faithfully render real data outward to that CMB shell (Gaia stars, galaxy catalogs, the all-sky CMB sphere). Everything *earlier* — the **Dark Ages** (380 kyr → ~150 Myr), the **first Population III stars** (~100–400 Myr, z ~20, never directly imaged), reionization, nucleosynthesis, inflation, the Big Bang itself — is **modeled/simulated, not observed** (the only earlier probe, the cosmological 21 cm hydrogen signal, is undetected). So the right design splits the timeline visually at the surface of last scattering: real observational data out to the CMB, then a clearly-marked "modeled / illustrative, not observed" rendering style for the Dark Ages → first stars → Big Bang. The current `playBigBang()` (a smoothstep LERP of a pre-baked final web scaled up from 3%) is physically backwards — it scales a finished structure rather than growing one from near-uniformity — and should be reframed as **lookback-time vs redshift** (outward = earlier, terminating at z ≈ 1090) or driven by a real N-body snapshot series if we want true gravitational structure growth.

### "Is this also a learning tool?"
**Yes, and it should lean into it.** The field-standard open viewers prove the model: Gaia Sky (AGPL, MS-LOD over >1 billion objects, 6D motion), Celestia (GPL), Aladin Lite (in-browser HiPS tiling), and AAS WorldWide Telescope (signature narrated "Guided Tours"). meethos can be all of these *plus* a game. The pedagogical wins fall straight out of doing the physics right: a dynamic scale bar with unit switching (AU → ly → pc → kpc → Mpc), reference rings (Oort cloud ~1.5 ly, Proxima 4.25 ly, MW disk ~100k ly, Local Group ~10 Mly, observable universe ~93 Gly), honest deep-time labeling, and the Andromeda merger as an interactive "classic vs 2025 coin-flip" scenario.

---

## 3. The real data layers

Concrete catalogs/ephemerides to adopt, with what to start with. **Bold = start here.**

### Stars
| Source | What it has | Size / scope | Format / access | URL |
|---|---|---|---|---|
| **HYG Database v4.2** | Combined Hipparcos+Yale+Gliese. Per star: RA/Dec (J2000), dist (pc), mag, absmag, **B-V color (`ci`)**, spectral type, proper motion, RV, and **precomputed x/y/z in parsecs** (equatorial). Drop-in. | 119,614 stars; one gzip CSV, tens of MB | CSV/gzip, **CC BY-SA 4.0** | https://codeberg.org/astronexus/hyg |
| Hipparcos main (VizieR I/239) | High-precision astrometry, parallax, PM, photometry, spectral type. | 118,218 stars, V≲12.4 | VizieR FITS/CSV | https://cdsarc.cds.unistra.fr/viz-bin/cat/I/239 |
| Tycho-2 (VizieR I/259) | Positions, PM, 2-color photometry (no parallax). | 2,539,913 stars | VizieR ASCII/FITS | https://cdsarc.cds.unistra.fr/viz-bin/cat/I/259 |
| Gaia DR3 | RA/Dec, parallax, PM, G mag, BP-RP color; `source_id` encodes HEALPix L12. | **1.8 billion** sources; full >2 TB — **must subset/tile** | ADQL/TAP → CSV; or per-HEALPix-L8 files (3,386 of them) | https://www.cosmos.esa.int/web/gaia/dr3 |
| Nearest-stars list (RECONS/Wikipedia) | ~120 systems within 25 ly with real distances/RA/Dec/PM/spectral types. | Proxima 4.246 ly, Sirius 8.60 ly, etc. | Web tables | https://en.wikipedia.org/wiki/List_of_nearest_stars |

**Start with HYG v4.2.** Its x/y/z are already equatorial parsecs — load straight into a `Float32Array`; 120k points renders trivially. Hand-place the ~120 nearest systems from the RECONS list for the local-neighborhood scene (faint-star parallaxes are noisy). Distances elsewhere: `d_pc = 1000 / parallax_mas`, guarded by `parallax > 0` and `parallax_over_error > 5` (else Bailer-Jones geometric distance). Color from B-V via Ballesteros (2012): `T ≈ 4600·(1/(0.92·BV+1.7) + 1/(0.92·BV+0.62))`. Reach for Gaia tiles only on deep zoom.

### Planets (solar system)
| Source | What it has | Why | URL |
|---|---|---|---|
| **JPL "Keplerian Elements for Approximate Positions of the Major Planets" (Standish)** | 6 elements + 6 per-century rates per planet, J2000 ecliptic. Table 1 (1800–2050), Table 2 (3000 BC–3000 AD + b,c,s,f terms). Full step-by-step algorithm. | The no-server browser choice. ~8×12 numbers fit in a few KB of JS. Accuracy: few arcsec to tens of arcsec — fine for viz. | https://ssd.jpl.nasa.gov/planets/approx_pos.html |
| NASA Planetary Fact Sheet | Axial tilt (obliquity), sidereal rotation period (signed for retrograde), true radii. | Drives spin/tilt: Earth 23.44°/23.93h, Venus 177.4°/−5832.5h, Uranus 97.77°/−17.24h, Jupiter 3.13°/9.925h. | https://nssdc.gsfc.nasa.gov/planetary/factsheet/ |
| VSOP87 (VizieR VI/81) | Trig series, sub-arcsec over millennia; variants A (rect J2000) / D (spherical of-date) most convenient. | Upgrade path when Standish isn't precise enough. | https://en.wikipedia.org/wiki/VSOP_model |
| Astronomy Engine (npm, MIT) | Browser-ready, VSOP87+NOVAS truncated to ±1 arcmin, includes galactic transforms. | Drop-in client-side library; tens of KB. | https://github.com/cosinekitty/astronomy |
| JPL DE440/DE441 + Horizons API | Gold-standard numerically-integrated ephemeris, <1 mas. | **Build-time ground truth only** (.bsp is 114 MB–3 GB binary; CORS blocks live fetch). | https://ssd.jpl.nasa.gov/doc/de440_de441.html |

**Start by upgrading `planets.ts` to the full Standish table** (add ω/argument of perihelion + real J2000 mean longitudes + per-century rates) and adding `obliquityDeg` + `rotationHours`. This is tiny data and the single biggest realism jump for the orrery.

### Local Group + galaxies
| Source | What it has | Scope | URL |
|---|---|---|---|
| **2MRS (2MASS Redshift Survey)** | All-sky 3D galaxy map: RA/Dec, Ks mag, redshift (cz → Hubble-flow distance). Best "where are the nearby galaxies" whole-sky coverage. | ~44,000 galaxies to ~400 Mly | http://tdc-www.harvard.edu/2mrs/2mrs_readme.html |
| Tully NBG / EDD / Cosmicflows | Curated nearby galaxies with **redshift-independent distances** (Cepheid/TRGB/Tully-Fisher) — no finger-of-God smearing; defines Laniakea flow. | ~2,367 with Vsys<3000 km/s; Cosmicflows extends further | https://iopscience.iop.org/article/10.1088/0004-6256/138/2/323 |
| GLADE+ | 22.5M galaxies + 750k quasars with precomputed luminosity distances. | Max-density option, stream in tiles | https://glade.elte.hu/ |
| NED | Per-object authority/lookup (resolve M31, M33, Virgo members to precise positions). | Hundreds of millions of objects | https://ned.ipac.caltech.edu/ |

**Start by hand-placing the ~40 named Local Group members** (M31 765 kpc, M33 859 kpc, LMC 49.6 kpc, SMC 62 kpc, Virgo 16.5 Mpc) from literature/NED with redshift-independent distances, then layer **2MRS** for the all-sky nearby field, then Tully/Cosmicflows for accurate supercluster structure.

### Exoplanets
| Source | What it has | URL |
|---|---|---|
| **NASA Exoplanet Archive (PS / PSCompPars, TAP)** | Real systems keyed by hostname: `pl_orbsmax` (a), `pl_orbeccen` (e), `pl_orbincl` (i), `pl_orbper`, `pl_rade/pl_radj`, host `st_teff/st_rad/st_mass/sy_dist`. | https://exoplanetarchive.ipac.caltech.edu/ |

**Bundle a trimmed JSON snapshot keyed by hostname.** Then diving into "TRAPPIST-1" shows its actual 7 planets in the 8:5:3:2 resonant chain; "Kepler-90" shows 8 — instead of the current index-hash PRNG. Period from real `st_mass` (`P = √(a³/(M★/M☉))`), not the hardcoded 1 M☉.

---

## 4. Engine architecture

The target: **one physical coordinate system, streamed sector-by-sector like Google Earth, with the current "regimes" demoted to LOD bands over that single frame.** This belongs in the **meethos library** (`packages/`); the Earth(3) game consumes it.

### 4.1 One coordinate system + floating origin + log depth
WebGL shaders have **no float64**; float32 has a 23-bit mantissa (~7 digits). The ULP (grid spacing) grows with magnitude: **~16 km at 1 AU, ~1.07 million km at 1 ly, ~2.15 million km at 1 pc, ~2.2 billion km at 1 kpc.** Store an absolute interstellar position in float32 and vertices visibly jitter by millions of km. Three combined fixes (all standard for space scenes):

1. **Floating origin** — keep the camera at `(0,0,0)` and translate the world so the focus sits near the origin every frame. This replaces the current camera-follow hack (`scaleManager.ts:291-300`), which only re-frames the focus without ever re-centering geometry.
2. **Camera-relative (RTC) upload** — do model-view math in **float64 on the CPU**, subtract the active sector/camera center, upload only the small float32 offset to the GPU. Never upload absolute interstellar coords.
3. **`logarithmicDepthBuffer = true`** — already enabled in `main.ts`; it kills z-fighting across the enormous depth range (a single scene can span micrometers to 10⁸ ly).

Plus: **nested coordinate sectors/shells**, each with a local origin, so any one float32 buffer spans a limited dynamic range. Pick **one** global unit (recommend storing parsecs internally for the stellar+ frames, AU for in-system, and a documented Mpc bucket for cosmology — each frame a child group so a single buffer never mixes scales). Make `AU_METERS` / `LIGHT_YEAR_METERS` load-bearing.

### 4.2 Sector-tile scheme — "Google Earth for the universe"
Two independent LOD systems, because meethos has both a 2D sky backdrop and true 3D positions:

- **Background sky (2D, celestial sphere): adopt HiPS directly.** It's the IVOA standard, Aladin Lite (MIT JS) already implements the lazy tile loader, and 1000+ surveys (incl. Gaia DR3, DSS, 2MASS) are pre-tiled and CORS-served. Tile path = `Norder<k>/Dir<d>/Npix<i>.png` with `Dir = 10000·floor(Npix/10000)`. Start at order 3 + an "Allsky" preview, descend orders as the camera zooms. HEALPix is equal-area: `N_pix = 12·Nside²`, `Nside = 2^Norder`; e.g. Nside=1024 → 12.6M pixels at ~3.4 arcmin.
- **Star cloud (true 3D points): copy Gaia Sky's octree.** Build an octree over 3D positions; cap each node (~10⁵ particles) and store nodes as separate binary blobs behind one metadata index. **Load/evict by solid angle** — load a node only when its projected angular size exceeds θ (~60–80°), with **LRU eviction against a `maxstars` budget** so VRAM stays bounded. Sort particles within a node by brightness so partial loads show the brightest stars first (magnitude-prioritized streaming).

The unifying key is the **sector id** `(order k, npix i [, radial shell r])` from Section 2 — HEALPix NESTED, so parent/child is bit-shift math. This single id streams HiPS tiles, our catalog tiles, and octree nodes alike. The existing `starSystem` "rebuild from seed on dive" pattern is exactly the right generalization target: every cell becomes lazily built/streamed and disposed by proximity to the camera.

### 4.3 Correct coordinate frames & orientation
Build everything as a chain of Three.js parent groups so the real angles emerge automatically rather than being hardcoded:

```
orbital plane (per-planet: a,e,i,Ω,ω)
  → J2000 ecliptic        (Standish/VSOP rotations)
  → J2000 equatorial/ICRF (rotate +23.43929° about X — obliquity ε₀)
  → galactic frame        (NGP RA 192.85948°, Dec +27.12825°, node PA 122.932°)
  → galactocentric        (translate Sun to (R₀, 0, z_sun), R₀ ≈ 8.2 kpc, z_sun ≈ +20 pc)
```

The ~60.2° ecliptic-vs-galactic tilt then **falls out of the last rotation** — don't hardcode 60°. Standard J2000 equatorial→galactic matrix (multiply a unit vector):

```
R = [ -0.0548755604  -0.8734370902  -0.4838350155
      +0.4941094279  -0.4448296300  +0.7469822445
      -0.8676661490  -0.1980763734  +0.4559837762 ]
```

For the galaxy itself: a single right-handed galactocentric frame, Sun at `(R₀, 0, z_sun)`, +Z = North Galactic Pole, +Y = direction of rotation. Real structure: stellar disk exponential (scale length ~2.5–3 kpc) × sech² in z (thin-disk scale height ~0.3 kpc, thick ~0.9 kpc), visible radius ~15 kpc. Spiral arms as log spirals with **Reid et al. 2019 (BeSSeL) pitch angles** (Local/Orion 11.4°, Sagittarius 17°, Perseus 10.3°, Scutum-Centaurus 14.1°), Sun on the inner edge of the **Local/Orion Arm** between Sagittarius (inner) and Perseus (outer). Add the **central bar** (semimajor ~5 kpc, oriented ~27° to the Sun–GC line, near end at +longitude) — currently completely absent. Rotation: flat curve Θ₀ ≈ 230 km/s (Reid 2019: Θ₀ = 236±7), Ω_sun = 30.32 km/s/kpc, galactic year ~225–250 Myr; **fix the current `ω∝1/r`** which blows up at the core (no inner solid-body rise). Solar motion: peculiar velocity (U,V,W) = (11.1, 12.24, 7.25) km/s (Schönrich+ 2010), apex toward Hercules (~RA 18h28m, Dec +30°), plus a vertical bob of ~50–80 pc amplitude over ~60–80 Myr.

### 4.4 Labeling / decluttering
- **Billboard quads** (cancel view rotation so the label faces the camera).
- **Semantic zoom**: labels stay a constant pixel size while geometry scales.
- **Declutter by importance + zoom + screen density**: show only the N brightest/nearest in-frustum, fade by magnitude, collision-cull overlaps.
- **Derive every figure from the live coordinates** (distance-from-core, orbit radius, Moon distance) so the inspector can never drift from what's rendered — the opposite of today's string literals.

### 4.5 Units & packaging
- Internal: float64 on CPU, parsecs for stellar+ frames, AU in-system, Mpc for cosmology — each a child frame; convert to ly (×3.2616) only for UI.
- Dynamic scale bar with unit switching AU → ly → pc → kpc → Mpc; reference rings (Oort, Proxima, MW disk, Local Group, observable universe).

```
packages/
  meethos-core/        coordinate type {sector,local}, f64 math, floating-origin rebasing,
                       frame chain (ecliptic↔equatorial↔galactic↔galactocentric), units
  meethos-catalogs/    loaders + tilers: HYG, Gaia (HEALPix/ADQL), 2MRS, Local Group,
                       Standish elements, NASA Exoplanet Archive snapshot
  meethos-stream/      HEALPix/HiPS tile fetcher + octree LOD (solid-angle load, LRU evict)
  meethos-render/      Three.js: floating-origin renderer, log depth, billboard labels,
                       LOD bands (replaces "regimes" cross-fade), scale bar
apps/
  earth3/              the game: civilization, surface city, deep-time, merger scenarios —
                       consumes the meethos library, owns none of the physics
```

---

## 5. Correctness fixes that are cheap NOW

High-leverage, tiny-data upgrades that stop meethos being *wrong* before the big engine lands. None of these require streaming, octrees, or float64 plumbing.

1. **Add argument of perihelion (ω) to `PlanetData` + apply it in `kepler.ts`** before inclination (rotate perifocal x/y by ω in-plane). This is the single biggest geometric fix — currently every orbit is mis-oriented within its plane. ~10 lines + 8 numbers.
2. **Replace arbitrary `phase` with real J2000 mean anomalies** (from Standish: `M = L − ϖ`). Now the time slider is physically meaningful and planets sit at real positions. ~8 numbers.
3. **Add `obliquityDeg` + `rotationHours`; tilt each mesh and spin at the true sidereal rate** (signed for retrograde). Earth 23.44°/23.93h, Uranus 97.77°/−17.24h, Venus 177.4°/−5832.5h. Tilt Saturn's ring by the planet's obliquity (26.73°) instead of the cosmetic `π/2.3`. Kills the identical fake `rotation.y += 0.01`.
4. **Earth regime: bring back the Sun + tilt + lighting.** Stop fading the solar regime to 0 on dive; compute the Sun direction from the existing `planetPosition()`, switch the globe from `MeshBasicMaterial` to lit `MeshStandard`, wrap it in a 23.44° tilt group. Suddenly the spin has a moving day/night terminator and tilt-driven seasons — the exact "spin + orbit + sun" experience the owner loves, currently invisible. Moderate effort, huge payoff.
5. **Real nearby-star positions.** Replace the 14 random-offset neighbors (`galaxy.ts:158-160`) with real RA/Dec/parallax → galactic XYZ from the RECONS nearest-stars list (or a 25-pc HYG slice). Fixes direction *and* distance in one step; set colors from real spectral types (Sirius A ~9940K, Barnard ~3130K, Proxima ~3040K). ~120 rows.
6. **Real Andromeda + Local Group.** Hand-place M31 (765 kpc, real direction, approaching at 109 km/s), M33 (859 kpc), LMC (49.6 kpc), SMC (62 kpc), Virgo (16.5 Mpc) — replacing the random `homePos` node. Add the merger fact card with **both** the classic ~4.5 Gyr and the 2025 ~50%-within-10-Gyr figures. ~40 rows.
7. **Correct galactic orientation.** Put Sgr A* at the origin, Sun on a defined axis toward l=0, tilt the disk into real galactic coordinates, add a bar and reduce to ~2 dominant arms with pitch ~11–14°. Reconcile the copy ("two thirds out" vs code's 0.46) and **derive inspector figures from the coordinates**.
8. **Fix the inner rotation curve.** Replace `ω = K/r` with `v(r)` from a flat-curve model (solid-body rise then flat ~233 km/s), `ω(r) = v(r)/r`. No more infinite core spin.
9. **Basic labels.** Billboard sprites with semantic zoom for the Sun, planets, named neighbors, M31 — even a minimal version makes the tool legible and stops the decorative-string-literal problem.
10. **Exoplanet truth for showcase systems.** Bundle a small NASA Exoplanet Archive JSON for TRAPPIST-1, Kepler-90, GJ 581, Proxima; route named dives to real elements, PRNG only as a labeled "uncharted" fallback.

Items 1–3 and 5–6 are essentially data entry against `ssd.jpl.nasa.gov/planets/approx_pos.html`, the NASA Fact Sheet, the RECONS list, and the Local Group literature — a few hours of work that moves the solar-system score from 6→8 and the galaxy/cosmos scores off the floor.

---

## 6. Phased roadmap

What's **faithfully simulable** vs **decorative** is flagged per phase. Be honest in the UI about which is which.

### Phase 0 — "Accurate small" (days, tiny data)
Section 5 items 1–10. No streaming, no new coordinate system. Outcome: the solar system is a true J2000 orrery with tilt/spin; Earth has Sun + tilt + terminator; nearby stars, Andromeda, and the Local Group are real; the galaxy has a bar, real arms, and a sane rotation curve; basic labels exist; showcase exoplanet systems are real. **Faithful:** planetary positions/orbits, nearby-star geometry, Local Group distances, Andromeda approach. **Decorative (label it):** the 24k procedural disk stars, the cosmic web, the Big Bang animation.

### Phase 1 — "One coordinate system" (the floating-origin foundation)
Build `meethos-core`: the `{sector, local}` type, f64 CPU math, floating-origin rebasing, the frame chain (ecliptic↔equatorial↔galactic↔galactocentric with the real matrices), units, dynamic scale bar. Demote the six regimes to **LOD bands over one frame** (cross-fade as a cosmetic LOD blend, not a unit change). **Faithful:** continuous physical zoom from AU to kpc with no jitter; the ~60° ecliptic/galactic tilt emerging from real rotations. This is the structural unlock for everything after.

### Phase 2 — "Streaming catalogs" (Google Earth for the universe)
Build `meethos-catalogs` + `meethos-stream`: load **HYG v4.2** (120k stars, drop-in), then **Gaia DR3** by HEALPix tile/ADQL on deep zoom; HiPS background sky via the Aladin pattern; the Gaia-Sky-style octree with solid-angle load + LRU eviction; **2MRS** + Tully/Cosmicflows for the real galaxy field; the full labeling/decluttering system with semantic zoom. **Faithful:** real stars where you point, real galaxy large-scale structure, bounded-memory streaming. **Hard parts:** tile generation/CDN for our own catalog tiles; Gaia subsetting; getting LRU/solid-angle thresholds tuned so it feels like Google Earth, not a stutter.

### Phase 3 — "Deep time & the merger" (honest cosmology)
Reframe the timeline as **lookback time vs redshift**, terminating real data at the **CMB surface of last scattering (z ≈ 1090, ~380 kyr)** rendered as an all-sky sphere. Mark the **Dark Ages → first stars → Big Bang** in an explicitly "modeled, not observed" rendering style. Replace the smoothstep "Big Bang" with either an honest redshift map or a **real N-body snapshot series** (Millennium / IllustrisTNG public data) for gravity-driven structure growth. Build the **Andromeda merger** as an interactive scenario: present the classic ~3.75–4.5 Gyr first passage / ~6–10 Gyr coalescence **and** the 2025 Sawala et al. <2%-in-5-Gyr / ~50%-in-10-Gyr revision, with M33/LMC perturbations — a genuine teaching set-piece. **Faithful:** the CMB shell, real galaxy positions, the merger kinematics (M31 approaching at 109 km/s on a near-radial orbit). **Unknowable / decorative (say so):** anything before the CMB in light; the exact merger outcome (it's now a coin flip); Pop III stars (simulation only). The Milky Way's own rotation/structure beyond the BeSSeL-mapped arms is model-extrapolated, not observed star-by-star.

### Phase 4 — "Game on top" (Half-Life-tier Earth(3))
With real geography (ETOPO1/GEBCO + Natural Earth coastlines) and plate tectonics (Euler-pole rotations so continents drift over Myr, cities riding their host plate), the civilization sim (already up to 720 settlements) becomes plate-coupled and grounded in a real Earth. The engine's accuracy is now the substrate the game stands on rather than a backdrop it contradicts. **Faithful:** real terrain, real deep-time drift, real sky from any point. **Decorative-by-design:** the "third Earth" procedural variant, gameplay-driven civilization dynamics — fine, as long as the *universe around it* is real.

---

### Honest closing note
The two genuinely hard, partly-unknowable things are: (1) **precision across ~17 orders of magnitude** — solvable with floating origin + f64-on-CPU + log depth + nested sectors, but it must be designed in from Phase 1, not retrofitted; and (2) **everything before the CMB** — not observable in light, full stop; the most scientifically honest and pedagogically powerful move is to render real data out to z≈1090 and visibly mark the rest as modeled. The Andromeda merger is no longer "certain" — leading with the 2025 coin-flip revision over the old textbook certainty is exactly the kind of truth-telling that makes meethos a serious tool and not just a pretty one.
