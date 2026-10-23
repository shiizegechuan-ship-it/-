import * as THREE from 'three';
import { CAMERA } from '../core/data/tuning';
import { wrapAngle } from '../core/math';
import type { Sim } from '../core/sim';

/** 追従カメラ。ドリーズーム・タイムスライスの回り込み・揺れもここで扱う。 */
export class FollowCamera {
  readonly cam: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = CAMERA.pitchDefault;
  dist = CAMERA.distance;
  private idleT = 0;
  private target = new THREE.Vector3();
  private shakeT = 0;
  private shakeAmp = 0;
  shakeScale = 1;
  // ドリーズーム
  private dolly: { t: number; dur: number; focus: THREE.Vector3; fov0: number; fov1: number; from: THREE.Vector3 } | null = null;
  // タイムスライス
  private slice: { t: number; dur: number; center: THREE.Vector3; yaw0: number; radius: number } | null = null;
  // 演出で注目させる位置（会話など）
  focus: THREE.Vector3 | null = null;
  private liftSmooth = 0;

  constructor(aspect: number) {
    this.cam = new THREE.PerspectiveCamera(CAMERA.fov, aspect, 0.1, 200);
  }

  reset(sim: Sim): void {
    this.yaw = sim.player.yaw;
    this.pitch = CAMERA.pitchDefault;
    const b = sim.player.body;
    this.target.set(b.x, b.y + CAMERA.lookHeight, b.z);
    this.dolly = null;
    this.slice = null;
    this.focus = null;
  }

  shake(amp: number, time = 0.2): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp * this.shakeScale);
    this.shakeT = Math.max(this.shakeT, time);
  }

  /** ドリーズーム：focus の画面上の大きさを保ったまま、画角を fov0→fov1 に変える */
  dollyZoom(focus: THREE.Vector3, fov1: number, dur = 1.4): void {
    this.dolly = { t: 0, dur, focus: focus.clone(), fov0: CAMERA.fov, fov1, from: this.cam.position.clone() };
  }
  get dollyActive(): boolean {
    return !!this.dolly;
  }

  /** タイムスライス：止まった時の中で、center の周りを回り込む */
  timeSlice(center: THREE.Vector3, dur = 0.7): void {
    this.slice = { t: 0, dur, center: center.clone(), yaw0: this.yaw, radius: 3.2 };
  }
  get sliceActive(): boolean {
    return !!this.slice;
  }

  update(sim: Sim, dt: number, look: { dx: number; dy: number; keyYaw: number }): void {
    const p = sim.player;
    const b = p.body;
    if (look.dx || look.dy || look.keyYaw) this.idleT = 0;
    else this.idleT += dt;
    this.yaw -= look.dx * CAMERA.mouseSens;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy * CAMERA.mouseSens, CAMERA.pitchMin, CAMERA.pitchMax);
    this.yaw += look.keyYaw * CAMERA.yawSpeed * dt;
    // 放置すると鈴の背後へ（走っているときだけ）
    if (this.idleT > CAMERA.autoReturnDelay && p.runAmt > 0.5) {
      this.yaw += wrapAngle(p.yaw - this.yaw) * Math.min(1, CAMERA.autoReturnRate * dt * 0.5);
      this.pitch += (CAMERA.pitchDefault - this.pitch) * Math.min(1, dt);
    }
    // 追従（縦は少し遅れて、跳びで画面が揺れすぎないように）
    const tx = b.x;
    const ty = b.y + CAMERA.lookHeight;
    const tz = b.z;
    const k = 1 - Math.exp(-dt * 12);
    const ky = 1 - Math.exp(-dt * (b.onGround ? 8 : 3));
    this.target.x += (tx - this.target.x) * k;
    this.target.z += (tz - this.target.z) * k;
    this.target.y += (ty - this.target.y) * ky;

    const cam = this.cam;
    if (this.slice) {
      const s = this.slice;
      s.t += dt;
      const u = Math.min(1, s.t / s.dur);
      const e = u * u * (3 - 2 * u);
      const a = s.yaw0 + Math.PI + e * Math.PI * 0.9;
      cam.position.set(s.center.x + Math.sin(a) * s.radius, s.center.y + 0.9, s.center.z + Math.cos(a) * s.radius);
      cam.fov = CAMERA.fov - 12;
      cam.updateProjectionMatrix();
      cam.lookAt(s.center.x, s.center.y + 0.6, s.center.z);
      if (u >= 1) this.slice = null;
      return;
    }

    const lookAt = this.target.clone();
    let dist = this.dist;
    if (this.focus) lookAt.lerp(this.focus, 0.45);
    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    // 壁にめり込まない
    dist = this.clip(sim, lookAt, -fwdX * cp, sp, -fwdZ * cp, dist);
    // 壁が近すぎて寄るしかないときは、体に入り込まないよう上へ逃がす（見下ろしになる）
    const lift = dist < 2.2 ? (2.2 - dist) * 1.3 : 0;
    this.liftSmooth += (lift - this.liftSmooth) * Math.min(1, dt * 8);
    const pos = new THREE.Vector3(
      lookAt.x - fwdX * cp * dist,
      lookAt.y + sp * dist + (CAMERA.height - CAMERA.lookHeight) * 0.35 + this.liftSmooth,
      lookAt.z - fwdZ * cp * dist,
    );
    let fov = CAMERA.fov;
    if (this.dolly) {
      const d = this.dolly;
      d.t += dt;
      const u = Math.min(1, d.t / d.dur);
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      // 前半で変え、後半で戻す
      const w = u < 0.65 ? e / 0.65 : 1 - (u - 0.65) / 0.35;
      const ww = Math.max(0, Math.min(1, u < 0.65 ? Math.min(1, w) : w));
      fov = d.fov0 + (d.fov1 - d.fov0) * ww;
      // 注目物までの距離を、画角に合わせて変える：dist' = dist * tan(f0/2) / tan(f/2)
      const toF = new THREE.Vector3().subVectors(pos, d.focus);
      const d0 = toF.length();
      const d1 = (d0 * Math.tan(THREE.MathUtils.degToRad(d.fov0 / 2))) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
      pos.copy(d.focus).add(toF.normalize().multiplyScalar(d1));
      if (u >= 1) this.dolly = null;
      cam.position.copy(pos);
      cam.fov = fov;
      cam.updateProjectionMatrix();
      cam.lookAt(d.focus);
      return;
    }
    cam.position.copy(pos);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT / 0.2);
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(lookAt);
  }

  private clip(sim: Sim, from: THREE.Vector3, dx: number, dy: number, dz: number, dist: number): number {
    const phys = sim.world.phys;
    const r = 0.18;
    for (let d = 0.6; d <= dist; d += 0.2) {
      const x = from.x + dx * d;
      const y = from.y + dy * d + 0.4;
      const z = from.z + dz * d;
      const hits = phys.query(x - r, y - r, z - r, x + r, y + r, z + r);
      if (hits.some((s) => !s.dynamic && s.tag !== 'ghost')) return Math.max(1.0, d - 0.3);
    }
    return dist;
  }
}
