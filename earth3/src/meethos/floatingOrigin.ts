// meethos-core · floating origin
//
// The precision foundation. WebGL has no float64; an absolute position in
// interstellar space stored as float32 jitters by millions of km (the ULP at 1 pc
// is ~2.15 million km). The fix every space renderer uses: keep the CAMERA at the
// scene origin and translate the world so whatever you're looking at sits near
// (0,0,0). World positions live in JS numbers (f64); only the small camera-RELATIVE
// offset is ever handed to Three.js / the GPU.
//
// One render unit here is one AU (the canonical inner unit); a future shell scheme
// can swap the unit per sector for the deep cosmological frames.
import type { Object3D, Vector3 } from 'three';

export class FloatingOrigin {
  /** the camera's absolute position in world units (AU), carried in f64 */
  readonly camWorld: Vector3;

  constructor(camWorld: Vector3) {
    this.camWorld = camWorld;
  }

  /** place an object at its absolute `world` position, camera-relative. */
  place(obj: Object3D, world: Vector3): void {
    obj.position.set(world.x - this.camWorld.x, world.y - this.camWorld.y, world.z - this.camWorld.z);
  }

  /** write the camera-relative offset of an absolute world point into `out`. */
  rel(world: Vector3, out: Vector3): Vector3 {
    return out.set(world.x - this.camWorld.x, world.y - this.camWorld.y, world.z - this.camWorld.z);
  }
}
