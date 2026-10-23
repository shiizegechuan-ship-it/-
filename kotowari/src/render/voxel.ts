import * as THREE from 'three';

/** 粒（ボクセル）の集まり。座標は整数、色は 16 進。build() で見える面だけのメッシュにする。 */
export class Vox {
  readonly data = new Map<number, string>();
  static key(x: number, y: number, z: number): number {
    return ((x + 512) << 20) | ((y + 512) << 10) | (z + 512);
  }
  set(x: number, y: number, z: number, c: string | null): this {
    const k = Vox.key(Math.round(x), Math.round(y), Math.round(z));
    if (c === null) this.data.delete(k);
    else this.data.set(k, c);
    return this;
  }
  get(x: number, y: number, z: number): string | undefined {
    return this.data.get(Vox.key(x, y, z));
  }
  /** 両端を含む直方体 */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: string | ((x: number, y: number, z: number) => string | null)): this {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
          const cc = typeof c === 'function' ? c(x, y, z) : c;
          if (cc !== null) this.set(x, y, z, cc);
        }
    return this;
  }
  /** 楕円体 */
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: string | ((x: number, y: number, z: number) => string | null)): this {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
          if (d <= 1) {
            const cc = typeof c === 'function' ? c(x, y, z) : c;
            if (cc !== null) this.set(x, y, z, cc);
          }
        }
    return this;
  }
  /** y 方向の円柱（半径は y で変えられる） */
  cylinder(cx: number, cz: number, y0: number, y1: number, r: number | ((y: number) => number), c: string | ((x: number, y: number, z: number) => string | null)): this {
    for (let y = y0; y <= y1; y++) {
      const rr = typeof r === 'function' ? r(y) : r;
      for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++)
        for (let z = Math.floor(cz - rr); z <= Math.ceil(cz + rr); z++)
          if ((x - cx) ** 2 + (z - cz) ** 2 <= rr * rr + 0.25) {
            const cc = typeof c === 'function' ? c(x, y, z) : c;
            if (cc !== null) this.set(x, y, z, cc);
          }
    }
    return this;
  }
  /** 左右対称にする（x を反転して写す） */
  mirrorX(about = 0): this {
    const add: [number, number, number, string][] = [];
    for (const [k, c] of this.data) {
      const x = (k >> 20) - 512;
      const y = ((k >> 10) & 1023) - 512;
      const z = (k & 1023) - 512;
      add.push([2 * about - x, y, z, c]);
    }
    for (const [x, y, z, c] of add) if (this.get(x, y, z) === undefined) this.set(x, y, z, c);
    return this;
  }
  forEach(fn: (x: number, y: number, z: number, c: string) => void): void {
    for (const [k, c] of this.data) fn((k >> 20) - 512, ((k >> 10) & 1023) - 512, (k & 1023) - 512, c);
  }
  get count(): number {
    return this.data.size;
  }

  /**
   * 見える面だけの BufferGeometry。size は 1 粒の大きさ（m）、origin は粒座標の原点のずれ。
   * jitter：粒ごとの明るさの揺れ（手描きの粒感）
   */
  build(size: number, origin: [number, number, number] = [0, 0, 0], jitter = 0.05): THREE.BufferGeometry {
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const tmp = new THREE.Color();
    const FACES: [number, number, number, number[][]][] = [
      [1, 0, 0, [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
      [-1, 0, 0, [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]],
      [0, 1, 0, [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]],
      [0, -1, 0, [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
      [0, 0, 1, [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]]],
      [0, 0, -1, [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
    ];
    this.forEach((x, y, z, c) => {
      tmp.set(c);
      const h = hash3(x, y, z);
      const j = 1 + (h - 0.5) * 2 * jitter;
      const r = tmp.r * j;
      const g = tmp.g * j;
      const b = tmp.b * j;
      for (const [nx, ny, nz, quad] of FACES) {
        if (this.get(x + nx, y + ny, z + nz) !== undefined) continue;
        const base = pos.length / 3;
        // 下向きの面と横の面は少し暗く（陰影の段を補う）
        const shade = ny < 0 ? 0.62 : ny > 0 ? 1.0 : nx !== 0 ? 0.86 : 0.78;
        for (const q of quad) {
          pos.push((x + q[0] + origin[0]) * size, (y + q[1] + origin[1]) * size, (z + q[2] + origin[2]) * size);
          nor.push(nx, ny, nz);
          col.push(r * shade, g * shade, b * shade);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return geo;
  }
}

export function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 3 段の陰影（トゥーン）のグラデーション */
let gradient: THREE.DataTexture | null = null;
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

let voxMat: THREE.MeshToonMaterial | null = null;
export function voxelMaterial(): THREE.MeshToonMaterial {
  if (!voxMat) voxMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  return voxMat;
}

/**
 * アルファを目印に使う材質。three.js は不透明（NormalBlending）の材質のアルファを 1 に固定するので、
 * 「上書きするだけ」の合成（One, Zero）を指定してアルファをそのまま書かせる。
 */
export function markerMaterial(opts: THREE.MeshBasicMaterialParameters, alpha: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    ...opts,
    opacity: alpha,
    transparent: false,
    fog: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.ZeroFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.ZeroFactor,
  });
}

/** 量子化から外す発光の材質（アルファ 0.5 を目印にする） */
const glowCache = new Map<string, THREE.MeshBasicMaterial>();
export function glowMaterial(color: string): THREE.MeshBasicMaterial {
  let m = glowCache.get(color);
  if (!m) {
    m = markerMaterial({ color }, 0.5);
    glowCache.set(color, m);
  }
  return m;
}
/** 発光の粒（頂点色） */
let glowVox: THREE.MeshBasicMaterial | null = null;
export function glowVoxelMaterial(): THREE.MeshBasicMaterial {
  if (!glowVox) glowVox = markerMaterial({ vertexColors: true }, 0.5);
  return glowVox;
}
/** シネマグラフで動かす部分（アルファ 0.25） */
let liveVox: THREE.MeshBasicMaterial | null = null;
export function liveVoxelMaterial(): THREE.MeshBasicMaterial {
  if (!liveVox) liveVox = markerMaterial({ vertexColors: true }, 0.25);
  return liveVox;
}
