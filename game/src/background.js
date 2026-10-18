// 階層ごとの背景（ドット絵・視差スクロール）とタイル。すべて手続き生成で、外部画像は使わない。
//   下層・市場：夕暮れの空、遠くの町並みと窓明かり、市場の梁と提灯
//   中層・歯車回廊：薄暗い機械室、回る大歯車、配管と鎖
//   上層・鐘楼：星空と月、眼下の町、石のアーチと大鐘
import { makeCanvas, rect, line, disc, circle, pset, hash2, PW, PH } from './pix.js';

const LAYER_W = 480, LAYER_H = 270;

// 2色の間を市松のディザでつなぐ帯
function bands(ctx, y0, y1, colors) {
  const n = colors.length - 1, h = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const a = colors[i], b = colors[i + 1], top = Math.round(y0 + i * h), bot = Math.round(y0 + (i + 1) * h);
    rect(ctx, 0, top, LAYER_W, bot - top, a);
    // 下側 1/3 を市松で次の色へ
    const dz = Math.max(2, Math.round((bot - top) / 3));
    ctx.fillStyle = b;
    for (let y = bot - dz; y < bot; y++) for (let x = (y & 1); x < LAYER_W; x += 2) ctx.fillRect(x, y, 1, 1);
  }
}

function skyline(ctx, base, color, windowColor, seed, minH, maxH, density = 0.35) {
  let x = 0;
  while (x < LAYER_W) {
    const w = 10 + Math.floor(hash2(x, 1, seed) * 22);
    const h = minH + Math.floor(hash2(x, 2, seed) * (maxH - minH));
    rect(ctx, x, base - h, w, h + 40, color);
    // 屋根：三角／平ら／尖塔
    const kind = hash2(x, 3, seed);
    if (kind < 0.4) for (let i = 0; i < Math.ceil(w / 2); i++) rect(ctx, x + i, base - h - i, w - i * 2, 1, color);
    else if (kind < 0.55) { rect(ctx, x + Math.floor(w / 2) - 1, base - h - 10, 2, 10, color); rect(ctx, x + Math.floor(w / 2), base - h - 13, 1, 3, color); }
    if (hash2(x, 4, seed) < 0.5) rect(ctx, x + 2, base - h - 4, 2, 4, color); // 煙突
    for (let wy = base - h + 3; wy < base - 2; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 3) {
      if (hash2(wx, wy, seed) < density) rect(ctx, wx, wy, 1, 2, windowColor);
    }
    x += w + Math.floor(hash2(x, 5, seed) * 4);
  }
}

// 歯車（ドット単位で生成。回転はフレームとしてキャッシュ）
const gearCache = new Map();
export function gearFrame(r, teeth, color, hole, step, steps = 8) {
  const key = `${r}:${teeth}:${color}:${hole}:${step}`;
  if (gearCache.has(key)) return gearCache.get(key);
  const size = r * 2 + 6, c = makeCanvas(size, size), ctx = c.getContext('2d');
  const cx = size / 2, cy = size / 2, rot = (step / steps) * (Math.PI * 2 / teeth);
  ctx.fillStyle = color;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx) + rot;
    const tooth = ((a / (Math.PI * 2) * teeth) % 1 + 1) % 1 < 0.5;
    const outer = tooth ? r + 3 : r;
    if (d > outer || d < r * 0.28) continue;
    // 肉抜きの穴
    const spoke = ((a / (Math.PI * 2) * 5) % 1 + 1) % 1;
    if (hole && d > r * 0.45 && d < r * 0.78 && spoke > 0.2 && spoke < 0.8) continue;
    ctx.fillRect(x, y, 1, 1);
  }
  gearCache.set(key, c);
  return c;
}

// 内装の型（上層・鐘楼だけ 3 通り：0 はもとの型、1 は鐘の回廊、2 はステンドグラスの間。ほかの階はもとの型だけ）。部屋ごとに替わる
// 1・2 は屋内の 1 枚絵（後ろの空・町・月・星は描かない）
// 屋内の石壁：切り石の大きさと明るさを場所ごとに変える（同じ模様の繰り返しにしない）
function stoneWall(m, seed) {
  bands(m, 0, LAYER_H, ['#07081a', '#0c1026', '#111733', '#141b3a', '#10152e']);
  for (let y = 0, row = 0; y < LAYER_H; y += 9 + (row % 3), row++) {
    let x = -Math.floor(hash2(row, 1, seed) * 20);
    while (x < LAYER_W) {
      const w = 16 + Math.floor(hash2(x, row, seed + 1) * 18), k = hash2(x, row, seed + 2);
      if (k < 0.25) rect(m, x + 1, y + 1, w - 2, 7, '#151c3c'); else if (k > 0.85) rect(m, x + 1, y + 1, w - 2, 7, '#0b0f24');
      rect(m, x, y, 1, 9, '#090c1e'); x += w;
    }
    rect(m, 0, y, LAYER_W, 1, '#090c1e');
  }
}
// 鐘（青銅）。cx・top：吊り金具の位置、h：高さ。長さの違う鐘を並べて、同じ絵の繰り返しにしない
function bell(m, cx, top, h, swing = 0) {
  const body = '#3a2e1e', hi = '#6a5430', dark = '#22190f';
  rect(m, cx - 3, top, 7, 4, dark); // 吊り金具
  for (let y = 0; y < h; y++) {
    const t = y / h, w = Math.round(h * (0.16 + Math.pow(t, 1.7) * 0.34)), x0 = Math.round(cx - w + swing * t);
    rect(m, x0, top + 4 + y, w * 2 + 1, 1, body);
    pset(m, x0 + Math.round(w * 0.45), top + 4 + y, hi); pset(m, x0 + Math.round(w * 0.45) + 1, top + 4 + y, hi);
    if (y === Math.round(h * 0.3) || y === Math.round(h * 0.82)) rect(m, x0, top + 4 + y, w * 2 + 1, 1, dark); // 帯
  }
  const lw = Math.round(h * 0.5);
  rect(m, Math.round(cx - lw + swing) - 2, top + 4 + h, lw * 2 + 5, 3, hi); rect(m, Math.round(cx - lw + swing) - 2, top + 6 + h, lw * 2 + 5, 1, dark); // 口のふち
  disc(m, Math.round(cx + swing * 1.1), top + 8 + h, Math.max(2, Math.round(h * 0.07)), dark); // 舌
}
// 鐘の回廊（上層・内装 1）：鐘楼の中。太い木の梁と筋交い、中央の大鐘、大きさの違う鐘、鐘を鳴らす木の車輪、鎧戸の窓
function bellHall() {
  const c = makeCanvas(LAYER_W, LAYER_H), m = c.getContext('2d');
  stoneWall(m, 61);
  const wood = '#1c1618', woodHi = '#2c2226', woodDk = '#100c0e'; // 足場（明るい茶色の板）と見間違えないよう、暗く冷たい色の木
  // 両端の鎧戸の窓：尖ったアーチの中に夜空と星、斜めの板（板は太く短く。細い長い斜め線は雨に見えるので使わない）
  const louver = (cx) => {
    const w = 34, top = 40, h = 110;
    for (let y = top - 4; y < top + h + 4; y++) for (let x = cx - w / 2 - 4; x <= cx + w / 2 + 4; x++) {
      const dy = top + w / 2 - y, inArch = y >= top + w / 2 ? Math.abs(x - cx) <= w / 2 : Math.hypot(x - cx, dy) <= w / 2;
      const inFrame = y >= top + w / 2 ? Math.abs(x - cx) <= w / 2 + 4 : Math.hypot(x - cx, dy) <= w / 2 + 4;
      if (inArch && y < top + h) pset(m, x, y, y < top + 40 ? '#0c1434' : '#101a40');
      else if (inFrame && y < top + h + 4) pset(m, x, y, '#1d2547');
    }
    for (let i = 0; i < 9; i++) pset(m, cx - 12 + Math.floor(hash2(cx, i, 3) * 24), top + 6 + Math.floor(hash2(i, cx, 4) * 60), hash2(i, cx, 5) < 0.4 ? '#c8d0f0' : '#6a76a8');
    for (let y = top + 30; y < top + h - 4; y += 11) rect(m, cx - w / 2, y, w + 1, 5, '#141b3a'), rect(m, cx - w / 2, y, w + 1, 1, '#2a3358');
  };
  louver(34); louver(446);
  // 天井の太い梁と、中央の三角の筋交い（大鐘を吊る枠）
  rect(m, 0, 0, LAYER_W, 14, '#05060f');
  rect(m, 0, 14, LAYER_W, 9, wood); rect(m, 0, 14, LAYER_W, 1, woodHi); rect(m, 0, 22, LAYER_W, 1, woodDk);
  for (let x = 0; x < LAYER_W; x += 37 + (x % 11)) rect(m, x, 16, 2, 2, woodDk); // 釘
  const post = (x, w) => { rect(m, x, 23, w, 247, wood); rect(m, x + 1, 23, 1, 247, woodHi); rect(m, x + w - 1, 23, 1, 247, woodDk); };
  post(170, 9); post(301, 9);
  for (let i = 0; i < 60; i++) { rect(m, 179 + i, 23 + Math.round(i * 0.62), 4, 3, wood); rect(m, 301 - i - 4, 23 + Math.round(i * 0.62), 4, 3, wood); } // 筋交い
  rect(m, 170, 96, 140, 7, wood); rect(m, 170, 96, 140, 1, woodHi); // 鐘を吊る横木
  // 中央の大鐘（横木から下がる）
  rect(m, 238, 103, 5, 8, woodDk);
  bell(m, 240, 110, 58);
  line(m, 241, 182, 241, 270, '#4a3a2a'); // 鐘の綱
  // 左：別の梁から、大きさも高さも違う 2 つの鐘
  rect(m, 70, 52, 100, 6, wood); rect(m, 70, 52, 100, 1, woodHi); post(72, 6);
  bell(m, 104, 58, 30, -1); line(m, 104, 96, 104, 270, '#3e3024');
  bell(m, 148, 58, 20, 1); line(m, 148, 84, 148, 200, '#3e3024');
  // 右：鐘を鳴らす木の車輪（輻のある大きな輪）と、それにつながる鐘
  const wx = 372, wy = 92, wr = 30;
  for (let a = 0; a < 6; a++) { const t = a / 6 * Math.PI * 2; line(m, wx, wy, Math.round(wx + Math.cos(t) * wr), Math.round(wy + Math.sin(t) * wr), wood, 2); }
  circle(m, wx, wy, wr, woodHi); circle(m, wx, wy, wr - 1, wood); circle(m, wx, wy, wr - 2, wood); disc(m, wx, wy, 5, woodDk);
  rect(m, 330, 52, 110, 6, wood); rect(m, 330, 52, 110, 1, woodHi); post(432, 6);
  rect(m, wx - 2, 58, 4, wy - 58, woodDk);
  bell(m, 410, 58, 36, 2); line(m, 412, 102, 412, 270, '#3e3024');
  line(m, wx, wy + wr, wx, 270, '#4a3a2a'); // 車輪の綱
  // 腰壁（床の近くは暗く落とす）
  rect(m, 0, 204, LAYER_W, LAYER_H - 204, '#0a0d22'); rect(m, 0, 204, LAYER_W, 1, '#1d2547');
  return c;
}
// ステンドグラスの間（上層・内装 2）：部屋ぜんたいで 1 枚の絵。同じ絵を繰り返して貼らない。
// 中央に大きなバラ窓、左右に図柄の違う尖頭窓（鐘・月）、両端に小窓、太い柱、窓から床へ落ちる色の光。
// この部屋は屋内なので、後ろの空・町・月・星は描かない（不透明な 1 枚）
// 色を暗くする（背景の色ガラスが、手前の敵や弾より目立たないように）
const dim = (hex, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
function stainedHall() {
  const c = makeCanvas(LAYER_W, LAYER_H), m = c.getContext('2d');
  const G = 0.7; // 色ガラスの明るさ
  stoneWall(m, 41);
  // 天井のアーチ（肋骨のような梁）
  rect(m, 0, 0, LAYER_W, 10, '#05060f');
  for (const [x0, x1] of [[0, 150], [150, 330], [330, 480]]) for (let i = 0; i <= x1 - x0; i++) {
    const t = i / (x1 - x0), yy = 10 + Math.round(Math.sin(t * Math.PI) * 16);
    rect(m, x0 + i, 0, 1, yy, '#05060f'); rect(m, x0 + i, yy, 1, 2, '#1b2346');
  }
  const lead = '#06070f';
  // 色ガラスの光：窓の色を少しだけ床へ落とす（太くやわらかい帯。細い斜め線は雨に見えるので使わない）
  const shaft = (x, w, top, col) => { m.globalAlpha = 0.09; m.fillStyle = col; for (let y = top; y < LAYER_H; y++) { const sx = x + (y - top) * 0.18; for (let i = (y & 1); i < w; i += 2) m.fillRect(Math.round(sx + i), y, 1, 1); } m.globalAlpha = 1; };
  // 尖頭窓：2 つの円弧で尖ったアーチ。ガラスはひし形の鉛枠、色は窓ごとのパレットから
  const lancet = (cx, top, w, h, pal, seed, motif) => {
    const r = w * 0.85, half = w / 2, archH = Math.round(Math.sqrt(r * r - (r - half) * (r - half)));
    const inside = (x, y) => {
      if (y > top + h || Math.abs(x - cx) > half) return false;
      if (y >= top + archH) return true;
      const dy = top + archH - y; // アーチの部分：左右の円の内側
      return Math.hypot(x - (cx + half - r), dy) <= r && Math.hypot(x - (cx - half + r), dy) <= r;
    };
    // 石の枠
    for (let y = top - 4; y <= top + h + 4; y++) for (let x = cx - half - 4; x <= cx + half + 4; x++) {
      if (inside(x, y)) continue;
      let near = false; for (let d = 1; d <= 4 && !near; d++) near = inside(x - d, y) || inside(x + d, y) || inside(x, y + d) || inside(x, y - d);
      if (near) pset(m, x, y, '#1d2547');
    }
    for (let y = top; y <= top + h; y++) for (let x = cx - half; x <= cx + half; x++) {
      if (!inside(x, y)) continue;
      const u = (x - cx) + (y - top), v = (x - cx) - (y - top); // ひし形の格子
      const iu = Math.floor(u / 9), iv = Math.floor(v / 9);
      const onLead = ((u % 9) + 9) % 9 === 0 || ((v % 9) + 9) % 9 === 0;
      pset(m, x, y, onLead ? lead : dim(pal[Math.floor(hash2(iu, iv, seed) * pal.length)], G));
    }
    // 中の縦の仕切り（窓を 2 つに分ける石）と横の帯
    rect(m, cx, top + archH - 6, 1, h - archH + 6, '#1d2547');
    for (const yy of [top + Math.round(h * 0.55)]) rect(m, cx - half, yy, w + 1, 2, '#1d2547');
    motif(cx, top, archH);
    shaft(cx - half + 2, w - 4, top + h + 2, pal[pal.length - 1]);
  };
  // 左：金の鐘の図柄（青いガラス）
  lancet(118, 34, 46, 124, ['#1c2f5c', '#22386a', '#182752', '#2b4478', '#3a5a96'], 51, (cx, top, ah) => {
    const by = top + ah + 6;
    line(m, cx, top + ah - 4, cx, by, '#8a6a2a');
    for (let y = 0; y < 26; y++) { const w = Math.round(4 + Math.pow(y / 26, 1.5) * 11); rect(m, cx - w, by + y, w * 2 + 1, 1, y % 7 === 0 ? lead : '#8a6a2c'); }
    rect(m, cx - 16, by + 26, 33, 2, '#a8843c'); disc(m, cx, by + 30, 2, '#a8843c');
  });
  // 右：月と星の図柄（紫と赤のガラス）
  lancet(362, 34, 46, 124, ['#3a1f4c', '#4a2240', '#2c1a44', '#5a2a4a', '#6a3a6a'], 52, (cx, top, ah) => {
    const my = top + ah + 18;
    disc(m, cx, my, 11, '#a8a490'); disc(m, cx + 5, my - 3, 9, dim('#3a1f4c', G)); circle(m, cx, my, 11, lead);
    for (const [dx, dy] of [[-12, -16], [10, 14], [-8, 20]]) { rect(m, cx + dx - 1, my + dy, 3, 1, '#b89a5a'); rect(m, cx + dx, my + dy - 1, 1, 3, '#b89a5a'); }
  });
  // 両端の小窓（半円の頭・琥珀と緑。大きな窓とは違う色）
  const small = (cx, pal, seed) => {
    const top = 58, w = 18, h = 70;
    for (let y = top - 3; y <= top + h + 3; y++) for (let x = cx - w / 2 - 3; x <= cx + w / 2 + 3; x++) {
      const yy = y < top + w / 2 ? Math.hypot(x - cx, y - (top + w / 2)) - w / 2 : Math.abs(x - cx) - w / 2;
      if (y > top + h + 3) continue;
      if (yy <= 0 && y <= top + h) pset(m, x, y, (x - cx) % 6 === 0 || (y - top) % 8 === 0 ? lead : dim(pal[Math.floor(hash2(Math.floor(x / 6), Math.floor(y / 8), seed) * pal.length)], G));
      else if (yy <= 3) pset(m, x, y, '#1d2547');
    }
    shaft(cx - w / 2 + 2, w - 4, top + h + 2, pal[0]);
  };
  small(36, ['#5a4a1e', '#6a5424', '#4a3c18', '#7a6430'], 53);
  small(444, ['#1e4a3c', '#24584a', '#183c30', '#2c6a58'], 54);
  // 中央：大きなバラ窓。12 枚の花弁、内側に時計の文字盤
  const RX = 240, RY = 78, R = 50;
  for (let y = RY - R - 5; y <= RY + R + 5; y++) for (let x = RX - R - 5; x <= RX + R + 5; x++) {
    const dx = x - RX, dy = y - RY, d = Math.hypot(dx, dy);
    if (d > R + 5) continue;
    if (d > R) { pset(m, x, y, d > R + 3 ? '#141b3a' : '#1d2547'); continue; }
    const a = (Math.atan2(dy, dx) + Math.PI * 2.5) % (Math.PI * 2), seg = a / (Math.PI * 2) * 12, si = Math.floor(seg), f = seg - si;
    let col;
    if (d < 13) col = d < 2 ? '#b8923e' : '#9a7c3e'; // 文字盤
    else if (d < 15) col = lead;
    else if (f < 0.06 || f > 0.94) col = lead; // 花弁の境
    else {
      const petal = Math.abs(f - 0.5) * 2, edge = (d - 15) / (R - 15); // 花弁のふくらみ
      if (Math.abs(edge - 0.55) < 0.03 || petal > 1 - 0.18 * Math.sin(edge * Math.PI) - 0.02 && petal > 0.8) col = lead;
      else col = dim([['#2b4478', '#5a2a4a', '#1e4a3c', '#6a5424'][si % 4], ['#3a5a96', '#7a3a5a', '#2c6a58', '#8a6a30'][si % 4]][edge > 0.55 ? 1 : 0], G);
    }
    pset(m, x, y, col);
  }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; pset(m, Math.round(RX + Math.cos(a) * 10), Math.round(RY + Math.sin(a) * 10), '#05060f'); } // 文字盤の目盛り
  line(m, RX, RY, RX, RY - 8, '#05060f'); line(m, RX, RY, RX + 6, RY + 2, '#05060f');
  shaft(RX - 26, 52, RY + R + 6, '#7a6aa0');
  // 太い柱（窓のあいだ）と柱頭・柱礎
  for (const [x, w] of [[64, 14], [178, 16], [288, 16], [404, 14]]) {
    rect(m, x, 20, w, 250, '#0d1230'); rect(m, x + 2, 20, 1, 250, '#1d2547'); rect(m, x + w - 2, 20, 1, 250, '#080a1c');
    rect(m, x - 3, 30, w + 6, 4, '#1d2547'); rect(m, x - 3, 34, w + 6, 1, '#080a1c');
    rect(m, x - 4, 196, w + 8, 6, '#1d2547'); rect(m, x - 4, 202, w + 8, 1, '#080a1c');
  }
  // 腰壁（床の近くは暗く落とす）
  rect(m, 0, 204, LAYER_W, LAYER_H - 204, '#0a0d22'); rect(m, 0, 204, LAYER_W, 1, '#1d2547');
  return c;
}

// 夜が進むほど荒れる（2 周目は少し、3 周目からかなり）：壁に穴が開き、梁が折れて垂れ、瓦礫が積もる
// opaque：後ろに背景が無い 1 枚絵の部屋。穴は抜かずに、暗い穴として描く
function ruinLayer(src, ruin, seed, opaque = false) {
  const c = makeCanvas(LAYER_W, LAYER_H), m = c.getContext('2d');
  m.drawImage(src, 0, 0);
  const n = ruin === 1 ? 5 : 14;
  m.globalCompositeOperation = opaque ? 'source-over' : 'destination-out';
  for (let i = 0; i < n; i++) {
    const x = hash2(i, 1, seed) * LAYER_W, y = 40 + hash2(i, 2, seed) * 180, r = 6 + hash2(i, 3, seed) * (ruin === 1 ? 10 : 22);
    // 1 枚絵の部屋：大きな黒い穴は開けず、小さく欠けた石（縁だけ明るい）にする
    if (opaque) { const q = Math.min(6, Math.max(3, Math.round(r * 0.3))); disc(m, x, y, q + 1, '#1d2547'); disc(m, x, y, q, '#0b0e22'); disc(m, x + q * 0.8, y + q * 0.4, Math.max(2, q - 2), '#0b0e22'); pset(m, x - 1, y - 1, '#070918'); continue; }
    disc(m, x, y, r, '#000'); disc(m, x + r * 0.8, y + r * 0.4, r * 0.6, '#000');
  }
  m.globalCompositeOperation = 'source-over';
  const dark = '#0a0710';
  // 折れた梁：天井から短く太い角材が斜めに垂れる（細い長い線は雨に見えるので描かない）
  for (let i = 0; i < Math.ceil(n / 2); i++) {
    const x = hash2(i, 4, seed) * LAYER_W, y = 18 + hash2(i, 5, seed) * 30, len = 10 + hash2(i, 6, seed) * 16, d = hash2(i, 9, seed) < 0.5 ? -1 : 1;
    for (let k = 0; k < len; k++) rect(m, Math.round(x + d * k * 0.7), Math.round(y + k), 5, 2, k % 5 ? dark : '#221a28');
  }
  if (ruin >= 2) for (let x = 0; x < LAYER_W; x += 3) { const h = Math.round(4 + hash2(x, 7, seed) * 10 + Math.sin(x / 30) * 4); rect(m, x, LAYER_H - h, 3, h, hash2(x, 8, seed) < 0.5 ? '#141018' : '#1e1822'); } // 瓦礫
  return c;
}

const cache = new Map();
// variant：内装の型（0〜2）。ruin：荒れ具合（0 なし・1 少し・2 かなり）
export function backgroundFor(fi, variant = 0, ruin = 0) {
  const key = `${fi}:${variant}:${ruin}`;
  if (cache.has(key)) return cache.get(key);
  // 鐘の回廊・ステンドグラスの間：1 枚だけの屋内の絵（空・町・月・星は無い）
  if (fi === 2 && (variant === 1 || variant === 2)) {
    let c = variant === 1 ? bellHall() : stainedHall();
    if (ruin) c = ruinLayer(c, ruin, 31 + fi * 7 + variant, true);
    const out = { layers: [{ c, single: true }], indoor: true, tiles: backgroundFor(fi).tiles };
    cache.set(key, out);
    return out;
  }
  if (ruin) {
    const base = backgroundFor(fi), layers = base.layers.slice(), last = layers.length - 1;
    let mid = layers[last].c;
    if (ruin) mid = ruinLayer(mid, ruin, 31 + fi * 7);
    layers[last] = { ...layers[last], c: mid };
    const out = { ...base, layers };
    cache.set(key, out);
    return out;
  }
  const mk = () => { const c = makeCanvas(LAYER_W, LAYER_H); return [c, c.getContext('2d')]; };
  let bg;
  if (fi === 0) {
    const [sky, s] = mk();
    bands(s, 0, 140, ['#160d26', '#24133a', '#3d1c48', '#62264f', '#8f3a4e', '#c45a48']);
    rect(s, 0, 140, LAYER_W, 130, '#c45a48');
    for (let i = 0; i < 30; i++) { const x = Math.floor(hash2(i, 9, 7) * LAYER_W), y = Math.floor(hash2(i, 8, 7) * 60); s.fillStyle = '#e8d8ff'; s.fillRect(x, y, 1, 1); }
    // 沈みかけの夕日
    disc(s, 360, 128, 16, '#e07a4c'); disc(s, 360, 128, 11, '#f0a060'); disc(s, 360, 128, 6, '#ffd08a');
    const [far, f] = mk();
    skyline(f, 142, '#2a1532', '#d88a3c', 11, 14, 44, 0.08);
    // 遠くの時計塔（この塔）
    rect(f, 120, 62, 18, 160, '#2a1532');
    for (let i = 0; i < 10; i++) rect(f, 120 + i, 62 - i, 18 - i * 2, 1, '#2a1532');
    disc(f, 129, 76, 4, '#c9a052'); line(f, 129, 76, 129, 74, '#2a1532'); pset(f, 130, 77, '#2a1532');
    const [mid, m] = mk();
    // 市場の梁（アーチ）と柱
    for (let x = 0; x < LAYER_W; x += 120) {
      rect(m, x, 60, 8, 210, '#1a0f1e');
      rect(m, x + 1, 60, 1, 210, '#2c1a2e');
      for (let i = 0; i < 60; i++) { const yy = 60 + Math.round(Math.pow((i - 30) / 30, 2) * 18) - 18; rect(m, x + 8 + i * 1.86, yy, 2, 3, '#1a0f1e'); }
    }
    rect(m, 0, 40, LAYER_W, 4, '#1a0f1e');
    // 日よけの布
    for (let x = 20; x < LAYER_W; x += 120) for (let i = 0; i < 40; i++) {
      const h = 8 + (i % 8 < 4 ? i % 4 : 4 - (i % 4));
      rect(m, x + 20 + i, 44, 1, h, i % 16 < 8 ? '#5a1f2c' : '#3e1726');
    }
    bg = {
      layers: [{ c: sky, f: 0.04 }, { c: far, f: 0.15 }, { c: mid, f: 0.45 }],
      // 提灯は揺らぎを毎フレーム描く
      lanterns: Array.from({ length: 8 }, (_, i) => ({ x: i * 60 + 30, y: 64 + Math.round(Math.sin(i * 1.7) * 6) })),
      tiles: makeTiles('stone'),
    };
  } else if (fi === 1) {
    const [base, b] = mk();
    bands(b, 0, 270, ['#070f10', '#0c1a1b', '#10241f', '#0d1d1c']);
    // 大きなレンガ目地
    for (let y = 0; y < 270; y += 12) for (let x = (y / 12) % 2 ? 0 : 12; x < LAYER_W; x += 24) rect(b, x, y, 1, 12, '#0a1415');
    for (let y = 0; y < 270; y += 12) rect(b, 0, y, LAYER_W, 1, '#0a1415');
    const [mid, m] = mk();
    // 配管
    for (let x = 30; x < LAYER_W; x += 150) {
      rect(m, x, 0, 7, 270, '#1d3632'); rect(m, x + 1, 0, 1, 270, '#2f504a'); rect(m, x + 6, 0, 1, 270, '#132522');
      for (let y = 40; y < 270; y += 70) { rect(m, x - 2, y, 11, 4, '#26443f'); rect(m, x - 2, y, 11, 1, '#3c6058'); }
      rect(m, x + 7, 120, 60, 5, '#1d3632'); rect(m, x + 7, 121, 60, 1, '#2f504a');
      disc(m, x + 40, 122, 4, '#5a3a24'); rect(m, x + 36, 122, 9, 1, '#8a5a34');
    }
    bg = {
      layers: [{ c: base, f: 0.1 }, { c: mid, f: 0.5 }],
      gears: [
        { x: 60, y: 90, r: 44, teeth: 14, f: 0.22, dir: 1, color: '#14302d' },
        { x: 160, y: 170, r: 30, teeth: 10, f: 0.22, dir: -1, color: '#163633' },
        { x: 330, y: 60, r: 56, teeth: 18, f: 0.22, dir: -1, color: '#122b28' },
        { x: 420, y: 190, r: 22, teeth: 8, f: 0.32, dir: 1, color: '#1b3d39' },
      ],
      chains: Array.from({ length: 6 }, (_, i) => ({ x: i * 80 + 50, len: 60 + (i % 3) * 30 })),
      tiles: makeTiles('metal'),
    };
  } else {
    const [sky, s] = mk();
    bands(s, 0, 270, ['#050717', '#0a0f26', '#111a3a', '#18244b', '#1e2c58']);
    // 月と光の輪
    for (let r = 34; r > 22; r -= 4) circle(s, 380, 60, r, '#141e44');
    disc(s, 380, 60, 18, '#e8e4d0'); disc(s, 384, 56, 4, '#cfcab4'); disc(s, 374, 66, 3, '#cfcab4'); disc(s, 388, 68, 2, '#cfcab4');
    const [far, f] = mk();
    skyline(f, 144, '#0b1129', '#f2c14e', 23, 8, 30, 0.12);
    const [mid, m] = mk();
    // 石のアーチ
    for (let x = 0; x < LAYER_W; x += 160) {
      rect(m, x, 30, 14, 240, '#121830'); rect(m, x + 2, 30, 1, 240, '#1e2746');
      for (let i = 0; i <= 146; i++) {
        const t = i / 146, yy = 30 + Math.round((1 - Math.sin(t * Math.PI)) * 40);
        rect(m, x + 14 + i, 20, 1, yy - 20 + 6, '#121830');
        rect(m, x + 14 + i, yy + 5, 1, 1, '#1e2746');
      }
    }
    rect(m, 0, 0, LAYER_W, 20, '#121830');
    // 大鐘
    const bx = 240;
    line(m, bx, 20, bx, 52, '#2a3358', 2);
    for (let y = 0; y < 50; y++) { const w = Math.round(10 + Math.pow(y / 50, 1.6) * 26); rect(m, bx - w, 52 + y, w * 2, 1, '#1a2244'); }
    rect(m, bx - 38, 102, 76, 4, '#1a2244'); rect(m, bx - 37, 102, 74, 1, '#38457a');
    for (let y = 0; y < 50; y += 1) { const w = Math.round(10 + Math.pow(y / 50, 1.6) * 26); rect(m, bx - w, 52 + y, 1, 1, '#38457a'); }
    bg = {
      layers: [{ c: sky, f: 0.03 }, { c: far, f: 0.12 }, { c: mid, f: 0.4 }],
      stars: Array.from({ length: 70 }, (_, i) => ({ x: Math.floor(hash2(i, 1, 99) * PW * 1.5), y: Math.floor(hash2(i, 2, 99) * 120), p: hash2(i, 3, 99) * 6 })),
      tiles: makeTiles('night'),
    };
  }
  cache.set(key, bg);
  return bg;
}

// 背景を描く（camX, camY はドット単位の視点。roomW・roomH は部屋の大きさ（ドット））
export function drawBackground(ctx, fi, camX, camY, t, maxLayers = 99, variant = 0, ruin = 0, roomW = PW, roomH = PH) {
  const bg = backgroundFor(fi, variant, ruin);
  for (const L of bg.layers.slice(0, maxLayers)) {
    if (L.single) {
      // 1 枚の絵：部屋の左端から右端まで動くと、絵の左端から右端までが見える（繰り返さない）
      const kx = roomW > PW ? (LAYER_W - PW) / (roomW - PW) : 0, ky = roomH > PH ? Math.min(1, (LAYER_H - 70 - PH) / (roomH - PH)) : 0;
      const x = roomW > PW ? -Math.round(Math.min(camX, roomW - PW) * kx) : -Math.round((LAYER_W - PW) / 2);
      ctx.drawImage(L.c, x, -Math.round(Math.max(0, camY) * ky));
      continue;
    }
    const ox = -Math.round(camX * L.f) % LAYER_W, oy = -Math.round(camY * L.f * 0.6);
    for (let x = ox - LAYER_W; x < PW; x += LAYER_W) if (x + LAYER_W > 0) ctx.drawImage(L.c, x, oy);
    if (L === bg.layers[0] && bg.stars) {
      for (const s of bg.stars) {
        const tw = Math.sin(t * 2 + s.p) > 0.6;
        const x = ((s.x - camX * 0.03) % (PW * 1.5) + PW * 1.5) % (PW * 1.5);
        if (x < PW) rect(ctx, x, s.y + oy, 1, 1, tw ? '#ffffff' : '#8a96c8');
      }
    }
    if (L === bg.layers[0] && bg.gears) {
      for (const g of bg.gears) {
        const step = Math.floor(((t * 0.6 * g.dir) % 1 + 1) % 1 * 8);
        const img = gearFrame(g.r, g.teeth, g.color, true, step);
        const gx = ((g.x - camX * g.f) % LAYER_W + LAYER_W) % LAYER_W;
        for (const xx of [gx - LAYER_W, gx]) ctx.drawImage(img, Math.round(xx - img.width / 2), Math.round(g.y - camY * g.f * 0.6 - img.height / 2));
      }
    }
  }
  if (bg.lanterns) {
    const f = 0.45;
    for (const l of bg.lanterns) {
      const x = ((l.x - camX * f) % LAYER_W + LAYER_W) % LAYER_W, y = l.y - Math.round(camY * f * 0.6);
      for (const xx of [x - LAYER_W, x]) {
        const flick = Math.sin(t * 7 + l.x) > 0.7;
        // 灯りのにじみ（市松）
        ctx.fillStyle = 'rgba(255,170,80,0.18)';
        for (let yy = -6; yy <= 8; yy++) for (let dx = -6; dx <= 6; dx++) if (((dx + yy) & 1) === 0 && dx * dx + yy * yy < 40) ctx.fillRect(Math.round(xx) + dx, y + yy, 1, 1);
        line(ctx, xx, y - 10, xx, y - 3, '#1a0f1e');
        rect(ctx, xx - 2, y - 3, 5, 6, flick ? '#ffd27a' : '#ff9a3c');
        rect(ctx, xx - 2, y - 3, 5, 1, '#5a1f2c'); rect(ctx, xx - 2, y + 2, 5, 1, '#5a1f2c');
      }
    }
  }
  if (bg.chains) {
    const f = 0.5;
    for (const c of bg.chains) {
      const x = ((c.x - camX * f) % LAYER_W + LAYER_W) % LAYER_W, top = -Math.round(camY * f * 0.6);
      for (const xx of [x - LAYER_W, x]) {
        const sway = Math.sin(t * 0.8 + c.x) * 3;
        for (let i = 0; i < c.len; i += 3) {
          const k = i / c.len;
          rect(ctx, xx + sway * k * k, top + i, i % 6 ? 1 : 2, 2, i % 6 ? '#2e4a45' : '#3e5e58');
        }
        rect(ctx, xx + sway - 2, top + c.len, 5, 4, '#3e5e58');
      }
    }
  }
}

// ───────── タイル（15×15 ドット） ─────────
export const TS = 15;
function makeTiles(kind) {
  const P = {
    stone: { base: '#3b2a35', mortar: '#241823', hi: '#4f3846', cap: '#6b5060', capHi: '#957487', under: '#20151f' },
    metal: { base: '#1f3534', mortar: '#112221', hi: '#2b4644', cap: '#7a5c2e', capHi: '#c9a052', under: '#0e1b1a', rivet: '#4f766d' },
    night: { base: '#252c45', mortar: '#151a2c', hi: '#323b5b', cap: '#4a5680', capHi: '#8b98c8', under: '#121628' },
  }[kind];
  const variants = 4;
  const c = makeCanvas(TS * variants, TS * 3), ctx = c.getContext('2d');
  for (let v = 0; v < variants; v++) {
    for (let row = 0; row < 2; row++) {
      const ox = v * TS, oy = row * TS;
      rect(ctx, ox, oy, TS, TS, P.base);
      if (kind === 'metal') {
        rect(ctx, ox, oy + TS - 1, TS, 1, P.mortar); rect(ctx, ox + TS - 1, oy, 1, TS, P.mortar);
        rect(ctx, ox, oy, TS - 1, 1, P.hi); rect(ctx, ox, oy, 1, TS - 1, P.hi);
        for (const [rx, ry] of [[2, 2], [TS - 4, 2], [2, TS - 4], [TS - 4, TS - 4]]) rect(ctx, ox + rx, oy + ry, 1, 1, P.rivet);
        if (hash2(v, row, 5) < 0.4) rect(ctx, ox + 5, oy + 6, 4, 1, P.mortar);
      } else {
        // 3段のレンガ
        for (let r = 0; r < 3; r++) {
          const y = oy + r * 5;
          rect(ctx, ox, y + 4, TS, 1, P.mortar);
          const off = (r + v) % 2 ? 4 : 0;
          for (let x = off; x < TS; x += 8) rect(ctx, ox + x, y, 1, 4, P.mortar);
          for (let x = off + 1; x < TS; x += 8) rect(ctx, ox + x, y, Math.min(6, TS - x), 1, P.hi);
        }
        if (hash2(v, row, 3) < 0.5) rect(ctx, ox + 3 + v * 2, oy + 7, 2, 1, P.mortar); // ひび
      }
      if (row === 0) {
        // 上面（地面）のふち
        rect(ctx, ox, oy, TS, 3, P.cap);
        rect(ctx, ox, oy, TS, 1, P.capHi);
        if (kind === 'stone' && hash2(v, 7, 1) < 0.5) rect(ctx, ox + 4 + v, oy + 3, 3, 1, '#3d6b3a'); // 苔
        if (kind === 'night') for (let x = 1; x < TS; x += 4) rect(ctx, ox + x, oy + 1, 1, 1, '#c8d0f0');
      }
    }
  }
  // すり抜け床（3段目）
  const oy = TS * 2;
  rect(ctx, 0, oy, TS, 4, '#6b4a32'); rect(ctx, 0, oy, TS, 1, '#a07850'); rect(ctx, 0, oy + 4, TS, 1, '#2e1e14');
  rect(ctx, 6, oy + 5, 2, 4, '#3e2a1c'); rect(ctx, 3, oy + 1, 1, 1, '#3e2a1c'); rect(ctx, 11, oy + 1, 1, 1, '#3e2a1c');
  return { canvas: c, P, variants };
}
