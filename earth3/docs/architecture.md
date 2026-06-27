# Architecture

earth3 is a multi-scale simulation game. The design goal is **one continuous experience** from
galactic scale down to a single civilization, without the f32 precision and performance problems
that normally make that impossible.

## The core idea: regime-local coordinates + handed-off camera

A single world spanning galaxy → surface is ~30 orders of magnitude. Rather than force one
coordinate system to be precise across all of it (the true-floating-origin problem, still open in
ethersim), each **Regime** renders in its *own* local units where f32 is exact:

| Regime | Local unit | Span |
|--------|-----------|------|
| Galaxy | ~light-year-ish | disk radius 120 |
| Solar  | 1 AU = 1 unit   | ~60 units (Neptune at 30) |
| Earth  | globe radius 1  | ~3 units |

The **ScaleManager** owns the chain `[galaxy, solar, earth]` and the camera. Crossing a boundary —
by zooming past a body's dive threshold, double-clicking it, or using the breadcrumb — triggers a
cross-faded transition: the outgoing regime fades to 0, the incoming fades in, and the camera flies
to frame the new regime's focus. Because only one regime is "live" at a time, precision and cost
stay bounded. (A future **floating-origin** pass can collapse the hand-offs into one literal zoom.)

## The Regime contract (`src/core/regime.ts`)

The analogue of ethersim's `Archetype` seam. The manager never inspects a regime's physics:

```ts
interface Regime {
  id; label; object3d;            // scene-graph root
  step(clock);                    // advance; clock.seconds absolute, clock.dt per-frame
  focusTargets(); defaultFocus(); // selectable bodies; dive descends into a target's childRegime
  overviewDistance();             // framing distance
  onEnter/onExit/setOpacity/dispose;
}
```

Adding a scale = one file implementing `Regime` + one entry in the ScaleManager chain.

## Time

One **SimClock** (`src/core/clock.ts`) holds absolute simulated seconds and a per-frame `dt`. The
rate ladder (`src/core/units.ts`) spans `1 hr/s` → `1 Myr/s`. Analytic motion (Kepler orbits,
planet/galaxy rotation) reads absolute time, so it's exact and scrubbable at any rate. Incremental
state (civilization growth) integrates `dt`, sub-stepped and capped so cosmic rates stay cheap.

## Borrowed from ethersim

- **Deterministic RNG** (`mulberry32`) — a world is a seed.
- **Symplectic orbit thinking** — the orrery uses analytic Kepler (exact ellipses) rather than
  n-body integration, the right call for a stable, scrubbable orrery; n-body remains a future mode.
- **SoA render buffers** — civilization streams flat typed arrays straight into Three.js.
- **Focus-tracking camera** — the camera translates with the body it's locked onto.

## Where it grows

- `src/regimes/` — a `surface` regime below `earth`; a `localGroup` regime above `galaxy`.
- `src/sim/` — richer civilization (economy, conflict, tech), other planets' processes.
- `src/world/` — true f64 floating-origin to merge the hand-offs into one zoom.
- `src/state/` — snapshot/share-link a world (ethersim's zod-schema approach).
