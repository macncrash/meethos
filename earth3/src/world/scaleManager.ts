// The scale manager: the spine that makes galaxy → solar → Earth feel like one
// continuous zoom. It owns the regime chain, a focus-tracking camera, cross-faded
// hand-offs between regimes, and the dive/ascend triggers driven by zoom depth.
//
// Like ethersim's Simulation Manager, it only ever talks to the Regime contract —
// it never knows what a regime simulates.
import { Vector3, type PerspectiveCamera, type Ray, type Scene } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SimClock } from '../core/clock';
import type { FocusTarget, Regime } from '../core/regime';
import { UniverseRegime } from '../regimes/universe';
import { GalaxyRegime } from '../regimes/galaxy';
import { SolarRegime } from '../regimes/solar';
import { EarthRegime } from '../regimes/earth';
import { SurfaceRegime } from '../regimes/surface';
import { StarSystemRegime } from '../regimes/starSystem';
import type { DeflectResult, DefenseStats } from '../regimes/comets';
import type { WorldBus } from './bus';

const DIVE_FACTOR = 2.6; // dive when camera closer than focus.radius × this
const ASCEND_FACTOR = 2.4; // ascend when farther than overview × this
const TRANSITION_SEC = 1.15;

interface Link {
  regime: Regime;
  /** the regime to ascend to (null for the root). Enables branching: both `solar`
   *  and `starsystem` have parent `galaxy`. */
  parentRegimeId: string | null;
  /** focus id in the PARENT regime that represents this regime (for ascent framing) */
  parentFocusId: string | null;
  /** the regime's primary child on the "main line" — for the breadcrumb's forward path */
  mainChildId?: string;
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
  private currentId = 'universe';
  private currentFocus: FocusTarget;
  private transition: Transition | null = null;
  private readonly lastFocusPos = new Vector3();
  private readonly scratch = new Vector3();

  /** notified whenever the active regime or focus changes (UI hook) */
  onChange: (() => void) | null = null;

  private readonly solar: SolarRegime;
  private readonly universe: UniverseRegime;

  constructor(
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly controls: OrbitControls,
    bus: WorldBus,
  ) {
    const universe = new UniverseRegime();
    const galaxy = new GalaxyRegime();
    const solar = new SolarRegime(bus);
    const earth = new EarthRegime(bus);
    const surface = new SurfaceRegime(bus);
    const starsystem = new StarSystemRegime();
    this.solar = solar;
    this.universe = universe;
    this.chain = [
      { regime: universe, parentRegimeId: null, parentFocusId: null, mainChildId: 'galaxy' },
      { regime: galaxy, parentRegimeId: 'universe', parentFocusId: 'home-galaxy', mainChildId: 'solar' },
      { regime: solar, parentRegimeId: 'galaxy', parentFocusId: 'sol-star', mainChildId: 'earth' },
      { regime: earth, parentRegimeId: 'solar', parentFocusId: 'earth', mainChildId: 'surface' },
      { regime: surface, parentRegimeId: 'earth', parentFocusId: 'earth-globe' },
      // a sibling of `solar` under `galaxy`: any other star's procedural system
      { regime: starsystem, parentRegimeId: 'galaxy', parentFocusId: null },
    ];
    for (const link of this.chain) {
      this.scene.add(link.regime.object3d);
      link.regime.setOpacity(0);
    }

    const start = universe;
    start.setOpacity(1);
    this.currentFocus = start.defaultFocus()!;
    this.currentFocus.position(this.lastFocusPos);

    // initial camera framing: a three-quarter view of the cosmic web, aimed home
    const d = start.overviewDistance();
    this.controls.target.copy(this.lastFocusPos);
    this.camera.position.copy(this.lastFocusPos).add(this.scratch.set(0.3, 0.55, 1).normalize().multiplyScalar(d));
    this.applyZoomLimits();
    this.controls.update();
  }

  get active(): Regime {
    return this.linkOf(this.currentId).regime;
  }

  private linkOf(id: string): Link {
    return this.chain.find((l) => l.regime.id === id)!;
  }

  /** number of ancestors above a regime (root = 0) — used to tell descend from ascend */
  private depth(id: string): number {
    let d = 0;
    let p = this.linkOf(id).parentRegimeId;
    while (p) {
      d++;
      p = this.linkOf(p).parentRegimeId;
    }
    return d;
  }

  get focus(): FocusTarget {
    return this.currentFocus;
  }

  get isTransitioning(): boolean {
    return this.transition !== null;
  }

  /** breadcrumb: ancestors (root → current) plus the main-line forward path */
  breadcrumb(): Array<{ id: string; label: string; active: boolean }> {
    const ids: string[] = [];
    // ancestors, root-first
    let id: string | null = this.currentId;
    while (id) {
      ids.unshift(id);
      id = this.linkOf(id).parentRegimeId;
    }
    // forward along the main line from current
    const seen = new Set(ids);
    let next = this.linkOf(this.currentId).mainChildId;
    while (next && !seen.has(next)) {
      ids.push(next);
      seen.add(next);
      next = this.linkOf(next).mainChildId;
    }
    return ids.map((i) => ({ id: i, label: this.linkOf(i).regime.label, active: i === this.currentId }));
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
    const link = this.chain.find((l) => l.regime.id === target.childRegime);
    if (!link) return;
    // (re)generate a configurable child (e.g. a star's procedural system) before entering
    if (target.seed !== undefined) link.regime.configure?.(target.seed, target.label);
    this.beginTransition(target.childRegime, link.regime.defaultFocus()!);
  }

  /** rise to the parent regime, framing the body we came from */
  ascend(): void {
    if (this.transition) return;
    const childLink = this.linkOf(this.currentId);
    const parentId = childLink.parentRegimeId;
    if (!parentId) return;
    const parent = this.linkOf(parentId).regime;
    const focus =
      parent.focusTargets().find((t) => t.id === childLink.parentFocusId) ?? parent.defaultFocus()!;
    this.beginTransition(parentId, focus);
  }

  /** jump to a regime by id (breadcrumb click) */
  goTo(regimeId: string): void {
    if (this.transition || regimeId === this.currentId) return;
    if (!this.chain.some((l) => l.regime.id === regimeId)) return;
    this.beginTransition(regimeId, this.linkOf(regimeId).regime.defaultFocus()!);
  }

  private beginTransition(toId: string, endFocus: FocusTarget): void {
    const from = this.active;
    const to = this.linkOf(toId).regime;
    const startTarget = this.controls.target.clone();
    const startOffsetDir = this.camera.position.clone().sub(startTarget);
    if (startOffsetDir.lengthSq() < 1e-9) startOffsetDir.set(0.3, 0.4, 1);
    startOffsetDir.normalize();
    // descending into a regime with a preferred landing view? swing toward it.
    const descending = this.depth(toId) > this.depth(this.currentId);
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
    this.currentId = toId;
    this.currentFocus = endFocus;
    this.controls.enabled = false;
    this.onChange?.();
  }

  /** rewind to the Big Bang and watch the cosmic web form (only at the cosmos scale) */
  bigBang(): void {
    if (this.currentId === 'universe') this.universe.playBigBang();
  }

  cosmicInfo(): { atCosmos: boolean; forming: boolean; ageGyr: number } {
    return { atCosmos: this.currentId === 'universe', forming: this.universe.isForming, ageGyr: this.universe.cosmicAgeGyr };
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

  /** deflect the comet nearest a click ray */
  deflectCometAt(ray: Ray): DeflectResult {
    return this.solar.deflectCometAt(ray);
  }

  /** survival mode: comets arrive on their own */
  setDefenseMode(on: boolean): void {
    this.solar.setDefenseMode(on);
  }

  defenseStats(): DefenseStats {
    return this.solar.defenseStats();
  }

  /** frame the solar system (where the comets are) for a defense run */
  frameForDefense(): void {
    if (this.transition) return;
    const sun = this.solar.defaultFocus()!;
    if (this.currentId === 'solar') {
      this.focusOn(sun);
      this.reframeOverview();
    } else {
      this.beginTransition('solar', sun);
    }
  }

  private reframeOverview(): void {
    const tgt = this.currentFocus.position(this.scratch).clone();
    const dir = this.camera.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-9) dir.set(0.3, 0.5, 1);
    dir.normalize();
    this.controls.target.copy(tgt);
    this.camera.position.copy(tgt).addScaledVector(dir, this.active.overviewDistance());
    this.lastFocusPos.copy(tgt);
    this.controls.update();
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
    } else if (this.linkOf(this.currentId).parentRegimeId && dist > this.active.overviewDistance() * ASCEND_FACTOR) {
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
