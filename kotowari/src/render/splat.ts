import * as THREE from 'three';

/**
 * 3D ガウシアン・スプラッティング・グリッチ：模型の面を点の雲（ぼかした円＝スプラット）に置き換え、
 * ブロックごとにずれ・伸び・ちらつきを起こして崩す。おこんの正体・山神の顕現に使う。
 */
export class SplatCloud {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;
  private t = 0;
  /** 0：ほぼ元の形 → 1：大きく崩れる */
  glitch = 0.3;

  constructor(source: THREE.Object3D, density = 1) {
    source.updateMatrixWorld(true);
    const pos: number[] = [];
    const col: number[] = [];
    const rnd: number[] = [];
    const v = new THREE.Vector3();
    source.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.visible) return;
      const g = o.geometry as THREE.BufferGeometry;
      const p = g.getAttribute('position');
      const c = g.getAttribute('color');
      if (!p) return;
      // 面の 4 頂点ごとに 1 点（面の中心）
      for (let i = 0; i + 3 < p.count; i += 4) {
        if (Math.random() > density) continue;
        v.set(0, 0, 0);
        for (let k = 0; k < 4; k++) v.add(new THREE.Vector3(p.getX(i + k), p.getY(i + k), p.getZ(i + k)));
        v.multiplyScalar(0.25).applyMatrix4(o.matrixWorld);
        pos.push(v.x, v.y, v.z);
        if (c) col.push(c.getX(i) * 1.3, c.getY(i) * 1.3, c.getZ(i) * 1.3);
        else col.push(0.5, 0.97, 1);
        rnd.push(Math.random(), Math.random(), Math.random());
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('rnd', new THREE.Float32BufferAttribute(rnd, 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uGlitch: { value: 0.3 }, uScale: { value: 220 } },
      vertexShader: /* glsl */ `
        attribute vec3 rnd;
        attribute vec3 color;
        uniform float uTime;
        uniform float uGlitch;
        uniform float uScale;
        varying vec3 vColor;
        varying float vA;
        float h(float n) { return fract(sin(n) * 43758.5453); }
        void main() {
          vec3 p = position;
          // ブロック（高さの帯）ごとに横へずれる
          float band = floor(p.y * 6.0 + floor(uTime * 9.0) * 3.1);
          float shift = (h(band) - 0.5) * 2.0 * step(1.0 - uGlitch * 0.8, h(band + 1.7));
          p.x += shift * 0.35 * uGlitch;
          // 粒ごとの呼吸と、ときどき飛び散る
          p += (rnd - 0.5) * 0.04 * (1.0 + sin(uTime * 3.0 + rnd.x * 20.0));
          float burst = step(0.985 - uGlitch * 0.05, h(rnd.y * 91.0 + floor(uTime * 12.0)));
          p += normalize(rnd - 0.5) * burst * 0.6 * uGlitch;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float sz = (0.06 + rnd.z * 0.05) * (1.0 + burst * 2.0);
          gl_PointSize = max(1.0, sz * uScale / -mv.z);
          vColor = color;
          vA = 0.75 - burst * 0.3;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float g = exp(-dot(d, d) * 14.0); // ガウスのぼかし
          if (g < 0.08) discard;
          gl_FragColor = vec4(vColor * g, vA * g);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }

  setScreenHeight(h: number): void {
    this.mat.uniforms.uScale.value = h * 0.9;
  }

  update(dt: number): void {
    this.t += dt;
    this.mat.uniforms.uTime.value = this.t;
    this.mat.uniforms.uGlitch.value = this.glitch;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}
