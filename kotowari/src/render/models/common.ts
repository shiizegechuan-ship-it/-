import * as THREE from 'three';
import { Vox, glowVoxelMaterial, liveVoxelMaterial, voxelMaterial } from '../voxel';

export const V16 = 1 / 16;
export const V8 = 1 / 8;

export function voxMesh(v: Vox, size: number, origin: [number, number, number] = [0, 0, 0], kind: 'toon' | 'glow' | 'live' = 'toon', jitter = 0.05): THREE.Mesh {
  const mat = kind === 'toon' ? voxelMaterial() : kind === 'glow' ? glowVoxelMaterial() : liveVoxelMaterial();
  const m = new THREE.Mesh(v.build(size, origin, jitter), mat);
  m.castShadow = kind === 'toon';
  m.receiveShadow = kind === 'toon';
  return m;
}

/** 回転の軸（ピボット）付きの部位 */
export function part(name: string, pivot: [number, number, number], ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(...pivot);
  for (const c of children) g.add(c);
  return g;
}

export const SKIN = '#f1d2b4';
