// Cross-fade helper: set opacity on every material under an object, remembering
// each material's intrinsic opacity so fades compose correctly.
import type { Material, Object3D } from 'three';

interface FadeMaterial extends Material {
  __baseOpacity?: number;
}

export function setOpacityDeep(root: Object3D, o: number): void {
  root.visible = o > 0.001;
  root.traverse((obj) => {
    const mat = (obj as { material?: Material | Material[] }).material;
    if (!mat) return;
    const apply = (m: Material): void => {
      const fm = m as FadeMaterial;
      if (fm.__baseOpacity === undefined) fm.__baseOpacity = fm.opacity ?? 1;
      fm.transparent = true;
      fm.opacity = fm.__baseOpacity * o;
    };
    if (Array.isArray(mat)) mat.forEach(apply);
    else apply(mat);
  });
}
