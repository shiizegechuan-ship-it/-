import * as THREE from 'three';
import type { PropDef } from '../../core/levels/types';
import { PALETTE as C } from '../palette';
import { Vox, hash3 } from '../voxel';
import { V16, V8, voxMesh } from './common';

export interface PropBuild {
  obj: THREE.Object3D;
  /** 灯の火（点光源を置く位置。ローカル） */
  lights: THREE.Vector3[];
  /** 揺らめかせる火の部分 */
  flames: THREE.Object3D[];
}

const cache = new Map<string, () => PropBuild>();

function build(kind: string, variant: number): PropBuild {
  switch (kind) {
    case 'torii':
      return torii(variant);
    case 'lantern':
      return stoneLantern(1);
    case 'bigLantern':
      return stoneLantern(3.4);
    case 'cedar':
      return cedar(variant);
    case 'stall':
      return stall(variant);
    case 'kaguraden':
      return kaguraden();
    case 'taiko':
      return taiko();
    case 'chochinLine':
      return chochinLine();
    case 'bell':
      return bell();
    case 'stele':
      return stele();
    case 'fan':
      return groundFan();
    case 'brokenBridge':
      return brokenBridge();
    case 'signpost':
      return signpost();
    case 'jizo':
      return jizo();
    case 'okonStall':
      return okonStall();
    case 'bamboo':
      return bamboo(variant);
    case 'kazaguruma':
      return kazaguruma();
    case 'yasuke':
      return yasuke();
    case 'machiya':
      return machiya(variant);
    case 'inn':
      return inn();
    case 'bigChochin':
      return bigChochin();
    case 'willow':
      return willow();
    case 'well':
      return well();
    default:
      return { obj: new THREE.Group(), lights: [], flames: [] };
  }
}

export function buildProp(p: PropDef): PropBuild {
  const key = p.kind + ':' + (p.variant ?? 0);
  let f = cache.get(key);
  if (!f) {
    const proto = build(p.kind, p.variant ?? 0);
    f = () => {
      const obj = proto.obj.clone(true);
      const flames: THREE.Object3D[] = [];
      obj.traverse((o) => {
        if (o.userData.flame) flames.push(o);
      });
      return { obj, lights: proto.lights.map((v) => v.clone()), flames };
    };
    cache.set(key, f);
  }
  const b = f();
  b.obj.position.set(p.x, p.y, p.z);
  b.obj.rotation.y = p.yaw ?? 0;
  b.obj.scale.setScalar(p.scale ?? 1);
  b.lights = b.lights.map((v) => v.multiplyScalar(p.scale ?? 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw ?? 0).add(new THREE.Vector3(p.x, p.y, p.z)));
  return b;
}

const flame = (v: Vox, size: number, origin: [number, number, number] = [0, 0, 0]): THREE.Mesh => {
  const m = voxMesh(v, size, origin, 'live', 0.12);
  m.userData.flame = true;
  return m;
};

/** 鳥居（朱）。柱は x = ±1.6m、高さ 3.4m。variant 1 は額つきの大鳥居 */
function torii(variant: number): PropBuild {
  const v = new Vox();
  const red = C.shu;
  const black = C.sumi;
  // 柱（1/8m 粒：x = ±13）
  for (const sx of [-13, 13]) {
    v.cylinder(sx, 0, 0, 26, 1.3, (x, y, z) => (y < 2 ? black : (x + y + z) % 11 === 0 ? C.beni : red));
    v.box(sx - 2, 0, -2, sx + 2, 1, 2, black); // 根巻き
  }
  // 貫
  v.box(-16, 20, -1, 16, 21, 1, red);
  // 島木と笠木（反り）
  for (let x = -19; x <= 19; x++) {
    const lift = Math.round((Math.abs(x) / 19) ** 2 * 2);
    v.box(x, 24 + lift, -1, x, 25 + lift, 1, red);
    v.box(x, 26 + lift, -2, x, 27 + lift, 2, black);
  }
  // 額束
  v.box(-1, 21, -1, 1, 24, 1, red);
  if (variant === 1) {
    v.box(-3, 21, 2, 3, 24, 2, C.kin);
    v.box(-2, 22, 2, 2, 23, 2, C.sumi);
  }
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V8, [-0.5, 0, -0.5]));
  return { obj, lights: [], flames: [] };
}

/** 石灯籠。scale 3.4 で大石灯籠 */
function stoneLantern(scale: number): PropBuild {
  const v = new Vox();
  const st = (x: number, y: number, z: number) => (hash3(x, y, z) < 0.15 ? C.koke : hash3(x + 1, y, z) < 0.3 ? C.nezumi : C.hai);
  v.box(-4, 0, -4, 4, 1, 4, st); // 基礎
  v.box(-3, 2, -3, 3, 2, 3, st);
  v.cylinder(0, 0, 3, 10, 1.6, st); // 竿
  v.box(-4, 11, -4, 4, 12, 4, st); // 中台
  // 火袋（窓）
  v.box(-3, 13, -3, 3, 17, 3, (x, y, z) => (Math.abs(x) <= 1 && (z === 3 || z === -3) && y >= 14 && y <= 16 ? null : Math.abs(z) <= 1 && (x === 3 || x === -3) && y >= 14 && y <= 16 ? null : st(x, y, z)));
  // 笠
  for (let i = 0; i <= 3; i++) v.box(-5 + i, 18 + i, -5 + i, 5 - i, 18 + i, 5 - i, st);
  v.box(-1, 22, -1, 1, 23, 1, st); // 宝珠
  const fv = new Vox();
  fv.box(-1, 14, -1, 1, 16, 1, '#ffb347');
  fv.set(0, 17, 0, '#ffe08a');
  const obj = new THREE.Group();
  const size = V16 * scale;
  obj.add(voxMesh(v, size, [-0.5, 0, -0.5]));
  obj.add(flame(fv, size, [-0.5, 0, -0.5]));
  return { obj, lights: [new THREE.Vector3(0, 15 * size, 0)], flames: [] };
}

/** 杉。幹と、段になった濃い緑の葉 */
function cedar(variant: number): PropBuild {
  const v = new Vox();
  const H = 52 + variant * 6;
  v.cylinder(0, 0, 0, H - 8, (y) => 2.2 - (y / H) * 1.2, (x, y, z) => ((x + z + y) % 4 === 0 ? C.kuri : C.hiwada));
  for (let k = 0; k < 6; k++) {
    const y0 = 16 + k * 7;
    const r0 = 11 - k * 1.6;
    for (let y = y0; y < y0 + 9; y++) {
      const r = r0 * (1 - (y - y0) / 10);
      v.cylinder(0, 0, y, y, r, (x, yy, z) => {
        const h = hash3(x, yy, z);
        if (h < 0.08) return null;
        return h < 0.3 ? C.matsuba : h < 0.85 ? C.tokiwa : C.koke;
      });
    }
  }
  v.cylinder(0, 0, H - 6, H, (y) => (H - y) * 0.4, C.tokiwa);
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V8, [-0.5, 0, -0.5], 'toon', 0.08));
  return { obj, lights: [], flames: [] };
}

/** 屋台（紅白の幕） */
function stall(variant: number): PropBuild {
  const v = new Vox();
  const cloth = variant === 1 ? C.ai : variant === 2 ? C.matsuba : C.beni;
  v.box(-12, 0, -6, 12, 6, 6, C.hiwada); // 台
  v.box(-12, 7, -6, 12, 7, 6, C.kuri);
  for (const x of [-12, 12]) for (const z of [-6, 6]) v.box(x, 0, z, x, 20, z, C.kuri);
  // 幕（縦縞）
  v.box(-12, 14, 6, 12, 18, 6, (x) => ((x >> 1) % 2 ? cloth : C.gofun));
  // 屋根
  for (let i = 0; i <= 4; i++) v.box(-13, 20 + i, -7 + i * 1.5, 13, 20 + i, 7 - i * 1.5, C.kuri);
  // 品物（面・飴）
  for (let i = -9; i <= 9; i += 4) {
    v.ellipsoid(i, 9, 3, 1.4, 1.6, 0.6, i % 8 === 1 ? C.shu : C.gofun);
  }
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V16, [-0.5, 0, -0.5]));
  const fv = new Vox();
  fv.box(-1, 0, -1, 1, 2, 1, '#ff9a5a');
  const lamp = flame(fv, V16, [-0.5, 18, 5]);
  obj.add(lamp);
  return { obj, lights: [new THREE.Vector3(0, 1.3, 0.4)], flames: [] };
}

/** 神楽殿：舞台（高さ 1m・x -5..5・z -3..5、原点は舞台面の中心）の四隅の柱と入母屋の屋根 */
function kaguraden(): PropBuild {
  const v = new Vox();
  const W = 40; // 半幅 5m（1/8）
  const zb = -32;
  const zf = 32;
  for (const x of [-W + 2, W - 2])
    for (const z of [zb + 2, zf - 2]) {
      v.cylinder(x, z, 0, 30, 1.3, (_x, y) => (y % 9 === 0 ? C.kuri : C.shu));
    }
  // 長押
  v.box(-W, 28, zb, W, 29, zb + 1, C.shu);
  v.box(-W, 28, zf - 1, W, 29, zf, C.shu);
  v.box(-W, 28, zb, -W + 1, 29, zf, C.shu);
  v.box(W - 1, 28, zb, W, 29, zf, C.shu);
  // 欄干（舞台の縁）
  for (let x = -W; x <= W; x++) {
    if (Math.abs(x) <= 12) continue; // 前の階段の所はあける
    v.set(x, 3, zf - 1, C.shu);
    if (x % 6 === 0) v.box(x, 0, zf - 1, x, 3, zf - 1, C.shu);
  }
  for (let z = zb; z <= zf; z++) {
    v.set(-W, 3, z, C.shu);
    v.set(W, 3, z, C.shu);
    if (z % 6 === 0) {
      v.box(-W, 0, z, -W, 3, z, C.shu);
      v.box(W, 0, z, W, 3, z, C.shu);
    }
  }
  // 屋根（入母屋風：段々に狭まる檜皮葺き）
  for (let i = 0; i <= 12; i++) {
    const y = 31 + i;
    const hx = W + 6 - i * 2.2;
    const hz = 38 - i * 1.4;
    if (hx < 2) break;
    v.box(Math.round(-hx), y, Math.round(-hz), Math.round(hx), y, Math.round(hz), (x, _y, z) =>
      Math.abs(x) >= Math.round(hx) - 1 || Math.abs(z) >= Math.round(hz) - 1 ? C.kuri : (x + z) % 3 === 0 ? C.hiwada : '#6c4430',
    );
  }
  // 棟と鬼瓦
  v.box(-14, 44, -1, 14, 45, 1, C.sumi);
  v.box(-15, 43, -2, -13, 47, 2, C.sumi);
  v.box(13, 43, -2, 15, 47, 2, C.sumi);
  // 注連縄
  for (let x = -W + 3; x <= W - 3; x++) {
    const sag = Math.round(Math.sin(((x + W) / (2 * W)) * Math.PI) * 2);
    v.set(x, 27 - sag, zf, C.suna);
    if ((x + 40) % 10 === 0) v.box(x, 23 - sag, zf, x, 26 - sag, zf, C.gofun); // 紙垂
  }
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V8, [-0.5, 0, -0.5]));
  return { obj, lights: [], flames: [] };
}

function taiko(): PropBuild {
  const v = new Vox();
  v.box(-6, 0, -3, 6, 1, 3, C.kuri);
  v.box(-6, 0, -3, -5, 8, -2, C.kuri);
  v.box(5, 0, -3, 6, 8, -2, C.kuri);
  v.box(-6, 0, 2, -5, 8, 3, C.kuri);
  v.box(5, 0, 2, 6, 8, 3, C.kuri);
  // 胴（x 方向の円柱）
  for (let x = -4; x <= 4; x++)
    for (let y = -6; y <= 6; y++)
      for (let z = -6; z <= 6; z++) {
        const rr = y * y + z * z;
        const r = 6 - Math.abs(x) * 0.25;
        if (rr <= r * r) v.set(x, y + 11, z, Math.abs(x) >= 4 ? (rr < 16 ? C.gofun : C.suna) : x % 2 === 0 && rr > (r - 1) ** 2 ? C.kin : C.beni);
      }
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V16, [-0.5, 0, -0.5]));
  return { obj, lights: [], flames: [] };
}

/** 提灯の連なり（x -10..10） */
function chochinLine(): PropBuild {
  const v = new Vox();
  const g = new Vox();
  for (let x = -80; x <= 80; x++) {
    const sag = Math.round(Math.sin(((x + 80) / 160) * Math.PI) * 6);
    v.set(x, -sag, 0, C.sumi);
    if ((x + 80) % 16 === 8) {
      for (let y = -sag - 6; y <= -sag - 1; y++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        const edge = y === -sag - 6 || y === -sag - 1;
        if (edge) v.set(x + dx, y, dz, C.sumi);
        else g.set(x + dx, y, dz, ((x + 80) / 16) % 2 ? '#ff6a4a' : '#fff0c8');
      }
    }
  }
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V16, [-0.5, 0, -0.5]));
  obj.add(flame(g, V16, [-0.5, 0, -0.5]));
  return { obj, lights: [new THREE.Vector3(0, -0.6, 0)], flames: [] };
}

function bell(): PropBuild {
  const v = new Vox();
  // 鐘楼の枠
  for (const x of [-10, 10]) v.box(x, 0, -1, x + 1, 30, 1, C.kuri);
  v.box(-12, 30, -2, 13, 32, 2, C.kuri);
  for (let i = 0; i < 4; i++) v.box(-13 + i, 33 + i, -4 + i, 14 - i, 33 + i, 4 - i, C.sumi);
  // 梵鐘
  for (let y = 10; y <= 26; y++) {
    const r = 5 + (26 - y) * 0.12 + (y < 12 ? 0.6 : 0);
    v.cylinder(0, 0, y, y, r, (x, yy, z) => ((yy === 18 || yy === 22) && (x + z) % 2 === 0 ? C.kin : (x * 3 + z) % 7 === 0 ? C.tokiwa : C.koke));
  }
  v.box(-1, 27, -1, 1, 29, 1, C.koke);
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V16, [-0.5, 0, -0.5]));
  return { obj, lights: [], flames: [] };
}

function stele(): PropBuild {
  const v = new Vox();
  v.box(-6, 0, -3, 6, 2, 3, C.nezumi);
  v.box(-4, 3, -1, 4, 18, 1, (x, y, z) => (hash3(x, y, z) < 0.12 ? C.koke : C.hai));
  for (let y = 5; y <= 16; y += 2) for (let x = -2; x <= 2; x++) if (hash3(x, y, 9) < 0.6) v.set(x, y, 2, C.kachi);
  v.box(-6, 0, -3, 6, 1, 3, C.koke); // 足元の苔（読めない）
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V16, [-0.5, 0, -0.5]));
  return { obj, lights: [], flames: [] };
}

function groundFan(): PropBuild {
  const v = new Vox();
  for (let a = 0; a <= 8; a++) {
    const ang = (-60 + a * 15) * (Math.PI / 180);
    for (let r = 1; r <= 5; r++) v.set(Math.round(Math.sin(ang) * r), 0, Math.round(Math.cos(ang) * r), r === 5 ? C.kin : a % 2 ? C.gofun : C.byakugun);
  }
  const obj = new THREE.Group();
  const m = voxMesh(v, V16, [0, 0, 0], 'glow');
  obj.add(m);
  return { obj, lights: [], flames: [] };
}

function brokenBridge(): PropBuild {
  const v = new Vox();
  for (let z = 0; z <= 14; z++) {
    const len = 14 - (z % 3) * 3;
    for (let x = -14; x <= 14; x += 4) if (z <= len - Math.abs(x) * 0.3) v.box(x, -1, z, x + 2, 0, z, C.hiwada);
  }
  v.box(-16, -14, 0, -15, 6, 1, C.kuri);
  v.box(15, -14, 0, 16, 6, 1, C.kuri);
  // 垂れた綱
  for (let i = 0; i < 18; i++) v.set(-15, 6 - i, 1 + Math.round(i * 0.3), C.suna);
  for (let i = 0; i < 12; i++) v.set(15, 6 - i, 1 + Math.round(i * 0.4), C.suna);
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V16, [-0.5, 0, 0]));
  return { obj, lights: [], flames: [] };
}

function signpost(): PropBuild {
  const v = new Vox();
  v.box(0, 0, 0, 1, 18, 1, C.kuri);
  v.box(-5, 12, 2, 6, 17, 2, C.kuchiba);
  for (let y = 13; y <= 16; y++) for (let x = -3; x <= 4; x += 2) if (hash3(x, y, 2) < 0.6) v.set(x, y, 3, C.sumi);
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V16, [-0.5, 0, -0.5]));
  return { obj, lights: [], flames: [] };
}

function jizo(): PropBuild {
  const v = new Vox();
  v.box(-4, 0, -4, 4, 2, 4, C.nezumi);
  v.ellipsoid(0, 8, 0, 4, 6, 3.5, C.hai);
  v.ellipsoid(0, 15, 0, 3.2, 3.4, 3.2, C.hai);
  v.box(-3, 8, 3, 3, 11, 4, C.beni); // 前掛け
  v.box(-2, 15, 3, -1, 15, 3, C.kachi);
  v.box(1, 15, 3, 2, 15, 3, C.kachi);
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V16, [-0.5, 0, -0.5]));
  return { obj, lights: [], flames: [] };
}

/** おこんの小さな質屋の台（鳥居のそば） */
function okonStall(): PropBuild {
  const v = new Vox();
  v.box(-8, 0, -4, 8, 8, 4, C.kuri);
  v.box(-9, 8, -5, 9, 9, 5, C.hiwada);
  // 暖簾（稲荷の宝珠の紋：玉ねぎ形の珠に炎の先）
  v.box(-8, 13, 5, 8, 22, 5, (x) => (x % 4 === 0 ? null : C.ai));
  const jewel: [number, number][] = [[0, 21], [0, 20], [-1, 19], [1, 19], [-2, 18], [2, 18], [-2, 17], [2, 17], [-2, 16], [2, 16], [-1, 15], [1, 15], [0, 15]];
  for (const [x, y] of jewel) v.set(x, y, 6, C.gofun);
  v.set(1, 21, 6, C.gofun);
  v.box(-1, 16, 6, 1, 18, 6, C.ukon);
  for (const x of [-9, 9]) v.box(x, 0, 5, x, 24, 5, C.kuri);
  v.box(-10, 24, 4, 10, 25, 6, C.kuri);
  // 算盤と帳面
  v.box(-6, 9, -2, -1, 9, 1, C.kuri);
  for (let x = -6; x <= -1; x++) v.set(x, 10, 0, C.sumi);
  v.box(2, 9, -2, 6, 10, 1, C.suna);
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V16, [-0.5, 0, -0.5]));
  const fv = new Vox();
  fv.ellipsoid(0, 0, 0, 1.5, 2.0, 1.5, '#7ff7ff');
  const ff = flame(fv, V16, [8, 26, 5]);
  obj.add(ff);
  return { obj, lights: [new THREE.Vector3(0.5, 1.6, 0.3)], flames: [] };
}

/** 竹の群れ：細い幹が数本、上の方に葉。風でしなる（userData.anim = 'sway'） */
function bamboo(variant: number): PropBuild {
  const v = new Vox();
  const stalks: [number, number, number][] = [
    [0, 0, 64],
    [5, 3, 58],
    [-4, 4, 70],
    [3, -5, 52],
    [-5, -3, 61],
  ];
  stalks.slice(0, 3 + variant).forEach(([sx, sz, H], i) => {
    for (let y = 0; y <= H; y++) {
      const lean = Math.round((y / H) ** 2 * (i % 2 ? 3 : -2));
      const c = y % 12 === 0 ? C.koke : (sx + y) % 7 === 0 ? C.matsuba : C.wakatake;
      v.box(sx + lean, y, sz, sx + lean + 1, y, sz + 1, c);
      // 葉
      if (y > H * 0.55 && y % 6 === 3) {
        const dir = (y / 6 + i) % 4;
        const dx = dir === 0 ? 1 : dir === 1 ? -1 : 0;
        const dz = dir === 2 ? 1 : dir === 3 ? -1 : 0;
        for (let k = 1; k <= 6; k++) v.set(sx + lean + dx * k, y - Math.floor(k / 2), sz + dz * k, k > 4 ? C.tokiwa : C.matsuba);
      }
    }
  });
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V8 * 0.8, [-0.5, 0, -0.5], 'toon', 0.08));
  obj.userData.anim = 'sway';
  return { obj, lights: [], flames: [] };
}

/** 風車（大きな風車の櫓）。羽根は userData.anim = 'windmill' で回す */
function kazaguruma(): PropBuild {
  const v = new Vox();
  // 櫓
  for (const x of [-4, 4]) v.box(x, 0, -1, x + 1, 30, 0, C.kuri);
  for (let y = 4; y <= 28; y += 8) v.box(-4, y, -1, 5, y, 0, C.hiwada);
  v.box(-2, 30, -2, 3, 33, 1, C.kogecha); // 軸受け
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V8, [-0.5, 0, -0.5]));
  // 羽根（4 枚、紅白の紙）
  const b = new Vox();
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  dirs.forEach(([dx, dy], k) => {
    for (let r = 2; r <= 16; r++) {
      const w = r < 5 ? 0 : 2;
      for (let t = -w; t <= w; t++) {
        // 羽根は軸から片側へだけ広がる（風車らしい非対称）
        if (t < 0 && r >= 5) continue;
        const x = dx * r + -dy * t;
        const y = dy * r + dx * t;
        b.set(x, y, 0, r < 5 ? C.kuri : (r + k) % 2 ? C.shu : C.gofun);
      }
    }
  });
  b.box(-1, -1, 0, 1, 1, 1, C.kin);
  const blades = voxMesh(b, V8, [-0.5, -0.5, 0]);
  blades.position.set(0, 31.5 * V8, 0.25);
  blades.name = 'blades';
  obj.add(blades);
  obj.userData.anim = 'windmill';
  return { obj, lights: [], flames: [] };
}

/** 弥助：ひょっとこの面を頭に上げた里の少年 */
function yasuke(): PropBuild {
  const v = new Vox();
  const skin = '#f1d2b4';
  // 足と着物（藍に白い格子）
  v.box(-2, 0, -1, -1, 5, 1, C.kuri);
  v.box(1, 0, -1, 2, 5, 1, C.kuri);
  v.box(-3, 5, -2, 3, 12, 2, (x, y) => ((x + y) % 4 === 0 ? C.hanada : C.ai));
  v.box(-3, 8, -2, 3, 8, 2, C.kuchiba); // 帯
  v.box(-5, 7, -1, -4, 12, 1, C.ai);
  v.box(4, 7, -1, 5, 12, 1, C.ai);
  v.box(-5, 6, 0, -4, 6, 1, skin);
  v.box(4, 6, 0, 5, 6, 1, skin);
  // 頭
  v.box(-3, 13, -3, 3, 18, 3, skin);
  v.box(-3, 17, -3, 3, 19, 3, C.sumi);
  v.box(-3, 13, -3, 3, 16, -3, C.sumi);
  v.box(-2, 15, 3, -1, 15, 3, C.sumi);
  v.box(1, 15, 3, 2, 15, 3, C.sumi);
  v.set(0, 14, 3, '#d9a98e');
  // 頭に上げたひょっとこの面
  v.box(-2, 19, 0, 2, 22, 2, C.suna);
  v.box(-1, 20, 3, 0, 20, 3, C.sumi);
  v.box(0, 19, 3, 1, 19, 4, C.suna);
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V16, [-0.5, 0, -0.5]));
  obj.userData.anim = 'npc';
  return { obj, lights: [], flames: [] };
}

/** 町家の正面（原点は通りに面した壁の足元の中心、+z が通り側。幅 4m） */
function machiya(variant: number): PropBuild {
  const v = new Vox();
  const W = 16; // 半幅 2m（1/8）
  const wood = variant === 1 ? C.kuri : C.kogecha;
  // 1 階：格子と暖簾の入口
  v.box(-W, 0, -2, W, 22, 0, (x, y) => {
    if (y < 2) return C.nezumi;
    if (Math.abs(x) < 5 && y < 18) return y > 13 ? (Math.floor(x / 2) % 2 ? C.ai : C.gofun) : null; // 入口と暖簾
    return x % 2 === 0 ? wood : y % 6 === 0 ? wood : '#2a1c18';
  });
  // 入口の奥（暗い土間）
  v.box(-4, 2, -5, 4, 13, -5, C.yoru);
  // 庇
  for (let i = 0; i < 4; i++) v.box(-W - 1, 22 + i, 0 + i, W + 1, 22 + i, 4 - i, (x) => (x % 3 === 0 ? C.nezumi : '#3e3b49'));
  // 2 階：漆喰と虫籠窓
  v.box(-W, 26, -2, W, 40, -1, (x, y) => {
    const win = y >= 30 && y <= 36 && Math.abs(x) <= 10;
    if (win) return x % 3 === 0 ? C.kogecha : (variant === 2 ? '#ffcf7a' : C.yoru);
    return C.gofun;
  });
  // 屋根
  for (let i = 0; i < 5; i++) v.box(-W - 2, 40 + i, -2 - i, W + 2, 40 + i, 3 - i, (x) => (x % 3 === 0 ? C.nezumi : '#3e3b49'));
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V8, [-0.5, 0, 0]));
  // 軒の提灯
  const g = new Vox();
  g.box(-2, 0, -2, 2, 4, 2, variant === 0 ? '#ff6a4a' : '#fff0c8');
  const ch = flame(g, V8, [-8, 17, 4]);
  obj.add(ch);
  const k = new Vox();
  k.box(-2, 5, -2, 2, 5, 2, C.sumi);
  k.box(-2, -1, -2, 2, -1, 2, C.sumi);
  obj.add(voxMesh(k, V8, [-8, 17, 4]));
  return { obj, lights: [new THREE.Vector3(-0.75, 2.4, 0.75)], flames: [] };
}

/** 灯屋：二階建ての大きな宿。軒に巨大な提灯の看板、帳場の行灯 */
function inn(): PropBuild {
  const v = new Vox();
  const W = 64; // 半幅 8m（1/8）
  v.box(-W, 0, -4, W, 26, 0, (x, y) => {
    if (y < 2) return C.nezumi;
    if (Math.abs(x - 20) < 8 && y < 20) return null; // 帳場の間口
    return x % 3 === 0 ? C.kogecha : y % 8 === 0 ? C.kuri : '#2a1c18';
  });
  v.box(12, 2, -8, 28, 20, -8, C.kuri);
  v.box(13, 2, -7, 27, 3, -1, C.hiwada); // 上がり框
  for (let i = 0; i < 5; i++) v.box(-W - 2, 26 + i, i, W + 2, 26 + i, 6 - i, (x) => (x % 3 === 0 ? C.nezumi : '#3e3b49'));
  v.box(-W, 31, -4, W, 50, -3, (x, y) => (y >= 36 && y <= 44 && x % 12 !== 0 ? (x % 3 === 0 ? C.kogecha : '#ffcf7a') : C.gofun));
  for (let i = 0; i < 7; i++) v.box(-W - 3, 50 + i, -4 - i, W + 3, 50 + i, 4 - i, (x) => (x % 3 === 0 ? C.nezumi : '#3e3b49'));
  // 看板
  v.box(-14, 33, 1, 14, 37, 1, C.kuri);
  for (let x = -12; x <= 12; x += 3) v.box(x, 34, 2, x + 1, 36, 2, C.ukon);
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V8, [-0.5, 0, 0]));
  // 帳場の行灯と帳面
  const g = new Vox();
  g.box(-2, 0, -2, 2, 5, 2, '#ffd69a');
  obj.add(flame(g, V8, [14, 3, -6]));
  return { obj, lights: [new THREE.Vector3(1.75, 1.0, -0.6), new THREE.Vector3(-4, 3.2, 0.8)], flames: [] };
}

/** 大提灯（影を落とす目印。原点は提灯の中心） */
function bigChochin(): PropBuild {
  const v = new Vox();
  const g = new Vox();
  for (let y = -10; y <= 10; y++) {
    const r = Math.sqrt(Math.max(0, 1 - (y / 11) ** 2)) * 8;
    for (let x = -9; x <= 9; x++)
      for (let z = -9; z <= 9; z++) {
        const d = Math.hypot(x, z);
        if (d <= r && d > r - 1.2) {
          if (Math.abs(y) >= 9 || y % 4 === 0) v.set(x, y, z, C.sumi);
          else g.set(x, y, z, (x + y) % 9 === 0 ? '#ff6a4a' : '#ff9a5a');
        }
      }
  }
  v.box(-3, 11, -3, 3, 12, 3, C.sumi);
  v.box(-1, 13, -1, 1, 40, 1, C.sumi); // 吊り紐
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V8, [-0.5, -0.5, -0.5]));
  obj.add(flame(g, V8, [-0.5, -0.5, -0.5]));
  return { obj, lights: [new THREE.Vector3(0, 0, 0)], flames: [] };
}

function willow(): PropBuild {
  const v = new Vox();
  v.cylinder(0, 0, 0, 30, (y) => 1.6 - y * 0.02, C.kogecha);
  for (let a = 0; a < 26; a++) {
    const ang = (a / 26) * Math.PI * 2;
    const r = 6 + (a % 3) * 2;
    const x0 = Math.round(Math.cos(ang) * r);
    const z0 = Math.round(Math.sin(ang) * r);
    const len = 14 + (a % 5) * 3;
    for (let i = 0; i < len; i++) v.set(x0 + Math.round(Math.cos(ang) * i * 0.15), 34 - i, z0 + Math.round(Math.sin(ang) * i * 0.15), i % 4 === 0 ? C.matsuba : C.wakatake);
  }
  v.ellipsoid(0, 34, 0, 9, 4, 9, (x, y, z) => (hash3(x, y, z) < 0.3 ? null : C.matsuba));
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V8, [-0.5, 0, -0.5], 'toon', 0.08));
  obj.userData.anim = 'sway';
  return { obj, lights: [], flames: [] };
}

function well(): PropBuild {
  const v = new Vox();
  v.cylinder(0, 0, 0, 6, 6, (x, y, z) => (Math.hypot(x, z) < 4.5 ? (y < 5 ? C.yoru : null) : y % 3 === 0 ? C.nezumi : C.hai));
  for (const x of [-6, 6]) v.box(x, 6, 0, x, 22, 0, C.kuri);
  v.box(-7, 22, -1, 7, 23, 1, C.kuri);
  v.box(-1, 14, 0, 1, 21, 0, C.suna); // 綱
  v.box(-2, 12, -1, 2, 14, 1, C.kuchiba); // 釣瓶
  const obj = new THREE.Group();
  obj.add(voxMesh(v, V16, [-0.5, 0, -0.5]));
  return { obj, lights: [], flames: [] };
}

export { V16 };
