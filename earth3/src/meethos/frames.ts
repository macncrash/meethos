// meethos-core · coordinate frames
//
// Real celestial frames, chained so the angles between them (e.g. the ~60° tilt
// of the ecliptic to the galactic plane) EMERGE from physics rather than being
// hardcoded. We keep the render frame Y-up with the ecliptic in the X–Z plane
// (matching the orrery): ecliptic-X → +X, ecliptic-Y → +Z, ecliptic-north → +Y.
import { Matrix4, Vector3 } from 'three';

const DEG = Math.PI / 180;

/** Obliquity of the ecliptic at J2000 (IAU). */
export const OBLIQUITY_DEG = 23.4392911;
export const OBLIQUITY = OBLIQUITY_DEG * DEG;

/** North Galactic Pole + ascending node (J2000), defining the galactic frame. */
export const NGP_RA_DEG = 192.85948;
export const NGP_DEC_DEG = 27.12825;
export const GAL_NODE_DEG = 122.93192; // position angle of the NCP from the NGP

/** Unit direction from equatorial (RA,Dec in degrees), Z = celestial north. */
export function equatorialDir(raDeg: number, decDeg: number, out = new Vector3()): Vector3 {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const cd = Math.cos(dec);
  return out.set(cd * Math.cos(ra), cd * Math.sin(ra), Math.sin(dec));
}

/** Direction (RA,Dec) → the render frame (ecliptic, Y-up). Rotates equatorial→
 *  ecliptic about the vernal-equinox X axis by the obliquity, then maps to Y-up. */
export function eclipticDirFromRaDec(raDeg: number, decDeg: number, out = new Vector3()): Vector3 {
  const e = equatorialDir(raDeg, decDeg, out);
  const ce = Math.cos(OBLIQUITY);
  const se = Math.sin(OBLIQUITY);
  const yEcl = e.y * ce + e.z * se; // equatorial → ecliptic (Rx by +ε)
  const zEcl = -e.y * se + e.z * ce; // ecliptic north
  return out.set(e.x, zEcl, yEcl); // Y-up: ecliptic north → +Y
}

/** J2000 equatorial → galactic rotation matrix (multiply a unit vector). The ~60°
 *  ecliptic-galactic tilt falls out of composing this with the obliquity. */
export const EQ_TO_GAL = new Matrix4().set(
  -0.0548755604, -0.8734370902, -0.4838350155, 0,
  +0.4941094279, -0.4448296300, +0.7469822445, 0,
  -0.8676661490, -0.1980763734, +0.4559837762, 0,
  0, 0, 0, 1,
);

/** A quaternion that orients an ecliptic-frame object (e.g. the solar system) into
 *  the galactic frame — for placing the orrery correctly inside the galaxy. */
export function eclipticToGalacticMatrix(): Matrix4 {
  // ecliptic(Y-up render) → equatorial, then → galactic.
  const eclToEq = new Matrix4().makeRotationX(-OBLIQUITY);
  return new Matrix4().multiplyMatrices(EQ_TO_GAL, eclToEq);
}

/** Galactic Centre (Sgr A*) direction, J2000 equatorial. */
export const GC_RA_DEG = 266.41683;
export const GC_DEC_DEG = -29.00781;

/** A basis matrix whose columns are the render-frame directions of the galactic
 *  axes: +X toward the Galactic Centre, +Z toward the North Galactic Pole. Apply
 *  it to a galactic-frame position (disk in X–Y, Z = north) to place a star cloud
 *  correctly — the real ~60° galactic/ecliptic tilt then emerges automatically. */
export function galacticBasis(): Matrix4 {
  const toCenter = eclipticDirFromRaDec(GC_RA_DEG, GC_DEC_DEG).normalize();
  const z = eclipticDirFromRaDec(NGP_RA_DEG, NGP_DEC_DEG).normalize(); // galactic north
  const y = new Vector3().crossVectors(z, toCenter).normalize();
  const x = new Vector3().crossVectors(y, z).normalize(); // ≈ toCenter, re-orthogonalized
  return new Matrix4().makeBasis(x, y, z);
}
