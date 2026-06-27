// Surface regime: the deepest scale — dive past the globe and land in a
// SimCity-scale coastal city. Buildings rise and the development front sprawls
// outward as you speed up time. This is the "SimCity, but it's one tile of a
// planet that is one world in a galaxy" payoff.
import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Vector3,
  type Material,
} from 'three';
import type { SimClock } from '../core/clock';
import type { FocusTarget, Regime } from '../core/regime';
import { SECONDS_PER_DAY } from '../core/units';
import { mulberry32, type Rng } from '../core/rng';
import { setOpacityDeep } from '../render/opacity';
import type { WorldBus, ImpactEvent } from '../world/bus';

const GRID = 30; // plots per side
const SPACING = 2.4;
const TILE = GRID * SPACING; // ~72 units across
const PLOT = SPACING * 0.74; // building footprint
const MAX_HEIGHT = 22; // cap so downtown towers don't grow into needles
const MAX_CIV_YEARS_PER_FRAME = 120;
const DAMAGE_DECAY = 0.004; // per year — a flattened block recovers over ~250 yr
const MAX_SCORCH = 6;
const RUBBLE = new Color(0x241a14);

type Zone = 'downtown' | 'residential' | 'industrial';

interface Plot {
  x: number;
  z: number;
  rFromCenter: number;
  buildable: boolean;
  active: boolean;
  zone: Zone;
  height: number; // current
  target: number; // grows over time
  jitter: number;
  damage: number; // 0 healthy … 1 just-flattened; decays as it rebuilds
}

interface Shockwave {
  mesh: Mesh;
  age: number;
  life: number;
}

const ZONE_COLOR: Record<Zone, number> = {
  downtown: 0xbfe6ff,
  residential: 0xe0c39a,
  industrial: 0x95a596,
};

export class SurfaceRegime implements Regime {
  readonly id = 'surface';
  readonly label = 'City';
  readonly object3d = new Group();

  private readonly plots: Plot[] = [];
  private readonly buildings: InstancedMesh;
  private readonly buildable: Plot[] = [];
  private readonly mtx = new Matrix4();
  private readonly scaleV = new Vector3();
  private readonly posV = new Vector3();
  private readonly identQuat = new Quaternion();
  private readonly col = new Color();
  private front = 6; // development radius (units from centre)
  private years = 0;
  private readonly targets: FocusTarget[] = [];
  private readonly scorches: Mesh[] = [];
  private readonly shocks: Shockwave[] = [];
  private recovering = 0; // peak damage currently healing — drives the inspector

  constructor(bus: WorldBus, seed = 0xc17) {
    const rng = mulberry32(seed);
    this.object3d.name = 'surface';
    bus.onImpact((e) => this.onImpact(e));

    this.buildTerrain(rng);
    this.layoutPlots(rng);
    this.buildRoads();

    // buildings as one instanced box mesh
    this.buildings = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshLambertMaterial({ vertexColors: false }),
      Math.max(1, this.buildable.length),
    );
    this.buildings.count = 0;
    this.buildings.frustumCulled = false;
    this.object3d.add(this.buildings);

    // lighting (only lit while this regime is visible; other regimes use Basic materials)
    const sun = new DirectionalLight(0xfff2dd, 1.6);
    sun.position.set(0.4, 1, 0.5).multiplyScalar(100);
    this.object3d.add(sun);
    this.object3d.add(new HemisphereLight(0x9fc0ff, 0x20303a, 0.7));
    this.object3d.add(new AmbientLight(0x404a5a, 0.5));

    this.targets.push({
      id: 'metropolis',
      label: 'City',
      position: (out) => out.set(0, 0, 0),
      radius: TILE * 0.5,
      info: () => ({
        title: 'Metropolis',
        rows: [
          ['Age', `${Math.round(this.years)} yr`],
          ['Blocks', this.buildings.count.toLocaleString()],
          ['Status', this.recovering > 0.02 ? `rebuilding (${Math.round(this.recovering * 100)}% razed)` : 'thriving'],
        ],
        blurb:
          this.recovering > 0.02
            ? 'Struck from orbit — blocks flattened to rubble. Speed time and watch it rebuild from the ashes.'
            : 'A single city tile on the surface. Speed time and watch it rise and sprawl toward the coast.',
      }),
    });

    this.rebuildInstances();
  }

  // --- terrain: a vertex-colored plane with a wavy coastline on the -X side ---
  private buildTerrain(rng: Rng): void {
    const seg = 90;
    const geo = new PlaneGeometry(TILE * 1.4, TILE * 1.4, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new Color();
    const n2 = (x: number, z: number): number =>
      Math.sin(x * 0.06 + 1.3) * Math.cos(z * 0.05) + 0.4 * Math.sin(x * 0.13 - z * 0.09);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const coast = -10 + 7 * Math.sin(z * 0.06 + 0.5) + 3 * Math.sin(z * 0.17); // boundary in x
      const land = x - coast; // >0 land, <0 water
      let y: number;
      if (land < 0) {
        y = Math.max(-1.2, land * 0.06); // gently deepening water
        const d = Math.min(1, -land / 30);
        c.setRGB(0.06 + 0.04 * (1 - d), 0.17 + 0.16 * (1 - d), 0.3 + 0.22 * (1 - d));
      } else if (land < 2.2) {
        y = 0.04;
        c.setRGB(0.74, 0.69, 0.5); // beach
      } else {
        y = 0.12 + Math.max(0, n2(x, z)) * 0.5;
        const g = 0.32 + 0.12 * Math.min(1, land / 40);
        c.setRGB(0.13 + 0.05 * rng(), g, 0.16);
      }
      pos.setY(i, y);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new Mesh(geo, new MeshLambertMaterial({ vertexColors: true }));
    ground.renderOrder = 0;
    this.object3d.add(ground);
  }

  private isLand(x: number, z: number): boolean {
    const coast = -10 + 7 * Math.sin(z * 0.06 + 0.5) + 3 * Math.sin(z * 0.17);
    return x - coast > 2.4;
  }

  private layoutPlots(rng: Rng): void {
    const half = (GRID - 1) / 2;
    for (let gx = 0; gx < GRID; gx++) {
      for (let gz = 0; gz < GRID; gz++) {
        const x = (gx - half) * SPACING;
        const z = (gz - half) * SPACING;
        const r = Math.hypot(x, z);
        const land = this.isLand(x, z);
        const park = rng() < 0.08; // green gaps
        const buildable = land && !park && r < TILE * 0.52;
        const zone: Zone = r < 12 ? 'downtown' : r < 26 ? 'residential' : 'industrial';
        const plot: Plot = { x, z, rFromCenter: r, buildable, active: false, zone, height: 0.1, target: 0, jitter: 0.6 + rng() * 0.8, damage: 0 };
        this.plots.push(plot);
        if (buildable) this.buildable.push(plot);
      }
    }
    // tallest in the centre, tapering out
    for (const p of this.buildable) {
      const base = p.zone === 'downtown' ? 12 : p.zone === 'residential' ? 5 : 2.6;
      p.target = base * (0.5 + 0.5 * Math.exp(-p.rFromCenter / 26)) * p.jitter;
    }
    // seed an initial downtown so the city isn't empty the instant you arrive
    for (const p of this.buildable) {
      if (p.rFromCenter < this.front) {
        p.active = true;
        p.height = p.target * 0.4;
      }
    }
  }

  private buildRoads(): void {
    const pts: number[] = [];
    const half = (GRID - 1) / 2;
    const y = 0.06;
    for (let g = 0; g <= GRID; g++) {
      const a = (g - half - 0.5) * SPACING;
      // lines parallel to z and to x, clipped to land
      for (let s = 0; s < GRID; s++) {
        const b0 = (s - half - 0.5) * SPACING;
        const b1 = (s - half + 0.5) * SPACING;
        if (this.isLand(a, (b0 + b1) / 2)) pushSeg(pts, a, y, b0, a, y, b1);
        if (this.isLand((b0 + b1) / 2, a)) pushSeg(pts, b0, y, a, b1, y, a);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
    const roads = new LineSegments(geo, new LineBasicMaterial({ color: 0x2c3340, transparent: true, opacity: 0.6 }));
    this.object3d.add(roads);
  }

  step(clock: SimClock): void {
    this.animateShocks(clock.realDt);

    const years = Math.min(clock.dt / (SECONDS_PER_DAY * 365.25), MAX_CIV_YEARS_PER_FRAME);
    if (years <= 0) {
      this.rebuildInstances();
      return;
    }
    this.years += years;

    // sprawl: development front creeps outward; downtown densifies
    this.front = Math.min(TILE * 0.52, this.front + years * 0.05);
    let peakDamage = 0;
    for (const p of this.buildable) {
      if (!p.active && p.rFromCenter < this.front) p.active = true;
      if (p.damage > 0) p.damage = Math.max(0, p.damage - years * DAMAGE_DECAY);
      peakDamage = Math.max(peakDamage, p.damage);
      if (p.active) {
        p.target = Math.min(MAX_HEIGHT, p.target * (1 + years * 0.0008), p.target + years * 0.02 * (p.zone === 'downtown' ? 1.6 : 0.6));
        // damaged blocks are held down until they rebuild (damage decays)
        const ceiling = p.target * (1 - p.damage);
        p.height += (ceiling - p.height) * Math.min(1, years * 0.04);
      }
    }
    this.recovering = peakDamage;
    this.rebuildInstances();
  }

  private rebuildInstances(): void {
    let i = 0;
    for (const p of this.buildable) {
      if (!p.active) continue;
      const h = Math.max(0.2, p.height);
      this.posV.set(p.x, h / 2, p.z);
      this.scaleV.set(PLOT, h, PLOT);
      this.mtx.compose(this.posV, this.identQuat, this.scaleV);
      this.buildings.setMatrixAt(i, this.mtx);
      const tint = 0.55 + Math.min(0.45, h / 28);
      this.col.set(ZONE_COLOR[p.zone]).multiplyScalar(tint);
      if (p.damage > 0) this.col.lerp(RUBBLE, Math.min(0.85, p.damage)); // scorched rubble
      this.buildings.setColorAt(i, this.col);
      i++;
    }
    this.buildings.count = i;
    this.buildings.instanceMatrix.needsUpdate = true;
    if (this.buildings.instanceColor) this.buildings.instanceColor.needsUpdate = true;
  }

  // --- cross-scale coupling: a strike on Earth flattens part of THIS city ---

  private onImpact(e: ImpactEvent): void {
    // blast center, biased toward downtown (the dramatic skyline), scaled by energy
    const ang = Math.random() * Math.PI * 2;
    const off = (0.15 + Math.random() * 0.35) * TILE * 0.5;
    const cx = Math.cos(ang) * off;
    const cz = Math.sin(ang) * off;
    const radius = 7 + e.energy * 20;

    for (const p of this.buildable) {
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (d > radius) continue;
      const closeness = 1 - d / radius; // 1 at ground zero
      const dmg = Math.min(1, closeness * (0.6 + e.energy * 0.7));
      if (dmg <= p.damage) continue;
      p.damage = dmg;
      p.height = Math.min(p.height, p.target * (1 - dmg)); // knocked flat now
    }
    this.recovering = Math.max(this.recovering, e.energy);

    // ground scar + expanding shock ring, oriented flat on the tile
    const flat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(0, 1, 0));
    const scorch = new Mesh(
      new CircleGeometry(radius * 0.55, 32),
      new MeshBasicMaterial({ color: 0x140d0a, transparent: true, opacity: 0.7, side: DoubleSide }),
    );
    scorch.position.set(cx, 0.08, cz);
    scorch.quaternion.copy(flat);
    this.object3d.add(scorch);
    this.scorches.push(scorch);
    if (this.scorches.length > MAX_SCORCH) {
      const old = this.scorches.shift()!;
      this.object3d.remove(old);
      old.geometry.dispose();
      (old.material as MeshBasicMaterial).dispose();
    }

    const ring = new Mesh(
      new RingGeometry(radius * 0.4, radius * 0.55, 48),
      new MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.9, side: DoubleSide, blending: AdditiveBlending, depthWrite: false }),
    );
    ring.position.set(cx, 0.12, cz);
    ring.quaternion.copy(flat);
    this.object3d.add(ring);
    this.shocks.push({ mesh: ring, age: 0, life: 2.4 });

    this.rebuildInstances();
  }

  private animateShocks(realDt: number): void {
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i]!;
      s.age += realDt;
      const t = s.age / s.life;
      if (t >= 1) {
        this.object3d.remove(s.mesh);
        s.mesh.geometry.dispose();
        (s.mesh.material as MeshBasicMaterial).dispose();
        this.shocks.splice(i, 1);
        continue;
      }
      s.mesh.scale.setScalar(1 + t * 2.5);
      (s.mesh.material as MeshBasicMaterial).opacity = (1 - t) * 0.9;
    }
  }

  focusTargets(): FocusTarget[] {
    return this.targets;
  }

  defaultFocus(): FocusTarget | null {
    return this.targets[0] ?? null;
  }

  overviewDistance(): number {
    return 64;
  }

  preferredView(): Vector3 {
    return new Vector3(0.45, 0.72, 0.52).normalize(); // elevated 3/4
  }

  onEnter(): void {}
  onExit(): void {}

  setOpacity(o: number): void {
    setOpacityDeep(this.object3d, o);
  }

  dispose(): void {
    this.object3d.traverse((obj) => {
      const m = obj as Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as Material | Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
  }
}

function pushSeg(arr: number[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  arr.push(x0, y0, z0, x1, y1, z1);
}
