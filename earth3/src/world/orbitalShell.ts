// Layer 6 — Earth's orbital shell: the named spacecraft (ISS, Hubble, GPS, the GEO
// ring…) as tracked dots, and the debris population as honest point-cloud shells
// (sampled, with the REAL counts on the cards — rendering 130 M points would be a lie
// of a different kind). Everything is Earth-centred: the group is placed at Earth's
// camera-relative position each frame and all children live in Earth-local AU.
//
// The whole shell fades in only when the camera is within SHOW_AU of Earth — from
// further out the layer is sub-pixel noise and would just alias on the globe dot.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineLoop,
  Points,
  PointsMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { FocusTarget, InspectorInfo } from '../core/regime';
import { mulberry32 } from '../core/rng';
import { dotTexture } from '../render/sprites';
import { makeLabel } from '../render/label';
import { SATELLITES, SHELLS, satLocalPosition, KM_PER_AU_ORB, type SatelliteData, type ShellData } from '../data/orbitals';

export const ORBITAL_SHOW_AU = 0.02; // debris clouds fade in inside this (≈ 8 lunar distances)
export const SAT_SHOW_AU = 0.005; // named-craft dots + labels: close enough that orbits resolve
const EARTH_R_KM = 6_371;

interface SatEntry {
  s: SatelliteData;
  dot: Sprite;
  label: Sprite;
  ring: LineLoop; // the orbit path — shown INSTEAD of the dot when time runs too fast to track
  local: Vector3; // Earth-relative AU (updated each frame)
  coherent: boolean; // false when the sim rate advances >~1/8 orbit per frame (dot would strobe)
}

export class OrbitalShell {
  /** placed at Earth's camera-relative position each frame by the caller */
  readonly group = new Group();
  private readonly sats: SatEntry[] = [];
  private readonly clouds: { shell: ShellData; points: Points }[] = [];
  private craft_: FocusTarget[] | null = null;
  private shells_: FocusTarget[] | null = null;

  constructor(private readonly earthWorld: () => Vector3) {
    // named spacecraft — constant-screen-size dots + labels, positions driven in step().
    // Each also gets its orbit RING, shown instead of the dot whenever the sim rate
    // advances a large fraction of the orbit per frame — the honest "motion blur"
    // (a 92-minute orbit at 1 yr/s IS a ring, not a dot).
    for (const s of SATELLITES) {
      const dot = new Sprite(new SpriteMaterial({ map: dotTexture(), color: new Color(s.color), sizeAttenuation: false, depthTest: false, transparent: true }));
      dot.scale.set(0.006, 0.006, 1);
      dot.renderOrder = 2;
      const label = makeLabel(s.label, s.color, 0.026);
      const ringPts: Vector3[] = [];
      for (let i = 0; i < 96; i++) {
        ringPts.push(satLocalPosition(s, ((i / 96) * s.periodMin - s.phaseDeg) * 60, new Vector3())); // phase offset irrelevant for a closed loop
      }
      const ring = new LineLoop(
        new BufferGeometry().setFromPoints(ringPts),
        new LineBasicMaterial({ color: s.color, transparent: true, opacity: 0.28, depthWrite: false }),
      );
      ring.visible = false;
      this.group.add(dot, label, ring);
      this.sats.push({ s, dot, label, ring, local: new Vector3(), coherent: true });
    }
    // debris/constellation shells — static point clouds (the shells precess slowly in
    // reality; at display scale a fixed sample reads correctly)
    const rng = mulberry32(0x04b17); // seeded — deterministic across sessions
    for (const shell of SHELLS) {
      const pos = new Float32Array(shell.points * 3);
      for (let i = 0; i < shell.points; i++) {
        const alt = shell.altLoKm + rng() * (shell.altHiKm - shell.altLoKm);
        const a = (EARTH_R_KM + alt) / KM_PER_AU_ORB;
        const th = rng() * Math.PI * 2;
        const inc = (rng() * 2 - 1) * shell.incMaxDeg * (Math.PI / 180);
        const x = Math.cos(th) * a;
        const z = Math.sin(th) * a;
        pos[i * 3] = x;
        pos[i * 3 + 1] = z * Math.sin(inc);
        pos[i * 3 + 2] = z * Math.cos(inc);
      }
      const geom = new BufferGeometry();
      geom.setAttribute('position', new BufferAttribute(pos, 3));
      const points = new Points(geom, new PointsMaterial({
        color: shell.color, size: 1.6, sizeAttenuation: false,
        transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false,
      }));
      points.frustumCulled = false;
      this.group.add(points);
      this.clouds.push({ shell, points });
    }
    this.group.visible = false;
  }

  /** advance the named satellites along their orbits (Earth-local AU). `dtPerFrame` is
   *  the sim-seconds the clock advanced this frame — when that eats more than ~1/8 of an
   *  orbit, the dot would strobe across random phases, so it's flagged incoherent. */
  step(seconds: number, dtPerFrame: number): void {
    for (const e of this.sats) {
      satLocalPosition(e.s, seconds, e.local);
      e.dot.position.copy(e.local);
      e.label.position.copy(e.local);
      e.coherent = dtPerFrame < e.s.periodMin * 60 * 0.125;
    }
  }

  /** two visibility bands: the debris clouds resolve from further out than the
   *  named craft (which would otherwise pile on the Earth dot as clutter). At
   *  incoherent time-rates each craft shows its orbit ring instead of a strobing dot. */
  setVisibility(earthCamDist: number): void {
    this.group.visible = earthCamDist < ORBITAL_SHOW_AU;
    if (!this.group.visible) return;
    const showSats = earthCamDist < SAT_SHOW_AU;
    for (const e of this.sats) {
      e.dot.visible = showSats && e.coherent;
      e.label.visible = showSats && e.coherent;
      e.ring.visible = showSats && !e.coherent;
    }
  }

  /** the craft name labels — registered into the world's declutter pass so they respect
   *  the density slider and collide-resolve against the Earth/Moon labels. */
  labels(): Sprite[] {
    return this.sats.map((e) => e.label);
  }

  /** The named craft as pickable/searchable targets, built ONCE (stable identities —
   *  hover compares by reference). Positions are ABSOLUTE AU via the live Earth position. */
  craftTargets(): FocusTarget[] {
    this.craft_ ??= this.sats.map<FocusTarget>((e) => ({
      id: `sat-${e.s.id}`,
      label: e.s.label,
      radius: 5e-9, // ~1 km-scale object; the pick radius floor keeps it clickable
      pickAngle: 0.004, // tight cone — LEO craft huddle Earth's disc and must not steal its clicks
      position: (out: Vector3) => out.copy(e.local).add(this.earthWorld()),
      info: (): InspectorInfo => satInfo(e.s),
    }));
    return this.craft_;
  }

  /** The debris shells as SEARCH-ONLY destinations — fly INTO the junk and the card
   *  tells the truth about the population. Not pickable: a click-sphere for a whole
   *  shell would swallow clicks aimed at Earth itself. */
  shellTargets(): FocusTarget[] {
    this.shells_ ??= this.clouds.map<FocusTarget>(({ shell }) => {
      // a representative point inside the shell (fixed Earth-local direction); the small
      // radius makes goToTarget's radius·60 framing land within the cloud, junk all around
      const mid = (EARTH_R_KM + (shell.altLoKm + shell.altHiKm) / 2) / KM_PER_AU_ORB;
      const local = new Vector3(mid * 0.8, mid * 0.35, mid * 0.49);
      return {
        id: `shell-${shell.id}`,
        label: shell.label,
        radius: mid * 0.04,
        position: (out: Vector3) => out.copy(local).add(this.earthWorld()),
        info: (): InspectorInfo => ({
          title: shell.label,
          rows: [
            ['Altitude', `${shell.altLoKm.toLocaleString()}–${shell.altHiKm.toLocaleString()} km`],
            ['Population', shell.realCount],
            ['Shown', `${shell.points.toLocaleString()} sampled`],
          ],
          blurb: shell.blurb,
        }),
      };
    });
    return this.shells_;
  }
}

function satInfo(s: SatelliteData): InspectorInfo {
  return {
    title: s.label,
    rows: [
      ['Altitude', `${s.altKm.toLocaleString()} km`],
      ['Period', s.periodMin < 200 ? `${s.periodMin.toFixed(0)} min` : `${(s.periodMin / 60).toFixed(1)} h`],
      ['Inclination', `${s.incDeg}°`],
    ],
    blurb: s.blurb,
  };
}
