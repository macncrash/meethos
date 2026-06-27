// The earth3 multi-scale contract — the analogue of ethersim's `Archetype` seam,
// adapted for nested scale "regimes". A Regime is a self-contained simulation
// that owns one scale band (galaxy, solar system, planet surface). The scale
// manager only ever talks to this interface; it never inspects a regime's
// physics — same fan-out discipline that lets ethersim add a system in one file.
import type { Object3D, Vector3 } from 'three';
import type { SimClock } from './clock';

export interface InspectorInfo {
  title: string;
  rows: Array<[string, string]>;
  blurb?: string;
}

/** A selectable body within a regime. Diving into one descends to its child regime. */
export interface FocusTarget {
  id: string;
  label: string;
  /** position in this regime's LOCAL render space; written into `out`, returned for chaining */
  position(out: Vector3): Vector3;
  /** render-space radius — used for framing and the dive threshold */
  radius: number;
  /** id of the regime to descend into when diving into this body, if any */
  childRegime?: string;
  info(clock: SimClock): InspectorInfo;
}

export interface Regime {
  readonly id: string;
  readonly label: string;
  /** scene-graph root added to the stage while this regime is visible */
  readonly object3d: Object3D;

  /** advance simulation. `clock.seconds` is absolute; `clock.dt` is this frame. */
  step(clock: SimClock): void;

  /** all selectable bodies at this scale */
  focusTargets(): FocusTarget[];
  /** body to frame when entering by descent (e.g. the star you dove into) */
  defaultFocus(): FocusTarget | null;
  /** camera distance (local render units) that frames the whole regime */
  overviewDistance(): number;

  onEnter(): void;
  onExit(): void;
  /** cross-fade opacity 0..1 while transitioning between regimes */
  setOpacity(o: number): void;
  dispose(): void;
}
