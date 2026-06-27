# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added — player agency (deflect the comet)
- An inbound comet is now a **decision**: a red **INBOUND** HUD warning shows the nearest threat's
  live distance, and **d** / the **Deflect** button nudges it onto a miss (it turns green and sails
  past) — *if* it's still beyond the point of no return (1.4 AU). Too close and it's "too late".
- Comets slowed to give reaction time; deflected comets switch from homing to free flight.
  `CometField.nearestThreatDist` / `deflectNearest`, surfaced through the ScaleManager.

### Added — cross-scale coupling (comet strikes)
- A **WorldBus** lets scales talk. Press **c** / the ☄ button to launch a comet in the solar regime;
  it homes on Earth (sim-time motion, substepped so it can't tunnel through), draws a sun-anti tail,
  and on contact emits an impact event.
- The Earth regime (always subscribed, even when off-screen) turns an impact into a **crater** +
  expanding ember **shockwave** on the globe and a real **civilization setback** (settlements near
  ground zero wiped, fringe decimated) — aimed at the population heartland so it's felt. A HUD
  **toast** announces the strike from any scale.
- New plumbing: `Regime.stepBackground` (advance cross-scale agents while off-screen),
  `SimClock.realDt` (wall-clock effect timing), `Civilization.impact` / `populationCentroid`.
- **Impact reaches the city scale too** — the surface regime subscribes to impacts: a strike
  flattens a blast zone of buildings to scorched rubble (per-block `damage` that knocks height down
  and tints it dark), drops a ground scar + shock ring, and the city rebuilds from the ashes as
  `damage` decays over time. The coupling now registers across all four scales at once.

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
