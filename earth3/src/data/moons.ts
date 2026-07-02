// The major moons of the solar system — real orbits (semi-major axis, sidereal period,
// radius; NASA/JPL fact sheets), propagated as circular orbits tilted by an approximate
// inclination. Circular is honest at this scale: most large moons have e < 0.01 (Luna's
// 0.055 is the big exception), and the point is the true DISTANCES and PERIODS — Phobos
// hugging Mars at 2.8 planet-radii, Callisto 26 Jupiter-radii out, the Uranian system
// tipped on its side with its planet.
//
// Luna IS in this list (planetId 'earth') and propagates through the same formula the
// EarthRegime's visual moon mesh uses after configureMoon() — identical math + identical
// parameters, so the pickable dot and the lit mesh land on the same point every frame.
import { Vector3 } from 'three';
import { SECONDS_PER_DAY } from '../core/units';

export const KM_PER_AU = 149_597_870.7;

export interface MoonData {
  id: string;
  planetId: string; // parent planet id (matches PLANETS)
  label: string;
  aKm: number; // orbit semi-major axis (km, around the parent)
  periodDays: number; // sidereal period (days)
  radiusKm: number;
  incDeg: number; // orbit-PLANE tilt from the ecliptic (approx); >90° flips projected motion
  retrograde?: boolean; // orbits against its planet's spin (Triton) — NOT implied by incDeg:
  // the Uranian moons ride a 98°-tilted plane yet are prograde relative to Uranus's spin
  phaseDeg: number; // position angle at J2000 (stylized except where noted)
  color: number;
  blurb: string;
}

// Inclinations approximate each system's equatorial plane (Jupiter ~3°, Saturn ~27°,
// Uranus ~98° — its moons roll with it — Neptune/Triton retrograde ~130°).
export const MOONS: MoonData[] = [
  // Earth — real inclination to the ecliptic (5.14°) and mean longitude at J2000 (~218°)
  { id: 'luna', planetId: 'earth', label: 'Moon', aKm: 384_400, periodDays: 27.3217, radiusKm: 1_737, incDeg: 5.14, phaseDeg: 218.32, color: 0xc8c8d0, blurb: 'Tidally locked companion — one face always toward home. The gulf is real: 30 Earth-diameters of nothing.' },
  // Mars
  { id: 'phobos', planetId: 'mars', label: 'Phobos', aKm: 9_376, periodDays: 0.3189, radiusKm: 11, incDeg: 25, phaseDeg: 10, color: 0x9a8f82, blurb: 'A doomed rubble pile skimming 6,000 km over Mars — spiralling in, torn apart in ~50 Myr.' },
  { id: 'deimos', planetId: 'mars', label: 'Deimos', aKm: 23_463, periodDays: 1.2624, radiusKm: 6, incDeg: 25, phaseDeg: 200, color: 0xa79c8e, blurb: 'Mars’s tiny outer moon — from the surface, just a bright star that drifts.' },
  // Jupiter — the Galileans
  { id: 'io', planetId: 'jupiter', label: 'Io', aKm: 421_800, periodDays: 1.7691, radiusKm: 1_822, incDeg: 3, phaseDeg: 40, color: 0xd9c96a, blurb: 'The most volcanic world known — tidally kneaded by Jupiter, Europa and Ganymede.' },
  { id: 'europa', planetId: 'jupiter', label: 'Europa', aKm: 671_100, periodDays: 3.5512, radiusKm: 1_561, incDeg: 3, phaseDeg: 130, color: 0xcfc8b8, blurb: 'An ice shell over a global saltwater ocean — a leading place to look for life.' },
  { id: 'ganymede', planetId: 'jupiter', label: 'Ganymede', aKm: 1_070_400, periodDays: 7.1546, radiusKm: 2_634, incDeg: 3, phaseDeg: 220, color: 0xa89f92, blurb: 'The largest moon in the solar system — bigger than Mercury, with its own magnetic field.' },
  { id: 'callisto', planetId: 'jupiter', label: 'Callisto', aKm: 1_882_700, periodDays: 16.689, radiusKm: 2_410, incDeg: 3, phaseDeg: 310, color: 0x8a7f72, blurb: 'The most cratered world known — an ancient, quiet ice-rock survivor.' },
  // Saturn
  { id: 'mimas', planetId: 'saturn', label: 'Mimas', aKm: 185_540, periodDays: 0.942, radiusKm: 198, incDeg: 27, phaseDeg: 15, color: 0xcfd2d6, blurb: 'The Death Star moon — the Herschel crater is a third of its diameter.' },
  { id: 'enceladus', planetId: 'saturn', label: 'Enceladus', aKm: 238_040, periodDays: 1.3702, radiusKm: 252, incDeg: 27, phaseDeg: 95, color: 0xeef2f5, blurb: 'Geysers of ocean water jet from its south pole — the brightest world in the system.' },
  { id: 'tethys', planetId: 'saturn', label: 'Tethys', aKm: 294_670, periodDays: 1.8878, radiusKm: 531, incDeg: 27, phaseDeg: 170, color: 0xd8dade, blurb: 'Almost pure water ice, split by the vast Ithaca Chasma canyon.' },
  { id: 'dione', planetId: 'saturn', label: 'Dione', aKm: 377_420, periodDays: 2.7369, radiusKm: 561, incDeg: 27, phaseDeg: 250, color: 0xc9ccd2, blurb: 'Wispy ice cliffs streak its trailing face.' },
  { id: 'rhea', planetId: 'saturn', label: 'Rhea', aKm: 527_070, periodDays: 4.5175, radiusKm: 764, incDeg: 27, phaseDeg: 330, color: 0xbfc3c9, blurb: 'Saturn’s second-largest moon, dirty ice two-thirds of the way to Titan.' },
  { id: 'titan', planetId: 'saturn', label: 'Titan', aKm: 1_221_870, periodDays: 15.945, radiusKm: 2_575, incDeg: 27, phaseDeg: 60, color: 0xd8a94e, blurb: 'Thick orange haze, methane rain, rivers and seas — the most Earth-like meteorology anywhere.' },
  { id: 'iapetus', planetId: 'saturn', label: 'Iapetus', aKm: 3_560_840, periodDays: 79.33, radiusKm: 735, incDeg: 17, phaseDeg: 140, color: 0xb0a894, blurb: 'One hemisphere coal-black, the other bright ice — the two-faced moon, with an equatorial ridge.' },
  // Uranus — the whole system rides the planet's 98° tilt
  { id: 'miranda', planetId: 'uranus', label: 'Miranda', aKm: 129_900, periodDays: 1.4135, radiusKm: 236, incDeg: 98, phaseDeg: 20, color: 0xc4ccd4, blurb: 'A jumbled patchwork with 20 km ice cliffs — possibly shattered and reassembled.' },
  { id: 'ariel', planetId: 'uranus', label: 'Ariel', aKm: 190_900, periodDays: 2.520, radiusKm: 579, incDeg: 98, phaseDeg: 100, color: 0xc9d0d8, blurb: 'The brightest Uranian moon, its surface veined with fault valleys.' },
  { id: 'umbriel', planetId: 'uranus', label: 'Umbriel', aKm: 266_000, periodDays: 4.144, radiusKm: 585, incDeg: 98, phaseDeg: 190, color: 0x8f959c, blurb: 'The dark one — an ancient, dim surface with one strange bright ring, Wunda.' },
  { id: 'titania', planetId: 'uranus', label: 'Titania', aKm: 436_300, periodDays: 8.706, radiusKm: 789, incDeg: 98, phaseDeg: 280, color: 0xb8bec6, blurb: 'The largest moon of Uranus, canyons hinting at an expanding, once-warm interior.' },
  { id: 'oberon', planetId: 'uranus', label: 'Oberon', aKm: 583_500, periodDays: 13.463, radiusKm: 761, incDeg: 98, phaseDeg: 350, color: 0xa9a49c, blurb: 'Outermost of the big five — old, cratered, faintly red.' },
  // Neptune
  { id: 'triton', planetId: 'neptune', label: 'Triton', aKm: 354_760, periodDays: 5.877, radiusKm: 1_353, incDeg: 130, retrograde: true, phaseDeg: 75, color: 0xd8cfc4, blurb: 'A captured Kuiper-belt world orbiting BACKWARDS, with nitrogen geysers — doomed to spiral in.' },
];

/** Known-moon counts per planet (IAU-confirmed, 2025) — for the inspector cards. */
export const MOON_COUNTS: Record<string, number> = {
  mercury: 0, venus: 0, earth: 1, mars: 2, jupiter: 95, saturn: 274, uranus: 29, neptune: 16,
};

const DEG = Math.PI / 180;

/** Parent-relative position at absolute sim time `seconds`, in AU (ecliptic render frame,
 *  Y-up). A circular orbit in the X–Z plane, tilted `incDeg` about X — a tilt beyond 90°
 *  flips the projected motion (how Triton's backwards orbit manifests visually). */
export function moonLocalPosition(m: MoonData, seconds: number, out: Vector3): Vector3 {
  const a = m.aKm / KM_PER_AU;
  const periodSec = m.periodDays * SECONDS_PER_DAY;
  const th = m.phaseDeg * DEG + (2 * Math.PI * seconds) / periodSec;
  const ci = Math.cos(m.incDeg * DEG);
  const si = Math.sin(m.incDeg * DEG);
  const x = Math.cos(th) * a;
  const z = Math.sin(th) * a;
  // tilt about X: the orbit's z lifts into y
  out.set(x, z * si, z * ci);
  return out;
}
