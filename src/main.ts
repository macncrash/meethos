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
import { WorldBus } from './world/bus';
import { Hud } from './ui/hud';
import { createBackdropStars } from './render/backdrop';

const canvas = document.getElementById('stage') as HTMLCanvasElement;

const renderer = new WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new Scene();
scene.add(createBackdropStars());

const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 20000);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.zoomSpeed = 1.2;
controls.rotateSpeed = 0.55;

const simClock = new SimClock();
const bus = new WorldBus();
const manager = new ScaleManager(scene, camera, controls, bus);

const hud = new Hud(simClock, manager, bus);
manager.onChange = () => hud.rebuild();

// keyboard: 'c' launches a comet at Earth
window.addEventListener('keydown', (e) => {
  if (e.key === 'c' || e.key === 'C') hud.fireComet();
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
  const target = pick(e);
  if (target) manager.focusOn(target);
});

canvas.addEventListener('dblclick', (e) => {
  const target = pick(e);
  if (!target) return;
  manager.focusOn(target);
  if (target.childRegime) manager.diveInto(target);
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
  manager.update(simClock, realDt);
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
(window as unknown as { meethos: unknown }).meethos = { manager, simClock, scene, camera };
