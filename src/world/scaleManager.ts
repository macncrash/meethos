// The scale manager: the spine that makes galaxy → solar → Earth feel like one
// continuous zoom. It owns the regime chain, a focus-tracking camera, cross-faded
// hand-offs between regimes, and the dive/ascend triggers driven by zoom depth.
//
// Like ethersim's Simulation Manager, it only ever talks to the Regime contract —
// it never knows what a regime simulates.
import { Vector3, type PerspectiveCamera, type Scene } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SimClock } from '../core/clock';
import type { FocusTarget, Regime } from '../core/regime';
import { GalaxyRegime } from '../regimes/galaxy';
import { SolarRegime } from '../regimes/solar';
import { EarthRegime } from '../regimes/earth';
import { SurfaceRegime } from '../regimes/surface';
import type { DeflectResult, DefenseStats } from '../regimes/comets';
import type { WorldBus } from './bus';

const DIVE_FACTOR = 2.6; // dive when camera closer than focus.radius × this
const ASCEND_FACTOR = 2.4; // ascend when farther than overview × this
const TRANSITION_SEC = 1.15;

interface Link {
  regime: Regime;
  /** focus id in the PARENT regime that represents this regime (for ascent) */
  parentFocusId: string | null;
}

interface Transition {
  from: Regime;
  to: Regime;
  endFocus: FocusTarget;
  startTarget: Vector3;
  startOffsetDir: Vector3;
  endOffsetDir: Vector3;
  startDist: number;
  endDist: number;
  t: number;
}

export class ScaleManager {
  private readonly chain: Link[];
  private index = 0;
  private currentFocus: FocusTarget;
  private transition: Transition | null = null;
  private readonly lastFocusPos = new Vector3();
  private readonly scratch = new Vector3();

  /** notified whenever the active regime or focus changes (UI hook) */
  onChange: (() => void) | null = null;

  private readonly solar: SolarRegime;

  constructor(
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly controls: OrbitControls,
    bus: WorldBus,
  ) {
    const galaxy = new GalaxyRegime();
    const solar = new SolarRegime(bus);
    const earth = new EarthRegime(bus);
    const surface = new SurfaceRegime(bus);
    this.solar = solar;
    this.chain = [
      { regime: galaxy, parentFocusId: null },
      { regime: solar, parentFocusId: 'sol-star' },
      { regime: earth, parentFocusId: 'earth' },
      { regime: surface, parentFocusId: 'earth-globe' },
    ];
    for (const link of this.chain) {
      this.scene.add(link.regime.object3d);
      link.regime.setOpacity(0);
    }

    const start = galaxy;
    start.setOpacity(1);
    this.currentFocus = start.defaultFocus()!;
    this.currentFocus.position(this.lastFocusPos);

    // initial camera framing: a three-quarter view of the galaxy, aimed at Sol
    const d = start.overviewDistance();
    this.controls.target.copy(this.lastFocusPos);
    this.camera.position.copy(this.lastFocusPos).add(this.scratch.set(0.3, 0.55, 1).normalize().multiplyScalar(d));
    this.applyZoomLimits();
    this.controls.update();
  }

  get active(): Regime {
    return this.chain[this.index]!.regime;
  }

  get focus(): FocusTarget {
    return this.currentFocus;
  }

  get isTransitioning(): boolean {
    return this.transition !== null;
  }

  /** breadcrumb path: [{id,label,active}] from outermost to current */
  breadcrumb(): Array<{ id: string; label: string; active: boolean }> {
    return this.chain.map((l, i) => ({ id: l.regime.id, label: l.regime.label, active: i === this.index }));
  }

  pickTargets(): FocusTarget[] {
    return this.active.focusTargets();
  }

  focusOn(target: FocusTarget): void {
    if (this.transition) return;
    this.currentFocus = target;
    this.applyZoomLimits();
    this.onChange?.();
  }

  /** dive into the focused (or given) body's child regime, if any */
  diveInto(target: FocusTarget): void {
    if (this.transition || !target.childRegime) return;
    const toIdx = this.chain.findIndex((l) => l.regime.id === target.childRegime);
    if (toIdx < 0) return;
    this.beginTransition(toIdx, this.chain[toIdx]!.regime.defaultFocus()!);
  }

  /** rise to the parent regime, framing the body we came from */
  ascend(): void {
    if (this.transition || this.index === 0) return;
    const childLink = this.chain[this.index]!;
    const parentIdx = this.index - 1;
    const parent = this.chain[parentIdx]!.regime;
    const focus =
      parent.focusTargets().find((t) => t.id === childLink.parentFocusId) ?? parent.defaultFocus()!;
    this.beginTransition(parentIdx, focus);
  }

  /** jump to a regime by id (breadcrumb click) */
  goTo(regimeId: string): void {
    if (this.transition) return;
    const idx = this.chain.findIndex((l) => l.regime.id === regimeId);
    if (idx < 0 || idx === this.index) return;
    const focus =
      idx > this.index
        ? this.chain[idx]!.regime.defaultFocus()!
        : this.chain[idx]!.regime.focusTargets().find((t) => t.id === this.chain[this.index]!.parentFocusId) ??
          this.chain[idx]!.regime.defaultFocus()!;
    this.beginTransition(idx, focus);
  }

  private beginTransition(toIndex: number, endFocus: FocusTarget): void {
    const from = this.active;
    const to = this.chain[toIndex]!.regime;
    const startTarget = this.controls.target.clone();
    const startOffsetDir = this.camera.position.clone().sub(startTarget);
    if (startOffsetDir.lengthSq() < 1e-9) startOffsetDir.set(0.3, 0.4, 1);
    startOffsetDir.normalize();
    // descending into a regime with a preferred landing view? swing toward it.
    const descending = toIndex > this.index;
    const preferred = descending ? to.preferredView?.() ?? null : null;
    const endOffsetDir = (preferred ?? startOffsetDir).clone().normalize();
    this.transition = {
      from,
      to,
      endFocus,
      startTarget,
      startOffsetDir,
      endOffsetDir,
      startDist: this.camera.position.distanceTo(startTarget),
      endDist: to.overviewDistance(),
      t: 0,
    };
    this.index = toIndex;
    this.currentFocus = endFocus;
    this.controls.enabled = false;
    this.onChange?.();
  }

  /** launch a comet at Earth (cross-scale coupling) from anywhere in the chain */
  launchComet(): void {
    this.solar.launchComet();
  }

  /** AU distance of the nearest inbound comet threatening Earth, or null */
  threatDistance(): number | null {
    return this.solar.threatDistance();
  }

  /** deflect the nearest inbound comet (player agency) */
  deflectComet(): DeflectResult {
    return this.solar.deflectComet();
  }

  /** survival mode: comets arrive on their own */
  setDefenseMode(on: boolean): void {
    this.solar.setDefenseMode(on);
  }

  defenseStats(): DefenseStats {
    return this.solar.defenseStats();
  }

  update(clock: SimClock, realDt: number): void {
    // cross-scale agents (comets in flight) advance regardless of the visible scale
    for (const link of this.chain) link.regime.stepBackground?.(clock);

    if (this.transition) {
      this.advanceTransition(clock, realDt);
      return;
    }

    // step only the active regime; analytic regimes recompute from absolute time
    this.active.step(clock);

    // focus-tracking: translate the camera by however far the focused body moved
    const focusPos = this.currentFocus.position(this.scratch);
    const dx = focusPos.x - this.lastFocusPos.x;
    const dy = focusPos.y - this.lastFocusPos.y;
    const dz = focusPos.z - this.lastFocusPos.z;
    this.camera.position.x += dx;
    this.camera.position.y += dy;
    this.camera.position.z += dz;
    this.controls.target.copy(focusPos);
    this.lastFocusPos.copy(focusPos);
    this.controls.update();

    this.checkTriggers();
  }

  private advanceTransition(clock: SimClock, realDt: number): void {
    const tr = this.transition!;
    tr.t = Math.min(1, tr.t + realDt / TRANSITION_SEC);
    const e = easeInOut(tr.t);

    tr.from.step(clock);
    tr.to.step(clock);

    const endPos = tr.endFocus.position(this.scratch).clone();
    const target = tr.startTarget.clone().lerp(endPos, e);
    const dist = tr.startDist + (tr.endDist - tr.startDist) * e;
    const dir = tr.startOffsetDir.clone().lerp(tr.endOffsetDir, e).normalize();
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(dir, dist);

    tr.from.setOpacity(1 - e);
    tr.to.setOpacity(e);

    if (tr.t >= 1) {
      tr.from.setOpacity(0);
      tr.to.setOpacity(1);
      this.lastFocusPos.copy(endPos);
      this.transition = null;
      this.controls.enabled = true;
      this.applyZoomLimits();
      this.controls.update();
      this.onChange?.();
    }
  }

  private checkTriggers(): void {
    const dist = this.camera.position.distanceTo(this.controls.target);
    const focus = this.currentFocus;
    const diveAt = focus.diveDistance ?? focus.radius * DIVE_FACTOR;
    if (focus.childRegime && dist < diveAt) {
      this.diveInto(focus);
    } else if (this.index > 0 && dist > this.active.overviewDistance() * ASCEND_FACTOR) {
      this.ascend();
    }
  }

  private applyZoomLimits(): void {
    const f = this.currentFocus;
    this.controls.minDistance = Math.max(0.02, f.radius * 0.6);
    this.controls.maxDistance = this.active.overviewDistance() * 3;
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
