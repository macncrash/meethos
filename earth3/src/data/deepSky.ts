// The bright deep sky — a curated catalogue of the ~50 finest deep-sky objects
// (Messier highlights, the Magellanic Clouds, the great southern showpieces), with
// real J2000 coordinates, apparent magnitudes, angular sizes and distances. Placed
// at TRUE 3D positions (direction × distance), so they are both sky objects from
// Earth AND destinations: fly to M31 and you really travel 2.5 million light-years.
export interface DeepSkyObject {
  id: string;
  name: string;
  type: 'galaxy' | 'globular' | 'open' | 'nebula' | 'planetary' | 'remnant';
  raH: number; // right ascension, decimal hours (J2000)
  decDeg: number;
  mag: number; // apparent V magnitude
  sizeArcmin: number; // major-axis angular size
  distLy: number;
  con: string; // IAU constellation code
}

export const DEEP_SKY: DeepSkyObject[] = [
  { id: 'm31', name: 'Andromeda Galaxy (M31)', type: 'galaxy', raH: 0.712, decDeg: 41.27, mag: 3.4, sizeArcmin: 190, distLy: 2.537e6, con: 'And' },
  { id: 'm32', name: 'M32', type: 'galaxy', raH: 0.712, decDeg: 40.87, mag: 8.1, sizeArcmin: 8, distLy: 2.49e6, con: 'And' },
  { id: 'm110', name: 'M110', type: 'galaxy', raH: 0.673, decDeg: 41.69, mag: 8.5, sizeArcmin: 17, distLy: 2.69e6, con: 'And' },
  { id: 'm33', name: 'Triangulum Galaxy (M33)', type: 'galaxy', raH: 1.564, decDeg: 30.66, mag: 5.7, sizeArcmin: 70, distLy: 2.73e6, con: 'Tri' },
  { id: 'lmc', name: 'Large Magellanic Cloud', type: 'galaxy', raH: 5.393, decDeg: -69.76, mag: 0.9, sizeArcmin: 645, distLy: 1.63e5, con: 'Dor' },
  { id: 'smc', name: 'Small Magellanic Cloud', type: 'galaxy', raH: 0.877, decDeg: -72.83, mag: 2.7, sizeArcmin: 320, distLy: 2.0e5, con: 'Tuc' },
  { id: 'm51', name: 'Whirlpool Galaxy (M51)', type: 'galaxy', raH: 13.497, decDeg: 47.2, mag: 8.4, sizeArcmin: 11, distLy: 2.3e7, con: 'CVn' },
  { id: 'm81', name: "Bode's Galaxy (M81)", type: 'galaxy', raH: 9.926, decDeg: 69.07, mag: 6.9, sizeArcmin: 27, distLy: 1.2e7, con: 'UMa' },
  { id: 'm82', name: 'Cigar Galaxy (M82)', type: 'galaxy', raH: 9.931, decDeg: 69.68, mag: 8.4, sizeArcmin: 11, distLy: 1.2e7, con: 'UMa' },
  { id: 'm101', name: 'Pinwheel Galaxy (M101)', type: 'galaxy', raH: 14.053, decDeg: 54.35, mag: 7.9, sizeArcmin: 29, distLy: 2.1e7, con: 'UMa' },
  { id: 'm104', name: 'Sombrero Galaxy (M104)', type: 'galaxy', raH: 12.666, decDeg: -11.62, mag: 8.0, sizeArcmin: 9, distLy: 3.1e7, con: 'Vir' },
  { id: 'm87', name: 'Virgo A (M87)', type: 'galaxy', raH: 12.514, decDeg: 12.39, mag: 8.6, sizeArcmin: 8, distLy: 5.3e7, con: 'Vir' },
  { id: 'm49', name: 'M49', type: 'galaxy', raH: 12.496, decDeg: 8.0, mag: 8.4, sizeArcmin: 10, distLy: 5.6e7, con: 'Vir' },
  { id: 'm64', name: 'Black Eye Galaxy (M64)', type: 'galaxy', raH: 12.945, decDeg: 21.68, mag: 8.5, sizeArcmin: 10, distLy: 1.7e7, con: 'Com' },
  { id: 'm83', name: 'Southern Pinwheel (M83)', type: 'galaxy', raH: 13.617, decDeg: -29.87, mag: 7.5, sizeArcmin: 13, distLy: 1.5e7, con: 'Hya' },
  { id: 'm94', name: 'M94', type: 'galaxy', raH: 12.849, decDeg: 41.12, mag: 8.2, sizeArcmin: 11, distLy: 1.6e7, con: 'CVn' },
  { id: 'm106', name: 'M106', type: 'galaxy', raH: 12.316, decDeg: 47.3, mag: 8.4, sizeArcmin: 19, distLy: 2.4e7, con: 'CVn' },
  { id: 'm77', name: 'M77', type: 'galaxy', raH: 2.712, decDeg: -0.01, mag: 8.9, sizeArcmin: 7, distLy: 4.7e7, con: 'Cet' },
  { id: 'cena', name: 'Centaurus A (NGC 5128)', type: 'galaxy', raH: 13.425, decDeg: -43.02, mag: 6.8, sizeArcmin: 26, distLy: 1.3e7, con: 'Cen' },
  { id: 'n253', name: 'Sculptor Galaxy (NGC 253)', type: 'galaxy', raH: 0.793, decDeg: -25.29, mag: 7.1, sizeArcmin: 27, distLy: 1.14e7, con: 'Scl' },
  { id: 'omcen', name: 'Omega Centauri', type: 'globular', raH: 13.446, decDeg: -47.48, mag: 3.9, sizeArcmin: 36, distLy: 15800, con: 'Cen' },
  { id: '47tuc', name: '47 Tucanae', type: 'globular', raH: 0.401, decDeg: -72.08, mag: 4.1, sizeArcmin: 31, distLy: 13000, con: 'Tuc' },
  { id: 'm13', name: 'Hercules Cluster (M13)', type: 'globular', raH: 16.695, decDeg: 36.46, mag: 5.8, sizeArcmin: 20, distLy: 22200, con: 'Her' },
  { id: 'm22', name: 'M22', type: 'globular', raH: 18.607, decDeg: -23.9, mag: 5.1, sizeArcmin: 24, distLy: 10600, con: 'Sgr' },
  { id: 'm4', name: 'M4', type: 'globular', raH: 16.393, decDeg: -26.53, mag: 5.6, sizeArcmin: 26, distLy: 7200, con: 'Sco' },
  { id: 'm5', name: 'M5', type: 'globular', raH: 15.31, decDeg: 2.08, mag: 5.6, sizeArcmin: 17, distLy: 24500, con: 'Ser' },
  { id: 'm3', name: 'M3', type: 'globular', raH: 13.703, decDeg: 28.38, mag: 6.2, sizeArcmin: 16, distLy: 33900, con: 'CVn' },
  { id: 'm15', name: 'M15', type: 'globular', raH: 21.5, decDeg: 12.17, mag: 6.2, sizeArcmin: 12, distLy: 33600, con: 'Peg' },
  { id: 'm92', name: 'M92', type: 'globular', raH: 17.285, decDeg: 43.14, mag: 6.3, sizeArcmin: 11, distLy: 26700, con: 'Her' },
  { id: 'm2', name: 'M2', type: 'globular', raH: 21.558, decDeg: -0.82, mag: 6.5, sizeArcmin: 13, distLy: 37500, con: 'Aqr' },
  { id: 'm42', name: 'Orion Nebula (M42)', type: 'nebula', raH: 5.588, decDeg: -5.39, mag: 4.0, sizeArcmin: 85, distLy: 1344, con: 'Ori' },
  { id: 'carina', name: 'Carina Nebula', type: 'nebula', raH: 10.752, decDeg: -59.87, mag: 1.0, sizeArcmin: 120, distLy: 8500, con: 'Car' },
  { id: 'm8', name: 'Lagoon Nebula (M8)', type: 'nebula', raH: 18.06, decDeg: -24.38, mag: 6.0, sizeArcmin: 90, distLy: 4100, con: 'Sgr' },
  { id: 'm20', name: 'Trifid Nebula (M20)', type: 'nebula', raH: 18.03, decDeg: -23.03, mag: 6.3, sizeArcmin: 28, distLy: 5200, con: 'Sgr' },
  { id: 'm17', name: 'Omega Nebula (M17)', type: 'nebula', raH: 18.34, decDeg: -16.18, mag: 6.0, sizeArcmin: 11, distLy: 5500, con: 'Sgr' },
  { id: 'm16', name: 'Eagle Nebula (M16)', type: 'nebula', raH: 18.31, decDeg: -13.78, mag: 6.0, sizeArcmin: 7, distLy: 7000, con: 'Ser' },
  { id: 'm1', name: 'Crab Nebula (M1)', type: 'remnant', raH: 5.575, decDeg: 22.02, mag: 8.4, sizeArcmin: 6, distLy: 6500, con: 'Tau' },
  { id: 'm27', name: 'Dumbbell Nebula (M27)', type: 'planetary', raH: 19.99, decDeg: 22.72, mag: 7.4, sizeArcmin: 8, distLy: 1360, con: 'Vul' },
  { id: 'm57', name: 'Ring Nebula (M57)', type: 'planetary', raH: 18.89, decDeg: 33.03, mag: 8.8, sizeArcmin: 1.4, distLy: 2570, con: 'Lyr' },
  { id: 'helix', name: 'Helix Nebula', type: 'planetary', raH: 22.49, decDeg: -20.84, mag: 7.6, sizeArcmin: 25, distLy: 655, con: 'Aqr' },
  { id: 'm45', name: 'Pleiades (M45)', type: 'open', raH: 3.79, decDeg: 24.12, mag: 1.6, sizeArcmin: 110, distLy: 444, con: 'Tau' },
  { id: 'm44', name: 'Beehive Cluster (M44)', type: 'open', raH: 8.67, decDeg: 19.98, mag: 3.7, sizeArcmin: 95, distLy: 577, con: 'Cnc' },
  { id: 'dbl', name: 'Double Cluster', type: 'open', raH: 2.34, decDeg: 57.14, mag: 4.3, sizeArcmin: 60, distLy: 7500, con: 'Per' },
  { id: 'm6', name: 'Butterfly Cluster (M6)', type: 'open', raH: 17.67, decDeg: -32.22, mag: 4.2, sizeArcmin: 25, distLy: 1600, con: 'Sco' },
  { id: 'm7', name: "Ptolemy's Cluster (M7)", type: 'open', raH: 17.897, decDeg: -34.79, mag: 3.3, sizeArcmin: 80, distLy: 980, con: 'Sco' },
  { id: 'm11', name: 'Wild Duck Cluster (M11)', type: 'open', raH: 18.851, decDeg: -6.27, mag: 6.3, sizeArcmin: 14, distLy: 6200, con: 'Sct' },
  { id: 'm35', name: 'M35', type: 'open', raH: 6.148, decDeg: 24.34, mag: 5.3, sizeArcmin: 28, distLy: 2800, con: 'Gem' },
  { id: 'm37', name: 'M37', type: 'open', raH: 5.873, decDeg: 32.55, mag: 6.2, sizeArcmin: 24, distLy: 4500, con: 'Aur' },
  { id: 'm67', name: 'M67', type: 'open', raH: 8.855, decDeg: 11.81, mag: 6.9, sizeArcmin: 30, distLy: 2700, con: 'Cnc' },
  { id: 'ic2602', name: 'Southern Pleiades', type: 'open', raH: 10.716, decDeg: -64.4, mag: 1.9, sizeArcmin: 100, distLy: 480, con: 'Car' },
  { id: 'jewel', name: 'Jewel Box Cluster', type: 'open', raH: 12.895, decDeg: -60.33, mag: 4.2, sizeArcmin: 10, distLy: 6400, con: 'Cru' },
];
