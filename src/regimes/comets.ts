// Comets — the agent of cross-scale coupling AND the player's first real
// decision. A comet launched in the solar regime homes on Earth and, on contact,
// emits an impact on the WorldBus (crater + civilization setback + city rubble).
// But the player can DEFLECT it in time: while it's still far enough out, a nudge
// sends it sailing harmlessly past. Wait too long and it's too late.
//
// Motion is in sim-time (it streaks faster when you speed the clock) and
// substepped so it can't tunnel through the planet at high rates.
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
} from 'three';
import type { SimClock } from '../core/clock';
import { SECONDS_PER_YEAR } from '../core/units';
import { glowTexture } from '../render/sprites';
import type { WorldBus } from '../world/bus';

const SPEED_AU_PER_YEAR = 16; // slow enough to give the player reaction time
const CAPTURE = 0.16; // AU; > Earth's visual radius so contact is reliable
const SUBSTEP = 0.06; // AU; keeps fast comets from skipping past Earth
const SPAWN_RADIUS = 38;
const MAX_COMETS = 6;
const MIN_DEFLECT_DIST = 1.4; // AU; inside this it's too late to deflect
const UP = new Vector3(0, 1, 0);
const DEFLECT_TINT = 0x8dffa6;

export type DeflectResult = 'deflected' | 'too-late' | 'none';

interface Comet {
  pos: Vector3;
  energy: number;
  ageYears: number;
  head: Sprite;
  tail: Line;
  tailPos: Float32Array;
  alive: boolean;
  deflected: boolean;
  vel: Vector3; // free-flight direction once deflected (normalized)
}

export interface DefenseStats {
  on: boolean;
  defended: number;
  impacts: number;
}

export class CometField {
  private readonly comets: Comet[] = [];
  private readonly earth = new Vector3();
  private readonly dir = new Vector3();

  // survival mode: comets arrive on their own and you must keep Earth alive
  private defense = false;
  private spawnTimer = 0;
  private spawnInterval = 28; // sim-years until the next auto-spawn
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
      this.clear(); // fresh skies for a new run
      this.spawnTimer = 0;
      this.spawnInterval = 26;
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

    const theta = Math.random() * Math.PI * 2;
    const pos = new Vector3(
      Math.cos(theta) * SPAWN_RADIUS,
      (Math.random() - 0.5) * 5,
      Math.sin(theta) * SPAWN_RADIUS,
    );
    const energy = 0.45 + Math.random() * 0.5;

    const head = new Sprite(
      new SpriteMaterial({
        map: glowTexture(new Color(0xbef0ff)),
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    head.scale.setScalar(0.7);
    head.position.copy(pos);
    this.group.add(head);

    const tailPos = new Float32Array(6);
    const tailGeom = new BufferGeometry();
    tailGeom.setAttribute('position', new BufferAttribute(tailPos, 3));
    const tail = new Line(
      tailGeom,
      new LineBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false }),
    );
    this.group.add(tail);

    this.comets.push({ pos, energy, ageYears: 0, head, tail, tailPos, alive: true, deflected: false, vel: new Vector3() });
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

  /** deflect the nearest inbound comet, if there's still time */
  deflectNearest(): DeflectResult {
    let target: Comet | null = null;
    let bestDist = Infinity;
    for (const c of this.comets) {
      if (!c.alive || c.deflected) continue;
      const d = c.pos.distanceTo(this.earth);
      if (d < bestDist) {
        bestDist = d;
        target = c;
      }
    }
    if (!target) return 'none';
    if (bestDist < MIN_DEFLECT_DIST) return 'too-late';

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
    return 'deflected';
  }

  /** advance every comet — called every frame regardless of which regime is visible */
  step(clock: SimClock): void {
    const deltaYears = clock.dt / SECONDS_PER_YEAR;

    // survival mode: spawn fresh threats on a (gently escalating) timer
    if (this.defense && deltaYears > 0) {
      this.spawnTimer += deltaYears;
      if (this.spawnTimer >= this.spawnInterval) {
        this.spawnTimer = 0;
        this.autoSpawned++;
        // escalate toward a floor BELOW the deflect cooldown, so the siege
        // eventually outpaces you and the run ends.
        this.spawnInterval = Math.max(4, 26 - this.autoSpawned * 1.5) * (0.7 + Math.random() * 0.6);
        this.launch();
      }
    }

    if (this.comets.length === 0) return;
    this.earthAt(this.earth, clock.seconds);
    const total = Math.min(SPEED_AU_PER_YEAR * deltaYears, 30);

    for (const c of this.comets) {
      if (!c.alive) continue;
      c.ageYears += deltaYears;

      if (c.deflected) {
        // free flight along its escape vector — no homing, no impact
        c.pos.addScaledVector(c.vel, total);
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
        if (c.ageYears > 120) c.alive = false; // straggler cleanup
      }

      // visuals: head + a tail pointing away from the Sun (origin)
      c.head.position.copy(c.pos);
      const tailLen = 0.6 + c.energy * 1.4;
      const away = this.dir.copy(c.pos).normalize();
      c.tailPos[0] = c.pos.x;
      c.tailPos[1] = c.pos.y;
      c.tailPos[2] = c.pos.z;
      c.tailPos[3] = c.pos.x + away.x * tailLen;
      c.tailPos[4] = c.pos.y + away.y * tailLen;
      c.tailPos[5] = c.pos.z + away.z * tailLen;
      (c.tail.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    }

    // sweep the dead
    for (let i = this.comets.length - 1; i >= 0; i--) {
      if (!this.comets[i]!.alive) this.removeAt(i);
    }
  }

  private impact(c: Comet, seconds: number): void {
    const dir = c.pos.clone().sub(this.earth).normalize(); // surface point that took the hit
    this.bus.emitImpact({ dir, energy: c.energy, atSeconds: seconds });
    this.impacts++;
    c.alive = false;
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
