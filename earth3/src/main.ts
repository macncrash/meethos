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

// Migration flag: `?unified` drives the new single floating-origin frame instead
// of the legacy ScaleManager cross-fade path. Absent → the game is unchanged.
const UNIFIED = new URLSearchParams(window.location.search).has('unified');

const canvas = document.getElementById('stage') as HTMLCanvasElement;

const renderer = new WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new Scene();
// Under ?unified the galaxy + nearest stars ARE the backdrop; the fixed starfield
// sphere is a legacy-path-only ambient layer.
if (!UNIFIED) scene.add(createBackdropStars());

const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 20000);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.zoomSpeed = 1.2;
controls.rotateSpeed = 0.55;
controls.enabled = !UNIFIED; // the unified frame drives the camera with its own f64 orbit rig

const simClock = new SimClock();
const bus = new WorldBus();
// Under ?unified the legacy regimes render into a throwaway scene (never displayed)
// so the HUD/DefenseGame wiring still resolves while UnifiedWorld owns the view.
const manager = new ScaleManager(UNIFIED ? new Scene() : scene, camera, controls, bus);
// Only built under ?unified — its constructor populates the scene, so on the
// legacy path it must not exist (else its bodies would pollute the live game).
const unified = UNIFIED ? new UnifiedWorld(scene, camera, renderer, bus, simClock) : null;
// The UI talks to whichever world is live through the shared WorldFacade seam.
const world: WorldFacade = unified ?? manager;
const game = new DefenseGame(world, bus, simClock);

const hud = new Hud(simClock, world, bus, game);
world.onChange = () => hud.rebuild();

// keyboard: 'c' launches a comet at Earth, 'd' deflects an incoming one
window.addEventListener('keydown', (e) => {
  if (e.key === 'c' || e.key === 'C') hud.fireComet();
  else if (e.key === 'd' || e.key === 'D') hud.deflect();
});

// ---- pointer picking (click = focus, double-click = dive) ----
const raycaster = new Raycaster();
const pointer = new Vector2();
const downAt = new Vector2();
const sphere = new Sphere();
const hitPoint = new Vector3();
const worldPos = new Vector3();

canvas.addEventListener('pointerdown', (e) => downAt.set(e.clientX, e.clientY));

canvas.addEventListener('click', (e) => {
  if (downAt.distanceTo(new Vector2(e.clientX, e.clientY)) > 5) return; // was a drag
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  if (hud.tryDeflectAt(raycaster.ray)) return; // clicked a comet — shoot it down
  const target = unified ? unified.pick(raycaster.ray) : pick(e);
  if (target) world.focusOn(target);
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
  if (UNIFIED) unified!.update(simClock, realDt);
  else manager.update(simClock, realDt);
  game.update(simClock);
  hud.tick();
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
