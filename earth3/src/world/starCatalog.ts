// The real naked-eye sky — ~8,900 stars from the HYG database (astronexus/
// HYG-Database, CC BY-SA) at their true 3D positions (parallax distances), rendered
// by APPARENT MAGNITUDE, not angular size: a star is a point source, so its on-screen
// brightness is its flux, and distance is already baked into the magnitude. Crucially,
// apparent magnitude is recomputed from the OBSERVER's position (setObserver) using the
// absolute magnitude — so the same catalog gives the correct sky from Earth, Mars, or
// Alpha Centauri (from which Earth's Sun becomes just another star).
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Points,
  ShaderMaterial,
  Vector3,
  type Texture,
} from 'three';
import type { PerspectiveCamera } from 'three';
import type { FocusTarget, InspectorInfo } from '../core/regime';
import { blackbodyColor } from '../core/color';
import { dotTexture } from '../render/sprites';
import { AU_PER_LY, AU_PER_PC, LY_PER_PC, SECTOR_LY, sectorLabel } from '../meethos/units';
import { STAR_NAMES } from '../data/starNames';
import starsUrl from '../data/stars.bin?url';
import starVelUrl from '../data/starVel.bin?url';
import starExtUrl from '../data/starExt.bin?url';
import DESIG from '../data/starDesig.json';
import { CONSTELLATIONS } from '../data/constellations';
import { EXO_SYSTEMS } from '../regimes/data/exoplanets';

const STRIDE = 6; // per star: dirX, dirY, dirZ, distPc, absmag, ci
const MAG_LIMIT = 6.5; // faintest naked-eye magnitude in the catalog
/** within this observer distance from the Sun, the Sun renders as the real body (its
 *  catalog point is suppressed). Kept in sync with UnifiedWorld's OBSERVER_SOLAR_AU. */
const SOLAR_SYSTEM_AU = 2000;

/** B–V colour index → effective temperature (Ballesteros 2012). */
function tempFromBV(ci: number): number {
  return 4600 * (1 / (0.92 * ci + 1.7) + 1 / (0.92 * ci + 0.62));
}

function starfieldMaterial(map: Texture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uMap: { value: map }, uMinPx: { value: 1.0 }, uMaxPx: { value: 7.0 }, uGain: { value: 1.0 } },
    // constant screen size (NO distance attenuation) driven by apparent magnitude
    vertexShader: /* glsl */ `
      attribute float amag;
      attribute vec3 acolor;
      varying vec3 vColor;
      varying float vBright;
      uniform float uMinPx;
      uniform float uMaxPx;
      void main() {
        vColor = acolor;
        // cull anything fainter than naked-eye (incl. the suppressed Sun at amag=99, and
        // stars that drop below the limit when re-projected from a distant observer)
        if (amag > ${(MAG_LIMIT + 0.5).toFixed(1)}) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        float b = clamp((${MAG_LIMIT.toFixed(1)} - amag) / 8.0, 0.0, 1.0); // 0 faint … 1 brightest
        vBright = b;
        gl_PointSize = uMinPx + b * b * (uMaxPx - uMinPx);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform sampler2D uMap;
      uniform float uGain;
      varying vec3 vColor;
      varying float vBright;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        if (t.a < 0.04) discard;
        gl_FragColor = vec4(vColor, t.a * uGain * (0.18 + 0.82 * vBright));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

export class StarCatalog {
  /** rides the floating origin — the caller sets group.position = -camWorld each frame */
  readonly group = new Group();

  private worldPos?: Float32Array; // absolute AU positions, 3 per star
  private absmag?: Float32Array;
  private distPc?: Float32Array;
  private ciArr?: Float32Array;
  private amagAttr?: BufferAttribute;
  private posAttr?: BufferAttribute;
  private basePos?: Float32Array; // J2000 positions — drift displaces from these
  private vel?: Float32Array; // real space velocities (AU/yr, render frame; HYG pm+rv)
  private ext?: Float32Array; // 9/star: raH, decDeg, pmra, pmdec, rv, lum, hip, hd, hr
  private appliedYears = 0;
  private mat?: ShaderMaterial;
  private readonly names = new Map<number, { name: string; con: string }>();
  /** index of the Sun in the catalog — it's the origin star, so from other vantages
   *  it becomes an ordinary point (mag ~0.4 from Alpha Cen), and is suppressed when
   *  the observer is inside the solar system (the real Sun body handles near views). */
  private sunIndex = -1;
  /** the current observer position in AU (default: the origin = Earth/Sun) */
  private readonly observer = new Vector3();
  private readonly _p = new Vector3(); // scratch for screen-space picking

  async load(): Promise<void> {
    const raw = new Float32Array(await (await fetch(starsUrl)).arrayBuffer());
    const n = Math.floor(raw.length / STRIDE);
    const total = n + 1; // + the Sun
    const pos = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    const amag = new Float32Array(total);
    const absmag = new Float32Array(total);
    const distPc = new Float32Array(total);
    const ciArr = new Float32Array(total);
    const c = new Color();
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      const dpc = raw[o + 3]!;
      const distAu = dpc * AU_PER_PC;
      pos[i * 3] = raw[o]! * distAu;
      pos[i * 3 + 1] = raw[o + 1]! * distAu;
      pos[i * 3 + 2] = raw[o + 2]! * distAu;
      absmag[i] = raw[o + 4]!;
      distPc[i] = dpc;
      ciArr[i] = raw[o + 5]!;
      blackbodyColor(tempFromBV(ciArr[i]!), c);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      amag[i] = absmag[i]! + 5 * Math.log10(Math.max(1e-6, dpc) / 10); // apparent mag from Earth
    }
    ciArr[n] = 0.65; // the Sun (index n)
    this.distPc = distPc;
    this.ciArr = ciArr;
    for (const [idx, name, con] of STAR_NAMES) this.names.set(idx, { name, con });
    // the Sun: at the origin, absolute mag +4.83 (V), G2 colour. Invisible from Earth
    // (the real body renders); becomes a star once the observer leaves the solar system.
    this.sunIndex = n;
    absmag[n] = 4.83;
    blackbodyColor(5772, c);
    col[n * 3] = c.r; col[n * 3 + 1] = c.g; col[n * 3 + 2] = c.b;
    amag[n] = 99; // hidden from Earth/origin
    this.worldPos = pos;
    this.absmag = absmag;

    const geom = new BufferGeometry();
    this.posAttr = new BufferAttribute(pos, 3); // shares this.worldPos — drift updates in place
    geom.setAttribute('position', this.posAttr);
    geom.setAttribute('acolor', new BufferAttribute(col, 3));
    this.amagAttr = new BufferAttribute(amag, 1);
    geom.setAttribute('amag', this.amagAttr);
    this.mat = starfieldMaterial(dotTexture());
    const points = new Points(geom, this.mat);
    points.frustumCulled = false;
    this.group.add(points);

    // real space velocities (HYG proper motion + radial velocity), aligned to this
    // catalogue's order — deep time makes the stars DRIFT and constellations dissolve.
    this.basePos = pos.slice();
    try {
      const vraw = new Float32Array(await (await fetch(starVelUrl)).arrayBuffer());
      if (vraw.length === n * 3) this.vel = vraw;
    } catch {
      // no velocity data — the sky simply stays a J2000 snapshot
    }
    try {
      const eraw = new Float32Array(await (await fetch(starExtUrl)).arrayBuffer());
      if (eraw.length === n * 9) this.ext = eraw;
    } catch {
      // no extended catalogue — cards fall back to the compact form
    }
  }

  /** Displace every star along its real space velocity to `years` after J2000 —
   *  quantised to 100-yr steps (sub-light-year everywhere, invisible at any zoom).
   *  Re-projects apparent magnitudes, since the distances changed too. */
  driftTo(years: number): void {
    if (!this.vel || !this.basePos || !this.worldPos || !this.posAttr) return;
    if (Math.abs(years - this.appliedYears) < 100) return;
    this.appliedYears = years;
    const pos = this.worldPos;
    const base = this.basePos;
    const vel = this.vel;
    for (let i = 0; i < vel.length; i++) pos[i] = base[i]! + vel[i]! * years;
    this.posAttr.needsUpdate = true;
    this.reproject(); // distances changed with the positions
  }

  /** overall brightness (0..1) — lets the caller fade the sky by zoom band */
  setGain(g: number): void {
    if (this.mat) this.mat.uniforms.uGain!.value = g;
  }

  /** re-project apparent magnitudes from a new observer position (AU). This is what
   *  makes the sky correct from anywhere: brightness = absmag + 5·log10(d_obs/10). */
  setObserver(world: Vector3): void {
    if (world.distanceToSquared(this.observer) < 1e-6) return; // unchanged
    this.observer.copy(world);
    this.reproject();
  }

  /** recompute every apparent magnitude from the current observer (called on observer
   *  moves AND on deep-time drift — either changes the distances). */
  private reproject(): void {
    if (!this.worldPos || !this.absmag || !this.amagAttr) return;
    const world = this.observer;
    const amag = this.amagAttr.array as Float32Array;
    const pos = this.worldPos;
    const abs = this.absmag;
    for (let i = 0; i < amag.length; i++) {
      const dx = pos[i * 3]! - world.x;
      const dy = pos[i * 3 + 1]! - world.y;
      const dz = pos[i * 3 + 2]! - world.z;
      const dpc = Math.max(1e-9, Math.sqrt(dx * dx + dy * dy + dz * dz) / AU_PER_PC);
      amag[i] = abs[i]! + 5 * Math.log10(dpc / 10);
    }
    // suppress the Sun while the observer is inside the solar system; the real Sun body
    // handles those views (matches UnifiedWorld's OBSERVER_SOLAR_AU so the Sun is never
    // both a body dot and a catalog star). Its catalog point would be a blinding blob.
    if (this.sunIndex >= 0 && world.length() < SOLAR_SYSTEM_AU) amag[this.sunIndex] = 99;
    this.amagAttr.needsUpdate = true;
  }

  /** pick the nearest rendered catalogue star to a screen point (NDC), as a FocusTarget
   *  whose info() is the star's catalogue card (sector, distance, class, magnitudes). */
  pickTarget(ndcX: number, ndcY: number, camera: PerspectiveCamera, camWorld: Vector3): FocusTarget | null {
    if (!this.worldPos || !this.amagAttr) return null;
    const pos = this.worldPos;
    const amag = this.amagAttr.array as Float32Array;
    let best = -1;
    let bestD = 0.035 * 0.035; // NDC pick radius² — generous, like a telescope app
    for (let i = 0; i < amag.length; i++) {
      if (amag[i]! > MAG_LIMIT + 0.5) continue; // not rendered (too faint / suppressed)
      this._p.set(pos[i * 3]! - camWorld.x, pos[i * 3 + 1]! - camWorld.y, pos[i * 3 + 2]! - camWorld.z).project(camera);
      if (this._p.z > 1) continue; // behind the camera
      const dx = this._p.x - ndcX;
      const dy = this._p.y - ndcY;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) return null;
    const idx = best;
    return {
      id: `hyg-${idx}`,
      label: this.names.get(idx)?.name ?? 'Star',
      radius: 0.25,
      position: (out) => out.set(pos[idx * 3]!, pos[idx * 3 + 1]!, pos[idx * 3 + 2]!),
      info: () => this.starCard(idx),
    };
  }

  /** EVERY catalogue star as a searchable destination — named stars by name, the rest
   *  by their HYG number, all with their SECTOR as a search alias (type "2, -27" to
   *  find a neighbourhood). Empty until the catalogue has loaded; Sun excluded. */
  searchAll(): Array<{ name: string; sub: string; alias: string; target: FocusTarget }> {
    if (!this.worldPos || !this.distPc || !this.amagAttr) return [];
    const pos = this.worldPos;
    const amag = this.amagAttr.array as Float32Array;
    const out: Array<{ name: string; sub: string; alias: string; target: FocusTarget }> = [];
    const n = this.distPc.length;
    for (let idx = 0; idx < n; idx++) {
      if (idx === this.sunIndex) continue;
      const named = this.names.get(idx);
      const ly = this.distPc[idx]! * LY_PER_PC;
      out.push({
        name: named?.name ?? `HYG ${idx}`,
        sub: named?.con ? `${ly.toFixed(1)} ly · ${named.con}` : `${ly.toFixed(1)} ly · mag ${amag[idx]!.toFixed(1)}`,
        alias: sectorLabel(pos[idx * 3]!, pos[idx * 3 + 1]!, pos[idx * 3 + 2]!),
        target: {
          id: `hyg-${idx}`,
          label: named?.name ?? `HYG ${idx}`,
          radius: 0.25,
          position: (out2) => out2.set(pos[idx * 3]!, pos[idx * 3 + 1]!, pos[idx * 3 + 2]!),
          info: () => this.starCard(idx),
        },
      });
    }
    return out;
  }

  /** The star you MEANT when you pointed: the brightest naked-eye star within 1.5° of
   *  the sky direction `dir` (people ask about the bright one), else the nearest. As
   *  currently projected — respects setObserver. */
  nearestTo(dir: Vector3, fromWorld: Vector3): { target: FocusTarget; sepDeg: number; mag: number } | null {
    if (!this.worldPos || !this.amagAttr) return null;
    const pos = this.worldPos;
    const amag = this.amagAttr.array as Float32Array;
    const CONE = Math.cos((1.5 * Math.PI) / 180);
    let nearest = -1;
    let nearestDot = -2;
    let bright = -1;
    let brightMag = Infinity;
    for (let i = 0; i < amag.length; i++) {
      if (amag[i]! > MAG_LIMIT) continue; // not naked-eye from this vantage (or suppressed Sun)
      this._p.set(pos[i * 3]! - fromWorld.x, pos[i * 3 + 1]! - fromWorld.y, pos[i * 3 + 2]! - fromWorld.z).normalize();
      const d = this._p.dot(dir);
      if (d > nearestDot) { nearestDot = d; nearest = i; }
      if (d > CONE && amag[i]! < brightMag) { brightMag = amag[i]!; bright = i; }
    }
    const idx = bright >= 0 ? bright : nearest;
    if (idx < 0) return null;
    // recompute the chosen star's separation
    this._p.set(pos[idx * 3]! - fromWorld.x, pos[idx * 3 + 1]! - fromWorld.y, pos[idx * 3 + 2]! - fromWorld.z).normalize();
    const sep = (Math.acos(Math.min(1, Math.max(-1, this._p.dot(dir)))) * 180) / Math.PI;
    return {
      target: {
        id: `hyg-${idx}`,
        label: this.names.get(idx)?.name ?? `star HYG ${idx}`,
        radius: 0.25,
        position: (out) => out.set(pos[idx * 3]!, pos[idx * 3 + 1]!, pos[idx * 3 + 2]!),
        info: () => this.starCard(idx),
      },
      sepDeg: sep,
      mag: amag[idx]!,
    };
  }

  /** all catalogue stars whose 5-ly sector matches (sx, sy, sz) — the Sun excluded */
  indicesInSector(sx: number, sy: number, sz: number): number[] {
    if (!this.worldPos || !this.distPc) return [];
    const out: number[] = [];
    const k = 1 / (AU_PER_LY * SECTOR_LY);
    for (let i = 0; i < this.distPc.length; i++) {
      if (i === this.sunIndex) continue;
      if (
        Math.round(this.worldPos[i * 3]! * k) === sx &&
        Math.round(this.worldPos[i * 3 + 1]! * k) === sy &&
        Math.round(this.worldPos[i * 3 + 2]! * k) === sz
      ) out.push(i);
    }
    return out;
  }

  /** all RENDERED stars whose screen projection falls inside an NDC rectangle */
  indicesInRect(minX: number, minY: number, maxX: number, maxY: number, camera: PerspectiveCamera, camWorld: Vector3): number[] {
    if (!this.worldPos || !this.amagAttr) return [];
    const amag = this.amagAttr.array as Float32Array;
    const pos = this.worldPos;
    const out: number[] = [];
    for (let i = 0; i < amag.length; i++) {
      if (amag[i]! > MAG_LIMIT + 0.5) continue; // not drawn from here
      this._p.set(pos[i * 3]! - camWorld.x, pos[i * 3 + 1]! - camWorld.y, pos[i * 3 + 2]! - camWorld.z).project(camera);
      if (this._p.z > 1) continue; // behind the camera
      if (this._p.x >= minX && this._p.x <= maxX && this._p.y >= minY && this._p.y <= maxY) out.push(i);
    }
    return out;
  }

  /** a FocusTarget for star `i` — the same card the screen-space pick serves */
  targetOf(idx: number): FocusTarget {
    const pos = this.worldPos!;
    return {
      id: `hyg-${idx}`,
      label: this.names.get(idx)?.name ?? `HYG ${idx}`,
      radius: 0.25,
      position: (out) => out.set(pos[idx * 3]!, pos[idx * 3 + 1]!, pos[idx * 3 + 2]!),
      info: () => this.starCard(idx),
    };
  }

  /** star `i`'s absolute AU position (drift-aware) into `out`; false if not loaded */
  positionOf(i: number, out: Vector3): boolean {
    if (!this.worldPos) return false;
    out.set(this.worldPos[i * 3]!, this.worldPos[i * 3 + 1]!, this.worldPos[i * 3 + 2]!);
    return true;
  }

  /** name / colour / brightness for building a selection label on star `i` */
  labelInfo(i: number): { name: string; color: number; amag: number } {
    const c = new Color();
    blackbodyColor(tempFromBV(this.ciArr?.[i] ?? 0.6), c);
    return {
      name: this.names.get(i)?.name ?? `HYG ${i}`,
      color: c.getHex(),
      amag: (this.amagAttr?.array as Float32Array | undefined)?.[i] ?? 99,
    };
  }

  /** the full data card for a NAMED star — lets the 14 hand-placed divable stars
   *  (Sirius, Vega, Fomalhaut…) serve their real catalogue card instead of a stub.
   *  Falls back to a HIP-number alias for stars HYG names differently (or not at
   *  all): 'Tau Ceti' has no proper name, 'Alpha Centauri' is Rigil Kentaurus. */
  cardByName(name: string): InspectorInfo | null {
    for (const [i, v] of this.names) if (v.name === name) return this.starCard(i);
    const hip = ALIAS_HIP[name];
    if (hip !== undefined && this.ext) {
      for (let i = 0; i < this.ext.length / 9; i++) {
        if (this.ext[i * 9 + 6] === hip) return this.starCard(i, name);
      }
    }
    return null;
  }

  private starCard(i: number, titleOverride?: string): InspectorInfo {
    const named = this.names.get(i);
    const dpc = this.distPc?.[i] ?? 0;
    const app = (this.amagAttr!.array as Float32Array)[i]!;
    const pos = this.worldPos!;
    const ci = this.ciArr?.[i] ?? 0.6;
    const rows: Array<[string, string]> = [
      ['Distance', `${(dpc * LY_PER_PC).toFixed(2)} ly · ${dpc.toFixed(2)} pc`],
      ['App. mag', app.toFixed(2)],
    ];
    const title = titleOverride ?? named?.name ?? `HYG ${i}`;
    const blurb = named
      ? 'A named naked-eye star from the HYG catalogue.'
      : 'A naked-eye star from the HYG catalogue — one of ~8,900 within reach.';
    const e = this.ext;
    if (!e || Number.isNaN(e[i * 9])) {
      // no extended record — the compact card
      rows.push(['Class', spectralClass(ci)], ['Abs. mag', (this.absmag?.[i] ?? 0).toFixed(2)]);
      rows.push(['Sector', sectorLink(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!)]);
      if (named?.con) rows.push(['Constellation', named.con]);
      return { title, rows, blurb };
    }
    const o = i * 9;
    const [raH, decDeg, pmra, pmdec, rv, lum, hip, hd, hr] = [e[o]!, e[o + 1]!, e[o + 2]!, e[o + 3]!, e[o + 4]!, e[o + 5]!, e[o + 6]!, e[o + 7]!, e[o + 8]!];
    const d = (DESIG as Record<string, string[]>)[String(i)];
    const [spect, bayer, flam, gl, con, varr] = [d?.[0] ?? '', d?.[1] ?? '', d?.[2] ?? '', d?.[3] ?? '', d?.[4] ?? '', d?.[5] ?? ''];
    const temp = tempFromBV(ci);
    // Stefan–Boltzmann radius from L and T; main-sequence M–L mass — both honest estimates
    const radius = Number.isFinite(lum) ? Math.sqrt(lum) * (5772 / temp) ** 2 : NaN;
    const mass = Number.isFinite(lum) ? lum ** (1 / 3.5) : NaN;
    const conName = CONSTELLATIONS.find((c) => c.id === con)?.name ?? con;
    const fx = (v: number, digits = 2): string => (Number.isFinite(v) ? v.toFixed(digits) : '—');

    const observation: Array<[string, string]> = [
      ['Right ascension', raHMS(raH)],
      ['Declination', decDMS(decDeg)],
    ];
    if (con) observation.push(['Constellation', conName]);
    observation.push(['Sector', sectorLink(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!)]);

    const characteristics: Array<[string, string]> = [];
    if (spect) characteristics.push(['Spectral type', spect], ['Stage', evolutionaryStage(spect)]);
    else characteristics.push(['Class (est.)', spectralClass(ci)]);
    characteristics.push(['B−V colour', ci.toFixed(3)], ['Temperature (est.)', `${Math.round(temp).toLocaleString()} K`]);
    if (varr) characteristics.push(['Variable', varr]);
    const exo = EXO_SYSTEMS[title] ?? EXO_SYSTEMS[EXO_TITLE_ALIAS[title] ?? ''];
    if (exo) characteristics.push(['Known planets', `${exo.length} — dive in to visit`]);

    const astrometry: Array<[string, string]> = [
      ['μ (RA)', `${fx(pmra, 1)} mas/yr`],
      ['μ (Dec)', `${fx(pmdec, 1)} mas/yr`],
    ];
    if (Number.isFinite(rv)) astrometry.push(['Radial velocity', `${rv > 0 ? '+' : ''}${fx(rv, 1)} km/s`]);
    astrometry.push(
      ['Parallax', `${(1000 / dpc).toFixed(2)} mas`],
      ['Abs. magnitude', (this.absmag?.[i] ?? 0).toFixed(2)],
    );

    // further DERIVED physics, all honestly (est.)-labelled:
    // log g from GM/R²; total main-sequence lifetime ~10 Gyr·M/L; the habitable
    // zone scales as √L; Wien's law gives the emission peak.
    const logg = Number.isFinite(mass) && Number.isFinite(radius)
      ? 4.438 + Math.log10(mass) - 2 * Math.log10(radius) : NaN;
    const msLife = Number.isFinite(mass) && Number.isFinite(lum) ? (10 * mass) / lum : NaN; // Gyr
    const hzAu = Number.isFinite(lum) ? Math.sqrt(lum) : NaN;
    const peakNm = 2.898e6 / temp;
    const details: Array<[string, string]> = [
      ['Luminosity', `${fx(lum)} L☉`],
      ['Radius (est.)', `${fx(radius)} R☉`],
      ['Mass (est.)', `${fx(mass)} M☉`],
      ['Surface gravity (est.)', Number.isFinite(logg) ? `log g ${logg.toFixed(2)}` : '—'],
      ['MS lifetime (est.)', Number.isFinite(msLife)
        ? msLife >= 1 ? `${msLife.toFixed(1)} Gyr` : `${Math.round(msLife * 1000)} Myr`
        : '—'],
      ['Habitable zone (est.)', Number.isFinite(hzAu) ? `~${hzAu < 0.1 ? hzAu.toFixed(3) : hzAu.toFixed(1)} AU` : '—'],
      ['Peak emission', `${Math.round(peakNm)} nm · ${spectrumWord(peakNm)}`],
    ];

    // designations link straight to SIMBAD under that identifier
    const simbad = (ident: string): string =>
      `<a href="https://simbad.u-strasbg.fr/simbad/sim-id?Ident=${encodeURIComponent(ident)}" target="_blank" rel="noopener">${ident} ↗</a>`;
    const names: Array<[string, string]> = [];
    const bayerName = prettyBayer(bayer, flam, con);
    if (bayerName) names.push(['Bayer/Flamsteed', bayerName]);
    if (gl) names.push(['Gliese', simbad(gl)]);
    if (Number.isFinite(hip)) names.push(['Hipparcos', simbad(`HIP ${hip}`)]);
    if (Number.isFinite(hd)) names.push(['Henry Draper', simbad(`HD ${hd}`)]);
    if (Number.isFinite(hr)) names.push(['Bright Star', simbad(`HR ${hr}`)]);

    // the reference databases, like the wiki footer: SIMBAD, Exoplanet Archive, Wikipedia
    const hasName = Boolean(named || titleOverride);
    const bestId = Number.isFinite(hd) ? `HD ${hd}` : Number.isFinite(hip) ? `HIP ${hip}` : hasName ? title : '';
    const databases: Array<[string, string]> = [];
    if (bestId) databases.push(['SIMBAD', simbad(bestId).replace(`${bestId} ↗`, 'data ↗')]);
    if (bestId) databases.push(['Exoplanet Archive',
      `<a href="https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(exo ? title : bestId)}" target="_blank" rel="noopener">data ↗</a>`]);
    if (hasName) databases.push(['Wikipedia',
      `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}" target="_blank" rel="noopener">article ↗</a>`]);

    return {
      title, rows, blurb,
      sections: [
        { title: 'Observation (J2000)', rows: observation },
        { title: 'Characteristics', rows: characteristics },
        { title: 'Astrometry', rows: astrometry },
        { title: 'Details', rows: details },
        ...(names.length ? [{ title: 'Designations', rows: names }] : []),
        ...(databases.length ? [{ title: 'Databases', rows: databases }] : []),
      ],
    };
  }
}

/** decimal hours → "22h 57m 39.0s" */
function raHMS(raH: number): string {
  const h = Math.floor(raH);
  const m = Math.floor((raH - h) * 60);
  const s = ((raH - h) * 60 - m) * 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${s.toFixed(1)}s`;
}

/** decimal degrees → "−29° 37′ 20″" */
function decDMS(decDeg: number): string {
  const sign = decDeg < 0 ? '−' : '+';
  const a = Math.abs(decDeg);
  const dg = Math.floor(a);
  const m = Math.floor((a - dg) * 60);
  const s = Math.round(((a - dg) * 60 - m) * 60);
  return `${sign}${dg}° ${String(m).padStart(2, '0')}′ ${String(s).padStart(2, '0')}″`;
}

const GREEK: Record<string, string> = {
  Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ',
  Iot: 'ι', Kap: 'κ', Lam: 'λ', Mu: 'μ', Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π',
  Rho: 'ρ', Sig: 'σ', Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω',
};

/** HYG's "Alp"+"24"+"PsA" → "24 α PsA" (superscripted components like The1 → θ¹) */
function prettyBayer(bayer: string, flam: string, con: string): string {
  if (!bayer && !flam) return '';
  const m = /^([A-Za-z]+)(\d?)$/.exec(bayer);
  const sup = ['', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
  const g = m ? (GREEK[m[1]!] ?? bayer) + (m[2] ? sup[Number(m[2])]! : '') : bayer;
  return [flam, g, con].filter(Boolean).join(' ');
}

/** Common names → HIP numbers, for stars the HYG proper-name column calls something
 *  else (Rigil Kentaurus) or nothing at all (Tau Ceti) — used by cardByName so the
 *  hand-placed divable stars still resolve to their full catalogue record. */
const ALIAS_HIP: Record<string, number> = {
  'Alpha Centauri': 71683,
  'Tau Ceti': 8102,
  'Epsilon Eridani': 16537,
  '61 Cygni': 104214,
  'Procyon': 37279,
  'Sirius': 32349,
  'Vega': 91262,
  'Altair': 97649,
  'Pollux': 37826,
  'Fomalhaut': 113368,
};

/** catalogue display names whose exoplanet-host entry is filed under another name */
const EXO_TITLE_ALIAS: Record<string, string> = {
  'Rigil Kentaurus': 'Alpha Centauri',
};

/** the sector row as an internal action link — the HUD delegates [data-sector] clicks
 *  to goToSector(), which flies there and labels the whole neighbourhood. */
function sectorLink(xAu: number, yAu: number, zAu: number): string {
  const s = (v: number): number => Math.round(v / AU_PER_LY / SECTOR_LY);
  return `<a class="seclink" data-sector="${s(xAu)},${s(yAu)},${s(zAu)}" title="Fly to this 5-ly sector and label its stars">${sectorLabel(xAu, yAu, zAu)} ⌖</a>`;
}

/** where a Wien-peak wavelength falls in the spectrum, in words */
function spectrumWord(nm: number): string {
  if (nm < 300) return 'ultraviolet';
  if (nm < 380) return 'near-UV';
  if (nm < 450) return 'violet-blue';
  if (nm < 495) return 'blue';
  if (nm < 570) return 'green';
  if (nm < 590) return 'yellow';
  if (nm < 620) return 'orange';
  if (nm < 750) return 'red';
  return 'infrared';
}

/** MK luminosity-class → evolutionary stage. Case-SENSITIVE first match, longest
 *  alternative first — uppercasing "Ib-IIv" would forge a phantom "IV". */
function evolutionaryStage(spect: string): string {
  const m = /VII|VI|IV|V|III|II|I/.exec(spect);
  switch (m?.[0]) {
    case 'VII': return 'white dwarf';
    case 'VI': return 'subdwarf';
    case 'V': return 'main sequence';
    case 'IV': return 'subgiant';
    case 'III': return 'giant';
    case 'II': return 'bright giant';
    case 'I': return 'supergiant';
    default: return '—';
  }
}

/** rough MK spectral class + effective temperature from a B–V colour index. */
function spectralClass(ci: number): string {
  const t = tempFromBV(ci);
  const cls = t > 28000 ? 'O' : t > 10500 ? 'B' : t > 7300 ? 'A' : t > 5900 ? 'F' : t > 5200 ? 'G' : t > 3800 ? 'K' : 'M';
  return `${cls} · ${Math.round(t).toLocaleString()} K`;
}
