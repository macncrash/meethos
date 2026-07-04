// One simulated clock for the whole world. Absolute time drives analytic motion
// (Kepler orbits, planetary spin); per-frame `dt` drives incremental sims
// (civilization growth). Rate spans the ladder in units.ts.
import { DEFAULT_RATE_INDEX, RATE_LADDER, SECONDS_PER_YEAR } from './units';

export class SimClock {
  /** absolute simulated seconds since the world epoch */
  seconds = 0;
  /** simulated seconds advanced this frame (0 when paused) */
  dt = 0;
  /** real wall-clock seconds this frame — for cinematic effects that should run
   *  at a steady pace regardless of the sim time-rate (impact flashes, etc.) */
  realDt = 0;
  paused = false;
  /** +1 = forward, −1 = REWIND — everything analytic (orbits, sidereal sky, star drift,
   *  satellite launch gating) runs backwards exactly; incremental sims (civilization,
   *  game clock) clamp at zero and simply hold during rewind. */
  direction: 1 | -1 = 1;
  private rateIndex = DEFAULT_RATE_INDEX;

  get rate(): number {
    return RATE_LADDER[this.rateIndex]!.rate * this.direction;
  }

  get rateLabel(): string {
    if (this.paused) return 'paused';
    return (this.direction < 0 ? '−' : '') + RATE_LADDER[this.rateIndex]!.label;
  }

  get years(): number {
    return this.seconds / SECONDS_PER_YEAR;
  }

  /** advance by a real-time delta (seconds), clamped so a long stall can't explode the sim */
  tick(realDt: number): void {
    const clamped = Math.min(realDt, 0.1);
    this.realDt = clamped;
    this.dt = this.paused ? 0 : clamped * this.rate;
    this.seconds += this.dt;
  }

  togglePause(): void {
    this.paused = !this.paused;
  }

  /** jump to a specific rung of the ladder (used to set a good pace for the game).
   *  Always lands running FORWARD — callers here are game/mission setups. */
  setRateIndex(i: number): void {
    this.rateIndex = Math.max(0, Math.min(RATE_LADDER.length - 1, i));
    this.direction = 1;
    this.paused = false;
  }

  /** jump to the ladder rung whose rate is closest to `target` (in log space) —
   *  callers name a PACE ('a month per second'), not a fragile index. */
  setRateNearest(target: number): void {
    let best = 0;
    let bestErr = Infinity;
    RATE_LADDER.forEach((r, i) => {
      const err = Math.abs(Math.log(r.rate / target));
      if (err < bestErr) { bestErr = err; best = i; }
    });
    this.setRateIndex(best);
  }

  /** » — move the rate toward +∞: rewinding decelerates (and flips forward past the
   *  slowest rung); running forward accelerates. The transport is one signed throttle. */
  stepUp(): void {
    if (this.paused) { this.paused = false; return; }
    if (this.direction < 0) {
      if (this.rateIndex === 0) this.direction = 1;
      else this.rateIndex--;
    } else {
      this.rateIndex = Math.min(RATE_LADDER.length - 1, this.rateIndex + 1);
    }
  }

  /** « — move the rate toward −∞: forward decelerates, and past the slowest rung time
   *  REVERSES; already rewinding, it rewinds faster. */
  stepDown(): void {
    if (this.paused) { this.paused = false; return; }
    if (this.direction > 0) {
      if (this.rateIndex === 0) this.direction = -1;
      else this.rateIndex--;
    } else {
      this.rateIndex = Math.min(RATE_LADDER.length - 1, this.rateIndex + 1);
    }
  }

  faster(): void {
    this.stepUp();
  }

  slower(): void {
    this.stepDown();
  }
}
