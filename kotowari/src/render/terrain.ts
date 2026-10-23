import * as THREE from 'three';
import type { Solid } from '../core/physics';
import { TEX_METERS } from './textures';

/** 箱を世界座標の UV（1 枚 = TEX_METERS）で面ごとに作り、まとめた BufferGeometry にする */
export function boxesGeometry(boxes: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }[], local = false): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const k = 1 / TEX_METERS;
  for (const b of boxes) {
    const ox = local ? b.minX : 0;
    const oy = local ? b.minY : 0;
    const oz = local ? b.minZ : 0;
    const x0 = b.minX - ox;
    const y0 = b.minY - oy;
    const z0 = b.minZ - oz;
    const x1 = b.maxX - ox;
    const y1 = b.maxY - oy;
    const z1 = b.maxZ - oz;
    const faces: [number[], number[][], (p: number[]) => [number, number], number][] = [
      [[0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], (p) => [p[0] + ox, -(p[2] + oz)], 1.0],
      [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], (p) => [p[0] + ox, p[2] + oz], 0.55],
      [[1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], (p) => [-(p[2] + oz), p[1] + oy], 0.84],
      [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], (p) => [p[2] + oz, p[1] + oy], 0.84],
      [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], (p) => [p[0] + ox, p[1] + oy], 0.76],
      [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], (p) => [-(p[0] + ox), p[1] + oy], 0.76],
    ];
    for (const [n, quad, uvf, shade] of faces) {
      const base = pos.length / 3;
      for (const p of quad) {
        pos.push(p[0], p[1], p[2]);
        nor.push(n[0], n[1], n[2]);
        const [u, v] = uvf(p);
        uv.push(u * k, v * k);
        col.push(shade, shade, shade);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export const solidBox = (s: Solid) => s;
