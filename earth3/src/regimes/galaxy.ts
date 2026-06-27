// Galaxy regime: a log-spiral starfield (~24k stars) with differential rotation,
// our Sun highlighted. Dive into the Sun to enter the solar system. Star
// positions are analytic in absolute time (like the orrery) so motion is stable
// and scrubbable at any time-rate.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  Points,
  PointsMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { SimClock } from '../core/clock';
import type { FocusTarget, Regime } from '../core/regime';
import { blackbodyColor } from '../core/color';
import { mulberry32, gaussian, type Rng } from '../core/rng';
import { SECONDS_PER_YEAR } from '../core/units';
import { dotTexture, glowTexture } from '../render/sprites';
import { makeLabel } from '../render/label';
import { setOpacityDeep } from '../render/opacity';

const STAR_COUNT = 24_000;
const DISK_RADIUS = 120;
const SUN_RADIUS = 55; // galactocentric distance of Sol, in render units
const SUN_PERIOD_SEC = 225e6 * SECONDS_PER_YEAR; // galactic year ≈ 225 Myr

export class GalaxyRegime implements Regime {
  readonly id = 'galaxy';
  readonly label = 'Milky Way';
  readonly object3d = new Group();

  private readonly positions = new Float32Array(STAR_COUNT * 3);
  private readonly baseR = new Float32Array(STAR_COUNT);
  private readonly baseA = new Float32Array(STAR_COUNT);
  private readonly baseY = new Float32Array(STAR_COUNT);
  private readonly points: Points;
  private readonly sunMarker: Sprite;
  private readonly sunPos = new Vector3();
  private readonly targets: FocusTarget[] = [];
  private readonly neighbors: Array<{ marker: Sprite; offset: Vector3; pos: Vector3; label: Sprite }> = [];
  private solLabel?: Sprite;

  constructor(seed = 0xea2743) {
    const rng = mulberry32(seed);
    const colors = new Float32Array(STAR_COUNT * 3);
    this.seedStars(rng, colors);

    const geom = new BufferGeometry();
    const posAttr = new BufferAttribute(this.positions, 3);
    posAttr.setUsage(DynamicDrawUsage);
    geom.setAttribute('position', posAttr);
    geom.setAttribute('color', new BufferAttribute(colors, 3));

    this.points = new Points(
      geom,
      new PointsMaterial({
        size: 1.5,
        map: dotTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    this.object3d.add(this.points);

    // The Sun: a highlighted glow you dive into.
    this.sunMarker = new Sprite(
      new SpriteMaterial({
        map: glowTexture(new Color(0xfff2cc)),
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.sunMarker.scale.setScalar(6);
    this.object3d.add(this.sunMarker);

    this.buildTargets();
    this.buildNeighbors(rng);
    this.solLabel = makeLabel('Sol', 0xfff2cc, 0.04);
    this.object3d.add(this.solLabel);
    this.update(0);
    this.object3d.name = 'galaxy';
  }

  private seedStars(rng: Rng, colors: Float32Array): void {
    // Barred spiral, Milky-Way-like: a spheroidal bulge, a central BAR, two
    // dominant arms (Scutum-Centaurus, Perseus) + two minor (Sagittarius, Norma),
    // each a log spiral with a real-ish pitch angle. Arms are bluer (star
    // formation); bulge/bar are older and redder.
    const BAR_ANGLE = 0.5; // bar orientation (arbitrary absolute frame)
    const BAR_LEN = 26;
    const BAR_W = 7;
    const ARMS_DEF = [
      { base: 0.0, pitch: 0.25, w: 0.32 }, // Scutum-Centaurus (major)
      { base: Math.PI, pitch: 0.2, w: 0.32 }, // Perseus (major)
      { base: Math.PI * 0.5, pitch: 0.31, w: 0.13 }, // Sagittarius (minor)
      { base: Math.PI * 1.5, pitch: 0.24, w: 0.13 }, // Norma / Outer (minor)
    ];
    const armPick: number[] = [];
    let acc = 0;
    for (const a of ARMS_DEF) { acc += a.w; armPick.push(acc); }

    const c = new Color();
    for (let i = 0; i < STAR_COUNT; i++) {
      const u = rng();
      let r: number;
      let ang: number;
      let y: number;
      let hot = false;

      if (u < 0.13) {
        // bulge — compact spheroid
        r = Math.abs(gaussian(rng)) * 7 + 1.5;
        ang = rng() * Math.PI * 2;
        y = gaussian(rng) * 5.5;
      } else if (u < 0.22) {
        // central bar — elongated, rotated by BAR_ANGLE
        const t = (rng() * 2 - 1) * BAR_LEN;
        const w = gaussian(rng) * BAR_W;
        const x = t * Math.cos(BAR_ANGLE) - w * Math.sin(BAR_ANGLE);
        const z = t * Math.sin(BAR_ANGLE) + w * Math.cos(BAR_ANGLE);
        r = Math.hypot(x, z);
        ang = Math.atan2(z, x);
        y = gaussian(rng) * 2.5;
      } else if (u < 0.96) {
        // spiral arm — pick one (weighted), log-spiral winding by its pitch
        const p = rng() * acc;
        let k = 0;
        while (k < armPick.length - 1 && p > armPick[k]!) k++;
        const arm = ARMS_DEF[k]!;
        r = DISK_RADIUS * Math.pow(rng(), 0.6);
        const winding = Math.log(r + 1) / Math.tan(arm.pitch);
        const scatter = gaussian(rng) * (0.13 + 1.4 / (r / 18 + 1));
        ang = arm.base + winding + scatter;
        y = gaussian(rng) * (0.5 + 2.5 / (r / 12 + 1)); // thin disk, thicker inner
        hot = rng() < 0.18; // young blue stars cluster in arms
      } else {
        // diffuse disk field
        r = DISK_RADIUS * Math.sqrt(rng());
        ang = rng() * Math.PI * 2;
        y = gaussian(rng) * 1.6;
      }

      this.baseR[i] = r;
      this.baseA[i] = ang;
      this.baseY[i] = y;

      const t = hot ? 8000 + rng() * 16000 : u < 0.22 ? 3200 + rng() * 2200 : 3200 + rng() * 3800;
      blackbodyColor(t, c);
      const o = i * 3;
      colors[o] = c.r;
      colors[o + 1] = c.g;
      colors[o + 2] = c.b;
    }
  }

  private buildTargets(): void {
    this.targets.push({
      id: 'milkyway',
      label: 'Milky Way',
      position: (out) => out.set(0, 0, 0),
      radius: DISK_RADIUS,
      info: () => ({
        title: 'Milky Way',
        rows: [
          ['Stars', '~100–400 billion'],
          ['Diameter', '~100,000 ly'],
          ['Sol orbit', '~225 Myr / lap'],
        ],
        blurb: 'A barred spiral galaxy. One unremarkable G-type star, two thirds out along a minor arm, has a story worth diving into.',
      }),
    });
    this.targets.push({
      id: 'sol-star',
      label: 'Sol',
      childRegime: 'solar',
      position: (out) => out.copy(this.sunPos),
      radius: 3,
      info: () => ({
        title: 'Sol',
        rows: [
          ['Class', 'G2V'],
          ['From core', '~26,000 ly'],
          ['Planets', '8'],
        ],
        blurb: 'Our star. Dive in to fall into the solar system.',
      }),
    });
  }

  private buildNeighbors(_rng: Rng): void {
    // REAL nearest stars: name, RA/Dec (J2000, deg) → real direction, distance (ly),
    // effective temperature (K) → real color. Distances are scaled up for visibility
    // (at true galactic scale these would all sit on top of the Sun).
    const NEIGHBORS: Array<{ name: string; ra: number; dec: number; ly: number; k: number; sp: string }> = [
      { name: 'Alpha Centauri', ra: 219.90, dec: -60.83, ly: 4.37, k: 5790, sp: 'G2V+K1V' },
      { name: 'Barnard’s Star', ra: 269.45, dec: 4.69, ly: 5.96, k: 3130, sp: 'M4V' },
      { name: 'Wolf 359', ra: 164.12, dec: 7.01, ly: 7.86, k: 2800, sp: 'M6V' },
      { name: 'Lalande 21185', ra: 165.83, dec: 35.97, ly: 8.31, k: 3550, sp: 'M2V' },
      { name: 'Sirius', ra: 101.29, dec: -16.72, ly: 8.60, k: 9940, sp: 'A1V' },
      { name: 'Luyten 726-8', ra: 24.76, dec: -17.95, ly: 8.73, k: 2670, sp: 'M5.5V' },
      { name: 'Ross 154', ra: 282.46, dec: -23.83, ly: 9.69, k: 3340, sp: 'M3.5V' },
      { name: 'Ross 248', ra: 355.48, dec: 44.18, ly: 10.30, k: 3000, sp: 'M5V' },
      { name: 'Epsilon Eridani', ra: 53.23, dec: -9.46, ly: 10.50, k: 5080, sp: 'K2V' },
      { name: 'Lacaille 9352', ra: 346.47, dec: -35.85, ly: 10.74, k: 3690, sp: 'M1.5V' },
      { name: 'Ross 128', ra: 176.94, dec: 0.80, ly: 11.01, k: 3190, sp: 'M4V' },
      { name: '61 Cygni', ra: 316.72, dec: 38.75, ly: 11.40, k: 4530, sp: 'K5V' },
      { name: 'Procyon', ra: 114.83, dec: 5.22, ly: 11.46, k: 6530, sp: 'F5IV' },
      { name: 'Tau Ceti', ra: 26.02, dec: -15.94, ly: 11.91, k: 5340, sp: 'G8V' },
    ];
    const DEG = Math.PI / 180;
    const DIST_SCALE = 0.16; // render units per ly (exaggerated for visibility)
    const c = new Color();
    NEIGHBORS.forEach((s, i) => {
      const cd = Math.cos(s.dec * DEG);
      // equatorial unit direction (real relative geometry), Y = +Dec
      const dir = new Vector3(cd * Math.cos(s.ra * DEG), Math.sin(s.dec * DEG), cd * Math.sin(s.ra * DEG));
      const offset = dir.multiplyScalar(s.ly * DIST_SCALE);
      blackbodyColor(s.k, c);
      const marker = new Sprite(
        new SpriteMaterial({ map: glowTexture(c.clone()), blending: AdditiveBlending, depthWrite: false, transparent: true }),
      );
      marker.scale.setScalar(s.k > 7000 ? 1.4 : 0.9); // brighter/larger for hot stars
      this.object3d.add(marker);
      const label = makeLabel(s.name, c.clone().getHex(), 0.034);
      this.object3d.add(label);
      const neighbor = { marker, offset, pos: new Vector3(), label };
      this.neighbors.push(neighbor);

      const seed = (0x9e3779b1 * (i + 7)) >>> 0;
      this.targets.push({
        id: `star${i}`,
        label: s.name,
        childRegime: 'starsystem',
        seed,
        radius: 1.1,
        position: (out) => out.copy(neighbor.pos),
        info: () => ({
          title: s.name,
          rows: [
            ['Distance', `${s.ly.toFixed(2)} ly`],
            ['Class', s.sp],
          ],
          blurb: 'A real neighbor star (direction accurate; distance exaggerated for visibility). Dive in to chart its worlds.',
        }),
      });
    });
  }

  private rotationAngle(r: number, seconds: number): number {
    // flat-ish rotation curve: angular speed ∝ 1/r, normalized to Sol's period at SUN_RADIUS
    const omega = (2 * Math.PI) / SUN_PERIOD_SEC; // at SUN_RADIUS
    return (omega * SUN_RADIUS * seconds) / Math.max(r, 1);
  }

  private update(seconds: number): void {
    for (let i = 0; i < STAR_COUNT; i++) {
      const r = this.baseR[i]!;
      const a = this.baseA[i]! + this.rotationAngle(r, seconds);
      const o = i * 3;
      this.positions[o] = Math.cos(a) * r;
      this.positions[o + 1] = this.baseY[i]!;
      this.positions[o + 2] = Math.sin(a) * r;
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;

    const sa = this.rotationAngle(SUN_RADIUS, seconds);
    this.sunPos.set(Math.cos(sa) * SUN_RADIUS, 0, Math.sin(sa) * SUN_RADIUS);
    this.sunMarker.position.copy(this.sunPos);

    for (const n of this.neighbors) {
      n.pos.copy(this.sunPos).add(n.offset);
      n.marker.position.copy(n.pos);
      n.label.position.set(n.pos.x, n.pos.y + 0.6, n.pos.z);
    }
    if (this.solLabel) this.solLabel.position.set(this.sunPos.x, this.sunPos.y + 3, this.sunPos.z);
  }

  step(clock: SimClock): void {
    this.update(clock.seconds);
  }

  focusTargets(): FocusTarget[] {
    return this.targets;
  }

  defaultFocus(): FocusTarget | null {
    // Frame on Sol so the first zoom-in dives straight toward the solar system.
    return this.targets[1] ?? this.targets[0] ?? null;
  }

  overviewDistance(): number {
    return 200;
  }

  onEnter(): void {}
  onExit(): void {}

  setOpacity(o: number): void {
    setOpacityDeep(this.object3d, o);
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as PointsMaterial).dispose();
    (this.sunMarker.material as SpriteMaterial).dispose();
  }
}
