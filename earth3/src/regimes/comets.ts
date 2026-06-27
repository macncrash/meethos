// Comets — the threat in Defend Earth and the agent of cross-scale coupling. A
// comet homes on Earth and, on contact, emits an impact on the WorldBus (crater +
// civilization setback + city rubble). The player deflects it — by pressing D
// (nearest) or clicking it — while it's still far enough out; a nudge sends it
// sailing harmlessly past. Three flavors (normal / fast / heavy) keep it tense.
//
// Motion is in sim-time (streaks faster when you speed the clock) and substepped
// so it can't tunnel through the planet at high rates.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Line,
  LineBasicMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Object3D,
  type Ray,
} from 'three';
import type { SimClock } from '../core/clock';
import { SECONDS_PER_YEAR } from '../core/units';
import { glowTexture } from '../render/sprites';
import type { WorldBus } from '../world/bus';

const CAPTURE = 0.16; // AU; > Earth's visual radius so contact is reliable
const SUBSTEP = 0.06; // AU; keeps fast comets from skipping past Earth
const SPAWN_RADIUS = 38;
const MAX_COMETS = 8;
const MIN_DEFLECT_DIST = 1.4; // AU; inside this it's too late to deflect
const CLICK_RADIUS = 4.5; // world units of click tolerance around a comet head
const UP = new Vector3(0, 1, 0);
const DEFLECT_TINT = 0x8dffa6;

export type DeflectResult = 'deflected' | 'too-late' | 'none';

interface CometType {
  name: string;
  color: number;
  speed: number; // AU per sim-year
  energyMin: number;
  energyMax: number;
  size: number;
  weight: number;
}

// normal: balanced. fast: less reaction time. heavy: slow but devastating.
const TYPES: CometType[] = [
  { name: 'comet', color: 0xbef0ff, speed: 15, energyMin: 0.4, energyMax: 0.62, size: 0.7, weight: 0.6 },
  { name: 'fast', color: 0xff6a52, speed: 26, energyMin: 0.34, energyMax: 0.52, size: 0.55, weight: 0.22 },
  { name: 'heavy', color: 0xffb347, speed: 10, energyMin: 0.82, energyMax: 1.0, size: 1.05, weight: 0.18 },
];

interface Comet {
  pos: Vector3;
  energy: number;
  speed: number;
  ageYears: number;
  head: Sprite;
  tail: Line;
  tailPos: Float32Array;
  alive: boolean;
  deflected: boolean;
  vel: Vector3; // free-flight direction once deflected (normalized)
}

interface Flash {
  sprite: Sprite;
  age: number;
  life: number;
  from: number;
  to: number;
}

export interface DefenseStats {
  on: boolean;
  defended: number;
  impacts: number;
}

export class CometField {
  private readonly comets: Comet[] = [];
  private readonly flashes: Flash[] = [];
  private readonly earth = new Vector3();
  private readonly dir = new Vector3();

  // survival mode: comets arrive on their own and you must keep Earth alive
  private defense = false;
  private spawnTimer = 0;
  private spawnInterval = 4;
  private autoSpawned = 0;
  private defended = 0;
  private impacts = 0;

  constructor(
    private readonly group: Object3D,
    private readonly bus: WorldBus,
    /** writes Earth's position at absolute `seconds` into `out` */
    private readonly earthAt: (out: Vector3, seconds: number) => Vector3,
  ) {}

  get count(): number {
    return this.comets.length;
  }

  /** toggle survival mode; turning it on starts a fresh defense run */
  setDefense(on: boolean): void {
    this.defense = on;
    if (on) {
      this.clear();
      this.spawnTimer = 0;
      this.spawnInterval = 4; // first threat arrives soon
      this.autoSpawned = 0;
      this.defended = 0;
      this.impacts = 0;
    }
  }

  /** remove every comet currently in flight */
  clear(): void {
    for (let i = this.comets.length - 1; i >= 0; i--) this.removeAt(i);
  }

  get defenseStats(): DefenseStats {
    return { on: this.defense, defended: this.defended, impacts: this.impacts };
  }

  /** launch a comet from the system edge, aimed (it homes) at Earth */
  launch(): void {
    if (this.comets.length >= MAX_COMETS) this.kill(this.comets[0]!);

    const type = this.pickType();
    const theta = Math.random() * Math.PI * 2;
    const pos = new Vector3(
      Math.cos(theta) * SPAWN_RADIUS,
      (Math.random() - 0.5) * 6,
      Math.sin(theta) * SPAWN_RADIUS,
    );
    const energy = type.energyMin + Math.random() * (type.energyMax - type.energyMin);

    const head = new Sprite(
      new SpriteMaterial({
        map: glowTexture(new Color(type.color)),
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    head.scale.setScalar(type.size);
    head.position.copy(pos);
    this.group.add(head);

    const tailPos = new Float32Array(6);
    const tailGeom = new BufferGeometry();
    tailGeom.setAttribute('position', new BufferAttribute(tailPos, 3));
    const tail = new Line(
      tailGeom,
      new LineBasicMaterial({ color: type.color, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false }),
    );
    this.group.add(tail);

    this.comets.push({ pos, energy, speed: type.speed, ageYears: 0, head, tail, tailPos, alive: true, deflected: false, vel: new Vector3() });
  }

  private pickType(): CometType {
    let r = Math.random();
    for (const t of TYPES) {
      if (r < t.weight) return t;
      r -= t.weight;
    }
    return TYPES[0]!;
  }

  /** distance (AU) of the nearest still-threatening comet to Earth, or null if none */
  nearestThreatDist(): number | null {
    let best: number | null = null;
    for (const c of this.comets) {
      if (!c.alive || c.deflected) continue;
      const d = c.pos.distanceTo(this.earth);
      if (best === null || d < best) best = d;
    }
    return best;
  }

  /** deflect the nearest still-SAVABLE comet (D key). Ignores ones already too
   *  close, so a hammered key doesn't waste itself on a lost cause. */
  deflectNearest(): DeflectResult {
    let target: Comet | null = null;
    let bestDist = Infinity;
    let anyInbound = false;
    for (const c of this.comets) {
      if (!c.alive || c.deflected) continue;
      anyInbound = true;
      const d = c.pos.distanceTo(this.earth);
      if (d >= MIN_DEFLECT_DIST && d < bestDist) {
        bestDist = d;
        target = c;
      }
    }
    if (target) return this.tryDeflect(target, bestDist);
    return anyInbound ? 'too-late' : 'none';
  }

  /** deflect the comet nearest the click ray (skill-based targeting) */
  deflectAtRay(ray: Ray): DeflectResult {
    let target: Comet | null = null;
    let bestRay = CLICK_RADIUS;
    for (const c of this.comets) {
      if (!c.alive || c.deflected) continue;
      const rd = ray.distanceToPoint(c.pos);
      if (rd < bestRay) {
        bestRay = rd;
        target = c;
      }
    }
    if (!target) return 'none';
    return this.tryDeflect(target, target.pos.distanceTo(this.earth));
  }

  private tryDeflect(target: Comet | null, earthDist: number): DeflectResult {
    if (!target) return 'none';
    if (earthDist < MIN_DEFLECT_DIST) return 'too-late';

    // send it on a tangent that clears Earth, then let it fly free
    const radial = this.dir.copy(target.pos).sub(this.earth).normalize();
    const tangent = new Vector3().crossVectors(radial, UP);
    if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0);
    tangent.normalize();
    target.vel.copy(tangent).multiplyScalar(0.9).addScaledVector(radial, 0.5).normalize();
    target.deflected = true;
    this.defended++;
    (target.head.material as SpriteMaterial).color.set(DEFLECT_TINT);
    (target.tail.material as LineBasicMaterial).color.set(DEFLECT_TINT);
    this.spawnFlash(target.pos, 0x8dffa6, target.head.scale.x * 8, 0.5);
    return 'deflected';
  }

  /** advance every comet — called every frame regardless of which regime is visible */
  step(clock: SimClock): void {
    const deltaYears = clock.dt / SECONDS_PER_YEAR;

    // survival mode: spawn fresh threats on an escalating timer
    if (this.defense && deltaYears > 0) {
      this.spawnTimer += deltaYears;
      if (this.spawnTimer >= this.spawnInterval) {
        this.spawnTimer = 0;
        this.autoSpawned++;
        // escalate toward a floor below the deflect cooldown, so the siege
        // eventually outpaces you and the run ends.
        this.spawnInterval = Math.max(2, 7 - this.autoSpawned * 0.25) * (0.85 + Math.random() * 0.3);
        this.launch();
      }
    }

    this.animateFlashes(clock.realDt);
    if (this.comets.length === 0) return;
    this.earthAt(this.earth, clock.seconds);

    for (const c of this.comets) {
      if (!c.alive) continue;
      c.ageYears += deltaYears;
      const total = Math.min(c.speed * deltaYears, 30);

      if (c.deflected) {
        c.pos.addScaledVector(c.vel, total); // free flight — no homing, no impact
        if (c.pos.length() > 70 || c.ageYears > 120) c.alive = false;
      } else if (total > 0) {
        const nsub = Math.max(1, Math.ceil(total / SUBSTEP));
        const step = total / nsub;
        for (let s = 0; s < nsub; s++) {
          this.dir.copy(this.earth).sub(c.pos);
          const dist = this.dir.length();
          if (dist < CAPTURE) {
            this.impact(c, clock.seconds);
            break;
          }
          c.pos.addScaledVector(this.dir.divideScalar(dist), Math.min(step, dist));
        }
        if (c.ageYears > 120) c.alive = false;
      }

      // visuals: head + a tail pointing away from the Sun (origin)
      c.head.position.copy(c.pos);
      const tailLen = 0.6 + c.energy * 1.6;
      const away = this.dir.copy(c.pos).normalize();
      c.tailPos[0] = c.pos.x;
      c.tailPos[1] = c.pos.y;
      c.tailPos[2] = c.pos.z;
      c.tailPos[3] = c.pos.x + away.x * tailLen;
      c.tailPos[4] = c.pos.y + away.y * tailLen;
      c.tailPos[5] = c.pos.z + away.z * tailLen;
      (c.tail.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    }

    for (let i = this.comets.length - 1; i >= 0; i--) {
      if (!this.comets[i]!.alive) this.removeAt(i);
    }
  }

  private impact(c: Comet, seconds: number): void {
    const dir = c.pos.clone().sub(this.earth).normalize();
    this.bus.emitImpact({ dir, energy: c.energy, atSeconds: seconds });
    this.impacts++;
    this.spawnFlash(this.earth, 0xff7a2a, 3 + c.energy * 4, 0.6);
    c.alive = false;
  }

  // --- deflect / impact flashes (juice) ---

  private spawnFlash(pos: Vector3, color: number, maxScale: number, life: number): void {
    const sprite = new Sprite(
      new SpriteMaterial({ map: glowTexture(new Color(color)), blending: AdditiveBlending, depthWrite: false, transparent: true }),
    );
    sprite.position.copy(pos);
    sprite.scale.setScalar(0.1);
    this.group.add(sprite);
    this.flashes.push({ sprite, age: 0, life, from: 0.1, to: maxScale });
  }

  private animateFlashes(realDt: number): void {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]!;
      f.age += realDt;
      const t = f.age / f.life;
      if (t >= 1) {
        this.group.remove(f.sprite);
        (f.sprite.material as SpriteMaterial).dispose();
        this.flashes.splice(i, 1);
        continue;
      }
      f.sprite.scale.setScalar(f.from + (f.to - f.from) * t);
      (f.sprite.material as SpriteMaterial).opacity = 1 - t;
    }
  }

  private kill(c: Comet): void {
    c.alive = false;
    const i = this.comets.indexOf(c);
    if (i >= 0) this.removeAt(i);
  }

  private removeAt(i: number): void {
    const c = this.comets[i]!;
    this.group.remove(c.head);
    this.group.remove(c.tail);
    (c.head.material as SpriteMaterial).dispose();
    c.tail.geometry.dispose();
    (c.tail.material as LineBasicMaterial).dispose();
    this.comets.splice(i, 1);
  }
}
