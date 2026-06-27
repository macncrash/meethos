<h1 align="center">meethos · earth3</h1>

<p align="center">
  <i>A living simulation game, from the galaxy to a single civilization — one continuous zoom.</i><br>
  <sub>SimCity / Earth, but the map is the whole cosmos. Codename <b>meethos</b> (ahead of <i>mythos</i>).</sub>
</p>

---

**earth3** is a "third Earth": dive from a spiral galaxy, fall into the solar system, and land on a
procedurally-grown world where a civilization ignites, grows, and spreads across the continents as
you speed up time. It borrows its engine DNA from [ethersim](../../../../ethersim) — the
plugin-seam discipline, deterministic RNG, symplectic-orbit math, and focus-tracking camera — and
adds the thing ethersim's own roadmap pointed at: **multi-scale regimes** spanning ~30 orders of
magnitude, handed across by a scale manager.

## The demo (current vertical slice)

- **Galaxy** — a ~24k-star log-spiral with differential rotation; our Sun is highlighted.
- **Solar System** — the Sun + 8 planets on real-ish **Keplerian orbits** (ringed Saturn included),
  scrubbable at any time-rate.
- **Earth** — a procedurally-continented globe carrying an **agent-based civilization**: settlements
  grow logistically toward a habitability-limited capacity and colonize nearby land, threading trade
  networks across the surface and climbing the eras *Founding → … → Spacefaring*.
- **City** — keep zooming past the globe and you land on a SimCity-scale **surface tile**: a coastal
  city whose downtown rises and whose development front sprawls outward as you speed up time, zoned
  downtown / residential / industrial.
- **Cross-scale coupling** — press **c** (or the ☄ button) to fling a **comet** at Earth from the
  solar system. It homes in and the strike registers at *every* scale at once: a glowing crater on
  the globe, a civilization population crash, and — dive to the city — whole districts flattened to
  rubble that rebuild from the ashes as you run time forward. The scales talk to each other.
- **A decision, not a cutscene** — an inbound comet raises a red **INBOUND** warning with a live
  distance readout. Press **d** (or **Deflect**) while it's still far enough out and you nudge it
  onto a miss — Earth is saved. Wait past the point of no return and it's too late. Speeding time
  shortens your reaction window: real tension, real agency.
- **Defend Earth (the survival game)** — hit **🛡 Defend Earth** and it frames the solar system and
  comets begin streaking in — **normal, fast, and heavy** flavors. **Click a comet** (or press **d**)
  to deflect it onto a miss; your **deflector has a cooldown**, so you can't stop everything. A
  **health bar** (the civilization's integrity) drains with every impact and slowly regenerates.
  The siege **escalates** until it outpaces you — survive as long as you can. Score = **years
  endured**, with a persistent high score; then **game over → Defend again**. (A skilled run lasts a
  couple of minutes; ignore it and you're gone in ~40 seconds.)

One **SimClock** drives everything; the time-rate ladder spans `1 hr/s` → `1 Myr/s`. Scroll to zoom,
drag to orbit, double-click a body to dive in; scroll back out to rise a scale.

## Run

```bash
bun install
bun run dev        # http://localhost:5174  (WebGL; any modern browser)
bun run typecheck  # tsc --noEmit
bun run build      # tsc + vite production build
```

## Architecture

The spine is the **`Regime`** contract (`src/core/regime.ts`) — earth3's analogue of ethersim's
`Archetype` seam. A regime is a self-contained simulation owning one scale band; the
**`ScaleManager`** (`src/world/scaleManager.ts`) only ever talks to that contract, cross-fading and
flying the camera between regimes on dive/ascend. Adding a scale is one file + one chain entry.

```
src/core/      regime contract, SimClock, units/time-rate ladder, rng + color (borrowed from ethersim)
src/regimes/   galaxy · solar (+ Kepler/orbital data) · earth · surface (the city)
src/world/     scale manager, procedural planet field (continents/habitability)
src/sim/       civilization model (agent-based settlements)
src/render/    glow sprites, point material, backdrop stars, cross-fade opacity
src/ui/        HUD (breadcrumb, transport, inspector)
```

See [`docs/architecture.md`](docs/architecture.md) for the design notes and
[`docs/ideas.md`](docs/ideas.md) for where this is headed.

## Roadmap

- **Constructive agency** — seed colonies, terraform, redirect a comet *into* a barren world (Mars)
  to spark life there; multiple simultaneous threats and difficulty tiers.
- **More coupling** — strikes already register at all four scales; next: stellar aging that dims the
  planet, climate that feeds the civilization, history that feeds back upward.
- **True f64 floating-origin** for a single uninterrupted coordinate zoom (ethersim's open item).
- **Deeper civilization** — economies, conflict, tech trees, players; a world is a seed you can share.

## License

Dual-licensed under MIT or Apache-2.0. Engine patterns adapted from ethersim (MIT).
