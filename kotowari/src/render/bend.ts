import * as THREE from 'three';

/**
 * スカイ・ポータル（Inception Effect）：前方の世界を、円筒に巻きつけるように空へ折り返す。
 * 全材質の頂点シェーダーに、世界座標での曲げを差し込む（uBend = 0 なら何もしない）。
 */
export const BEND = {
  uBend: { value: 0 },
  uBendPivot: { value: new THREE.Vector3() },
  uBendDir: { value: new THREE.Vector2(0, 1) },
  uBendR: { value: 9 },
};

const DECL = /* glsl */ `
uniform float uBend;
uniform vec3 uBendPivot;
uniform vec2 uBendDir;
uniform float uBendR;
vec3 kotoBend(vec3 p) {
  if (uBend <= 0.0) return p;
  vec2 d = p.xz - uBendPivot.xz;
  float along = dot(d, uBendDir);
  if (along <= 0.0) return p;
  float R = uBendR;
  float theta = along / R * uBend * 1.7;
  float h = p.y - uBendPivot.y;
  float a2 = R - h;
  float na = sin(theta) * a2;
  float nh = R - cos(theta) * a2;
  vec2 side = d - uBendDir * along;
  vec2 xz = uBendPivot.xz + uBendDir * na + side;
  return vec3(xz.x, uBendPivot.y + nh, xz.y);
}
`;

const PROJECT = /* glsl */ `
vec4 kotoWorld = vec4(transformed, 1.0);
#ifdef USE_BATCHING
  kotoWorld = batchingMatrix * kotoWorld;
#endif
#ifdef USE_INSTANCING
  kotoWorld = instanceMatrix * kotoWorld;
#endif
kotoWorld = modelMatrix * kotoWorld;
kotoWorld.xyz = kotoBend(kotoWorld.xyz);
vec4 mvPosition = viewMatrix * kotoWorld;
gl_Position = projectionMatrix * mvPosition;
`;

const done = new WeakSet<THREE.Material>();

export function makeBendable(m: THREE.Material): void {
  if (done.has(m) || (m as THREE.ShaderMaterial).isShaderMaterial) return;
  done.add(m);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev?.call(m, shader, r);
    Object.assign(shader.uniforms, BEND);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + DECL).replace('#include <project_vertex>', PROJECT);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : '') + '|bend';
  m.needsUpdate = true;
}

export function makeSceneBendable(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) makeBendable(m);
  });
}
