import * as THREE from 'three';
import { PALETTE as C } from '../palette';
import { Vox } from '../voxel';
import { SKIN, V16, part, voxMesh } from './common';

/**
 * 鈴（神楽の舞手）。白衣に緋袴、黒髪の一つ結び、髪に小さな金の鈴。
 * 部位：hips（腰）> legL/legR、torso > head、armL/armR（袖）、fan（右手の扇）、lantern（左手の提灯）
 * 粒は 1/16m。原点は足元の中心、+z が前。
 */
export interface SuzuRig {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  fanClosed: THREE.Object3D;
  fanOpen: THREE.Object3D;
  lantern: THREE.Group;
  lanternGlow: THREE.Object3D;
  trail: THREE.Mesh;
}

export function buildSuzu(): SuzuRig {
  const root = new THREE.Group();
  root.name = 'suzu';
  const body = new THREE.Group();
  root.add(body);

  // 脚（袴）：腰の高さ 10 粒を軸に
  const leg = (side: number) => {
    const v = new Vox();
    // 袴の裾は広がる
    v.box(0, -10, -2, 3 * side, -4, 2, C.beni);
    v.box(0, -4, -2, 3 * side, -1, 2, C.beni);
    v.box(side > 0 ? 0 : -3, -10, -3, side > 0 ? 3 : 0, -8, 3, C.beni);
    // ひだの線
    v.box(side * 1, -9, 2, side * 1, -2, 2, C.enji);
    v.box(side * 1, -9, -2, side * 1, -2, -2, C.enji);
    // 足袋と草履
    v.box(side > 0 ? 1 : -2, -11, -1, side > 0 ? 2 : -1, -11, 2, C.gofun);
    v.box(side > 0 ? 1 : -2, -12, -1, side > 0 ? 2 : -1, -12, 3, C.kuri);
    const m = voxMesh(v, V16, [side > 0 ? 0 : -1, 0, -0.5]);
    return part(side > 0 ? 'legL' : 'legR', [0, 12 * V16, 0], m);
  };
  const legL = leg(1);
  const legR = leg(-1);
  body.add(legL, legR);

  // 胴（白衣）
  const tv = new Vox();
  tv.box(-4, 0, -2, 4, 6, 2, C.gofun);
  tv.box(-4, 0, -2, 4, 1, 2, C.beni); // 袴の腰紐
  tv.box(-4, 1, -2, 4, 1, 2, C.shu);
  // 襟（前で重なる赤い半襟）
  for (let y = 2; y <= 6; y++) {
    const w = 6 - y;
    tv.set(-w, y, 2, C.geppaku);
    tv.set(w, y, 2, C.geppaku);
  }
  tv.set(0, 5, 2, C.shu);
  tv.set(-1, 6, 2, C.shu);
  tv.set(1, 6, 2, C.shu);
  tv.box(-3, 7, -1, 3, 7, 1, SKIN); // 首
  const torsoMesh = voxMesh(tv, V16, [-0.5, 0, -0.5]);
  const torso = part('torso', [0, 12 * V16, 0], torsoMesh);
  body.add(torso);

  // 頭
  const hv = new Vox();
  hv.box(-4, 0, -3, 4, 7, 3, SKIN);
  // 髪：頭頂・後ろ・横
  hv.box(-5, 4, -4, 5, 8, 3, C.sumi);
  hv.box(-5, 0, -4, 5, 4, -2, C.sumi);
  hv.box(-5, 1, -2, -5, 4, 2, C.sumi);
  hv.box(5, 1, -2, 5, 4, 2, C.sumi);
  // 前髪（ぱっつん、ところどころ下がる）
  hv.box(-4, 6, 3, 4, 7, 4, C.sumi);
  hv.set(-3, 5, 4, C.sumi);
  hv.set(0, 5, 4, C.sumi);
  hv.set(3, 5, 4, C.sumi);
  hv.box(-5, 2, 3, -4, 6, 3, C.sumi);
  hv.box(4, 2, 3, 5, 6, 3, C.sumi);
  // 目と頬
  hv.box(-2, 3, 3, -2, 4, 3, C.sumi);
  hv.box(2, 3, 3, 2, 4, 3, C.sumi);
  hv.set(-3, 2, 3, C.sakura);
  hv.set(3, 2, 3, C.sakura);
  hv.set(0, 1, 3, '#d9a98e');
  // 後ろ髪のつや（濃い藍の帯）
  for (let x = -4; x <= 4; x++) if ((x + 9) % 3 !== 0) hv.set(x, 6, -4, C.koiai);
  hv.set(-5, 5, -3, C.koiai);
  hv.set(5, 5, -3, C.koiai);
  // 一つ結び：赤い紐の蝶結びと、背中へ垂れる髪
  hv.box(-3, 5, -5, -1, 6, -5, C.shu);
  hv.box(1, 5, -5, 3, 6, -5, C.shu);
  hv.set(0, 5, -5, C.beni);
  hv.set(0, 6, -5, C.beni);
  hv.box(-1, -9, -5, 1, 4, -5, C.sumi);
  hv.box(-1, -6, -6, 1, 3, -6, C.sumi);
  hv.box(-2, -9, -5, 2, -8, -5, C.sumi);
  for (let y = -9; y <= 3; y += 3) hv.set(0, y, -6, C.koiai);
  // 丈長（白い紙の飾り）：細い 2 本が紐から垂れる
  hv.box(-2, 1, -6, -2, 5, -6, C.gofun);
  hv.box(2, 1, -6, 2, 5, -6, C.gofun);
  hv.set(-2, 0, -6, C.geppaku);
  hv.set(2, 0, -6, C.geppaku);
  // 髪飾りの金の鈴
  hv.box(5, 6, 0, 6, 7, 1, C.ukon);
  hv.set(6, 5, 1, C.kin);
  const headMesh = voxMesh(hv, V16, [-0.5, 0, -0.5]);
  const head = part('head', [0, 8 * V16, 0], headMesh);
  torso.add(head);

  // 腕（広い袖）：肩を軸に
  const arm = (side: number) => {
    const v = new Vox();
    v.box(0, -6, -2, 2 * side, 0, 2, C.gofun);
    v.box(0, -8, -2, 2 * side, -6, 4, C.gofun); // 垂れる袖
    v.box(side > 0 ? 0 : -2, -8, -2, side > 0 ? 2 : 0, -8, 4, C.geppaku);
    v.box(side * 1, -7, 3, side * 1, -6, 4, SKIN); // 手
    const m = voxMesh(v, V16, [side > 0 ? 0 : -1, 0, -0.5]);
    return part(side > 0 ? 'armL' : 'armR', [side * 4.6 * V16, 6 * V16, 0], m);
  };
  const armL = arm(1);
  const armR = arm(-1);
  torso.add(armL, armR);

  // 扇（右手）：閉じた扇と開いた扇
  const fc = new Vox();
  fc.box(0, -1, 0, 0, 3, 0, C.shu);
  fc.set(0, 4, 0, C.kin);
  const fanClosed = voxMesh(fc, V16, [0, 0, 0]);
  const fo = new Vox();
  for (let a = 0; a <= 10; a++) {
    const ang = (-75 + a * 15) * (Math.PI / 180);
    for (let r = 1; r <= 7; r++) {
      const x = Math.round(Math.sin(ang) * r);
      const y = Math.round(Math.cos(ang) * r);
      fo.set(x, y, 0, r <= 2 ? C.kuri : r === 7 ? C.kin : a % 2 ? C.shu : C.beni);
    }
  }
  fo.box(-2, 3, 0, 2, 4, 0, C.ukon); // 日の丸に見えない程度の金の弧
  const fanOpen = voxMesh(fo, V16, [0, 0, 0]);
  fanOpen.visible = false;
  const fanHolder = new THREE.Group();
  fanHolder.position.set(-1 * V16, -7 * V16, 4 * V16);
  fanHolder.add(fanClosed, fanOpen);
  armR.add(fanHolder);

  // 提灯（左手）
  const lv = new Vox();
  lv.box(0, 0, 0, 0, 3, 0, C.kuri); // 柄
  const lb = new Vox();
  lb.box(-1, -4, -1, 1, -1, 1, C.gofun);
  lb.box(-1, -1, -1, 1, -1, 1, C.sumi);
  lb.box(-1, -5, -1, 1, -5, 1, C.sumi);
  const lanternBody = voxMesh(lb, V16, [0, 0, 0]);
  const lg = new Vox();
  lg.box(-1, -4, -1, 1, -2, 1, '#ffd27a');
  const lanternGlow = voxMesh(lg, V16 * 1.02, [0, 0, 0], 'glow');
  lanternGlow.visible = false;
  const lantern = part('lantern', [1 * V16, -7 * V16, 4 * V16], voxMesh(lv, V16, [0, 0, 0]), lanternBody, lanternGlow);
  lantern.visible = false;
  armL.add(lantern);

  // 払の軌跡（扇の弧）：発光の扇形
  const trailGeo = new THREE.RingGeometry(1.25, 1.62, 14, 1, -Math.PI * 0.62, Math.PI * 1.24);
  trailGeo.rotateX(-Math.PI / 2);
  trailGeo.rotateY(Math.PI / 2);
  const trailMat = new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.position.y = 0.9;
  trail.renderOrder = 5;
  root.add(trail);

  return { root, body, legL, legR, torso, head, armL, armR, fanClosed, fanOpen, lantern, lanternGlow, trail };
}
