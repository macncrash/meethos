// Phase 1 proof: ONE physical coordinate system (unit = AU), floating-origin
// rendering, continuous zoom across ~6 orders of magnitude — from Earth's orbit
// out past the planets to the real nearest stars, all to true scale, with NO
// cross-fade between scales. This is what the regime hand-offs become once the
// engine lands. Built entirely on meethos-core (units/frames/floatingOrigin).
import {
  ACESFilmicToneMapping,
  Color,
  PerspectiveCamera,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import { blackbodyColor } from '../core/color';
import { dotTexture } from '../render/sprites';
import { makeLabel } from '../render/label';
import { planetPosition } from '../regimes/data/kepler';
import { PLANETS, SUN } from '../regimes/data/planets';
import { AU_PER_LY, formatDistance, SUN_RADIUS_AU } from '../meethos/units';
import { eclipticDirFromRaDec } from '../meethos/frames';
import { FloatingOrigin } from '../meethos/floatingOrigin';

const ORIGIN = new Vector3(0, 0, 0);

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

  // --- f64 orbit camera (yaw/pitch/log-distance), floating-origin ---
  let yaw = 0.6;
  let pitch = 0.5;
  let logDist = Math.log10(3); // start a few AU out (inner solar system)
  const MIN_LOG = Math.log10(SUN_RADIUS_AU * 3); // can dive to the Sun's surface
  const MAX_LOG = Math.log10(STARS[STARS.length - 1]!.ly * AU_PER_LY * 1.6);

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

    for (const b of bodies) {
      fo.place(b.dot, b.world);
      fo.place(b.label, b.world); // label.center is bottom-anchored → floats above the dot in screen space
      // declutter by zoom: planet labels up close, star labels when zoomed out
      b.label.visible = b.kind === 'sun' || (b.kind === 'planet' ? dist < 6000 : dist > 4000);
    }

    camera.position.set(0, 0, 0);
    camera.lookAt(fo.rel(ORIGIN, tmp));
    camera.near = Math.max(dist * 1e-4, 1e-6);
    camera.far = Math.max(dist * 1e3, 2e6);
    camera.updateProjectionMatrix();

    readout.textContent = `view scale ≈ ${formatDistance(dist)}  ·  scroll to zoom (AU → light-years) · drag to look`;
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
