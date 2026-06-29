// Units, scales, and the global time-rate ladder.
//
// earth3 spans ~30 orders of magnitude in distance and ~16 in time. We keep
// ONE simulated clock (seconds since the world's epoch) and let each regime
// render in its OWN local units, so f32 precision is never a problem within a
// regime. The scale manager hands the camera across regime boundaries.

export const SECONDS_PER_DAY = 86_400;
export const SECONDS_PER_YEAR = 365.25 * SECONDS_PER_DAY;

// Physical distance constants (AU_M, LY_M, …) live in the meethos-core nucleus
// (src/meethos/units.ts) — the single source of truth for the floating-origin frame.
// core/units.ts keeps only the frame-agnostic time/rate ladder.

/**
 * Time-rate ladder: simulated seconds advanced per real second. Spans hours/sec
 * (watch Earth spin) to a million years/sec (watch the galaxy turn). The HUD's
 * « / » buttons step through this.
 */
export const RATE_LADDER: ReadonlyArray<{ rate: number; label: string }> = [
  { rate: SECONDS_PER_DAY / 24, label: '1 hr/s' },
  { rate: SECONDS_PER_DAY, label: '1 day/s' },
  { rate: SECONDS_PER_DAY * 30, label: '1 mo/s' },
  { rate: SECONDS_PER_YEAR, label: '1 yr/s' },
  { rate: SECONDS_PER_YEAR * 25, label: '25 yr/s' },
  { rate: SECONDS_PER_YEAR * 200, label: '200 yr/s' },
  { rate: SECONDS_PER_YEAR * 2_000, label: '2 kyr/s' },
  { rate: SECONDS_PER_YEAR * 50_000, label: '50 kyr/s' },
  { rate: SECONDS_PER_YEAR * 1_000_000, label: '1 Myr/s' },
];

export const DEFAULT_RATE_INDEX = 3; // 1 yr/s

/** Format simulated elapsed time adaptively: days → years → kyr → Myr. */
export function formatStardate(seconds: number): string {
  const years = seconds / SECONDS_PER_YEAR;
  if (years < 2) {
    const days = Math.floor(seconds / SECONDS_PER_DAY);
    return `Day ${days.toLocaleString()}`;
  }
  if (years < 10_000) return `Year ${Math.floor(years).toLocaleString()}`;
  if (years < 1_000_000) return `${(years / 1_000).toFixed(1)} kyr`;
  return `${(years / 1_000_000).toFixed(2)} Myr`;
}
