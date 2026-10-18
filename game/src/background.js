// 階層ごとの背景（ドット絵・視差スクロール）とタイル。すべて手続き生成で、外部画像は使わない。
//   下層・市場：夕暮れの空、遠くの町並みと窓明かり、市場の梁と提灯
//   中層・歯車回廊：薄暗い機械室、回る大歯車、配管と鎖
//   上層・鐘楼：星空と月、眼下の町、石のアーチと大鐘
import { makeCanvas, rect, line, disc, circle, pset, hash2, PW } from './pix.js';

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

// 内装の型（上層・鐘楼だけ 3 通り：0 はもとの型。ほかの階はもとの型だけ）。部屋ごとに替わる
function interior(fi, v) {
  const c = makeCanvas(LAYER_W, LAYER_H), m = c.getContext('2d');
  if (fi === 2 && v === 1) {
    // 鐘の並ぶ回廊：梁から小さな鐘がいくつも下がる
    rect(m, 0, 24, LAYER_W, 6, '#121830'); rect(m, 0, 24, LAYER_W, 1, '#2a3358');
    for (let x = 20; x < LAYER_W; x += 60) {
      const len = 20 + (x % 120 ? 18 : 0); line(m, x, 30, x, 30 + len, '#2a3358');
      for (let y = 0; y < 18; y++) { const w = Math.round(4 + Math.pow(y / 18, 1.5) * 9); rect(m, x - w, 30 + len + y, w * 2, 1, '#1a2244'); }
      rect(m, x - 13, 30 + len + 18, 26, 2, '#38457a');
    }
    for (let x = 0; x < LAYER_W; x += 120) rect(m, x, 30, 10, 240, '#121830');
  } else if (fi === 2 && v === 2) {
    // ステンドグラスの間：尖った窓に色ガラス
    for (let x = 30; x < LAYER_W; x += 110) {
      rect(m, x - 6, 30, 64, 240, '#121830');
      for (let y = 0; y < 120; y++) {
        const top = y < 26 ? Math.round(26 - Math.sqrt(26 * 26 - (26 - y) * (26 - y))) : 0;
        for (let i = top; i < 52 - top; i++) if ((i + y) % 13 && y % 15) pset(m, x + i, 50 + y, ['#221a3a', '#33182a', '#18283a', '#2c2c18'][((i / 13) | 0) + ((y / 15) | 0) & 3]);
      }
      rect(m, x + 25, 50, 2, 120, '#121830');
    }
  }
  return c;
}
// 夜が進むほど荒れる（2 周目は少し、3 周目からかなり）：壁に穴が開き、梁が折れて垂れ、瓦礫が積もる
function ruinLayer(src, ruin, seed) {
  const c = makeCanvas(LAYER_W, LAYER_H), m = c.getContext('2d');
  m.drawImage(src, 0, 0);
  const n = ruin === 1 ? 5 : 14;
  m.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n; i++) { const x = hash2(i, 1, seed) * LAYER_W, y = 40 + hash2(i, 2, seed) * 180, r = 6 + hash2(i, 3, seed) * (ruin === 1 ? 10 : 22); disc(m, x, y, r, '#000'); disc(m, x + r * 0.8, y + r * 0.4, r * 0.6, '#000'); }
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
  if (variant || ruin) {
    const base = backgroundFor(fi), layers = base.layers.slice(), last = layers.length - 1;
    let mid = variant ? interior(fi, variant) : layers[last].c;
    if (ruin) mid = ruinLayer(mid, ruin, 31 + fi * 7 + variant);
    layers[last] = { ...layers[last], c: mid };
    const out = { ...base, layers, lanterns: variant ? null : base.lanterns, chains: base.chains };
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

// 背景を描く（camX, camY はドット単位の視点）
export function drawBackground(ctx, fi, camX, camY, t, maxLayers = 99, variant = 0, ruin = 0) {
  const bg = backgroundFor(fi, variant, ruin);
  for (const L of bg.layers.slice(0, maxLayers)) {
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
