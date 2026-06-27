// Earth regime: a procedurally-continented globe carrying a living civilization.
// This is where galaxy→solar→Earth pays off — dive to the surface and watch
// settlements ignite, grow, and spread across the continents over centuries.
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Points,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { SimClock } from '../core/clock';
import type { FocusTarget, Regime } from '../core/regime';
import { SECONDS_PER_DAY } from '../core/units';
import { glowTexture, dotTexture } from '../render/sprites';
import { setOpacityDeep } from '../render/opacity';
import { createGlowPointsMaterial } from '../render/pointsMaterial';
import { PlanetField } from '../world/planetField';
import { Civilization, eraColor, MAX_SETTLEMENTS } from '../sim/civilization';

const GLOBE_R = 1;
const SETTLE_R = 1.008; // markers float just above the ground
const MOON_ORBIT = 3.0;
const MOON_PERIOD_SEC = 27.32 * SECONDS_PER_DAY;
const MAX_LINKS = 1400;
const CIV_REFRESH_SEC = 0.2; // wall-clock throttle for rebuilding marker buffers
const MAX_CIV_YEARS_PER_FRAME = 150; // bound civ work at cosmic time-rates

export class EarthRegime implements Regime {
  readonly id = 'earth';
  readonly label = 'Earth';
  readonly object3d = new Group();

  private readonly field = new PlanetField();
  private readonly civ: Civilization;
  private readonly globe: Mesh;
  private readonly moon: Mesh;
  private readonly moonPos = new Vector3();
  private readonly settlePoints: Points;
  private readonly links: LineSegments;
  private readonly sizes: Float32Array;
  private readonly colors: Float32Array;
  private readonly positions: Float32Array;
  private readonly linkPositions: Float32Array;
  private refreshAccum = 0;
  private readonly targets: FocusTarget[] = [];

  constructor() {
    this.civ = new Civilization(this.field);
    this.object3d.name = 'earth';

    // globe
    this.globe = new Mesh(
      new SphereGeometry(GLOBE_R, 64, 48),
      new MeshBasicMaterial({ map: this.field.texture() }),
    );
    this.object3d.add(this.globe);

    // atmosphere shell — a thin rim, not a flood
    const atmo = new Mesh(
      new SphereGeometry(GLOBE_R * 1.025, 48, 32),
      new MeshBasicMaterial({ color: 0x5aa0ff, transparent: true, opacity: 0.08, side: BackSide, blending: AdditiveBlending, depthWrite: false }),
    );
    this.object3d.add(atmo);

    // settlement markers (parented to the globe so they rotate with the surface)
    this.positions = new Float32Array(MAX_SETTLEMENTS * 3);
    this.sizes = new Float32Array(MAX_SETTLEMENTS);
    this.colors = new Float32Array(MAX_SETTLEMENTS * 3);
    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(this.positions, 3));
    geom.setAttribute('size', new BufferAttribute(this.sizes, 1));
    geom.setAttribute('acolor', new BufferAttribute(this.colors, 3));
    geom.setDrawRange(0, 0);
    this.settlePoints = new Points(geom, createGlowPointsMaterial(dotTexture()));
    this.settlePoints.frustumCulled = false;
    this.globe.add(this.settlePoints);

    // trade links
    this.linkPositions = new Float32Array(MAX_LINKS * 2 * 3);
    const linkGeom = new BufferGeometry();
    linkGeom.setAttribute('position', new BufferAttribute(this.linkPositions, 3));
    linkGeom.setDrawRange(0, 0);
    this.links = new LineSegments(
      linkGeom,
      new LineBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.25, depthWrite: false, blending: AdditiveBlending }),
    );
    this.globe.add(this.links);

    // moon
    this.moon = new Mesh(
      new SphereGeometry(0.27, 32, 24),
      new MeshBasicMaterial({ color: 0xb9b9c4 }),
    );
    this.object3d.add(this.moon);

    // soft glow so Earth reads as a point from far away (kept subtle up close)
    const halo = new Sprite(
      new SpriteMaterial({ map: glowTexture(new Color(0x6fb4ff)), blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.18 }),
    );
    halo.scale.setScalar(2.5);
    this.object3d.add(halo);

    this.buildTargets();
    this.refreshCivBuffers();
  }

  private buildTargets(): void {
    this.targets.push({
      id: 'earth-globe',
      label: 'Earth',
      position: (out) => out.set(0, 0, 0),
      radius: GLOBE_R,
      info: () => ({
        title: 'Earth',
        rows: [
          ['Cities', this.civ.settlements.length.toLocaleString()],
          ['Population', formatPop(this.civ.totalPopulation)],
          ['Era', this.civ.era],
        ],
        blurb: 'A procedurally-grown world. Speed time up and watch civilization spread across the continents.',
      }),
    });
    this.targets.push({
      id: 'luna',
      label: 'Moon',
      position: (out) => out.copy(this.moonPos),
      radius: 0.27,
      info: () => ({
        title: 'Moon',
        rows: [
          ['Orbit', '384,400 km'],
          ['Period', '27.3 days'],
        ],
        blurb: 'Tidally locked companion — one face always toward home.',
      }),
    });
  }

  step(clock: SimClock): void {
    // civilization advances in sim-years, bounded so cosmic rates stay cheap
    const years = Math.min(clock.dt / (SECONDS_PER_DAY * 365.25), MAX_CIV_YEARS_PER_FRAME);
    this.civ.advance(years);

    // globe spins once per simulated day
    this.globe.rotation.y = (clock.seconds / SECONDS_PER_DAY) * Math.PI * 2;

    // moon orbit
    const ma = (clock.seconds / MOON_PERIOD_SEC) * Math.PI * 2;
    this.moonPos.set(Math.cos(ma) * MOON_ORBIT, Math.sin(ma) * 0.2, Math.sin(ma) * MOON_ORBIT);
    this.moon.position.copy(this.moonPos);
    this.moon.rotation.y = ma; // tidal lock

    // throttle the (relatively heavy) marker/link rebuild
    this.refreshAccum += clock.dt > 0 ? 1 / 60 : 0;
    if (this.refreshAccum >= CIV_REFRESH_SEC) {
      this.refreshAccum = 0;
      this.refreshCivBuffers();
    }
  }

  private refreshCivBuffers(): void {
    const cities = this.civ.settlements;
    const n = Math.min(cities.length, MAX_SETTLEMENTS);
    const col = new Color();
    eraColor(this.civ.era, col);

    for (let i = 0; i < n; i++) {
      const s = cities[i]!;
      const o = i * 3;
      this.positions[o] = s.dir.x * SETTLE_R;
      this.positions[o + 1] = s.dir.y * SETTLE_R;
      this.positions[o + 2] = s.dir.z * SETTLE_R;
      // size grows with log population
      this.sizes[i] = 0.5 + Math.min(2.4, Math.log10(1 + s.pop) * 0.34);
      this.colors[o] = col.r;
      this.colors[o + 1] = col.g;
      this.colors[o + 2] = col.b;
    }
    const geom = this.settlePoints.geometry;
    geom.setDrawRange(0, n);
    (geom.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (geom.getAttribute('size') as BufferAttribute).needsUpdate = true;
    (geom.getAttribute('acolor') as BufferAttribute).needsUpdate = true;

    this.rebuildLinks(n);
  }

  private rebuildLinks(n: number): void {
    const cities = this.civ.settlements;
    const cosNear = Math.cos(0.16);
    let seg = 0;
    for (let i = 0; i < n && seg < MAX_LINKS; i++) {
      const a = cities[i]!.dir;
      for (let j = i + 1; j < n && seg < MAX_LINKS; j++) {
        const b = cities[j]!.dir;
        if (a.dot(b) > cosNear) {
          const o = seg * 6;
          this.linkPositions[o] = a.x * SETTLE_R;
          this.linkPositions[o + 1] = a.y * SETTLE_R;
          this.linkPositions[o + 2] = a.z * SETTLE_R;
          this.linkPositions[o + 3] = b.x * SETTLE_R;
          this.linkPositions[o + 4] = b.y * SETTLE_R;
          this.linkPositions[o + 5] = b.z * SETTLE_R;
          seg++;
        }
      }
    }
    const geom = this.links.geometry;
    geom.setDrawRange(0, seg * 2);
    (geom.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  focusTargets(): FocusTarget[] {
    return this.targets;
  }

  defaultFocus(): FocusTarget | null {
    return this.targets[0] ?? null;
  }

  overviewDistance(): number {
    return 3.4;
  }

  onEnter(): void {}
  onExit(): void {}

  setOpacity(o: number): void {
    setOpacityDeep(this.object3d, o);
    const mat = this.settlePoints.material as ShaderMaterial;
    mat.uniforms.uOpacity!.value = o;
  }

  dispose(): void {
    this.object3d.traverse((obj) => {
      const m = obj as Mesh;
      m.geometry?.dispose?.();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
  }
}

function formatPop(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} K`;
  return Math.round(n).toString();
}
