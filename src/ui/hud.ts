// The HUD: breadcrumb, transport (time controls), clock, focus inspector, and the
// comet launcher + impact toast. It only reads the Regime/FocusTarget contract via
// the ScaleManager — no physics access.
import type { SimClock } from '../core/clock';
import { formatStardate } from '../core/units';
import type { ScaleManager } from '../world/scaleManager';
import type { WorldBus } from '../world/bus';

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
  private toastTimer = 0;

  constructor(
    private readonly clock: SimClock,
    private readonly manager: ScaleManager,
    bus: WorldBus,
  ) {
    this.wireTransport();
    byId('comet-btn').addEventListener('click', () => this.fireComet());
    byId('deflect-btn').addEventListener('click', () => this.deflect());
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

  /** player agency: try to deflect the incoming comet */
  deflect(): void {
    switch (this.manager.deflectComet()) {
      case 'deflected':
        this.showToast('✓ Comet deflected — Earth is safe', 3200);
        break;
      case 'too-late':
        this.showToast('✗ Too late — impact unavoidable', 3200);
        break;
      case 'none':
        break; // nothing inbound
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

    this.stardate.textContent = formatStardate(this.clock.seconds);
    this.rateLabel.textContent = this.clock.rateLabel;

    // inbound-comet threat warning
    const threat = this.manager.threatDistance();
    if (threat !== null) {
      this.warning.hidden = false;
      this.warningDist.textContent = `${threat.toFixed(1)} AU`;
    } else {
      this.warning.hidden = true;
    }

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
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}
