// The deep sky rendered for real: each catalogue object is a glow sprite at its TRUE
// 3D position (sky direction × distance), spanning its TRUE physical size — so from
// Earth, M31 subtends its real ~3° (six full Moons), the LMC its real ~10°, and flying
// toward one is a genuine 2.5-million-light-year journey. The group rides the floating
// origin like the star catalogue; f32 jitter at Mly range is far below a glow's width.
import { AdditiveBlending, Color, Group, Sprite, SpriteMaterial, Vector3 } from 'three';
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
      const sprite = new Sprite(new SpriteMaterial({
        map: glowTexture(new Color(TYPE_COLOR[o.type])),
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: Math.max(0.16, Math.min(0.85, 0.95 - (o.mag - 1) * 0.085)),
        rotation: (o.raH * 2.4) % Math.PI, // stable pseudo-random orientation
      }));
      // galaxies read as tilted discs; everything else as round glows
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
