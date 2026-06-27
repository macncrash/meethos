# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added — surface regime (fourth scale)
- **Surface regime** — dive past the globe into a SimCity-scale coastal city: instanced buildings
  that rise and a development front that sprawls outward as time advances, zoned downtown /
  residential / industrial, with a vertex-colored terrain tile, roads, and 3D lighting. Seeded with
  a small founding downtown so it's alive on arrival.
- `FocusTarget.diveDistance` (zoom to a globe's surface before dropping into its child regime) and
  `Regime.preferredView` (an elevated 3/4 landing angle), with the scale manager slerping the camera
  offset toward it on descent.

### Added — earth3 functional demo
- **Multi-scale engine** — `Regime` contract + `ScaleManager` with cross-faded, camera-flown
  hand-offs between scales (galaxy → solar → Earth) and zoom-driven dive/ascend.
- **Galaxy regime** — ~24k-star log-spiral with differential rotation; the Sun highlighted as the
  dive target.
- **Solar regime** — Sun + 8 planets on analytic Keplerian orbits (ringed Saturn), with orbit paths
  and a click-to-focus inspector.
- **Earth regime** — procedurally-continented globe (`PlanetField`) carrying an agent-based
  **civilization** (`Civilization`): logistic growth, habitability-limited capacity, colonization,
  trade networks, and eras Founding → Spacefaring.
- **One SimClock** with a `1 hr/s` → `1 Myr/s` rate ladder; analytic motion is scrubbable.
- **HUD** — scale breadcrumb, transport/time controls, focus inspector.
- Borrowed from ethersim: `mulberry32` RNG, color utils, the plugin-seam discipline.

### Changed
- Repurposed the `meethos` directory from the initial Rust scaffold to a TypeScript + Three.js +
  Vite game.
