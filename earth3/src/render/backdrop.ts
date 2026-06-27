// A faint, static starfield that sits behind every regime so deep space never
// reads as empty black. Lives on a very large sphere and ignores depth.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  PointsMaterial,
} from 'three';
import { mulberry32 } from '../core/rng';
import { dotTexture } from './sprites';

export function createBackdropStars(count = 2600, radius = 9000): Points {
  const rng = mulberry32(0xbacc);
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rng() * 2 - 1;
    const t = rng() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const o = i * 3;
    pos[o] = s * Math.cos(t) * radius;
    pos[o + 1] = u * radius;
    pos[o + 2] = s * Math.sin(t) * radius;
  }
  const geom = new BufferGeometry();
  geom.setAttribute('position', new BufferAttribute(pos, 3));
  const mat = new PointsMaterial({
    size: 18,
    map: dotTexture(),
    color: 0x9fb0d8,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new Points(geom, mat);
  points.renderOrder = -1;
  points.frustumCulled = false;
  return points;
}
