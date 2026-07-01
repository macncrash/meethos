// Layer 3 — the Milky Way × Andromeda merger ("Milkomeda"), the STScI/JPL viz.
//
// A live RESTRICTED N-BODY simulation (Toomre & Toomre 1972): each galaxy is a thin
// rotating disk of TEST PARTICLES orbiting a point-mass centre; the two centres fall
// together on a two-body orbit with a dynamical-friction drag so they actually merge
// (rather than orbit forever). As they pass, the mutual tides raise the characteristic
// tails and bridges, then the disks phase-mix into one spheroid over ~6 Gyr.
//
// Integrated in kpc / Gyr (f64) for numerical sanity; rendered in AU (× KPC_AU) so it
// rides the floating origin like the galaxy cloud.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Points,
  PointsMaterial,
  Vector3,
} from 'three';
import { mulberry32, gaussian } from '../core/rng';
import { dotTexture } from '../render/sprites';
import { AU_PER_KPC } from '../meethos/units';

const G = 1.7e6; // kpc³ / (mass · Gyr²) — tuned so the merger runs over ~6 Gyr
const SOFT2 = 9; // force softening² (kpc²) — no singularities near a centre
const START_SEP = 250; // kpc — initial separation (compressed from the real 780 for framing)
const APPROACH = 110; // kpc/Gyr ≈ 108 km/s — Andromeda's real blueshifted approach speed
const TANGENTIAL = 40; // kpc/Gyr — a grazing pass so the encounter throws tidal tails/bridges

interface Galaxy {
  center: Vector3;
  vel: Vector3;
  mass: number;
  u: Vector3; // disk plane basis
  w: Vector3;
  color: Color;
  hot: Color;
}

export class GalaxyMerger {
  /** rides the floating origin — caller sets group.position = -camWorld each frame */
  readonly group = new Group();
  /** framing distance in AU (both galaxies + the tidal excursion fit) */
  readonly frameAu = START_SEP * 1.7 * AU_PER_KPC;

  private readonly perGalaxy: number;
  private readonly n: number;
  private readonly pos: Float64Array; // kpc, 3/star
  private readonly vel: Float64Array; // kpc/Gyr
  private readonly which: Uint8Array; // 0 = Milky Way, 1 = Andromeda
  private readonly render: Float32Array; // AU, 3/star (the GPU buffer)
  private readonly posAttr: BufferAttribute;
  private readonly points: Points;
  private readonly mw: Galaxy;
  private readonly m31: Galaxy;
  private t = 0; // Gyr since the run started

  constructor(perGalaxy = 9000) {
    this.perGalaxy = perGalaxy;
    this.n = perGalaxy * 2;
    this.pos = new Float64Array(this.n * 3);
    this.vel = new Float64Array(this.n * 3);
    this.which = new Uint8Array(this.n);
    this.render = new Float32Array(this.n * 3);

    // Milky Way: disk in the X–Z plane; Andromeda: heavier + tilted, approaching on −X
    this.mw = {
      center: new Vector3(START_SEP * 0.45, 0, 0),
      vel: new Vector3(0, 0, 0),
      mass: 1.0,
      u: new Vector3(1, 0, 0),
      w: new Vector3(0, 0, 1),
      color: new Color(0x9fb8ff),
      hot: new Color(0xbfe0ff),
    };
    this.m31 = {
      center: new Vector3(-START_SEP * 0.55, 0, 0),
      vel: new Vector3(APPROACH, 0, TANGENTIAL), // falling toward the Milky Way on a grazing orbit
      mass: 1.4,
      u: new Vector3(0.34, 0.62, 0.71).normalize(), // tilted disk
      w: new Vector3(-0.9, 0.36, 0.12).normalize(),
      color: new Color(0xffcf9a),
      hot: new Color(0xffe6c8),
    };

    const geom = new BufferGeometry();
    this.posAttr = new BufferAttribute(this.render, 3);
    this.posAttr.setUsage(35048); // DynamicDrawUsage
    geom.setAttribute('position', this.posAttr);
    const colors = new Float32Array(this.n * 3);
    geom.setAttribute('color', new BufferAttribute(colors, 3));
    this.points = new Points(
      geom,
      // sized for the merger's framing distance (much farther than the galaxy band)
      new PointsMaterial({ size: 6e8, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true, opacity: 1 }),
    );
    this.points.frustumCulled = false;
    this.group.add(this.points);

    this.reset();
    // colour is static (by galaxy); positions animate
    const col = geom.getAttribute('color') as BufferAttribute;
    const c = new Color();
    const rng = mulberry32(0xa11);
    for (let i = 0; i < this.n; i++) {
      const g = this.which[i] === 0 ? this.mw : this.m31;
      c.copy(rng() < 0.12 ? g.hot : g.color);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  /** (re)seed both disks at their starting positions + rotation */
  reset(): void {
    this.t = 0;
    // place the pair + set velocities so the CENTRE OF MASS stays fixed at the origin
    // (total momentum zero) — the collision then stays centred in the framing.
    const mt = this.mw.mass + this.m31.mass;
    this.mw.center.set(START_SEP * (this.m31.mass / mt), 0, 0);
    this.m31.center.set(-START_SEP * (this.mw.mass / mt), 0, 0);
    this.m31.vel.set(APPROACH, 0, TANGENTIAL);
    this.mw.vel.set(-APPROACH * (this.m31.mass / this.mw.mass), 0, -TANGENTIAL * (this.m31.mass / this.mw.mass));
    const rng = mulberry32(0x6d31);
    const tmp = new Vector3();
    for (let i = 0; i < this.n; i++) {
      const first = i < this.perGalaxy;
      this.which[i] = first ? 0 : 1;
      const g = first ? this.mw : this.m31;
      const rd = first ? 4.5 : 5.5; // disk scale length (kpc)
      const rmax = first ? 22 : 27;
      let r = -rd * Math.log(1 - rng() * 0.98);
      if (r > rmax) r = rmax * rng();
      const th = rng() * Math.PI * 2;
      const h = gaussian(rng) * 0.5;
      // position = centre + u·(r cosθ) + w·(r sinθ) + n·h
      const n = tmp.copy(g.u).cross(g.w); // disk normal
      const px = g.center.x + g.u.x * r * Math.cos(th) + g.w.x * r * Math.sin(th) + n.x * h;
      const py = g.center.y + g.u.y * r * Math.cos(th) + g.w.y * r * Math.sin(th) + n.y * h;
      const pz = g.center.z + g.u.z * r * Math.cos(th) + g.w.z * r * Math.sin(th) + n.z * h;
      // softening-consistent circular velocity: v² = GM·r²/(r²+ε²)^1.5 (Plummer), so the
      // inner disk rotates slowly enough to stay stable at the sim timestep.
      const vc = Math.sqrt((G * g.mass * r * r) / Math.pow(r * r + SOFT2, 1.5));
      const tx = -g.u.x * Math.sin(th) + g.w.x * Math.cos(th);
      const ty = -g.u.y * Math.sin(th) + g.w.y * Math.cos(th);
      const tz = -g.u.z * Math.sin(th) + g.w.z * Math.cos(th);
      const o = i * 3;
      this.pos[o] = px; this.pos[o + 1] = py; this.pos[o + 2] = pz;
      this.vel[o] = g.vel.x + vc * tx;
      this.vel[o + 1] = g.vel.y + vc * ty;
      this.vel[o + 2] = g.vel.z + vc * tz;
    }
    this.flushRender();
  }

  get timeGyr(): number {
    return this.t;
  }

  /** advance the merger by `dtGyr` — bounded fixed substep so fast inner orbits stay stable */
  step(dtGyr: number): void {
    const DT_MAX = 0.0015; // Gyr — < 1/15 of the fastest inner orbital period
    const sub = Math.max(1, Math.min(40, Math.ceil(dtGyr / DT_MAX)));
    const dt = dtGyr / sub;
    for (let s = 0; s < sub; s++) this.substep(dt);
    this.t += dtGyr;
    this.flushRender();
  }

  private substep(dt: number): void {
    const a = this.mw.center, b = this.m31.center;
    // --- two-body orbit of the centres + dynamical-friction drag so they merge ---
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const d2 = dx * dx + dy * dy + dz * dz + SOFT2;
    const inv = 1 / (d2 * Math.sqrt(d2));
    // MW pulled toward M31, and vice-versa
    this.mw.vel.x += G * this.m31.mass * dx * inv * dt;
    this.mw.vel.y += G * this.m31.mass * dy * inv * dt;
    this.mw.vel.z += G * this.m31.mass * dz * inv * dt;
    this.m31.vel.x -= G * this.mw.mass * dx * inv * dt;
    this.m31.vel.y -= G * this.mw.mass * dy * inv * dt;
    this.m31.vel.z -= G * this.mw.mass * dz * inv * dt;
    // drag on the relative velocity, strong when the haloes overlap → coalescence
    const sep = Math.sqrt(d2);
    const drag = 0.52 * Math.exp(-sep / 85) * dt;
    const rvx = this.m31.vel.x - this.mw.vel.x, rvy = this.m31.vel.y - this.mw.vel.y, rvz = this.m31.vel.z - this.mw.vel.z;
    this.m31.vel.x -= rvx * drag; this.m31.vel.y -= rvy * drag; this.m31.vel.z -= rvz * drag;
    this.mw.vel.x += rvx * drag; this.mw.vel.y += rvy * drag; this.mw.vel.z += rvz * drag;
    a.x += this.mw.vel.x * dt; a.y += this.mw.vel.y * dt; a.z += this.mw.vel.z * dt;
    b.x += this.m31.vel.x * dt; b.y += this.m31.vel.y * dt; b.z += this.m31.vel.z * dt;

    // --- test particles in the field of both centres ---
    const gm1 = G * this.mw.mass, gm2 = G * this.m31.mass;
    const pos = this.pos, vel = this.vel;
    for (let i = 0; i < this.n; i++) {
      const o = i * 3;
      const x = pos[o]!, y = pos[o + 1]!, z = pos[o + 2]!;
      let ax = a.x - x, ay = a.y - y, az = a.z - z;
      let s1 = ax * ax + ay * ay + az * az + SOFT2;
      s1 = gm1 / (s1 * Math.sqrt(s1));
      const bx = b.x - x, by = b.y - y, bz = b.z - z;
      let s2 = bx * bx + by * by + bz * bz + SOFT2;
      s2 = gm2 / (s2 * Math.sqrt(s2));
      vel[o] = vel[o]! + (ax * s1 + bx * s2) * dt;
      vel[o + 1] = vel[o + 1]! + (ay * s1 + by * s2) * dt;
      vel[o + 2] = vel[o + 2]! + (az * s1 + bz * s2) * dt;
      pos[o] = x + vel[o]! * dt;
      pos[o + 1] = y + vel[o + 1]! * dt;
      pos[o + 2] = z + vel[o + 2]! * dt;
    }
  }

  private flushRender(): void {
    const r = this.render, p = this.pos;
    for (let i = 0; i < r.length; i++) r[i] = p[i]! * AU_PER_KPC;
    this.posAttr.needsUpdate = true;
  }
}
