// The TELESCOPE tier: the rest of the HYG catalogue — ~99,000 real stars between
// naked-eye (mag 6.5) and mag 12, with parallax distances. Lazy-loaded from public/
// on first use (absent from the offline single-file — the naked-eye tier stands alone),
// shown in OBSERVER mode: stand somewhere and the sky is 12× deeper than the eye sees.
// Apparent magnitudes re-project from the observer exactly like the main catalogue —
// the first step toward the Gaia HEALPix tiers on the roadmap.
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, Points, ShaderMaterial, Vector3 } from 'three';
import { blackbodyColor } from '../core/color';
import { AU_PER_PC } from '../meethos/units';

const STRIDE = 6; // dirX, dirY, dirZ, distPc, absmag, ci
const LIMIT = 11.5; // faintest rendered apparent magnitude

function tempFromBV(ci: number): number {
  return 4600 * (1 / (0.92 * ci + 1.7) + 1 / (0.92 * ci + 0.62));
}

export class FaintStars {
  readonly group = new Group();
  private worldPos?: Float32Array;
  private absmag?: Float32Array;
  private amagAttr?: BufferAttribute;
  private readonly observer = new Vector3();
  private loading = false;
  count = 0;

  /** idempotent lazy load — call when the tier is first needed */
  load(): void {
    if (this.loading) return;
    this.loading = true;
    void (async () => {
      try {
        const raw = new Float32Array(await (await fetch('faint.bin')).arrayBuffer());
        const n = Math.floor(raw.length / STRIDE);
        const pos = new Float32Array(n * 3);
        const col = new Float32Array(n * 3);
        const amag = new Float32Array(n);
        const absmag = new Float32Array(n);
        const c = new Color();
        for (let i = 0; i < n; i++) {
          const o = i * STRIDE;
          const au = raw[o + 3]! * AU_PER_PC;
          pos[i * 3] = raw[o]! * au;
          pos[i * 3 + 1] = raw[o + 1]! * au;
          pos[i * 3 + 2] = raw[o + 2]! * au;
          absmag[i] = raw[o + 4]!;
          amag[i] = absmag[i]! + 5 * Math.log10(Math.max(1e-9, raw[o + 3]!) / 10);
          blackbodyColor(tempFromBV(raw[o + 5]!), c);
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        }
        this.worldPos = pos;
        this.absmag = absmag;
        const geom = new BufferGeometry();
        geom.setAttribute('position', new BufferAttribute(pos, 3));
        geom.setAttribute('acolor', new BufferAttribute(col, 3));
        this.amagAttr = new BufferAttribute(amag, 1);
        geom.setAttribute('amag', this.amagAttr);
        const mat = new ShaderMaterial({
          uniforms: {},
          vertexShader: /* glsl */ `
            attribute float amag;
            attribute vec3 acolor;
            varying vec3 vColor;
            varying float vB;
            void main() {
              vColor = acolor;
              if (amag > ${LIMIT.toFixed(1)}) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
              vB = clamp((${LIMIT.toFixed(1)} - amag) / 7.0, 0.0, 1.0);
              gl_PointSize = 0.7 + vB * 1.6;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
          fragmentShader: /* glsl */ `
            precision mediump float;
            varying vec3 vColor;
            varying float vB;
            void main() { gl_FragColor = vec4(vColor, 0.10 + 0.45 * vB); }`,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
        });
        const pts = new Points(geom, mat);
        pts.frustumCulled = false;
        this.group.add(pts);
        this.count = n;
      } catch {
        // offline / single-file build: the naked-eye tier stands alone
      }
    })();
  }

  /** re-project apparent magnitudes from the observer (same physics as the main tier) */
  setObserver(world: Vector3): void {
    if (!this.worldPos || !this.absmag || !this.amagAttr) return;
    if (world.distanceToSquared(this.observer) < 1e-6) return;
    this.observer.copy(world);
    const amag = this.amagAttr.array as Float32Array;
    for (let i = 0; i < amag.length; i++) {
      const dx = this.worldPos[i * 3]! - world.x;
      const dy = this.worldPos[i * 3 + 1]! - world.y;
      const dz = this.worldPos[i * 3 + 2]! - world.z;
      const dpc = Math.max(1e-9, Math.sqrt(dx * dx + dy * dy + dz * dz) / AU_PER_PC);
      amag[i] = this.absmag[i]! + 5 * Math.log10(dpc / 10);
    }
    this.amagAttr.needsUpdate = true;
  }
}
