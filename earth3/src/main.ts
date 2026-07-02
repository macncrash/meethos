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
import { UnifiedWorld, type SearchEntry } from './world/unifiedWorld';
import { DefenseGame } from './world/defenseGame';
import { Hud } from './ui/hud';
import { createBackdropStars } from './render/backdrop';

// The unified single floating-origin frame is now the DEFAULT world. `?legacy`
// boots the old ScaleManager cross-fade path — kept as an escape hatch until the
// transition machinery is deleted in a follow-up.
const LEGACY = new URLSearchParams(window.location.search).has('legacy');
const UNIFIED = !LEGACY;
// `?capture` keeps the drawing buffer readable so a scripted tour can grab frames off the
// canvas for the shareable highlight reel (small perf cost, off by default).
const CAPTURE = new URLSearchParams(window.location.search).has('capture');

const canvas = document.getElementById('stage') as HTMLCanvasElement;

const renderer = new WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: CAPTURE });
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
  if (document.getElementById('search')?.hidden === false) return; // the search palette owns the keyboard while open
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
// route distances/times span from Earth→Moon (384,400 km, seconds at warp) to
// intergalactic (Mly, Myr) — pick the unit that keeps 2-3 significant figures
const AU_PER_LY_UI = 63_241.077;
const KM_PER_AU_UI = 149_597_870.7;
const fmtLy = (ly: number): string => {
  if (ly >= 1e6) return `${(ly / 1e6).toFixed(2)} Mly`;
  if (ly >= 1e3) return `${(ly / 1e3).toFixed(1)} kly`;
  if (ly >= 0.1) return `${ly.toFixed(2)} ly`;
  const au = ly * AU_PER_LY_UI;
  if (au >= 0.1) return `${au.toFixed(2)} AU`;
  return `${Math.round(au * KM_PER_AU_UI).toLocaleString()} km`;
};
const fmtYr = (y: number): string => {
  if (y >= 1e6) return `${(y / 1e6).toFixed(2)} Myr`;
  if (y >= 1e3) return `${(y / 1e3).toFixed(1)} kyr`;
  if (y >= 0.1) return `${y.toFixed(1)} yr`;
  const d = y * 365.25;
  if (d >= 1) return `${d.toFixed(1)} d`;
  const h = d * 24;
  if (h >= 1) return `${h.toFixed(1)} h`;
  const min = h * 60;
  return min >= 1 ? `${min.toFixed(1)} min` : `${(min * 60).toFixed(1)} s`;
};
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

// ---- go-to search palette (press /) — type a name, ↵ fly there, ⇧↵ view from there ----
const searchBtn = document.getElementById('searchbtn');
const searchBox = document.getElementById('search');
const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
const searchResults = document.getElementById('search-results');
// a friendly starting set shown before the user types anything
const SEARCH_DEFAULTS = ['Earth', 'Moon', 'ISS', 'Space junk (LEO)', 'Mars', 'Titan', 'Sun', 'Orion', 'Andromeda (M31)'];
let searchAll: SearchEntry[] = [];
let searchHits: SearchEntry[] = [];
let searchSel = 0;

const searchOpen = (): boolean => !!searchBox && !searchBox.hidden;

// rank a candidate: exact > prefix > word-start > substring (0 = no match)
function matchScore(name: string, q: string): number {
  if (name === q) return 100;
  if (name.startsWith(q)) return 80 - name.length * 0.02;
  if (name.split(/[\s'()·.-]+/).some((w) => w.startsWith(q))) return 60;
  const at = name.indexOf(q);
  return at >= 0 ? 40 - at * 0.1 : 0;
}

function renderSearchResults(): void {
  if (!searchResults) return;
  if (searchHits.length === 0) {
    searchResults.innerHTML = '<li class="s-empty">No match — try a planet, star or galaxy name.</li>';
    return;
  }
  searchResults.replaceChildren(...searchHits.map((e, i) => {
    const li = document.createElement('li');
    if (i === searchSel) li.className = 'sel';
    li.innerHTML =
      `<span class="s-kind k-${e.kind}">${e.kind}</span><span class="s-name">${e.name}</span>` +
      (e.sub ? `<span class="s-sub">${e.sub}</span>` : '');
    li.addEventListener('mousemove', () => { if (searchSel !== i) { searchSel = i; renderSearchResults(); } });
    li.addEventListener('click', (ev) => goSearch(e, ev.shiftKey));
    return li;
  }));
}

function runSearch(): void {
  const q = (searchInput?.value ?? '').trim().toLowerCase();
  if (!q) {
    searchHits = SEARCH_DEFAULTS.map((n) => searchAll.find((e) => e.name === n)).filter((e): e is SearchEntry => !!e);
  } else {
    searchHits = searchAll
      .map((e) => ({ e, s: matchScore(e.name.toLowerCase(), q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 9)
      .map((x) => x.e);
  }
  searchSel = 0;
  renderSearchResults();
}

function openSearch(): void {
  if (!unified || !searchBox || !searchInput) return;
  searchAll = unified.searchIndex(); // rebuilt each open → picks up the async-loaded catalogue
  searchBox.hidden = false;
  searchInput.value = '';
  runSearch();
  searchInput.focus();
}
function closeSearch(): void {
  if (searchBox) searchBox.hidden = true;
  searchInput?.blur();
}
function goSearch(e: SearchEntry, observe: boolean): void {
  if (e.constellationId) unified?.showConstellation(e.constellationId); // aim the sky at the figure
  else if (e.target) unified?.goToTarget(e.target, observe);
  closeSearch();
}

if (LEGACY && searchBtn) searchBtn.hidden = true; // search drives the unified frame only
searchBtn?.addEventListener('click', openSearch);
searchInput?.addEventListener('input', runSearch);
searchInput?.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); searchSel = Math.min(searchHits.length - 1, searchSel + 1); renderSearchResults(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); searchSel = Math.max(0, searchSel - 1); renderSearchResults(); }
  else if (e.key === 'Enter') { e.preventDefault(); const hit = searchHits[searchSel]; if (hit) goSearch(hit, e.shiftKey); }
  else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
});
// open on '/' or ⌘/Ctrl-K (unless already typing in a field)
window.addEventListener('keydown', (e) => {
  if (searchOpen() || document.activeElement instanceof HTMLInputElement) return;
  if (e.key === '/' || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
    e.preventDefault();
    openSearch();
  }
});

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
  if (searchOpen()) { closeSearch(); return; } // clicking the scene dismisses the search palette
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
