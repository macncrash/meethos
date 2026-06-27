// Universe regime: the outermost scale — a cosmic web of thousands of galaxies
// strung along filaments around great voids. The Milky Way is one highlighted
// node; dive into it to fall to the galaxy scale. Answers "why one galaxy?".
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  LineBasicMaterial,
  LineSegments,
  Points,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { SimClock } from '../core/clock';
import type { FocusTarget, Regime } from '../core/regime';
import { mulberry32, gaussian, type Rng } from '../core/rng';
import { dotTexture, glowTexture, ringTexture } from '../render/sprites';
import { makeLabel } from '../render/label';
import { createGlowPointsMaterial } from '../render/pointsMaterial';
import { setOpacityDeep } from '../render/opacity';

const GALAXY_COUNT = 3200;
const BOX = 150; // half-extent of the cosmic volume (render units)
const NODES = 26; // cluster nodes of the cosmic web

// A spread of galaxy hues: young blue, mature white/gold, old red ellipticals.
const GALAXY_HUES = [0x9fc4ff, 0xcfe0ff, 0xfff2d6, 0xffe0b0, 0xffc89a, 0xff9e7a];

export class UniverseRegime implements Regime {
  readonly id = 'universe';
  readonly label = 'Cosmos';
  readonly object3d = new Group();

  private readonly homePos = new Vector3();
  private readonly homeFinal = new Vector3();
  private readonly homeInitial = new Vector3();
  private readonly targets: FocusTarget[] = [];
  private readonly localGroup: Array<{ sprite: Sprite; label: Sprite; offset: Vector3; size: number }> = [];
  private readonly homeMarker: Sprite;
  private home!: Sprite;
  private phase = 0;

  // Big Bang → structure formation
  private points!: Points;
  private galaxyMat!: ReturnType<typeof createGlowPointsMaterial>;
  private livePos!: Float32Array;
  private finalPos!: Float32Array;
  private initialPos!: Float32Array;
  private cosmicAge = 1; // 0 = Big Bang, 1 = present day
  private forming = false;
  private bbFlash?: Sprite;

  constructor(seed = 0xc05) {
    const rng = mulberry32(seed);
    this.object3d.name = 'universe';

    const nodes = this.buildNodes(rng);
    this.buildFilaments(nodes);
    this.buildGalaxies(rng, nodes);

    this.homeFinal.copy(this.homePos);
    this.homeInitial.copy(this.homePos).multiplyScalar(0.03);

    // the Milky Way — a brighter blob you dive into, with a findable reticle
    this.home = new Sprite(
      new SpriteMaterial({ map: glowTexture(new Color(0xeaf2ff)), blending: AdditiveBlending, depthWrite: false, transparent: true }),
    );
    this.home.scale.setScalar(7);
    this.home.position.copy(this.homePos);
    this.object3d.add(this.home);

    this.homeMarker = new Sprite(
      new SpriteMaterial({ map: ringTexture(new Color(0x6ad6ff)), blending: AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0.7 }),
    );
    this.homeMarker.scale.setScalar(12);
    this.homeMarker.position.copy(this.homePos);
    this.homeMarker.renderOrder = 2;
    this.object3d.add(this.homeMarker);

    this.buildTargets();
    this.buildLocalGroup();
  }

  // Real Local Group neighbors with real distances/directions (positions scaled
  // for visibility — at true scale they'd sit on top of the Milky Way node).
  private buildLocalGroup(): void {
    const DEG = Math.PI / 180;
    const GAL = [
      { name: 'Andromeda (M31)', ra: 10.68, dec: 41.27, mly: 2.5, size: 6, col: 0xcfe0ff, target: true },
      { name: 'Triangulum (M33)', ra: 23.46, dec: 30.66, mly: 2.73, size: 3.4, col: 0xcfe0ff, target: false },
      { name: 'LMC', ra: 80.89, dec: -69.76, mly: 0.163, size: 2.2, col: 0xdce4f0, target: false },
      { name: 'SMC', ra: 13.19, dec: -72.83, mly: 0.2, size: 1.7, col: 0xdce4f0, target: false },
    ];
    for (const g of GAL) {
      const cd = Math.cos(g.dec * DEG);
      const dir = new Vector3(cd * Math.cos(g.ra * DEG), Math.sin(g.dec * DEG), cd * Math.sin(g.ra * DEG));
      const offset = dir.multiplyScalar(5 + g.mly * 5);
      const sprite = new Sprite(
        new SpriteMaterial({ map: glowTexture(new Color(g.col)), blending: AdditiveBlending, depthWrite: false, transparent: true }),
      );
      sprite.scale.setScalar(g.size);
      this.object3d.add(sprite);
      const label = makeLabel(g.name, g.col, 0.036);
      this.object3d.add(label);
      this.localGroup.push({ sprite, label, offset, size: g.size });
      if (g.target) {
        this.targets.push({
          id: 'andromeda',
          label: g.name,
          radius: 3,
          position: (out) => out.copy(sprite.position),
          info: () => ({
            title: 'Andromeda (M31)',
            rows: [
              ['Distance', '2.5 Mly (765 kpc)'],
              ['Approaching', '109 km/s'],
              ['Merger', '~4.5 Gyr — or 50/50'],
            ],
            blurb: 'The nearest large galaxy, and our likely future. The classic "certain collision in ~4.5 Gyr" was revised in 2025 (Sawala et al.) to roughly a coin flip within 10 Gyr — M33 raises the odds, the LMC lowers them.',
          }),
        });
      }
    }
  }

  private buildNodes(rng: Rng): Vector3[] {
    const nodes: Vector3[] = [];
    for (let i = 0; i < NODES; i++) {
      nodes.push(new Vector3((rng() * 2 - 1) * BOX, (rng() * 2 - 1) * BOX * 0.7, (rng() * 2 - 1) * BOX));
    }
    // home galaxy sits two-thirds out along the web, off a node
    const base = nodes[(rng() * NODES) | 0]!;
    this.homePos.copy(base).add(new Vector3(gaussian(rng), gaussian(rng), gaussian(rng)).multiplyScalar(14));
    return nodes;
  }

  private nearestNodes(node: Vector3, nodes: Vector3[], k: number): Vector3[] {
    return nodes
      .filter((n) => n !== node)
      .sort((a, b) => node.distanceToSquared(a) - node.distanceToSquared(b))
      .slice(0, k);
  }

  private buildFilaments(nodes: Vector3[]): void {
    const pts: number[] = [];
    const seen = new Set<string>();
    nodes.forEach((n, i) => {
      for (const m of this.nearestNodes(n, nodes, 2)) {
        const j = nodes.indexOf(m);
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pts.push(n.x, n.y, n.z, m.x, m.y, m.z);
      }
    });
    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
    const lines = new LineSegments(geom, new LineBasicMaterial({ color: 0x32467d, transparent: true, opacity: 0.28, blending: AdditiveBlending, depthWrite: false }));
    this.object3d.add(lines);
  }

  private buildGalaxies(rng: Rng, nodes: Vector3[]): void {
    const positions = new Float32Array(GALAXY_COUNT * 3);
    const colors = new Float32Array(GALAXY_COUNT * 3);
    const sizes = new Float32Array(GALAXY_COUNT);
    const c = new Color();
    const tmp = new Vector3();

    for (let i = 0; i < GALAXY_COUNT; i++) {
      const r = rng();
      if (r < 0.55) {
        // along a filament between two near nodes
        const a = nodes[(rng() * nodes.length) | 0]!;
        const b = this.nearestNodes(a, nodes, 1)[0] ?? a;
        const t = rng();
        tmp.lerpVectors(a, b, t).add(new Vector3(gaussian(rng), gaussian(rng), gaussian(rng)).multiplyScalar(6));
      } else if (r < 0.82) {
        // clustered in a node
        const n = nodes[(rng() * nodes.length) | 0]!;
        tmp.copy(n).add(new Vector3(gaussian(rng), gaussian(rng), gaussian(rng)).multiplyScalar(10));
      } else {
        // sparse field galaxies in the voids
        tmp.set((rng() * 2 - 1) * BOX, (rng() * 2 - 1) * BOX * 0.7, (rng() * 2 - 1) * BOX);
      }
      const o = i * 3;
      positions[o] = tmp.x;
      positions[o + 1] = tmp.y;
      positions[o + 2] = tmp.z;
      c.set(GALAXY_HUES[(rng() * GALAXY_HUES.length) | 0]!);
      colors[o] = c.r;
      colors[o + 1] = c.g;
      colors[o + 2] = c.b;
      sizes[i] = 1.3 + rng() * rng() * 4.2; // mostly small, a few bright
    }

    // keep buffers for the Big Bang animation: galaxies start near a point and
    // expand out to their web positions as cosmic time advances.
    this.livePos = positions;
    this.finalPos = positions.slice();
    this.initialPos = new Float32Array(GALAXY_COUNT * 3);
    for (let i = 0; i < this.initialPos.length; i++) this.initialPos[i] = positions[i]! * 0.03;

    const geom = new BufferGeometry();
    const posAttr = new BufferAttribute(positions, 3);
    posAttr.setUsage(DynamicDrawUsage);
    geom.setAttribute('position', posAttr);
    geom.setAttribute('acolor', new BufferAttribute(colors, 3));
    geom.setAttribute('size', new BufferAttribute(sizes, 1));
    this.galaxyMat = createGlowPointsMaterial(dotTexture());
    this.galaxyMat.uniforms.uScale!.value = 720; // big enough to read at the cosmic framing distance
    this.galaxyMat.uniforms.uMaxSize!.value = 54;
    this.points = new Points(geom, this.galaxyMat);
    this.points.frustumCulled = false;
    this.object3d.add(this.points);
  }

  private buildTargets(): void {
    this.targets.push({
      id: 'home-galaxy',
      label: 'Milky Way',
      childRegime: 'galaxy',
      position: (out) => out.copy(this.homePos),
      radius: 7,
      info: () => ({
        title: 'Milky Way',
        rows: [
          ['Type', 'barred spiral'],
          ['Stars', '~100–400 B'],
          ['Bound to', 'the Local Group'],
        ],
        blurb: 'Our galaxy — one node in the cosmic web, bound with Andromeda, Triangulum and ~80 dwarfs in the Local Group. Dive in to fall toward home.',
      }),
    });
    this.targets.push({
      id: 'cosmic-web',
      label: 'Cosmic Web',
      position: (out) => out.set(0, 0, 0),
      radius: BOX,
      info: () => ({
        title: 'Observable Universe',
        rows: [
          ['Galaxies', '~2 trillion'],
          ['Structure', 'filaments & voids'],
          ['Age', '13.8 Gyr'],
        ],
        blurb: 'Matter strung along filaments around vast voids — the largest structure there is.',
      }),
    });
  }

  /** rewind to the Big Bang and let the cosmic web form again */
  playBigBang(): void {
    this.cosmicAge = 0;
    this.forming = true;
    if (!this.bbFlash) {
      this.bbFlash = new Sprite(
        new SpriteMaterial({ map: glowTexture(new Color(0xfff0d8)), blending: AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }),
      );
      this.bbFlash.renderOrder = 3;
      this.object3d.add(this.bbFlash);
    }
    this.bbFlash.visible = true;
    this.applyFormation(0);
  }

  get cosmicAgeGyr(): number {
    return this.cosmicAge * 13.8;
  }

  get isForming(): boolean {
    return this.forming;
  }

  private applyFormation(age: number): void {
    const e = age * age * (3 - 2 * age); // smoothstep expansion
    for (let i = 0; i < this.livePos.length; i++) {
      this.livePos[i] = this.initialPos[i]! + (this.finalPos[i]! - this.initialPos[i]!) * e;
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    this.galaxyMat.uniforms.uOpacity!.value = 0.15 + 0.85 * age; // galaxies light up as they form
    this.homePos.copy(this.homeInitial).lerp(this.homeFinal, e);
    this.home.position.copy(this.homePos);
    this.homeMarker.position.copy(this.homePos);
    if (this.bbFlash) {
      const f = Math.max(0, 1 - age / 0.22); // bright bang that fades fast
      this.bbFlash.scale.setScalar(6 + 60 * (1 - f));
      (this.bbFlash.material as SpriteMaterial).opacity = f;
      if (f <= 0) this.bbFlash.visible = false;
    }
  }

  step(clock: SimClock): void {
    this.phase += clock.realDt;
    if (this.forming) {
      this.cosmicAge = Math.min(1, this.cosmicAge + clock.realDt / 7);
      this.applyFormation(this.cosmicAge);
      if (this.cosmicAge >= 1) {
        this.forming = false;
        this.galaxyMat.uniforms.uOpacity!.value = 1;
      }
    }
    this.homeMarker.scale.setScalar(11 + 1.5 * Math.sin(this.phase * 3));

    // the Local Group rides with the Milky Way node
    for (const lg of this.localGroup) {
      lg.sprite.position.copy(this.homePos).add(lg.offset);
      lg.label.position.set(lg.sprite.position.x, lg.sprite.position.y + lg.size * 0.6 + 1, lg.sprite.position.z);
    }
  }

  focusTargets(): FocusTarget[] {
    return this.targets;
  }

  defaultFocus(): FocusTarget | null {
    return this.targets[0] ?? null; // frame the Milky Way so a zoom-in dives home
  }

  overviewDistance(): number {
    return 280;
  }

  onEnter(): void {}
  onExit(): void {}

  setOpacity(o: number): void {
    setOpacityDeep(this.object3d, o);
  }

  dispose(): void {
    this.object3d.traverse((obj) => {
      const mesh = obj as Points;
      mesh.geometry?.dispose?.();
    });
  }
}
