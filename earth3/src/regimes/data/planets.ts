// Solar-system bodies with real-ish orbital elements. Distances are rendered in
// AU (1 AU = 1 render unit), so the scene spans ~60 units — comfortable for f32.
// Visual radii are exaggerated for visibility (true radii live in `radiusKm` and
// are shown in the inspector). Orbits are analytic Keplerian (see kepler.ts).
import { Vector3 } from 'three';

export interface PlanetData {
  id: string;
  label: string;
  a: number; // semi-major axis (AU)
  e: number; // eccentricity
  periodYears: number; // orbital period (years)
  inclDeg: number; // inclination to ecliptic (degrees)
  nodeDeg: number; // longitude of ascending node (degrees) — spreads orbits in 3D
  phase: number; // mean anomaly at epoch (radians) — staggers starting positions
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

export const PLANETS: PlanetData[] = [
  { id: 'mercury', label: 'Mercury', a: 0.387, e: 0.2056, periodYears: 0.2408, inclDeg: 7.0, nodeDeg: 48, phase: 0.3, radiusKm: 2440, visualRadius: 0.022, color: 0xb0a08f, blurb: 'Airless, cratered, tidally torqued. Days longer than its years.' },
  { id: 'venus', label: 'Venus', a: 0.723, e: 0.0068, periodYears: 0.6152, inclDeg: 3.39, nodeDeg: 76, phase: 1.1, radiusKm: 6052, visualRadius: 0.044, color: 0xe8cda0, blurb: 'A runaway greenhouse — 460 °C under crushing CO₂ cloud.' },
  { id: 'earth', label: 'Earth', a: 1.0, e: 0.0167, periodYears: 1.0, inclDeg: 0.0, nodeDeg: 0, phase: 1.8, radiusKm: 6371, visualRadius: 0.05, color: 0x4a90d9, childRegime: 'earth', blurb: 'The only known world with a civilization. Dive in.' },
  { id: 'mars', label: 'Mars', a: 1.524, e: 0.0934, periodYears: 1.881, inclDeg: 1.85, nodeDeg: 49, phase: 3.4, radiusKm: 3390, visualRadius: 0.034, color: 0xc1440e, blurb: 'Cold desert with the tallest volcano and a canyon a continent wide.' },
  { id: 'jupiter', label: 'Jupiter', a: 5.203, e: 0.0484, periodYears: 11.86, inclDeg: 1.3, nodeDeg: 100, phase: 0.9, radiusKm: 69_911, visualRadius: 0.15, color: 0xd8b88a, blurb: 'A failed star of hydrogen and helium; its gravity shepherds the system.' },
  { id: 'saturn', label: 'Saturn', a: 9.537, e: 0.0541, periodYears: 29.45, inclDeg: 2.49, nodeDeg: 113, phase: 5.1, radiusKm: 58_232, visualRadius: 0.13, color: 0xe3d6a8, hasRing: true, blurb: 'Ringed gas giant of ice and rock, less dense than water.' },
  { id: 'uranus', label: 'Uranus', a: 19.19, e: 0.0472, periodYears: 84.02, inclDeg: 0.77, nodeDeg: 74, phase: 2.6, radiusKm: 25_362, visualRadius: 0.1, color: 0x9fdcea, blurb: 'An ice giant tipped on its side, rolling around its orbit.' },
  { id: 'neptune', label: 'Neptune', a: 30.07, e: 0.0086, periodYears: 164.8, inclDeg: 1.77, nodeDeg: 131, phase: 4.2, radiusKm: 24_622, visualRadius: 0.095, color: 0x4b70dd, blurb: 'The outer frontier — supersonic winds in deep blue methane skies.' },
];

/** Scratch reused by callers that just need a fresh vector. */
export function vec(): Vector3 {
  return new Vector3();
}
