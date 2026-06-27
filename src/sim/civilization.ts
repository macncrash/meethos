// Agent-based civilization on a planet surface — the SimCity-but-planetary layer.
// Settlements sit on land, grow logistically toward a habitability-limited
// carrying capacity, and spawn colonies into nearby habitable land as they
// mature. Global population drives the "era". Deterministic from a seed.
//
// Render data is exposed as flat typed arrays (positions on the unit sphere,
// sizes, colors) so the Earth regime can stream it straight into Three.js —
// the same SoA discipline as ethersim's archetypes.
import { Color, Vector3 } from 'three';
import { mulberry32, type Rng } from '../core/rng';
import type { PlanetField } from '../world/planetField';

export interface Settlement {
  dir: Vector3; // unit position on the sphere
  pop: number;
  founded: number; // sim-year founded
  habitability: number;
}

export type Era =
  | 'Founding'
  | 'Settlements'
  | 'Cities'
  | 'Industrial'
  | 'Global'
  | 'Spacefaring';

const ERA_THRESHOLDS: Array<[number, Era]> = [
  [0, 'Founding'],
  [5e4, 'Settlements'],
  [5e6, 'Cities'],
  [2e8, 'Industrial'],
  [2e9, 'Global'],
  [8e9, 'Spacefaring'],
];

export const MAX_SETTLEMENTS = 720;
const GROWTH_RATE = 0.022; // per year, logistic r
const BASE_CAPACITY = 9e6; // people at habitability 1, pre-tech
const FOUND_POP = 200;
const MATURE_FRACTION = 0.45; // colonize once this fraction of capacity reached
const MIN_SPACING = 0.05; // radians between settlements
const MIGRATION_REACH = 0.35; // radians a colony can travel

export class Civilization {
  readonly settlements: Settlement[] = [];
  years = 0;
  totalPopulation = 0;
  private readonly rng: Rng;
  private readonly tmp = new Vector3();

  constructor(
    private readonly field: PlanetField,
    seed = 0x5eed,
  ) {
    this.rng = mulberry32(seed);
    this.seedCradles();
    this.recomputeTotals();
  }

  get era(): Era {
    let era: Era = 'Founding';
    for (const [t, e] of ERA_THRESHOLDS) if (this.totalPopulation >= t) era = e;
    return era;
  }

  /** tech multiplier on carrying capacity, climbing with population (agriculture → industry). */
  private get techFactor(): number {
    return 1 + Math.log10(1 + this.totalPopulation / 1e5) * 0.9;
  }

  private capacity(habitability: number): number {
    return habitability * BASE_CAPACITY * this.techFactor;
  }

  private seedCradles(): void {
    let placed = 0;
    let attempts = 0;
    while (placed < 4 && attempts < 4000) {
      attempts++;
      const dir = this.randomLand(0.55);
      if (!dir) continue;
      if (this.tooClose(dir)) continue;
      this.settlements.push({ dir, pop: FOUND_POP, founded: 0, habitability: this.field.habitability(dir) });
      placed++;
    }
  }

  /** advance the model by `years` of simulated time (sub-stepped for stability). */
  advance(years: number): void {
    if (years <= 0) return;
    let remaining = years;
    while (remaining > 0) {
      const step = Math.min(remaining, 2);
      this.tick(step);
      remaining -= step;
    }
  }

  private tick(dtYears: number): void {
    this.years += dtYears;
    const colonizers: Vector3[] = [];

    for (const s of this.settlements) {
      const K = this.capacity(s.habitability);
      // logistic growth
      s.pop += GROWTH_RATE * s.pop * (1 - s.pop / Math.max(1, K)) * dtYears;
      s.pop = Math.max(FOUND_POP * 0.5, s.pop);

      // mature settlements occasionally send out colonies
      if (
        this.settlements.length + colonizers.length < MAX_SETTLEMENTS &&
        s.pop > K * MATURE_FRACTION &&
        this.years - s.founded > 25
      ) {
        const pColonize = 0.012 * dtYears * Math.min(2, this.techFactor);
        if (this.rng() < pColonize) {
          const dest = this.findColonySite(s.dir);
          if (dest) colonizers.push(dest);
        }
      }
    }

    for (const dir of colonizers) {
      this.settlements.push({ dir, pop: FOUND_POP, founded: this.years, habitability: this.field.habitability(dir) });
    }

    this.recomputeTotals();
  }

  private findColonySite(from: Vector3): Vector3 | null {
    let best: Vector3 | null = null;
    let bestScore = 0;
    for (let i = 0; i < 12; i++) {
      const cand = this.jitterOnSphere(from, MIGRATION_REACH);
      const h = this.field.habitability(cand);
      if (h <= 0.05) continue;
      if (this.tooClose(cand)) continue;
      if (h > bestScore) {
        bestScore = h;
        best = cand;
      }
    }
    return best;
  }

  private recomputeTotals(): void {
    let total = 0;
    for (const s of this.settlements) total += s.pop;
    this.totalPopulation = total;
  }

  // ---- geometry helpers ----

  private randomLand(minHab: number): Vector3 | null {
    for (let i = 0; i < 40; i++) {
      const dir = randomDir(this.rng);
      if (this.field.habitability(dir) >= minHab) return dir;
    }
    return null;
  }

  private jitterOnSphere(base: Vector3, maxAngle: number): Vector3 {
    const angle = maxAngle * Math.sqrt(this.rng());
    const azim = this.rng() * Math.PI * 2;
    // build a tangent frame at `base`
    const t = Math.abs(base.y) < 0.9 ? this.tmp.set(0, 1, 0) : this.tmp.set(1, 0, 0);
    const u = new Vector3().crossVectors(base, t).normalize();
    const v = new Vector3().crossVectors(base, u).normalize();
    return new Vector3()
      .copy(base)
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(u, Math.sin(angle) * Math.cos(azim))
      .addScaledVector(v, Math.sin(angle) * Math.sin(azim))
      .normalize();
  }

  private tooClose(dir: Vector3): boolean {
    for (const s of this.settlements) {
      if (dir.dot(s.dir) > Math.cos(MIN_SPACING)) return true;
    }
    return false;
  }
}

// Era → marker color, from frontier ember to spacefaring cyan.
const ERA_COLOR: Record<Era, number> = {
  Founding: 0xff7a3c,
  Settlements: 0xffb347,
  Cities: 0xffe08a,
  Industrial: 0xc8f08a,
  Global: 0x7ad6ff,
  Spacefaring: 0x9affe6,
};

export function eraColor(era: Era, out = new Color()): Color {
  return out.set(ERA_COLOR[era]);
}

function randomDir(rng: Rng): Vector3 {
  const u = rng() * 2 - 1;
  const t = rng() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return new Vector3(s * Math.cos(t), u, s * Math.sin(t));
}
