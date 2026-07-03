// Mission planning — "we want to go to Mars: when do we leave, how long, how hard?"
//
// A patched-conic Hohmann planner over the sim's OWN Kepler propagation: the transfer
// geometry (time, phase angle, Δv) uses the classic circular-coplanar approximation,
// but the LAUNCH WINDOW is found by numerically searching the engine's real J2000
// ephemeris for the moment the true phase angle matches — so departure dates come out
// as real calendar dates (searching from J2000 finds Mars windows where history put
// them). Δv figures are heliocentric (the interplanetary legs); climbing out of the
// origin's gravity well is extra, and the card says so.
import { Vector3 } from 'three';
import { SECONDS_PER_DAY, SECONDS_PER_YEAR } from './units';
import { planetPosition } from '../regimes/data/kepler';
import type { PlanetData } from '../regimes/data/planets';

const KMS_PER_AU_YR = 4.74047; // 1 AU/year in km/s
const MU_SUN = 4 * Math.PI * Math.PI; // AU³/yr² (so P² = a³ falls out)

export interface MissionPlan {
  fromId: string;
  toId: string;
  departSeconds: number; // sim time of the window
  arriveSeconds: number;
  transferDays: number;
  phaseReqDeg: number; // required lead angle of the destination at departure
  dv1Kms: number; // heliocentric injection Δv
  dv2Kms: number; // heliocentric arrival Δv
  outward: boolean; // false = inward transfer (destination closer to the Sun)
}

/** heliocentric ecliptic longitude (deg) of a planet at sim time `seconds` */
function longitudeDeg(p: PlanetData, seconds: number, tmp: Vector3): number {
  planetPosition(p, seconds, tmp);
  return (Math.atan2(tmp.z, tmp.x) * 180) / Math.PI; // render frame: ecliptic = X–Z
}

const wrap180 = (a: number): number => ((a + 540) % 360) - 180;

/** Plan the next Hohmann window from `from` to `to`, searching forward from
 *  `startSeconds` through the engine's real ephemeris. */
export function planMission(from: PlanetData, to: PlanetData, startSeconds: number): MissionPlan {
  const a1 = from.a;
  const a2 = to.a;
  const at = (a1 + a2) / 2;
  const transferYears = 0.5 * Math.sqrt(at * at * at); // half the transfer period
  const transferDays = transferYears * 365.25;

  // required phase: the destination must be where the ship lands when it gets there
  const omega2 = 360 / to.periodYears; // deg/yr
  const phaseReqDeg = wrap180(180 - omega2 * transferYears);

  // heliocentric vis-viva Δv at both ends (circular endpoints)
  const vC1 = Math.sqrt(MU_SUN / a1);
  const vC2 = Math.sqrt(MU_SUN / a2);
  const vT1 = Math.sqrt(MU_SUN * (2 / a1 - 1 / at));
  const vT2 = Math.sqrt(MU_SUN * (2 / a2 - 1 / at));
  const dv1Kms = Math.abs(vT1 - vC1) * KMS_PER_AU_YR;
  const dv2Kms = Math.abs(vC2 - vT2) * KMS_PER_AU_YR;

  // search the real ephemeris for the next time the true phase matches (coarse daily
  // scan for a sign change of the wrapped error, then bisection). The synodic period
  // bounds the search; slow outer pairs change phase slowly, so allow a bit over one.
  const tmpA = new Vector3();
  const tmpB = new Vector3();
  const phaseErr = (s: number): number =>
    wrap180(longitudeDeg(to, s, tmpA) - longitudeDeg(from, s, tmpB) - phaseReqDeg);
  const synodicYears = 1 / Math.abs(1 / from.periodYears - 1 / to.periodYears);
  const horizon = startSeconds + synodicYears * 1.25 * SECONDS_PER_YEAR;
  const step = SECONDS_PER_DAY; // 1-day scan
  let departSeconds = horizon;
  let prevS = startSeconds;
  let prevE = phaseErr(prevS);
  for (let s = startSeconds + step; s <= horizon; s += step) {
    const e = phaseErr(s);
    // the error decreases through 0 as the origin catches up — accept any sign change
    // that isn't the ±180 wrap (|jump| < 180 keeps it a true zero crossing)
    if (Math.sign(e) !== Math.sign(prevE) && Math.abs(e - prevE) < 180) {
      let lo = prevS;
      let hi = s;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (Math.sign(phaseErr(mid)) === Math.sign(phaseErr(lo))) lo = mid;
        else hi = mid;
      }
      departSeconds = (lo + hi) / 2;
      break;
    }
    prevS = s;
    prevE = e;
  }

  return {
    fromId: from.id,
    toId: to.id,
    departSeconds,
    arriveSeconds: departSeconds + transferYears * SECONDS_PER_YEAR,
    transferDays,
    phaseReqDeg,
    dv1Kms,
    dv2Kms,
    outward: a2 > a1,
  };
}

/** Sample the transfer arc between the REAL departure and arrival points. The radius
 *  profile is the Hohmann half-ellipse, but the arc sweeps the ACTUAL prograde angle
 *  between the two true positions (the real ephemeris is not exactly 180° apart —
 *  drawing a fixed half-ellipse would miss the destination by tenths of an AU). Both
 *  endpoints land exactly on the planets. Absolute AU, heliocentric render frame. */
export function transferArc(from: PlanetData, to: PlanetData, plan: MissionPlan, segments = 96): Vector3[] {
  const r1v = planetPosition(from, plan.departSeconds, new Vector3());
  const r2v = planetPosition(to, plan.arriveSeconds, new Vector3());
  // The arc is built in the ECLIPTIC projection with the out-of-plane height LERPed
  // between the true endpoints. Hohmann targeting puts the endpoints ~180° apart, so a
  // plane from r1×r2 is ill-conditioned — the planets' small ecliptic heights dominate
  // the cross product and the drawn arc (and the camera-followed ship) can dive most of
  // an AU out of the ecliptic. Projected radii keep the endpoints EXACT.
  const r1 = Math.hypot(r1v.x, r1v.z);
  const r2 = Math.hypot(r2v.x, r2v.z);
  const a = (r1 + r2) / 2;
  const rp = Math.min(r1, r2);
  const e = 1 - rp / a; // ellipse with r(0)=r1, r(π)=r2 exactly
  // in-plane basis: x̂ toward the departure point's ecliptic direction; ŷ = the
  // direction of increasing heliocentric longitude (X→Z here) — the way the planets
  // actually run in this frame, so the arc sweeps prograde
  const xh = new Vector3(r1v.x, 0, r1v.z).normalize();
  const yh = new Vector3(-xh.z, 0, xh.x);
  // the true prograde sweep angle to the arrival's ecliptic direction, in (0, 2π)
  let sweep = Math.atan2(yh.dot(r2v) / r2, xh.dot(r2v) / r2);
  if (sweep <= 0) sweep += Math.PI * 2;
  const pts: Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const phi = f * sweep; // actual travel angle
    // outward transfers depart at perihelion (ν_peri = ν); inward at apoapsis
    const nuFromPeri = plan.outward ? f * Math.PI : Math.PI - f * Math.PI;
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(nuFromPeri));
    pts.push(
      xh.clone().multiplyScalar(r * Math.cos(phi))
        .addScaledVector(yh, r * Math.sin(phi))
        .setY(r1v.y + (r2v.y - r1v.y) * f),
    );
  }
  return pts;
}

/** The ship's position along the arc at time fraction `f` ∈ [0,1], with KEPLER-TRUE
 *  pacing — fast at the Sun-side end, slow at the far end — via the transfer ellipse's
 *  own eccentric anomaly (the ellipse's shape is recovered from the arc endpoints). */
export function shipPosition(arc: Vector3[], f: number, out: Vector3): Vector3 {
  const clamped = Math.max(0, Math.min(1, f));
  const r1 = arc[0]!.length();
  const r2 = arc[arc.length - 1]!.length();
  const a = (r1 + r2) / 2;
  const e = 1 - Math.min(r1, r2) / a;
  const outward = r1 <= r2;
  // mean anomaly runs uniformly in time: peri→apo for outward, apo→peri for inward
  const M = outward ? clamped * Math.PI : Math.PI + clamped * Math.PI;
  // Kepler's equation. Newton from E₀=M DIVERGES near perihelion for the extreme
  // ellipses (Mercury↔Neptune: e≈0.97). Solve in the well-behaved half [0, π] via the
  // reflection E(2π−M) = 2π−E(M), with the high-e seed the engine's own solver uses.
  const mirrored = M > Math.PI;
  const Mh = mirrored ? 2 * Math.PI - M : M;
  let E = e < 0.8 ? Mh : Math.PI;
  for (let i = 0; i < 16; i++) {
    const dE = (E - e * Math.sin(E) - Mh) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-9) break;
  }
  if (mirrored) E = 2 * Math.PI - E;
  const nuFromPeri = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  // travel angle from the departure end (the arc's parameter)
  const travel = outward ? nuFromPeri : nuFromPeri - Math.PI;
  const idx = Math.max(0, Math.min(1, travel / Math.PI)) * (arc.length - 1);
  const i = Math.floor(idx);
  const t = idx - i;
  const p = arc[i]!;
  const q = arc[Math.min(i + 1, arc.length - 1)]!;
  return out.copy(p).lerp(q, t);
}
