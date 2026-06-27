// Real confirmed exoplanet systems (NASA Exoplanet Archive), keyed by host name
// matching the galaxy's neighbor stars. Diving into one of these shows its ACTUAL
// planets instead of a procedural system. Semi-major axis (AU), period (yr from
// the real value), radius (Earth radii), and rough composition.
export interface RealExo {
  name: string;
  a: number; // AU
  periodYears: number;
  radiusEarth: number;
  gas: boolean;
  e?: number;
}

export const EXO_SYSTEMS: Record<string, RealExo[]> = {
  'Tau Ceti': [
    { name: 'Tau Ceti g', a: 0.133, periodYears: 0.0548, radiusEarth: 1.8, gas: false },
    { name: 'Tau Ceti h', a: 0.243, periodYears: 0.135, radiusEarth: 1.8, gas: false },
    { name: 'Tau Ceti e', a: 0.538, periodYears: 0.446, radiusEarth: 1.8, gas: false },
    { name: 'Tau Ceti f', a: 1.334, periodYears: 1.742, radiusEarth: 1.9, gas: false },
  ],
  'Epsilon Eridani': [
    { name: 'Epsilon Eridani b', a: 3.5, periodYears: 7.37, radiusEarth: 12, gas: true, e: 0.07 },
  ],
  'Barnard’s Star': [
    { name: 'Barnard b', a: 0.0229, periodYears: 0.00863, radiusEarth: 0.9, gas: false },
  ],
  'Lalande 21185': [
    { name: 'Lalande 21185 b', a: 0.079, periodYears: 0.0355, radiusEarth: 1.4, gas: false },
    { name: 'Lalande 21185 c', a: 2.94, periodYears: 7.94, radiusEarth: 4.2, gas: true },
  ],
  'Ross 128': [
    { name: 'Ross 128 b', a: 0.0496, periodYears: 0.027, radiusEarth: 1.1, gas: false },
  ],
  'Alpha Centauri': [
    { name: 'Proxima d', a: 0.029, periodYears: 0.014, radiusEarth: 0.8, gas: false },
    { name: 'Proxima b', a: 0.0485, periodYears: 0.0306, radiusEarth: 1.1, gas: false },
    { name: 'Proxima c', a: 1.49, periodYears: 5.28, radiusEarth: 3.5, gas: true },
  ],
};
