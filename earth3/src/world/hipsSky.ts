// The REAL night sky as the observer-mode backdrop: one all-sky panorama (Mellinger
// optical mosaic, served by CDS's hips2fits as a plate-carrée render) mapped onto a
// far celestial sphere. The blackness between our catalogue stars becomes the actual
// photographed Milky Way — nebulosity, dust lanes, the bulge — with every catalogue
// layer drawn on top. Fetched once on demand (~2 MB); offline the sky simply stays
// synthetic. UVs are computed per-vertex from the RENDER-frame direction back through
// the equatorial frame (the render mapping includes a handedness flip, so a plain
// mesh rotation cannot orient the texture).
import { BackSide, Group, Mesh, MeshBasicMaterial, SphereGeometry, SRGBColorSpace, TextureLoader } from 'three';

const SKY_R = 8e12; // AU — outside every star tier, inside the observer far plane (1e14)
const OBL = (23.4392911 * Math.PI) / 180;
const URL =
  'https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=CDS%2FP%2FMellinger%2Fcolor&projection=CAR&ra=0&dec=0&fov=360&width=4000&height=2000&format=jpg';

export class HipsSky {
  readonly group = new Group();
  loaded = false;
  private loading = false;

  load(): void {
    if (this.loading) return;
    this.loading = true;
    new TextureLoader().load(
      URL,
      (tex) => {
        tex.colorSpace = SRGBColorSpace;
        const geom = new SphereGeometry(SKY_R, 96, 48);
        const pos = geom.getAttribute('position');
        const uv = geom.getAttribute('uv');
        const se = Math.sin(OBL);
        const ce = Math.cos(OBL);
        for (let i = 0; i < pos.count; i++) {
          const X = pos.getX(i) / SKY_R;
          const Y = pos.getY(i) / SKY_R;
          const Z = pos.getZ(i) / SKY_R;
          // render → equatorial (inverse of eclipticDirFromRaDec's map)
          const yEq = -Y * se + Z * ce;
          const zEq = Y * ce + Z * se;
          const ra = Math.atan2(yEq, X); // −π…π, 0 at the vernal equinox
          const dec = Math.asin(Math.max(-1, Math.min(1, zEq)));
          // CAR panorama centred on RA 0, RA increasing to the LEFT (east-left sky convention)
          uv.setXY(i, ((0.5 - ra / (2 * Math.PI)) % 1 + 1) % 1, 0.5 + dec / Math.PI);
        }
        uv.needsUpdate = true;
        const mat = new MeshBasicMaterial({ map: tex, side: BackSide, depthWrite: false });
        mat.color.setScalar(0.85); // slightly tamed so the catalogue stars still lead
        const mesh = new Mesh(geom, mat);
        mesh.renderOrder = -10; // the sky is behind everything
        mesh.frustumCulled = false;
        this.group.add(mesh);
        this.loaded = true;
      },
      undefined,
      () => { /* offline — synthetic sky remains */ },
    );
  }
}
