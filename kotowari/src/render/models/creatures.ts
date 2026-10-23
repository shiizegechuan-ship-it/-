import * as THREE from 'three';
import type { EnemyType } from '../../core/levels/types';
import { GLOW, PALETTE as C } from '../palette';
import { Vox } from '../voxel';
import { V16, part, voxMesh } from './common';

export interface CreatureRig {
  root: THREE.Group;
  body: THREE.Group;
  /** 予兆で光る部分（目など） */
  eyes: THREE.Object3D;
  armL?: THREE.Group;
  armR?: THREE.Group;
  /** 被弾の白い光 */
  flash: THREE.Mesh[];
}

const flashable = (root: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.castShadow) out.push(o);
  });
  return out;
};

/** 祭りの面。variant 0 狐・1 おかめ・2 ひょっとこ・3 鬼 */
function maskVox(variant: number): Vox {
  const m = new Vox();
  switch (variant) {
    case 0: // 狐面：白に朱の隈取、尖った耳
      m.ellipsoid(0, 0, 0, 4.2, 5.0, 1.6, C.gofun);
      m.box(-4, 5, 0, -3, 8, 1, C.gofun);
      m.box(3, 5, 0, 4, 8, 1, C.gofun);
      m.box(-4, 6, 1, -4, 7, 1, C.shu);
      m.box(4, 6, 1, 4, 7, 1, C.shu);
      m.box(-1, -4, 1, 1, -2, 3, C.gofun); // 鼻先
      m.set(0, -2, 3, C.sumi);
      m.box(-3, 2, 1, -1, 2, 2, C.shu);
      m.box(1, 2, 1, 3, 2, 2, C.shu);
      m.box(-3, 4, 1, -2, 4, 2, C.kin);
      m.box(2, 4, 1, 3, 4, 2, C.kin);
      break;
    case 1: // おかめ：丸い白、赤い頬、小さな口、高い眉
      m.ellipsoid(0, 0, 0, 4.6, 5.0, 1.7, C.gofun);
      m.box(-3, 4, 1, -2, 4, 2, C.sumi);
      m.box(2, 4, 1, 3, 4, 2, C.sumi);
      m.box(-3, -1, 1, -2, 0, 2, C.sakura);
      m.box(2, -1, 1, 3, 0, 2, C.sakura);
      m.set(0, -3, 2, C.beni);
      m.box(-4, 5, -1, 4, 6, 0, C.sumi); // 髪の生え際
      break;
    case 2: // ひょっとこ：土色の顔、尖らせた口、片目が小さい
      m.ellipsoid(0, 0, 0, 4.0, 5.0, 1.6, C.suna);
      m.box(-1, -3, 1, 1, -2, 4, C.suna);
      m.set(0, -2, 4, C.kuri);
      m.box(-3, 2, 1, -1, 2, 2, C.sumi);
      m.set(2, 2, 2, C.sumi);
      m.box(-4, 4, 1, 4, 4, 1, C.kuri);
      m.box(-4, 5, -1, 4, 6, 0, C.ai); // 手ぬぐい
      break;
    default: // 鬼：朱の顔、角、金の目
      m.ellipsoid(0, 0, 0, 4.4, 5.0, 1.7, C.shu);
      m.box(-4, 5, 0, -3, 8, 0, C.ukon);
      m.box(3, 5, 0, 4, 8, 0, C.ukon);
      m.box(-3, 2, 1, -1, 3, 2, C.kin);
      m.box(1, 2, 1, 3, 3, 2, C.kin);
      m.box(-3, -3, 1, 3, -3, 2, C.gofun); // 牙の並び
      m.box(-2, -2, 1, 2, -2, 2, C.enji);
      break;
  }
  return m;
}

/** 面の妖：祭りの面と、ぼろ布の体。足は無く、少し浮いている */
function menyo(variant = 0): CreatureRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const cloth = new Vox();
  for (let y = 0; y <= 14; y++) {
    const r = 2.5 + (14 - y) * 0.28;
    cloth.cylinder(0, 0, y, y, r, (x, yy, z) => {
      // 裾はぎざぎざ
      if (yy < 2 && ((x * 7 + z * 3) & 3) === 0) return null;
      return (x + z + yy) % 5 === 0 ? C.murasaki : C.sumi;
    });
  }
  // 肩の布
  cloth.box(-5, 11, -2, 5, 13, 2, C.sumi);
  const clothMesh = voxMesh(cloth, V16, [0, 2, 0]);
  body.add(clothMesh);
  // 面（祭りの面 4 種：狐・おかめ・ひょっとこ・鬼）
  const mask = maskVox(variant);
  const maskMesh = voxMesh(mask, V16, [0, 0, 0]);
  const head = part('head', [0, 21 * V16, 1 * V16], maskMesh);
  body.add(head);
  // 目（穴）：ふだんは暗く、予兆で赤く光る
  const ev = new Vox();
  ev.box(-3, 3, 2, -2, 3, 2, '#ffffff');
  ev.box(2, 3, 2, 3, 3, 2, '#ffffff');
  const eyes = voxMesh(ev, V16, [0, 0, 0.6], 'glow');
  eyes.material = (eyes.material as THREE.MeshBasicMaterial).clone();
  head.add(eyes);
  // 布の腕
  const arm = (s: number) => {
    const v = new Vox();
    v.box(0, -8, -1, s, 0, 1, C.sumi);
    v.box(0, -9, -1, s, -9, 1, C.murasaki);
    return part(s > 0 ? 'armL' : 'armR', [s * 5 * V16, 13 * V16, 0], voxMesh(v, V16, [s > 0 ? 0 : -1, 0, -0.5]));
  };
  const armL = arm(1);
  const armR = arm(-1);
  body.add(armL, armR);
  return { root, body, eyes, armL, armR, flash: flashable(root) };
}

/** 石坊主：苔むした丸い石の僧。重く遅い。地を叩く */
function ishibozu(): CreatureRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const v = new Vox();
  v.ellipsoid(0, 9, 0, 8, 9, 7, (x, y, z) => {
    if (y > 15 && (x * 3 + z * 5) % 4 === 0) return C.koke;
    return (x * 7 + y * 3 + z * 5) % 9 === 0 ? C.nezumi : (x + y) % 7 === 0 ? '#7a7682' : C.hai;
  });
  // 顔（彫り）
  v.box(-4, 12, 6, -2, 12, 7, C.kachi);
  v.box(2, 12, 6, 4, 12, 7, C.kachi);
  v.box(-2, 8, 7, 2, 8, 7, C.kachi);
  // 数珠
  for (let a = 0; a < 18; a++) {
    const ang = (a / 18) * Math.PI * 2;
    const x = Math.round(Math.sin(ang) * 7.5);
    const z = Math.round(Math.cos(ang) * 6.5);
    v.set(x, 5 + (a % 2), z, a % 6 === 0 ? C.shu : C.kuri);
  }
  // 前掛け（赤）
  v.box(-4, 3, 6, 4, 6, 7, C.beni);
  body.add(voxMesh(v, V16, [0, 0, 0]));
  const ev = new Vox();
  ev.box(-4, 13, 7, -2, 13, 7, '#ffffff');
  ev.box(2, 13, 7, 4, 13, 7, '#ffffff');
  const eyes = voxMesh(ev, V16, [0, 0, 0], 'glow');
  eyes.material = (eyes.material as THREE.MeshBasicMaterial).clone();
  body.add(eyes);
  const arm = (s: number) => {
    const a = new Vox();
    a.box(0, -7, -2, 3 * s, 0, 2, C.hai);
    a.box(0, -9, -2, 3 * s, -8, 3, C.nezumi);
    return part(s > 0 ? 'armL' : 'armR', [s * 8 * V16, 12 * V16, 0], voxMesh(a, V16, [s > 0 ? 0 : -1, 0, -0.5]));
  };
  const armL = arm(1);
  const armR = arm(-1);
  body.add(armL, armR);
  return { root, body, eyes, armL, armR, flash: flashable(root) };
}

/** 紙の面：藁の棒に紙の面（稽古の的） */
function kamimen(): CreatureRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const v = new Vox();
  v.box(0, 0, 0, 0, 16, 0, C.kuchiba);
  v.box(-1, 0, -1, 1, 1, 1, C.kuri);
  v.box(-4, 12, -1, 4, 13, 0, C.suna); // 横木の藁
  v.ellipsoid(0, 19, 1, 3.5, 4.2, 0.8, C.gofun);
  v.box(-2, 20, 2, -1, 20, 2, C.sumi);
  v.box(1, 20, 2, 2, 20, 2, C.sumi);
  v.box(-1, 17, 2, 1, 17, 2, C.shu);
  body.add(voxMesh(v, V16, [-0.5, 0, -0.5]));
  const eyes = new THREE.Group();
  return { root, body, eyes, flash: flashable(root) };
}

/** 鎧面：鉄の面頬と兜、黒漆の札（さね）の鎧。扇が効かない。風で流される */
function yoroimen(): CreatureRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const v = new Vox();
  // 草摺（腰の板）と胴
  for (let y = 0; y <= 6; y++) v.cylinder(0, 0, y, y, 4.5 + (6 - y) * 0.25, (x, yy, z) => ((yy % 2 === 0) ? C.sumi : (x + z) % 3 === 0 ? C.beni : '#2a2234'));
  v.box(-5, 7, -3, 5, 15, 3, (x, y) => (y % 2 === 0 ? C.sumi : x % 3 === 0 ? C.kin : '#2a2234'));
  // 大袖（肩）
  v.box(-8, 10, -3, -6, 15, 3, (_x, y) => (y % 2 ? C.beni : C.sumi));
  v.box(6, 10, -3, 8, 15, 3, (_x, y) => (y % 2 ? C.beni : C.sumi));
  body.add(voxMesh(v, V16, [-0.5, 0, -0.5]));
  // 兜と面頬
  const h = new Vox();
  h.box(-4, 0, -3, 4, 5, 3, '#4a4752'); // 面頬（鉄）
  h.box(-3, 1, 3, 3, 1, 3, C.sumi); // 口の隙間
  h.box(-2, 0, 3, 2, 0, 3, C.gofun); // 歯
  h.box(-1, 2, 3, 1, 3, 4, '#4a4752'); // 鼻
  h.box(-5, 5, -4, 5, 7, 4, C.sumi); // 鉢
  h.box(-6, 5, -4, -5, 6, 3, C.sumi); // 吹返し
  h.box(5, 5, -4, 6, 6, 3, C.sumi);
  // 鍬形（金の角）
  for (let i = 0; i <= 5; i++) {
    h.set(-2 - Math.round(i * 0.6), 8 + i, 3, C.ukon);
    h.set(2 + Math.round(i * 0.6), 8 + i, 3, C.ukon);
  }
  h.box(-1, 7, 3, 1, 8, 4, C.kin);
  const head = part('head', [0, 16 * V16, 0], voxMesh(h, V16, [-0.5, 0, -0.5]));
  body.add(head);
  const ev = new Vox();
  ev.box(-3, 4, 3, -2, 4, 3, '#ffffff');
  ev.box(2, 4, 3, 3, 4, 3, '#ffffff');
  const eyes = voxMesh(ev, V16, [-0.5, 0, -0.4], 'glow');
  eyes.material = (eyes.material as THREE.MeshBasicMaterial).clone();
  head.add(eyes);
  const arm = (s: number) => {
    const a = new Vox();
    a.box(0, -7, -1, 2 * s, 0, 1, C.sumi);
    a.box(0, -9, -1, 2 * s, -8, 1, '#4a4752');
    // 薙刀の柄（右手）
    if (s < 0) a.box(-1, -9, -8, -1, -9, 10, C.kuri);
    if (s < 0) a.box(-1, -9, 11, -1, -9, 14, C.ginnezu);
    return part(s > 0 ? 'armL' : 'armR', [s * 6 * V16, 14 * V16, 0], voxMesh(a, V16, [s > 0 ? 0 : -1, 0, -0.5]));
  };
  const armL = arm(1);
  const armR = arm(-1);
  body.add(armL, armR);
  root.scale.setScalar(1.05);
  return { root, body, eyes, armL, armR, flash: flashable(root) };
}

/** 同じ id なら同じ見た目（面の種類） */
const variantOf = (id: string, n: number): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % n;
};

export function buildCreature(type: EnemyType, id = ''): CreatureRig {
  switch (type) {
    case 'menyo':
      return menyo(variantOf(id, 4));
    case 'ishibozu':
      return ishibozu();
    case 'kamimen':
      return kamimen();
    case 'yoroimen':
      return yoroimen();
    default:
      return menyo();
  }
}

/** おこん：狐の質屋。紫の着物に金の帯、大きな尾。狐火を連れている */
export interface OkonRig {
  root: THREE.Group;
  tail: THREE.Group;
  head: THREE.Group;
  fires: THREE.Mesh[];
}
export function buildOkon(): OkonRig {
  const root = new THREE.Group();
  const kv = new Vox();
  // 着物（裾広がり）
  for (let y = 0; y <= 12; y++) kv.cylinder(0, 0, y, y, 4.5 - y * 0.12, (x, yy, z) => (yy === 6 || yy === 7 ? C.kin : (x + z) % 6 === 0 && yy < 5 ? C.fuji : C.murasaki));
  kv.box(-4, 9, -2, 4, 12, 2, C.murasaki);
  kv.box(-1, 9, 2, 1, 12, 3, C.gofun); // 襟
  // 袖
  kv.box(-7, 5, -2, -4, 11, 3, C.murasaki);
  kv.box(4, 5, -2, 7, 11, 3, C.murasaki);
  kv.box(-6, 6, 3, -5, 7, 4, C.gofun); // 手（白い毛）
  kv.box(5, 6, 3, 6, 7, 4, C.gofun);
  // 帳面（右手）
  kv.box(5, 6, 4, 8, 9, 5, C.suna);
  kv.box(5, 9, 4, 8, 9, 5, C.kuri);
  const kimono = voxMesh(kv, V16, [-0.5, 0, -0.5]);
  root.add(kimono);
  // 頭
  const hv = new Vox();
  hv.ellipsoid(0, 3, 0, 4, 3.5, 3.5, C.gofun);
  hv.box(-1, 1, 3, 1, 3, 6, C.gofun); // 鼻先
  hv.set(0, 2, 7, C.sumi);
  hv.box(-3, 4, 3, -2, 4, 3, C.sumi); // 細い目
  hv.box(2, 4, 3, 3, 4, 3, C.sumi);
  hv.box(-3, 5, 3, -2, 5, 3, C.shu); // 隈取
  hv.box(2, 5, 3, 3, 5, 3, C.shu);
  // 耳
  hv.box(-4, 6, -1, -2, 9, 1, C.kaki);
  hv.box(2, 6, -1, 4, 9, 1, C.kaki);
  hv.set(-3, 10, 0, C.sumi);
  hv.set(3, 10, 0, C.sumi);
  hv.box(-3, 7, 1, -3, 8, 1, C.sakura);
  hv.box(3, 7, 1, 3, 8, 1, C.sakura);
  const head = part('head', [0, 13 * V16, 0], voxMesh(hv, V16, [-0.5, 0, -0.5]));
  root.add(head);
  // 尾
  const tv = new Vox();
  for (let i = 0; i <= 12; i++) {
    const y = Math.round(Math.sin(i / 4) * 3 + i * 0.6);
    const z = -i;
    const r = 2.2 + Math.sin((i / 12) * Math.PI) * 1.6;
    tv.ellipsoid(0, y, z, r, r, 1.2, i > 9 ? C.gofun : C.kaki);
  }
  const tail = part('tail', [0, 3 * V16, -3 * V16], voxMesh(tv, V16, [0, 0, 0]));
  root.add(tail);
  // 狐火
  const fires: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const f = new Vox();
    f.ellipsoid(0, 0, 0, 1.5, 2.2, 1.5, GLOW.foxfire);
    f.set(0, 3, 0, GLOW.foxfire);
    const m = voxMesh(f, V16, [0, 0, 0], 'glow', 0);
    fires.push(m);
    root.add(m);
  }
  root.scale.setScalar(1.15);
  return { root, tail, head, fires };
}
