// True-scale, lit, textured globes for the planets and major moons — the "what does
// Mars LOOK like" layer. Each world gets a seeded procedural equirectangular texture
// (rust + polar caps, cloud bands + the Great Red Spot, cracked ice, the two-faced
// Iapetus…), a sphere at its REAL radius, and a shared sun-tracking directional light
// so every world has a day side and a terminator. Saturn gets its rings as geometry.
//
// A globe fades in when the camera is within ~600 radii of its body (the same idea as
// Earth's globe band); its marker dot hands off to the mesh. Earth and Luna keep their
// existing EarthRegime meshes — this module covers everyone else.
import {
  BufferAttribute,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { TextureLoader } from 'three';
import { mulberry32 } from '../core/rng';
import type { FloatingOrigin } from '../meethos/floatingOrigin';

const SHOW_RADII = 600; // globe visible within this many body radii
const W = 512;
const H = 256;

interface WorldSpec {
  base: string;
  bands?: { colors: string[]; turb: number; alpha?: number };
  blotch?: { color: string; n: number; rMin: number; rMax: number; alpha: number }[];
  caps?: { color: string; latDeg: number; south?: boolean; north?: boolean };
  cracks?: { color: string; n: number; alpha: number };
  spot?: { color: string; u: number; v: number; w: number; h: number };
  speckle?: number; // 0..1 crater/noise density
  twoFace?: string; // Iapetus: paint one hemisphere this colour
}

const SPECS: Record<string, WorldSpec> = {
  mercury: { base: '#8d8683', blotch: [{ color: '#6e6663', n: 70, rMin: 4, rMax: 26, alpha: 0.25 }], speckle: 0.8 },
  venus: { base: '#e6cb9e', bands: { colors: ['#efdcae', '#dfc190', '#eed7a8', '#d8ba88'], turb: 9, alpha: 0.5 } },
  mars: {
    base: '#b65f33',
    blotch: [
      { color: '#7c4526', n: 26, rMin: 12, rMax: 52, alpha: 0.4 }, // basalt plains (Syrtis…)
      { color: '#cf9a63', n: 18, rMin: 8, rMax: 30, alpha: 0.35 }, // dusty highlands
    ],
    caps: { color: '#f4efe8', latDeg: 76, north: true, south: true },
    speckle: 0.4,
  },
  jupiter: {
    base: '#d8b88a',
    bands: { colors: ['#f0e2c4', '#c69a63', '#f4ead2', '#b98a58', '#eadbb8', '#cfa671', '#f0e4ca', '#c1925c'], turb: 5, alpha: 1 },
    spot: { color: '#c25a3a', u: 0.31, v: 0.63, w: 42, h: 17 }, // the Great Red Spot (~22° S)
  },
  saturn: {
    base: '#e3d6a8',
    bands: { colors: ['#eee2bc', '#dcc994', '#f2e8c8', '#d5c28c', '#e9dcb2'], turb: 2.5, alpha: 0.9 },
  },
  uranus: { base: '#9fdcea', bands: { colors: ['#a8e2ee', '#96d4e4'], turb: 1.5, alpha: 0.5 } },
  neptune: {
    base: '#3f63d6',
    bands: { colors: ['#4a6edd', '#3557c2', '#4d72e2'], turb: 3, alpha: 0.7 },
    spot: { color: '#2b479f', u: 0.62, v: 0.6, w: 26, h: 12 },
  },
  io: {
    base: '#d9c96a',
    blotch: [
      { color: '#b8471f', n: 34, rMin: 3, rMax: 12, alpha: 0.75 }, // volcanic rings
      { color: '#efe9c4', n: 22, rMin: 6, rMax: 20, alpha: 0.5 }, // sulphur frost
    ],
    speckle: 0.3,
  },
  europa: {
    base: '#cfc8b8',
    cracks: { color: '#a05a3c', n: 46, alpha: 0.55 }, // the lineae
    blotch: [{ color: '#bfb5a2', n: 14, rMin: 10, rMax: 30, alpha: 0.3 }],
  },
  ganymede: { base: '#a89f92', blotch: [{ color: '#877c6e', n: 14, rMin: 14, rMax: 48, alpha: 0.45 }], speckle: 0.5 },
  callisto: { base: '#877c6f', blotch: [{ color: '#6e645a', n: 30, rMin: 5, rMax: 20, alpha: 0.4 }], speckle: 1 },
  titan: { base: '#d8a94e', bands: { colors: ['#e0b45c', '#cf9f44'], turb: 4, alpha: 0.5 } },
  enceladus: { base: '#eef2f5', cracks: { color: '#b8c8d6', n: 14, alpha: 0.5 } },
  triton: { base: '#dcc8b8', blotch: [{ color: '#caa290', n: 20, rMin: 6, rMax: 18, alpha: 0.4 }], caps: { color: '#efe9e2', latDeg: 55, south: true }, speckle: 0.4 },
  iapetus: { base: '#cfc5ae', twoFace: '#403428', speckle: 0.6 },
};

/** a serviceable generic icy/rocky moon for everyone without a bespoke spec */
function genericSpec(hex: number): WorldSpec {
  const c = `#${new Color(hex).getHexString()}`;
  return { base: c, blotch: [{ color: '#00000022', n: 24, rMin: 4, rMax: 16, alpha: 0.2 }], speckle: 0.7 };
}

function makeTexture(spec: WorldSpec, seed: number): CanvasTexture {
  const rng = mulberry32(seed);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = spec.base;
  g.fillRect(0, 0, W, H);

  if (spec.bands) {
    const { colors, turb, alpha } = spec.bands;
    const n = colors.length * 2;
    const bandH = H / n;
    g.globalAlpha = alpha ?? 1;
    for (let b = 0; b < n; b++) {
      g.fillStyle = colors[b % colors.length]!;
      const y0 = b * bandH;
      // integer wave counts keep the wobble 2π-periodic across the map — no seam
      const k1 = 3 + ((rng() * 4) | 0);
      const k2 = 2 + ((rng() * 4) | 0);
      const p1 = rng() * Math.PI * 2;
      const p2 = rng() * Math.PI * 2;
      g.beginPath();
      g.moveTo(0, y0 + Math.sin(p1) * turb);
      for (let x = 0; x <= W; x += 8) {
        g.lineTo(x, y0 + Math.sin((x / W) * Math.PI * 2 * k1 + p1) * turb);
      }
      for (let x = W; x >= 0; x -= 8) {
        g.lineTo(x, y0 + bandH + Math.sin((x / W) * Math.PI * 2 * k2 + p2) * turb);
      }
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
  }

  for (const bl of spec.blotch ?? []) {
    g.globalAlpha = bl.alpha;
    g.fillStyle = bl.color;
    for (let i = 0; i < bl.n; i++) {
      const x = rng() * W;
      const y = H * (0.15 + rng() * 0.7); // keep off the poles
      const r = bl.rMin + rng() * (bl.rMax - bl.rMin);
      const ry = r * (0.4 + rng() * 0.5);
      const rot = rng() * Math.PI;
      g.beginPath();
      g.ellipse(x, y, r, ry, rot, 0, Math.PI * 2);
      g.fill();
      // wrap BOTH edges so the u=0/1 seam is continuous
      if (x + r > W) { g.beginPath(); g.ellipse(x - W, y, r, ry, rot, 0, Math.PI * 2); g.fill(); }
      if (x - r < 0) { g.beginPath(); g.ellipse(x + W, y, r, ry, rot, 0, Math.PI * 2); g.fill(); }
    }
    g.globalAlpha = 1;
  }

  if (spec.cracks) {
    g.globalAlpha = spec.cracks.alpha;
    g.strokeStyle = spec.cracks.color;
    for (let i = 0; i < spec.cracks.n; i++) {
      g.lineWidth = 0.6 + rng() * 1.2;
      let x = rng() * W;
      let y = H * (0.1 + rng() * 0.8);
      g.beginPath();
      g.moveTo(x, y);
      const steps = 6 + (rng() * 10) | 0;
      const dirX = rng() < 0.5 ? -1 : 1;
      for (let s = 0; s < steps; s++) {
        x += dirX * (14 + rng() * 30);
        y += (rng() - 0.5) * 26;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  if (spec.spot) {
    const { color, u, v, w, h } = spec.spot;
    g.globalAlpha = 0.9;
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(u * W, v * H, w, h, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.35;
    g.strokeStyle = '#f4e6cc';
    g.lineWidth = 3;
    g.stroke();
    g.globalAlpha = 1;
  }

  if (spec.caps) {
    const capH = (1 - spec.caps.latDeg / 90) * (H / 2);
    const grad = (y0: number, y1: number) => {
      const gr = g.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, spec.caps!.color);
      gr.addColorStop(1, `${spec.caps!.color}00`);
      return gr;
    };
    if (spec.caps.north ?? true) { g.fillStyle = grad(0, capH * 1.4); g.fillRect(0, 0, W, capH * 1.4); }
    if (spec.caps.south ?? false) { g.fillStyle = grad(H, H - capH * 1.4); g.fillRect(0, H - capH * 1.4, W, capH * 1.4); }
  }

  if (spec.twoFace) {
    // Iapetus: the leading hemisphere is coal-dark — half the map, softened edges
    g.globalAlpha = 0.92;
    g.fillStyle = spec.twoFace;
    g.beginPath();
    g.ellipse(W * 0.28, H / 2, W * 0.22, H * 0.44, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }

  if (spec.speckle) {
    const n = spec.speckle * 2200;
    for (let i = 0; i < n; i++) {
      const l = rng();
      g.fillStyle = l < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.10)';
      const r = 0.5 + rng() * 1.6;
      g.fillRect(rng() * W, rng() * H, r, r);
    }
  }

  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export interface SurfaceEntry {
  id: string;
  radiusAU: number;
  world: Vector3; // LIVE reference to the body's absolute position
  parentWorld: Vector3 | null; // moons: the planet they orbit (null = the Sun at origin)
  rotationHours: number;
  mesh: Mesh;
  visible: boolean;
}

/** real equirect photo maps (Solar System Scope, CC-BY 4.0) served from public/ —
 *  present in hosted/dev builds, absent from the offline single-file (procedural fallback) */
const REAL_TEX: Record<string, string> = {
  mercury: 'textures/2k_mercury.jpg',
  venus: 'textures/2k_venus_atmosphere.jpg',
  mars: 'textures/2k_mars.jpg',
  jupiter: 'textures/2k_jupiter.jpg',
  saturn: 'textures/2k_saturn.jpg',
  uranus: 'textures/2k_uranus.jpg',
  neptune: 'textures/2k_neptune.jpg',
};
const texLoader = new TextureLoader();

export class PlanetSurfaces {
  readonly group = new Group();
  readonly entries: SurfaceEntry[] = [];
  private readonly light = new DirectionalLight(0xffffff, 2.6);
  private readonly lightTarget = new Object3D();
  private readonly tmp = new Vector3();

  constructor() {
    this.group.add(this.light, this.lightTarget);
    this.light.target = this.lightTarget;
    this.light.visible = false;
  }

  /** register a world (id must match its FocusTarget/pickable id) */
  add(id: string, radiusAU: number, world: Vector3, parentWorld: Vector3 | null, rotationHours: number, colorFallback: number, ring?: { innerR: number; outerR: number; tiltDeg: number }): void {
    const spec = SPECS[id] ?? genericSpec(colorFallback);
    const tex = makeTexture(spec, 0x5eed + id.length * 131 + id.charCodeAt(0) * 7);
    const mesh = new Mesh(
      new SphereGeometry(radiusAU, 48, 24),
      new MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }),
    );
    mesh.visible = false;
    if (ring) {
      const rg = new RingGeometry(ring.innerR, ring.outerR, 128, 1);
      // radial stripe texture via vertex colours: alternate translucent bands
      const colors = new Float32Array(rg.attributes.position!.count * 3);
      const pos = rg.attributes.position!;
      for (let i = 0; i < pos.count; i++) {
        const r = Math.hypot(pos.getX(i), pos.getY(i));
        const t = (r - ring.innerR) / (ring.outerR - ring.innerR);
        // ring bands: strong radial stripes + the Cassini-division dip at ~0.63
        let stripe = 0.35 + 0.65 * Math.abs(Math.sin(t * 26 + Math.sin(t * 9) * 2));
        if (Math.abs(t - 0.63) < 0.035) stripe *= 0.25;
        colors[i * 3] = 0.93 * stripe;
        colors[i * 3 + 1] = 0.87 * stripe;
        colors[i * 3 + 2] = 0.7 * stripe;
      }
      rg.setAttribute('color', new BufferAttribute(colors, 3));
      // NORMAL blending — an additive ring blows out white where it crosses the lit disc
      const rmesh = new Mesh(rg, new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.82, side: DoubleSide, depthWrite: false }));
      rmesh.rotation.x = Math.PI / 2 - (ring.tiltDeg * Math.PI) / 180; // equatorial plane, tilted
      mesh.add(rmesh);
    }
    this.group.add(mesh);
    this.entries.push({ id, radiusAU, world, parentWorld, rotationHours, mesh, visible: false });
    // upgrade to the real photographic map when it's available (hosted builds);
    // the procedural texture remains the offline fallback
    const real = REAL_TEX[id];
    if (real) {
      texLoader.load(real, (t) => {
        t.colorSpace = SRGBColorSpace;
        const m = mesh.material as MeshStandardMaterial;
        m.map = t;
        m.needsUpdate = true;
      }, undefined, () => { /* keep procedural */ });
    }
  }

  /** per-frame: show globes near the camera, spin them, aim the shared sun light */
  update(fo: FloatingOrigin, camWorld: Vector3, seconds: number): void {
    let nearest: SurfaceEntry | null = null;
    let nearestD = Infinity;
    for (const e of this.entries) {
      const d = e.world.distanceTo(camWorld);
      e.visible = d < e.radiusAU * SHOW_RADII;
      e.mesh.visible = e.visible;
      if (!e.visible) continue;
      fo.place(e.mesh, e.world);
      e.mesh.rotation.y = (seconds / (Math.abs(e.rotationHours) * 3600)) * Math.PI * 2 * Math.sign(e.rotationHours);
      if (d < nearestD) { nearestD = d; nearest = e; }
    }
    // one shared light: from the Sun (the absolute origin) toward the nearest lit world.
    // every visible globe is within a fraction of an AU of it — the direction serves all.
    this.light.visible = nearest !== null;
    if (nearest) {
      this.light.position.copy(fo.rel(this.tmp.set(0, 0, 0), this.tmp)); // the Sun, camera-relative
      fo.place(this.lightTarget, (nearest as SurfaceEntry).world);
    }
  }

  /** the entry for a body id, if it has a globe */
  byId(id: string): SurfaceEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  setAllHidden(): void {
    for (const e of this.entries) { e.visible = false; e.mesh.visible = false; }
    this.light.visible = false;
  }
}
