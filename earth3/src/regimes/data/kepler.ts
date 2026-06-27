// Analytic Keplerian orbits. Given real J2000 orbital elements and absolute time,
// returns a position in the ecliptic render frame (AU units), with the FULL
// orientation R_z(Ω)·R_x(i)·R_z(ω) — so each ellipse is correctly tilted AND
// points the right way (perihelion direction). Analytic (not n-body) keeps planets
// on exact, stable ellipses at any time-rate and lets you scrub time freely.
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

/** Position at mean anomaly `M`, in AU, written into `out`. Ecliptic plane maps to
 *  Three.js X–Z (Y = ecliptic north). Applies Ω (node), i (incl), ω (arg perihelion). */
export function positionAtMeanAnomaly(p: PlanetData, M: number, out: Vector3): Vector3 {
  const E = eccentricAnomaly(M, p.e);

  // perifocal: x toward perihelion, in the orbital plane
  const px = p.a * (Math.cos(E) - p.e);
  const py = p.a * Math.sqrt(1 - p.e * p.e) * Math.sin(E);

  const w = p.argPeriDeg * DEG;
  const O = p.nodeDeg * DEG;
  const i = p.inclDeg * DEG;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const cO = Math.cos(O);
  const sO = Math.sin(O);
  const ci = Math.cos(i);
  const si = Math.sin(i);

  // R_z(Ω)·R_x(i)·R_z(ω) → ecliptic coords (xe, ye in-plane; ze = ecliptic north)
  const xe = (cO * cw - sO * sw * ci) * px + (-cO * sw - sO * cw * ci) * py;
  const ye = (sO * cw + cO * sw * ci) * px + (-sO * sw + cO * cw * ci) * py;
  const ze = (si * sw) * px + (si * cw) * py;

  out.set(xe, ze, ye); // Three.js Y-up: ecliptic north → +Y
  return out;
}

/** Position of a planet at absolute simulated time `seconds`, in AU. */
export function planetPosition(p: PlanetData, seconds: number, out: Vector3): Vector3 {
  const periodSec = p.periodYears * SECONDS_PER_YEAR;
  const M = p.meanAnomDeg * DEG + (2 * Math.PI * seconds) / periodSec;
  return positionAtMeanAnomaly(p, M, out);
}

/** Sample `segments` points around the full orbit ellipse for drawing the path. */
export function orbitPath(p: PlanetData, segments = 192): Vector3[] {
  const pts: Vector3[] = [];
  for (let i = 0; i < segments; i++) {
    const M = (i / segments) * Math.PI * 2;
    pts.push(positionAtMeanAnomaly(p, M, new Vector3()));
  }
  return pts;
}
