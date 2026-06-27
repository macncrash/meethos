// Analytic Keplerian orbits. Given orbital elements and absolute time, returns a
// position in the ecliptic render frame (AU units). Using the analytic solution
// (rather than n-body integration) keeps planets on exact, stable ellipses at any
// time-rate and lets you scrub time freely — the right call for an orrery.
import { Vector3 } from 'three';
import { SECONDS_PER_YEAR } from '../../core/units';
import type { PlanetData } from './planets';

const DEG = Math.PI / 180;

/** Solve Kepler's equation M = E - e·sin E for the eccentric anomaly E (Newton). */
function eccentricAnomaly(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 8; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-7) break;
  }
  return E;
}

/** Position at a given mean anomaly `M`, in AU, written into `out`. Three.js Y-up:
 *  the ecliptic lies in the X–Z plane and inclination lifts into Y. */
export function positionAtMeanAnomaly(p: PlanetData, M: number, out: Vector3): Vector3 {
  const E = eccentricAnomaly(M, p.e);

  // Perifocal coordinates with the Sun at the focus (origin).
  const xv = p.a * (Math.cos(E) - p.e);
  const yv = p.a * Math.sqrt(1 - p.e * p.e) * Math.sin(E);

  const inc = p.inclDeg * DEG;
  const node = p.nodeDeg * DEG;
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);
  const cosN = Math.cos(node);
  const sinN = Math.sin(node);

  const x1 = xv;
  const y1 = yv * cosI;
  const z1 = yv * sinI;

  out.set(x1 * cosN - y1 * sinN, z1, x1 * sinN + y1 * cosN);
  return out;
}

/** Position of a planet at absolute simulated time `seconds`, in AU. */
export function planetPosition(p: PlanetData, seconds: number, out: Vector3): Vector3 {
  const periodSec = p.periodYears * SECONDS_PER_YEAR;
  const M = p.phase + (2 * Math.PI * seconds) / periodSec;
  return positionAtMeanAnomaly(p, M, out);
}

/** Sample `segments` points around the full orbit ellipse for drawing the path. */
export function orbitPath(p: PlanetData, segments = 160): Vector3[] {
  const pts: Vector3[] = [];
  for (let i = 0; i < segments; i++) {
    const M = (i / segments) * Math.PI * 2;
    pts.push(positionAtMeanAnomaly(p, M, new Vector3()));
  }
  return pts;
}
