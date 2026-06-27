// Comets — the agent of cross-scale coupling. A comet launched in the solar
// regime homes on Earth, draws a sun-anti tail, and on contact emits an impact
// on the WorldBus (which the Earth regime turns into a crater + civilization
// setback). Motion is in sim-time so it streaks faster when you speed the clock;
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

const SPEED_AU_PER_YEAR = 52;
const CAPTURE = 0.16; // AU; > Earth's visual radius so contact is reliable
const SUBSTEP = 0.06; // AU; keeps fast comets from skipping past Earth
const SPAWN_RADIUS = 38;
const MAX_COMETS = 6;

interface Comet {
  pos: Vector3;
  energy: number;
  ageYears: number;
  head: Sprite;
  tail: Line;
  tailPos: Float32Array;
  alive: boolean;
}

export class CometField {
  private readonly comets: Comet[] = [];
  private readonly earth = new Vector3();
  private readonly dir = new Vector3();

  constructor(
    private readonly group: Object3D,
    private readonly bus: WorldBus,
    /** writes Earth's position at absolute `seconds` into `out` */
    private readonly earthAt: (out: Vector3, seconds: number) => Vector3,
  ) {}

  get count(): number {
    return this.comets.length;
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

    this.comets.push({ pos, energy, ageYears: 0, head, tail, tailPos, alive: true });
  }

  /** advance every comet — called every frame regardless of which regime is visible */
  step(clock: SimClock): void {
    if (this.comets.length === 0) return;
    this.earthAt(this.earth, clock.seconds);
    const deltaYears = clock.dt / SECONDS_PER_YEAR;
    const total = Math.min(SPEED_AU_PER_YEAR * deltaYears, 80);

    for (const c of this.comets) {
      if (!c.alive) continue;
      c.ageYears += deltaYears;

      if (total > 0) {
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
      }
      if (c.ageYears > 80) c.alive = false; // straggler cleanup (homing should hit first)

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
