import { TILE } from './config.js';

// 部屋は ASCII で定義する。'#'=壁 '='=すり抜け床。その他の文字は配置マーカー。
export const EMPTY = 0, SOLID = 1, ONEWAY = 2;

export class TileMap {
  constructor(rows) {
    this.h = rows.length;
    this.w = Math.max(...rows.map((r) => r.length));
    this.tiles = new Uint8Array(this.w * this.h);
    this.markers = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = rows[y][x] || '.';
        if (c === '#') this.tiles[y * this.w + x] = SOLID;
        else if (c === '=') this.tiles[y * this.w + x] = ONEWAY;
        else if (c !== '.' && c !== ' ') this.markers.push({ c, tx: x, ty: y, x: x * TILE, y: y * TILE });
      }
    }
    this.pxW = this.w * TILE;
    this.pxH = this.h * TILE;
  }
  get(tx, ty) {
    if (tx < 0 || tx >= this.w) return SOLID; // 左右の外は壁
    if (ty < 0) return EMPTY;
    if (ty >= this.h) return EMPTY; // 下は奈落（落下死はなく、救済で戻す）
    return this.tiles[ty * this.w + tx];
  }
  solidAt(px, py) { return this.get(Math.floor(px / TILE), Math.floor(py / TILE)) === SOLID; }
  // 床面の高さを探す（出現位置の決定などに使う）
  groundBelow(px, py) {
    let ty = Math.floor(py / TILE);
    const tx = Math.floor(px / TILE);
    for (; ty < this.h; ty++) if (this.get(tx, ty) !== EMPTY) return ty * TILE;
    return this.pxH;
  }
}

// 軸ごとに移動して衝突を解決する。e: {x,y,w,h,vx,vy}
// 戻り値: {hitX, hitY, onGround}
export function moveBody(e, map, dt, opts = {}) {
  const res = { hitX: false, hitY: false, onGround: false, hitCeil: false };
  // X
  let nx = e.x + e.vx * dt;
  if (e.vx !== 0) {
    const top = Math.floor(e.y / TILE), bot = Math.floor((e.y + e.h - 0.01) / TILE);
    if (e.vx > 0) {
      const tx = Math.floor((nx + e.w - 0.01) / TILE);
      for (let ty = top; ty <= bot; ty++) if (map.get(tx, ty) === SOLID) { nx = tx * TILE - e.w; res.hitX = true; break; }
    } else {
      const tx = Math.floor(nx / TILE);
      for (let ty = top; ty <= bot; ty++) if (map.get(tx, ty) === SOLID) { nx = (tx + 1) * TILE; res.hitX = true; break; }
    }
  }
  e.x = nx;
  if (res.hitX) e.vx = 0;
  // Y
  let ny = e.y + e.vy * dt;
  const left = Math.floor(e.x / TILE), right = Math.floor((e.x + e.w - 0.01) / TILE);
  if (e.vy > 0) {
    const ty = Math.floor((ny + e.h) / TILE);
    const prevBottom = e.y + e.h;
    for (let tx = left; tx <= right; tx++) {
      const t = map.get(tx, ty);
      if (t === SOLID || (t === ONEWAY && !opts.dropThrough && prevBottom <= ty * TILE + 0.5)) {
        ny = ty * TILE - e.h; res.hitY = true; res.onGround = true; break;
      }
    }
  } else if (e.vy < 0) {
    const ty = Math.floor(ny / TILE);
    for (let tx = left; tx <= right; tx++) if (map.get(tx, ty) === SOLID) { ny = (ty + 1) * TILE; res.hitY = true; res.hitCeil = true; break; }
  }
  e.y = ny;
  if (res.hitY) e.vy = 0;
  // 静止時の接地判定
  if (!res.onGround && e.vy >= 0) {
    const ty = Math.floor((e.y + e.h + 0.5) / TILE);
    const exact = Math.abs(e.y + e.h - ty * TILE) < 0.6;
    if (exact) for (let tx = left; tx <= right; tx++) {
      const t = map.get(tx, ty);
      if (t === SOLID || (t === ONEWAY && !opts.dropThrough)) { res.onGround = true; break; }
    }
  }
  return res;
}

// 足元がすり抜け床だけかどうか（下＋ジャンプで降りられるか）
export function standingOnOneway(e, map) {
  const ty = Math.floor((e.y + e.h + 0.5) / TILE);
  const left = Math.floor(e.x / TILE), right = Math.floor((e.x + e.w - 0.01) / TILE);
  let any = false;
  for (let tx = left; tx <= right; tx++) {
    const t = map.get(tx, ty);
    if (t === SOLID) return false;
    if (t === ONEWAY) any = true;
  }
  return any;
}
