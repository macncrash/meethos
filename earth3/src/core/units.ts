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
  { rate: 1, label: 'real time' }, // the human timescale — stand outside and look up
  { rate: 60, label: '1 min/s' },
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

export const DEFAULT_RATE_INDEX = 5; // 1 yr/s

/** The sim's epoch is J2000 (2000-01-01 12:00 UTC) — the planets' Keplerian elements
 *  are J2000 with `seconds` as the offset, so the calendar below is REAL: sidereal
 *  time, launch windows and sky identification all hang off this anchor. */
export const J2000_UTC_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

/** Sim time → real UTC calendar date ("2000-03-14" style; year-only at deep time).
 *  JS Date holds ±275 kyr; beyond that the calendar is meaningless anyway. */
export function formatUTCDate(seconds: number): string {
  const years = seconds / SECONDS_PER_YEAR;
  if (Math.abs(years) > 200_000) {
    const y = Math.round(2000 + years);
    return y >= 0 ? `${y.toLocaleString()} CE` : `${Math.abs(y).toLocaleString()} BCE`;
  }
  // slice at the 'T': BCE / 5-digit years serialize as extended ISO (±YYYYYY-…),
  // where a fixed 10-char cut would truncate the day
  const iso = new Date(J2000_UTC_MS + seconds * 1000).toISOString();
  return iso.slice(0, iso.indexOf('T'));
}

/** Format simulated elapsed time adaptively: days → years → kyr → Myr.
 *  Negative time (rewound past the epoch) reads the same way, signed. */
export function formatStardate(seconds: number): string {
  const years = seconds / SECONDS_PER_YEAR;
  const sign = seconds < 0 ? '−' : '';
  const ay = Math.abs(years);
  if (ay < 2) {
    const days = Math.floor(Math.abs(seconds) / SECONDS_PER_DAY);
    return `Day ${sign}${days.toLocaleString()}`;
  }
  if (ay < 10_000) return `Year ${sign}${Math.floor(ay).toLocaleString()}`;
  if (ay < 1_000_000) return `${sign}${(ay / 1_000).toFixed(1)} kyr`;
  return `${sign}${(ay / 1_000_000).toFixed(2)} Myr`;
}
