// Phase 1 proof: ONE physical coordinate system (unit = AU), floating-origin
// rendering, continuous zoom across ~6 orders of magnitude — from Earth's orbit
// out past the planets to the real nearest stars, all to true scale, with NO
// cross-fade between scales. This is what the regime hand-offs become once the
// engine lands. Built entirely on meethos-core (units/frames/floatingOrigin).
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Quaternion,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import { blackbodyColor } from '../core/color';
import { mulberry32, gaussian } from '../core/rng';
import { dotTexture } from '../render/sprites';
import { makeLabel } from '../render/label';
import { planetPosition } from '../regimes/data/kepler';
import { PLANETS, SUN } from '../regimes/data/planets';
import { AU_PER_LY, AU_PER_PC, formatDistance, SUN_RADIUS_AU } from '../meethos/units';
import { eclipticDirFromRaDec } from '../meethos/frames';
import { FloatingOrigin } from '../meethos/floatingOrigin';

const ORIGIN = new Vector3(0, 0, 0);
const KPC_AU = AU_PER_PC * 1e3; // AU per kiloparsec

// The Milky Way as a Points cloud in the SAME AU coordinate frame — barred spiral
// scaled to physical size, with the Sun on the Orion arm at R0 ≈ 8.2 kpc, tilted
// ~60° to the ecliptic. Positions are Sun-relative (the cloud rides floating origin
// via a group translation). Returns the cloud + the galactic-centre world point.
function buildGalaxy(): { group: Group; centerWorld: Vector3 } {
  const N = 24_000;
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
  const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 1.05); // ~60° galactic tilt
  const sunLocal = new Vector3(R0, 0, 0); // Sun in the disk-local frame (disk in X–Z, Y = normal)
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const v = new Vector3();
  const c = new Color();
  for (let i = 0; i < N; i++) {
    const u = rng();
    let r: number;
    let ang: number;
    let h: number;
    if (u < 0.12) {
      r = Math.abs(gaussian(rng)) * 1.3 * KPC_AU;
      ang = rng() * 6.2832;
      h = gaussian(rng) * 0.8 * KPC_AU;
    } else if (u < 0.95) {
      const arm = ARMS[(rng() * ARMS.length) | 0]!;
      r = DISK * Math.pow(rng(), 0.6);
      const wind = Math.log(r / KPC_AU + 1) / Math.tan(arm.pitch);
      ang = arm.base + wind + gaussian(rng) * (0.12 + 0.6 / (r / KPC_AU + 1));
      h = gaussian(rng) * H * (0.5 + 1 / (r / (3 * KPC_AU) + 1));
    } else {
      r = DISK * Math.sqrt(rng());
      ang = rng() * 6.2832;
      h = gaussian(rng) * H;
    }
    v.set(Math.cos(ang) * r, h, Math.sin(ang) * r).sub(sunLocal).applyQuaternion(tilt);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
    const t = u < 0.95 && rng() < 0.12 ? 8000 + rng() * 12000 : u < 0.12 ? 3200 + rng() * 2200 : 3200 + rng() * 3600;
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
    new PointsMaterial({ size: 5e6, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true, opacity: 0.9 }),
  );
  points.frustumCulled = false;
  const group = new Group();
  group.add(points);
  const centerWorld = new Vector3(0, 0, 0).sub(sunLocal).applyQuaternion(tilt);
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

interface Body {
  world: Vector3; // absolute position in AU (f64)
  dot: Sprite;
  label: Sprite;
  kind: 'sun' | 'planet' | 'star';
}

export function startZoomDemo(canvas: HTMLCanvasElement, readout: HTMLElement): void {
  const renderer = new WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = ACESFilmicToneMapping;

  const scene = new Scene();
  const camera = new PerspectiveCamera(55, innerWidth / innerHeight, 1e-4, 2e6);
  const fo = new FloatingOrigin(new Vector3());
  const bodies: Body[] = [];

  const dot = (size: number, color: Color): Sprite => {
    const s = new Sprite(new SpriteMaterial({ map: dotTexture(), color, sizeAttenuation: false, depthTest: false, transparent: true }));
    s.scale.set(size, size, 1);
    s.renderOrder = 1;
    scene.add(s);
    return s;
  };

  const addBody = (world: Vector3, name: string, color: Color, kind: Body['kind'], dotSize: number): void => {
    const label = makeLabel(name, color.getHex(), kind === 'star' ? 0.03 : 0.038);
    scene.add(label);
    bodies.push({ world, dot: dot(dotSize, color), label, kind });
  };

  // Sun at the origin
  addBody(new Vector3(0, 0, 0), 'Sun', new Color(SUN.color), 'sun', 0.03);
  // planets at their true AU positions (animated slowly)
  for (const p of PLANETS) addBody(planetPosition(p, 0, new Vector3()), p.label, new Color(p.color), 'planet', 0.013);
  // the real nearest stars at true distance + real direction + real color
  const c = new Color();
  for (const s of STARS) {
    const world = eclipticDirFromRaDec(s.ra, s.dec).multiplyScalar(s.ly * AU_PER_LY);
    addBody(world, s.name, blackbodyColor(s.k, c).clone(), 'star', s.k > 7000 ? 0.016 : 0.011);
  }
  // the Milky Way — same coordinate frame, 24k stars, Sun on the Orion arm
  const galaxy = buildGalaxy();
  scene.add(galaxy.group);
  addBody(galaxy.centerWorld, 'Galactic Centre', new Color(0xffe6b0), 'star', 0.02);
  const gcBody = bodies[bodies.length - 1]!;

  // --- f64 orbit camera (yaw/pitch/log-distance), floating-origin ---
  let yaw = 0.6;
  let pitch = 0.5;
  let logDist = Math.log10(3); // start a few AU out (inner solar system)
  const MIN_LOG = Math.log10(SUN_RADIUS_AU * 3); // can dive to the Sun's surface
  const MAX_LOG = Math.log10(7e9); // out past the galactic disk (~34 kpc)

  let dragging = false;
  let lx = 0;
  let ly = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
  addEventListener('pointerup', () => { dragging = false; });
  addEventListener('pointermove', (e) => {
    if (!dragging) return;
    yaw -= (e.clientX - lx) * 0.005;
    pitch = Math.max(-1.55, Math.min(1.55, pitch + (e.clientY - ly) * 0.005));
    lx = e.clientX;
    ly = e.clientY;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    logDist = Math.max(MIN_LOG, Math.min(MAX_LOG, logDist + Math.sign(e.deltaY) * 0.12));
  }, { passive: false });

  const tmp = new Vector3();
  let t = 0;
  let last = 0;
  function frame(now: number): void {
    const realDt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    t += realDt * 0.15 * 3.155e7; // ~0.15 sim-years per real second → planets drift

    // re-place the planets along their true orbits
    for (let i = 0; i < PLANETS.length; i++) planetPosition(PLANETS[i]!, t, bodies[i + 1]!.world);

    const dist = 10 ** logDist;
    const cp = Math.cos(pitch);
    fo.camWorld.set(cp * Math.sin(yaw) * dist, Math.sin(pitch) * dist, cp * Math.cos(yaw) * dist);

    // the galaxy cloud rides floating origin by translating the whole group
    galaxy.group.position.set(-fo.camWorld.x, -fo.camWorld.y, -fo.camWorld.z);

    for (const b of bodies) {
      fo.place(b.dot, b.world);
      fo.place(b.label, b.world); // label.center is bottom-anchored → floats above the dot in screen space
      // declutter by zoom band
      if (b.kind === 'sun') {
        b.dot.visible = true;
        b.label.visible = true;
      } else if (b.kind === 'planet') {
        b.dot.visible = dist < 5e5;
        b.label.visible = dist < 6000;
      } else if (b === gcBody) {
        b.dot.visible = dist > 1e6;
        b.label.visible = dist > 5e6;
      } else {
        // nearest stars
        b.dot.visible = dist < 8e7;
        b.label.visible = dist > 3000 && dist < 8e7;
      }
    }

    camera.position.set(0, 0, 0);
    camera.lookAt(fo.rel(ORIGIN, tmp));
    camera.near = Math.max(dist * 1e-4, 1e-6);
    camera.far = Math.max(dist * 1e3, 1.5e10);
    camera.updateProjectionMatrix();

    readout.textContent = `view scale ≈ ${formatDistance(dist)}  ·  scroll to zoom (planet → galaxy) · drag to look`;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  (window as unknown as { zoomDemo: unknown }).zoomDemo = {
    get logDist() { return logDist; },
    set logDist(v: number) { logDist = Math.max(MIN_LOG, Math.min(MAX_LOG, v)); },
    set yaw(v: number) { yaw = v; },
    set pitch(v: number) { pitch = v; },
    dist: () => 10 ** logDist,
  };
}
