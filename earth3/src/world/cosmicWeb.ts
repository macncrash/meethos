// The outermost band: a cosmic web of galaxies strung along filaments around great
// voids, with the Milky Way as one node at the AU-frame origin. Ported from the
// legacy UniverseRegime onto the single floating-origin frame — it rides the camera
// rebasing like the galaxy cloud (the caller sets group.position = -camWorld) and is
// shown only at the Cosmos zoom band. `playBigBang()` rewinds to t=0 and lets the
// structure form (galaxies expand from a point and light up over ~13.8 Gyr).
//
// Stylized scale: 1 legacy box-unit = COSMIC_SCALE AU. The half-extent works out to
// ~1.5e12 AU (~10 Mpc) — far enough that f32 jitter under the floating origin is
// sub-pixel, without needing a per-shell unit scheme.
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
import type { FocusTarget } from '../core/regime';
import { mulberry32, gaussian, type Rng } from '../core/rng';
import { dotTexture, glowTexture, ringTexture } from '../render/sprites';
import { makeLabel } from '../render/label';
import { createGlowPointsMaterial } from '../render/pointsMaterial';

const GALAXY_COUNT = 3200;
const NODES = 26;
const BOX = 150; // half-extent in legacy units
const COSMIC_SCALE = 1e10; // AU per legacy unit → web half-extent ~1.5e12 AU (~10 Mpc)
const SPRITE = COSMIC_SCALE * 0.05; // world size of a unit-sized Local-Group glow sprite

const GALAXY_HUES = [0x9fc4ff, 0xcfe0ff, 0xfff2d6, 0xffe0b0, 0xffc89a, 0xff9e7a];

export class CosmicWeb {
  /** rides the floating origin — the caller sets group.position = -camWorld each frame */
  readonly group = new Group();

  private readonly homePos = new Vector3(0, 0, 0); // the Milky Way sits at the frame origin
  private readonly localGroup: Array<{ sprite: Sprite; label: Sprite; offset: Vector3; size: number; name: string; mly: number; isTarget: boolean }> = [];
  private readonly targets_: FocusTarget[] = [];
  private readonly home: Sprite;
  private readonly homeMarker: Sprite;
  private phase = 0;

  private readonly points: Points;
  private readonly galaxyMat: ReturnType<typeof createGlowPointsMaterial>;
  private readonly livePos: Float32Array;
  private readonly finalPos: Float32Array;
  private readonly initialPos: Float32Array;
  private cosmicAge = 1; // 0 = Big Bang, 1 = present day
  private forming = false;
  private bbFlash?: Sprite;

  constructor(seed = 0xc05) {
    const rng = mulberry32(seed);
    const nodes = this.buildNodes(rng);
    this.buildFilaments(nodes);
    const built = this.buildGalaxies(rng, nodes);
    this.points = built.points;
    this.galaxyMat = built.mat;
    this.livePos = built.livePos;
    this.finalPos = built.finalPos;
    this.initialPos = built.initialPos;

    // the Milky Way — a brighter blob at the origin with a findable reticle
    this.home = new Sprite(new SpriteMaterial({ map: glowTexture(new Color(0xeaf2ff)), blending: AdditiveBlending, depthWrite: false, transparent: true }));
    this.home.scale.setScalar(SPRITE * 7);
    this.group.add(this.home);

    this.homeMarker = new Sprite(new SpriteMaterial({ map: ringTexture(new Color(0x6ad6ff)), blending: AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0.7 }));
    this.homeMarker.scale.setScalar(SPRITE * 12);
    this.homeMarker.renderOrder = 2;
    this.group.add(this.homeMarker);

    this.buildTargets();
    this.buildLocalGroup();
  }

  private toWorld(v: Vector3): Vector3 {
    // legacy box coords → AU, recentred so the home node is at the origin
    return v.clone().sub(this.homeLegacy).multiplyScalar(COSMIC_SCALE);
  }

  private readonly homeLegacy = new Vector3();

  private buildNodes(rng: Rng): Vector3[] {
    const nodes: Vector3[] = [];
    for (let i = 0; i < NODES; i++) {
      nodes.push(new Vector3((rng() * 2 - 1) * BOX, (rng() * 2 - 1) * BOX * 0.7, (rng() * 2 - 1) * BOX));
    }
    const base = nodes[(rng() * NODES) | 0]!;
    this.homeLegacy.copy(base).add(new Vector3(gaussian(rng), gaussian(rng), gaussian(rng)).multiplyScalar(14));
    return nodes;
  }

  private nearestNodes(node: Vector3, nodes: Vector3[], k: number): Vector3[] {
    return nodes.filter((n) => n !== node).sort((a, b) => node.distanceToSquared(a) - node.distanceToSquared(b)).slice(0, k);
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
        const a = this.toWorld(n);
        const b = this.toWorld(m);
        pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    });
    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
    const lines = new LineSegments(geom, new LineBasicMaterial({ color: 0x32467d, transparent: true, opacity: 0.28, blending: AdditiveBlending, depthWrite: false }));
    this.group.add(lines);
  }

  private buildGalaxies(rng: Rng, nodes: Vector3[]): { points: Points; mat: ReturnType<typeof createGlowPointsMaterial>; livePos: Float32Array; finalPos: Float32Array; initialPos: Float32Array } {
    const positions = new Float32Array(GALAXY_COUNT * 3);
    const colors = new Float32Array(GALAXY_COUNT * 3);
    const sizes = new Float32Array(GALAXY_COUNT);
    const c = new Color();
    const tmp = new Vector3();
    for (let i = 0; i < GALAXY_COUNT; i++) {
      const r = rng();
      if (r < 0.55) {
        const a = nodes[(rng() * nodes.length) | 0]!;
        const b = this.nearestNodes(a, nodes, 1)[0] ?? a;
        tmp.lerpVectors(a, b, rng()).add(new Vector3(gaussian(rng), gaussian(rng), gaussian(rng)).multiplyScalar(6));
      } else if (r < 0.82) {
        const n = nodes[(rng() * nodes.length) | 0]!;
        tmp.copy(n).add(new Vector3(gaussian(rng), gaussian(rng), gaussian(rng)).multiplyScalar(10));
      } else {
        tmp.set((rng() * 2 - 1) * BOX, (rng() * 2 - 1) * BOX * 0.7, (rng() * 2 - 1) * BOX);
      }
      const w = this.toWorld(tmp);
      const o = i * 3;
      positions[o] = w.x; positions[o + 1] = w.y; positions[o + 2] = w.z;
      c.set(GALAXY_HUES[(rng() * GALAXY_HUES.length) | 0]!);
      colors[o] = c.r; colors[o + 1] = c.g; colors[o + 2] = c.b;
      sizes[i] = 1.3 + rng() * rng() * 4.2;
    }
    const livePos = positions;
    const finalPos = positions.slice();
    const initialPos = new Float32Array(GALAXY_COUNT * 3);
    for (let i = 0; i < initialPos.length; i++) initialPos[i] = positions[i]! * 0.03; // start compact at the origin

    const geom = new BufferGeometry();
    const posAttr = new BufferAttribute(positions, 3);
    posAttr.setUsage(DynamicDrawUsage);
    geom.setAttribute('position', posAttr);
    geom.setAttribute('acolor', new BufferAttribute(colors, 3));
    geom.setAttribute('size', new BufferAttribute(sizes, 1));
    const mat = createGlowPointsMaterial(dotTexture());
    mat.uniforms.uScale!.value = 9e12; // tuned so galaxies read at the cosmic framing distance (AU)
    mat.uniforms.uMaxSize!.value = 46;
    const points = new Points(geom, mat);
    points.frustumCulled = false;
    this.group.add(points);
    return { points, mat, livePos, finalPos, initialPos };
  }

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
      const offset = dir.multiplyScalar((5 + g.mly * 5) * COSMIC_SCALE);
      const sprite = new Sprite(new SpriteMaterial({ map: glowTexture(new Color(g.col)), blending: AdditiveBlending, depthWrite: false, transparent: true }));
      sprite.scale.setScalar(SPRITE * g.size);
      sprite.position.copy(this.homePos).add(offset); // valid before the first step()
      this.group.add(sprite);
      const label = makeLabel(g.name, g.col, 0.036);
      this.group.add(label);
      this.localGroup.push({ sprite, label, offset, size: g.size, name: g.name, mly: g.mly, isTarget: g.target });
      if (g.target) {
        this.targets_.push({
          id: 'andromeda', label: g.name, radius: SPRITE * 3,
          position: (out) => out.copy(sprite.position),
          info: () => ({
            title: 'Andromeda (M31)',
            rows: [['Distance', '2.5 Mly (765 kpc)'], ['Approaching', '109 km/s'], ['Merger', '~4.5 Gyr — or 50/50']],
            blurb: 'The nearest large galaxy, and our likely future. The classic "certain collision in ~4.5 Gyr" was revised in 2025 (Sawala et al.) to roughly a coin flip within 10 Gyr — M33 raises the odds, the LMC lowers them.',
          }),
        });
      }
    }
  }

  private buildTargets(): void {
    this.targets_.push({
      id: 'home-galaxy', label: 'Milky Way', radius: SPRITE * 7,
      position: (out) => out.copy(this.homePos),
      info: () => ({
        title: 'Milky Way',
        rows: [['Type', 'barred spiral'], ['Stars', '~100–400 B'], ['Bound to', 'the Local Group']],
        blurb: 'Our galaxy — one node in the cosmic web, bound with Andromeda, Triangulum and ~80 dwarfs in the Local Group. Zoom in to fall toward home.',
      }),
    });
    this.targets_.push({
      id: 'cosmic-web', label: 'Cosmic Web', radius: BOX * COSMIC_SCALE,
      position: (out) => out.set(0, 0, 0),
      info: () => ({
        title: 'Observable Universe',
        rows: [['Galaxies', '~2 trillion'], ['Structure', 'filaments & voids'], ['Age', `${this.cosmicAgeGyr.toFixed(1)} Gyr`]],
        blurb: 'Matter strung along filaments around vast voids — the largest structure there is. Press ✦ Big Bang to watch it form.',
      }),
    });
  }

  targets(): FocusTarget[] {
    return this.targets_;
  }

  /** Searchable destinations at the cosmic scale: the Milky Way, Andromeda and the
   *  Cosmic Web (rich cards from targets_) plus the rest of the Local Group. */
  searchTargets(): FocusTarget[] {
    const dwarfs = this.localGroup
      .filter((lg) => !lg.isTarget) // Andromeda already has a richer card in targets_
      .map<FocusTarget>((lg) => ({
        id: `gal-${lg.name}`,
        label: lg.name,
        radius: SPRITE * lg.size,
        position: (out) => out.copy(lg.sprite.position),
        info: () => ({
          title: lg.name,
          rows: [['Distance', `${lg.mly} Mly`], ['Group', 'Local Group']],
          blurb: 'A galaxy in our Local Group, bound to the Milky Way by gravity.',
        }),
      }));
    return [...this.targets_, ...dwarfs];
  }

  get cosmicAgeGyr(): number {
    return this.cosmicAge * 13.8;
  }

  get isForming(): boolean {
    return this.forming;
  }

  /** rewind to the Big Bang and let the cosmic web form again */
  playBigBang(): void {
    this.cosmicAge = 0;
    this.forming = true;
    if (!this.bbFlash) {
      this.bbFlash = new Sprite(new SpriteMaterial({ map: glowTexture(new Color(0xfff0d8)), blending: AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
      this.bbFlash.renderOrder = 3;
      this.group.add(this.bbFlash);
    }
    this.bbFlash.visible = true;
    this.applyFormation(0);
  }

  private applyFormation(age: number): void {
    const e = age * age * (3 - 2 * age); // smoothstep expansion
    for (let i = 0; i < this.livePos.length; i++) {
      this.livePos[i] = this.initialPos[i]! + (this.finalPos[i]! - this.initialPos[i]!) * e;
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    this.galaxyMat.uniforms.uOpacity!.value = 0.15 + 0.85 * age; // galaxies light up as they form
    if (this.bbFlash) {
      const f = Math.max(0, 1 - age / 0.22);
      this.bbFlash.scale.setScalar(SPRITE * (6 + 60 * (1 - f)));
      (this.bbFlash.material as SpriteMaterial).opacity = f;
      if (f <= 0) this.bbFlash.visible = false;
    }
  }

  step(realDt: number): void {
    this.phase += realDt;
    if (this.forming) {
      this.cosmicAge = Math.min(1, this.cosmicAge + realDt / 7);
      this.applyFormation(this.cosmicAge);
      if (this.cosmicAge >= 1) {
        this.forming = false;
        this.galaxyMat.uniforms.uOpacity!.value = 1;
      }
    }
    this.homeMarker.scale.setScalar(SPRITE * (11 + 1.5 * Math.sin(this.phase * 3)));
    for (const lg of this.localGroup) {
      lg.sprite.position.copy(this.homePos).add(lg.offset);
      lg.label.position.set(lg.sprite.position.x, lg.sprite.position.y + SPRITE * lg.size * 0.6, lg.sprite.position.z);
      lg.label.visible = true; // reset each frame; the caller's declutter pass hides overlaps
    }
  }

  /** the Local Group text labels (Andromeda etc.), highest-priority first. Their
   *  `.position` is the absolute world-AU position (the group rides −camWorld), so
   *  the caller must rebase with fo.rel() before projecting. */
  localGroupLabels(): Sprite[] {
    return this.localGroup.map((lg) => lg.label);
  }
}
