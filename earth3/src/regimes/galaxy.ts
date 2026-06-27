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
import { setOpacityDeep } from '../render/opacity';

const STAR_COUNT = 24_000;
const ARMS = 4;
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
  private readonly neighbors: Array<{ marker: Sprite; offset: Vector3; pos: Vector3 }> = [];

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
    this.update(0);
    this.object3d.name = 'galaxy';
  }

  private seedStars(rng: Rng, colors: Float32Array): void {
    const c = new Color();
    for (let i = 0; i < STAR_COUNT; i++) {
      // radius with central concentration
      const r = DISK_RADIUS * Math.pow(rng(), 0.55);
      const arm = Math.floor(rng() * ARMS);
      const armAngle = (arm / ARMS) * Math.PI * 2;
      // log-spiral winding + per-star scatter that tightens toward the core
      const winding = 2.4 * Math.log(r + 1);
      const scatter = gaussian(rng) * (0.18 + 1.6 / (r + 2));
      const a = armAngle + winding + scatter;
      const y = gaussian(rng) * (0.6 + 3.0 / (r + 2)); // thin disk, fat bulge

      this.baseR[i] = r;
      this.baseA[i] = a;
      this.baseY[i] = y;

      // cooler stars dominate; a few hot blue giants
      const t = rng() < 0.04 ? 9000 + rng() * 20000 : 3200 + rng() * 3500;
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

  private buildNeighbors(rng: Rng): void {
    const NAMES = [
      'Alpha Centauri', 'Sirius', 'Vega', 'Procyon', 'Altair', 'Tau Ceti', 'Wolf 359',
      'Trappist-1', 'Gliese 581', 'Epsilon Eridani', 'Ross 128', 'Luyten', 'Barnard', 'Kapteyn',
    ];
    const c = new Color();
    NAMES.forEach((name, i) => {
      const ang = rng() * Math.PI * 2;
      const rad = 1.8 + rng() * 5;
      const offset = new Vector3(Math.cos(ang) * rad, (rng() - 0.5) * 1.6, Math.sin(ang) * rad);
      const temp = rng() < 0.3 ? 8000 + rng() * 8000 : 3000 + rng() * 3600;
      blackbodyColor(temp, c);
      const marker = new Sprite(
        new SpriteMaterial({ map: glowTexture(c.clone()), blending: AdditiveBlending, depthWrite: false, transparent: true }),
      );
      marker.scale.setScalar(1.3);
      this.object3d.add(marker);
      const neighbor = { marker, offset, pos: new Vector3() };
      this.neighbors.push(neighbor);

      const seed = (0x9e3779b1 * (i + 1)) >>> 0;
      this.targets.push({
        id: `star${i}`,
        label: name,
        childRegime: 'starsystem',
        seed,
        radius: 1.4,
        position: (out) => out.copy(neighbor.pos),
        info: () => ({
          title: name,
          rows: [
            ['Distance', 'a few ly'],
            ['Status', 'uncharted'],
          ],
          blurb: 'A neighbor star. Dive in to chart its worlds.',
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
    }
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
