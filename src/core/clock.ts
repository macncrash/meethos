// One simulated clock for the whole world. Absolute time drives analytic motion
// (Kepler orbits, planetary spin); per-frame `dt` drives incremental sims
// (civilization growth). Rate spans the ladder in units.ts.
import { DEFAULT_RATE_INDEX, RATE_LADDER, SECONDS_PER_YEAR } from './units';

export class SimClock {
  /** absolute simulated seconds since the world epoch */
  seconds = 0;
  /** simulated seconds advanced this frame (0 when paused) */
  dt = 0;
  paused = false;
  private rateIndex = DEFAULT_RATE_INDEX;

  get rate(): number {
    return RATE_LADDER[this.rateIndex]!.rate;
  }

  get rateLabel(): string {
    return this.paused ? 'paused' : RATE_LADDER[this.rateIndex]!.label;
  }

  get years(): number {
    return this.seconds / SECONDS_PER_YEAR;
  }

  /** advance by a real-time delta (seconds), clamped so a long stall can't explode the sim */
  tick(realDt: number): void {
    const clamped = Math.min(realDt, 0.1);
    this.dt = this.paused ? 0 : clamped * this.rate;
    this.seconds += this.dt;
  }

  togglePause(): void {
    this.paused = !this.paused;
  }

  faster(): void {
    if (this.paused) this.paused = false;
    else this.rateIndex = Math.min(RATE_LADDER.length - 1, this.rateIndex + 1);
  }

  slower(): void {
    if (this.paused) this.paused = false;
    else this.rateIndex = Math.max(0, this.rateIndex - 1);
  }
}
