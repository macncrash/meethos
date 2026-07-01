// meethos-core · units
//
// The nucleus of the meethos library (lives in earth3/ for now; graduates to
// packages/meethos-core when the engine is split from the game). Real physical
// constants and a single canonical internal length unit so scale stops being
// arbitrary. We carry positions in JS numbers (IEEE f64) and only ever upload
// camera-RELATIVE float32 to the GPU (see floatingOrigin.ts).

export const AU_M = 1.495978707e11; // metres in an astronomical unit (exact, IAU)
export const LY_M = 9.4607304725808e15; // metres in a light-year
export const PC_M = 3.0856775814913673e16; // metres in a parsec
export const KPC_M = PC_M * 1e3;
export const MPC_M = PC_M * 1e6;

// Cross-unit ratios (exact from the above).
export const AU_PER_LY = LY_M / AU_M; // ≈ 63241.077
export const AU_PER_PC = PC_M / AU_M; // ≈ 206264.806
export const LY_PER_PC = PC_M / LY_M; // ≈ 3.261564
export const AU_PER_KPC = AU_PER_PC * 1e3;
export const AU_PER_MPC = AU_PER_PC * 1e6;

export const SUN_RADIUS_AU = 696_340e3 / AU_M; // ≈ 0.004652
export const EARTH_RADIUS_AU = 6_371e3 / AU_M; // ≈ 0.0000426

/** Coarse galactic "sector" address (5-ly cubes) for an AU position — the Sun (and
 *  our whole solar system) is sector 0,0,0; neighbours get small integer coordinates. */
export const SECTOR_LY = 5;
export function sectorLabel(xAu: number, yAu: number, zAu: number): string {
  const s = (v: number): number => Math.round(v / AU_PER_LY / SECTOR_LY);
  return `${s(xAu)}, ${s(yAu)}, ${s(zAu)}`;
}

/** Adaptive human-readable distance, given a length in AU (the canonical unit). */
export function formatDistance(au: number): string {
  const a = Math.abs(au);
  if (a < 1 / 100) return `${(au * AU_M / 1e3).toLocaleString(undefined, { maximumFractionDigits: 0 })} km`;
  if (a < 1000) return `${au.toFixed(a < 10 ? 3 : 1)} AU`;
  if (a < AU_PER_LY * 0.1) return `${(au / AU_PER_LY).toExponential(2)} ly`;
  if (a < AU_PER_PC * 1e3) return `${(au / AU_PER_LY).toFixed(2)} ly`;
  if (a < AU_PER_MPC) return `${(au / AU_PER_PC / 1e3).toFixed(2)} kpc`;
  return `${(au / AU_PER_MPC).toFixed(2)} Mpc`;
}

/** A round "nice" number ≤ x (1/2/5 × 10ⁿ), for scale bars. */
export function niceNumber(x: number): number {
  const exp = Math.floor(Math.log10(x));
  const f = x / 10 ** exp;
  const nice = f >= 5 ? 5 : f >= 2 ? 2 : 1;
  return nice * 10 ** exp;
}
