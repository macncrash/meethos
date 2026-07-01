// The HUD: breadcrumb, transport (time controls), clock, focus inspector, the
// comet launcher + impact toast, and the Defense game (health bar, score,
// game-over). It reads the Regime/FocusTarget contract via the ScaleManager and
// the DefenseGame for game state — no physics access.
import type { SimClock } from '../core/clock';
import { formatStardate } from '../core/units';
import type { Ray } from 'three';
import type { WorldFacade } from '../world/facade';
import type { WorldBus } from '../world/bus';
import type { DefenseGame } from '../world/defenseGame';

export class Hud {
  private readonly breadcrumb = byId('breadcrumb');
  private readonly inspector = byId('inspector');
  private readonly era = byId('era');
  private readonly stardate = byId('stardate');
  private readonly rateLabel = byId('rate-label');
  private readonly stats = byId('stats');
  private readonly toast = byId('toast');
  private readonly warning = byId('warning');
  private readonly warningDist = byId('warning-dist');
  private readonly deflectBtn = byId('deflect-btn');
  private readonly defenseBtn = byId('defense-btn');
  private readonly bigbangBtn = byId('bigbang-btn');
  private readonly mergerBtn = byId('merger-btn');
  private readonly gamebar = byId('gamebar');
  private readonly healthFill = byId('health-fill');
  private readonly gameStats = byId('game-stats');
  private readonly gameover = byId('gameover');
  private readonly gameoverText = byId('gameover-text');
  private toastTimer = 0;

  constructor(
    private readonly clock: SimClock,
    private readonly manager: WorldFacade,
    bus: WorldBus,
    private readonly game: DefenseGame,
  ) {
    this.wireTransport();
    byId('comet-btn').addEventListener('click', () => this.fireComet());
    this.deflectBtn.addEventListener('click', () => this.deflect());
    this.defenseBtn.addEventListener('click', () => this.toggleDefense());
    this.bigbangBtn.addEventListener('click', () => {
      this.manager.bigBang();
      this.showToast('✦ The Big Bang — 13.8 billion years in a breath', 3200);
    });
    this.mergerBtn.addEventListener('click', () => {
      this.manager.toggleMerger?.();
      if (this.manager.mergerActive) this.showToast('⟳ The Milky Way and Andromeda collide — ~4.5 Gyr from now', 3600);
    });
    byId('restart-btn').addEventListener('click', () => this.startGame());
    bus.onImpact((e) => {
      const sev = e.energy > 0.75 ? 'Catastrophic' : e.energy > 0.5 ? 'Major' : 'Significant';
      this.showToast(`☄ ${sev} impact on Earth — civilization set back`);
    });
    this.rebuild();
  }

  /** launch a comet at Earth; resume time if paused so it actually flies */
  fireComet(): void {
    if (this.clock.paused) {
      this.clock.togglePause();
      const pause = byId('transport').querySelector('[data-rate="pause"]');
      if (pause) pause.textContent = '❚❚';
    }
    this.manager.launchComet();
    this.showToast('☄ Comet inbound toward Earth…', 2600);
  }

  /** player agency: try to deflect the incoming comet (honors game cooldown) */
  deflect(): void {
    switch (this.game.deflect()) {
      case 'deflected':
        this.showToast('✓ Comet deflected — Earth is safe', 3000);
        break;
      case 'too-late':
        this.showToast('✗ Too late — impact unavoidable', 3000);
        break;
      case 'cooldown':
        this.showToast('⟲ Deflector still recharging…', 1600);
        break;
      case 'none':
        break; // nothing inbound
    }
  }

  /** click-to-deflect a comet under the ray. Returns true if a comet was targeted. */
  tryDeflectAt(ray: Ray): boolean {
    switch (this.game.deflectAt(ray)) {
      case 'deflected':
        this.showToast('✓ Comet deflected — Earth is safe', 2400);
        return true;
      case 'too-late':
        this.showToast('✗ Too late — impact unavoidable', 2600);
        return true;
      case 'cooldown':
        this.showToast('⟲ Deflector still recharging…', 1400);
        return true;
      case 'none':
        return false;
    }
  }

  /** Defense game: start a run, or stop one in progress. */
  private toggleDefense(): void {
    this.game.toggle();
    if (this.game.isPlaying) {
      this.resumeTime();
      this.showToast('🛡 Defense engaged — keep Earth alive. Deflect comets (d).', 3600);
    }
  }

  private startGame(): void {
    this.game.start();
    this.resumeTime();
  }

  private resumeTime(): void {
    if (this.clock.paused) {
      this.clock.togglePause();
      const pause = byId('transport').querySelector('[data-rate="pause"]');
      if (pause) pause.textContent = '❚❚';
    }
  }

  private showToast(msg: string, ms = 4200): void {
    this.toast.textContent = msg;
    this.toast.hidden = false;
    this.toast.classList.add('show');
    this.toastTimer = ms;
  }

  private wireTransport(): void {
    const hud = byId('transport');
    hud.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      switch (btn.dataset.rate) {
        case 'pause':
          this.clock.togglePause();
          btn.textContent = this.clock.paused ? '▶' : '❚❚';
          break;
        case 'slower':
          this.clock.slower();
          break;
        case 'faster':
          this.clock.faster();
          break;
      }
    });
  }

  /** rebuild structural UI on a regime/focus change */
  rebuild(): void {
    this.breadcrumb.replaceChildren();
    const crumbs = this.manager.breadcrumb();
    crumbs.forEach((c, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = '▸';
        this.breadcrumb.append(sep);
      }
      const el = document.createElement('span');
      el.className = 'crumb' + (c.active ? ' active' : '');
      el.textContent = c.label;
      if (!c.active) el.addEventListener('click', () => this.manager.goTo(c.id));
      this.breadcrumb.append(el);
    });
    this.era.textContent = this.manager.active.label.toUpperCase();
    this.inspector.hidden = false;
  }

  /** per-frame live values */
  tick(): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= this.clock.realDt * 1000;
      if (this.toastTimer <= 0) this.toast.classList.remove('show');
    }

    // Big Bang control + cosmic-age readout, only at the Cosmos scale
    const cos = this.manager.cosmicInfo();
    this.bigbangBtn.hidden = !cos.atCosmos || !!this.manager.mergerActive;
    this.mergerBtn.hidden = !cos.atCosmos || !this.manager.toggleMerger; // absent on the legacy path

    this.mergerBtn.classList.toggle('active', !!this.manager.mergerActive);
    if (cos.atCosmos && cos.forming) {
      this.era.textContent = 'COSMIC TIME';
      this.stardate.textContent = `${cos.ageGyr.toFixed(1)} Gyr`;
    } else {
      if (cos.atCosmos) this.era.textContent = this.manager.active.label.toUpperCase();
      this.stardate.textContent = formatStardate(this.clock.seconds);
    }
    this.rateLabel.textContent = this.clock.rateLabel;

    // inbound-comet threat warning
    const threat = this.manager.threatDistance();
    if (threat !== null) {
      this.warning.hidden = false;
      this.warningDist.textContent = `${threat.toFixed(1)} AU`;
    } else {
      this.warning.hidden = true;
    }

    this.renderGame();

    const info = this.manager.focus.info(this.clock);
    const rows = info.rows
      .map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`)
      .join('');
    this.inspector.innerHTML =
      `<h3>${info.title}</h3>${rows}` + (info.blurb ? `<div class="blurb">${info.blurb}</div>` : '');

    // compact stat line = the first two rows of the focused body
    this.stats.innerHTML = info.rows
      .slice(0, 2)
      .map(([k, v]) => `${k} <b>${v}</b>`)
      .join(' · ');
  }

  private renderGame(): void {
    const g = this.game;
    this.defenseBtn.classList.toggle('active', g.isPlaying);

    // live game bar (health + score)
    this.gamebar.hidden = !g.isPlaying;
    if (g.isPlaying) {
      const h = Math.round(g.health);
      this.healthFill.style.width = `${h}%`;
      this.healthFill.style.background = h > 50 ? '#4ad6c8' : h > 25 ? '#ffcf6a' : '#ff5a52';
      this.gameStats.innerHTML = `❤ <b>${h}%</b> · survived <b>${g.score}</b> yr · ✓ <b>${g.defended}</b>`;
      // deflect button reflects the recharge
      this.deflectBtn.classList.toggle('cooling', !g.ready);
      this.deflectBtn.textContent = g.ready ? '⟲ Deflect' : '⟲ …';
    } else {
      this.deflectBtn.classList.remove('cooling');
      this.deflectBtn.textContent = '⟲ Deflect';
    }

    // game-over overlay
    this.gameover.hidden = g.state !== 'over';
    if (g.state === 'over') {
      this.gameoverText.innerHTML =
        `Civilization endured <b>${g.score}</b> years before the bombardment broke it.<br>` +
        `Comets deflected: <b>${g.defended}</b> · Best: <b>${g.highScore}</b> yr`;
    }
  }
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}
