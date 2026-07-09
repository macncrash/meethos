// The full NGC/IC — 11,366 real deep-sky objects (OpenNGC, CC-BY-SA-4.0) as a
// DIRECTION layer: most have no reliable distance, so they live on the celestial
// sphere exactly as a survey catalogue does, shown in observer mode. Type-coloured
// points culled by magnitude; picking serves an honest card (no invented distances)
// with the real survey photo and a SIMBAD link. The curated 51 showpieces keep their
// true-3D placement in deepSky.ts — this is the catalogue behind them.
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, Points, ShaderMaterial, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import type { FocusTarget, InspectorInfo } from '../core/regime';

const SKY_R = 1e7; // AU — same fixed-direction sphere as the constellation figures
const STRIDE = 7; // dirX, dirY, dirZ, mag, sizeArcmin, typeCode, ±catalogNumber
const MAG_SHOW = 12.5;
const TYPE_WORD = ['galaxy', 'globular cluster', 'open cluster', 'nebula', 'planetary nebula', 'supernova remnant'];
const TYPE_COLOR = [0xcfe0ff, 0xffe3b8, 0xbfe0ff, 0xffb8cc, 0xa8f0da, 0xffc890];

export class NgcSky {
  readonly group = new Group();
  private raw?: Float32Array;
  private loading = false;
  private readonly _p = new Vector3();
  count = 0;

  load(): void {
    if (this.loading) return;
    this.loading = true;
    void (async () => {
      try {
        const raw = new Float32Array(await (await fetch('ngc.bin')).arrayBuffer());
        this.raw = raw;
        const n = Math.floor(raw.length / STRIDE);
        this.count = n;
        const pos = new Float32Array(n * 3);
        const col = new Float32Array(n * 3);
        const mag = new Float32Array(n);
        const c = new Color();
        for (let i = 0; i < n; i++) {
          const o = i * STRIDE;
          pos[i * 3] = raw[o]! * SKY_R;
          pos[i * 3 + 1] = raw[o + 1]! * SKY_R;
          pos[i * 3 + 2] = raw[o + 2]! * SKY_R;
          mag[i] = raw[o + 3]!;
          c.set(TYPE_COLOR[raw[o + 5]!] ?? 0xcfe0ff);
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        }
        const geom = new BufferGeometry();
        geom.setAttribute('position', new BufferAttribute(pos, 3));
        geom.setAttribute('acolor', new BufferAttribute(col, 3));
        geom.setAttribute('amag', new BufferAttribute(mag, 1));
        const mat = new ShaderMaterial({
          vertexShader: /* glsl */ `
            attribute float amag;
            attribute vec3 acolor;
            varying vec3 vC;
            varying float vB;
            void main() {
              vC = acolor;
              if (amag > ${MAG_SHOW.toFixed(1)}) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
              vB = clamp((${MAG_SHOW.toFixed(1)} - amag) / 9.0, 0.0, 1.0);
              gl_PointSize = 1.5 + vB * 3.0;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
          fragmentShader: /* glsl */ `
            precision mediump float;
            varying vec3 vC;
            varying float vB;
            void main() {
              vec2 q = gl_PointCoord - 0.5;
              if (dot(q, q) > 0.25) discard;
              gl_FragColor = vec4(vC, 0.25 + 0.5 * vB);
            }`,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
        });
        const pts = new Points(geom, mat);
        pts.frustumCulled = false;
        this.group.add(pts);
      } catch { /* offline — the curated tier stands alone */ }
    })();
  }

  nameOf(i: number): string {
    const n = this.raw![i * STRIDE + 6]!;
    return n >= 0 ? `NGC ${n}` : `IC ${-n}`;
  }

  /** screen-space pick against the catalogue (observer mode) */
  pickTarget(ndcX: number, ndcY: number, camera: PerspectiveCamera, camWorld: Vector3): FocusTarget | null {
    if (!this.raw || !this.group.visible) return null;
    const raw = this.raw;
    let best = -1;
    let bestD = 0.025 * 0.025;
    for (let i = 0; i < this.count; i++) {
      const o = i * STRIDE;
      if (raw[o + 3]! > MAG_SHOW) continue;
      // fixed-direction layer: the sphere is NOT rebased, so project dir×R − camWorld
      this._p.set(raw[o]! * SKY_R - camWorld.x, raw[o + 1]! * SKY_R - camWorld.y, raw[o + 2]! * SKY_R - camWorld.z).project(camera);
      if (this._p.z > 1) continue;
      const dx = this._p.x - ndcX;
      const dy = this._p.y - ndcY;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best >= 0 ? this.targetOf(best) : null;
  }

  targetOf(i: number): FocusTarget {
    const raw = this.raw!;
    const o = i * STRIDE;
    const name = this.nameOf(i);
    return {
      id: `ngc-${i}`,
      label: name,
      radius: 1,
      position: (out) => out.set(raw[o]! * SKY_R, raw[o + 1]! * SKY_R, raw[o + 2]! * SKY_R),
      info: () => this.card(i, name),
    };
  }

  private card(i: number, name: string): InspectorInfo {
    const raw = this.raw!;
    const o = i * STRIDE;
    // invert the render direction back to equatorial RA/Dec
    const X = raw[o]!, Y = raw[o + 1]!, Z = raw[o + 2]!;
    const OBL = (23.4392911 * Math.PI) / 180;
    const yEq = -Y * Math.sin(OBL) + Z * Math.cos(OBL);
    const zEq = Y * Math.cos(OBL) + Z * Math.sin(OBL);
    const raDeg = ((Math.atan2(yEq, X) * 180) / Math.PI + 360) % 360;
    const decDeg = (Math.asin(Math.max(-1, Math.min(1, zEq))) * 180) / Math.PI;
    const mag = raw[o + 3]!;
    const size = raw[o + 4]!;
    const type = TYPE_WORD[raw[o + 5]!] ?? 'object';
    const ident = encodeURIComponent(name);
    return {
      title: name,
      image: `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=CDS%2FP%2FDSS2%2Fcolor&ra=${raDeg.toFixed(4)}&dec=${decDeg.toFixed(4)}&fov=${Math.max(0.06, (size / 60) * 2.5).toFixed(3)}&width=220&height=150&format=jpg`,
      rows: [
        ['Type', type],
        ['App. mag', mag >= 15 ? '—' : mag.toFixed(1)],
      ],
      sections: [
        {
          title: 'Observation (J2000)',
          rows: [
            ['Right ascension', `${Math.floor(raDeg / 15)}h ${(((raDeg / 15) % 1) * 60).toFixed(1)}m`],
            ['Declination', `${decDeg < 0 ? '−' : '+'}${Math.abs(decDeg).toFixed(2)}°`],
            ['Angular size', size >= 60 ? `${(size / 60).toFixed(1)}°` : `${size.toFixed(1)}′`],
            ['Distance', '— (not in this catalogue)'],
          ],
        },
        {
          title: 'Databases',
          rows: [
            ['SIMBAD', `<a href="https://simbad.u-strasbg.fr/simbad/sim-id?Ident=${ident}" target="_blank" rel="noopener">data ↗</a>`],
          ],
        },
      ],
      blurb: 'From the full NGC/IC (OpenNGC) — a sky-direction catalogue entry; the 51 curated showpieces carry true 3D placement.',
    };
  }
}
