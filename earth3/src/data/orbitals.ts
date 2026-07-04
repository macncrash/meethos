// Earth's orbital shell — the named residents and the junk. Real geometry (NASA/ESA
// values): altitudes, periods, inclinations for the famous spacecraft; statistically
// honest shell parameters for the debris population (ESA Space Environment Report:
// ~36,500 tracked objects >10 cm, ~1M 1–10 cm, ~130M 1 mm–1 cm as of the mid-2020s).
//
// Everything here is EARTH-CENTRED: positions come out in AU relative to Earth, in the
// same tilted-circle form as data/moons.ts (X–Z ecliptic plane, tilt about X). Orbits
// are circles at the real radius/period — honest at display scale for LEO/MEO/GEO.
import { Vector3 } from 'three';

export const KM_PER_AU_ORB = 149_597_870.7;
const EARTH_R_KM = 6_371;
const DEG = Math.PI / 180;

export interface SatelliteData {
  id: string;
  label: string;
  altKm: number; // altitude above the surface (mean)
  periodMin: number; // orbital period (minutes)
  incDeg: number; // inclination (to the equator ≈ ecliptic at this fidelity)
  phaseDeg: number; // stylized starting position
  launched: [number, number, number]; // real launch date [y, m, d] — nothing renders before it
  color: number;
  blurb: string;
}

/** J2000-relative sim seconds of a UTC calendar date (negative before 2000). */
export function utcSeconds([y, mo, d]: [number, number, number]): number {
  return (Date.UTC(y, mo - 1, d, 12) - Date.UTC(2000, 0, 1, 12)) / 1000;
}

/** The named residents — one dot each, searchable, inspectable. */
export const SATELLITES: SatelliteData[] = [
  { id: 'iss', label: 'ISS', altKm: 408, periodMin: 92.9, incDeg: 51.6, phaseDeg: 0, launched: [1998, 11, 20], color: 0xbfe8ff, blurb: 'The International Space Station — a football-field-sized lab at 7.66 km/s, sixteen sunrises a day. Crewed continuously since 2000.' },
  { id: 'hubble', label: 'Hubble', altKm: 535, periodMin: 95.4, incDeg: 28.5, phaseDeg: 70, launched: [1990, 4, 24], color: 0xd8d2c4, blurb: 'The Hubble Space Telescope — three decades of deep fields from just above the atmosphere.' },
  { id: 'tiangong', label: 'Tiangong', altKm: 390, periodMin: 92.4, incDeg: 41.5, phaseDeg: 150, launched: [2021, 4, 29], color: 0xe8c9a0, blurb: 'China’s space station — three modules, permanently crewed.' },
  { id: 'gps', label: 'GPS constellation', altKm: 20_180, periodMin: 717.9, incDeg: 55, phaseDeg: 40, launched: [1978, 2, 22], color: 0x9fd6a8, blurb: 'Thirty-one satellites in six planes at half-geosynchronous — every phone on Earth listens to their clocks.' },
  { id: 'geo-sat', label: 'GEO ring', altKm: 35_786, periodMin: 1436.1, incDeg: 0, phaseDeg: 200, launched: [1964, 8, 19], color: 0xd6b8ff, blurb: 'Geostationary orbit — one sidereal day, so each satellite hangs over a fixed spot. A single ring of prime real estate.' },
];

/** Debris/constellation SHELLS — rendered as point clouds, with honest counts. */
export interface ShellData {
  id: string;
  label: string;
  altLoKm: number;
  altHiKm: number;
  incMaxDeg: number; // inclination spread (0 = equatorial ring, 90+ = all over)
  points: number; // rendered points (a sample, NOT the real count)
  realCount: string; // the honest number, for the card
  launched: [number, number, number]; // when this population began (first object)
  color: number;
  blurb: string;
}

export const SHELLS: ShellData[] = [
  { id: 'leo-debris', label: 'Space junk (LEO)', altLoKm: 400, altHiKm: 2_000, incMaxDeg: 100, points: 2_600, realCount: '~36,500 tracked >10 cm · ~130 M >1 mm', launched: [1957, 10, 4], color: 0xff9a7a, blurb: 'The junk: dead satellites, spent stages, fragments of collisions and anti-satellite tests. It all began with Sputnik, 1957. Low orbits self-clean in years-to-decades; 800–1,000 km stays up for centuries — the Kessler regime.' },
  { id: 'starlink', label: 'Starlink shells', altLoKm: 540, altHiKm: 570, incMaxDeg: 53, points: 900, realCount: '~7,000 active', launched: [2019, 5, 24], color: 0x8fb7ff, blurb: 'The megaconstellation — more than half of all active satellites, in tight shells around 550 km.' },
  { id: 'geo-belt', label: 'GEO belt', altLoKm: 35_700, altHiKm: 35_900, incMaxDeg: 8, points: 500, realCount: '~580 active + graveyard', launched: [1965, 4, 6], color: 0xc9a8ff, blurb: 'The geostationary belt seen edge-on is a thin luminous ring 36,000 km up — plus the "graveyard" orbits 300 km above it.' },
];

/** Earth-relative position (AU) of a satellite at absolute sim time `seconds` — the
 *  same tilted-circle form as data/moons.ts moonLocalPosition. */
export function satLocalPosition(s: SatelliteData, seconds: number, out: Vector3): Vector3 {
  const a = (EARTH_R_KM + s.altKm) / KM_PER_AU_ORB;
  const th = s.phaseDeg * DEG + (2 * Math.PI * seconds) / (s.periodMin * 60);
  const ci = Math.cos(s.incDeg * DEG);
  const si = Math.sin(s.incDeg * DEG);
  const x = Math.cos(th) * a;
  const z = Math.sin(th) * a;
  out.set(x, z * si, z * ci);
  return out;
}
