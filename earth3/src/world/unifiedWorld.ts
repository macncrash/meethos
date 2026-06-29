// meethos / earth3 — UnifiedWorld: the single floating-origin coordinate frame
// that the six cross-faded regimes are migrating ONTO (the proven src/scenes/
// zoomDemo.ts pattern, grown into the live game).
//
// Built ALONGSIDE the legacy ScaleManager path and selected with `?unified`, so
// the live game is untouched until each band is ported + verified. Outer bands
// (cosmos → galaxy → stars) come first (static/analytic, low gameplay risk),
// then the gameplay-bearing inner bands (planets → Earth → comets → city).
//
// Coordinate frame: ONE render unit = 1 AU, all world positions carried in f64
// JS Vector3, camera pinned at the scene origin with the world rebased every
// frame (FloatingOrigin). LOD is pure per-frame visibility against `dist` —
// no cross-fade, no setOpacity, no regime tree.
//
// Steps 3-4: the outer ladder (Milky Way + nearest stars + Galactic Centre) and
// the Solar System (Sun + 8 Keplerian planets), animated by the game SimClock,
// with reference rings and the f64 yaw/pitch/log-zoom camera rig. Gameplay bands
// (Earth/civ/comets/city) and the HUD/picking facade arrive in later steps.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineLoop,
  Points,
  PointsMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { SimClock } from '../core/clock';
import type { WorldBus } from './bus';
import { blackbodyColor } from '../core/color';
import { mulberry32, gaussian } from '../core/rng';
import { dotTexture, glowTexture } from '../render/sprites';
import { makeLabel } from '../render/label';
import { planetPosition } from '../regimes/data/kepler';
import { PLANETS, SUN } from '../regimes/data/planets';
import { AU_PER_LY, AU_PER_PC, EARTH_RADIUS_AU, SUN_RADIUS_AU } from '../meethos/units';
import { eclipticDirFromRaDec, galacticBasis } from '../meethos/frames';
import { FloatingOrigin } from '../meethos/floatingOrigin';
import { EarthRegime } from '../regimes/earth';
import { CometField } from '../regimes/comets';
import type { DeflectResult, DefenseStats } from '../regimes/comets';

const ORIGIN = new Vector3(0, 0, 0);
const KPC_AU = AU_PER_PC * 1e3; // AU per kiloparsec
const EARTH_IDX = PLANETS.findIndex((p) => p.id === 'earth'); // position in PLANETS
const EARTH_DATA = PLANETS[EARTH_IDX]!;
const EARTH_GLOBE_SHOW = 0.03; // AU — within this camera distance, the true-scale globe replaces the dot

interface Body {
  world: Vector3; // absolute position in AU (f64)
  dot: Sprite;
  label: Sprite;
  kind: 'sun' | 'planet' | 'star';
}

// The Milky Way as a Points cloud in the SAME AU frame — barred spiral at physical
// size, oriented by the REAL galactic basis, Sun on the Orion arm at R0 ≈ 8.2 kpc.
function buildGalaxy(): { group: Group; centerWorld: Vector3 } {
  const N = 34_000;
  const R0 = 8.2 * KPC_AU;
  const DISK = 14 * KPC_AU;
  const H = 0.3 * KPC_AU; // disk scale height
  const ARMS = [
    { base: 0.0, pitch: 0.25 },
    { base: Math.PI, pitch: 0.2 },
    { base: Math.PI * 0.5, pitch: 0.31 },
    { base: Math.PI * 1.5, pitch: 0.24 },
  ];
  const rng = mulberry32(0x5b1a);
  const M = galacticBasis(); // galactic axes → render frame (real orientation)
  const sunGal = new Vector3(-R0, 0, 0); // Sun on −X so Sun→Centre = +X (toward Sgr A*)
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const v = new Vector3();
  const c = new Color();
  for (let i = 0; i < N; i++) {
    const u = rng();
    let r: number;
    let ang: number;
    let h: number;
    let hot = false;
    if (u < 0.2) {
      // bulge + bar (denser, brighter core)
      const bar = u < 0.08;
      r = bar ? rng() * 4.5 * KPC_AU : Math.abs(gaussian(rng)) * 1.1 * KPC_AU;
      ang = bar ? 0.45 + gaussian(rng) * 0.18 : rng() * 6.2832;
      h = gaussian(rng) * (bar ? 0.3 : 0.7) * KPC_AU;
    } else if (u < 0.95) {
      const arm = ARMS[(rng() * ARMS.length) | 0]!;
      r = DISK * Math.pow(rng(), 0.6);
      const wind = Math.log(r / KPC_AU + 1) / Math.tan(arm.pitch);
      ang = arm.base + wind + gaussian(rng) * (0.1 + 0.5 / (r / KPC_AU + 1));
      h = gaussian(rng) * H * (0.5 + 1 / (r / (3 * KPC_AU) + 1));
      hot = rng() < 0.16;
    } else {
      r = DISK * Math.sqrt(rng());
      ang = rng() * 6.2832;
      h = gaussian(rng) * H;
    }
    // generate in the galactic basis (disk in X–Y, Z = north), then place by M
    v.set(Math.cos(ang) * r, Math.sin(ang) * r, h).sub(sunGal).applyMatrix4(M);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
    const t = hot ? 8000 + rng() * 14000 : u < 0.2 ? 3300 + rng() * 1800 : 3200 + rng() * 3600;
    blackbodyColor(t, c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  const geom = new BufferGeometry();
  geom.setAttribute('position', new BufferAttribute(positions, 3));
  geom.setAttribute('color', new BufferAttribute(colors, 3));
  const points = new Points(
    geom,
    new PointsMaterial({ size: 7e6, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true, opacity: 1 }),
  );
  points.frustumCulled = false;

  const group = new Group();
  group.add(points);
  const centerWorld = new Vector3(0, 0, 0).sub(sunGal).applyMatrix4(M);
  const bulge = new Sprite(new SpriteMaterial({ map: glowTexture(new Color(0xffe2a8)), blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
  bulge.scale.setScalar(5 * KPC_AU);
  bulge.position.copy(centerWorld);
  group.add(bulge);
  return { group, centerWorld };
}

// the real nearest stars (RA/Dec J2000, distance ly, temperature K)
const STARS = [
  { name: 'Alpha Centauri', ra: 219.9, dec: -60.83, ly: 4.37, k: 5790 },
  { name: 'Barnard’s Star', ra: 269.45, dec: 4.69, ly: 5.96, k: 3130 },
  { name: 'Wolf 359', ra: 164.12, dec: 7.01, ly: 7.86, k: 2800 },
  { name: 'Lalande 21185', ra: 165.83, dec: 35.97, ly: 8.31, k: 3550 },
  { name: 'Sirius', ra: 101.29, dec: -16.72, ly: 8.6, k: 9940 },
  { name: 'Ross 154', ra: 282.46, dec: -23.83, ly: 9.69, k: 3340 },
  { name: 'Epsilon Eridani', ra: 53.23, dec: -9.46, ly: 10.5, k: 5080 },
  { name: 'Procyon', ra: 114.83, dec: 5.22, ly: 11.46, k: 6530 },
  { name: '61 Cygni', ra: 316.72, dec: 38.75, ly: 11.4, k: 4530 },
  { name: 'Tau Ceti', ra: 26.02, dec: -15.94, ly: 11.91, k: 5340 },
  { name: 'Vega', ra: 279.23, dec: 38.78, ly: 25.04, k: 9602 },
  { name: 'Altair', ra: 297.7, dec: 8.87, ly: 16.73, k: 7550 },
  { name: 'Fomalhaut', ra: 344.41, dec: -29.62, ly: 25.13, k: 8590 },
  { name: 'Pollux', ra: 116.33, dec: 28.03, ly: 33.78, k: 4865 },
];

export class UnifiedWorld {
  /** Camera-at-origin world rebasing — every body's f64 world position is placed
   *  relative to camWorld so only camera-relative f32 reaches the GPU. */
  readonly fo = new FloatingOrigin(new Vector3());

  private readonly bodies: Body[] = [];
  private readonly galaxy = buildGalaxy();
  private readonly gcBody: Body;
  private readonly rings: { line: LineLoop; label: Sprite; r: number }[];

  // the Earth band: the full lit globe + Moon + living civilization, reused verbatim
  // from the legacy regime, scaled to true Earth radius and ridden on the AU frame.
  private readonly earth: EarthRegime;
  private readonly earthBody: Body;

  // comets — the threat + cross-scale coupling agent, reused verbatim. Already in
  // absolute AU (Sun at origin), so its group just rides the floating origin; it
  // homes on Earth's AU position and emits the frozen ImpactEvent on the bus.
  private readonly cometGroup = new Group();
  private readonly comets: CometField;

  // f64 orbit camera rig (yaw/pitch/log-distance) around a movable focus point
  private yaw = 0.6;
  private pitch = 0.5;
  private logDist = Math.log10(3); // start a few AU out (inner solar system)
  private targetLog = this.logDist;
  private minLog = Math.log10(SUN_RADIUS_AU * 2.5); // closest approach — set per focus body
  private readonly MAX_LOG = Math.log10(7e9); // out past the galactic disk (~34 kpc)

  // camera focus: orbit + look at this world point (default the Sun at the origin);
  // focusGet, when set, re-reads a moving body's position every frame.
  private readonly focusWorld = new Vector3();
  private focusGet: (() => Vector3) | null = null;

  // drag state
  private dragging = false;
  private lx = 0;
  private ly = 0;
  private readonly tmp = new Vector3();

  constructor(
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    bus: WorldBus,
    private readonly clock: SimClock,
  ) {
    // ---- build the scene content in the single AU frame ----
    scene.add(this.galaxy.group);

    // Sun at the origin
    this.addBody(new Vector3(0, 0, 0), 'Sun', new Color(SUN.color), 'sun', 0.03);
    // planets at their true AU positions (animated by the sim clock)
    for (const p of PLANETS) this.addBody(planetPosition(p, 0, new Vector3()), p.label, new Color(p.color), 'planet', 0.013);
    // the real nearest stars at true distance + real direction + real color
    const c = new Color();
    for (const s of STARS) {
      const world = eclipticDirFromRaDec(s.ra, s.dec).multiplyScalar(s.ly * AU_PER_LY);
      this.addBody(world, s.name, blackbodyColor(s.k, c).clone(), 'star', s.k > 7000 ? 0.016 : 0.011);
    }
    // the Galactic Centre marker (rides the cloud's bulge)
    this.addBody(this.galaxy.centerWorld, 'Galactic Centre', new Color(0xffe6b0), 'star', 0.02);
    this.gcBody = this.bodies[this.bodies.length - 1]!;

    // the Earth band: reuse the full EarthRegime (lit globe + Moon + civilization +
    // impact coupling) verbatim, scaled so its 1-unit globe is Earth's true radius
    // and placed at Earth's heliocentric AU position each frame. Its civilization
    // advances every frame (owner decision: a living world) — see update().
    this.earthBody = this.bodies[EARTH_IDX + 1]!; // bodies[0] is the Sun
    this.earth = new EarthRegime(bus);
    this.earth.object3d.scale.setScalar(EARTH_RADIUS_AU);
    scene.add(this.earth.object3d);

    // comets ride a group rebased by -camWorld each frame; they home on Earth's
    // absolute heliocentric position and emit ImpactEvents the EarthRegime consumes.
    scene.add(this.cometGroup);
    this.comets = new CometField(this.cometGroup, bus, (out, seconds) => planetPosition(EARTH_DATA, seconds, out));

    // reference rings centred on the Sun, in the ecliptic plane, fading by zoom band
    const RINGS = [
      { r: 30, name: 'Neptune’s orbit' },
      { r: 63241, name: '1 light-year' },
      { r: 1e5, name: 'Oort cloud' },
      { r: 4.246 * AU_PER_LY, name: 'Proxima Centauri' },
    ];
    this.rings = RINGS.map((ref) => {
      const pts: Vector3[] = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        pts.push(new Vector3(Math.cos(a) * ref.r, 0, Math.sin(a) * ref.r));
      }
      const line = new LineLoop(new BufferGeometry().setFromPoints(pts), new LineBasicMaterial({ color: 0x3a4a6a, transparent: true, opacity: 0.5 }));
      scene.add(line);
      const label = makeLabel(ref.name, 0x7a90c0, 0.026);
      scene.add(label);
      return { line, label, r: ref.r };
    });

    // ---- f64 orbit camera input (the proven zoomDemo rig) ----
    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => { this.dragging = true; this.lx = e.clientX; this.ly = e.clientY; });
    window.addEventListener('pointerup', () => { this.dragging = false; });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw -= (e.clientX - this.lx) * 0.005;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch + (e.clientY - this.ly) * 0.005));
      this.lx = e.clientX;
      this.ly = e.clientY;
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.targetLog = Math.max(this.minLog, Math.min(this.MAX_LOG, this.targetLog + Math.sign(e.deltaY) * 0.18));
    }, { passive: false });
  }

  private dot(size: number, color: Color): Sprite {
    const s = new Sprite(new SpriteMaterial({ map: dotTexture(), color, sizeAttenuation: false, depthTest: false, transparent: true }));
    s.scale.set(size, size, 1);
    s.renderOrder = 1;
    this.scene.add(s);
    return s;
  }

  private addBody(world: Vector3, name: string, color: Color, kind: Body['kind'], dotSize: number): void {
    const label = makeLabel(name, color.getHex(), kind === 'star' ? 0.03 : 0.038);
    this.scene.add(label);
    this.bodies.push({ world, dot: this.dot(dotSize, color), label, kind });
  }

  /** Drive one frame of the unified world: simulate, rebase to the camera, declutter. */
  update(_clock: SimClock, realDt: number): void {
    // the civilization (and Earth's globe/moon/sunlight) advances EVERY frame at any
    // zoom — a living world (owner decision), not just when Earth is in view.
    this.earth.step(this.clock);
    // comets fly + home + strike every frame regardless of zoom band (the threat
    // doesn't pause when you look away). Impacts fan out on the bus to the Earth band.
    this.comets.step(this.clock);

    this.logDist += (this.targetLog - this.logDist) * Math.min(1, realDt * 7); // smooth zoom
    this.logDist = Math.max(this.minLog, Math.min(this.MAX_LOG, this.logDist));

    // re-place the planets along their true orbits at the sim clock's absolute time
    const seconds = this.clock.seconds;
    for (let i = 0; i < PLANETS.length; i++) planetPosition(PLANETS[i]!, seconds, this.bodies[i + 1]!.world);

    // the camera orbits + looks at the focus point (default the Sun at the origin)
    if (this.focusGet) this.focusWorld.copy(this.focusGet());
    const dist = 10 ** this.logDist;
    const cp = Math.cos(this.pitch);
    this.fo.camWorld.set(
      this.focusWorld.x + cp * Math.sin(this.yaw) * dist,
      this.focusWorld.y + Math.sin(this.pitch) * dist,
      this.focusWorld.z + cp * Math.cos(this.yaw) * dist,
    );

    // the galaxy cloud + comet field ride floating origin by translating their groups
    this.galaxy.group.position.set(-this.fo.camWorld.x, -this.fo.camWorld.y, -this.fo.camWorld.z);
    this.cometGroup.position.set(-this.fo.camWorld.x, -this.fo.camWorld.y, -this.fo.camWorld.z);

    // the Earth band: place the true-scale globe at Earth's heliocentric AU position,
    // shown only when the camera is close enough that the globe is more than a glint.
    const earthWorld = this.earthBody.world;
    this.fo.place(this.earth.object3d, earthWorld);
    const earthCamDist = earthWorld.distanceTo(this.fo.camWorld);
    const showGlobe = earthCamDist < EARTH_GLOBE_SHOW;
    this.earth.object3d.visible = showGlobe;

    // reference rings (centred on the Sun = origin), fading by zoom band
    for (const ring of this.rings) {
      this.fo.place(ring.line, ORIGIN);
      this.fo.place(ring.label, this.tmp.set(ring.r, 0, 0));
      const show = dist > ring.r * 0.04 && dist < ring.r * 14;
      ring.line.visible = show;
      ring.label.visible = show;
    }

    for (const b of this.bodies) {
      this.fo.place(b.dot, b.world);
      this.fo.place(b.label, b.world); // label is bottom-anchored → floats above the dot
      // declutter by zoom band
      if (b.kind === 'sun') {
        b.dot.visible = true;
        b.label.visible = true;
      } else if (b.kind === 'planet') {
        b.dot.visible = dist < 5e5;
        b.label.visible = dist < 6000;
      } else if (b === this.gcBody) {
        b.dot.visible = dist > 1e6;
        b.label.visible = dist > 5e6;
      } else {
        // nearest stars
        b.dot.visible = dist < 8e7;
        b.label.visible = dist > 3000 && dist < 8e7;
      }
    }
    // when the globe is shown, the glow-floor dot would punch through it (depthTest off)
    if (showGlobe) {
      this.earthBody.dot.visible = false;
      this.earthBody.label.visible = false;
    }

    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(this.fo.rel(this.focusWorld, this.tmp));
    this.camera.near = Math.max(dist * 1e-4, 1e-6);
    this.camera.far = Math.max(dist * 1e3, 1.5e10);
    this.camera.updateProjectionMatrix();
  }

  /** Orbit + look at a moving world point (e.g. a planet). `radius` sets how close
   *  the camera may approach. Pass null to return to the Sun at the origin. */
  focusOn(get: (() => Vector3) | null, radius: number): void {
    this.focusGet = get;
    this.minLog = Math.log10(Math.max(radius * 2.5, 1e-6));
    if (!get) this.focusWorld.set(0, 0, 0);
  }

  // ---- comet / defense facade (consumed by the HUD + DefenseGame in step 9) ----
  launchComet(): void {
    this.comets.launch();
  }

  setDefense(on: boolean): void {
    this.comets.setDefense(on);
  }

  deflectNearestComet(): DeflectResult {
    return this.comets.deflectNearest();
  }

  threatDistance(): number | null {
    return this.comets.nearestThreatDist();
  }

  cometCount(): number {
    return this.comets.count;
  }

  defenseStats(): DefenseStats {
    return this.comets.defenseStats;
  }

  // ---- debug / verification hooks (mirrors zoomDemo) ----
  /** absolute focus distance in AU */
  dist(): number {
    return 10 ** this.logDist;
  }

  /** jump the camera to a log-distance (and its zoom target) — for headless tests */
  setLogDist(v: number): void {
    this.logDist = this.targetLog = Math.max(this.minLog, Math.min(this.MAX_LOG, v));
  }

  setView(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = pitch;
  }

  /** focus the camera on Earth (for verification) */
  focusEarth(): void {
    this.focusOn(() => this.earthBody.world, EARTH_RADIUS_AU);
  }

  /** focus back on the Sun */
  focusSun(): void {
    this.focusOn(null, SUN_RADIUS_AU);
  }
}
