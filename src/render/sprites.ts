// Procedural sprite textures (no asset files). A soft radial glow used for stars,
// the Sun's halo, and settlement markers.
import { CanvasTexture, Color, type Texture } from 'three';

const cache = new Map<string, Texture>();

export function glowTexture(color = new Color(0xffffff), size = 128): Texture {
  const key = `${color.getHexString()}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  const { r: cr, g: cg, b: cb } = color;
  const rgb = `${Math.round(cr * 255)}, ${Math.round(cg * 255)}, ${Math.round(cb * 255)}`;
  grad.addColorStop(0.0, `rgba(${rgb}, 1)`);
  grad.addColorStop(0.25, `rgba(${rgb}, 0.65)`);
  grad.addColorStop(0.5, `rgba(${rgb}, 0.25)`);
  grad.addColorStop(1.0, `rgba(${rgb}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new CanvasTexture(canvas);
  cache.set(key, tex);
  return tex;
}

/** A round, soft-edged dot used as the point-sprite for starfields. */
export function dotTexture(size = 64): Texture {
  const key = `dot:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(canvas);
  cache.set(key, tex);
  return tex;
}
