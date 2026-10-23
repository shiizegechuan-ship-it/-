import * as THREE from 'three';
import type { Vox } from './voxel';
import { markerMaterial } from './voxel';

/**
 * コンポーズド・モーフィング：2 つのボクセル模型の粒を対応づけ、粒ごとに少しずつ時間をずらして
 * 位置と色を移す（夜守の面が千鶴の顔へ変わる）。粒の数が違うときは少ない方を重ねて合わせる。
 */
export class VoxelMorph {
  readonly mesh: THREE.InstancedMesh;
  private from: { p: THREE.Vector3; c: THREE.Color }[] = [];
  private to: { p: THREE.Vector3; c: THREE.Color }[] = [];
  private delay: number[] = [];
  t = 0;
  readonly dur: number;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private col = new THREE.Color();

  constructor(a: Vox, b: Vox, size: number, dur = 2.4) {
    this.dur = dur;
    const list = (v: Vox) => {
      const out: { p: THREE.Vector3; c: THREE.Color }[] = [];
      v.forEach((x, y, z, c) => out.push({ p: new THREE.Vector3(x * size, y * size, z * size), c: new THREE.Color(c) }));
      // 高さ→横の順に並べて対応させる（上の粒は上の粒へ）
      out.sort((p, q) => p.p.y - q.p.y || p.p.x - q.p.x || p.p.z - q.p.z);
      return out;
    };
    const A = list(a);
    const B = list(b);
    const n = Math.max(A.length, B.length);
    for (let i = 0; i < n; i++) {
      this.from.push(A[Math.floor((i * A.length) / n)]);
      this.to.push(B[Math.floor((i * B.length) / n)]);
      // 上から順にほどける
      this.delay.push((1 - i / n) * 0.45 + Math.random() * 0.15);
    }
    const geo = new THREE.BoxGeometry(size, size, size);
    this.mesh = new THREE.InstancedMesh(geo, markerMaterial({ color: '#ffffff' }, 0.5), n);
    this.mesh.frustumCulled = false;
    this.update(0);
  }

  get done(): boolean {
    return this.t >= this.dur;
  }

  update(dt: number): void {
    this.t += dt;
    const u0 = this.t / this.dur;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < this.from.length; i++) {
      const u = Math.max(0, Math.min(1, (u0 - this.delay[i]) / 0.4));
      const e = u * u * (3 - 2 * u);
      // 途中で外へふくらむ（ばらけてから組み直す）
      const bulge = Math.sin(e * Math.PI) * 0.18;
      tmp.lerpVectors(this.from[i].p, this.to[i].p, e);
      tmp.multiplyScalar(1 + bulge);
      tmp.z += bulge * 0.6;
      this.q.setFromEuler(new THREE.Euler(e * 3, e * 2, 0));
      this.s.setScalar(1 - bulge * 1.5);
      this.m.compose(tmp, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.col.copy(this.from[i].c).lerp(this.to[i].c, e);
      this.mesh.setColorAt(i, this.col);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
