// The real naked-eye sky — ~8,900 stars from the HYG database (astronexus/
// HYG-Database, CC BY-SA) at their true 3D positions (parallax distances), rendered
// by APPARENT MAGNITUDE, not angular size: a star is a point source, so its on-screen
// brightness is its flux, and distance is already baked into the magnitude. Crucially,
// apparent magnitude is recomputed from the OBSERVER's position (setObserver) using the
// absolute magnitude — so the same catalog gives the correct sky from Earth, Mars, or
// Alpha Centauri (from which Earth's Sun becomes just another star).
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Points,
  ShaderMaterial,
  Vector3,
  type Texture,
} from 'three';
import { blackbodyColor } from '../core/color';
import { dotTexture } from '../render/sprites';
import { AU_PER_PC } from '../meethos/units';
import starsUrl from '../data/stars.bin?url';

const STRIDE = 6; // per star: dirX, dirY, dirZ, distPc, absmag, ci
const MAG_LIMIT = 6.5; // faintest naked-eye magnitude in the catalog

/** B–V colour index → effective temperature (Ballesteros 2012). */
function tempFromBV(ci: number): number {
  return 4600 * (1 / (0.92 * ci + 1.7) + 1 / (0.92 * ci + 0.62));
}

function starfieldMaterial(map: Texture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uMap: { value: map }, uMinPx: { value: 1.0 }, uMaxPx: { value: 7.0 }, uGain: { value: 1.0 } },
    // constant screen size (NO distance attenuation) driven by apparent magnitude
    vertexShader: /* glsl */ `
      attribute float amag;
      attribute vec3 acolor;
      varying vec3 vColor;
      varying float vBright;
      uniform float uMinPx;
      uniform float uMaxPx;
      void main() {
        vColor = acolor;
        float b = clamp((${MAG_LIMIT.toFixed(1)} - amag) / 8.0, 0.0, 1.0); // 0 faint … 1 brightest
        vBright = b;
        gl_PointSize = uMinPx + b * b * (uMaxPx - uMinPx);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform sampler2D uMap;
      uniform float uGain;
      varying vec3 vColor;
      varying float vBright;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        if (t.a < 0.04) discard;
        gl_FragColor = vec4(vColor, t.a * uGain * (0.18 + 0.82 * vBright));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

export class StarCatalog {
  /** rides the floating origin — the caller sets group.position = -camWorld each frame */
  readonly group = new Group();

  private worldPos?: Float32Array; // absolute AU positions, 3 per star
  private absmag?: Float32Array;
  private amagAttr?: BufferAttribute;
  private mat?: ShaderMaterial;
  /** the current observer position in AU (default: the origin = Earth/Sun) */
  private readonly observer = new Vector3();

  async load(): Promise<void> {
    const raw = new Float32Array(await (await fetch(starsUrl)).arrayBuffer());
    const n = Math.floor(raw.length / STRIDE);
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const amag = new Float32Array(n);
    const absmag = new Float32Array(n);
    const c = new Color();
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      const dpc = raw[o + 3]!;
      const distAu = dpc * AU_PER_PC;
      pos[i * 3] = raw[o]! * distAu;
      pos[i * 3 + 1] = raw[o + 1]! * distAu;
      pos[i * 3 + 2] = raw[o + 2]! * distAu;
      absmag[i] = raw[o + 4]!;
      blackbodyColor(tempFromBV(raw[o + 5]!), c);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      amag[i] = absmag[i]! + 5 * Math.log10(Math.max(1e-6, dpc) / 10); // apparent mag from Earth
    }
    this.worldPos = pos;
    this.absmag = absmag;

    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(pos, 3));
    geom.setAttribute('acolor', new BufferAttribute(col, 3));
    this.amagAttr = new BufferAttribute(amag, 1);
    geom.setAttribute('amag', this.amagAttr);
    this.mat = starfieldMaterial(dotTexture());
    const points = new Points(geom, this.mat);
    points.frustumCulled = false;
    this.group.add(points);
  }

  /** overall brightness (0..1) — lets the caller fade the sky by zoom band */
  setGain(g: number): void {
    if (this.mat) this.mat.uniforms.uGain!.value = g;
  }

  /** re-project apparent magnitudes from a new observer position (AU). This is what
   *  makes the sky correct from anywhere: brightness = absmag + 5·log10(d_obs/10). */
  setObserver(world: Vector3): void {
    if (!this.worldPos || !this.absmag || !this.amagAttr) return;
    if (world.distanceToSquared(this.observer) < 1e-6) return; // unchanged
    this.observer.copy(world);
    const amag = this.amagAttr.array as Float32Array;
    const pos = this.worldPos;
    const abs = this.absmag;
    for (let i = 0; i < amag.length; i++) {
      const dx = pos[i * 3]! - world.x;
      const dy = pos[i * 3 + 1]! - world.y;
      const dz = pos[i * 3 + 2]! - world.z;
      const dpc = Math.max(1e-9, Math.sqrt(dx * dx + dy * dy + dz * dz) / AU_PER_PC);
      amag[i] = abs[i]! + 5 * Math.log10(dpc / 10);
    }
    this.amagAttr.needsUpdate = true;
  }
}
