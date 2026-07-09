// The REAL Starlink shell: ~10,700 live two-line element sets (Celestrak GP snapshot)
// propagated with SGP4 (satellite.js) — the actual constellation, not a stylization.
// ECI/TEME km → the render frame with the same equatorial→ecliptic map as the star
// catalogue, Earth-centred. Propagation dates are clamped to ±30 days around each
// element's epoch (SGP4 diverges beyond that), so far-future scrubs show the nearest
// valid configuration; the REWIND gate is honest — before a sat's launch year it is gone.
import { BufferAttribute, BufferGeometry, Group, Points, PointsMaterial, Vector3 } from 'three';
import * as satellite from 'satellite.js';
import type { FloatingOrigin } from '../meethos/floatingOrigin';
import { J2000_UTC_MS } from '../core/units';
import tleUrl from '../data/starlink.tle?url';

const OBL = (23.4392911 * Math.PI) / 180;
const CE = Math.cos(OBL);
const SE = Math.sin(OBL);
const KM_PER_AU = 149_597_870.7;
const BATCH = 600; // sats propagated per frame (full refresh ≈ every 18 frames)
const HIDE = 1e12; // parked far away = culled

export class TleShell {
  readonly group = new Group();
  private sats: Array<{ rec: satellite.SatRec; launchYear: number; epochMs: number }> = [];
  private geom?: BufferGeometry;
  private cursor = 0;
  count = 0;

  async load(): Promise<void> {
    const text = await (await fetch(tleUrl)).text();
    const lines = text.split('\n').map((l) => l.trimEnd()).filter((l) => l.length > 0);
    for (let i = 0; i + 2 < lines.length + 1; i += 3) {
      const l1 = lines[i + 1];
      const l2 = lines[i + 2];
      if (!l1 || !l2 || !l1.startsWith('1 ') || !l2.startsWith('2 ')) continue;
      const rec = satellite.twoline2satrec(l1, l2);
      const yy = Number(l1.slice(9, 11)); // international designator launch year
      const launchYear = yy >= 57 ? 1900 + yy : 2000 + yy;
      // TLE epoch: yyddd.ddd
      const ey = rec.epochyr < 57 ? 2000 + rec.epochyr : 1900 + rec.epochyr;
      const epochMs = Date.UTC(ey, 0, 1) + (rec.epochdays - 1) * 86400_000;
      this.sats.push({ rec, launchYear, epochMs });
    }
    this.count = this.sats.length;
    const pos = new Float32Array(this.count * 3).fill(HIDE);
    this.geom = new BufferGeometry();
    this.geom.setAttribute('position', new BufferAttribute(pos, 3));
    const pts = new Points(this.geom, new PointsMaterial({ color: 0x9fe8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.5, depthWrite: false }));
    pts.frustumCulled = false;
    this.group.add(pts);
  }

  /** propagate the next batch and place the shell at Earth (call once per frame) */
  update(fo: FloatingOrigin, earthWorld: Vector3, simSeconds: number, visible: boolean): void {
    this.group.visible = visible && this.count > 0;
    if (!this.group.visible || !this.geom) return;
    fo.place(this.group, earthWorld);
    const attr = this.geom.getAttribute('position') as BufferAttribute;
    const a = attr.array as Float32Array;
    const simMs = J2000_UTC_MS + simSeconds * 1000;
    const simYear = 2000 + simSeconds / 3.15576e7;
    for (let n = 0; n < BATCH && this.count > 0; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.count;
      const s = this.sats[i]!;
      if (simYear < s.launchYear) { a[i * 3] = HIDE; continue; } // not launched yet
      const t = Math.max(s.epochMs - 30 * 86400_000, Math.min(s.epochMs + 30 * 86400_000, simMs));
      const pv = satellite.propagate(s.rec, new Date(t));
      const p = pv?.position;
      if (!p || typeof p === 'boolean') { a[i * 3] = HIDE; continue; }
      // TEME(equatorial) km → render frame AU, Earth-centred
      a[i * 3] = p.x / KM_PER_AU;
      a[i * 3 + 1] = (-p.y * SE + p.z * CE) / KM_PER_AU;
      a[i * 3 + 2] = (p.y * CE + p.z * SE) / KM_PER_AU;
    }
    attr.needsUpdate = true;
  }
}
