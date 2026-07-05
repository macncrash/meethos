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
import { J2000_UTC_MS, SECONDS_PER_YEAR, formatUTCDate } from './core/units';
import type { MissionPlan } from './core/mission';
import { PLANETS } from './regimes/data/planets';
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
const PARAMS = new URLSearchParams(window.location.search);
const LEGACY = PARAMS.has('legacy');
const UNIFIED = !LEGACY;
// `?now` anchors the sim to the REAL present: the epoch is J2000, so seconds-since-
// J2000 puts every planet where it actually is today, tonight's actual sky overhead,
// and mission windows relative to the real calendar.
const EPOCH_NOW = PARAMS.has('now');
// `?capture` keeps the drawing buffer readable so a scripted tour can grab frames off the
// canvas for the shareable highlight reel (small perf cost, off by default).
const CAPTURE = PARAMS.has('capture');

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
if (EPOCH_NOW) simClock.seconds = (Date.now() - J2000_UTC_MS) / 1000; // boot at the real present
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
  if (document.activeElement instanceof HTMLInputElement) return; // typing coordinates ≠ firing comets
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

// an entry matches on its name, or (slightly discounted) on its alias — a star's
// sector coordinates, so "2, -27" surfaces a stellar neighbourhood
function entryScore(e: SearchEntry, q: string): number {
  const byName = matchScore(e.name.toLowerCase(), q);
  const byAlias = e.alias ? matchScore(e.alias.toLowerCase(), q) * 0.8 : 0;
  return Math.max(byName, byAlias);
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
      .map((e) => ({ e, s: entryScore(e, q) }))
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
  // a 92-minute orbit at 1 yr/s is strobing noise — riding a craft needs human-scale time
  if (e.kind === 'sat' && !simClock.paused && simClock.rate > 60) simClock.setRateNearest(60); // ride at 1 min/s
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

// ---- "what is that?" — ground vantage + coordinate-aimed sky identification ----
const skyBox = document.getElementById('skyid');
const skyResult = document.getElementById('sky-result');
const skyVal = (id: string): number => Number((document.getElementById(id) as HTMLInputElement | null)?.value ?? 0) || 0;
const skyMode = (): 'altaz' | 'radec' =>
  (document.querySelector('input[name="sky-mode"]:checked') as HTMLInputElement | null)?.value === 'radec' ? 'radec' : 'altaz';
function skySpec(): { mode: 'altaz' | 'radec'; lat: number; lon: number; c1: number; c2: number } {
  return { mode: skyMode(), lat: skyVal('sky-lat'), lon: skyVal('sky-lon'), c1: skyVal('sky-c1'), c2: skyVal('sky-c2') };
}
if (LEGACY) { const b = document.getElementById('skybtn'); if (b) b.hidden = true; }
document.getElementById('skybtn')?.addEventListener('click', () => { if (skyBox) skyBox.hidden = !skyBox.hidden; });
document.getElementById('sky-close')?.addEventListener('click', () => { if (skyBox) skyBox.hidden = true; });
// the coordinate captions follow the mode (Alt/Az degrees ↔ RA hours / Dec degrees)
document.querySelectorAll('input[name="sky-mode"]').forEach((r) => r.addEventListener('change', () => {
  const radec = skyMode() === 'radec';
  const c1 = document.getElementById('sky-c1-cap');
  const c2 = document.getElementById('sky-c2-cap');
  if (c1) c1.textContent = radec ? 'RA h' : 'Alt';
  if (c2) c2.textContent = radec ? 'Dec' : 'Az';
}));
document.getElementById('sky-stand')?.addEventListener('click', () => {
  if (!unified) return;
  const s = skySpec();
  unified.standAt(s.lat, s.lon);
  if (skyResult) { skyResult.hidden = false; skyResult.innerHTML = `Standing at <b>${s.lat.toFixed(1)}°, ${s.lon.toFixed(1)}°</b> — drag to look around; run time and the sky wheels.`; }
});
document.getElementById('sky-aim')?.addEventListener('click', () => {
  if (!unified) return;
  const s = skySpec();
  unified.standAt(s.lat, s.lon); // always (re)anchor — the panel's ground IS the vantage
  const hit = unified.whatIsThat(unified.skyDir(s));
  if (skyResult) {
    skyResult.hidden = false;
    skyResult.innerHTML = hit
      ? `That is <b>${hit.label}</b> <span class="sky-sub">${hit.sub}</span>`
      : 'Nothing bright there.';
  }
});

// ---- sky panel place picker: choose a city, stand there, see tonight's sky ----
const SKY_CITIES: Array<[string, number, number]> = [
  ['New York', 40.71, -74.01], ['London', 51.51, -0.13], ['Paris', 48.86, 2.35],
  ['Tokyo', 35.68, 139.69], ['Beijing', 39.9, 116.41], ['Delhi', 28.61, 77.21],
  ['Moscow', 55.76, 37.62], ['Cairo', 30.04, 31.24], ['Nairobi', -1.29, 36.82],
  ['Sydney', -33.87, 151.21], ['Cape Town', -33.92, 18.42], ['Sao Paulo', -23.55, -46.63],
  ['Mexico City', 19.43, -99.13], ['Honolulu', 21.31, -157.86], ['Reykjavik', 64.15, -21.94],
  ['McMurdo Station', -77.85, 166.67],
];
{
  const citySel = document.getElementById('sky-city') as HTMLSelectElement | null;
  if (citySel) {
    SKY_CITIES.forEach(([n], i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = n;
      citySel.append(o);
    });
    citySel.addEventListener('change', () => {
      const c = SKY_CITIES[Number(citySel.value)];
      if (!c) return;
      const latEl = document.getElementById('sky-lat') as HTMLInputElement | null;
      const lonEl = document.getElementById('sky-lon') as HTMLInputElement | null;
      if (latEl) latEl.value = String(c[1]);
      if (lonEl) lonEl.value = String(c[2]);
      // stand there immediately — the point of picking a place is seeing ITS sky
      (document.getElementById('sky-stand') as HTMLButtonElement | null)?.click();
    });
  }
}

// ---- interstellar escape: real physics from here to the nearest stars ----
// Voyager's 17 km/s is real; the solar-Oberth number falls out of v∞ = √(Δv² + 2·v_peri·Δv)
// with a 3 km/s burn at 10 R☉ (v_peri ≈ 195 km/s there) — the same burn deep in the Sun's
// gravity well buys ~34 km/s of hyperbolic excess instead of 3.
const INTER_TARGETS: Array<[string, number]> = [
  ['Alpha Centauri', 4.37], ["Barnard's Star", 5.96], ['Wolf 359', 7.86],
  ['Sirius', 8.6], ['Tau Ceti', 11.91], ['Vega', 25.04],
];
const C_KMS = 299_792.458;
const MU_SUN = 1.32712440018e11; // km³/s²
const R_SUN_KM = 696_340;
function interRows(): void {
  const sel = document.getElementById('inter-target') as HTMLSelectElement | null;
  const box = document.getElementById('inter-rows');
  if (!sel || !box) return;
  const ly = Number(sel.value);
  const vPeri = Math.sqrt((2 * MU_SUN) / (10 * R_SUN_KM)); // ≈195 km/s at 10 R☉
  const dv = 3;
  const oberth = Math.sqrt(dv * dv + 2 * vPeri * dv);
  const options: Array<[string, number]> = [
    ['Chemical + Jupiter assist (Voyager 1)', 17],
    ['Solar Oberth — 3 km/s burn at 10 R☉', oberth],
    ['Nuclear-electric cruiser', 100],
    ['Laser light-sail probe', 0.1 * C_KMS],
    ['Fusion torch (Daedalus-class)', 0.12 * C_KMS],
  ];
  const fmtY = (y: number): string => (y >= 1000 ? `${Math.round(y).toLocaleString()} yr` : `${y.toFixed(1)} yr`);
  box.innerHTML = options.map(([name, v]) => {
    const years = (ly * C_KMS) / v;
    const vTxt = v >= 1000 ? `${(v / C_KMS).toFixed(2)} c` : `${v.toFixed(0)} km/s`;
    return `<div class="row"><span>${name}</span><b>${vTxt} · ${fmtY(years)}</b></div>`;
  }).join('') +
    '<div class="mission-note">Escaping the Sun from 1 AU needs 42.1 km/s heliocentric — Earth\'s orbit gifts 29.8 of it. Deep in the gravity well the same burn buys far more: v∞ = √(Δv² + 2·v<sub>peri</sub>·Δv).</div>';
}
{
  const sel = document.getElementById('inter-target') as HTMLSelectElement | null;
  if (sel) {
    for (const [n, ly] of INTER_TARGETS) {
      const o = document.createElement('option');
      o.value = String(ly);
      o.textContent = `${n} — ${ly} ly`;
      sel.append(o);
    }
    sel.addEventListener('change', interRows);
    interRows();
  }
  document.getElementById('inter-show')?.addEventListener('click', () => {
    const r = unified?.showEscapeRoute();
    if (r) selToast(Math.round(r.departDays));
  });
}

// ---- jump to a specific date: the clock's calendar readout is editable ----
// Everything is analytic on absolute time (planets, moons, satellites, sidereal sky),
// so a jump lands every body exactly where it belongs on that date.
const dateBox = document.getElementById('realdate') as HTMLInputElement | null;
function jumpToDate(): void {
  // "2049-07-20", "1969-07", or a bare (possibly negative) year: "1969", "-10000"
  const mres = /^(-?\d{1,9})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(dateBox?.value.trim() ?? '');
  if (!mres) return;
  const year = Number(mres[1]);
  if (Math.abs(year - 2000) > 200_000) {
    // beyond the calendar's reach: land on the year at year-scale precision
    simClock.seconds = (year - 2000) * SECONDS_PER_YEAR;
  } else {
    // setUTCFullYear sidesteps Date.UTC's two-digit-year trap (33 CE, not 1933)
    const d = new Date(0);
    d.setUTCFullYear(year, Number(mres[2] ?? 1) - 1, Number(mres[3] ?? 1));
    d.setUTCHours(12, 0, 0, 0);
    if (!Number.isFinite(d.getTime())) return;
    simClock.seconds = (d.getTime() - J2000_UTC_MS) / 1000;
  }
  dateBox?.blur();
}
dateBox?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') jumpToDate();
  else if (e.key === 'Escape') dateBox.blur();
});

// ---- mission planner: pick two worlds → the next REAL launch window ----
const missionBox = document.getElementById('mission');
const missionRows = document.getElementById('mission-rows');
const missionResult = document.getElementById('mission-result');
let missionPlan: MissionPlan | null = null;
if (LEGACY) { const b = document.getElementById('missionbtn'); if (b) b.hidden = true; }
// populate the origin/destination selects (Earth → Mars by default)
for (const [selId, def] of [['mission-from', 'earth'], ['mission-to', 'mars']] as const) {
  const sel = document.getElementById(selId) as HTMLSelectElement | null;
  if (!sel) continue;
  for (const p of PLANETS) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.label;
    if (p.id === def) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener('change', replan);
}
function replan(): void {
  if (!unified || !missionRows) return;
  const from = (document.getElementById('mission-from') as HTMLSelectElement | null)?.value ?? 'earth';
  const to = (document.getElementById('mission-to') as HTMLSelectElement | null)?.value ?? 'mars';
  missionPlan = unified.planMissionTo(from, to);
  if (missionResult) missionResult.hidden = true;
  if (!missionPlan) {
    missionRows.innerHTML = '<div class="m-row"><span>Pick two different worlds.</span></div>';
    return;
  }
  const p = missionPlan;
  const row = (k: string, v: string): string => `<div class="m-row"><span>${k}</span><b>${v}</b></div>`;
  missionRows.innerHTML =
    row('Next window', formatUTCDate(p.departSeconds)) +
    row('Travel time', p.transferDays > 1000 ? `${(p.transferDays / 365.25).toFixed(1)} yr` : `${Math.round(p.transferDays)} days`) +
    row('Arrival', formatUTCDate(p.arriveSeconds)) +
    row('Δv (depart + arrive)', `${p.dv1Kms.toFixed(2)} + ${p.dv2Kms.toFixed(2)} km/s`) +
    row('Phase at departure', `${p.phaseReqDeg.toFixed(1)}°`);
}
document.getElementById('missionbtn')?.addEventListener('click', () => {
  if (!missionBox) return;
  missionBox.hidden = !missionBox.hidden;
  if (!missionBox.hidden) replan(); // windows are computed from NOW — refresh on open
});
document.getElementById('mission-close')?.addEventListener('click', () => {
  if (missionBox) missionBox.hidden = true;
  unified?.clearMission(); // closing the planner strikes the arc + ship from the sky
});
document.getElementById('mission-show')?.addEventListener('click', () => {
  if (!unified) return;
  replan();
  if (missionPlan) unified.showMission(missionPlan);
});
document.getElementById('mission-launch')?.addEventListener('click', () => {
  if (!unified) return;
  replan();
  if (!missionPlan) return;
  unified.launchMission(missionPlan);
  if (missionResult) {
    missionResult.hidden = false;
    missionResult.innerHTML = `Departed <b>${formatUTCDate(missionPlan.departSeconds)}</b> — coasting…`;
  }
});
if (unified) unified.onMissionArrived = (plan) => {
  if (missionResult) {
    missionResult.hidden = false;
    missionResult.innerHTML = `Arrived at <b>${PLANETS.find((p) => p.id === plan.toId)?.label}</b> — ${formatUTCDate(plan.arriveSeconds)}, ${Math.round(plan.transferDays)} days out.`;
  }
  // hand the camera from the ship to the destination it just reached, then strike
  // the arc + ship (the destination would otherwise orbit away from a stranded dot)
  const dest = unified.searchIndex().find((e) => e.target?.id === plan.toId)?.target;
  if (dest) unified.focusOn(dest);
  unified.clearMission();
};

// ---- box-select (right-drag) — highlight a patch of sky and label its stars ----
const boxEl = document.getElementById('boxsel');
let boxStart: { x: number; y: number } | null = null;
function selToast(n: number): void {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = n === 0 ? 'No stars in the box.' : `✦ ${n} star${n === 1 ? '' : 's'} selected — Esc to clear`;
  toast.hidden = false;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2600);
}
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 2 || !unified) return;
  boxStart = { x: e.clientX, y: e.clientY };
});
window.addEventListener('pointermove', (e) => {
  if (!boxStart || !boxEl) return;
  const x = Math.min(boxStart.x, e.clientX);
  const y = Math.min(boxStart.y, e.clientY);
  boxEl.hidden = false;
  boxEl.style.left = `${x}px`;
  boxEl.style.top = `${y}px`;
  boxEl.style.width = `${Math.abs(e.clientX - boxStart.x)}px`;
  boxEl.style.height = `${Math.abs(e.clientY - boxStart.y)}px`;
});
window.addEventListener('pointerup', (e) => {
  if (e.button !== 2 || !boxStart || !unified) return;
  if (boxEl) boxEl.hidden = true;
  const start = boxStart;
  boxStart = null;
  // a bare right-CLICK selects a small patch around the cursor; a drag uses the box
  const pad = start.x === e.clientX && start.y === e.clientY ? 14 : 0;
  const x0 = Math.min(start.x, e.clientX) - pad;
  const x1 = Math.max(start.x, e.clientX) + pad;
  const y0 = Math.min(start.y, e.clientY) - pad;
  const y1 = Math.max(start.y, e.clientY) + pad;
  const nx = (px: number): number => (px / window.innerWidth) * 2 - 1;
  const ny = (py: number): number => -(py / window.innerHeight) * 2 + 1;
  selToast(unified.boxSelect(nx(x0), ny(y1), nx(x1), ny(y0))); // y flips in NDC
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && unified && !searchOpen()) {
    if (unified.selectionCount > 0) unified.clearStarSelection();
    unified.clearEscapeRoute();
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
  // bodies first; else name the catalogue star / deep-sky object under the cursor —
  // the hover label is the 'what am I about to click' affordance a sky atlas needs
  unified.setHovered(unified.pick(raycaster.ray) ?? unified.pickStar(pointer.x, pointer.y));
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
  if (target) {
    world.focusOn(target);
    if (target.id.startsWith('sat-') && !simClock.paused && simClock.rate > 60) simClock.setRateNearest(60); // ride at 1 min/s
    return;
  }
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
  if (window.innerWidth === 0 || window.innerHeight === 0) return; // a collapsed panel would poison aspect with NaN
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// expose for debugging in the console
(window as unknown as { meethos: unknown }).meethos = { manager, unified, simClock, scene, camera, renderer, game, hud };
