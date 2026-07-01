// meethos / earth3 — bootstrap. Wires the renderer, camera, scale manager, HUD,
// pointer picking, and the render loop. One continuous experience: galaxy → solar
// system → Earth's living civilization.
import {
  ACESFilmicToneMapping,
  Clock,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SimClock } from './core/clock';
import type { FocusTarget } from './core/regime';
import { ScaleManager } from './world/scaleManager';
import type { WorldFacade } from './world/facade';
import { WorldBus } from './world/bus';
import { UnifiedWorld } from './world/unifiedWorld';
import { DefenseGame } from './world/defenseGame';
import { Hud } from './ui/hud';
import { createBackdropStars } from './render/backdrop';

// The unified single floating-origin frame is now the DEFAULT world. `?legacy`
// boots the old ScaleManager cross-fade path — kept as an escape hatch until the
// transition machinery is deleted in a follow-up.
const LEGACY = new URLSearchParams(window.location.search).has('legacy');
const UNIFIED = !LEGACY;

const canvas = document.getElementById('stage') as HTMLCanvasElement;

const renderer = new WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new Scene();
// In the unified frame the galaxy + nearest stars ARE the backdrop; the fixed
// starfield sphere is a legacy-path-only ambient layer.
if (LEGACY) scene.add(createBackdropStars());

const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 20000);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.zoomSpeed = 1.2;
controls.rotateSpeed = 0.55;
controls.enabled = LEGACY; // the unified frame drives the camera with its own f64 orbit rig

const simClock = new SimClock();
const bus = new WorldBus();
// Build ONLY the active world — the legacy ScaleManager populates the scene and
// subscribes its regimes to the bus, so constructing it when unified would waste
// geometry and double-handle impacts.
const manager = LEGACY ? new ScaleManager(scene, camera, controls, bus) : null;
const unified = UNIFIED ? new UnifiedWorld(scene, camera, renderer, bus, simClock) : null;
// The UI talks to whichever world is live through the shared WorldFacade seam.
const world: WorldFacade = unified ?? manager!;
const game = new DefenseGame(world, bus, simClock);

const hud = new Hud(simClock, world, bus, game);
world.onChange = () => hud.rebuild();

// keyboard: 'c' launches a comet at Earth, 'd' deflects an incoming one, 'v' toggles
// observer mode (stand on the focused body and look out at the real sky from there)
window.addEventListener('keydown', (e) => {
  if (e.key === 'c' || e.key === 'C') hud.fireComet();
  else if (e.key === 'd' || e.key === 'D') hud.deflect();
  else if ((e.key === 'v' || e.key === 'V') && unified) {
    if (unified.isObserving) unified.exitObserver();
    else unified.viewFromFocus();
  }
});

// bottom-left label-density slider (0 = hover-only explorer mode … max = everything)
const LABEL_LEVELS: Array<[string, number]> = [
  ['Off', 0], ['Few', 4], ['Some', 9], ['Normal', 16], ['Many', 32], ['Lots', 90], ['All', 9999],
];
const labelSlider = document.getElementById('label-slider') as HTMLInputElement | null;
const labelLevel = document.getElementById('label-level');
function applyLabelDensity(): void {
  const [name, max] = LABEL_LEVELS[Number(labelSlider?.value ?? 3)] ?? LABEL_LEVELS[3]!;
  if (labelLevel) labelLevel.textContent = name;
  unified?.setMaxLabels(max);
}
labelSlider?.addEventListener('input', applyLabelDensity);
applyLabelDensity();

// ---- route planner (shift-click bodies/stars to add waypoints) ----
const ROUTE_SPEEDS = [0.1, 0.3, 0.6, 0.9, 0.99, 1, 10, 100, 1000, 9000]; // × c
const routePanel = document.getElementById('routepanel');
const routeList = document.getElementById('route-list');
const routeStatsEl = document.getElementById('route-stats');
const routeSpeed = document.getElementById('route-speed') as HTMLInputElement | null;
const routeSpeedLabel = document.getElementById('route-speed-label');
const routeFly = document.getElementById('route-fly');
const fmtLy = (ly: number): string => (ly >= 1e6 ? `${(ly / 1e6).toFixed(2)} Mly` : ly >= 1e3 ? `${(ly / 1e3).toFixed(1)} kly` : `${ly.toFixed(2)} ly`);
const fmtYr = (y: number): string => (y >= 1e6 ? `${(y / 1e6).toFixed(2)} Myr` : y >= 1e3 ? `${(y / 1e3).toFixed(1)} kyr` : `${y.toFixed(1)} yr`);
const routeSpeedC = (): number => ROUTE_SPEEDS[Number(routeSpeed?.value ?? 7)] ?? 100;
function renderRoute(): void {
  if (!unified || !routePanel) return;
  const labels = unified.routeLabels();
  routePanel.hidden = labels.length === 0;
  if (labels.length === 0) return;
  if (routeList) routeList.replaceChildren(...labels.map((name, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="rp-num">${i + 1}</span><span>${name}</span>`;
    return li;
  }));
  const s = unified.routeStats();
  if (routeStatsEl) routeStatsEl.innerHTML = unified.flying
    ? `Flying… <b>${Math.round(unified.flyProgress * 100)}%</b>`
    : `Distance <b>${fmtLy(s.totalLy)}</b><br>Earth time <b>${fmtYr(s.earthYears)}</b>${routeSpeedC() < 1 ? `<br>Ship time <b>${fmtYr(s.shipYears)}</b>` : ''}`;
  if (routeFly) {
    routeFly.classList.toggle('flying', unified.flying);
    routeFly.textContent = unified.flying ? '■ Stop' : labels.length >= 2 ? '▶ Fly the route' : 'Add ≥2 waypoints';
  }
}
function applyRouteSpeed(): void {
  const v = routeSpeedC();
  if (routeSpeedLabel) routeSpeedLabel.textContent = v < 1 ? `${v} c` : v === 1 ? 'light (c)' : `${v.toLocaleString()}× c`;
  unified?.setRouteSpeed(v); // fires onRouteChange → renderRoute
}
if (unified) unified.onRouteChange = renderRoute;
routeSpeed?.addEventListener('input', applyRouteSpeed);
routeFly?.addEventListener('click', () => { if (!unified) return; if (unified.flying) unified.stopFly(); else unified.startFly(); renderRoute(); });
document.getElementById('route-clear')?.addEventListener('click', () => unified?.clearRoute());
applyRouteSpeed();

// ---- pointer picking (click = focus, double-click = dive) ----
const raycaster = new Raycaster();
const pointer = new Vector2();
const downAt = new Vector2();
const sphere = new Sphere();
const hitPoint = new Vector3();
const worldPos = new Vector3();

canvas.addEventListener('pointerdown', (e) => downAt.set(e.clientX, e.clientY));

// hover-to-name (explorer): highlight the object under the pointer (only when no
// button is down, so it doesn't fight a drag). Unified frame only.
canvas.addEventListener('pointermove', (e) => {
  if (!unified || e.buttons !== 0) return;
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  unified.setHovered(unified.pick(raycaster.ray));
});

canvas.addEventListener('click', (e) => {
  if (downAt.distanceTo(new Vector2(e.clientX, e.clientY)) > 5) return; // was a drag
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  if (hud.tryDeflectAt(raycaster.ray)) return; // clicked a comet — shoot it down
  const target = unified ? unified.pick(raycaster.ray) : pick(e);
  // shift-click adds the body/star under the pointer to the route
  if (unified && e.shiftKey) {
    const wp = target ?? unified.pickStar(pointer.x, pointer.y);
    if (wp) unified.addWaypoint(wp);
    return;
  }
  if (target) { world.focusOn(target); return; }
  // no body under the pointer — try the star catalogue (inspect its card, don't fly there)
  if (unified) unified.select(unified.pickStar(pointer.x, pointer.y));
});

canvas.addEventListener('dblclick', (e) => {
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const target = unified ? unified.pick(raycaster.ray) : pick(e);
  if (!target) return;
  world.focusOn(target);
  if (unified || target.childRegime) world.diveInto(target); // unified: dblclick always dives (zooms in)
});

function pick(e: MouseEvent): FocusTarget | null {
  if (!manager) return null; // legacy-only path; the unified frame uses unified.pick()
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  let best: FocusTarget | null = null;
  let bestDist = Infinity;
  for (const t of manager.pickTargets()) {
    t.position(worldPos);
    const camDist = camera.position.distanceTo(worldPos);
    const pickRadius = Math.max(t.radius * 1.6, camDist * 0.018); // tiny bodies stay clickable
    sphere.set(worldPos, pickRadius);
    if (raycaster.ray.intersectSphere(sphere, hitPoint)) {
      const d = camera.position.distanceTo(hitPoint);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
  }
  return best;
}

// ---- render loop ----
const frameClock = new Clock();
function animate(): void {
  const realDt = frameClock.getDelta();
  simClock.tick(realDt);
  if (unified) unified.update(simClock, realDt);
  else manager!.update(simClock, realDt);
  game.update(simClock);
  hud.tick();
  if (unified?.flying && routeStatsEl) routeStatsEl.innerHTML = `Flying… <b>${Math.round(unified.flyProgress * 100)}%</b>`;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// expose for debugging in the console
(window as unknown as { meethos: unknown }).meethos = { manager, unified, simClock, scene, camera, renderer, game, hud };
