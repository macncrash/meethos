// Color utilities. hslToRgb is borrowed verbatim from ethersim (src/core/color.ts);
// the stellar/temperature helpers are earth3-specific.
import { Color } from 'three';

/** hsl -> rgb (h,s,l in [0,1]) writing into out[off..off+3). */
export function hslToRgb(h: number, s: number, l: number, out: Float32Array, off: number): void {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  out[off] = f(0);
  out[off + 1] = f(8);
  out[off + 2] = f(4);
}

/**
 * Approximate blackbody color for a star temperature (Kelvin), 1000–40000 K.
 * Cheap polynomial fit — good enough to make O/B stars blue and M stars red.
 */
export function blackbodyColor(kelvin: number, target = new Color()): Color {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
  }
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.52 * Math.log(t - 10) - 305.04;
  target.setRGB(clamp01(r / 255), clamp01(g / 255), clamp01(b / 255));
  return target;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
