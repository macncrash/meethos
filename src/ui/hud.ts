// The HUD: breadcrumb, transport (time controls), clock, focus inspector. It only
// reads the Regime/FocusTarget contract via the ScaleManager — no physics access.
import type { SimClock } from '../core/clock';
import { formatStardate } from '../core/units';
import type { ScaleManager } from '../world/scaleManager';

export class Hud {
  private readonly breadcrumb = byId('breadcrumb');
  private readonly inspector = byId('inspector');
  private readonly era = byId('era');
  private readonly stardate = byId('stardate');
  private readonly rateLabel = byId('rate-label');
  private readonly stats = byId('stats');

  constructor(
    private readonly clock: SimClock,
    private readonly manager: ScaleManager,
  ) {
    this.wireTransport();
    this.rebuild();
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
    this.stardate.textContent = formatStardate(this.clock.seconds);
    this.rateLabel.textContent = this.clock.rateLabel;

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
