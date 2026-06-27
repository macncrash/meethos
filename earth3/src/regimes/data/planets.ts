// Solar-system bodies with REAL J2000 orbital elements (JPL/Standish "Keplerian
// Elements for Approximate Positions of the Major Planets", epoch J2000, valid
// 1800–2050) plus axial tilt + sidereal rotation (NASA Planetary Fact Sheet).
//
// Distances render in AU (1 AU = 1 render unit). Visual radii are exaggerated for
// visibility (true radii live in `radiusKm`, shown in the inspector). Orbits are
// analytic Keplerian with the full R_z(Ω)·R_x(i)·R_z(ω) orientation (kepler.ts),
// so the system is genuinely 3D and each ellipse points the right way.
import { Vector3 } from 'three';

export interface PlanetData {
  id: string;
  label: string;
  a: number; // semi-major axis (AU)
  e: number; // eccentricity
  periodYears: number; // sidereal orbital period (years)
  inclDeg: number; // inclination to the ecliptic (deg)
  nodeDeg: number; // longitude of ascending node Ω (deg)
  argPeriDeg: number; // argument of perihelion ω = ϖ − Ω (deg)
  meanAnomDeg: number; // mean anomaly at J2000 M0 = L − ϖ (deg)
  obliquityDeg: number; // axial tilt to its orbit (deg)
  rotationHours: number; // sidereal rotation period (h); negative = retrograde
  radiusKm: number; // true equatorial radius
  visualRadius: number; // render units (exaggerated, ordering preserved)
  color: number;
  hasRing?: boolean;
  childRegime?: string;
  blurb: string;
}

export const SUN = {
  id: 'sun',
  label: 'Sun',
  radiusKm: 696_340,
  visualRadius: 0.26,
  color: 0xffd86b,
  blurb: 'A G2V main-sequence star. 99.86% of the system mass; the gravity well everything else falls around.',
};

// Elements: a, e, period, i (incl), Ω (node), ω (argPeri = ϖ−Ω), M0 (= L−ϖ),
// then axial obliquity and sidereal rotation period (hours; negative = retrograde).
export const PLANETS: PlanetData[] = [
  { id: 'mercury', label: 'Mercury', a: 0.387099, e: 0.205636, periodYears: 0.240846, inclDeg: 7.00498, nodeDeg: 48.33077, argPeriDeg: 29.12703, meanAnomDeg: 174.7948, obliquityDeg: 0.034, rotationHours: 1407.6, radiusKm: 2440, visualRadius: 0.022, color: 0xb0a08f, blurb: 'Airless, cratered, tidally torqued. Days longer than its years.' },
  { id: 'venus', label: 'Venus', a: 0.723332, e: 0.006772, periodYears: 0.615198, inclDeg: 3.39468, nodeDeg: 76.67984, argPeriDeg: 54.92262, meanAnomDeg: 50.3757, obliquityDeg: 177.36, rotationHours: -5832.5, radiusKm: 6052, visualRadius: 0.044, color: 0xe8cda0, blurb: 'A runaway greenhouse — 460 °C under crushing CO₂ cloud. Spins backwards.' },
  { id: 'earth', label: 'Earth', a: 1.000000, e: 0.016711, periodYears: 1.000017, inclDeg: 0.00005, nodeDeg: -11.26064, argPeriDeg: 114.20783, meanAnomDeg: 357.529, obliquityDeg: 23.44, rotationHours: 23.9345, radiusKm: 6371, visualRadius: 0.05, color: 0x4a90d9, childRegime: 'earth', blurb: 'The only known world with a civilization. Axial tilt 23.4° gives it seasons. Dive in.' },
  { id: 'mars', label: 'Mars', a: 1.523710, e: 0.093394, periodYears: 1.880848, inclDeg: 1.84969, nodeDeg: 49.55954, argPeriDeg: 286.4968, meanAnomDeg: 19.3870, obliquityDeg: 25.19, rotationHours: 24.6229, radiusKm: 3390, visualRadius: 0.034, color: 0xc1440e, blurb: 'Cold desert with the tallest volcano and a canyon a continent wide.' },
  { id: 'jupiter', label: 'Jupiter', a: 5.202887, e: 0.048386, periodYears: 11.862615, inclDeg: 1.30440, nodeDeg: 100.47391, argPeriDeg: 274.2546, meanAnomDeg: 19.6685, obliquityDeg: 3.13, rotationHours: 9.925, radiusKm: 69_911, visualRadius: 0.15, color: 0xd8b88a, blurb: 'A failed star of hydrogen and helium; its gravity shepherds the system.' },
  { id: 'saturn', label: 'Saturn', a: 9.536676, e: 0.053862, periodYears: 29.447498, inclDeg: 2.48599, nodeDeg: 113.66242, argPeriDeg: 338.9365, meanAnomDeg: 317.355, obliquityDeg: 26.73, rotationHours: 10.656, radiusKm: 58_232, visualRadius: 0.13, color: 0xe3d6a8, hasRing: true, blurb: 'Ringed gas giant of ice and rock, less dense than water. Rings lie in its tilted equator.' },
  { id: 'uranus', label: 'Uranus', a: 19.189165, e: 0.047257, periodYears: 84.016846, inclDeg: 0.77264, nodeDeg: 74.01693, argPeriDeg: 96.93735, meanAnomDeg: 142.2386, obliquityDeg: 97.77, rotationHours: -17.24, radiusKm: 25_362, visualRadius: 0.1, color: 0x9fdcea, blurb: 'An ice giant tipped on its side (98°), rolling around its orbit.' },
  { id: 'neptune', label: 'Neptune', a: 30.069923, e: 0.008590, periodYears: 164.79132, inclDeg: 1.77004, nodeDeg: 131.78423, argPeriDeg: 273.1805, meanAnomDeg: 259.915, obliquityDeg: 28.32, rotationHours: 16.11, radiusKm: 24_622, visualRadius: 0.095, color: 0x4b70dd, blurb: 'The outer frontier — supersonic winds in deep blue methane skies.' },
];

/** Scratch reused by callers that just need a fresh vector. */
export function vec(): Vector3 {
  return new Vector3();
}
