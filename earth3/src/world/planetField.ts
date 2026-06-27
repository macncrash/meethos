// Procedural planet surface — continents, elevation, habitability — for a fresh
// "3rd Earth". A handful of continent seeds on the sphere sum into an elevation
// field; sea level splits land from ocean; habitability (carrying capacity for
// the civilization layer) falls off toward the poles. Also bakes an equirect
// texture for the globe. Deterministic from a seed.
import { CanvasTexture, Color, Vector3, type Texture } from 'three';
import { mulberry32, type Rng } from '../core/rng';

interface Blob {
  dir: Vector3;
  reach: number; // angular radius (radians)
  amp: number;
}

export class PlanetField {
  private readonly blobs: Blob[] = [];
  private readonly seaLevel: number;

  constructor(seed = 0x3a4d) {
    const rng = mulberry32(seed);
    const n = 7 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      this.blobs.push({
        dir: randomDir(rng),
        reach: 0.5 + rng() * 0.8,
        amp: 0.6 + rng() * 0.9,
      });
    }
    // smaller subcontinents / islands for texture
    for (let i = 0; i < 18; i++) {
      this.blobs.push({ dir: randomDir(rng), reach: 0.12 + rng() * 0.3, amp: 0.4 + rng() * 0.6 });
    }
    this.seaLevel = 0.55;
  }

  /** elevation at a unit-sphere direction: ~0 deep ocean … >seaLevel is land. */
  elevation(dir: Vector3): number {
    let e = 0;
    for (const b of this.blobs) {
      const ang = Math.acos(Math.min(1, Math.max(-1, dir.dot(b.dir))));
      const x = ang / b.reach;
      if (x < 1) e += b.amp * (1 - x * x) * (1 - x * x); // smooth bump
    }
    return e;
  }

  isLand(dir: Vector3): boolean {
    return this.elevation(dir) > this.seaLevel;
  }

  /** carrying-capacity weight 0..1; 0 over ocean, peaks in temperate latitudes. */
  habitability(dir: Vector3): number {
    const e = this.elevation(dir);
    if (e <= this.seaLevel) return 0;
    const lat = Math.asin(Math.max(-1, Math.min(1, dir.y))); // -π/2..π/2
    const temperate = Math.cos(lat); // warm near equator, cold at poles
    const poleIce = Math.abs(lat) > 1.2 ? 0.15 : 1; // ice caps barely habitable
    const land = Math.min(1, (e - this.seaLevel) / 0.6);
    return Math.max(0, temperate * poleIce * (0.4 + 0.6 * land));
  }

  /** Bake an equirectangular surface texture (ocean → coast → land → ice). */
  texture(width = 768, height = 384): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(width, height);
    const d = img.data;
    const dir = new Vector3();
    const col = new Color();

    for (let y = 0; y < height; y++) {
      const lat = (0.5 - y / height) * Math.PI;
      const cosLat = Math.cos(lat);
      const sinLat = Math.sin(lat);
      for (let x = 0; x < width; x++) {
        const lon = (x / width) * Math.PI * 2 - Math.PI;
        dir.set(cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon));
        const e = this.elevation(dir);
        this.shade(e, lat, col);
        const o = (y * width + x) * 4;
        d[o] = col.r * 255;
        d[o + 1] = col.g * 255;
        d[o + 2] = col.b * 255;
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }

  private shade(e: number, lat: number, out: Color): void {
    const ice = Math.abs(lat) > 1.18;
    if (e <= this.seaLevel) {
      const depth = (this.seaLevel - e) / this.seaLevel; // 0 coast … 1 abyss
      out.setRGB(0.04 + 0.05 * (1 - depth), 0.16 + 0.18 * (1 - depth), 0.32 + 0.28 * (1 - depth));
      return;
    }
    if (ice) {
      out.setRGB(0.82, 0.87, 0.93);
      return;
    }
    const h = Math.min(1, (e - this.seaLevel) / 1.25);
    if (h < 0.1) out.setRGB(0.76, 0.71, 0.5); // coastal sand
    else if (h < 0.82) out.setRGB(0.16 + 0.16 * h, 0.46 - 0.14 * h, 0.18); // green → forest
    else out.setRGB(0.46, 0.41, 0.35); // mountain rock (rare, high peaks)
  }
}

function randomDir(rng: Rng): Vector3 {
  const u = rng() * 2 - 1;
  const t = rng() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return new Vector3(s * Math.cos(t), u, s * Math.sin(t));
}
