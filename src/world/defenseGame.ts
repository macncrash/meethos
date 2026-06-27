// Defense — the survival game layered over the cross-scale coupling. Toggle it on
// and comets siege Earth at an escalating pace. A health bar (the civilization's
// integrity) drains with every impact and slowly regenerates; a deflection
// cooldown means you can't stop everything, so the siege eventually wins. Your
// score is the years survived; a high score persists in localStorage.
import { SECONDS_PER_YEAR } from '../core/units';
import type { SimClock } from '../core/clock';
import type { ScaleManager } from './scaleManager';
import type { WorldBus } from './bus';

const COOLDOWN_YEARS = 6; // deflector recharge (in sim-years, so it scales with time-rate)
const REGEN_PER_YEAR = 1.3; // health the civilization claws back each year
const HS_KEY = 'earth3-defense-highscore';

export type GameState = 'idle' | 'playing' | 'over';
export type GameDeflect = 'deflected' | 'too-late' | 'none' | 'cooldown';

export class DefenseGame {
  state: GameState = 'idle';
  health = 100;
  survivedYears = 0;
  cooldown = 0; // sim-years until the deflector is ready again
  highScore = 0;

  constructor(
    private readonly manager: ScaleManager,
    bus: WorldBus,
  ) {
    this.highScore = this.loadHigh();
    bus.onImpact((e) => {
      if (this.state !== 'playing') return;
      this.health -= 14 + e.energy * 26; // 22–40 per hit
      if (this.health <= 0) {
        this.health = 0;
        this.gameOver();
      }
    });
  }

  get score(): number {
    return Math.floor(this.survivedYears);
  }

  get defended(): number {
    return this.manager.defenseStats().defended;
  }

  get isPlaying(): boolean {
    return this.state === 'playing';
  }

  get ready(): boolean {
    return this.cooldown <= 0;
  }

  /** Defense button: start a run, or stop one in progress. */
  toggle(): void {
    if (this.state === 'playing') this.stop();
    else this.start();
  }

  start(): void {
    this.state = 'playing';
    this.health = 100;
    this.survivedYears = 0;
    this.cooldown = 0;
    this.manager.setDefenseMode(true); // clears the skies + resets comet counters
  }

  stop(): void {
    this.state = 'idle';
    this.manager.setDefenseMode(false);
  }

  /** Deflect, honoring the recharge. Outside a run it's the free sandbox deflect. */
  deflect(): GameDeflect {
    if (this.state === 'playing' && this.cooldown > 0) return 'cooldown';
    const r = this.manager.deflectComet();
    if (r === 'deflected' && this.state === 'playing') this.cooldown = COOLDOWN_YEARS;
    return r;
  }

  update(clock: SimClock): void {
    if (this.state !== 'playing') return;
    const dy = clock.dt / SECONDS_PER_YEAR;
    this.survivedYears += dy;
    this.cooldown = Math.max(0, this.cooldown - dy);
    this.health = Math.min(100, this.health + REGEN_PER_YEAR * dy);
  }

  private gameOver(): void {
    this.state = 'over';
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.saveHigh(this.score);
    }
    this.manager.setDefenseMode(false);
  }

  private loadHigh(): number {
    try {
      return parseInt(localStorage.getItem(HS_KEY) ?? '0', 10) || 0;
    } catch {
      return 0;
    }
  }

  private saveHigh(v: number): void {
    try {
      localStorage.setItem(HS_KEY, String(v));
    } catch {
      /* storage unavailable — ignore */
    }
  }
}
