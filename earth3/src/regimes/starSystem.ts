// StarSystemRegime — a generic, procedurally-generated planetary system around
// any star you dive into from the galaxy. Re-seeded per star via configure().
// No civilization or game here (that's Sol's special SolarRegime); this is an
// orrery of other worlds — the answer to "what about planets on other stars?".
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Material,
} from 'three';
import type { SimClock } from '../core/clock';
import type { FocusTarget, Regime } from '../core/regime';
import { blackbodyColor } from '../core/color';
import { mulberry32 } from '../core/rng';
import { glowTexture } from '../render/sprites';
import { setOpacityDeep } from '../render/opacity';
import { planetPosition, orbitPath } from './data/kepler';
import type { PlanetData } from './data/planets';
import { EXO_SYSTEMS } from './data/exoplanets';

interface Body {
  data: PlanetData;
  mesh: Mesh;
  readonly pos: Vector3;
}

const ROCKY = [0xb0a08f, 0xc1440e, 0xd9b48a, 0x8a9a86, 0xc9b89a];
const GAS = [0xd8b88a, 0xe3d6a8, 0x9fdcea, 0x4b70dd, 0xc98a6a];

export class StarSystemRegime implements Regime {
  readonly id = 'starsystem';
  label = 'Star System'; // mutable: becomes the star's name when configured
  readonly object3d = new Group();

  private readonly system = new Group();
  private readonly bodies: Body[] = [];
  private targets: FocusTarget[] = [];
  private starInfo = '';
  private starVisualRadius = 0.25;
  private planetCount = 0;

  constructor() {
    this.object3d.name = 'starsystem';
    this.object3d.add(this.system);
  }

  /** rebuild the whole system from a star seed (called on dive-in) */
  configure(seed: number, name: string): void {
    this.disposeSystem();
    this.label = name;
    const rng = mulberry32(seed >>> 0);

    // the star
    const temp = 2800 + rng() * 9000;
    const starColor = blackbodyColor(temp, new Color());
    this.starVisualRadius = 0.18 + rng() * 0.2;
    const cls = temp > 9000 ? 'A' : temp > 6800 ? 'F' : temp > 5300 ? 'G' : temp > 3900 ? 'K' : 'M';
    this.starInfo = `${cls}-type · ${Math.round(temp).toLocaleString()} K`;

    const star = new Mesh(
      new SphereGeometry(this.starVisualRadius, 40, 40),
      new MeshBasicMaterial({ color: starColor }),
    );
    this.system.add(star);
    const glow = new Sprite(
      new SpriteMaterial({ map: glowTexture(starColor.clone()), blending: AdditiveBlending, depthWrite: false, transparent: true }),
    );
    glow.scale.setScalar(this.starVisualRadius * 9);
    star.add(glow);

    // the planets — REAL ones from the exoplanet archive when we know this host,
    // otherwise a procedural system.
    const real = EXO_SYSTEMS[name];
    const defs: PlanetData[] = [];
    if (real) {
      real.forEach((ex, i) => {
        defs.push({
          id: `p${i}`,
          label: ex.name,
          a: ex.a,
          e: ex.e ?? 0.04,
          periodYears: ex.periodYears,
          inclDeg: rng() * 4,
          nodeDeg: rng() * 360,
          argPeriDeg: rng() * 360,
          meanAnomDeg: rng() * 360,
          obliquityDeg: rng() * 30,
          rotationHours: 6 + rng() * 30,
          radiusKm: ex.radiusEarth * 6371,
          visualRadius: Math.min(0.15, 0.025 + ex.radiusEarth * 0.011),
          color: (ex.gas ? GAS : ROCKY)[(rng() * 5) | 0]!,
          blurb: ex.gas ? 'A real, confirmed gas giant.' : 'A real, confirmed world (NASA Exoplanet Archive).',
        });
      });
    } else {
      let a = 0.4 + rng() * 0.3;
      const n = 2 + Math.floor(rng() * 6);
      for (let i = 0; i < n; i++) {
        a *= 1.5 + rng() * 0.6;
        const gas = a > 2.2 && rng() < 0.7;
        const radiusKm = gas ? 22000 + rng() * 60000 : 2200 + rng() * 8000;
        defs.push({
          id: `p${i}`, label: `${name} ${roman(i + 1)}`, a, e: rng() * 0.12,
          periodYears: Math.sqrt(a * a * a), inclDeg: rng() * 6, nodeDeg: rng() * 360,
          argPeriDeg: rng() * 360, meanAnomDeg: rng() * 360, obliquityDeg: rng() * 45, rotationHours: 6 + rng() * 30,
          radiusKm, visualRadius: Math.min(0.16, (gas ? 0.07 : 0.03) + radiusKm / 700000),
          color: (gas ? GAS : ROCKY)[(rng() * 5) | 0]!,
          blurb: gas ? 'A gas giant, banded and stormbound.' : 'A rocky world, silent and waiting.',
        });
      }
    }
    this.planetCount = defs.length;

    const targets: FocusTarget[] = [];
    targets.push({
      id: 'star',
      label: name,
      position: (out) => out.set(0, 0, 0),
      radius: this.starVisualRadius,
      info: () => ({
        title: name,
        rows: [
          ['Class', this.starInfo],
          ['Planets', `${this.planetCount}${real ? ' (real)' : ''}`],
        ],
        blurb: real
          ? 'A real planetary system from the NASA Exoplanet Archive — these worlds were actually detected.'
          : 'Another star, another system — worlds that have never had a name until now.',
      }),
    });

    for (const data of defs) {
      const gas = data.radiusKm > 15000;
      const mesh = new Mesh(
        new SphereGeometry(data.visualRadius, 24, 24),
        new MeshBasicMaterial({ color: data.color }),
      );
      this.system.add(mesh);

      if (gas && rng() < 0.4) {
        const ring = new Mesh(
          new RingGeometry(data.visualRadius * 1.5, data.visualRadius * 2.4, 48),
          new MeshBasicMaterial({ color: 0xcdb23a, side: DoubleSide, transparent: true, opacity: 0.5 }),
        );
        ring.rotation.x = Math.PI / 2.3;
        mesh.add(ring);
      }

      const line = new LineLoop(
        new BufferGeometry().setFromPoints(orbitPath(data)),
        new LineBasicMaterial({ color: data.color, transparent: true, opacity: 0.2 }),
      );
      this.system.add(line);

      const body: Body = { data, mesh, pos: new Vector3() };
      this.bodies.push(body);
      targets.push({
        id: data.id,
        label: data.label,
        radius: data.visualRadius,
        position: (out) => out.copy(body.pos),
        info: () => ({
          title: data.label,
          rows: [
            ['Orbit', `${data.a.toFixed(2)} AU`],
            ['Year', data.periodYears < 1 ? `${(data.periodYears * 365).toFixed(0)} d` : `${data.periodYears.toFixed(1)} yr`],
            ['Type', gas ? 'gas giant' : 'rocky'],
          ],
          blurb: data.blurb,
        }),
      });
    }
    this.targets = targets;
  }

  step(clock: SimClock): void {
    for (const b of this.bodies) {
      planetPosition(b.data, clock.seconds, b.pos);
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.y += 0.01;
    }
  }

  focusTargets(): FocusTarget[] {
    return this.targets;
  }

  defaultFocus(): FocusTarget | null {
    return this.targets[0] ?? null;
  }

  overviewDistance(): number {
    return 20;
  }

  onEnter(): void {}
  onExit(): void {}

  setOpacity(o: number): void {
    setOpacityDeep(this.object3d, o);
  }

  private disposeSystem(): void {
    this.bodies.length = 0;
    this.system.traverse((obj) => {
      const m = obj as Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as Material | Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.system.clear();
  }

  dispose(): void {
    this.disposeSystem();
  }
}

function roman(n: number): string {
  const map: Array<[number, string]> = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}
