// meethos / earth3 — UnifiedWorld: the single floating-origin coordinate frame
// that the six cross-faded regimes are migrating ONTO (the proven src/scenes/
// zoomDemo.ts pattern, grown into the live game).
//
// Built ALONGSIDE the legacy ScaleManager path and selected with `?unified`, so
// the live game is untouched until each band is ported + verified. Outer bands
// (cosmos → galaxy → stars) come first (static/analytic, low gameplay risk),
// then the gameplay-bearing inner bands (planets → Earth → comets → city).
//
// Step 1: an inert harness — it owns a FloatingOrigin and an update() that does
// nothing yet. Subsequent steps fill in the bands.
import { Vector3 } from 'three';
import type { Camera, Scene, WebGLRenderer } from 'three';
import type { SimClock } from '../core/clock';
import type { WorldBus } from './bus';
import { FloatingOrigin } from '../meethos/floatingOrigin';

export class UnifiedWorld {
  /** Camera-at-origin world rebasing — every body's f64 world position is placed
   *  relative to camWorld so only camera-relative f32 reaches the GPU. */
  readonly fo = new FloatingOrigin(new Vector3());

  // params are reserved for the bands ported in later steps (cosmos → city);
  // the step-1 harness only needs the FloatingOrigin.
  constructor(
    _scene: Scene,
    _camera: Camera,
    _renderer: WebGLRenderer,
    _bus: WorldBus,
    _clock: SimClock,
  ) {}

  /** Drive one frame of the unified world. Inert until the bands are ported. */
  update(_clock: SimClock, _realDt: number): void {
    // bands are added in subsequent migration steps (cosmos → city)
  }
}
