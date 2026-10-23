import * as THREE from 'three';
import { markerMaterial, voxelMaterial } from './voxel';

interface P {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  grav: number;
  drag: number;
  color: THREE.Color;
  spin: number;
  /** 速度の向きに伸ばす長さ（0 で立方体） */
  stretch: number;
}

/** 小さな粒（火花・花びら・塵・銭のきらめき）。InstancedMesh 1 つで描く */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private ps: P[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();

  constructor(
    readonly max: number,
    glow: boolean,
  ) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = glow ? markerMaterial({ color: '#ffffff' }, 0.5) : voxelMaterial().clone();
    if (!glow) (mat as THREE.MeshToonMaterial).vertexColors = false;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < max; i++) {
      this.ps.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.06, grav: 0, drag: 0, color: new THREE.Color(), spin: 0, stretch: 0 });
      this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    }
    this.mesh.count = 0;
  }

  spawn(o: { x: number; y: number; z: number; vx?: number; vy?: number; vz?: number; life?: number; size?: number; grav?: number; drag?: number; color: string | THREE.Color; spin?: number; stretch?: number }): void {
    const p = this.ps.find((q) => !q.alive);
    if (!p) return;
    p.alive = true;
    p.x = o.x;
    p.y = o.y;
    p.z = o.z;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.vz = o.vz ?? 0;
    p.max = p.life = o.life ?? 0.6;
    p.size = o.size ?? 0.07;
    p.grav = o.grav ?? 0;
    p.drag = o.drag ?? 0;
    p.spin = o.spin ?? 0;
    p.stretch = o.stretch ?? 0;
    p.color.set(o.color);
  }

  burst(n: number, x: number, y: number, z: number, speed: number, color: string, opts: { life?: number; size?: number; grav?: number; up?: number } = {}): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.3) * Math.PI * 0.6;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.spawn({
        x,
        y,
        z,
        vx: Math.cos(a) * Math.cos(b) * s,
        vy: Math.sin(b) * s + (opts.up ?? 0),
        vz: Math.sin(a) * Math.cos(b) * s,
        life: (opts.life ?? 0.5) * (0.6 + Math.random() * 0.6),
        size: opts.size ?? 0.07,
        grav: opts.grav ?? 9,
        drag: 2,
        color,
        spin: 6,
      });
    }
  }

  update(dt: number): void {
    let n = 0;
    for (const p of this.ps) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      p.vy -= p.grav * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.vz *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const k = Math.min(1, p.life / (p.max * 0.4));
      const sz = p.size * k;
      if (p.stretch > 0) {
        this.e.set(0, Math.atan2(-p.vz, p.vx), 0);
        this.q.setFromEuler(this.e);
        this.s.set(p.stretch * k, sz, sz);
      } else {
        this.e.set(p.life * p.spin, p.life * p.spin * 0.7, 0);
        this.q.setFromEuler(this.e);
        this.s.set(sz, sz, sz);
      }
      this.v.set(p.x, p.y, p.z);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, p.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    for (const p of this.ps) p.alive = false;
    this.mesh.count = 0;
  }
}
