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
  Light,
  Line,
  LineBasicMaterial,
  LineLoop,
  Points,
  PointsMaterial,
  Quaternion,
  Sphere,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { PerspectiveCamera, Ray, Scene, WebGLRenderer } from 'three';
import type { SimClock } from '../core/clock';
import type { FocusTarget, InspectorInfo } from '../core/regime';
import type { PlanetData } from '../regimes/data/planets';
import type { WorldBus } from './bus';
import type { Breadcrumb, CosmicInfo, WorldFacade } from './facade';
import { blackbodyColor } from '../core/color';
import { mulberry32, gaussian } from '../core/rng';
import { dotTexture, glowTexture } from '../render/sprites';
import { makeLabel } from '../render/label';
import { planetPosition, orbitPath } from '../regimes/data/kepler';
import { PLANETS, SUN } from '../regimes/data/planets';
import { AU_M, AU_PER_LY, AU_PER_PC, EARTH_RADIUS_AU, SUN_RADIUS_AU } from '../meethos/units';
import { eclipticDirFromRaDec, galacticBasis, groundDir, altazDir } from '../meethos/frames';
import { FloatingOrigin } from '../meethos/floatingOrigin';
import { EarthRegime } from '../regimes/earth';
import { CometField } from '../regimes/comets';
import type { DeflectResult, DefenseStats } from '../regimes/comets';
import { StarSystemRegime } from '../regimes/starSystem';
import { SurfaceRegime } from '../regimes/surface';
import { CosmicWeb } from './cosmicWeb';
import { StarCatalog } from './starCatalog';
import { ConstellationFigures } from './constellationFigures';
import { MOONS, MOON_COUNTS, KM_PER_AU, moonLocalPosition, type MoonData } from '../data/moons';
import { OrbitalShell, SAT_SHOW_AU } from './orbitalShell';
import { planMission, transferArc, shipPosition, type MissionPlan } from '../core/mission';
import { GalaxyMerger } from './galaxyMerger';

const ORIGIN = new Vector3(0, 0, 0);
const KPC_AU = AU_PER_PC * 1e3; // AU per kiloparsec
const EARTH_IDX = PLANETS.findIndex((p) => p.id === 'earth'); // position in PLANETS
const EARTH_DATA = PLANETS[EARTH_IDX]!;
const EARTH_GLOBE_SHOW = 0.03; // AU — within this camera distance, the true-scale globe replaces the dot
const STAR_SYSTEM_ENTER = 800; // AU — fly this close to a named star and its system materializes
const COSMIC_WEB_SHOW = 2e10; // AU — beyond this zoom-out the galaxy is one node in the cosmic web
const OBSERVER_SOLAR_AU = 2000; // AU — within this the Sun/planets show as bodies (kept in sync with starCatalog)
const GAL_Z = new Vector3(0, 0, 1); // the galaxy spin group's LOCAL Z = galactic north
const GALACTIC_YEAR_SEC = 230e6 * 365.25 * 86_400; // the Sun's ~230 Myr galactic orbit
// the city band: the 72-unit SimCity tile sits in its own LOCAL sub-frame as a patch
// on the globe's pole (scaled so block geometry stays f32-clean, NOT raw AU vertices).
const CITY_TILE = 72; // SurfaceRegime's tile width in its local units
const CITY_LOCAL_SCALE = 0.1 / CITY_TILE; // tile spans ~0.1 of Earth's radius
const CITY_LAYER = 1; // the city's own lights are scoped here so they can't bleed onto space
const CITY_SHOW = EARTH_RADIUS_AU * 10; // earthCamDist (AU) within which the city patch is drawn
const CITY_RADIUS_AU = (CITY_TILE * 0.5) * CITY_LOCAL_SCALE * EARTH_RADIUS_AU; // for the city focus

/** deterministic seed from a star's name (FNV-1a) for procedural systems */
function seedFromName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** inspector rows for a solar-system planet */
function planetInfo(p: PlanetData): InspectorInfo {
  return {
    title: p.label,
    rows: [
      ['Orbit', `${p.a.toFixed(2)} AU`],
      ['Year', p.periodYears < 1 ? `${(p.periodYears * 365).toFixed(0)} d` : `${p.periodYears.toFixed(1)} yr`],
      ['Radius', `${p.radiusKm.toLocaleString()} km`],
      ['Moons', MOON_COUNTS[p.id] ? `${MOON_COUNTS[p.id]} known` : 'none'],
    ],
    blurb: p.blurb,
  };
}

/** inspector rows for a nearest star */
function starInfo(name: string, ly: number, k: number): InspectorInfo {
  const cls = k > 9000 ? 'A' : k > 6800 ? 'F' : k > 5300 ? 'G' : k > 3900 ? 'K' : 'M';
  return {
    title: name,
    rows: [['Distance', `${ly.toFixed(2)} ly`], ['Class', `${cls}-type · ${k.toLocaleString()} K`]],
    blurb: 'A real star in the solar neighbourhood — fly in to see its planets.',
  };
}

interface Body {
  world: Vector3; // absolute position in AU (f64)
  dot: Sprite;
  label: Sprite;
  kind: 'sun' | 'planet' | 'star' | 'moon';
}

/** inspector card for a moon */
function moonInfo(m: MoonData, parentLabel: string): InspectorInfo {
  const pd = m.periodDays;
  return {
    title: m.label,
    rows: [
      ['Orbits', `${parentLabel} · ${m.aKm.toLocaleString()} km`],
      ['Period', `${pd < 2 ? pd.toFixed(2) : pd.toFixed(1)} d${m.retrograde ? ' · retrograde' : ''}`],
      ['Radius', `${m.radiusKm.toLocaleString()} km`],
    ],
    blurb: m.blurb,
  };
}

// The Milky Way as a Points cloud in the SAME AU frame — barred spiral at physical
// size, oriented by the REAL galactic basis, Sun on the Orion arm at R0 ≈ 8.2 kpc.
// The disk points live GC-CENTRED in the galactic frame inside a `spin` group, so the
// galaxy can actually TURN: spin.quaternion = basis ⊗ roll(θ(t)), one revolution per
// ~230 Myr (the Sun's own galactic period — rigid rotation at the local rate, which
// keeps the solar neighbourhood co-moving with the static real-star catalogue).
function buildGalaxy(): { group: Group; centerWorld: Vector3; spin: Group } {
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
    // keep the point in the galactic frame, centred on the GC — the spin group's
    // transform (basis ⊗ time-varying roll, positioned at the GC) does the placing
    v.set(Math.cos(ang) * r, Math.sin(ang) * r, h);
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
  const centerWorld = new Vector3(0, 0, 0).sub(sunGal).applyMatrix4(M);
  const spin = new Group();
  spin.position.copy(centerWorld);
  spin.quaternion.setFromRotationMatrix(M); // the roll is composed on top each frame
  spin.add(points);
  group.add(spin);
  const bulge = new Sprite(new SpriteMaterial({ map: glowTexture(new Color(0xffe2a8)), blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
  bulge.scale.setScalar(5 * KPC_AU);
  bulge.position.copy(centerWorld); // on the rotation axis — no need to spin a sprite
  group.add(bulge);
  return { group, centerWorld, spin };
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

/** one row in the go-to search palette: a named destination + how to reach it. */
export interface SearchEntry {
  name: string;
  kind: 'planet' | 'moon' | 'sat' | 'star' | 'galaxy' | 'constellation';
  sub?: string; // secondary line, e.g. "8.6 ly · Canis Major"
  target?: FocusTarget; // a place to fly to (bodies/stars/galaxies)
  constellationId?: string; // a sky figure to aim at instead (IAU code)
}

export class UnifiedWorld implements WorldFacade {
  /** Camera-at-origin world rebasing — every body's f64 world position is placed
   *  relative to camWorld so only camera-relative f32 reaches the GPU. */
  readonly fo = new FloatingOrigin(new Vector3());

  private readonly bodies: Body[] = [];
  private readonly galaxy = buildGalaxy();
  // the disk's rotation: base orientation ⊗ a roll that advances with sim time
  private readonly galaxyBaseQ = this.galaxy.spin.quaternion.clone();
  private readonly galaxyRollQ = new Quaternion();
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

  // procedural / real planetary systems around the named stars — one pooled instance,
  // reconfigured for whichever star you've flown closest to (lazy materialization).
  private readonly starSystem = new StarSystemRegime();
  private readonly starBodies: { body: Body; name: string }[] = [];
  // the major moons: each rides its parent planet's absolute position every frame
  private readonly moonBodies: { m: MoonData; parent: Body; parentLabel: string; body: Body; target: FocusTarget }[] = [];
  // Layer 6: Earth's orbital shell — named craft + debris clouds (constructed after earthBody)
  private readonly orbitalShell: OrbitalShell;
  // Layer 8: an active mission — the transfer arc + the ship riding it on sim time
  private mission: MissionPlan | null = null;
  private missionArcPts: Vector3[] | null = null;
  private missionLine: Line | null = null;
  private missionShip: Sprite | null = null;
  private readonly missionShipWorld = new Vector3();
  private missionArrivedFired = false;
  /** fired once when the ship's time-fraction crosses 1 (the arrival) */
  onMissionArrived?: (plan: MissionPlan) => void;
  private activeStarName: string | null = null;

  // the city — Earth's innermost band: a SimCity tile as a patch on the globe's pole,
  // reused verbatim (terrain, roads, sprawl, comet-razing). Its lights are layer-scoped
  // and its whole subtree is hidden until you descend, so it can never light space.
  private readonly surface: SurfaceRegime;
  private readonly cityFocusTmp = new Vector3();

  // the Cosmos band — the cosmic web of galaxies with the Milky Way at the origin.
  // Rides the floating origin like the galaxy; shown only when zoomed out past it.
  private readonly cosmicWeb = new CosmicWeb();

  // the REAL naked-eye sky — ~8,900 HYG stars at true positions, rendered by apparent
  // magnitude and re-projectable from any observer. Loaded async (appears when ready).
  private readonly starCatalog = new StarCatalog();
  private readonly constellations = new ConstellationFigures();

  // Layer 3 — the Milky Way × Andromeda merger (a live restricted N-body sim), shown
  // as a self-contained Cosmos-band overlay when toggled.
  private readonly merger = new GalaxyMerger();
  private mergerMode = false;

  // Layer 4 — route planner: an ordered list of waypoints (bodies/stars), a 3D path
  // line, distance + relativistic travel time, and a "fly the route" journey.
  private readonly route: { label: string; get: () => Vector3 }[] = [];
  private routeLine: Line | null = null;
  private routeSpeedC = 100; // travel speed in multiples of c (>1 = warp)
  private flyActive = false;
  private flyT = 0; // position along the polyline: 0 … route.length−1
  private readonly flyDuration = 11; // wall-clock seconds for the whole journey
  private readonly flyPos = new Vector3();
  /** notify the route panel when waypoints/speed/fly state change */
  onRouteChange?: () => void;

  // ---- fly-to: an animated go-to that glides the orbit camera to a destination,
  // pulling back to frame the whole hop mid-flight (a "Powers of Ten" arc) so a jump
  // across any scale gap reads as travel, not a teleport. Distinct from the route fly.
  private flyToActive = false;
  private flyToT = 0; // 0 → 1 over the flight
  private flyToDur = 1.6; // seconds, scaled per hop
  private flyToTarget: FocusTarget | null = null;
  private readonly flyToFrom = new Vector3(); // look-at point at flight start
  private readonly flyToTo = new Vector3(); // destination look-at (re-sampled each frame)
  private flyToLogStart = 0;
  private flyToLogEnd = 0;
  private flyToLogPeak = 0; // mid-flight pull-back log-distance

  // f64 orbit camera rig (yaw/pitch/log-distance) around a movable focus point
  private yaw = 0.6;
  private pitch = 0.5;
  private logDist = Math.log10(3); // start a few AU out (inner solar system)
  private targetLog = this.logDist;
  private minLog = Math.log10(SUN_RADIUS_AU * 2.5); // closest approach — set per focus body
  private readonly MAX_LOG = Math.log10(5e12); // out to the cosmic web (~30 Mpc framing)

  // camera focus: orbit + look at this world point (default the Sun at the origin);
  // focusGet, when set, re-reads a moving body's position every frame.
  private readonly focusWorld = new Vector3();
  private focusGet: (() => Vector3) | null = null;

  // observer mode ("stand here, look out"): when observerGet is set, the camera sits AT
  // that world point and free-looks (yaw/pitch = look direction, wheel = fov), and the
  // star catalog re-projects apparent magnitudes from there. null = normal orbit mode.
  private observerGet: (() => Vector3) | null = null;
  private observerLabel = '';
  private readonly observerWorld = new Vector3();
  private fov = 55;

  // screen-space label declutter: each label sprite with a static priority; every
  // frame the visible ones are projected and lower-priority labels that collide with
  // a higher-priority one are hidden (re-evaluated each frame, so it never sticks).
  // `world` entries store an absolute-AU position (cosmic-web labels nested in a group
  // that rides −camWorld) and must be rebased with fo.rel() before projecting.
  private readonly labelEntries: { sprite: Sprite; priority: number; world?: boolean; nestedIn?: Group }[] = [];
  private readonly projTmp = new Vector3();
  /** max persistent labels the declutter keeps (0 = hover-only "explorer" mode) */
  private maxLabels = 12;
  /** the object the pointer is hovering — its name is always shown (hoverLabel) */
  private hoveredTarget: FocusTarget | null = null;
  private hoverLabel: Sprite | null = null;
  /** highlighted orbit ellipse for the hovered/selected planet (great in pause) */
  private orbitLine: LineLoop | null = null;
  private orbitBodyId: string | null = null;
  private orbitCenter: Body | null = null; // null = heliocentric (planet); a body = its moon's parent

  // ---- WorldFacade state (the band/inspector/picking surface the HUD talks to) ----
  /** all selectable major bodies (Sun, planets, stars, GC), positions in absolute AU */
  private readonly pickables: FocusTarget[] = [];
  private focusTarget!: FocusTarget; // the currently focused body (set in the constructor)
  private selectedTarget: FocusTarget | null = null; // a clicked catalogue star (inspect w/o flying)
  private lastBandId = '';
  onChange?: () => void;
  private readonly focusGetTmp = new Vector3();
  private readonly goToTmp = new Vector3();
  private readonly groundTmp = new Vector3(); // ground-observer position scratch
  private readonly idTmp = new Vector3(); // sky-identification scratch
  private readonly pickWorld = new Vector3();
  private readonly pickHit = new Vector3();
  private readonly pickSphere = new Sphere();

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
      this.starBodies.push({ body: this.bodies[this.bodies.length - 1]!, name: s.name });
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

    // the major moons — real orbits around their parents' absolute positions. Luna's
    // parameters also configure the EarthRegime's visual moon MESH (same formula, same
    // numbers → the lit mesh and the pickable dot coincide): the true 60.3-Earth-radii
    // gulf replaces the legacy band's stylized close-in moon.
    const luna = MOONS.find((m) => m.id === 'luna')!;
    this.earth.configureMoon(
      (luna.aKm * 1000) / AU_M / EARTH_RADIUS_AU, // orbit radius in globe(=Earth) radii
      luna.incDeg,
      luna.periodDays * 86_400,
      (luna.phaseDeg * Math.PI) / 180,
    );
    for (const m of MOONS) {
      const pIdx = PLANETS.findIndex((p) => p.id === m.planetId);
      const parent = this.bodies[pIdx + 1]!; // bodies[0] is the Sun
      this.addBody(moonLocalPosition(m, 0, new Vector3()).add(parent.world), m.label, new Color(m.color), 'moon', 0.008);
      const body = this.bodies[this.bodies.length - 1]!;
      this.moonBodies.push({
        m, parent, parentLabel: PLANETS[pIdx]!.label, body,
        target: {
          id: m.id, label: m.label, radius: Math.max((m.radiusKm * 1000) / AU_M, 1e-8),
          position: (out) => out.copy(body.world),
          info: () => moonInfo(m, PLANETS[pIdx]!.label),
        },
      });
    }

    // Layer 6: the orbital shell — ISS/Hubble/GPS/GEO + the debris population, all
    // Earth-centred; the group is placed at Earth's camera-relative position each frame
    this.orbitalShell = new OrbitalShell(() => this.earthBody.world);
    scene.add(this.orbitalShell.group);

    // comets ride a group rebased by -camWorld each frame; they home on Earth's
    // absolute heliocentric position and emit ImpactEvents the EarthRegime consumes.
    scene.add(this.cometGroup);
    this.comets = new CometField(this.cometGroup, bus, (out, seconds) => planetPosition(EARTH_DATA, seconds, out));

    // one pooled star-system orrery, materialized on approach (see update())
    this.starSystem.object3d.visible = false;
    scene.add(this.starSystem.object3d);

    // the cosmic web — shown only at the Cosmos band, rides the floating origin
    this.cosmicWeb.group.visible = false;
    scene.add(this.cosmicWeb.group);

    // the real naked-eye sky — loads async, then appears (observer defaults to Earth)
    scene.add(this.starCatalog.group);
    void this.starCatalog.load();

    // constellation figures — a fixed-direction celestial sphere (NOT rebased); shown only
    // in observer mode when a constellation is selected. Camera sits at origin, so the
    // lines render at their sky directions and align with the catalogue stars.
    scene.add(this.constellations.group);

    // the galaxy-merger overlay (hidden until toggled)
    this.merger.group.visible = false;
    scene.add(this.merger.group);

    // the city band — a child of the Earth group (so it rides Earth's position/scale),
    // a small patch on the globe's pole. Scope its lights to CITY_LAYER and put its
    // meshes on both layers so only the city is lit by them (no bleed onto the globe).
    this.surface = new SurfaceRegime(bus);
    this.surface.object3d.traverse((o) => {
      if (o instanceof Light) o.layers.set(CITY_LAYER); // light ONLY the city
      else o.layers.enable(CITY_LAYER); // meshes keep layer 0 (camera) + gain layer 1 (lit)
    });
    this.surface.object3d.scale.setScalar(CITY_LOCAL_SCALE);
    this.surface.object3d.position.set(0, 1, 0); // on the globe surface (radius 1 in earth-local)
    this.surface.object3d.visible = false;
    this.earth.object3d.add(this.surface.object3d);

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
      if (this.observerGet) {
        this.fov = Math.max(6, Math.min(75, this.fov + Math.sign(e.deltaY) * 4)); // zoom the sky
      } else {
        this.cancelFlyTo(); // grabbing the zoom wheel ends a flight (hands off to the destination)
        this.targetLog = Math.max(this.minLog, Math.min(this.MAX_LOG, this.targetLog + Math.sign(e.deltaY) * 0.18));
      }
    }, { passive: false });

    this.buildPickables();
    this.buildLabelEntries();
  }

  /** assign each label a static declutter priority (Sun > Earth > inner planets >
   *  outer planets > stars > galactic centre > rings), highest first. */
  private buildLabelEntries(): void {
    this.bodies.forEach((b, i) => {
      let priority: number;
      if (b.kind === 'sun') priority = 100;
      else if (b === this.earthBody) priority = 90;
      else if (b.kind === 'planet') priority = 60 - i; // inner planets (lower index) win
      else if (b === this.gcBody) priority = 35;
      else if (b.kind === 'moon') priority = 30; // only visible near their parent anyway
      else priority = 40; // nearest stars
      this.labelEntries.push({ sprite: b.label, priority });
    });
    for (const r of this.rings) this.labelEntries.push({ sprite: r.label, priority: 25 });
    // craft labels: below moons — they respect the density slider + collide-resolve.
    // They live INSIDE the shell group (Earth-local coords), so the declutter pass
    // offsets by the group's position to get camera-relative.
    for (const l of this.orbitalShell.labels()) this.labelEntries.push({ sprite: l, priority: 22, nestedIn: this.orbitalShell.group });
    // cosmic-web Local Group labels (Andromeda first); only live at the Cosmos band
    this.cosmicWeb.localGroupLabels().forEach((label, i) => this.labelEntries.push({ sprite: label, priority: 46 - i * 2, world: true }));
    this.labelEntries.sort((a, b) => b.priority - a.priority);
  }

  /** hide labels that collide in screen space with an already-kept higher-priority one */
  private declutterLabels(): void {
    this.camera.updateMatrixWorld();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cosmosVisible = this.cosmicWeb.group.visible;
    const keptX: number[] = [];
    const keptY: number[] = [];
    for (const e of this.labelEntries) {
      const s = e.sprite;
      if (e.world) {
        if (!cosmosVisible) continue; // cosmic-web labels only matter at the Cosmos band
        this.fo.rel(s.position, this.projTmp); // absolute AU → camera-relative
      } else if (e.nestedIn) {
        if (!s.visible || !e.nestedIn.visible) continue; // group-local → camera-relative
        this.projTmp.copy(s.position).add(e.nestedIn.position);
      } else {
        if (!s.visible) continue;
        this.projTmp.copy(s.position);
      }
      this.projTmp.project(this.camera);
      if (this.projTmp.z > 1) { s.visible = false; continue; } // behind the camera
      const sx = (this.projTmp.x * 0.5 + 0.5) * w;
      const sy = (1 - (this.projTmp.y * 0.5 + 0.5)) * h;
      let overlap = false;
      for (let k = 0; k < keptX.length; k++) {
        if (Math.abs(keptX[k]! - sx) < 78 && Math.abs(keptY[k]! - sy) < 15) { overlap = true; break; }
      }
      // hide over the density cap OR on overlap (the hover label is separate + always on)
      if (overlap || keptX.length >= this.maxLabels) s.visible = false;
      else { keptX.push(sx); keptY.push(sy); }
    }
  }

  /** drive the merger overlay: advance the sim, hide the normal scene, frame the collision */
  private updateMerger(realDt: number): void {
    // advance the merger at ~0.55 Gyr/s, respecting pause, and stop once fully merged
    if (!this.clock.paused && this.merger.timeGyr < 8) this.merger.step(realDt * 0.55);

    // everything else is hidden — the merger owns the view
    this.galaxy.group.visible = false;
    this.cosmicWeb.group.visible = false;
    this.starCatalog.group.visible = false;
    this.starSystem.object3d.visible = false;
    this.earth.object3d.visible = false;
    this.surface.object3d.visible = false;
    this.orbitalShell.group.visible = false;
    for (const b of this.bodies) { b.dot.visible = false; b.label.visible = false; }
    for (const ring of this.rings) { ring.line.visible = false; ring.label.visible = false; }
    if (this.orbitLine) this.orbitLine.visible = false;
    if (this.hoverLabel) this.hoverLabel.visible = false;
    this.merger.group.visible = true;

    // orbit the merger (centred on the origin) with the normal yaw/pitch/log rig
    this.logDist += (this.targetLog - this.logDist) * Math.min(1, realDt * 7);
    const dist = 10 ** this.logDist;
    const cp = Math.cos(this.pitch);
    this.fo.camWorld.set(cp * Math.sin(this.yaw) * dist, Math.sin(this.pitch) * dist, cp * Math.cos(this.yaw) * dist);
    this.merger.group.position.set(-this.fo.camWorld.x, -this.fo.camWorld.y, -this.fo.camWorld.z);

    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(this.fo.rel(ORIGIN, this.tmp));
    this.camera.fov = 55;
    this.camera.near = Math.max(dist * 1e-4, 1e-6);
    this.camera.far = Math.max(dist * 1e3, 1.5e10);
    this.camera.updateProjectionMatrix();
  }

  /** toggle the Milky Way × Andromeda merger overlay (Layer 3) */
  toggleMerger(): void {
    this.mergerMode = !this.mergerMode;
    if (this.mergerMode) {
      this.exitObserver();
      this.clearMission(); // the merger owns the view — no stale arc/ship
      this.merger.reset();
      this.focusSun();
      this.targetLog = Math.log10(this.merger.frameAu);
      this.logDist = this.targetLog; // snap so the collision is framed immediately
    } else {
      this.merger.group.visible = false;
      this.galaxy.group.visible = true; // the normal update never re-shows this
    }
    this.onChange?.();
  }

  get mergerActive(): boolean {
    return this.mergerMode;
  }

  // ---- Layer 4: route planner ----

  /** add a body/star to the end of the route (its position tracks if it moves) */
  addWaypoint(target: FocusTarget): void {
    const t = target;
    this.route.push({ label: t.label, get: () => t.position(new Vector3()) });
    this.rebuildRouteLine();
    this.onRouteChange?.();
  }

  removeLastWaypoint(): void {
    this.route.pop();
    this.rebuildRouteLine();
    this.onRouteChange?.();
  }

  clearRoute(): void {
    this.route.length = 0;
    this.flyActive = false;
    this.rebuildRouteLine();
    this.onRouteChange?.();
  }

  routeLabels(): string[] {
    return this.route.map((w) => w.label);
  }

  setRouteSpeed(c: number): void {
    this.routeSpeedC = c;
    this.onRouteChange?.();
  }

  /** total distance + travel time at the current speed (relativistic below light speed) */
  routeStats(): { totalLy: number; earthYears: number; shipYears: number; legs: number } {
    let ly = 0;
    let prev: Vector3 | null = null;
    for (const w of this.route) {
      const p = w.get();
      if (prev) ly += prev.distanceTo(p) / AU_PER_LY;
      prev = p;
    }
    const v = this.routeSpeedC;
    const earthYears = v > 0 ? ly / v : 0;
    const shipYears = v < 1 ? earthYears * Math.sqrt(Math.max(0, 1 - v * v)) : earthYears; // FTL: no dilation
    return { totalLy: ly, earthYears, shipYears, legs: Math.max(0, this.route.length - 1) };
  }

  get flying(): boolean {
    return this.flyActive;
  }

  /** 0..1 fraction of the route travelled (for the panel readout) */
  get flyProgress(): number {
    return this.route.length > 1 ? this.flyT / (this.route.length - 1) : 0;
  }

  startFly(): void {
    if (this.route.length < 2) return;
    this.exitObserver();
    this.mergerMode = false;
    this.flyActive = true;
    this.flyT = 0;
    // observer camera sits at the (moving) travel position; advanceFly aims it
    this.viewFrom(() => this.flyPos, 'route');
  }

  stopFly(): void {
    this.flyActive = false;
    this.exitObserver();
    this.onRouteChange?.();
  }

  /** advance the fly position along the route and aim the look toward the destination */
  private advanceFly(realDt: number): void {
    const segTotal = Math.max(1, this.route.length - 1);
    this.flyT += (realDt / this.flyDuration) * segTotal;
    if (this.flyT >= segTotal) {
      this.flyT = segTotal;
      this.flyActive = false;
      this.exitObserver();
      this.onRouteChange?.();
      return;
    }
    const i = Math.min(Math.floor(this.flyT), segTotal - 1);
    const a = this.route[i]!.get();
    const b = this.route[i + 1]!.get();
    this.flyPos.lerpVectors(a, b, this.flyT - i);
    // aim the observer free-look along the travel direction (toward b)
    const dx = b.x - this.flyPos.x, dy = b.y - this.flyPos.y, dz = b.z - this.flyPos.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    this.yaw = Math.atan2(-dx / len, -dz / len);
    this.pitch = Math.asin(Math.max(-1, Math.min(1, -dy / len)));
  }

  private rebuildRouteLine(): void {
    if (this.routeLine) {
      this.scene.remove(this.routeLine);
      this.routeLine.geometry.dispose();
      (this.routeLine.material as LineBasicMaterial).dispose();
      this.routeLine = null;
    }
    if (this.route.length < 2) return;
    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(new Float32Array(this.route.length * 3), 3));
    this.routeLine = new Line(geom, new LineBasicMaterial({ color: 0x6effc8, transparent: true, opacity: 0.85, depthTest: false }));
    this.routeLine.renderOrder = 4;
    this.scene.add(this.routeLine);
  }

  /** each frame: refresh the route line's vertices to the current waypoint positions */
  private updateRouteLine(): void {
    if (!this.routeLine || this.route.length < 2) return;
    const arr = this.routeLine.geometry.getAttribute('position') as BufferAttribute;
    const a = arr.array as Float32Array;
    for (let i = 0; i < this.route.length; i++) {
      const p = this.route[i]!.get();
      a[i * 3] = p.x - this.fo.camWorld.x;
      a[i * 3 + 1] = p.y - this.fo.camWorld.y;
      a[i * 3 + 2] = p.z - this.fo.camWorld.z;
    }
    arr.needsUpdate = true;
    this.routeLine.visible = true;
  }

  /** label density from the bottom-left slider (0 = hover-only "explorer" mode). */
  setMaxLabels(n: number): void {
    this.maxLabels = Math.max(0, n);
  }

  /** the pointer-hovered object; its name is always shown regardless of density. */
  setHovered(target: FocusTarget | null): void {
    if ((target?.id ?? null) === (this.hoveredTarget?.id ?? null)) return;
    this.hoveredTarget = target;
    if (this.hoverLabel) {
      this.scene.remove(this.hoverLabel);
      const mat = this.hoverLabel.material as SpriteMaterial;
      mat.map?.dispose();
      mat.dispose();
      this.hoverLabel = null;
    }
    if (target) {
      this.hoverLabel = makeLabel(target.label, 0xbfe8ff, 0.042);
      this.hoverLabel.renderOrder = 5;
      this.scene.add(this.hoverLabel);
    }
  }

  /** highlight the orbit path of the hovered body (else the focused one) — a projected
   *  arc drawn on top so it reads even in pause. Planets get their heliocentric Kepler
   *  ellipse; moons get their tilted circle around the parent. Rebuilt only on change. */
  private updateOrbitHighlight(): void {
    // the hovered body wins if it has a drawable orbit; else fall back to the focus
    let planet: PlanetData | undefined;
    let moon: (typeof this.moonBodies)[number] | undefined;
    for (const id of [this.hoveredTarget?.id, this.focusTarget.id]) {
      if (!id) continue;
      planet = PLANETS.find((p) => p.id === id);
      moon = this.moonBodies.find((mb) => mb.m.id === id);
      if (planet || moon) break;
    }
    const useId = moon ? moon.m.id : planet?.id;
    if (!useId) {
      this.orbitBodyId = null;
      if (this.orbitLine) this.orbitLine.visible = false;
      return;
    }
    if (this.orbitBodyId !== useId) {
      this.orbitBodyId = useId;
      if (this.orbitLine) {
        this.scene.remove(this.orbitLine);
        this.orbitLine.geometry.dispose();
        (this.orbitLine.material as LineBasicMaterial).dispose();
      }
      let pts: Vector3[];
      if (moon) {
        // one full period sampled through the same propagator = the exact drawn path
        const periodSec = moon.m.periodDays * 86_400;
        pts = Array.from({ length: 128 }, (_, i) => moonLocalPosition(moon.m, (i / 128) * periodSec, new Vector3()));
        this.orbitCenter = moon.parent;
      } else {
        pts = orbitPath(planet!, 256);
        this.orbitCenter = null;
      }
      const geom = new BufferGeometry().setFromPoints(pts);
      this.orbitLine = new LineLoop(geom, new LineBasicMaterial({ color: 0x6fd3ff, transparent: true, opacity: 0.75, depthTest: false }));
      this.orbitLine.renderOrder = 3;
      this.scene.add(this.orbitLine);
    }
    // heliocentric ellipse rebases to the Sun; a moon's circle rides its (moving) parent
    this.fo.place(this.orbitLine!, this.orbitCenter ? this.orbitCenter.world : ORIGIN);
    this.orbitLine!.visible = true;
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
    this.surface.step(this.clock); // the city sprawls every frame too (and rebuilds after strikes)
    // comets fly + home + strike every frame regardless of zoom band (the threat
    // doesn't pause when you look away). Impacts fan out on the bus to the Earth band.
    this.comets.step(this.clock);

    // Layer 3: the merger overlay owns the whole view when active
    if (this.mergerMode) { this.updateMerger(realDt); return; }
    // Layer 4: advance the route fly-through (drives the observer camera via flyPos)
    if (this.flyActive) this.advanceFly(realDt);

    if (this.flyToActive) {
      this.advanceFlyTo(realDt); // drives logDist + focusWorld along the flight arc
    } else {
      this.logDist += (this.targetLog - this.logDist) * Math.min(1, realDt * 7); // smooth zoom
      this.logDist = Math.max(this.minLog, Math.min(this.MAX_LOG, this.logDist));
    }

    // re-place the planets along their true orbits at the sim clock's absolute time
    const seconds = this.clock.seconds;
    for (let i = 0; i < PLANETS.length; i++) planetPosition(PLANETS[i]!, seconds, this.bodies[i + 1]!.world);
    // moons ride their parents (Luna's identical parameters also drive the regime's mesh)
    for (const mb of this.moonBodies) moonLocalPosition(mb.m, seconds, mb.body.world).add(mb.parent.world);
    // Layer 8: the mission ship rides its transfer arc on sim time
    this.updateMission(seconds);

    const observer = this.observerGet !== null;
    const dist = 10 ** this.logDist;
    const cp = Math.cos(this.pitch);
    if (observer) {
      // camera sits AT the observer; re-project the sky's apparent magnitudes from here
      this.observerWorld.copy(this.observerGet!());
      this.fo.camWorld.copy(this.observerWorld);
      this.starCatalog.setObserver(this.observerWorld);
    } else {
      // the camera orbits + looks at the focus point (default the Sun at the origin)
      if (this.focusGet) this.focusWorld.copy(this.focusGet());
      this.fo.camWorld.set(
        this.focusWorld.x + cp * Math.sin(this.yaw) * dist,
        this.focusWorld.y + Math.sin(this.pitch) * dist,
        this.focusWorld.z + cp * Math.cos(this.yaw) * dist,
      );
    }

    // the galaxy TURNS — one revolution per ~230 Myr (the Sun's own galactic period;
    // rigid rotation at the local rate keeps the solar neighbourhood co-moving with
    // the static real-star catalogue). Clockwise seen from the north galactic pole.
    this.galaxyRollQ.setFromAxisAngle(GAL_Z, (-2 * Math.PI * seconds) / GALACTIC_YEAR_SEC);
    this.galaxy.spin.quaternion.copy(this.galaxyBaseQ).multiply(this.galaxyRollQ);

    // the galaxy cloud + comet field ride floating origin by translating their groups
    this.galaxy.group.position.set(-this.fo.camWorld.x, -this.fo.camWorld.y, -this.fo.camWorld.z);
    this.cometGroup.position.set(-this.fo.camWorld.x, -this.fo.camWorld.y, -this.fo.camWorld.z);
    this.updateRouteLine(); // the planned route path (camera-relative)

    // the cosmic web: Big-Bang formation runs whenever active; shown + rebased only
    // at the Cosmos band (zoomed out past the galaxy) — never in observer mode.
    this.cosmicWeb.step(realDt);
    const showCosmos = !observer && dist > COSMIC_WEB_SHOW;
    this.cosmicWeb.group.visible = showCosmos;
    if (showCosmos) this.cosmicWeb.group.position.set(-this.fo.camWorld.x, -this.fo.camWorld.y, -this.fo.camWorld.z);

    // the real naked-eye sky rides the floating origin too; hide it at the Cosmos band
    // (the cosmic web takes over and the local stars collapse to the origin).
    this.starCatalog.group.visible = !showCosmos;
    if (!showCosmos) this.starCatalog.group.position.set(-this.fo.camWorld.x, -this.fo.camWorld.y, -this.fo.camWorld.z);

    // constellation figures ride no origin (they are directions): shown only when observing
    // and a constellation is selected — from Earth/near-Sun they lie on the real stars.
    this.constellations.group.visible = observer && this.constellations.active !== null;

    // the Earth band: place the true-scale globe at Earth's heliocentric AU position,
    // shown only when the camera is close enough that the globe is more than a glint.
    const earthWorld = this.earthBody.world;
    this.fo.place(this.earth.object3d, earthWorld);
    const earthCamDist = earthWorld.distanceTo(this.fo.camWorld);
    const showGlobe = earthCamDist < EARTH_GLOBE_SHOW;
    this.earth.object3d.visible = showGlobe;
    // the city band: only drawn when you've descended near the surface (and only then
    // are its layer-scoped lights live — an invisible subtree contributes no light).
    this.surface.object3d.visible = showGlobe && earthCamDist < CITY_SHOW;

    // Layer 6: the orbital shell rides Earth — debris clouds fade in on approach,
    // named-craft dots closer (setVisibility's two bands)
    this.orbitalShell.step(seconds, this.clock.dt);
    this.orbitalShell.setVisibility(earthCamDist);
    if (this.orbitalShell.group.visible) this.fo.place(this.orbitalShell.group, earthWorld);

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
      } else if (b.kind === 'moon') {
        // set in the moons pass below (visibility keys off the PARENT's distance)
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

    // star systems: materialize the orrery of whichever named star you've flown closest
    // to, reconfiguring (real exoplanets by host name, else procedural by seed) on change.
    let nearStar: { body: Body; name: string } | null = null;
    let nearStarD = Infinity;
    for (const sb of this.starBodies) {
      const d = sb.body.world.distanceTo(this.fo.camWorld);
      if (d < nearStarD) { nearStarD = d; nearStar = sb; }
    }
    if (!observer && nearStar && nearStarD < STAR_SYSTEM_ENTER) {
      if (nearStar.name !== this.activeStarName) {
        this.activeStarName = nearStar.name;
        this.starSystem.configure(seedFromName(nearStar.name), nearStar.name);
      }
      this.starSystem.step(this.clock);
      this.fo.place(this.starSystem.object3d, nearStar.body.world);
      this.starSystem.object3d.visible = true;
      nearStar.body.dot.visible = false; // the orrery's star sphere replaces the dot
      nearStar.body.label.visible = false;
    } else if (this.activeStarName !== null) {
      this.starSystem.object3d.visible = false;
      this.activeStarName = null;
    }

    // observer mode: the sky is the star catalog + galaxy; the game's glow-floor markers
    // and rings are hidden, except the Sun + planets stay visible while you're inside the
    // solar system (so Earth is a dot from Mars, but invisible from Alpha Centauri).
    if (observer) {
      const inSolar = this.fo.camWorld.length() < OBSERVER_SOLAR_AU;
      for (const b of this.bodies) {
        const local = b.kind === 'sun' || b.kind === 'planet';
        // "standing on it" = within 150 km — the old 1e-6 AU² (150,000 km!) wrongly
        // swallowed the PARENT planet when observing from a close-in moon (Mars from
        // Phobos at 9,376 km; Uranus from Miranda). Matches the moons pass below.
        const atCamera = b.world.distanceToSquared(this.fo.camWorld) < 1e-12;
        const vis = local && inSolar && !atCamera;
        b.dot.visible = vis;
        b.label.visible = vis;
      }
      for (const ring of this.rings) { ring.line.visible = false; ring.label.visible = false; }
      // standing ON Earth, the camera would sit inside the true-scale globe — hide it.
      // From anywhere else nearby (the Moon!) the lit globe IS the view: Earthrise.
      const onEarth = this.observerWorld.distanceToSquared(this.earthBody.world) < 1e-12;
      this.earth.object3d.visible = !onEarth && earthCamDist < EARTH_GLOBE_SHOW;
      this.surface.object3d.visible = false;
      if (this.earth.object3d.visible) {
        this.earthBody.dot.visible = false; // the globe replaces the marker dot
        this.earthBody.label.visible = false;
      }
    }

    // moons: shown only near their parent, scaled to each orbit (Callisto appears a
    // hundred Jupiter-radii out; Phobos only when you're hugging Mars). In observer
    // mode you see a system's moons only when standing WITHIN that system — Phobos and
    // Deimos from Mars, but no fake Galilean dots from Earth.
    for (const mb of this.moonBodies) {
      const b = mb.body;
      const aAU = mb.m.aKm / KM_PER_AU;
      const parentDist = mb.parent.world.distanceTo(this.fo.camWorld);
      const atCamera = b.world.distanceToSquared(this.fo.camWorld) < 1e-12; // standing on it
      const show = parentDist < Math.max(aAU * 50, observer ? 0.05 : 0) && !atCamera;
      b.dot.visible = show;
      b.label.visible = show;
      // up close, the true-scale Moon MESH takes over from the marker dot. 1e-3 keeps
      // the dot hidden at the fly-to landing frame (radius·60 ≈ 7e-4) — at 6e-4 the
      // marker sat superimposed on the lit Moon exactly where the flight ends.
      if (mb.m.id === 'luna' && this.earth.object3d.visible && b.world.distanceTo(this.fo.camWorld) < 1e-3) {
        b.dot.visible = false;
      }
    }

    // notify the HUD when the band changes so it rebuilds the breadcrumb/era
    const band = this.currentBandId();
    if (band !== this.lastBandId) {
      this.lastBandId = band;
      this.onChange?.();
    }

    this.camera.position.set(0, 0, 0);
    if (observer) {
      // free-look: yaw/pitch is the LOOK direction. Negated to match orbit mode's look
      // vector (focus − camWorld) so vertical drag feels the same across a 'v' toggle.
      this.camera.lookAt(-cp * Math.sin(this.yaw), -Math.sin(this.pitch), -cp * Math.cos(this.yaw));
      this.camera.fov = this.fov;
      // near = 150 m: a GROUND observer stands ~3 km above the mesh and needs the
      // terrain under their feet (the horizon!) to survive the near plane; 1e-6 AU
      // (150 km) also clipped Phobos from Mars. The log depth buffer keeps precision
      // workable across the huge near/far ratio.
      this.camera.near = 1e-9;
      this.camera.far = 1e14;
    } else {
      this.camera.lookAt(this.fo.rel(this.focusWorld, this.tmp));
      this.camera.fov = 55;
      this.camera.near = Math.max(dist * 1e-4, 1e-6);
      this.camera.far = Math.max(dist * 1e3, 1.5e10);
    }
    this.camera.updateProjectionMatrix();

    // the hover label always shows the hovered object's name (bypasses the density cap)
    if (this.hoveredTarget && this.hoverLabel) {
      this.fo.place(this.hoverLabel, this.hoveredTarget.position(this.tmp));
      this.hoverLabel.visible = true;
    }

    // orbit-path highlight (not in observer mode — you're looking at the sky there)
    if (observer) { if (this.orbitLine) this.orbitLine.visible = false; }
    else this.updateOrbitHighlight();

    this.declutterLabels(); // hide overlapping labels now the camera is final
  }

  /** Orbit + look at a moving world point (e.g. a planet). `radius` sets how close
   *  the camera may approach. Pass null to return to the Sun at the origin. */
  private setCameraFocus(get: (() => Vector3) | null, radius: number): void {
    this.flyToActive = false; // any explicit focus change (click, nav, dive) cancels a flight
    this.flyToTarget = null;
    this.focusGet = get;
    this.minLog = Math.log10(Math.max(radius * 2.5, 1e-6));
    if (!get) this.focusWorld.set(0, 0, 0);
  }

  // ---- comet / defense facade (WorldFacade — consumed by the HUD + DefenseGame) ----
  launchComet(): void {
    this.exitObserver(); // return to orbit so the incoming comet is viewable + deflectable
    this.comets.launch();
  }

  setDefenseMode(on: boolean): void {
    this.comets.setDefense(on);
  }

  /** frame the solar system where the comets are (a zoom, not a regime transition) */
  frameForDefense(): void {
    this.exitObserver(); // the defense game plays in orbit mode
    this.focusSun();
    this.targetLog = Math.log10(6); // ~6 AU — Earth's orbit + inbound comets in view
  }

  deflectComet(): DeflectResult {
    return this.comets.deflectNearest();
  }

  /** deflect the comet under a click ray. The ray is camera-relative (camera at the
   *  origin); shift it into absolute AU space where the comets live. */
  deflectCometAt(ray: Ray): DeflectResult {
    const r = ray.clone();
    r.origin.add(this.fo.camWorld);
    return this.comets.deflectAtRay(r);
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

  // ---- WorldFacade: bands, focus inspector, navigation, picking ----

  /** Build the selectable major bodies (Sun, planets, stars, GC) as FocusTargets with
   *  absolute-AU positions and inspector info. Earth/city/star-system rows delegate to
   *  the reused regimes' own focusTargets() so the inspector text stays identical. */
  private buildPickables(): void {
    const auRadius = (km: number): number => (km * 1000) / AU_M;
    // Sun
    this.pickables.push({
      id: 'sun', label: 'Sun', radius: SUN_RADIUS_AU,
      position: (out) => out.set(0, 0, 0),
      info: () => ({ title: 'Sun', rows: [['Type', 'G2V star'], ['Radius', '696,340 km']], blurb: SUN.blurb }),
    });
    // planets (Earth delegates to the EarthRegime inspector — Cities/Population/Era)
    PLANETS.forEach((p, i) => {
      const body = this.bodies[i + 1]!;
      this.pickables.push({
        id: p.id, label: p.label, radius: Math.max(auRadius(p.radiusKm), 1e-6),
        childRegime: p.childRegime,
        position: (out) => out.copy(body.world),
        info: (clock) => (p.id === 'earth' ? this.earth.focusTargets()[0]!.info(clock) : planetInfo(p)),
      });
    });
    // nearest stars
    this.starBodies.forEach((sb, i) => {
      const s = STARS[i]!;
      this.pickables.push({
        id: `star-${i}`, label: s.name, radius: 0.25,
        position: (out) => out.copy(sb.body.world),
        info: () => starInfo(s.name, s.ly, s.k),
      });
    });
    // galactic centre
    this.pickables.push({
      id: 'gc', label: 'Galactic Centre', radius: 0.5 * KPC_AU,
      position: (out) => out.copy(this.gcBody.world),
      info: () => ({ title: 'Galactic Centre', rows: [['Distance', '~8.2 kpc'], ['Object', 'Sgr A*']], blurb: 'The supermassive black hole at the heart of the Milky Way.' }),
    });
    this.focusTarget = this.pickables[0]!; // start focused on the Sun
  }

  /** the band the camera is currently in (matches the legacy regime ids) */
  private currentBandId(): string {
    if (this.activeStarName) return 'starsystem';
    const earthCamDist = this.earthBody.world.distanceTo(this.fo.camWorld);
    if (this.surface.object3d.visible) return 'surface';
    if (earthCamDist < EARTH_GLOBE_SHOW) return 'earth';
    const d = 10 ** this.logDist;
    if (d < 300) return 'solar';
    if (d < COSMIC_WEB_SHOW) return 'galaxy';
    return 'universe';
  }

  private static readonly BAND_LABEL: Record<string, string> = {
    universe: 'Cosmos', galaxy: 'Milky Way', solar: 'Solar System', earth: 'Earth', surface: 'City',
  };

  get active(): { readonly label: string } {
    if (this.mergerMode) return { label: 'Andromeda Merger' };
    if (this.observerGet) return { label: `◉ from ${this.observerLabel}` };
    const id = this.currentBandId();
    if (id === 'starsystem') return { label: this.activeStarName ?? 'Star System' };
    return { label: UnifiedWorld.BAND_LABEL[id] ?? 'Cosmos' };
  }

  get focus(): FocusTarget {
    return this.selectedTarget ?? this.focusTarget;
  }

  /** pick the nearest catalogue star at a screen point (NDC) — its rich card for the inspector */
  pickStar(ndcX: number, ndcY: number): FocusTarget | null {
    return this.starCatalog.pickTarget(ndcX, ndcY, this.camera, this.fo.camWorld);
  }

  /** select a catalogue star: show its card in the inspector without moving the camera */
  select(target: FocusTarget | null): void {
    this.selectedTarget = target;
    this.onChange?.();
  }

  breadcrumb(): Breadcrumb[] {
    const cur = this.currentBandId();
    if (cur === 'starsystem') {
      return [
        { id: 'galaxy', label: 'Cosmos', active: false },
        { id: 'galaxy', label: 'Milky Way', active: false },
        { id: 'starsystem', label: this.activeStarName ?? 'Star System', active: true },
      ];
    }
    return [
      ['universe', 'Cosmos'], ['galaxy', 'Milky Way'], ['solar', 'Solar System'], ['earth', 'Earth'], ['surface', 'City'],
    ].map(([id, label]) => ({ id: id!, label: label!, active: id === cur }));
  }

  /** fly to a named band (sets the smooth-zoom target + focus — no cross-fade) */
  goTo(id: string): void {
    this.exitObserver(); // navigation drives orbit mode, not the fixed observer camera
    switch (id) {
      case 'universe': this.focusSun(); this.targetLog = this.MAX_LOG; break;
      case 'galaxy': this.focusSun(); this.targetLog = Math.log10(7e8); break;
      case 'solar': this.focusSun(); this.targetLog = Math.log10(30); break;
      case 'earth': this.focusEarth(); this.targetLog = Math.log10(EARTH_RADIUS_AU * 8); break;
      case 'surface': this.focusCity(); this.targetLog = Math.log10(CITY_RADIUS_AU * 5); break;
      case 'starsystem': if (this.activeStarName) { this.focusStar(this.activeStarName); this.targetLog = Math.log10(6); } break;
    }
    this.onChange?.();
  }

  /** focus a body: orbit + look at it, and let the smooth-zoom keep the current dist */
  focusOn(target: FocusTarget): void {
    this.selectedTarget = null; // focusing a body clears a catalogue-star selection
    this.focusTarget = target;
    this.setCameraFocus(() => target.position(this.focusGetTmp), target.radius);
    this.onChange?.();
  }

  /** A flat, searchable catalogue of every named destination — the bodies (Sun,
   *  planets, Galactic Centre), the 14 nearest stars, the ~348 named HYG catalogue
   *  stars, and the Local Group galaxies. Rebuilt on demand so it picks up the
   *  asynchronously-loaded star catalogue; deduped so a hand-placed star (with its
   *  own orrery) wins over its bare catalogue point of the same name. */
  searchIndex(): SearchEntry[] {
    const out: SearchEntry[] = [];
    for (const t of this.pickables) {
      const kind: SearchEntry['kind'] =
        t.id === 'gc' ? 'galaxy' : t.id === 'sun' || t.id.startsWith('star-') ? 'star' : 'planet';
      out.push({ name: t.label, kind, target: t });
    }
    for (const mb of this.moonBodies) {
      out.push({ name: mb.m.label, kind: 'moon', sub: `moon of ${mb.parentLabel}`, target: mb.target });
    }
    for (const t of this.orbitalShell.craftTargets()) out.push({ name: t.label, kind: 'sat', sub: 'Earth orbit', target: t });
    for (const t of this.orbitalShell.shellTargets()) out.push({ name: t.label, kind: 'sat', sub: 'debris field', target: t });
    for (const g of this.cosmicWeb.searchTargets()) out.push({ name: g.label, kind: 'galaxy', target: g });
    const seen = new Set(out.map((e) => e.name.toLowerCase()));
    for (const s of this.starCatalog.namedTargets()) {
      if (seen.has(s.name.toLowerCase())) continue;
      seen.add(s.name.toLowerCase());
      out.push({ name: s.name, kind: 'star', sub: `${s.ly.toFixed(1)} ly · ${s.con}`, target: s.target });
    }
    // constellations: aim the sky at the real asterism figure, from Earth
    for (const c of this.constellations.list()) {
      out.push({ name: c.name, kind: 'constellation', sub: `figure · ${c.id}`, constellationId: c.id });
    }
    return out;
  }

  /** Jump the orbit camera to a searched destination: focus it and frame it at a
   *  sensible distance. `observe` instead drops into observer mode standing there,
   *  so the real sky re-projects from that vantage (Earth from Mars, M31 from home). */
  goToTarget(target: FocusTarget, observe = false): void {
    // if we're leaving observer mode, remember where we were STANDING so the flight
    // starts from that vantage — else frame 1 pops to the stale pre-observer orbit focus.
    const fromObserver = this.observerGet ? this.observerGet().clone() : null;
    this.exitObserver();
    this.mergerMode = false;
    this.flyActive = false;
    this.selectedTarget = null;
    if (observe) {
      this.viewFrom(() => target.position(this.goToTmp), target.label);
      return;
    }
    this.startFlyTo(target, fromObserver);
  }

  /** the framing distance a go-to settles at, in log10(AU) */
  private frameLog(target: FocusTarget): number {
    const end = target.id === 'sun' ? Math.log10(30) : Math.log10(target.radius * 60);
    const floor = Math.log10(Math.max(target.radius * 2.5, 1e-6));
    return Math.max(floor, Math.min(this.MAX_LOG, end));
  }

  /** Begin an animated flight to `target`: capture the current look-at + zoom, sample
   *  the destination, and set a mid-flight pull-back peak that frames the whole hop. */
  private startFlyTo(target: FocusTarget, from: Vector3 | null = null): void {
    // start point A: the observer vantage if we just left observer mode (the camera was
    // AT that point, close in), else the current orbit look-at + zoom.
    if (from) {
      this.flyToFrom.copy(from);
      this.flyToLogStart = Math.log10(0.02); // begin right beside where we stood
    } else {
      this.flyToFrom.copy(this.focusWorld);
      this.flyToLogStart = this.logDist;
    }
    target.position(this.flyToTo);
    this.flyToLogEnd = this.frameLog(target);
    // pull back far enough that both endpoints are in view at mid-flight, but never
    // tighter than where we start or end (a near hop barely lifts; a cosmic one soars).
    const sep = this.flyToFrom.distanceTo(this.flyToTo);
    const logSep = sep > 0 ? Math.min(this.MAX_LOG, Math.log10(sep)) : this.flyToLogStart;
    this.flyToLogPeak = Math.max(this.flyToLogStart, this.flyToLogEnd, logSep);
    const lift = this.flyToLogPeak - Math.max(this.flyToLogStart, this.flyToLogEnd);
    this.flyToDur = Math.min(3.4, 1.1 + lift * 0.28); // snappy for near hops, grand for cosmic
    this.flyToT = 0;
    this.flyToTarget = target;
    this.flyToActive = true;
    // reflect the destination in the inspector/breadcrumb now, but drive focusWorld
    // ourselves during the flight (no focusGet, so it isn't snapped to the target).
    this.focusTarget = target;
    this.focusGet = null;
    this.minLog = Math.log10(Math.max(target.radius * 2.5, 1e-6));
    this.onChange?.();
  }

  /** advance the flight one frame: glide the look-at A→B and arc the zoom out then in.
   *  The zoom runs as two smoothstep legs (start→peak, then peak→end) so it is bounded
   *  by the peak — a single sine hump on an asymmetric base can overshoot it. */
  private advanceFlyTo(realDt: number): void {
    const target = this.flyToTarget!;
    this.flyToT = Math.min(1, this.flyToT + realDt / this.flyToDur);
    const u = this.flyToT;
    const s = u * u * (3 - 2 * u); // eased look-at glide A→B
    target.position(this.flyToTo); // re-sample — the destination may be orbiting
    this.focusWorld.lerpVectors(this.flyToFrom, this.flyToTo, s);
    const h = u < 0.5 ? u / 0.5 : (u - 0.5) / 0.5; // 0→1 within the current leg
    const k = h * h * (3 - 2 * h);
    this.logDist = u < 0.5
      ? this.flyToLogStart + (this.flyToLogPeak - this.flyToLogStart) * k
      : this.flyToLogPeak + (this.flyToLogEnd - this.flyToLogPeak) * k;
    if (u >= 1) this.endFlyTo();
  }

  /** land the flight: hand off to normal orbit focus tracking the destination. */
  private endFlyTo(): void {
    const target = this.flyToTarget!;
    this.flyToActive = false;
    this.flyToTarget = null;
    this.setCameraFocus(() => target.position(this.focusGetTmp), target.radius);
    this.logDist = this.targetLog = this.flyToLogEnd;
    this.focusWorld.copy(target.position(this.focusGetTmp)); // no 1-frame pop before focusGet takes over
  }

  /** Abort a flight in progress WITHOUT snapping to the destination framing: hand orbit
   *  tracking to the destination body (so we never freeze on a mid-air point) and hold
   *  the current zoom. Used when the user grabs manual control (wheel) or enters observer
   *  mode mid-flight — both would otherwise leave focusGet null and focusWorld stale. */
  private cancelFlyTo(): void {
    if (!this.flyToActive) return;
    const target = this.flyToTarget;
    this.flyToActive = false;
    this.flyToTarget = null;
    if (target) {
      this.setCameraFocus(() => target.position(this.focusGetTmp), target.radius);
      this.targetLog = this.logDist; // hold current zoom; don't revert to the pre-flight target
    }
  }

  get flyingTo(): boolean {
    return this.flyToActive;
  }

  get flyToProgress(): number {
    return this.flyToT;
  }

  /** dive into a body = focus it and zoom in close (the unified analogue of descent) */
  diveInto(target: FocusTarget): void {
    this.focusOn(target);
    this.targetLog = Math.max(this.minLog, Math.log10(target.radius * 6));
  }

  /** every selectable body currently in play (adds nearby moons + the active star system) */
  pickTargets(): FocusTarget[] {
    if (this.currentBandId() === 'universe') return this.cosmicWeb.targets(); // galaxies, not planets
    // moons are pickable only when near their parent — mirrors their visibility, and keeps
    // a distant click on Jupiter from landing on an invisible Ganymede
    const out = [...this.pickables];
    for (const mb of this.moonBodies) {
      if (mb.parent.world.distanceTo(this.fo.camWorld) < (mb.m.aKm / KM_PER_AU) * 50) out.push(mb.target);
    }
    // named spacecraft: pickable only when their dots are shown (near Earth)
    if (this.earthBody.world.distanceTo(this.fo.camWorld) < SAT_SHOW_AU) out.push(...this.orbitalShell.craftTargets());
    if (!this.activeStarName) return out;
    const star = this.starBodies.find((s) => s.name === this.activeStarName);
    if (!star) return out;
    const origin = star.body.world;
    const local = this.starSystem.focusTargets().map<FocusTarget>((t) => ({
      id: t.id, label: t.label, radius: t.radius,
      position: (out2) => t.position(out2).add(origin),
      info: (clock) => t.info(clock),
    }));
    return [...out, ...local];
  }

  /** ray-pick the nearest body. The ray is camera-relative (camera at origin); shift
   *  it into absolute AU space and test against the targets' absolute positions. */
  pick(ray: Ray): FocusTarget | null {
    const r = ray.clone();
    r.origin.add(this.fo.camWorld);
    let best: FocusTarget | null = null;
    let bestDist = Infinity;
    for (const t of this.pickTargets()) {
      t.position(this.pickWorld);
      // never pick the body you're standing on (observing FROM a craft, its own pick
      // sphere would otherwise swallow every ray — the camera sits inside it)
      if (this.pickWorld.distanceToSquared(r.origin) < 1e-14) continue;
      const camDist = this.pickWorld.distanceTo(this.fo.camWorld);
      const pickRadius = Math.max(t.radius * 1.6, camDist * (t.pickAngle ?? 0.02)); // tiny true-scale bodies stay clickable
      this.pickSphere.set(this.pickWorld, pickRadius);
      if (r.intersectSphere(this.pickSphere, this.pickHit)) {
        const d = this.pickHit.distanceTo(r.origin);
        if (d < bestDist) { bestDist = d; best = t; }
      }
    }
    return best;
  }

  cosmicInfo(): CosmicInfo {
    // during the merger, drive the cosmic-time readout with the merger clock (0 → ~6 Gyr)
    if (this.mergerMode) return { atCosmos: true, forming: true, ageGyr: this.merger.timeGyr };
    return { atCosmos: this.currentBandId() === 'universe', forming: this.cosmicWeb.isForming, ageGyr: this.cosmicWeb.cosmicAgeGyr };
  }

  /** rewind to the Big Bang and replay structure formation on the cosmic web */
  bigBang(): void {
    this.goTo('universe'); // make sure the cosmic web is framed
    this.cosmicWeb.playBigBang();
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
    this.setCameraFocus(() => this.earthBody.world, EARTH_RADIUS_AU);
  }

  /** focus back on the Sun */
  focusSun(): void {
    this.setCameraFocus(null, SUN_RADIUS_AU);
  }

  /** focus a named nearest star (for verification) */
  focusStar(name: string): void {
    const sb = this.starBodies.find((x) => x.name === name);
    if (sb) this.setCameraFocus(() => sb.body.world, 0.25); // ~the orrery's star visual radius
  }

  /** focus the city on the globe's pole (for verification) */
  focusCity(): void {
    this.setCameraFocus(() => {
      this.cityFocusTmp.copy(this.earthBody.world);
      this.cityFocusTmp.y += EARTH_RADIUS_AU; // the pole patch, one Earth-radius up
      return this.cityFocusTmp;
    }, CITY_RADIUS_AU);
  }

  // ---- observer mode: "stand here, look out" ----

  /** enter observer mode at a moving world point (a body/star). Free-look with drag,
   *  zoom the FOV with the wheel; the sky's apparent magnitudes re-project from here. */
  viewFrom(get: () => Vector3, label = 'here'): void {
    this.cancelFlyTo(); // observer supersedes a flight — but restore focusGet so exiting isn't stale
    this.constellations.setActive(null); // a body-sky view clears any constellation figure
    this.observerGet = get;
    this.observerLabel = label;
    this.fov = 55;
    this.onChange?.();
  }

  /** view the sky from the currently focused body (the 'v' key) */
  viewFromFocus(): void {
    const t = this.focusTarget;
    this.viewFrom(() => t.position(this.focusGetTmp), t.label);
  }

  /** leave observer mode, back to orbit; reset the sky to the from-Earth catalogue. */
  exitObserver(): void {
    if (!this.observerGet) return;
    this.observerGet = null;
    this.starCatalog.setObserver(ORIGIN);
    this.constellations.setActive(null); // leaving the sky hides any constellation figure
    this.onChange?.();
  }

  /** Show a constellation's real asterism figure on the sky and aim the observer at it.
   *  Enters observer mode from Earth if not already standing somewhere (asterisms are an
   *  Earth-vantage construct). `id` is the IAU 3-letter code. */
  // ---- Layer 8: mission planner — real windows from the engine's own ephemeris ----

  /** Plan the next Hohmann window between two planets, searching forward from NOW
   *  (the current sim time). Returns null for a degenerate pair. */
  planMissionTo(fromId: string, toId: string): MissionPlan | null {
    const from = PLANETS.find((p) => p.id === fromId);
    const to = PLANETS.find((p) => p.id === toId);
    if (!from || !to || from === to) return null;
    return planMission(from, to, this.clock.seconds);
  }

  /** Draw the transfer arc + park the (pre-departure) ship, and frame both orbits. */
  showMission(plan: MissionPlan): void {
    this.clearMission();
    const from = PLANETS.find((p) => p.id === plan.fromId)!;
    const to = PLANETS.find((p) => p.id === plan.toId)!;
    this.mission = plan;
    this.missionArcPts = transferArc(from, to, plan);
    this.missionLine = new Line(
      new BufferGeometry().setFromPoints(this.missionArcPts),
      new LineBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0.9, depthTest: false }),
    );
    this.missionLine.renderOrder = 4;
    this.scene.add(this.missionLine);
    this.missionShip = this.dot(0.012, new Color(0xffd27a));
    this.missionShip.renderOrder = 5;
    // frame the whole transfer from above the ecliptic
    this.exitObserver();
    this.mergerMode = false;
    this.focusSun();
    this.targetLog = Math.log10(Math.max(from.a, to.a) * 2.6);
    this.onChange?.();
  }

  /** Jump the sim to the departure window, put the ship on the arc, ride along.
   *  Time runs at 1 mo/s so a Mars cruise plays out in ~9 seconds. */
  launchMission(plan: MissionPlan): void {
    this.showMission(plan);
    this.clock.seconds = plan.departSeconds;
    this.clock.setRateNearest(30 * 86_400); // ~1 mo/s — a Mars cruise plays out in ~9 s
    shipPosition(this.missionArcPts!, 0, this.missionShipWorld);
    this.setCameraFocus(() => this.missionShipWorld, 1e-4);
    const to = PLANETS.find((p) => p.id === plan.toId)!;
    this.targetLog = Math.log10(Math.max(to.a, 1) * 1.15); // ride with both worlds in frame
  }

  clearMission(): void {
    this.mission = null;
    this.missionArcPts = null;
    this.missionArrivedFired = false;
    if (this.missionLine) {
      this.scene.remove(this.missionLine);
      this.missionLine.geometry.dispose();
      (this.missionLine.material as LineBasicMaterial).dispose();
      this.missionLine = null;
    }
    if (this.missionShip) {
      this.scene.remove(this.missionShip);
      (this.missionShip.material as SpriteMaterial).dispose();
      this.missionShip = null;
    }
  }

  get missionFraction(): number | null {
    if (!this.mission) return null;
    return (this.clock.seconds - this.mission.departSeconds) / (this.mission.arriveSeconds - this.mission.departSeconds);
  }

  /** per-frame: ride the ship along the arc on sim time; fire the arrival once */
  private updateMission(seconds: number): void {
    if (!this.mission || !this.missionArcPts || !this.missionLine || !this.missionShip) return;
    const f = (seconds - this.mission.departSeconds) / (this.mission.arriveSeconds - this.mission.departSeconds);
    shipPosition(this.missionArcPts, f, this.missionShipWorld);
    this.fo.place(this.missionShip, this.missionShipWorld);
    this.missionShip.visible = f >= 0; // parked at the departure point until the window
    this.fo.place(this.missionLine, ORIGIN); // heliocentric arc, rebased to the camera
    if (f >= 1 && !this.missionArrivedFired) {
      this.missionArrivedFired = true;
      this.onMissionArrived?.(this.mission);
    }
  }

  // ---- Layer 7: "what is that?" — a ground vantage + coordinate-aimed identification ----

  /** Stand at a latitude/longitude on Earth's surface (~3 km up, so the terrain under
   *  your feet renders as a real horizon). The position getter recomputes from GMST
   *  every frame, so you RIDE the turning planet — run time and the sky wheels over. */
  standAt(latDeg: number, lonDeg: number): void {
    const get = (): Vector3 =>
      groundDir(latDeg, lonDeg, this.clock.seconds, this.groundTmp)
        .multiplyScalar(EARTH_RADIUS_AU * 1.0005)
        .add(this.earthBody.world);
    const ns = latDeg >= 0 ? 'N' : 'S';
    const ew = lonDeg >= 0 ? 'E' : 'W';
    this.viewFrom(get, `${Math.abs(latDeg).toFixed(1)}°${ns} ${Math.abs(lonDeg).toFixed(1)}°${ew}`);
  }

  /** A sky direction (render frame) for an Alt/Az or RA/Dec query. RA in HOURS. */
  skyDir(spec: { mode: 'altaz' | 'radec'; lat: number; lon: number; c1: number; c2: number }, out = new Vector3()): Vector3 {
    return spec.mode === 'altaz'
      ? altazDir(spec.lat, spec.lon, spec.c1, spec.c2, this.clock.seconds, out)
      : eclipticDirFromRaDec(spec.c1 * 15, spec.c2, out).normalize();
  }

  /** Aim the observer's free-look along `dir` and identify what's there: the nearest
   *  solar-system body wins when it's within a few degrees (it's the bright mover);
   *  otherwise the nearest naked-eye catalogue star. Selects the answer so the
   *  inspector shows its full card. */
  whatIsThat(dir: Vector3): { label: string; sub: string } | null {
    const from = this.observerGet ? this.observerGet() : this.earthBody.world;
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = Math.max(-1.55, Math.min(1.55, Math.asin(Math.max(-1, Math.min(1, -dir.y)))));
    // candidate bodies: Sun/planets/GC/nearest stars, the moons, nearby craft
    let bodyT: FocusTarget | null = null;
    let bodySep = Infinity;
    const consider = (t: FocusTarget): void => {
      const p = t.position(this.idTmp).sub(from);
      if (p.lengthSq() < 1e-18) return; // the thing we're standing on
      const sep = (Math.acos(Math.max(-1, Math.min(1, p.normalize().dot(dir)))) * 180) / Math.PI;
      if (sep < bodySep) { bodySep = sep; bodyT = t; }
    };
    for (const t of this.pickables) consider(t);
    for (const mb of this.moonBodies) consider(mb.target);
    if (this.earthBody.world.distanceTo(from) < SAT_SHOW_AU) for (const t of this.orbitalShell.craftTargets()) consider(t);
    const star = this.starCatalog.nearestTo(dir, from);
    // a solar-system body within 2.5° beats a star unless the star is much closer to the aim
    if (bodyT && bodySep < 2.5 && (!star || bodySep <= star.sepDeg + 2)) {
      this.select(bodyT);
      return { label: (bodyT as FocusTarget).label, sub: `${bodySep.toFixed(1)}° from your aim` };
    }
    if (star) {
      this.select(star.target);
      return { label: star.target.label, sub: `mag ${star.mag.toFixed(1)} · ${star.sepDeg.toFixed(1)}° from your aim` };
    }
    return null;
  }

  showConstellation(id: string): void {
    // Asterisms are a geocentric construct: the figure is drawn at FIXED sky directions, so
    // it only lands on the stars from a near-Sun vantage (from a distant star the parallax-
    // reprojected sky drifts degrees away). Keep the current spot only if it's inside the
    // solar system (a planet); otherwise snap to Earth.
    const nearSun = this.isObserving && this.observerGet!().length() < OBSERVER_SOLAR_AU;
    if (!nearSun) this.viewFromEarth();
    const centroid = this.constellations.setActive(id);
    if (!centroid) return;
    // aim the free-look at the figure's centre (matches the observer look = −spherical(yaw,pitch))
    this.yaw = Math.atan2(-centroid.x, -centroid.z);
    this.pitch = Math.max(-1.55, Math.min(1.55, Math.asin(Math.max(-1, Math.min(1, -centroid.y)))));
    this.onChange?.();
  }

  get isObserving(): boolean {
    return this.observerGet !== null;
  }

  /** view the sky from Earth / Mars / a named star (for verification + the HUD) */
  viewFromEarth(): void {
    this.viewFrom(() => this.earthBody.world, 'Earth');
  }

  viewFromMars(): void {
    const mars = this.bodies[1 + PLANETS.findIndex((p) => p.id === 'mars')];
    if (mars) this.viewFrom(() => mars.world, 'Mars');
  }

  viewFromStar(name: string): void {
    const sb = this.starBodies.find((x) => x.name === name);
    if (sb) this.viewFrom(() => sb.body.world, name);
  }
}
