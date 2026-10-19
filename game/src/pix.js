// ドット絵の描画基盤。世界は 320×180 の低解像度に描き、整数倍で拡大する。
// 世界座標 2px = ドット 1px（ZOOM 1.5 で 640×360 の世界が見える）。
export const PW = 320, PH = 180, PX = 2;

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// ───────── 点・線・円（にじまない） ─────────
export function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
export function pset(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
export function line(ctx, x0, y0, x1, y1, c, w = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  ctx.fillStyle = c;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, n = 0;
  const o = Math.floor(w / 2);
  for (;;) {
    ctx.fillRect(x0 - o, y0 - o, w, w);
    if ((x0 === x1 && y0 === y1) || n++ > 2000) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
// 点線（予告線など）
export function dashLine(ctx, x0, y0, x1, y1, c, on = 3, off = 2) {
  const len = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
  ctx.fillStyle = c;
  for (let i = 0; i <= len; i++) {
    if (i % (on + off) >= on) continue;
    ctx.fillRect(Math.round(x0 + (x1 - x0) * i / len), Math.round(y0 + (y1 - y0) * i / len), 1, 1);
  }
}
export function circle(ctx, cx, cy, r, c) {
  cx = Math.round(cx); cy = Math.round(cy); r = Math.max(0, Math.round(r));
  ctx.fillStyle = c;
  let x = r, y = 0, err = 1 - r;
  while (x >= y) {
    for (const [a, b] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) ctx.fillRect(cx + a, cy + b, 1, 1);
    y++;
    if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; }
  }
}
export function disc(ctx, cx, cy, r, c) {
  cx = Math.round(cx); cy = Math.round(cy);
  ctx.fillStyle = c;
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y + r * 0.8));
    ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1);
  }
}
// 扇形（ボスの予告範囲）：ドット単位で塗る
export function wedge(ctx, cx, cy, r, a0, a1, c) {
  ctx.fillStyle = c;
  const norm = (a) => { while (a < -Math.PI) a += Math.PI * 2; while (a > Math.PI) a -= Math.PI * 2; return a; };
  const mid = (a0 + a1) / 2, half = Math.abs(a1 - a0) / 2;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    if (x * x + y * y > r * r) continue;
    if (Math.abs(norm(Math.atan2(y, x) - mid)) > half) continue;
    if ((x + y) & 1) continue; // 市松の網掛けで半透明感を出す
    ctx.fillRect(Math.round(cx) + x, Math.round(cy) + y, 1, 1);
  }
}

// ───────── スプライト ─────────
// rows: 同じ長さの文字列の配列。'.' は透明。pal: 文字 → 色
const spriteCache = new Map();
export function sprite(name, rows, pal) {
  if (spriteCache.has(name)) return spriteCache.get(name);
  const h = rows.length, w = rows[0].length;
  const c = makeCanvas(w, h), f = makeCanvas(w, h);
  const ctx = c.getContext('2d'), fctx = f.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x];
    if (ch === '.' || ch === ' ') continue;
    const col = pal[ch];
    if (!col) continue;
    ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1);
    fctx.fillStyle = col; fctx.fillRect(w - 1 - x, y, 1, 1);
  }
  const s = { w, h, img: c, flip: f };
  spriteCache.set(name, s);
  return s;
}
// 足元中央 (x, y) に描く。face<0 で左右反転
export function drawSprite(ctx, s, x, y, face = 1) {
  ctx.drawImage(face < 0 ? s.flip : s.img, Math.round(x - s.w / 2), Math.round(y - s.h));
}

// 決定的な疑似乱数（背景・タイルの模様用）
export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 弧（太さ thick）。斬撃の軌跡や溜めの輪に使う
export function arc(ctx, cx, cy, r, a0, a1, c, thick = 1) {
  ctx.fillStyle = c;
  if (a1 < a0) [a0, a1] = [a1, a0];
  const step = 0.5 / Math.max(2, r);
  const seen = new Set();
  for (let a = a0; a <= a1; a += step) for (let k = 0; k < thick; k++) {
    const x = Math.round(cx + Math.cos(a) * (r - k)), y = Math.round(cy + Math.sin(a) * (r - k));
    const key = x * 4096 + y;
    if (seen.has(key)) continue;
    seen.add(key); ctx.fillRect(x, y, 1, 1);
  }
}
