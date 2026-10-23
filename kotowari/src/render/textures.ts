import * as THREE from 'three';
import { PALETTE as C } from './palette';
import { hash3 } from './voxel';

/** 地形の材質ごとのドット絵の模様（1m = 16px）。キャンバスで描き、補間しない。 */
type Painter = (px: (x: number, y: number, c: string) => void, n: (x: number, y: number) => number) => void;

const S = 32; // 1 枚 = 2m 四方

const painters: Record<string, Painter> = {
  stone(px, n) {
    // 切石の石畳：16×8 の石を半分ずらして積む
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const row = Math.floor(y / 8);
        const off = row % 2 ? 8 : 0;
        const bx = (x + off) % 16;
        const by = y % 8;
        const stoneId = Math.floor((x + off) / 16) + row * 7;
        const tone = n(stoneId, 1) < 0.33 ? '#827e8a' : n(stoneId, 2) < 0.5 ? '#6c6874' : '#787480';
        let c = tone;
        if (bx === 0 || by === 0) c = '#45414f';
        else if (by === 1) c = C.ginnezu;
        else if (n(x, y) < 0.025 && n(stoneId, 5) < 0.5) c = C.koke;
        else if (n(x + 3, y) < 0.05) c = C.nezumi;
        px(x, y, c);
      }
  },
  stair(px, n) {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        let c = (y >> 2) % 2 ? C.hai : '#7d7986';
        if (y % 4 === 0) c = C.ginnezu;
        if (y % 4 === 3) c = C.nezumi;
        if (n(x, y) < 0.07) c = C.koke;
        if (x % 16 === 0) c = C.nezumi;
        px(x, y, c);
      }
  },
  gravel(px, n) {
    // 玉砂利：灰色の粒に、ところどころ明るい石
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const v = n(x, y);
        px(x, y, v < 0.3 ? C.nezumi : v < 0.75 ? '#77737f' : v < 0.95 ? C.hai : C.ginnezu);
      }
  },
  moss(px, n) {
    // 苔と落ち葉の地面
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const v = n(x >> 1, y >> 1);
        const w = n(x, y);
        let c = v < 0.35 ? C.tokiwa : v < 0.75 ? '#34553f' : C.matsuba;
        if (w < 0.025) c = C.kuchiba;
        else if (w > 0.96) c = C.koke;
        px(x, y, c);
      }
  },
  bamboowall(px, n) {
    // 竹の茂み：縦の幹と節、隙間は暗い
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const stalk = Math.floor(x / 5);
        const k = x % 5;
        const off = Math.floor(n(stalk, 3) * 16);
        let c = k === 4 ? C.kachi : k === 0 ? C.matsuba : k === 3 ? C.tokiwa : C.wakatake;
        if ((y + off) % 16 === 0 && k < 4) c = C.koke;
        if (n(stalk, 7) < 0.25 && k < 4) c = k === 0 ? C.tokiwa : C.matsuba;
        px(x, y, c);
      }
  },
  bridge(px, n) {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const plank = Math.floor(y / 4);
        let c = n(plank, 2) < 0.5 ? C.kuchiba : C.hiwada;
        if (y % 4 === 0) c = C.kogecha;
        if (n(x, y) < 0.05) c = C.kuri;
        px(x, y, c);
      }
  },
  bridgepost(px) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, y % 10 < 2 ? C.suna : x % 4 === 0 ? C.kogecha : C.kuri);
  },
  cobble(px, n) {
    // 宿場の石畳：小さめの丸い石
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const cx = Math.floor(x / 6);
        const cy = Math.floor((y + (cx % 2) * 3) / 6);
        const lx = x % 6;
        const ly = (y + (cx % 2) * 3) % 6;
        let c = n(cx * 7 + cy, 4) < 0.5 ? '#6c6874' : '#7d7986';
        if (lx === 0 || ly === 0) c = '#3e3b49';
        else if (lx === 1 && ly === 1) c = C.hai;
        px(x, y, c);
      }
  },
  roof(px) {
    // 瓦（縦の筋と段）
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        let c = x % 6 < 3 ? C.nezumi : '#3e3b49';
        if (y % 8 === 0) c = C.kachi;
        if (x % 6 === 0) c = C.hai;
        px(x, y, c);
      }
  },
  wood(px, n) {
    // 板張り：幅 8px の板
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const plank = Math.floor(x / 8);
        let c = n(plank, 9) < 0.5 ? C.hiwada : '#9a6a44';
        if (x % 8 === 0) c = C.kogecha;
        else if ((y + plank * 11) % 32 === 0) c = C.kuri;
        else if (n(x, y) < 0.08) c = C.kuri;
        px(x, y, c);
      }
  },
  plaster(px, n) {
    // 漆喰の塀：2m ごとの柱と、下の腰板
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        let c = n(x, y) < 0.12 ? C.geppaku : C.gofun;
        if (y < 12) c = y === 11 ? C.kuri : (x >> 2) % 2 ? C.hiwada : '#7a4c33'; // 腰板
        if (x < 3) c = x === 0 ? C.kuri : C.hiwada; // 柱
        px(x, y, c);
      }
  },
  rock(px, n) {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const v = n(x >> 1, y >> 1);
        const w = n(x + 7, y + 3);
        let c = v < 0.3 ? C.kachi : v < 0.7 ? C.nezumi : '#4a4752';
        if (w < 0.08) c = C.tokiwa;
        if (w > 0.95) c = C.hai;
        px(x, y, c);
      }
  },
  fence(px, n) {
    // 竹垣
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const k = x % 4;
        let c = k === 0 ? C.matsuba : k === 3 ? C.tokiwa : C.wakatake;
        if (y % 16 === 5) c = C.koke; // 節
        if ((y % 16 === 10 || y % 16 === 11) && x % 2 === 0) c = C.kuri; // 縄
        if (n(x, y) < 0.04) c = C.koke;
        px(x, y, c);
      }
  },
  floatstone(px, n) {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const v = n(x >> 1, y >> 1);
        let c = v < 0.4 ? '#6c7088' : C.hai;
        const d = Math.hypot(x - 15.5, y - 15.5);
        if (d > 9 && d < 11) c = C.ukon; // 円紋
        if (d > 4 && d < 5) c = C.kin;
        if (x === 0 || y === 0) c = C.nezumi;
        px(x, y, c);
      }
  },
  gate(px, n) {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        let c = (x >> 2) % 2 ? C.kuri : C.hiwada;
        if (y % 16 === 2 || y % 16 === 3) c = C.sumi;
        if (n(x, y) < 0.05) c = C.kuri;
        px(x, y, c);
      }
  },
  ghost(px) {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) px(x, y, x % 8 === 0 ? C.asagi : C.byakugun);
  },
  shadow(px, n) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, n(x, y) < 0.1 ? C.murasaki : C.yoru);
  },
  water(px, n) {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const v = n(x >> 2, y);
        px(x, y, v < 0.15 ? C.hanada : v < 0.6 ? C.koiai : C.ai);
      }
  },
};

const cache = new Map<string, THREE.Texture>();

export function terrainTexture(mat: string): THREE.Texture {
  const key = painters[mat] ? mat : 'stone';
  let t = cache.get(key);
  if (t) return t;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!canvas) throw new Error('canvas が無い');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d')!;
  const seed = key.length * 31;
  painters[key](
    (x, y, c) => {
      g.fillStyle = c;
      g.fillRect(x, S - 1 - y, 1, 1);
    },
    (x, y) => hash3(x, y, seed),
  );
  t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  cache.set(key, t);
  return t;
}

/** 1 枚の模様が覆う長さ（m） */
export const TEX_METERS = 2;
