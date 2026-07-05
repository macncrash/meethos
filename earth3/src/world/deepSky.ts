// The deep sky rendered for real: each catalogue object is a glow sprite at its TRUE
// 3D position (sky direction × distance), spanning its TRUE physical size — so from
// Earth, M31 subtends its real ~3° (six full Moons), the LMC its real ~10°, and flying
// toward one is a genuine 2.5-million-light-year journey. The group rides the floating
// origin like the star catalogue; f32 jitter at Mly range is far below a glow's width.
import { AdditiveBlending, CanvasTexture, Color, Group, Sprite, SpriteMaterial, Vector3, type Texture } from 'three';
import type { PerspectiveCamera } from 'three';
import type { FocusTarget, InspectorInfo } from '../core/regime';
import { eclipticDirFromRaDec } from '../meethos/frames';
import { glowTexture } from '../render/sprites';
import { AU_PER_LY } from '../meethos/units';
import { DEEP_SKY, type DeepSkyObject } from '../data/deepSky';
import { CONSTELLATIONS } from '../data/constellations';

const TYPE_COLOR: Record<DeepSkyObject['type'], number> = {
  galaxy: 0xcfe0ff,
  globular: 0xffe3b8,
  open: 0xbfe0ff,
  nebula: 0xffb8cc,
  planetary: 0xa8f0da,
  remnant: 0xffc890,
};

const TYPE_LABEL: Record<DeepSkyObject['type'], string> = {
  galaxy: 'galaxy',
  globular: 'globular cluster',
  open: 'open cluster',
  nebula: 'emission nebula',
  planetary: 'planetary nebula',
  remnant: 'supernova remnant',
};

/** galaxies drawn as two-armed logarithmic spirals rather than plain glows */
const SPIRALS = new Set(['m31', 'm33', 'm51', 'm81', 'm101', 'm104', 'm64', 'm83', 'm94', 'm106', 'm77', 'n253']);

/** a soft two-armed spiral: central bulge + log-spiral arms of fading dots */
function spiralTexture(color: Color): Texture {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const cx = S / 2;
  const bulge = g.createRadialGradient(cx, cx, 0, cx, cx, S * 0.16);
  bulge.addColorStop(0, `rgba(255,244,224,0.95)`);
  bulge.addColorStop(1, 'rgba(255,244,224,0)');
  g.fillStyle = bulge;
  g.fillRect(0, 0, S, S);
  const c = `rgba(${(color.r * 255) | 0},${(color.g * 255) | 0},${(color.b * 255) | 0},`;
  for (const phase of [0, Math.PI]) {
    for (let t = 0; t < 2.4 * Math.PI; t += 0.05) {
      const r = 5 * Math.exp(0.31 * t);
      if (r > S * 0.48) break;
      const x = cx + r * Math.cos(t + phase);
      const y = cx + r * Math.sin(t + phase);
      const a = 0.5 * (1 - r / (S * 0.5));
      const w = 2.2 + r * 0.12;
      g.fillStyle = `${c}${a.toFixed(3)})`;
      g.beginPath();
      g.arc(x, y, w, 0, Math.PI * 2);
      g.fill();
    }
  }
  return new CanvasTexture(cv);
}

export class DeepSky {
  readonly group = new Group();
  private readonly entries: Array<{ o: DeepSkyObject; sprite: Sprite; world: Vector3; spanAu: number }> = [];
  private readonly _p = new Vector3();

  constructor() {
    for (const o of DEEP_SKY) {
      const dir = eclipticDirFromRaDec(o.raH * 15, o.decDeg);
      const distAu = o.distLy * AU_PER_LY;
      const world = dir.clone().multiplyScalar(distAu);
      const theta = (o.sizeArcmin / 60) * (Math.PI / 180);
      const spanAu = 2 * distAu * Math.tan(theta / 2);
      const spiral = SPIRALS.has(o.id);
      const sprite = new Sprite(new SpriteMaterial({
        map: spiral ? spiralTexture(new Color(TYPE_COLOR[o.type])) : glowTexture(new Color(TYPE_COLOR[o.type])),
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: Math.max(0.16, Math.min(0.85, 0.95 - (o.mag - 1) * 0.085)) * (spiral ? 1.15 : 1),
        rotation: (o.raH * 2.4) % Math.PI, // stable pseudo-random orientation
      }));
      // spirals get their arm texture on an inclined disc; other galaxies stay tilted glows
      sprite.scale.set(spanAu, o.type === 'galaxy' ? spanAu * 0.42 : spanAu, 1);
      sprite.position.copy(world); // group is rebased to −camWorld by the caller
      this.group.add(sprite);
      this.entries.push({ o, sprite, world, spanAu });
    }
  }

  /** screen-space pick (NDC), same contract as the star catalogue's pickTarget */
  pickTarget(ndcX: number, ndcY: number, camera: PerspectiveCamera, camWorld: Vector3): FocusTarget | null {
    let best: { o: DeepSkyObject; world: Vector3; spanAu: number } | null = null;
    let bestD = 0.03 * 0.03;
    for (const e of this.entries) {
      this._p.copy(e.world).sub(camWorld).project(camera);
      if (this._p.z > 1) continue;
      const dx = this._p.x - ndcX;
      const dy = this._p.y - ndcY;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best ? this.targetFor(best.o, best.world, best.spanAu) : null;
  }

  /** the deep-sky object best matching an aim direction from `from` — a hit only when
   *  the aim lands INSIDE (or within ~1.5° of) the object's true angular extent */
  nearestTo(dir: Vector3, from: Vector3): { target: FocusTarget; sepDeg: number; sizeDeg: number; mag: number } | null {
    let best: (typeof this.entries)[number] | null = null;
    let bestScore = Infinity;
    let bestSep = 0;
    let bestSize = 0;
    for (const e of this.entries) {
      const p = this._p.copy(e.world).sub(from);
      const sep = (Math.acos(Math.max(-1, Math.min(1, p.normalize().dot(dir)))) * 180) / Math.PI;
      const sizeDeg = (2 * Math.atan(e.spanAu / 2 / e.world.distanceTo(from)) * 180) / Math.PI;
      const score = sep - sizeDeg / 2; // distance to the object's EDGE
      if (score < bestScore) { bestScore = score; best = e; bestSep = sep; bestSize = sizeDeg; }
    }
    if (!best || bestScore > 1.5) return null;
    return { target: this.targetFor(best.o, best.world, best.spanAu), sepDeg: bestSep, sizeDeg: bestSize, mag: best.o.mag };
  }

  /** every deep-sky object as a searchable, fly-to-able destination */
  targets(): Array<{ o: DeepSkyObject; target: FocusTarget }> {
    return this.entries.map((e) => ({ o: e.o, target: this.targetFor(e.o, e.world, e.spanAu) }));
  }

  private targetFor(o: DeepSkyObject, world: Vector3, spanAu: number): FocusTarget {
    return {
      id: `dso-${o.id}`,
      label: o.name,
      radius: spanAu / 20, // fly-to frames at ~3× the object's span
      position: (out) => out.copy(world),
      info: () => this.card(o, spanAu),
    };
  }

  private card(o: DeepSkyObject, spanAu: number): InspectorInfo {
    const conName = CONSTELLATIONS.find((c) => c.id === o.con)?.name ?? o.con;
    const h = Math.floor(o.raH);
    const min = (o.raH - h) * 60;
    const sizeTxt = o.sizeArcmin >= 60 ? `${(o.sizeArcmin / 60).toFixed(1)}°` : `${o.sizeArcmin.toFixed(0)}′`;
    const dist = o.distLy >= 1e6 ? `${(o.distLy / 1e6).toFixed(2)} Mly` : `${Math.round(o.distLy).toLocaleString()} ly`;
    const wiki = `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(o.name.replace(/ \(.*\)$/, '').replaceAll(' ', '_'))}" target="_blank" rel="noopener">article ↗</a>`;
    const simbadName = /\((M\d+)\)/.exec(o.name)?.[1] ?? o.name;
    const simbad = `<a href="https://simbad.u-strasbg.fr/simbad/sim-id?Ident=${encodeURIComponent(simbadName)}" target="_blank" rel="noopener">data ↗</a>`;
    return {
      title: o.name,
      rows: [
        ['Distance', dist],
        ['App. mag', o.mag.toFixed(1)],
      ],
      sections: [
        {
          title: 'Observation (J2000)',
          rows: [
            ['Type', TYPE_LABEL[o.type]],
            ['Right ascension', `${h}h ${min.toFixed(1)}m`],
            ['Declination', `${o.decDeg < 0 ? '−' : '+'}${Math.abs(o.decDeg).toFixed(2)}°`],
            ['Constellation', conName],
          ],
        },
        {
          title: 'Properties',
          rows: [
            ['Angular size', sizeTxt],
            ['True span', `${Math.round(spanAu / AU_PER_LY).toLocaleString()} ly`],
            ['Naked eye', o.mag <= 6.5 ? 'yes, dark skies' : 'no — telescope'],
          ],
        },
        { title: 'Databases', rows: [['SIMBAD', simbad], ['Wikipedia', wiki]] },
      ],
      blurb: 'From the bright deep-sky catalogue — a real object at its true position: fly there and the journey is the real distance.',
    };
  }
}
