// Constellation asterism figures drawn on the sky. The real IAU stick-figures (from
// d3-celestial, BSD) are given as RA/Dec polylines; feeding each vertex through the same
// eclipticDirFromRaDec() the star catalogue uses puts the lines exactly on the stars.
//
// The figures live on a fixed-direction celestial sphere (the group is NOT rebased by the
// floating origin — a constellation is a DIRECTION, not a place), so they read correctly
// from Earth/near-Sun observer vantages, which is the only place asterisms mean anything.
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Vector3,
  type Sprite,
  type SpriteMaterial,
} from 'three';
import { eclipticDirFromRaDec } from '../meethos/frames';
import { CONSTELLATIONS } from '../data/constellations';
import { makeLabel } from '../render/label';

const SKY_R = 1e7; // AU — a celestial-sphere radius well inside the observer far plane (1e14)
const LABEL_R = SKY_R * 0.98;

export class ConstellationFigures {
  readonly group = new Group();
  private readonly lines: LineSegments;
  private readonly ranges = new Map<string, { start: number; count: number; centroid: Vector3 }>();
  private label: Sprite | null = null;
  private activeId: string | null = null;

  constructor() {
    const positions: number[] = [];
    const dir = new Vector3();
    let cursor = 0; // running vertex index
    for (const c of CONSTELLATIONS) {
      const start = cursor;
      const centroid = new Vector3();
      for (let i = 0; i < c.seg.length; i += 2) {
        eclipticDirFromRaDec(c.seg[i]!, c.seg[i + 1]!, dir);
        positions.push(dir.x * SKY_R, dir.y * SKY_R, dir.z * SKY_R);
        centroid.add(dir);
        cursor++;
      }
      const count = cursor - start;
      if (count > 0) centroid.divideScalar(count).normalize();
      this.ranges.set(c.id, { start, count, centroid });
    }
    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geom.setDrawRange(0, 0); // nothing drawn until a constellation is selected
    this.lines = new LineSegments(
      geom,
      new LineBasicMaterial({ color: 0x8fb7ff, transparent: true, opacity: 0.7, depthTest: false, depthWrite: false }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 3;
    this.group.add(this.lines);
    this.group.visible = false;
  }

  /** Show one constellation's figure (hiding any other). Returns its centroid direction
   *  (unit vector, render frame) so the caller can aim the observer camera at it. */
  setActive(id: string | null): Vector3 | null {
    this.activeId = id;
    const r = id ? this.ranges.get(id) : null;
    if (!r || r.count === 0) {
      this.lines.geometry.setDrawRange(0, 0);
      this.disposeLabel();
      this.group.visible = false;
      return null;
    }
    this.lines.geometry.setDrawRange(r.start, r.count);
    const name = CONSTELLATIONS.find((c) => c.id === id)?.name ?? id!;
    this.disposeLabel(); // makeLabel bakes text into a canvas texture → recreate (and free the old)
    this.label = makeLabel(name, 0xbcd3ff, 0.052);
    this.label.position.copy(r.centroid).multiplyScalar(LABEL_R);
    this.group.add(this.label);
    this.group.visible = true;
    return r.centroid.clone();
  }

  private disposeLabel(): void {
    if (!this.label) return;
    this.group.remove(this.label);
    const mat = this.label.material as SpriteMaterial;
    mat.map?.dispose();
    mat.dispose();
    this.label = null;
  }

  get active(): string | null {
    return this.activeId;
  }

  centroid(id: string): Vector3 | null {
    return this.ranges.get(id)?.centroid.clone() ?? null;
  }

  /** searchable list: full name + id + centroid direction */
  list(): Array<{ id: string; name: string }> {
    return CONSTELLATIONS.map((c) => ({ id: c.id, name: c.name }));
  }
}
