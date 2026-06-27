// Universe regime: the outermost scale — a cosmic web of thousands of galaxies
// strung along filaments around great voids. The Milky Way is one highlighted
// node; dive into it to fall to the galaxy scale. Answers "why one galaxy?".
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
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
  private readonly targets: FocusTarget[] = [];
  private readonly homeMarker: Sprite;
  private phase = 0;

  constructor(seed = 0xc05) {
    const rng = mulberry32(seed);
    this.object3d.name = 'universe';

    const nodes = this.buildNodes(rng);
    this.buildFilaments(nodes);
    this.buildGalaxies(rng, nodes);

    // the Milky Way — a brighter blob you dive into, with a findable reticle
    const home = new Sprite(
      new SpriteMaterial({ map: glowTexture(new Color(0xeaf2ff)), blending: AdditiveBlending, depthWrite: false, transparent: true }),
    );
    home.scale.setScalar(7);
    home.position.copy(this.homePos);
    this.object3d.add(home);

    this.homeMarker = new Sprite(
      new SpriteMaterial({ map: ringTexture(new Color(0x6ad6ff)), blending: AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0.7 }),
    );
    this.homeMarker.scale.setScalar(12);
    this.homeMarker.position.copy(this.homePos);
    this.homeMarker.renderOrder = 2;
    this.object3d.add(this.homeMarker);

    this.buildTargets();
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

    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(positions, 3));
    geom.setAttribute('acolor', new BufferAttribute(colors, 3));
    geom.setAttribute('size', new BufferAttribute(sizes, 1));
    const mat = createGlowPointsMaterial(dotTexture());
    mat.uniforms.uScale!.value = 720; // big enough to read at the cosmic framing distance
    mat.uniforms.uMaxSize!.value = 54;
    const points = new Points(geom, mat);
    points.frustumCulled = false;
    this.object3d.add(points);
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
          ['Neighbors', 'billions of galaxies'],
        ],
        blurb: 'Our galaxy — one node in the cosmic web. Dive in to fall toward home.',
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

  step(clock: SimClock): void {
    this.phase += clock.realDt;
    this.homeMarker.scale.setScalar(11 + 1.5 * Math.sin(this.phase * 3));
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
