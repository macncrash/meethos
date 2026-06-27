// A glow-point ShaderMaterial with per-vertex size and color, plus a uOpacity
// uniform so it participates in regime cross-fades. Used for settlement markers.
import { AdditiveBlending, ShaderMaterial, type Texture } from 'three';

export function createGlowPointsMaterial(map: Texture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uOpacity: { value: 1 },
      uScale: { value: 64 },
      uMaxSize: { value: 26 },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec3 acolor;
      varying vec3 vColor;
      uniform float uScale;
      uniform float uMaxSize;
      void main() {
        vColor = acolor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(size * (uScale / max(0.001, -mv.z)), 1.0, uMaxSize);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform sampler2D uMap;
      uniform float uOpacity;
      varying vec3 vColor;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        if (t.a < 0.04) discard;
        gl_FragColor = vec4(vColor, t.a * uOpacity * 0.72);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}
