// Earth regime: a procedurally-continented globe carrying a living civilization.
// This is where galaxy→solar→Earth pays off — dive to the surface and watch
// settlements ignite, grow, and spread across the continents over centuries.
import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  Quaternion,
  RingGeometry,
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
import { planetPosition } from './data/kepler';
import { PLANETS } from './data/planets';
import type { WorldBus, ImpactEvent } from '../world/bus';

const Y_AXIS = new Vector3(0, 1, 0);
const FROM_Z = new Vector3(0, 0, 1);
const MAX_CRATERS = 14;
const EARTH_DATA = PLANETS.find((p) => p.id === 'earth')!;
const AXIAL_TILT = (EARTH_DATA.obliquityDeg * Math.PI) / 180; // 23.44°

interface Shockwave {
  mesh: Mesh;
  age: number; // wall-clock seconds
  life: number;
}

const GLOBE_R = 1;
const SETTLE_R = 1.008; // markers float just above the ground
// stylized defaults (legacy band): the true Moon is 60.3 Earth radii out — the unified
// frame calls configureMoon() to put it there; the legacy band keeps the close-in look.
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
  private moonOrbit = MOON_ORBIT; // orbit radius in globe radii
  private moonSinInc = 0.0667; // orbit tilt (legacy default ≈ the old 0.2-radius wobble)
  private moonCosInc = 0.9978;
  private moonPeriodSec = MOON_PERIOD_SEC;
  private moonPhase = 0; // position angle at t=0 (rad)
  private readonly settlePoints: Points;
  private readonly links: LineSegments;
  private readonly sizes: Float32Array;
  private readonly colors: Float32Array;
  private readonly positions: Float32Array;
  private readonly linkPositions: Float32Array;
  private refreshAccum = 0;
  private readonly sunLight: DirectionalLight;
  private readonly sunDir = new Vector3();
  private readonly targets: FocusTarget[] = [];
  private readonly craters: Mesh[] = [];
  private readonly shocks: Shockwave[] = [];
  private lastImpact: { energy: number; killed: number; atYear: number } | null = null;

  constructor(bus: WorldBus) {
    this.civ = new Civilization(this.field);
    this.object3d.name = 'earth';
    bus.onImpact((e) => this.onImpact(e));

    // globe — lit (MeshStandard) so the Sun casts a real day/night terminator.
    // A tilt group leans the spin axis 23.44° (fixed in space → seasons emerge as
    // Earth orbits); the globe spins about that tilted axis once per sidereal day.
    this.globe = new Mesh(
      new SphereGeometry(GLOBE_R, 64, 48),
      new MeshStandardMaterial({ map: this.field.texture(), roughness: 1, metalness: 0 }),
    );
    const tilt = new Group();
    tilt.rotation.z = AXIAL_TILT;
    tilt.add(this.globe);
    this.object3d.add(tilt);

    // the Sun: a directional light whose direction comes from Earth's real orbit.
    this.sunLight = new DirectionalLight(0xfff4e6, 2.6);
    this.object3d.add(this.sunLight);
    this.object3d.add(this.sunLight.target);
    this.object3d.add(new AmbientLight(0x223044, 0.5)); // faint earthshine so the night side isn't pure black

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
      childRegime: 'surface',
      diveDistance: 1.4, // zoom right down to the surface before dropping into the city
      info: () => ({
        title: 'Earth',
        rows: [
          ['Cities', this.civ.settlements.length.toLocaleString()],
          ['Population', formatPop(this.civ.totalPopulation)],
          ['Era', this.civ.era],
        ],
        blurb: this.lastImpact
          ? `Impact event — ${formatPop(this.lastImpact.killed)} lost, civilization set back. The crater scars the surface below.`
          : 'A procedurally-grown world. Speed time up and watch civilization spread across the continents.',
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

  /** Re-scale the Moon's orbit (globe-radius units). The unified frame calls this with
   *  the TRUE geometry — 60.34 Earth radii, 5.14° ecliptic tilt, the real J2000 phase —
   *  so "from the Earth to the Moon" is the genuine 30-Earth-diameter gulf. The mesh is
   *  already true-scale (0.27 globe radii ≈ 1737/6371 km). The orbit formula below must
   *  stay identical to data/moons.ts moonLocalPosition() — the unified frame propagates
   *  Luna's pickable body through that function with the same parameters. */
  configureMoon(orbitRadii: number, incDeg: number, periodSec: number, phaseRad: number): void {
    this.moonOrbit = orbitRadii;
    this.moonSinInc = Math.sin((incDeg * Math.PI) / 180);
    this.moonCosInc = Math.cos((incDeg * Math.PI) / 180);
    this.moonPeriodSec = periodSec;
    this.moonPhase = phaseRad;
  }

  step(clock: SimClock): void {
    // civilization advances in sim-years, bounded so cosmic rates stay cheap
    const years = Math.min(clock.dt / (SECONDS_PER_DAY * 365.25), MAX_CIV_YEARS_PER_FRAME);
    this.civ.advance(years);

    this.animateShocks(clock.realDt);

    // globe spins once per sidereal day about its tilted axis
    this.globe.rotation.y = (clock.seconds / SECONDS_PER_DAY) * Math.PI * 2;

    // Sun direction from Earth's REAL heliocentric position → moving terminator + seasons
    planetPosition(EARTH_DATA, clock.seconds, this.sunDir).negate().normalize();
    this.sunLight.position.copy(this.sunDir).multiplyScalar(10);

    // moon orbit — same tilted-circle form as data/moons.ts moonLocalPosition()
    const ma = this.moonPhase + (clock.seconds / this.moonPeriodSec) * Math.PI * 2;
    this.moonPos.set(Math.cos(ma) * this.moonOrbit, Math.sin(ma) * this.moonOrbit * this.moonSinInc, Math.sin(ma) * this.moonOrbit * this.moonCosInc);
    this.moon.position.copy(this.moonPos);
    this.moon.rotation.y = ma; // tidal lock

    // throttle the (relatively heavy) marker/link rebuild
    this.refreshAccum += clock.dt > 0 ? 1 / 60 : 0;
    if (this.refreshAccum >= CIV_REFRESH_SEC) {
      this.refreshAccum = 0;
      this.refreshCivBuffers();
    }
  }

  // --- cross-scale coupling: a comet from the solar regime strikes here ---

  private onImpact(e: ImpactEvent): void {
    // Aim at the inhabited heartland (with jitter) so a strike is actually felt;
    // if the world is empty, un-spin the incoming direction onto the globe's
    // rotating frame so the crater still lands where the comet came in.
    const heartland = this.civ.populationCentroid(new Vector3());
    let localDir: Vector3;
    if (heartland) {
      localDir = heartland
        .add(new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5))
        .normalize();
    } else {
      const rotAtImpact = (e.atSeconds / SECONDS_PER_DAY) * Math.PI * 2;
      localDir = e.dir.clone().applyAxisAngle(Y_AXIS, -rotAtImpact).normalize();
    }

    const { killed } = this.civ.impact(localDir, e.energy);
    this.lastImpact = { energy: e.energy, killed, atYear: Math.round(this.civ.years) };

    const quat = new Quaternion().setFromUnitVectors(FROM_Z, localDir);

    // permanent dark crater, parented to the globe so it rotates with the surface
    const r = 0.05 + e.energy * 0.13;
    const crater = new Mesh(
      new CircleGeometry(r, 28),
      new MeshBasicMaterial({ color: 0x241208, transparent: true, opacity: 0.92, side: DoubleSide }),
    );
    crater.position.copy(localDir).multiplyScalar(GLOBE_R * 1.003);
    crater.quaternion.copy(quat);
    this.globe.add(crater);
    this.craters.push(crater);
    if (this.craters.length > MAX_CRATERS) {
      const old = this.craters.shift()!;
      this.globe.remove(old);
      old.geometry.dispose();
      (old.material as MeshBasicMaterial).dispose();
    }

    // transient ember shockwave that expands and fades
    const ring = new Mesh(
      new RingGeometry(r * 0.6, r, 40),
      new MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.9, side: DoubleSide, blending: AdditiveBlending, depthWrite: false }),
    );
    ring.position.copy(localDir).multiplyScalar(GLOBE_R * 1.004);
    ring.quaternion.copy(quat);
    this.globe.add(ring);
    this.shocks.push({ mesh: ring, age: 0, life: 2.2 });

    this.refreshCivBuffers();
  }

  private animateShocks(realDt: number): void {
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i]!;
      s.age += realDt;
      const t = s.age / s.life;
      if (t >= 1) {
        this.globe.remove(s.mesh);
        s.mesh.geometry.dispose();
        (s.mesh.material as MeshBasicMaterial).dispose();
        this.shocks.splice(i, 1);
        continue;
      }
      const scale = 1 + t * 6;
      s.mesh.scale.setScalar(scale);
      (s.mesh.material as MeshBasicMaterial).opacity = (1 - t) * 0.9;
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
