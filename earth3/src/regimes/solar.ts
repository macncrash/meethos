// Solar-system regime: the Sun + eight planets on analytic Keplerian orbits,
// rendered in AU. This is the orrery you arrive at after diving into the Sun
// from the galaxy, and the launchpad you dive from into Earth.
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  type Ray,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Material,
} from 'three';
import type { SimClock } from '../core/clock';
import type { FocusTarget, InspectorInfo, Regime } from '../core/regime';
import { glowTexture, ringTexture } from '../render/sprites';
import { makeLabel } from '../render/label';
import { setOpacityDeep } from '../render/opacity';
import { planetPosition, orbitPath } from './data/kepler';
import { PLANETS, SUN, type PlanetData } from './data/planets';
import { CometField, type DeflectResult, type DefenseStats } from './comets';
import type { WorldBus } from '../world/bus';

interface Body {
  data: PlanetData;
  holder: Group; // positioned at the planet + tilted by its obliquity
  mesh: Mesh; // spins about the (tilted) local Y at the true sidereal rate
  label: Sprite;
  readonly pos: Vector3;
}

const EARTH_DATA = PLANETS.find((p) => p.id === 'earth')!;
const DEG = Math.PI / 180;

export class SolarRegime implements Regime {
  readonly id = 'solar';
  readonly label = 'Solar System';
  readonly object3d = new Group();

  private readonly bodies: Body[] = [];
  private sun!: Mesh;
  private readonly targets: FocusTarget[] = [];
  private readonly comets: CometField;
  private earthMarker?: Sprite; // pulsing "defend this" reticle, shown during a game
  private defenseOn = false;
  private markerPhase = 0;

  constructor(bus: WorldBus) {
    this.buildSun();
    this.buildPlanets();
    this.object3d.name = 'solar';
    this.comets = new CometField(this.object3d, bus, (out, seconds) =>
      planetPosition(EARTH_DATA, seconds, out),
    );
  }

  /** launch a comet aimed at Earth (cross-scale coupling) */
  launchComet(): void {
    this.comets.launch();
  }

  /** AU distance of the nearest inbound (undeflected) comet, or null if none */
  threatDistance(): number | null {
    return this.comets.nearestThreatDist();
  }

  /** deflect the nearest inbound comet, if there's still time */
  deflectComet(): DeflectResult {
    return this.comets.deflectNearest();
  }

  /** deflect the comet nearest a click ray (skill targeting) */
  deflectCometAt(ray: Ray): DeflectResult {
    return this.comets.deflectAtRay(ray);
  }

  /** survival mode: comets arrive on their own */
  setDefenseMode(on: boolean): void {
    this.comets.setDefense(on);
    this.defenseOn = on;
    if (this.earthMarker) this.earthMarker.visible = on;
  }

  defenseStats(): DefenseStats {
    return this.comets.defenseStats;
  }

  private buildSun(): void {
    this.sun = new Mesh(
      new SphereGeometry(SUN.visualRadius, 48, 48),
      new MeshBasicMaterial({ color: SUN.color }),
    );
    this.object3d.add(this.sun);

    // additive glow halo
    const glow = new Sprite(
      new SpriteMaterial({
        map: glowTexture(new Color(0xffcf6a)),
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    glow.scale.setScalar(SUN.visualRadius * 9);
    this.sun.add(glow);

    const sunLabel = makeLabel('Sun', 0xffe08a);
    sunLabel.position.set(0, SUN.visualRadius * 1.5, 0);
    this.object3d.add(sunLabel);

    this.targets.push({
      id: SUN.id,
      label: SUN.label,
      position: (out) => out.set(0, 0, 0),
      radius: SUN.visualRadius,
      info: () => ({
        title: SUN.label,
        rows: [
          ['Type', 'G2V star'],
          ['Radius', `${SUN.radiusKm.toLocaleString()} km`],
          ['Bodies', `${PLANETS.length} planets`],
        ],
        blurb: SUN.blurb,
      }),
    });
  }

  private buildPlanets(): void {
    for (const data of PLANETS) {
      // holder sits at the planet's orbit position and carries the axial tilt;
      // the sphere spins inside it about the (now-tilted) local Y axis.
      const holder = new Group();
      holder.rotation.z = data.obliquityDeg * DEG;
      this.object3d.add(holder);

      const mesh = new Mesh(
        new SphereGeometry(data.visualRadius, 32, 32),
        new MeshBasicMaterial({ color: data.color }),
      );
      holder.add(mesh);

      if (data.hasRing) {
        const ring = new Mesh(
          new RingGeometry(data.visualRadius * 1.4, data.visualRadius * 2.3, 64),
          new MeshBasicMaterial({ color: 0xcdb23a, side: DoubleSide, transparent: true, opacity: 0.55 }),
        );
        ring.rotation.x = Math.PI / 2; // lie in the planet's equatorial plane (tilts with the holder)
        mesh.add(ring);
      }

      // faint orbit path (in the orbital frame, not tilted)
      const path = orbitPath(data);
      const geom = new BufferGeometry().setFromPoints(path);
      const line = new LineLoop(
        geom,
        new LineBasicMaterial({ color: data.color, transparent: true, opacity: 0.22 }),
      );
      this.object3d.add(line);

      if (data.id === 'earth') {
        const marker = new Sprite(
          new SpriteMaterial({ map: ringTexture(new Color(0x6ad6ff)), blending: AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }),
        );
        marker.scale.setScalar(0.5);
        marker.visible = false;
        marker.renderOrder = 2;
        holder.add(marker);
        this.earthMarker = marker;
      }

      const label = makeLabel(data.label, data.color);
      this.object3d.add(label);

      const body: Body = { data, holder, mesh, label, pos: new Vector3() };
      this.bodies.push(body);

      this.targets.push({
        id: data.id,
        label: data.label,
        radius: data.visualRadius,
        ...(data.childRegime ? { childRegime: data.childRegime } : {}),
        position: (out) => out.copy(body.pos),
        info: (clock) => this.planetInfo(data, clock),
      });
    }
  }

  private planetInfo(data: PlanetData, _clock: SimClock): InspectorInfo {
    return {
      title: data.label,
      rows: [
        ['Orbit', `${data.a.toFixed(2)} AU`],
        ['Year', data.periodYears < 1 ? `${(data.periodYears * 365).toFixed(0)} d` : `${data.periodYears.toFixed(1)} yr`],
        ['Radius', `${data.radiusKm.toLocaleString()} km`],
        ['Eccentricity', data.e.toFixed(3)],
      ],
      blurb: data.blurb,
    };
  }

  step(clock: SimClock): void {
    for (const b of this.bodies) {
      planetPosition(b.data, clock.seconds, b.pos);
      b.holder.position.copy(b.pos);
      b.label.position.set(b.pos.x, b.pos.y + b.data.visualRadius * 1.6, b.pos.z);
      // true sidereal spin about the tilted axis (signed → retrograde for Venus/Uranus)
      const rotSec = b.data.rotationHours * 3600;
      b.mesh.rotation.y = (clock.seconds / rotSec) * Math.PI * 2;
    }
    this.sun.rotation.y = (clock.seconds / (25.05 * 86400)) * Math.PI * 2; // ~25-day solar rotation

    if (this.defenseOn && this.earthMarker) {
      this.markerPhase += clock.realDt;
      this.earthMarker.scale.setScalar(0.46 + 0.09 * Math.sin(this.markerPhase * 4));
    }
  }

  // comets fly even when the solar system isn't the visible scale, so a strike
  // can land on Earth while you watch from the surface or the globe.
  stepBackground(clock: SimClock): void {
    this.comets.step(clock);
  }

  focusTargets(): FocusTarget[] {
    return this.targets;
  }

  defaultFocus(): FocusTarget | null {
    return this.targets[0] ?? null; // the Sun (overview)
  }

  overviewDistance(): number {
    return 22; // frames out to ~Saturn nicely
  }

  onEnter(): void {}
  onExit(): void {}

  setOpacity(o: number): void {
    setOpacityDeep(this.object3d, o);
  }

  dispose(): void {
    this.object3d.traverse((obj) => {
      const m = obj as Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as Material | Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
  }
}
