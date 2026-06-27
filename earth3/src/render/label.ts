// Billboarded text labels with semantic zoom — they face the camera and stay a
// constant pixel size regardless of distance (sizeAttenuation off), so they read
// at any zoom. The seed of the "learning tool" labeling layer.
import { CanvasTexture, Color, Sprite, SpriteMaterial } from 'three';

const FONT = '500 34px ui-monospace, "SF Mono", Menlo, monospace';

/** A constant-screen-size text label. Position it each frame (it billboards). */
export function makeLabel(text: string, color = 0xdfe7ff, screenSize = 0.05): Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = FONT;
  const w = Math.ceil(ctx.measureText(text).width);
  canvas.width = w + 20;
  canvas.height = 48;

  // re-set after the resize cleared the context, draw a soft shadow + the text
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = '#' + new Color(color).getHexString();
  ctx.fillText(text, 10, canvas.height / 2 + 1);

  const tex = new CanvasTexture(canvas);
  const sprite = new Sprite(
    new SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }),
  );
  sprite.renderOrder = 6;
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(screenSize * aspect, screenSize, 1);
  sprite.center.set(0.5, 0); // anchor at the bottom-center so it floats above its target
  return sprite;
}
