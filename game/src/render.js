// 描画（ドット絵）。世界は 320×180 の低解像度バッファに描き、3 倍に拡大して表示する。
// 文字（ダメージ数値・調べる表示）と HUD は拡大後の画面にドット文字フォントで描く。
import { nightLook, drawSkyLook, drawWeather, crackAt, drawCrack } from './nightlook.js';
import { VIEW_W, VIEW_H, COLORS as C, PLAYER as PC } from './config.js';
import { SOLID, ONEWAY } from './tilemap.js';
import { cx, cy, clamp } from './util.js';
import { drawHud, drawModal, drawTitle, drawRewind, drawEnding, FONT, setTextEnv } from './ui.js';
import { PW, PH, makeCanvas, rect, pset, line, dashLine, circle, disc, wedge, arc, drawSprite } from './pix.js';
import { drawBackground, backgroundFor, gearFrame, TS } from './background.js';
// 部屋ごとの内装の型（0〜2）と、夜ごとの荒れ具合（第 2 夜は少し、第 3 夜からかなり）
// 下層・市場と中層・歯車回廊は元の背景のまま（新しい内装は上層・鐘楼だけ）
export const roomInterior = (game) => (game.run && game.room && game.run.fi === 2 && game.room.desc.type !== 'boss' ? (game.run.ri + game.run.fi) % 3 : 0);
export const ruinLevel = (meta) => (!meta || meta.flags.ending ? 0 : meta.loop >= 3 ? 2 : meta.loop === 2 ? 1 : 0);
import { spr } from './sprites.js';
import { PRISM } from './arts.js';
import { NOVA_R } from './boss.js';

const SC = VIEW_W / PW; // 3
let buf = null, b = null;
function buffer() {
  if (!buf) { buf = makeCanvas(PW, PH); b = buf.getContext('2d'); }
  b.imageSmoothingEnabled = false;
  return b;
}
let camPX = 0, camPY = 0;
// 世界座標 → 拡大後の画面座標
const SX = (wx) => (wx / 2 - camPX) * SC;
const SY = (wy) => (wy / 2 - camPY) * SC;
const W = (v) => Math.round(v / 2);

export function render(ctx, game) {
  setTextEnv(game);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = C.bg0;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (game.scene === 'title') { drawTitleScene(ctx, game); drawTitle(ctx, game); }
  else if (game.scene === 'play') renderPlay(ctx, game);
  else if (game.scene === 'rewind') drawRewind(ctx, game);
  else if (game.scene === 'ending') drawEnding(ctx, game);
  ctx.restore();
}

// タイトル：星空の時計塔（ドット絵）。真の結末を見たあとは、夜明けの空の時計塔
function drawTitleScene(ctx, game) {
  const b = buffer();
  const t = game.time;
  const dawn = !!(game.meta && game.meta.flags.endings && game.meta.flags.endings.true);
  drawBackground(b, dawn ? 'dawn' : 2, t * 6, 30, t, 2, 0, 0, PW, PH, true); // 背景はゆっくり横に流れる（星はまたたかせない）
  // 時計塔
  const tx = PW / 2, tower = dawn ? '#3a2c4e' : '#0a0d1e';
  rect(b, tx - 22, 52, 44, 140, tower);
  for (let i = 0; i < 26; i++) rect(b, tx - 26 + i, 52 - i, 52 - i * 2, 1, tower);
  rect(b, tx - 1, 18, 2, 10, tower);
  if (dawn) { rect(b, tx + 20, 52, 2, 140, '#c98a7a'); for (let i = 0; i < 26; i++) pset(b, tx + 26 - i, 52 - i, '#e8a888'); } // 朝日の当たる縁
  // 窓の明かり：点けたまま（点滅させると、手前のタイトルの文字が読みにくい）
  for (let y = 104; y < 180; y += 16) for (const dx of [-12, 9]) rect(b, tx + dx, y, 3, 6, dawn ? '#5a4870' : (y + dx * 3) % 3 === 0 ? '#c9a052' : '#1c2244');
  disc(b, tx, 70, 13, '#e8dcc4'); circle(b, tx, 70, 13, '#8c6d2a');
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; pset(b, tx + Math.cos(a) * 11, 70 + Math.sin(a) * 11, '#5a4a3a'); }
  // 逆回りの針
  const a1 = -t * 0.6 - Math.PI / 2, a2 = -t * 0.05 - Math.PI / 2;
  line(b, tx, 70, tx + Math.cos(a1) * 10, 70 + Math.sin(a1) * 10, '#1a1420');
  line(b, tx, 70, tx + Math.cos(a2) * 7, 70 + Math.sin(a2) * 7, '#1a1420', 2);
  // 楔
  for (let i = 0; i < 9; i++) rect(b, tx - 4 + Math.floor(i / 2), 86 + i, 9 - Math.floor(i / 2) * 2, 1, '#f2c14e');
  ctx.drawImage(buf, 0, 0, VIEW_W, VIEW_H);
  // 文字を読みやすくする帯
  ctx.fillStyle = dawn ? 'rgba(30,18,40,0.55)' : 'rgba(5,6,16,0.55)'; ctx.fillRect(0, 300, VIEW_W, 240);
}

function renderPlay(ctx, game) {
  const fx = game.fx, b = buffer();
  camPX = Math.round(game.cam.x / 2); camPY = Math.round(game.cam.y / 2);
  let sx = 0, sy = 0;
  if (fx.shakeT > 0) { sx = Math.round((Math.random() - 0.5) * fx.shakeMag); sy = Math.round((Math.random() - 0.5) * fx.shakeMag); }
  const fi = game.run.fi;
  if (game.silhouette) {
    rect(b, 0, 0, PW, PH, '#e9e3d6');
    b.save(); b.translate(-camPX, -camPY); b.filter = 'brightness(0)';
    for (const it of game.room.items) if (it.kind === 'npc') drawItem(b, game, it);
    for (const e of game.room.enemies) drawEnemy(b, game, e);
    drawPlayer(b, game, game.player);
    b.filter = 'none'; b.restore();
    ctx.drawImage(buf, 0, 0, VIEW_W, VIEW_H);
    return;
  }
  drawBackground(b, fi, camPX, camPY, game.time, 99, roomInterior(game), ruinLevel(game.meta), game.map.pxW / 2, game.map.pxH / 2); // 内装は上層だけ部屋ごとに 3 通り、荒れ具合は夜で
  game.look = nightLook(game.meta);
  if (!backgroundFor(fi, roomInterior(game), ruinLevel(game.meta)).indoor) drawSkyLook(b, game.look, PW, PH, game.time); // 屋内の 1 枚絵の部屋には月や光の帯を描かない
  b.save();
  b.translate(-camPX, -camPY);
  drawTiles(b, game, fi);
  for (const it of game.room.items) drawItem(b, game, it);
  for (const g of fx.ghosts) { b.globalAlpha = 0.45 * (1 - g.t / g.life); drawSprite(b, spr('hero', 'dodge', 'ghost'), (g.x + g.w / 2) / 2, (g.y + g.h) / 2, g.face); }
  b.globalAlpha = 1;
  for (const e of game.room.enemies) drawEnemy(b, game, e);
  // 激ムズ：盾を構えた敵（青い半円と光）
  for (const e of game.room.enemies) if (e.guardT > 0 && e.alive) {
    const x = Math.round(cx(e) / 2) + e.face * 6, y = Math.round(cy(e) / 2);
    arc(b, x, y, 9, e.face > 0 ? -1.2 : Math.PI - 1.2 + 0, e.face > 0 ? 1.2 : Math.PI + 1.2, '#7fc8ff', 2);
    glow(b, x + e.face * 3, y, 5 + Math.sin(game.time * 30), '#9fd0ff', 0.6);
  }
  // 激ムズ：床が震える予兆（床のふちが赤く脈打つ）
  if (game.room.quake && game.room.quake.tell) {
    const k = game.room.quake.tell / 1.15, map = game.map;
    b.globalAlpha = 0.35 + 0.5 * k * (0.6 + 0.4 * Math.sin(game.time * 30));
    const x0 = Math.max(0, Math.floor(camPX / TS) - 1), x1 = Math.min(map.w, Math.ceil((camPX + PW) / TS) + 1);
    for (let ty = 1; ty < map.h; ty++) for (let tx = x0; tx < x1; tx++) if (map.get(tx, ty) !== 0 && map.get(tx, ty - 1) === 0) rect(b, tx * TS, ty * TS - 2, TS, 3, '#ff3a3a');
    b.globalAlpha = 1;
  }
  // 対策をしてきた敵：頭上に小さな赤い目
  for (const e of game.room.enemies) if (e.counter && e.alive && !e.boss) { const x = Math.round(cx(e) / 2), y = Math.round(e.y / 2) - 4; pset(b, x - 1, y, '#ff4a2a'); pset(b, x + 1, y, '#ff4a2a'); pset(b, x, y - 1, '#ffb0a0'); }
  drawPlayer(b, game, game.player);
  for (const c of [game.comp, ...(game.allies || [])]) if (c) drawCompanion(b, game, c, game.time);
  if (game.union) drawUnion(b, game, game.union, game.time);
  if (game.player.wardUp && game.player.state !== 'dead') { const px = Math.round(cx(game.player) / 2), py = Math.round(cy(game.player) / 2); glow(b, px, py, 12, '#9fe3ff', 0.18 + 0.08 * Math.sin(game.time * 4)); circle(b, px, py, 12, '#9fe3ff'); } // 時の盾
  // 守りの秒針（常時の術）
  if (game.player.cloud && game.player.state !== 'dead') { // 頭上の雷雲
    const c = game.player.cloud, x = Math.round(c.x / 2), y = Math.round(c.y / 2) + Math.round(Math.sin(game.time * 3));
    const big = game.player.cloud.big;
    if (big) { for (const [dx, dy, r] of [[-9, 2, 4], [9, 2, 4]]) disc(b, x + dx, y + dy, r, '#3a4058'); if (Math.floor(game.time * 10) % 4 === 0) line(b, x - 3, y + 6, x - 1, y + 10, '#ffe14a'); }
    for (const [dx, dy, r] of [[-5, 1, 4], [0, -1, 5], [5, 1, 4]]) disc(b, x + dx, y + dy, r, '#4a5266');
    for (const [dx, dy, r] of [[-4, 0, 3], [1, -2, 3]]) disc(b, x + dx, y + dy, r, '#6a7590');
    if (Math.floor(game.time * 6) % 5 === 0) pset(b, x + 2, y + 5, '#cfe8ff');
  }
  for (const g of game.player.orbitGears || []) { // 歯車の輪舞：大きな回る歯車
    const x = Math.round(g.x / 2), y = Math.round(g.y / 2);
    disc(b, x, y, 3, '#8a6a34'); pset(b, x, y, '#ffe14a');
    for (let i = 0; i < 6; i++) { const a2 = g.a * 3 + i / 6 * Math.PI * 2; pset(b, x + Math.round(Math.cos(a2) * 4), y + Math.round(Math.sin(a2) * 4), i % 2 ? '#f2c14e' : '#c9a052'); }
  }
  for (const sat of game.player.satellites || []) { // 衛星：尾を引く光の球
    const x = Math.round(sat.x / 2), y = Math.round(sat.y / 2);
    for (let i = 1; i <= 5; i++) { const a2 = sat.a - i * 0.12; const p2 = game.player; const R = sat.big ? 42 : 35; b.globalAlpha = 0.5 - i * 0.08; pset(b, Math.round(cx(p2) / 2 + Math.cos(a2) * R), Math.round(cy(p2) / 2 + Math.sin(a2) * R * 0.7), sat.big ? '#ffe9a0' : '#9fe3ff'); }
    b.globalAlpha = 1;
    glow(b, x, y, sat.big ? 6 : 4, sat.big ? '#ffd84a' : '#7fd0ff', 0.9);
  }
  if (game.player.clockhand && game.player.state !== 'dead') { // 時計の長針
    const c = game.player.clockhand, hx = Math.round(c.x / 2), hy = Math.round(c.y / 2), L = c.len / 2;
    for (let i = 4; i >= 1; i--) { b.globalAlpha = 0.1 * (5 - i); const a2 = c.a - i * 0.09; line(b, hx, hy, hx + Math.cos(a2) * L, hy + Math.sin(a2) * L, '#ffd84a', 2); }
    b.globalAlpha = 1;
    glowLine(b, hx, hy, hx + Math.cos(c.a) * L, hy + Math.sin(c.a) * L, '#ffd84a', 4); line(b, hx, hy, hx + Math.cos(c.a) * L, hy + Math.sin(c.a) * L, '#ffffff', 1);
    glow(b, hx + Math.cos(c.a) * L, hy + Math.sin(c.a) * L, 4, '#ffffff', 0.8);
  }
  for (const h of game.player.orbitHands || []) {
    const x = Math.round(h.x / 2), y = Math.round(h.y / 2), ux = Math.cos(h.a + Math.PI / 2), uy = Math.sin(h.a + Math.PI / 2);
    line(b, x - ux * 3, y - uy * 3, x + ux * 3, y + uy * 3, '#f2c14e', 2);
    pset(b, x + ux * 4, y + uy * 4, '#ffffff');
  }
  for (const k of game.room.pickups || []) drawPickup(b, k, game.time);
  for (const s of fx.slashes) drawSlash(b, s);
  for (const s of fx.strikes || []) drawStrike(b, s);
  for (const sp of game.room.spells || []) { drawSpell(b, sp, game.time); haloFor(b, sp); }
  for (const im of fx.impacts || []) drawImpact(b, im);
  for (const pr of game.room.projectiles) drawProjectile(b, pr, game.time);
  for (const r of fx.rings) {
    const k = r.t / r.life;
    b.globalAlpha = 1 - k;
    const rr = (r.r * (0.3 + 0.7 * k)) / 2;
    if (r.flat) { // 足元の平たい輪（2段ジャンプ）
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; pset(b, r.x / 2 + Math.cos(a) * rr, r.y / 2 + Math.sin(a) * rr * 0.3, r.color); }
    } else circle(b, r.x / 2, r.y / 2, rr, r.color);
  }
  for (const s of fx.pillars || []) { // 撃破の光の柱：太く立ち上がり、細くなって消える
    const k = s.t / s.life, x = Math.round(s.x / 2), y = Math.round(s.y / 2);
    const w = Math.max(1, Math.round(22 * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85)));
    b.globalAlpha = 0.35 * (1 - k); rect(b, x - w - 4, 0, (w + 4) * 2, y, s.color);
    b.globalAlpha = 0.9 * (1 - k); rect(b, x - w, 0, w * 2, y, '#fff6d8');
    b.globalAlpha = 1;
  }
  for (const f of fx.flares || []) { // 放射状の光の筋：伸びながら細くなって消える
    const k = f.t / f.life, x = f.x / 2, y = f.y / 2;
    const r0 = f.r / 2 * (0.15 + 0.5 * k), r1 = f.r / 2 * (0.45 + 0.75 * Math.sqrt(k));
    b.globalAlpha = Math.max(0, 1 - k);
    for (let i = 0; i < f.rays; i++) {
      const a = f.rot + i / f.rays * Math.PI * 2, long = i % 2 ? 0.7 : 1;
      line(b, x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1 * long, y + Math.sin(a) * r1 * long, f.colors[i % f.colors.length]);
    }
    b.globalAlpha = 1;
  }
  for (const s of fx.twinkles || []) { // キラキラ：十字の光が膨らんで縮む
    if (s.t < 0) continue;
    const k = s.t / s.life, n = Math.max(1, Math.round(s.size * Math.sin(k * Math.PI)));
    const x = Math.round(s.x / 2), y = Math.round(s.y / 2);
    b.globalAlpha = Math.min(1, 1.4 * (1 - k));
    rect(b, x - n, y, n * 2 + 1, 1, s.color); rect(b, x, y - n, 1, n * 2 + 1, s.color);
    pset(b, x, y, '#ffffff');
    b.globalAlpha = 1;
  }
  for (const s of fx.streaks || []) { // 跳躍の風切り線
    const k = s.t / s.life;
    b.globalAlpha = 0.6 * (1 - k);
    for (const dx of [-5, 0, 5]) line(b, s.x / 2 + dx, s.y / 2 + 2 + k * 6, s.x / 2 + dx, s.y / 2 + 6 + k * 10 - Math.abs(dx) * 0.4, '#e8e0cc');
  }
  b.globalAlpha = 1;
  for (const p of fx.parts) {
    b.globalAlpha = Math.min(1, 1.6 * (1 - p.t / p.life));
    const s = Math.max(1, Math.round(p.size / 2));
    rect(b, p.x / 2 - s / 2, p.y / 2 - s / 2, s, s, p.color);
  }
  b.globalAlpha = 1;
  b.restore();
  drawWeather(b, game.look, PW, PH, game.time); // 夜ごとの天気と色
  ctx.drawImage(buf, sx * SC, sy * SC, VIEW_W, VIEW_H);

  // ここから拡大後の画面
  drawWorldLabels(ctx, game);
  drawPrompt(ctx, game);
  for (const t of fx.texts) {
    ctx.globalAlpha = 1 - Math.max(0, t.t / t.life - 0.5) * 2;
    ctx.font = `${Math.round(t.size * 1.25)}px ${FONT}`; ctx.textAlign = 'center';
    const x = Math.round(SX(t.x)), y = Math.round(SY(t.y));
    ctx.fillStyle = '#0a0610';
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) ctx.fillText(t.str, x + dx, y + dy);
    ctx.fillStyle = t.color; ctx.fillText(t.str, x, y);
  }
  ctx.globalAlpha = 1;
  // 時止め：彩度を落とす
  if (game.timeStopT > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = 'hsl(0,0%,50%)'; ctx.globalAlpha = Math.min(1, game.timeStopT * 4);
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
    ctx.fillStyle = 'rgba(180,200,255,0.08)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (fx.vignette > 0) pixelVignette(ctx, `rgba(200,20,20,${0.5 * fx.vignette})`, 1);
  const p = game.player;
  if (p.hp > 0 && p.hp / p.maxHp < 0.3) pixelVignette(ctx, `rgba(150,0,0,${0.18 + Math.sin(game.time * 6) * 0.08})`, 0.8);
  if (fx.flash > 0) { ctx.globalAlpha = fx.flash; ctx.fillStyle = fx.flashColor; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = 1; }
  if (!game.cinema) drawHud(ctx, game); // cinema：紹介動画の撮影用（HUD を出さない）
  if (game.transition) {
    // 縦じまのワイプ
    const t = game.transition.t;
    const k = clamp(t < 0.22 ? t / 0.22 : 1 - (t - 0.22) / 0.22, 0, 1);
    ctx.fillStyle = '#05040a';
    for (let x = 0; x < VIEW_W; x += 24) ctx.fillRect(x, 0, Math.ceil(24 * k), VIEW_H);
  }
  if (p.state === 'dead') {
    const a = clamp(game.run.deathT / 1.6, 0, 1);
    ctx.fillStyle = `rgba(10,5,15,${a * 0.85})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (game.modal) drawModal(ctx, game);
}

// 画面の縁を段々に塗る（にじまない周辺減光）
function pixelVignette(ctx, color, strength) {
  ctx.fillStyle = color;
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const m = 12 * (i + 1) * strength;
    ctx.globalAlpha = (steps - i) / steps;
    ctx.fillRect(0, 0, VIEW_W, m / 2); ctx.fillRect(0, VIEW_H - m / 2, VIEW_W, m / 2);
    ctx.fillRect(0, 0, m, VIEW_H); ctx.fillRect(VIEW_W - m, 0, m, VIEW_H);
  }
  ctx.globalAlpha = 1;
}

// ───────── タイル ─────────
function drawTiles(b, game, fi) {
  const map = game.map, tiles = backgroundFor(fi).tiles;
  const x0 = Math.max(0, Math.floor(camPX / TS) - 1), x1 = Math.min(map.w, Math.ceil((camPX + PW) / TS) + 1);
  const y0 = Math.max(0, Math.floor(camPY / TS) - 1), y1 = Math.min(map.h, Math.ceil((camPY + PH) / TS) + 1);
  for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
    const t = map.get(tx, ty);
    const x = tx * TS, y = ty * TS;
    if (t === SOLID) {
      const top = ty > 0 && map.get(tx, ty - 1) !== SOLID;
      const v = (tx * 7 + ty * 13) % tiles.variants;
      b.drawImage(tiles.canvas, v * TS, top ? 0 : TS, TS, TS, x, y, TS, TS);
      // 側面と天井の影
      if (tx > 0 && map.get(tx - 1, ty) !== SOLID) rect(b, x, y, 1, TS, tiles.P.hi);
      if (tx < map.w - 1 && map.get(tx + 1, ty) !== SOLID) rect(b, x + TS - 1, y, 1, TS, tiles.P.under);
      if (ty < map.h - 1 && map.get(tx, ty + 1) === 0) rect(b, x, y + TS - 2, TS, 2, tiles.P.under);
      if (crackAt(tx, ty, game.look)) drawCrack(b, x, y, TS, tx, ty); // 夜が進むほど増えるひび
    } else if (t === ONEWAY) {
      b.drawImage(tiles.canvas, 0, TS * 2, TS, 10, x, y, TS, 10);
    }
  }
}

// ───────── プレイヤー ─────────
function heroFrame(p, t) {
  if (p.state === 'dead') return 'dead';
  if (p.state === 'hurt') return 'hurt';
  if (p.state === 'dodge') return 'dodge';
  if (p.state === 'attack') return 'attack';
  if (p.state === 'charge') return 'charge';
  if (!p.onGround) return p.vy < 0 ? 'up' : 'down';
  if (Math.abs(p.vx) > 30) return 'run' + (Math.floor(p.runAnim * 0.55) % 4);
  return Math.floor(t * 1.6) % 2 ? 'idle1' : 'idle0';
}
// ───────── お供 ─────────
// 段階ごとに姿が変わる：1 小さく素朴 → 2 大きく飾りが増える → 3 光をまとい冠や翼が増える
function drawCompanion(b, game, c, t) {
  const x = Math.round(c.x / 2), y = Math.round(c.y / 2), f = c.face || 1, s = c.stage;
  const flap = Math.floor(t * (c.dash ? 30 : 12)) % 2;
  // 攻撃の演出
  for (const sh of c.shots) {
    const sx = Math.round(sh.x / 2), sy = Math.round(sh.y / 2);
    if (sh.kind === 'orb') { glow(b, sx, sy, 4, '#ffe14a', 0.6); disc(b, sx, sy, 1, '#ffffff'); }
    else if (sh.kind === 'gear') { const a = sh.spin || 0; glow(b, sx, sy, 4, '#c9a052', 0.4); disc(b, sx, sy, 3, '#8a6a3a'); for (let i = 0; i < 6; i++) pset(b, Math.round(sx + Math.cos(a + i) * 4), Math.round(sy + Math.sin(a + i) * 4), '#e8c070'); }
  }
  for (const fx of c.fx) {
    if (fx.t < 0) continue;
    const k = fx.t / fx.life;
    if (fx.kind === 'beam') { b.globalAlpha = 1 - k * 0.6; const ex = fx.wide ? fx.x1 + Math.cos(Math.atan2(fx.y2 - fx.y1, fx.x2 - fx.x1)) * 320 : fx.x2, ey = fx.wide ? fx.y1 + Math.sin(Math.atan2(fx.y2 - fx.y1, fx.x2 - fx.x1)) * 320 : fx.y2; glowLine(b, fx.x1 / 2, fx.y1 / 2, ex / 2, ey / 2, fx.wide ? '#fff0a0' : '#ffe14a', fx.wide ? 4 : 2); line(b, fx.x1 / 2, fx.y1 / 2, ex / 2, ey / 2, '#ffffff'); b.globalAlpha = 1; }
    else if (fx.kind === 'spark' && !fx.done) { const fy = fx.y / 2 - 40 * (1 - fx.t / fx.at); glow(b, fx.x / 2, fy, 3, '#ffe14a', 0.7); line(b, fx.x / 2, fy - 4, fx.x / 2, fy, '#fff6c0'); }
    else if (fx.kind === 'bolt') { b.globalAlpha = 1 - k; let px = fx.x / 2, py = fx.top / 2; const by = fx.y / 2; while (py < by) { const nx = px + (Math.random() - 0.5) * 6, ny = Math.min(by, py + 6); glowLine(b, px, py, nx, ny, '#cfe8ff', 2); line(b, px, py, nx, ny, '#ffffff'); px = nx; py = ny; } b.globalAlpha = 1; }
    else if (fx.kind === 'claw') { b.globalAlpha = 1 - k; for (let i = 0; i < fx.n; i++) { const o = (i - (fx.n - 1) / 2) * 3; line(b, fx.x / 2 - 6 + o, fx.y / 2 - 6, fx.x / 2 + 6 + o, fx.y / 2 + 6, '#ffffff', 1); } glowLine(b, fx.x / 2 - 6, fx.y / 2 - 6, fx.x / 2 + 6, fx.y / 2 + 6, '#d8c8ff', 2); b.globalAlpha = 1; }
    else if (fx.kind === 'bell') { b.globalAlpha = 1 - k; circle(b, fx.x / 2, fx.y / 2, Math.round(fx.r / 2 * Math.min(1, k * 2)), '#d8c8ff'); b.globalAlpha = 1; }
    else if (fx.kind === 'shadow' && fx.done) { b.globalAlpha = 1 - k; const a = fx.a || 0; glowLine(b, fx.x / 2 - Math.cos(a) * 12, fx.y / 2 - Math.sin(a) * 12, fx.x / 2 + Math.cos(a) * 12, fx.y / 2 + Math.sin(a) * 12, '#b89cff', 2); line(b, fx.x / 2 - Math.cos(a) * 12, fx.y / 2 - Math.sin(a) * 12, fx.x / 2 + Math.cos(a) * 12, fx.y / 2 + Math.sin(a) * 12, '#ffffff'); b.globalAlpha = 1; }
  }
  if (c.pop > 0) { glow(b, x, y, 10 + c.pop * 6, COMPANIONS_COLOR[c.id], 0.5); }
  if (game.player.compShield) circle(b, Math.round(cx(game.player) / 2), Math.round(cy(game.player) / 2), 9, '#9fe3ff');
  // 本体（段階が上がるほど大きく描く）
  const k = [1.4, 1.75, 2.1][s - 1];
  b.save(); b.translate(x, y); b.scale(k, k); b.translate(-x, -y);
  if (c.id === 'hotaru') { // 灯り蛍
    if (s >= 3) { glow(b, x, y, 4, '#fff0a0', 0.4); for (let i = 0; i < 3; i++) pset(b, x - 2 + i * 2, y - 5, i === 1 ? '#ffffff' : '#ffe14a'); } // 星の冠
    const wc = s >= 2 ? '#cfe8ff' : '#a8b8d0';
    if (flap) { pset(b, x - 2, y - 2, wc); pset(b, x + 1, y - 2, wc); if (s >= 2) { pset(b, x - 3, y - 3, wc); pset(b, x + 2, y - 3, wc); } }
    else { pset(b, x - 2, y - 1, wc); pset(b, x + 1, y - 1, wc); }
    rect(b, x - 1, y - 1, 2, 2, '#3a2a1a'); // 頭と胸
    const tail = s >= 2 ? 3 : 2;
    glow(b, x - f * 2, y + 1, s >= 2 ? 4 : 3, '#ffe14a', 0.55 + 0.25 * Math.sin(t * 6));
    rect(b, f > 0 ? x - tail : x, y, tail, 2, s >= 2 ? '#ffb04a' : '#ffe14a'); // 光る尾
    if (s >= 2) { pset(b, x + f, y - 3, '#3a2a1a'); pset(b, x + f * 2, y - 4, '#3a2a1a'); } // 触角
  } else if (c.id === 'neji') { // 歯車の小鳥
    const body = s >= 3 ? '#e8c070' : s >= 2 ? '#c9a052' : '#8a8a96', dark = s >= 2 ? '#7a5a2a' : '#5a5a66';
    if (s >= 3) glow(b, x, y, 4, '#9fd0ff', 0.35);
    disc(b, x, y, s >= 2 ? 2 : 1, body); rect(b, x - 1, y - 1, 3, 2, body);
    pset(b, x + f * 2, y - 1, '#ffb04a'); pset(b, x + f * 3, y - 1, '#ffb04a'); // くちばし
    pset(b, x + f, y - 2, '#1a1a22'); // 目
    const wy = flap ? -3 : 0; line(b, x - f, y, x - f * 3, y + wy, dark); if (s >= 2) line(b, x - f, y + 1, x - f * 4, y + 1 + wy, dark);
    if (s >= 2) { pset(b, x - f * 3, y + 2, dark); pset(b, x - f * 4, y + 3, dark); } // 尾羽
    if (s >= 3) { pset(b, x, y - 4, '#cfe8ff'); pset(b, x + 1, y - 5, '#ffffff'); pset(b, x - 1, y - 4, '#cfe8ff'); } // 雷の冠羽
  } else { // 時計の猫
    const body = s >= 3 ? '#e8e0ff' : s >= 2 ? '#3a3248' : '#1e1a26', eye = s >= 3 ? '#b89cff' : '#ffe14a';
    if (s >= 3) glow(b, x, y, 4, '#b89cff', 0.4);
    rect(b, x - 2, y - 1, 5, 3, body); rect(b, x + f * 2 - (f > 0 ? 0 : 1), y - 3, 2, 3, body); // 胴と頭
    pset(b, x + f * 2, y - 4, body); pset(b, x + f * 3, y - 4, body); // 耳
    pset(b, x + f * 3, y - 2, eye);
    const tw = Math.round(Math.sin(t * 5) * 1.5);
    const tails = s >= 3 ? 3 : 1;
    for (let i = 0; i < tails; i++) line(b, x - f * 3, y, x - f * (5 + i), y - 3 - i + tw, body);
    if (s >= 2) { pset(b, x + f, y + 1, '#ffe14a'); } // 首の鈴
    if (flap && !c.dash) { pset(b, x - 1, y + 2, body); pset(b, x + 2, y + 2, body); } else { pset(b, x - 2, y + 2, body); pset(b, x + 1, y + 2, body); }
  }
  b.restore();
}
// 仲間技「夜明けの協奏」：金色に染まり、主人公とお供から光の線が結ばれ、最後に夜明けの光が部屋を満たす
function drawUnion(b, game, u, t) {
  const p = game.player, px = Math.round(cx(p) / 2), py = Math.round(cy(p) / 2);
  const comps = [game.comp, ...(game.allies || [])].filter(Boolean);
  const k = Math.min(1, u.t / 0.4);
  b.save(); b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalAlpha = 0.22 * k * (u.dawn ? Math.max(0, 1 - (u.t - 2.0) / 0.6) : 1); b.fillStyle = '#ffcf6a'; b.fillRect(0, 0, b.canvas.width, b.canvas.height);
  b.restore(); b.globalAlpha = 1;
  // 主人公とお供を結ぶ光の三角
  for (let i = 0; i < comps.length; i++) {
    const a = comps[i], c2 = comps[(i + 1) % comps.length];
    glowLine(b, a.x / 2, a.y / 2, c2.x / 2, c2.y / 2, '#ffe6a0', 2);
    glowLine(b, a.x / 2, a.y / 2, px, py, '#fff6d0', 1);
  }
  // 主人公から放射する光
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + t * 0.8, r = 20 + 14 * Math.sin(t * 6 + i); b.globalAlpha = 0.5 * k; line(b, px, py, px + Math.round(Math.cos(a) * r), py + Math.round(Math.sin(a) * r), '#fff0b0'); }
  b.globalAlpha = 1;
  glow(b, px, py, 10 + 4 * Math.sin(t * 10), '#ffe6a0', 0.6);
  // 夜明けの一閃：地平線から昇る光の帯
  if (u.dawn) { const d = Math.min(1, (u.t - 2.0) / 0.3); b.save(); b.setTransform(1, 0, 0, 1, 0, 0); b.globalAlpha = Math.max(0, 0.8 - (u.t - 2.0) * 1.2); b.fillStyle = '#ffffff'; b.fillRect(0, Math.round(b.canvas.height * (1 - d)), b.canvas.width, Math.round(b.canvas.height * d)); b.restore(); b.globalAlpha = 1; }
}
const COMPANIONS_COLOR = { hotaru: '#ffe14a', neji: '#9fd0ff', chiku: '#d8c8ff' };

function drawPlayer(b, game, p) {
  const blink = p.state === 'hurt' || (p.iframeT > 0 && !p.dodging && p.state !== 'dead' && p.state !== 'autodash' && p.state !== 'travel');
  if (blink && Math.floor(game.time * 20) % 2 === 0) return;
  const f = p.face, t = game.time;
  const bx = Math.round(cx(p) / 2), by = Math.round((p.y + p.h) / 2);
  const frame = heroFrame(p, t);
  b.save();
  if (p.state === 'dead') b.globalAlpha = clamp(1 - game.run.deathT / 1.4, 0, 1);
  if (p.state !== 'dead') {
    // マフラー（風になびく 2 ドット幅の布）
    const sway = Math.sin(t * 9);
    const back = clamp(Math.abs(p.vx) / 80, 0, 3) + (p.dodging ? 3 : 0);
    const nx = bx - f * 2, ny = by - 9 + (frame === 'charge' ? 1 : 0);
    const mx = nx - f * (4 + back), my = ny - 1 + Math.round(sway - p.vy / 300);
    const ex = nx - f * (8 + back * 2), ey = ny + 1 + Math.round(sway * 1.6 - p.vy / 160);
    line(b, nx, ny, mx, my, '#d24d3a', 2);
    line(b, mx, my, ex, ey, '#d24d3a', 2);
    pset(b, ex, ey + 1, '#8e2a22'); pset(b, ex - f, ey + 1, '#8e2a22');
  }
  // 溜めの光
  if (p.state === 'charge') {
    const k = clamp(p.holdT / PC.heavyCharge, 0, 1);
    if (p.charged) { b.globalAlpha = 0.6 + Math.sin(t * 30) * 0.3; circle(b, bx, by - 8, 11, '#f2c14e'); b.globalAlpha = 1; }
    else arc(b, bx, by - 8, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, '#c9a052');
  }
  if (p.dodging) b.globalAlpha = 0.75;
  // 体の動き：攻撃は振りかぶりで少し引き、振り抜きで前へ踏み込む。跳躍はクルッと前転。着地は少し潰れる
  let ox = 0, rot = 0;
  if (p.state === 'attack' && p.atk) {
    const d = p.atk.def, at = p.atk.t;
    ox = at < d.startup ? -f : at < d.startup + d.active ? f * 2 : f;
  }
  if (p.flipT > 0 && p.state !== 'attack' && p.state !== 'dead') rot = (1 - p.flipT / 0.34) * Math.PI * 2 * f;
  // 降りながらの回転斬り：体ごと 2 回転
  if (p.state === 'attack' && p.atk && p.atk.name === 'dropSpin') { const d = p.atk.def; rot = clamp((p.atk.t - d.startup) / d.active, 0, 1) * Math.PI * 4 * f; ox = 0; }
  const sq = p.squash || 0;
  if (rot || sq) {
    b.save();
    b.translate(bx + ox, by - 8); if (rot) b.rotate(rot);
    if (sq) b.scale(1 - sq * 0.25, 1 + sq * 0.35);
    drawSprite(b, spr('hero', frame), 0, 8, f);
    b.restore();
  } else drawSprite(b, spr('hero', frame), bx + ox, by, f);
  b.globalAlpha = p.state === 'dead' ? b.globalAlpha : 1;
  // 剣：攻撃中は前へ、ふだんは背中
  if (p.state === 'attack' && p.atk) {
    // 剣は技ごとの軌道に沿って回る（振りかぶり → 振り抜き → 残心）
    const d = p.atk.def, at = p.atk.t;
    const k = at < d.startup ? 0 : clamp((at - d.startup) / Math.max(0.01, d.active), 0, 1);
    const wind = at < d.startup ? at / Math.max(0.01, d.startup) : 1;
    const ease = 1 - Math.pow(1 - k, 2);
    const ARC = { dropSpin: [-90, 630], combo1: [-110, 35], combo2: [55, -100], combo3: [-170, 45], combo4: [-90, 270], air: [-150, 100], parry: [-130, 50], up: [20, -200], upAir: [20, -200], down: [100, 90], sweep: [175, 5], heavy: [-160, 0] };
    const [a0, a1] = ARC[p.atk.name] || [-100, 30];
    const deg = at < d.startup ? a0 - 15 * wind : a0 + (a1 - a0) * ease;
    const rad = deg * Math.PI / 180;
    const hx = bx + ox + f * 2, hy = by - (p.atk.name === 'sweep' ? 4 : 9);
    const len = p.atk.name === 'heavy' && at >= d.startup ? 16 : 13;
    const tx2 = hx + f * Math.cos(rad) * len, ty2 = hy + Math.sin(rad) * len;
    const activeNow = at >= d.startup && at < d.startup + d.active;
    if (activeNow) glowLine(b, hx, hy, tx2, ty2, p.atk.name === 'parry' ? '#ffe14a' : '#cfe8ff', 3);
    line(b, hx, hy, tx2, ty2, activeNow ? '#ffffff' : '#e8eef6');
    pset(b, hx - f, hy, '#8a6a3a'); pset(b, hx, hy + 1, '#c9a052'); // 鍔と柄
  } else if (p.state !== 'dead') {
    line(b, bx - f * 2, by - 6, bx - f * 6, by - 1, '#9aa4b4');
  }
  // 楔を打つ動作
  if (p.state === 'channel') {
    const k = clamp(p.stateT / p.channel.duration, 0, 1);
    arc(b, bx, by - 8, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, '#f2c14e', 2);
  }
  b.restore();
}

// 斬撃：段ごとに形を変える。振り抜きに合わせて弧が伸び、古い部分ほど暗く消える
function sweep(b, x, y, r, a0, a1, k, col, th, dim) {
  const prog = Math.min(1, k * 2.6);
  const end = a0 + (a1 - a0) * prog;
  const tail = a0 + (a1 - a0) * Math.max(0, prog - 0.55);
  arc(b, x, y, r, Math.min(tail, end), Math.max(tail, end), col, th);
  if (dim) arc(b, x, y, r - th, Math.min(a0, tail), Math.max(a0, tail), dim, 1);
}
// 敵の攻撃の斬光：攻撃の範囲を、向きの側へ弧を描いて薙ぐ三日月（外側が色、芯が白）と、後ろへ流れる風切り線
function drawStrike(b, s) {
  const k = s.t / s.life, cx0 = (s.x + s.w / 2) / 2, cy0 = (s.y + s.h / 2) / 2;
  const rx = Math.max(6, s.w / 2 / 2 + 2), ry = Math.max(6, s.h / 2 / 2 + 2);
  const a0 = -Math.PI / 2 - 0.9, sweep = (Math.PI + 1.8) * Math.min(1, k * 1.8);
  b.globalAlpha = 1 - k;
  for (let i = 0; i <= 18; i++) {
    const a = a0 + sweep * (i / 18), x = cx0 + s.dir * Math.cos(a) * rx, y = cy0 + Math.sin(a) * ry;
    const thick = s.big ? 3 : 2;
    rect(b, Math.round(x - thick / 2), Math.round(y - thick / 2), thick, thick, s.color);
    pset(b, Math.round(x - s.dir), Math.round(y), '#ffffff');
  }
  for (let i = 0; i < (s.big ? 5 : 3); i++) { const y = Math.round(cy0 - ry / 2 + (i * ry) / (s.big ? 2.5 : 1.5)); const x = Math.round(cx0 - s.dir * (rx + 4 + k * 12)); rect(b, Math.min(x, x - s.dir * 8), y, 8, 1, s.color); }
  b.globalAlpha = 1;
}
function drawSlash(b, s) {
  const p = s.owner, k = s.t / s.life, f = s.face;
  const x = cx(p) / 2 + (s.name === 'combo4' ? 0 : f * 4), y = cy(p) / 2 - 1;
  const mir = (a) => (f > 0 ? a : Math.PI - a);
  b.globalAlpha = 1 - Math.max(0, k - 0.5) * 2;
  switch (s.name) {
    case 'combo1': // 横一文字の三日月＋流れる線
      sweep(b, x, y, 17, mir(-0.45 * Math.PI), mir(0.3 * Math.PI), k, '#fff8e6', 3, 'rgba(255,248,230,0.35)');
      for (let i = 0; i < 3; i++) line(b, x - f * (6 + i * 5), y - 4 + i * 4, x - f * (12 + i * 5), y - 4 + i * 4, 'rgba(255,255,255,0.45)');
      break;
    case 'combo2': // 斬り上げ
      sweep(b, x, y, 17, mir(0.4 * Math.PI), mir(-0.55 * Math.PI), k, '#fff8e6', 3, 'rgba(255,248,230,0.35)');
      if (k > 0.3) { const a = mir(-0.5 * Math.PI); pset(b, x + Math.cos(a) * 19, y + Math.sin(a) * 19, '#ffffff'); pset(b, x + Math.cos(a) * 21 + f, y + Math.sin(a) * 21 - 1, '#ffe14a'); }
      break;
    case 'combo3': { // 叩き下ろし＋地面の亀裂
      sweep(b, x, y, 21, mir(-0.8 * Math.PI), mir(0.4 * Math.PI), k, '#ffffff', 4, 'rgba(255,220,160,0.4)');
      if (k > 0.35) {
        const gy = Math.round((p.y + p.h) / 2), gx = x + f * 14;
        for (let i = 0; i < 6; i++) pset(b, gx + f * i * 2, gy - 1 - (i % 2), '#ffd08a');
        line(b, gx - 3, gy - 1, gx + 3, gy - 1, '#ffffff');
      }
      break;
    }
    case 'dropSpin': { // 降りながらの回転斬り：二重の円の軌跡
      sweep(b, x, y, 22, -Math.PI / 2, Math.PI * 1.5, Math.min(1, k * 2), '#cfe8ff', 3, 'rgba(200,230,255,0.3)');
      if (k > 0.5) sweep(b, x, y, 27, -Math.PI / 2, Math.PI * 1.5, (k - 0.5) * 2, '#ffffff', 2, 'rgba(255,255,255,0.25)');
      break;
    }
    case 'combo4': // 回転斬り：時計の目盛りつき
      sweep(b, x, y, 24, -Math.PI / 2, Math.PI * 1.5, k, '#fff8e6', 3, 'rgba(255,248,230,0.3)');
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; if (i / 12 < k * 2.6) pset(b, x + Math.cos(a) * 28, y + Math.sin(a) * 28, i % 3 ? '#c9a052' : '#ffe14a'); }
      break;
    case 'heavy': { // 時計の針の突き＋文字盤の衝撃
      const len = Math.round(42 * Math.min(1, k * 3));
      line(b, x, y - 1, x + f * len, y - 1, '#f2c14e', 3);
      line(b, x, y - 1, x + f * len, y - 1, '#fff6d0', 1);
      for (let i = 0; i < 4; i++) rect(b, x + f * (len + i) - (f < 0 ? 0 : 0), y - 1 - (3 - i), 1, (3 - i) * 2 + 1, '#f2c14e');
      if (k > 0.25) {
        const cxx = x + f * 40, r = Math.round(6 + (k - 0.25) * 22);
        circle(b, cxx, y - 1, r, '#ffe14a');
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; pset(b, cxx + Math.cos(a) * (r + 2), y - 1 + Math.sin(a) * (r + 2), '#c9a052'); }
      }
      break;
    }
    case 'parry': { // パリィ斬り：幅の広い金と白の二重の三日月＋光の粒
      sweep(b, x, y, 26, mir(-0.6 * Math.PI), mir(0.45 * Math.PI), k, '#ffe14a', 4, 'rgba(255,225,74,0.4)');
      sweep(b, x + f * 4, y, 19, mir(-0.5 * Math.PI), mir(0.4 * Math.PI), k, '#ffffff', 2);
      if (k > 0.2) for (let i = 0; i < 6; i++) { const a = mir(-0.5 * Math.PI + i * 0.18 * Math.PI); const rr = 28 + (i % 2) * 4 + k * 6; pset(b, x + Math.cos(a) * rr, y + Math.sin(a) * rr, i % 2 ? '#ffffff' : '#ffe14a'); }
      break;
    }
    case 'up': case 'upAir': { // 頭上の斬り上げ：前から背中へ大きな弧＋上へ散る光
      sweep(b, x - f * 4, y - 4, 20, mir(-0.05 * Math.PI), mir(-0.95 * Math.PI), k, '#fff8e6', 3, 'rgba(255,248,230,0.35)');
      sweep(b, x - f * 4, y - 4, 14, mir(-0.15 * Math.PI), mir(-0.85 * Math.PI), k, '#9fe3ff', 1);
      if (k > 0.25) for (let i = 0; i < 4; i++) pset(b, x - f * 4 + (i - 1.5) * 6, y - 26 - k * 10 - (i % 2) * 3, i % 2 ? '#ffffff' : '#ffe14a');
      break;
    }
    case 'down': { // 下突き：足元へ縦一直線の突き＋下向きの三日月
      const len = Math.round(22 * Math.min(1, k * 3));
      line(b, x - f * 4, y + 2, x - f * 4, y + 2 + len, '#ffffff', 2);
      sweep(b, x - f * 4, y + 6, 16, mir(0.1 * Math.PI), mir(0.9 * Math.PI), k, '#fff8e6', 2, 'rgba(255,248,230,0.35)');
      for (let i = 0; i < 3; i++) pset(b, x - f * 4 + (i - 1) * 4, y + 4 + len + (i % 2), '#9fe3ff');
      break;
    }
    case 'sweep': { // 足払い：地面すれすれの長い薙ぎ＋土煙の線
      const gy = Math.round((p.y + p.h) / 2) - 3;
      const len = Math.round(30 * Math.min(1, k * 3));
      line(b, x - f * 6, gy, x - f * 6 + f * len, gy, '#fff8e6', 2);
      line(b, x - f * 6, gy + 2, x - f * 6 + f * Math.round(len * 0.7), gy + 2, 'rgba(255,220,160,0.5)');
      if (k > 0.2) for (let i = 0; i < 5; i++) pset(b, x + f * (6 + i * 5), gy - 2 - (i % 2) * 2, '#ffd08a');
      break;
    }
    case 'air': // 円を描く空中斬り
      sweep(b, x, y, 18, mir(-0.7 * Math.PI), mir(0.7 * Math.PI), k, '#fff8e6', 3, 'rgba(255,248,230,0.35)');
      break;
    default:
      sweep(b, x, y, 17, mir(-0.45 * Math.PI), mir(0.35 * Math.PI), k, '#fff8e6', 3);
  }
  b.globalAlpha = 1;
}

// 既存の術にも光のにじみを足す（派手さの底上げ）
function haloFor(b, sp) {
  const x = Math.round(sp.x / 2), y = Math.round(sp.y / 2);
  switch (sp.kind) {
    case 'star': if (sp.t >= sp.delay) { const k = (sp.t - sp.delay) / sp.fall; if (k >= 1 && k < 1.5) glow(b, x, y, 18 * (1.5 - k) * 2, sp.legend ? PRISM[Math.floor(k * 12) % PRISM.length] : '#ffe14a', 0.8); } break;
    case 'flamering': glow(b, x, y, Math.round(sp.r / 2) * 0.6, '#ff7a3c', 0.35); break;
    case 'toll': glow(b, x, y, Math.round(sp.r / 2) * 0.5, '#f2c14e', 0.3); break;
    case 'thunder': if (sp.t < sp.life) glow(b, x, y, 14 * (1 - sp.t / sp.life), '#cfe8ff', 0.9); break;
    case 'zap': glow(b, Math.round(sp.tx / 2), Math.round(sp.ty / 2), 6, '#cfe8ff', 0.8); break;
    case 'frost': glow(b, x, y, Math.round(sp.r / 2) * 0.5, '#9fe3ff', 0.35); break;
    case 'blade': glow(b, x, y, sp.small ? 4 : 8, sp.melee ? '#ffe9a0' : '#9fe3ff', 0.55); break;
    case 'hand': case 'gear': glow(b, x, y, 4, '#ffe14a', 0.5); break;
    case 'cross': if (sp.t >= sp.delay) glow(b, x, y, 8, '#ffffff', 0.6); break;
    case 'spike': if (sp.boomed) glow(b, x, y - 6, 7, sp.ice ? '#9fe3ff' : '#e8f0ff', 0.6); break;
  }
}

// 光る表現：加算合成でにじむ光（派手な術用）
function glow(b, x, y, r, color, a = 0.6) {
  if (r <= 0) return;
  const prev = b.globalCompositeOperation, pa = b.globalAlpha;
  b.globalCompositeOperation = 'lighter';
  b.globalAlpha = pa * a * 0.35; disc(b, x, y, Math.round(r), color);
  b.globalAlpha = pa * a * 0.6; disc(b, x, y, Math.max(1, Math.round(r * 0.6)), color);
  b.globalAlpha = pa * a; disc(b, x, y, Math.max(1, Math.round(r * 0.3)), '#ffffff');
  b.globalCompositeOperation = prev; b.globalAlpha = pa;
}
function glowLine(b, x1, y1, x2, y2, color, w) {
  const prev = b.globalCompositeOperation, pa = b.globalAlpha;
  b.globalCompositeOperation = 'lighter';
  b.globalAlpha = pa * 0.35; line(b, x1, y1, x2, y2, color, w + 2);
  b.globalAlpha = pa * 0.8; line(b, x1, y1, x2, y2, color, Math.max(1, w - 2));
  b.globalCompositeOperation = prev; b.globalAlpha = pa;
}

// 拾い物：回る金貨（キラッと光る）と、尾を引く経験値の粒
function drawPickup(b, k, t) {
  const x = Math.round(k.x / 2), y = Math.round(k.y / 2);
  if (k.type === 'coin') {
    const f = Math.floor(t * 10 + k.phase) % 6; // 回転：幅が 5→3→1→3
    const w = [5, 4, 2, 1, 2, 4][f];
    rect(b, x - Math.floor(w / 2), y - 2, w, 5, '#b8862a');
    if (w > 2) { rect(b, x - Math.floor(w / 2) + 1, y - 2, w - 2, 5, '#ffd84a'); pset(b, x - Math.floor(w / 2) + 1, y - 1, '#fff6c0'); }
    else rect(b, x - Math.floor(w / 2), y - 2, w, 5, '#ffe680');
    // キラキラ：ときどき十字の光
    const tw = (t * 3 + k.phase) % 2;
    if (tw < 0.25) { const s = tw < 0.12 ? 2 : 1; pset(b, x + 2, y - 3, '#ffffff'); for (let i = 1; i <= s; i++) { pset(b, x + 2 + i, y - 3, '#fff6c0'); pset(b, x + 2 - i, y - 3, '#fff6c0'); pset(b, x + 2, y - 3 + i, '#fff6c0'); pset(b, x + 2, y - 3 - i, '#fff6c0'); } }
  } else {
    const len = Math.min(4, Math.hypot(k.vx, k.vy) / 120);
    const ux = k.vx / (Math.hypot(k.vx, k.vy) || 1), uy = k.vy / (Math.hypot(k.vx, k.vy) || 1);
    b.globalAlpha = 0.35; disc(b, x, y, 2, '#7fd85a'); b.globalAlpha = 0.6;
    for (let i = 1; i <= len; i++) pset(b, x - ux * i * 1.5, y - uy * i * 1.5, '#a8f07a');
    b.globalAlpha = 1;
    rect(b, x, y, 1, 1, '#e8ffd0'); pset(b, x + 1, y, '#a8f07a'); pset(b, x, y + 1, '#a8f07a');
  }
}

// 命中の閃光（4 方向の星）
function drawImpact(b, im) {
  const k = im.t / im.life, s = Math.round(im.size * (1 - k));
  if (s <= 0) return;
  const x = Math.round(im.x / 2), y = Math.round(im.y / 2);
  rect(b, x - s, y, s * 2 + 1, 1, im.color); rect(b, x, y - s, 1, s * 2 + 1, im.color);
  const d = Math.round(s * 0.5);
  for (let i = 1; i <= d; i++) { pset(b, x + i, y + i, '#ffffff'); pset(b, x - i, y - i, '#ffffff'); pset(b, x + i, y - i, '#ffffff'); pset(b, x - i, y + i, '#ffffff'); }
  pset(b, x, y, '#ffffff');
}

// ───────── 術のエフェクト ─────────
function drawSpell(b, sp, t) {
  const x = Math.round(sp.x / 2), y = Math.round(sp.y / 2);
  switch (sp.kind) {
    case 'warpslash': { // 刻閃：暗転した時の中を、白い直線が画面の端から端まで走る
      const first = sp.lines[0].at, lastAt = sp.lines[sp.lines.length - 1].at;
      const dark = sp.t < first ? sp.t / first : sp.shattered ? Math.max(0, 1 - (sp.t - sp.shatterT) / 0.35) : 1;
      b.save(); b.setTransform(1, 0, 0, 1, 0, 0);
      b.globalAlpha = 0.55 * dark; b.fillStyle = '#05040c'; b.fillRect(0, 0, b.canvas.width, b.canvas.height);
      b.globalAlpha = 0.18 * dark; b.fillStyle = '#5aa9e6'; b.fillRect(0, 0, b.canvas.width, b.canvas.height);
      b.restore(); b.globalAlpha = 1;
      for (const ln of sp.lines) {
        if (sp.t < ln.at) continue;
        const age = sp.t - ln.at;
        const x1 = ln.x1 / 2, y1 = ln.y1 / 2, x2 = ln.x2 / 2, y2 = ln.y2 / 2;
        // 走る瞬間：太く白く光り、すぐ細い残光になる。納刀で全ての線がもう一度強く光って消える
        let w, a;
        if (sp.shattered) { const k = (sp.t - sp.shatterT) / 0.3; w = 3; a = Math.max(0, 1 - k); }
        else { w = age < 0.05 ? 3 : 1; a = age < 0.05 ? 1 : 0.75; }
        if (a <= 0) continue;
        // 画面の端から端まで続く長い線なので、ここは滑らかな線で描く（点を打つより速い）
        const stroke = (col, lw, al, add) => { b.save(); if (add) b.globalCompositeOperation = 'lighter'; b.globalAlpha = al; b.strokeStyle = col; b.lineWidth = lw; b.lineCap = 'round'; b.beginPath(); b.moveTo(x1, y1); b.lineTo(x2, y2); b.stroke(); b.restore(); };
        if (sp.legend) {
          // 伝説（刻の支配者）：線ごとに金・桃・水色・紫の光をまとい、芯は白金
          const ci = sp.lines.indexOf(ln), c1 = PRISM[ci % PRISM.length], c2 = PRISM[(ci + 2) % PRISM.length];
          stroke(c2, w + 7, a * 0.3, true);
          stroke(c1, w + 3, a * 0.75, true);
          stroke('#fff6d0', w, a, false);
        } else {
          stroke('#7fc8ff', w + 5, a * 0.3, true);
          stroke('#cfe8ff', w + 2, a * 0.6, true);
          stroke('#ffffff', w, a, false);
        }
      }
      if (sp.shattered) { const k = (sp.t - sp.shatterT) / 0.3; if (k < 1) sp.lines.forEach((ln, i) => { b.globalAlpha = 1 - k; const mx = (ln.x1 + ln.x2) / 4, my = (ln.y1 + ln.y2) / 4; circle(b, mx, my, Math.round(4 + k * 18), sp.legend ? PRISM[i % PRISM.length] : '#ffffff'); if (sp.legend) circle(b, mx, my, Math.round(2 + k * 11), '#ffe14a'); }); b.globalAlpha = 1; }
      break;
    }
    case 'flamering': {
      const r = Math.round(sp.r / 2);
      if (r < 2) break;
      circle(b, x, y, r, '#ff7a3c'); circle(b, x, y, Math.max(1, r - 1), '#ffe14a');
      const n = Math.max(8, Math.round(r * 0.9));
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, fx = x + Math.cos(a) * r, fy = y + Math.sin(a) * r * 0.55;
        const h = 2 + ((i * 7 + Math.floor(t * 20)) % 4);
        rect(b, fx, fy - h, 1, h, i % 2 ? '#ff7a3c' : '#ffd08a');
      }
      for (let i = -r; i <= r; i += 2) pset(b, x + i, y + 1, 'rgba(255,120,60,0.6)');
      break;
    }
    case 'star': {
      if (sp.t < sp.delay) break;
      const k = (sp.t - sp.delay) / sp.fall;
      if (k < 1 && sp.legend) {
        // 伝説（星喰らい）：金・桃・水色・紫の尾を引き、先端は色を巡らせて光る
        const sx = (sp.from.x + (sp.x - sp.from.x) * k) / 2, sy = (sp.from.y + (sp.y - sp.from.y) * k) / 2;
        const fx0 = sp.from.x / 2, fy0 = sp.from.y / 2, dx = sx - fx0, dy = sy - fy0, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
        PRISM.forEach((c, i) => { const off = (i - 1.5) * 1.2; b.globalAlpha = 0.75; line(b, sx - ux * (26 - i * 3) - uy * off, sy - uy * (26 - i * 3) + ux * off, sx - uy * off, sy + ux * off, c); });
        b.globalAlpha = 1;
        const hc = PRISM[Math.floor(t * 18) % PRISM.length];
        rect(b, sx - 4, sy, 9, 1, hc); rect(b, sx, sy - 4, 1, 9, hc); rect(b, sx - 1, sy - 1, 3, 3, '#fff6d0'); pset(b, sx, sy, '#ffffff');
      } else if (k >= 1 && sp.legend) {
        const r = Math.round((k - 1) * 44);
        b.globalAlpha = Math.max(0, 1 - (k - 1) / 0.6);
        PRISM.forEach((c, i) => circle(b, x, y, Math.max(1, r - i * 4), c));
        circle(b, x, y, Math.max(1, Math.round(r * 0.3)), '#ffffff');
        rect(b, x - r - 4, y, r * 2 + 9, 1, '#ffe14a'); rect(b, x, y - r - 4, 1, r * 2 + 9, '#ffe14a');
        b.globalAlpha = 1;
      } else if (k < 1) {
        const sx = (sp.from.x + (sp.x - sp.from.x) * k) / 2, sy = (sp.from.y + (sp.y - sp.from.y) * k) / 2;
        dashLine(b, sx - 10, sy - 20, sx, sy, 'rgba(255,225,74,0.6)', 2, 1);
        if (sp.sword) { line(b, sx - 3, sy - 8, sx, sy, '#e8f4ff', 2); rect(b, sx - 4, sy - 7, 4, 1, '#ffe14a'); pset(b, sx, sy + 1, '#ffffff'); }
        else { rect(b, sx - 3, sy, 7, 1, '#ffe14a'); rect(b, sx, sy - 3, 1, 7, '#ffe14a'); pset(b, sx, sy, '#ffffff'); }
        pset(b, sx - 1, sy - 1, '#fff6d0'); pset(b, sx + 1, sy + 1, '#fff6d0');
      } else {
        const r = Math.round((k - 1) * 40);
        b.globalAlpha = Math.max(0, 1 - (k - 1) / 0.6);
        circle(b, x, y, r, '#ffe14a'); circle(b, x, y, Math.max(1, Math.round(r * 0.6)), '#ffffff');
        rect(b, x - r - 3, y, r * 2 + 7, 1, '#fff6d0'); rect(b, x, y - r - 3, 1, r * 2 + 7, '#fff6d0');
        b.globalAlpha = 1;
      }
      break;
    }
    case 'blade': {
      const h = Math.round(sp.h / 4), f = sp.face;
      for (let i = 2; i >= 0; i--) {
        b.globalAlpha = i === 0 ? 1 : 0.3 / i;
        const ox = x - f * i * 6;
        // 剣の道の斬撃は白金色、術の斬撃は青
        arc(b, ox - f * h, y, h, f > 0 ? -0.5 * Math.PI : 0.5 * Math.PI, f > 0 ? 0.5 * Math.PI : 1.5 * Math.PI, i === 0 ? (sp.melee ? '#fff2c0' : '#9fe3ff') : (sp.melee ? '#f2c14e' : '#5aa9e6'), sp.small ? 2 : 3);
        if (i === 0) arc(b, ox - f * h, y, h - 3, f > 0 ? -0.4 * Math.PI : 0.6 * Math.PI, f > 0 ? 0.4 * Math.PI : 1.4 * Math.PI, '#ffffff', 1);
      }
      b.globalAlpha = 1;
      break;
    }
    case 'toll': {
      const r = Math.round(sp.r / 2), k = sp.t / 0.45;
      b.globalAlpha = Math.max(0, 1 - Math.max(0, k - 1) * 4);
      circle(b, x, y, r, '#f2c14e'); circle(b, x, y, Math.max(1, Math.round(r * 0.75)), 'rgba(255,230,160,0.7)'); circle(b, x, y, Math.max(1, Math.round(r * 0.5)), 'rgba(255,230,160,0.4)');
      // 頭上の鐘
      if (sp.t < 0.5) {
        const by2 = y - 22 - Math.round(Math.sin(t * 30) * 1);
        for (let i = 0; i < 8; i++) rect(b, x - 2 - Math.floor(i / 2), by2 + i, 5 + Math.floor(i / 2) * 2, 1, '#f2c14e');
        rect(b, x - 6, by2 + 8, 13, 1, '#c9a052'); pset(b, x, by2 + 9, '#ffe14a');
      }
      b.globalAlpha = 1;
      break;
    }
    case 'quake': {
      const r = Math.round(sp.r / 2);
      for (const d of [-1, 1]) for (let i = 0; i < 6; i++) { const h = Math.round(Math.sin(i / 5 * Math.PI) * 7); rect(b, x + d * (r - i), y - h, 1, h, i % 2 ? '#ffaa5a' : '#ffd08a'); }
      break;
    }
    case 'ember': {
      const r = Math.round(sp.r / 2);
      circle(b, x, y, r, '#ff7a3c');
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + t * 4; rect(b, x + Math.cos(a) * r, y + Math.sin(a) * r - 2, 1, 3, '#ffe14a'); }
      break;
    }
    case 'hand': {
      if (sp.t < (sp.delay || 0)) break;
      const d = Math.hypot(sp.vx, sp.vy) || 1, ux = sp.vx / d, uy = sp.vy / d;
      dashLine(b, x - ux * 12, y - uy * 12, x - ux * 4, y - uy * 4, 'rgba(242,193,78,0.5)', 1, 1);
      line(b, x - ux * 4, y - uy * 4, x + ux * 4, y + uy * 4, '#f2c14e', 2);
      pset(b, x + ux * 5, y + uy * 5, '#9fe3ff');
      break;
    }
    case 'frost': { // 氷の波動：青白い輪と、輪の上の氷の結晶
      const r = Math.round(sp.r / 2), k = sp.t / 0.3;
      b.globalAlpha = Math.max(0, 1 - Math.max(0, k - 1) * 3);
      circle(b, x, y, r, '#9fe3ff'); circle(b, x, y, Math.max(1, r - 2), 'rgba(220,245,255,0.6)');
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const fx = x + Math.cos(a) * r, fy = y + Math.sin(a) * r; rect(b, fx - 1, fy, 3, 1, '#ffffff'); rect(b, fx, fy - 1, 1, 3, '#ffffff'); }
      b.globalAlpha = 1;
      break;
    }
    case 'sword': { // 光の剣：上から落ちて地面に刺さる
      if (sp.t < sp.delay) break;
      const k = (sp.t - sp.delay) / sp.fall;
      const sy = k < 1 ? y - Math.round((1 - k) * 90) : y;
      if (k < 1) dashLine(b, x, sy - 22, x, sy - 8, 'rgba(200,230,255,0.5)', 1, 1);
      b.globalAlpha = k > 1.6 ? Math.max(0, 1 - (k - 1.6) / 0.8) : 1;
      line(b, x, sy - 12, x, sy, '#e8f4ff', 2); pset(b, x, sy + 1, '#ffffff');
      rect(b, x - 3, sy - 12, 7, 1, '#ffe14a'); line(b, x, sy - 16, x, sy - 13, '#c9a052');
      if (k >= 1 && k < 1.5) { const r = Math.round((k - 1) * 24); rect(b, x - r, y + 1, r * 2 + 1, 1, '#ffffff'); }
      b.globalAlpha = 1;
      break;
    }
    case 'gear': { // 回る歯車
      const a0 = sp.t * 18;
      circle(b, x, y, 5, '#c9a052'); circle(b, x, y, 2, '#ffe14a');
      for (let i = 0; i < 8; i++) { const a = a0 + i / 8 * Math.PI * 2; rect(b, x + Math.round(Math.cos(a) * 7), y + Math.round(Math.sin(a) * 7), 1, 1, i % 2 ? '#ffe14a' : '#f2c14e'); }
      b.globalAlpha = 0.35; circle(b, x - Math.sign(sp.face) * 4, y, 5, '#c9a052'); b.globalAlpha = 1;
      break;
    }
    case 'zap': { // 雷雲から敵へのいなずま
      const k = sp.t / sp.life, tx = Math.round(sp.tx / 2), ty = Math.round(sp.ty / 2);
      b.globalAlpha = 1 - k * 0.7;
      let lx = x, ly = y;
      for (let i = 1; i <= 6; i++) {
        const nx = x + (tx - x) * i / 6 + (i < 6 ? ((i * 29 + Math.floor(sp.tx)) % 7) - 3 : 0), ny = y + (ty - y) * i / 6;
        line(b, lx, ly, nx, ny, '#cfe8ff', 2); line(b, lx, ly, nx, ny, '#ffffff', 1);
        lx = nx; ly = ny;
      }
      b.globalAlpha = 1;
      break;
    }
    case 'trail': { // 走った跡の炎
      const k = sp.t / sp.life;
      b.globalAlpha = 1 - k * k;
      const h = 2 + ((Math.floor(t * 18) + Math.floor(sp.x)) % 3);
      rect(b, x - 1, y + 3 - h, 3, h, '#ff7a3c'); pset(b, x, y + 2 - h, '#ffe14a'); rect(b, x - 2, y + 3, 5, 1, 'rgba(255,120,60,0.6)');
      b.globalAlpha = 1;
      break;
    }
    case 'bolt': { // 雷霆の雷：画面の上から地面まで、ジグザグに落ちる
      const k = sp.t / sp.life, top = Math.round(sp.top / 2);
      b.globalAlpha = 1 - k;
      let lx = x, ly = top;
      for (let i = 1; i <= 10; i++) {
        const ny = top + (y - top) * i / 10, nx = x + (i < 10 ? Math.round(Math.sin(sp.seed + i * 2.3) * 5) : 0);
        glowLine(b, lx, ly, nx, ny, '#9fc8ff', 4); line(b, lx, ly, nx, ny, '#ffffff', 1);
        lx = nx; ly = ny;
      }
      glow(b, x, y, 10 * (1 - k) + 3, '#cfe8ff', 0.8);
      b.globalAlpha = 1;
      break;
    }
    case 'longblade': case 'spinsweep': { // 天剣・旋剣：手元から剣先までの線が回転する
      if (sp.tx == null) break;
      const hx = x, hy = y, k = Math.min(1, sp.t / sp.life), fade = sp.t > sp.life ? 1 - (sp.t - sp.life) / 0.12 : 1;
      const L = sp.len / 2;
      // 残像の扇（直前の角度）
      (sp.trail || []).forEach((a, i, arr) => { b.globalAlpha = 0.12 * (i + 1) / arr.length * fade; glowLine(b, hx, hy, hx + Math.cos(a) * L, hy + Math.sin(a) * L, sp.kind === 'longblade' ? '#ffe9a0' : '#9fe3ff', 3); });
      b.globalAlpha = fade;
      const tx2 = Math.round(sp.tx / 2), ty2 = Math.round(sp.ty / 2);
      glowLine(b, hx, hy, tx2, ty2, sp.kind === 'longblade' ? '#ffd84a' : '#7fd0ff', 5);
      line(b, hx, hy, tx2, ty2, '#ffffff', 1);
      glow(b, tx2, ty2, 5 + Math.sin(t * 40) * 1.5, '#ffffff', 0.9);
      glow(b, hx, hy, 4, '#ffe9a0', 0.6);
      b.globalAlpha = 1;
      void k;
      break;
    }
    case 'beam': { // 光芒：七色の層が揺らめく太い光線
      const len = Math.round(sp.len / 2), x0 = sp.face > 0 ? x : x - len, k = sp.t / sp.life;
      const w = Math.round(7 + Math.sin(t * 50) * 1.5) * (k > 0.85 ? (1 - k) / 0.15 : 1);
      const cols = ['#ff6a8a', '#ffb04a', '#ffe14a', '#7fe08a', '#7fd0ff', '#b08aff'];
      b.globalCompositeOperation = 'lighter';
      cols.forEach((c, i) => { b.globalAlpha = 0.35; rect(b, x0, Math.round(y - w + i * w / 3), len, Math.max(1, Math.round(w / 3)), c); });
      b.globalAlpha = 0.9; rect(b, x0, Math.round(y - w / 3), len, Math.max(1, Math.round(w / 1.5)), '#ffffff');
      b.globalCompositeOperation = 'source-over';
      glow(b, x, y, 9, '#ffffff', 0.9); glow(b, x0 + (sp.face > 0 ? len : 0), y, 6, '#ff9af0', 0.7);
      for (let i = 0; i < 6; i++) pset(b, x0 + ((i * 53 + Math.floor(t * 400)) % Math.max(1, len)), y + ((i * 7) % 9) - 4, '#ffffff');
      b.globalAlpha = 1;
      break;
    }
    case 'orb': { // 星核：渦巻く光の大球
      const r = Math.round(sp.r / 2);
      glow(b, x, y, r + 6, '#5aa9e6', 0.5); glow(b, x, y, r, '#9fe3ff', 0.8); glow(b, x, y, Math.round(r * 0.55), '#ffffff', 0.9);
      for (let i = 0; i < 8; i++) { const a = t * 6 + i / 8 * Math.PI * 2; pset(b, x + Math.round(Math.cos(a) * (r + 2)), y + Math.round(Math.sin(a) * (r + 2) * 0.6), '#ffffff'); }
      break;
    }
    case 'tornado': { // 時の竜巻・星雲の渦
      const k = sp.t / sp.life, fade = k > 0.8 ? (1 - k) / 0.2 : 1;
      b.globalAlpha = 0.85 * fade;
      for (let i = 0; i < 14; i++) {
        const yy = y + 18 - i * 3, rw = (sp.nebula ? 6 : 3) + i * (sp.nebula ? 1.2 : 0.8), a = t * 14 + i * 0.7;
        pset(b, x + Math.round(Math.cos(a) * rw), yy, sp.color || '#cfe8ff'); pset(b, x - Math.round(Math.cos(a) * rw), yy, '#ffffff');
      }
      if (sp.nebula) glow(b, x, y, 16, '#ffe9a0', 0.35);
      b.globalAlpha = 1;
      break;
    }
    case 'roomhit': { // 部屋全体の術：敵ごとに光の柱と鐘の波紋
      const k = sp.t / sp.life, top = Math.round(sp.top / 2);
      b.globalAlpha = (sp.soft ? 0.5 : 0.85) * (1 - k);
      rect(b, x - 2, top - 30, 5, y - top + 34, sp.soft ? '#f2c14e' : '#c8b0ff');
      rect(b, x, top - 30, 1, y - top + 34, '#ffffff');
      circle(b, x, y, Math.round(4 + k * 10), sp.soft ? '#f2c14e' : '#c8b0ff');
      b.globalAlpha = 1;
      break;
    }
    case 'cross': { // 残心：遅れて走る十字の斬撃
      if (sp.t < sp.delay) break;
      const k = (sp.t - sp.delay) / 0.22, r = Math.round(10 * Math.min(1, k * 3));
      b.globalAlpha = 1 - k;
      line(b, x - r, y - r, x + r, y + r, '#ffffff', 2); line(b, x - r, y + r, x + r, y - r, '#ffffff', 2);
      line(b, x - r, y - r, x + r, y + r, '#9fe3ff', 1);
      b.globalAlpha = 1;
      break;
    }
    case 'vblade': { // 天裂：縦に飛ぶ刃
      const d = Math.sign(sp.vy);
      for (let i = 2; i >= 0; i--) { b.globalAlpha = i === 0 ? 1 : 0.3 / i; arc(b, x, y - d * i * 5, 8, d < 0 ? Math.PI * 1.1 : Math.PI * 0.1, d < 0 ? Math.PI * 1.9 : Math.PI * 0.9, i === 0 ? '#e8f4ff' : '#9fe3ff', 2); }
      b.globalAlpha = 1;
      break;
    }
    case 'groundwave': { // 床を走る衝撃波：岩の棘が波打つ
      const dir = Math.sign(sp.vx), k = sp.t / sp.life;
      b.globalAlpha = 1 - k * 0.6;
      for (let i = 0; i < 6; i++) { const h = Math.round(Math.sin((i / 5) * Math.PI) * 7); rect(b, x - dir * i * 2, y - h, 2, h, i % 2 ? '#d8b878' : '#a08050'); }
      pset(b, x + dir, y - 8, '#ffffff');
      b.globalAlpha = 1;
      break;
    }
    case 'spike': { // 時針の剣山：予兆の光る印 → 針が突き出す
      if (sp.t < sp.delay) { const k = sp.t / sp.delay; b.globalAlpha = 0.4 + 0.6 * k; rect(b, x - 5, y - 1, 11, 1, '#9fe3ff'); pset(b, x, y - 2, '#ffffff'); b.globalAlpha = 1; break; }
      const k = (sp.t - sp.delay) / 0.45, h = Math.round(16 * Math.min(1, k * 4) * (1 - Math.max(0, k - 0.6) * 2.5));
      for (const [dx, s] of [[-3, 0.7], [0, 1], [3, 0.8]]) { const hh = Math.round(h * s); line(b, x + dx, y, x + dx, y - hh, '#e8f0ff'); pset(b, x + dx, y - hh, '#ffffff'); }
      break;
    }
    case 'burnfloor': { // 灼熱の床：炎の帯
      const k = sp.t / sp.life, half = Math.round(sp.half / 2);
      b.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1;
      rect(b, x - half, y - 1, half * 2, 1, '#ff7a3c');
      for (let i = -half; i < half; i += 3) { const h = 1 + ((i * 7 + Math.floor(t * 14)) % 4 + 4) % 4; rect(b, x + i, y - 1 - h, 1, h, (i / 3) % 2 ? '#ffb04a' : '#ff6a2a'); }
      b.globalAlpha = 1;
      break;
    }
    case 'riposte': {
      const k = sp.t / sp.life, tx = Math.round(sp.tx / 2), ty = Math.round(sp.ty / 2);
      b.globalAlpha = 1 - k;
      line(b, x, y, tx, ty, '#ffffff', 2);
      for (let i = 0; i < 3; i++) { const mx = x + (tx - x) * (0.3 + i * 0.25), my = y + (ty - y) * (0.3 + i * 0.25); line(b, mx - 3, my - 4, mx + 3, my + 4, '#9fe3ff'); }
      b.globalAlpha = 1;
      break;
    }
    case 'thunder': {
      const k = sp.t / sp.life;
      b.globalAlpha = 1 - k;
      let px = x, py = y - 90;
      for (let i = 0; i < 9; i++) {
        const nx = x + (i === 8 ? 0 : ((i * 37 + Math.floor(sp.x)) % 9) - 4), ny = py + 10;
        line(b, px, py, nx, ny, '#e8f0ff', 2); line(b, px, py, nx, ny, '#9fe3ff', 1);
        px = nx; py = ny;
      }
      circle(b, x, y, 6, '#e8f0ff');
      if (sp.chain) {
        const cx2 = Math.round(sp.chain.x / 2), cy2 = Math.round(sp.chain.y / 2);
        let qx = x, qy = y;
        for (let i = 1; i <= 5; i++) { const nx = x + (cx2 - x) * i / 5, ny = y + (cy2 - y) * i / 5 + (i < 5 ? ((i * 13) % 7) - 3 : 0); line(b, qx, qy, nx, ny, '#9fe3ff'); qx = nx; qy = ny; }
      }
      b.globalAlpha = 1;
      break;
    }
  }
}

// ───────── 敵 ─────────
// 予備動作（赤）や遅延（青）の縁取りを、スプライトの 1 ドット外側に描く
function outlined(b, group, frame, x, y, face, glow, glowColor, duel) {
  if (glow > 0) {
    b.globalAlpha = clamp(glow, 0, 1);
    const g = spr(group, frame, glowColor, duel);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawSprite(b, g, x + dx, y + dy, face);
    b.globalAlpha = 1;
  }
}
// 敵を描く。drawScale があれば足元を中心に拡大して描く（HP の帯は拡大しない）
function drawEnemy(b, game, e) {
  const s = e.drawScale || 1;
  if (s === 1) { drawEnemyBody(b, game, e); hpBar(b, e); return; }
  const fx = cx(e) / 2, fy = (e.y + e.h) / 2;
  b.save(); b.translate(fx, fy); b.scale(s, s); b.translate(-fx, -fy);
  drawEnemyBody(b, game, e);
  b.restore();
  // 時の障壁が攻撃を受け止めた瞬間：淡い水色の殻
  if (e.barrierFx > 0) { b.globalAlpha = Math.min(1, e.barrierFx * 4) * 0.7; circle(b, Math.round(fx), Math.round(fy - e.h * s / 4), Math.round(e.h * s / 4 + 6), '#9fe3ff'); circle(b, Math.round(fx), Math.round(fy - e.h * s / 4), Math.round(e.h * s / 4 + 8), '#cfefff'); b.globalAlpha = 1; }
  hpBar(b, e, e.y + e.h - e.h * s);
}
function drawEnemyBody(b, game, e) {
  const t = game.time;
  const bx = Math.round(cx(e) / 2), by = Math.round((e.y + e.h) / 2), f = e.face;
  const slowGlow = e.slowed ? 0.7 : 0;
  const flash = e.hitFlash > 0;
  // 出てすぐのガード中：淡い青の泡が揺らめく（常時の術・お供の攻撃を受けない）
  if (game.spawnGuarded && game.spawnGuarded(e)) {
    const r = Math.max(8, Math.round(Math.max(e.w, e.h) / 2 / 2) + 4), cy0 = Math.round(cy(e) / 2), n = 18;
    b.globalAlpha = 0.45 + 0.25 * Math.sin(t * 14);
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + t * 2; if (i % 3 !== 2) pset(b, bx + Math.round(Math.cos(a) * r), cy0 + Math.round(Math.sin(a) * r), '#cfe8ff'); }
    b.globalAlpha = 1;
  }
  const body = (group, frame, tell, duel) => {
    if (tell > 0) outlined(b, group, frame, bx, by, f, 0.3 + tell * 0.7, 'red', duel);
    else outlined(b, group, frame, bx, by, f, slowGlow, 'blue', duel);
    drawSprite(b, spr(group, frame, flash ? 'white' : null, duel), bx, by, f);
  };
  switch (e.kind) {
    case 'soldier': {
      const winding = e.state === 'windup' || e.state === 'windup2' || e.state === 'thrustWind';
      const frame = winding ? 'crouch' : Math.abs(e.vx) > 10 ? (Math.floor(t * 8) % 2 ? 'walk0' : 'walk1') : 'stand';
      body('soldier', frame, winding ? e.tell : 0);
      if (e.state === 'thrustWind') dashLine(b, bx + f * 8, by - 8, bx + f * (30 + e.tell * 70), by - 8, e.tell > 0.6 ? '#ff4a2a' : '#c0402a');
      // ギザギザの剣
      const hx = bx + f * 3, hy = by - 8;
      let ang = f > 0 ? 0.35 : Math.PI - 0.35;
      if (e.state === 'windup') ang = f > 0 ? -Math.PI * 0.5 - e.tell * 0.5 : -Math.PI * 0.5 + e.tell * 0.5;
      if (e.state === 'slash') ang = f > 0 ? 0.1 : Math.PI - 0.1;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      line(b, hx, hy, hx + ca * 13, hy + sa * 13, '#b9a58a');
      for (const d of [5, 8, 11]) pset(b, hx + ca * d - sa * 1.6, hy + sa * d + ca * 1.6, '#d8c8a8');
      if (e.state === 'thrust' || e.state === 'thrustWind') ang = f > 0 ? 0 : Math.PI;
      if ((e.state === 'windup' || e.state === 'windup2') && e.tell < 0.4) {
        const gx = hx + ca * 13, gy = hy + sa * 13, s = Math.round(5 * (1 - e.tell / 0.4));
        rect(b, gx - s, gy, s * 2 + 1, 1, '#ffffff'); rect(b, gx, gy - s, 1, s * 2 + 1, '#ffffff');
      }
      if (e.state === 'slash') arc(b, bx + f * 4, by - 8, 15, f > 0 ? -1 : Math.PI - 0.6, f > 0 ? 0.6 : Math.PI + 1, '#ff8a5a', 2);
      if (e.state === 'recover') { pset(b, bx - 2, by - 19, '#9a8fa6'); pset(b, bx, by - 19, '#9a8fa6'); pset(b, bx + 2, by - 19, '#9a8fa6'); }
      break;
    }
    case 'bat': {
      const ccx = Math.round(cx(e) / 2), ccy = Math.round(cy(e) / 2);
      if (e.state === 'tell' && e.target) {
        dashLine(b, ccx, ccy, e.target.x / 2, e.target.y / 2, e.tell > 0.6 ? '#ff4a2a' : '#c0402a');
        circle(b, e.target.x / 2, e.target.y / 2, Math.round(5 - e.tell * 2), '#ff4a2a');
      }
      const frame = e.state === 'dive' ? 'down' : ['up', 'mid', 'down', 'mid'][Math.floor(t * 12 + e.id) % 4];
      const yb = ccy + 5;
      if (e.state === 'tell') outlined(b, 'bat', frame, ccx, yb, 1, 0.3 + e.tell * 0.7, 'red');
      else outlined(b, 'bat', frame, ccx, yb, 1, slowGlow, 'blue');
      drawSprite(b, spr('bat', frame, flash ? 'white' : null), ccx, yb, 1);
      if (e.state === 'stunned') for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; pset(b, ccx + Math.cos(a) * 6, ccy - 7 + Math.sin(a) * 2, '#ffffff'); }
      break;
    }
    case 'turret': {
      const ccx = bx, ccy = by - 7;
      rect(b, ccx - 6, by - 3, 13, 3, '#2c2531'); rect(b, ccx - 6, by - 3, 13, 1, '#5c5068');
      const img = gearFrame(6, 8, flash ? '#ffffff' : e.tell > 0 ? '#8a3a2a' : '#4a3f4c', false, 0);
      if (e.slowed) outlinedImg(b, img, ccx, ccy, '#5aa9e6');
      b.drawImage(img, Math.round(ccx - img.width / 2), Math.round(ccy - img.height / 2));
      disc(b, ccx, ccy, 4, e.tell > 0 ? (e.tell > 0.6 ? '#ff8a6a' : '#e8b090') : '#d9ceb2');
      pset(b, ccx, ccy - 4, '#ff3b2f');
      const a = e.hand * Math.PI * 2 - Math.PI / 2;
      line(b, ccx, ccy, ccx + Math.cos(a) * 3, ccy + Math.sin(a) * 3, '#1a1420');
      break;
    }
    case 'knight': {
      const frame = e.state === 'stagger' ? 'stagger' : Math.abs(e.vx) > 10 ? (Math.floor(t * 6) % 2 ? 'walk0' : 'walk1') : 'stand';
      const tell = e.tellKind && e.tellKind !== 'shadow' ? e.tell : 0;
      body('knight', frame, tell);
      // 新しい技の予兆と動き
      if (e.state === 'upperWind' || e.state === 'upper') { // 大槌を真上へ
        const up = e.state === 'upper', hy = by - 30 - (up ? 18 : Math.round(e.tell * 6));
        line(b, bx, by - 13, bx + f * 2, hy, '#6a5a44', 2); rect(b, bx + f * 2 - 4, hy - 4, 9, 7, flash ? '#fff' : '#7a6a52');
        if (!up) for (let i = 0; i < 3; i++) pset(b, bx - 4 + i * 4, by - 40 - (Math.floor(t * 10 + i) % 3), '#ff4a2a');
        if (up && e.stateT < 0.18) { glowLine(b, bx, by - 20, bx, by - 66, '#ffd0a0', 3); }
      }
      if (e.state === 'throwWind') { const gx = bx - f * 8, gy = by - 22 - Math.round(e.tell * 4); disc(b, gx, gy, 5, '#8a6a3a'); circle(b, gx, gy, 6, e.tell > 0.6 ? '#ff4a2a' : '#c9a052'); }
      if (e.state === 'sparkWind') for (let i = 0; i < 4; i++) { const a = t * 9 + i * 1.6; pset(b, bx + Math.round(Math.cos(a) * 9), by - 16 + Math.round(Math.sin(a) * 9), i % 2 ? '#ffb04a' : '#ffe14a'); }
      if (e.state === 'diveHold' || e.state === 'dive') {
        glow(b, bx, by - 10, 14, '#ff8a5a', e.state === 'dive' ? 0.6 : 0.35);
        if (e.diveV) { b.globalAlpha = e.state === 'diveHold' ? 0.6 : 0.25; dashLine(b, bx, by - 10, bx + Math.round(e.diveV.x / 6), by - 10 + Math.round(e.diveV.y / 6), '#ff4a2a', 1, 2); b.globalAlpha = 1; }
      }
      // 盾（前面のトゲ）
      if (e.state !== 'stagger') {
        const glow = e.tellKind === 'shield' ? e.tell : 0;
        const sx = bx + f * 6, col = glow > 0 ? `rgb(255,${Math.round(180 - glow * 100)},${Math.round(80 - glow * 60)})` : e.guarding ? '#8a7a62' : '#4e4438';
        const x0 = f > 0 ? sx : sx - 3;
        rect(b, x0, by - 17, 4, 15, '#120c14'); rect(b, x0 + 1, by - 16, 2, 13, col);
        rect(b, f > 0 ? x0 + 4 : x0 - 2, by - 11, 2, 2, col); pset(b, f > 0 ? x0 + 6 : x0 - 3, by - 10, col);
        if (e.guarding) rect(b, x0 + (f > 0 ? 2 : 1), by - 15, 1, 11, '#d8ccb4');
      }
      if (e.state === 'leap' && e.leapX != null) {
        const gx = Math.round(e.leapX / 2), gy = Math.round(game.map.groundBelow(e.leapX, e.y + e.h) / 2);
        for (let i = -12; i <= 12; i++) if ((i + Math.floor(t * 20)) % 2 === 0) pset(b, gx + i, gy - 1, '#ff4a2a');
      }
      if (e.state === 'slamWind' || e.state === 'slam') {
        const up = e.state === 'slamWind';
        const hx = bx + f * (up ? -2 : 15), hy = up ? by - 26 - Math.round(e.tell * 4) : by - 7;
        line(b, bx, by - 13, hx, hy, '#6a5a44', 2);
        rect(b, hx - 5, hy - 3, 11, 7, '#120c14'); rect(b, hx - 4, hy - 2, 9, 5, flash ? '#fff' : '#7a6a52'); rect(b, hx - 4, hy - 2, 9, 1, '#a89878');
        if (up && e.tell > 0.2) { rect(b, bx, by - 34, 1, 4, '#ff4a2a'); pset(b, bx, by - 29, '#ff4a2a'); }
      }
      break;
    }
    case 'roller': {
      const ccx = Math.round(cx(e) / 2), ccy = Math.round(cy(e) / 2);
      const step = Math.floor(e.spin * 2) % 8;
      if (e.state === 'spinup' || e.slowed) {
        const img = gearFrame(7, 9, e.state === 'spinup' ? '#ff4a2a' : '#5aa9e6', false, step);
        b.globalAlpha = e.state === 'spinup' ? 0.3 + e.tell * 0.7 : 0.7;
        b.drawImage(img, ccx - img.width / 2 - 1, ccy - img.height / 2); b.drawImage(img, ccx - img.width / 2 + 1, ccy - img.height / 2);
        b.globalAlpha = 1;
      }
      const img = gearFrame(6, 9, flash ? '#ffffff' : '#4a3f4c', false, step);
      b.drawImage(img, ccx - img.width / 2, ccy - img.height / 2);
      disc(b, ccx, ccy, 3, flash ? '#ffffff' : '#2c2531');
      rect(b, ccx + (f > 0 ? 0 : -2), ccy - 1, 3, 2, '#ff3b2f');
      if (e.state === 'dizzy') for (let i = 0; i < 3; i++) { const a = t * 7 + i * 2.1; pset(b, ccx + Math.cos(a) * 6, ccy - 9 + Math.sin(a) * 2, '#ffe14a'); }
      break;
    }
    case 'archer': {
      const frame = e.state === 'draw' ? 'draw' : 'stand';
      body('archer', frame, e.state === 'draw' ? e.tell : 0);
      // 弓と弦（引き絞るほど光る）
      const hx = bx + f * 5, hy = by - 9;
      for (let i = -5; i <= 5; i++) pset(b, hx + f * Math.round(3 - (i * i) / 9), hy + i, '#8a6a3a');
      const pull = e.state === 'draw' ? Math.round(e.tell * 4) : 0;
      line(b, hx, hy - 5, hx - f * pull, hy, e.tell > 0.7 ? '#ffffff' : '#c8c0b0'); line(b, hx - f * pull, hy, hx, hy + 5, e.tell > 0.7 ? '#ffffff' : '#c8c0b0');
      if (e.state === 'draw' && e.aim) dashLine(b, hx, hy, e.aim.x / 2, e.aim.y / 2, e.tell > 0.6 ? '#ff4a2a' : 'rgba(255,74,42,0.5)', 2, 3);
      break;
    }
    case 'phantom': {
      if (e.state === 'mark' && e.dest) {
        // 行き先の揺らぎ（予兆）
        const dx = Math.round(e.dest.x / 2), dy = Math.round(e.dest.y / 2);
        b.globalAlpha = 0.3 + e.tell * 0.6;
        for (let i = 0; i < 12; i++) { const yy = dy - 2 - i, w = Math.round(Math.sin(t * 20 + i) * 2 + 3 + e.tell * 2); rect(b, dx - w, yy, w * 2, 1, i % 2 ? '#b67cf0' : '#ff4a2a'); }
        b.globalAlpha = 1;
      }
      const yb = by + Math.round(Math.sin(t * 3 + e.id) * 1.5);
      b.globalAlpha = e.state === 'mark' ? Math.max(0.15, 1 - e.tell) : e.state === 'drift' ? 0.75 : 1;
      const frame = Math.floor(t * 4) % 2 ? 'a' : 'b';
      if (e.state === 'slashWind') outlined(b, 'phantom', frame, bx, yb, f, 0.4 + e.tell * 0.6, 'red');
      else outlined(b, 'phantom', frame, bx, yb, f, slowGlow, 'blue');
      drawSprite(b, spr('phantom', frame, flash ? 'white' : null), bx, yb, f);
      b.globalAlpha = 1;
      if (e.state === 'slash') arc(b, bx + f * 6, by - 8, 13, f > 0 ? -1 : Math.PI - 0.6, f > 0 ? 0.6 : Math.PI + 1, '#d9b0ff', 2);
      break;
    }
    case 'bell': {
      const frame = e.state === 'lift' ? 'ring' : 'stand';
      body('bell', frame, e.state === 'lift' ? e.tell : 0);
      // 槌
      const up = e.state === 'lift';
      const mx = bx + f * (up ? 2 : 8), my = up ? by - 22 - Math.round(e.tell * 4) : by - 8;
      line(b, bx + f * 3, by - 12, mx, my, '#6a5a44');
      rect(b, mx - 2, my - 2, 5, 4, '#120c14'); rect(b, mx - 1, my - 1, 3, 2, flash ? '#fff' : '#9a8a70');
      if (up && e.tell > 0.5) { b.globalAlpha = (e.tell - 0.5) * 2; circle(b, bx, by - 9, 10 + Math.round(e.tell * 4), '#f2c14e'); b.globalAlpha = 1; }
      break;
    }
    case 'beamer': { // 光線砲手：背の高い望遠鏡の筒を担いだ機械兵。照準線→光線
      const tc = e.tell > 0 ? (e.tell > 0.7 ? '#ff4a2a' : '#c0402a') : null;
      if (tc) rect(b, bx - 7, by - 16, 14, 17, tc); else if (slowGlow) rect(b, bx - 7, by - 16, 14, 17, '#5aa9e6');
      rect(b, bx - 6, by - 15, 12, 15, flash ? '#ffffff' : '#3a3a4c'); rect(b, bx - 5, by - 14, 10, 6, flash ? '#ffffff' : '#5a5a72');
      pset(b, bx + f * 2, by - 12, '#ff6a4a'); rect(b, bx - 4, by - 2, 3, 2, '#2a2a36'); rect(b, bx + 1, by - 2, 3, 2, '#2a2a36');
      // 筒（砲身）
      const ey = Math.round((e.state === 'aim' || e.state === 'fire' ? e.aimY : cy(e)) / 2);
      line(b, bx, by - 10, bx + f * 9, ey, '#8a8aa2', 2); pset(b, bx + f * 10, ey, e.tell > 0.5 ? '#ffffff' : '#ffb04a');
      const x0 = bx + f * 10, x1 = Math.round((cx(e) + f * e.beamLen) / 2);
      if (e.state === 'aim') { b.globalAlpha = 0.25 + e.tell * 0.6; line(b, x0, ey, x1, ey, e.stateT > 1.05 * e.wmul(game) - 0.3 ? '#ff4a2a' : '#c0402a', e.tell > 0.7 ? 2 : 1); b.globalAlpha = 1; }
      if (e.state === 'fire') { const k = 1 - e.stateT / 0.35; b.globalAlpha = Math.max(0, k); rect(b, Math.min(x0, x1), ey - 3, Math.abs(x1 - x0), 7, '#ff8a5a'); rect(b, Math.min(x0, x1), ey - 1, Math.abs(x1 - x0), 3, '#fff6e0'); b.globalAlpha = 1; }
      break;
    }
    case 'chain': { // 鎖鎌兵：頭巾と鎌。振りかぶると鎖が回る
      const tc = e.tell > 0 ? (e.tell > 0.6 ? '#ff4a2a' : '#c0402a') : null;
      if (tc) rect(b, bx - 6, by - 17, 12, 18, tc); else if (slowGlow) rect(b, bx - 6, by - 17, 12, 18, '#5aa9e6');
      rect(b, bx - 5, by - 16, 10, 16, flash ? '#ffffff' : '#4a2a3a'); rect(b, bx - 4, by - 15, 8, 5, flash ? '#ffffff' : '#2a1a24');
      pset(b, bx + f * 2, by - 13, '#ff6a4a'); rect(b, bx - 4, by - 2, 3, 2, '#2a1a24'); rect(b, bx + 1, by - 2, 3, 2, '#2a1a24');
      if (e.state === 'wind') { const a2 = t * 22; const r = 6; dashLine(b, bx, by - 14, bx + Math.round(Math.cos(a2) * r), by - 14 + Math.round(Math.sin(a2) * r), '#c8c0b0', 1, 1); }
      if (e.state === 'lash' && e.reach > 0) { const len = Math.round(e.reach / 2); dashLine(b, bx + f * 4, by - 9, bx + f * (4 + len), by - 9, '#c8c0b0', 1, 1); line(b, bx + f * (4 + len), by - 12, bx + f * (6 + len), by - 7, '#e8eef6', 2); }
      else line(b, bx + f * 4, by - 9, bx + f * 7, by - 13, '#e8eef6');
      break;
    }
    case 'summoner': { // 召喚師：紫の頭巾に長い杖。唱えると足元に紫の陣が回る
      if (e.state === 'cast') {
        const r = 6 + Math.round(e.tell * 10), a0 = t * 4;
        b.globalAlpha = 0.4 + 0.5 * e.tell; for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; pset(b, bx + Math.round(Math.cos(a) * r * 1.6), by + Math.round(Math.sin(a) * r * 0.45), '#b67cf0'); }
        for (let i = 0; i < 6; i++) { const a = a0 + i * Math.PI / 3; pset(b, bx + Math.round(Math.cos(a) * r * 1.6), by + Math.round(Math.sin(a) * r * 0.45), '#e8c8ff'); }
        b.globalAlpha = 1;
      }
      const tc = e.tell > 0 ? '#b67cf0' : slowGlow ? '#5aa9e6' : null;
      if (tc) rect(b, bx - 7, by - 16, 14, 16, tc);
      rect(b, bx - 6, by - 15, 12, 15, flash ? '#ffffff' : '#3a2a4a'); rect(b, bx - 5, by - 16, 10, 5, flash ? '#ffffff' : '#5a3a7a');
      pset(b, bx + f * 2, by - 13, '#e8c8ff'); pset(b, bx + f * 3, by - 13, '#e8c8ff');
      const lift = e.state === 'cast' ? Math.round(e.tell * 4) : 0;
      line(b, bx + f * 7, by - 1, bx + f * 7, by - 19 - lift, '#8a6a4a');
      rect(b, bx + f * 7 - 1, by - 21 - lift, 3, 3, e.state === 'cast' ? (Math.floor(t * 12) % 2 ? '#ffffff' : '#e8c8ff') : '#b67cf0');
      break;
    }
    case 'mite': { // ちび歯車：小さな歯車に足が生えたもの
      const tc = e.tell > 0 ? '#ff4a2a' : slowGlow ? '#5aa9e6' : null;
      if (tc) disc(b, bx, by - 3, 4, tc);
      disc(b, bx, by - 3, 3, flash ? '#ffffff' : '#9a7ab0');
      for (let i = 0; i < 4; i++) { const a = t * 10 * f + i * Math.PI / 2; pset(b, bx + Math.round(Math.cos(a) * 4), by - 3 + Math.round(Math.sin(a) * 4), '#c9a052'); }
      pset(b, bx + f * 1, by - 4, '#ff3a2a');
      if (Math.floor(t * 18 + e.id) % 2) { pset(b, bx - 2, by, '#3a2a22'); pset(b, bx + 2, by, '#3a2a22'); }
      break;
    }
    case 'rat': { // 歯車ネズミ：小さな体に歯車の尻尾。速さで残像が出る
      if (Math.abs(e.vx) > 200) { b.globalAlpha = 0.3; rect(b, bx - 4 - f * 4, by - 5, 8, 4, '#8a7a6a'); b.globalAlpha = 1; }
      const tc = e.tell > 0 ? '#ff4a2a' : slowGlow ? '#5aa9e6' : null;
      if (tc) rect(b, bx - 5, by - 7, 10, 7, tc);
      rect(b, bx - 4, by - 6, 8, 5, flash ? '#ffffff' : '#7a6a5a'); rect(b, bx + f * 3, by - 5, 2, 2, flash ? '#ffffff' : '#9a8a7a');
      pset(b, bx + f * 4, by - 6, '#ff3a2a'); pset(b, bx - f * 6, by - 4, '#c9a052'); pset(b, bx - f * 7, by - 5, '#c9a052');
      if (Math.floor(t * 16) % 2) { pset(b, bx - 2, by - 1, '#3a2a22'); pset(b, bx + 2, by - 1, '#3a2a22'); }
      break;
    }
    case 'hopper': { // 跳ね潰し：丸い鉄の体とばねの脚。着地点に影
      if (e.state === 'crouch' || e.state === 'air') { const lx = Math.round(e.landX / 2), gy = Math.round(Math.min(game.map.groundBelow(e.landX, e.y), game.map.pxH) / 2); b.globalAlpha = 0.35 + e.tell * 0.5; rect(b, lx - 9, gy - 1, 18, 1, '#ff4a2a'); rect(b, lx - 6, gy - 2, 12, 1, '#c0402a'); b.globalAlpha = 1; }
      const sq = e.state === 'crouch' ? Math.round(e.tell * 3) : e.state === 'recover' ? 1 : 0;
      const tc = e.tell > 0 && e.state === 'crouch' ? '#ff4a2a' : slowGlow ? '#5aa9e6' : null;
      if (tc) disc(b, bx, by - 6 + sq, 8, tc);
      disc(b, bx, by - 6 + sq, 7, flash ? '#ffffff' : '#5a4a3a'); disc(b, bx - 2, by - 8 + sq, 3, flash ? '#ffffff' : '#7a6a52');
      pset(b, bx + f * 3, by - 7 + sq, '#ff3a2a');
      line(b, bx - 4, by - 1, bx - 5, by, '#c9a052'); line(b, bx + 4, by - 1, bx + 5, by, '#c9a052');
      break;
    }
    case 'lancer': { // 投槍兵：細身に羽飾りの兜。振りかぶると槍を後ろへ引く
      const tc = e.tell > 0 ? (e.tell > 0.6 ? '#ff4a2a' : '#c0402a') : slowGlow ? '#5aa9e6' : null;
      if (tc) rect(b, bx - 6, by - 17, 12, 17, tc);
      rect(b, bx - 4, by - 15, 8, 13, flash ? '#ffffff' : '#4a5a3a'); rect(b, bx - 3, by - 16, 6, 4, flash ? '#ffffff' : '#7a8a5a');
      pset(b, bx + f * 2, by - 14, '#ff3a2a'); pset(b, bx - f * 2, by - 18, '#c9a052'); pset(b, bx - f * 3, by - 19, '#c9a052');
      rect(b, bx - 3, by - 2, 2, 2, '#2a3022'); rect(b, bx + 1, by - 2, 2, 2, '#2a3022');
      const pull = e.state === 'wind' ? Math.round(e.tell * 5) : 0;
      line(b, bx - f * (4 + pull), by - 11, bx + f * (8 - pull), by - 13, '#c8b898'); pset(b, bx + f * (9 - pull), by - 13, '#ffffff');
      break;
    }
    case 'trapper': { // 罠師：背に歯車の罠を背負った小柄な者。置くときにかがむ
      const tc = e.tell > 0 ? (e.tell > 0.6 ? '#ff4a2a' : '#c0402a') : slowGlow ? '#5aa9e6' : null;
      const sq = e.state === 'wind' ? Math.round(e.tell * 2) : 0;
      if (tc) rect(b, bx - 6, by - 14 + sq, 12, 14 - sq, tc);
      rect(b, bx - 4, by - 12 + sq, 8, 10 - sq, flash ? '#ffffff' : '#5a3a2a'); rect(b, bx - 3, by - 14 + sq, 6, 3, flash ? '#ffffff' : '#3a2a22');
      pset(b, bx + f * 2, by - 13 + sq, '#ffe14a');
      disc(b, bx - f * 5, by - 9 + sq, 3, '#7a6a52'); circle(b, bx - f * 5, by - 9 + sq, 3, '#c9a052'); // 背の罠
      rect(b, bx - 3, by - 2, 2, 2, '#2a1a14'); rect(b, bx + 1, by - 2, 2, 2, '#2a1a14');
      break;
    }
    case 'clocker': { // 時限兵：胸に大きな文字盤。印を刻むとき針が速く回る
      const tc = e.tell > 0 ? (e.tell > 0.6 ? '#ff4a2a' : '#c0402a') : slowGlow ? '#5aa9e6' : null;
      if (tc) rect(b, bx - 6, by - 16, 12, 16, tc);
      rect(b, bx - 5, by - 15, 10, 13, flash ? '#ffffff' : '#3a3a52'); rect(b, bx - 3, by - 17, 6, 3, flash ? '#ffffff' : '#2a2a3e');
      disc(b, bx, by - 9, 3, '#e8dcc4'); const ha = t * (e.state === 'wind' ? 20 : 2); line(b, bx, by - 9, bx + Math.round(Math.cos(ha) * 3), by - 9 + Math.round(Math.sin(ha) * 3), '#2a1e18');
      pset(b, bx + f * 2, by - 16, '#ff3a2a');
      rect(b, bx - 3, by - 2, 2, 2, '#1a1a26'); rect(b, bx + 1, by - 2, 2, 2, '#1a1a26');
      break;
    }
    case 'vane': { // 風見鶏：屋根の風見の鶏。狙う方角に矢印が回る
      const tc = e.tell > 0 ? (e.tell > 0.6 ? '#ff4a2a' : '#c0402a') : slowGlow ? '#5aa9e6' : null;
      const yy = by - 5;
      if (tc) disc(b, bx, yy, 6, tc);
      rect(b, bx - 4, yy - 2, 8, 4, flash ? '#ffffff' : '#8a6a3a'); rect(b, bx + f * 3 - (f > 0 ? 0 : 1), yy - 4, 2, 3, flash ? '#ffffff' : '#8a6a3a');
      pset(b, bx + f * 5, yy - 3, '#ffb04a'); pset(b, bx + f * 3, yy - 4, '#ff3a2a'); // くちばしととさか
      line(b, bx - f * 4, yy - 1, bx - f * 7, yy - 4 - (Math.floor(t * 8) % 2), '#c9a052'); // 尾羽
      const a = e.state === 'wind' && e.dirA != null ? e.dirA : t * 1.5;
      const ax = bx + Math.round(Math.cos(a) * 7), ay = yy + 5 + Math.round(Math.sin(a) * 4);
      line(b, bx, yy + 5, ax, ay, e.state === 'wind' ? '#ff4a2a' : '#c8c0b0'); pset(b, ax, ay, '#ffffff');
      if (e.state === 'wind' && e.dirA != null && e.tell > 0.3) { b.globalAlpha = 0.25 + 0.4 * e.tell; dashLine(b, bx, yy, bx + Math.round(Math.cos(e.dirA) * 60), yy + Math.round(Math.sin(e.dirA) * 60), '#ff4a2a', 1, 2); b.globalAlpha = 1; }
      break;
    }
    case 'squire': { // 従者：小さな歯車人形。刻守の従者は金、中ボスの従者は銅。槍か礫を持つ
      const main = e.lord === 'boss' ? '#c9a052' : '#a8683a', dark = e.lord === 'boss' ? '#7a5a2a' : '#5a3a22';
      const tc = e.tell > 0 ? (e.tell > 0.6 ? '#ff4a2a' : '#c0402a') : slowGlow ? '#5aa9e6' : null;
      const bob = e.state === 'move' && Math.abs(e.vx) > 20 ? Math.floor(t * 10) % 2 : 0;
      if (tc) rect(b, bx - 4, by - 10 - bob, 9, 10, tc);
      rect(b, bx - 3, by - 6 - bob, 7, 5, flash ? '#ffffff' : dark); // 胴
      disc(b, bx, by - 8 - bob, 2, flash ? '#ffffff' : main); pset(b, bx + f, by - 8 - bob, '#ff3a2a'); // 頭（歯車）と目
      pset(b, bx - 2, by - 11 - bob, main); pset(b, bx + 2, by - 11 - bob, main); pset(b, bx, by - 11 - bob, main);
      pset(b, bx - 2, by - 1, dark); pset(b, bx + 2, by - 1, dark); // 足
      if (e.role === 'lance') { const ext = e.state === 'poke' ? 5 : e.state === 'wind' ? -1 : 2; line(b, bx + f * 2, by - 5 - bob, bx + f * (5 + ext), by - 5 - bob, '#d8d0c0'); pset(b, bx + f * (6 + ext), by - 5 - bob, '#ffffff'); }
      else { const a = e.state === 'aim' ? t * 20 : 0.6; pset(b, bx - f * 2 + Math.round(Math.cos(a) * 3), by - 8 - bob + Math.round(Math.sin(a) * 3), '#d8d0c0'); }
      break;
    }
    case 'mallet': { // 大槌兵：ずんぐりした鉄の体に大槌。振りかぶると槌が後ろへ回り赤く光る
      const tc = e.tell > 0 ? (e.tell > 0.6 ? '#ff4a2a' : '#c0402a') : slowGlow ? '#5aa9e6' : null;
      if (tc) rect(b, bx - 7, by - 18, 14, 18, tc);
      rect(b, bx - 6, by - 17, 12, 16, flash ? '#ffffff' : '#4a4038'); rect(b, bx - 5, by - 16, 10, 5, flash ? '#ffffff' : '#6a5a48');
      rect(b, bx - 4, by - 12, 8, 1, '#c9a052'); pset(b, bx + f * 3, by - 14, '#ff3a2a');
      rect(b, bx - 5, by - 2, 4, 2, '#2a221c'); rect(b, bx + 1, by - 2, 4, 2, '#2a221c');
      // 槌の角度：構え → 振りかぶり（後ろ） → 振り抜き（前）
      let a = -0.6;
      if (e.state === 'wind') a = -0.6 - e.tell * 2.0;
      else if (e.state === 'swing') a = -2.6 + Math.min(1, e.stateT / 0.1) * 3.4;
      else if (e.state === 'recover') a = 0.9;
      const hx = bx + f * 3, hy = by - 10, len = 13;
      const ang = f > 0 ? a : Math.PI - a;
      const tx = hx + Math.round(Math.cos(ang) * len), ty = hy + Math.round(Math.sin(ang) * len);
      line(b, hx, hy, tx, ty, '#8a6a44', 1);
      rect(b, tx - 3, ty - 3, 6, 6, e.tell > 0.6 ? '#ff6a4a' : '#7a7a86'); rect(b, tx - 2, ty - 2, 4, 4, flash ? '#ffffff' : '#a8a8b4');
      if (e.state === 'swing' && e.stateT < 0.16) { arc(b, hx, hy, 15, f > 0 ? -1.4 : Math.PI - 0.8, f > 0 ? 0.8 : Math.PI + 1.4, '#ffd0a0', 2); }
      if (e.state === 'recover') for (let i = 0; i < 3; i++) pset(b, bx - 3 + i * 3, by - 21 - (Math.floor(t * 6 + i) % 2), '#9a8fa6');
      break;
    }
    case 'warden': { // 振り子の番人：大きな柱時計の体・文字盤の顔・胸の振り子
      const x0 = bx - 10, y0 = by - 28;
      const tellCol = e.tell > 0 ? (e.tell > 0.6 ? '#ff4a2a' : '#c0402a') : null;
      if (tellCol) { rect(b, x0 - 1, y0 - 1, 22, 30, tellCol); }
      else if (slowGlow) { rect(b, x0 - 1, y0 - 1, 22, 30, '#5aa9e6'); }
      rect(b, x0, y0, 20, 28, flash ? '#ffffff' : '#3a2a22');
      rect(b, x0 + 1, y0 + 1, 18, 26, flash ? '#ffffff' : '#5a3e2c');
      rect(b, x0, y0 + 10, 20, 1, '#c9a052'); rect(b, x0 + 2, by - 2, 16, 2, '#2a1e18');
      // 文字盤の顔と赤い目
      disc(b, bx, y0 + 5, 4, '#e8dcc4'); pset(b, bx - 2, y0 + 5, '#ff3a2a'); pset(b, bx + 2, y0 + 5, '#ff3a2a');
      const ha = t * 2; line(b, bx, y0 + 5, bx + Math.round(Math.cos(ha) * 3), y0 + 5 + Math.round(Math.sin(ha) * 3), '#2a1e18');
      // 胸の振り子（予兆中は大きく振れる）
      const amp = e.state === 'sweepWind' ? 0.9 : 0.35, pa = Math.sin(e.pend || 0) * amp;
      const pl = 12, px1 = bx + Math.round(Math.sin(pa) * pl), py1 = y0 + 12 + Math.round(Math.cos(pa) * pl);
      line(b, bx, y0 + 12, px1, py1, '#c9a052'); disc(b, px1, py1, 2, '#f2c14e');
      // 腕と大振り子の刃
      if (e.state === 'sweepWind') dashLine(b, bx + f * 10, by - 14, bx + f * 46, by - 14 + Math.round(e.tell * 6), e.tell > 0.6 ? '#ff4a2a' : '#c0402a');
      if (e.state === 'sweep') { arc(b, bx + f * 6, by - 16, 34, f > 0 ? -1.1 : Math.PI - 0.8, f > 0 ? 0.8 : Math.PI + 1.1, '#ff8a5a', 3); arc(b, bx + f * 6, by - 16, 30, f > 0 ? -0.9 : Math.PI - 0.6, f > 0 ? 0.6 : Math.PI + 0.9, '#ffffff', 1); }
      if (e.state === 'tollWind') { const bt = Math.round(e.tell * 4); for (let i = 0; i < 6; i++) rect(b, bx - 2 - Math.floor(i / 2), y0 - 10 - bt + i, 5 + Math.floor(i / 2) * 2, 1, '#f2c14e'); }
      if (e.state === 'liftWind' || e.state === 'lift') { // 振り子を真上へ
        const up = e.state === 'lift';
        dashLine(b, bx, y0 + 12, bx, y0 - 10 - (up ? 30 : Math.round(e.tell * 8)), e.tell > 0.6 || up ? '#ff4a2a' : '#c0402a');
        if (up && e.stateT < 0.2) glowLine(b, bx, y0, bx, y0 - 52, '#ffd0a0', 3);
      }
      if (e.state === 'bladeWind') { const a = t * 20; for (let i = 0; i < 2; i++) line(b, bx - f * 12, by - 18, bx - f * 12 + Math.round(Math.cos(a + i * Math.PI) * 7), by - 18 + Math.round(Math.sin(a + i * Math.PI) * 4), e.tell > 0.6 ? '#ff4a2a' : '#ffe6c0', 2); }
      if (e.state === 'notesWind') { const r = 6 + Math.round(e.tell * 10); b.globalAlpha = 0.6; circle(b, bx, y0 + 5, r, '#ffe14a'); b.globalAlpha = 1; }
      if (e.state === 'spinAir') { const a = e.spinA || 0; for (let i = 0; i < 2; i++) { const aa = a + i * Math.PI; glowLine(b, bx, by - 14, bx + Math.round(Math.cos(aa) * 26), by - 14 + Math.round(Math.sin(aa) * 20), '#ffd0a0', 2); } arc(b, bx, by - 14, 26, a - 1.2, a, '#ffffff', 1); }
      if (e.state === 'jump' && e.tell) { const gy = Math.round(game.map.groundBelow(cx(e), e.y + e.h) / 2); b.globalAlpha = 0.5; rect(b, bx - 10, gy - 1, 20, 1, '#ff4a2a'); b.globalAlpha = 1; }
      if (e.state === 'recover' || e.state === 'stagger') for (let i = 0; i < 3; i++) pset(b, bx - 3 + i * 3, y0 - 4 - (Math.floor(t * 6 + i) % 2), '#9a8fa6');
      break;
    }
    case 'boss': if (!e.vanished) drawBoss(b, game, e, bx, by, t, flash, slowGlow); break;
  }
}
function outlinedImg(b, img, x, y, color) {
  b.save(); b.globalAlpha = 0.8; b.filter = 'none';
  const w = img.width, h = img.height;
  b.fillStyle = color;
  b.fillRect(Math.round(x - w / 2) - 1, Math.round(y - h / 2) - 1, w + 2, 1);
  b.fillRect(Math.round(x - w / 2) - 1, Math.round(y + h / 2), w + 2, 1);
  b.restore();
}

function drawBoss(b, game, e, bx, by, t, flash, slowGlow) {
  const f = e.face, duel = e.finalForm ? 'final' : e.trueDuel;
  const wind = ['swingWind', 'handsWind', 'stopWind', 'stepWind', 'antiAirWind', 'leapWind', 'feint', 'punishWind', 'rainWind', 'ringsWind', 'tripleWind', 'dashWind', 'novaWind', 'judgeWind'].includes(e.state);
  // 白き刻守の技の予告：当たる範囲を、実際の当たり判定どおりに大きく描く（色が赤 → 放つ直前に白へ変わる）
  const hot = e.tell > 0.75, warn = hot ? '#ffffff' : '#ff4a2a', pulse = 0.5 + 0.5 * Math.sin(t * (hot ? 30 : 14));
  if (e.state === 'rainWind' && e.rainXs) for (const x of e.rainXs) {
    const gx = Math.round(x / 2), gy = Math.round(Math.min(game.map.groundBelow(x, e.y), game.map.pxH) / 2);
    b.globalAlpha = 0.12 + 0.22 * e.tell; rect(b, gx - 4, camPY, 9, gy - camPY, '#ff4a2a'); // 針が降る筋
    b.globalAlpha = 0.5 + 0.5 * e.tell * pulse; rect(b, gx - 5, gy - 2, 11, 2, warn); b.globalAlpha = 1;
  }
  if (e.state === 'dashWind') { const x1 = f > 0 ? game.map.pxW / 2 : 0, x0 = Math.round(cx(e) / 2); b.globalAlpha = 0.14 + 0.24 * e.tell; rect(b, Math.min(x0, x1), Math.round(e.y / 2), Math.abs(x1 - x0), Math.round(e.h / 2), '#ff4a2a'); b.globalAlpha = 0.6 + 0.4 * pulse * e.tell; rect(b, Math.min(x0, x1), Math.round(cy(e) / 2) - 1, Math.abs(x1 - x0), 2, warn); b.globalAlpha = 1; }
  if (e.state === 'tripleWind' || e.state === 'triple') { const box = e.frontBox(110, 70, -4), bxx = Math.round(box.x / 2), byy = Math.round(box.y / 2), bw = Math.round(box.w / 2), bh = Math.round(box.h / 2); b.globalAlpha = e.state === 'triple' ? 0.35 : 0.14 + 0.26 * e.tell; rect(b, bxx, byy, bw, bh, e.state === 'triple' ? '#ffffff' : '#ff4a2a'); b.globalAlpha = 0.5 + 0.5 * pulse; rect(b, bxx, byy, bw, 1, warn); rect(b, bxx, byy + bh - 1, bw, 1, warn); rect(b, f > 0 ? bxx + bw - 1 : bxx, byy, 1, bh, warn); b.globalAlpha = 1; }
  if (e.state === 'ringsWind') { for (let i = 0; i < 3; i++) { b.globalAlpha = (0.25 + 0.5 * e.tell) * (1 - i * 0.25); circle(b, bx, Math.round(cy(e) / 2), 10 + i * 12 + Math.round(e.tell * 16), i === 0 ? warn : '#ffd0c0'); } b.globalAlpha = 1; }
  if (e.state === 'novaWind') {
    const R = Math.round(NOVA_R / 2), ccy = Math.round(cy(e) / 2);
    b.globalAlpha = 0.1 + 0.22 * e.tell; disc(b, bx, ccy, R, '#ff4a2a');
    b.globalAlpha = 0.6 + 0.4 * pulse; circle(b, bx, ccy, R, warn); circle(b, bx, ccy, R - 1, warn);
    b.globalAlpha = 0.8; circle(b, bx, ccy, Math.max(4, Math.round(R * e.tell)), '#ffffff'); b.globalAlpha = 1; // 内側の輪が外の輪に届いたら弾ける
  }
  if (e.state === 'judgeWind' && e.safes) {
    // 部屋全体が赤く染まり、金の光の柱（安全地帯）だけが残る
    const L = camPX, R = camPX + PW, s = e.safes.map((z) => [Math.round(z.x0 / 2), Math.round(z.x1 / 2)]).sort((a, c) => a[0] - c[0]);
    let x = L; b.globalAlpha = 0.12 + 0.3 * e.tell;
    for (const [a, c] of s) { if (a > x) rect(b, x, camPY, a - x, PH, hot ? '#ffb0a0' : '#ff3a2a'); x = Math.max(x, c); }
    if (x < R) rect(b, x, camPY, R - x, PH, hot ? '#ffb0a0' : '#ff3a2a');
    for (const [a, c] of s) {
      b.globalAlpha = 0.18 + 0.3 * e.tell; rect(b, a, camPY, c - a, PH, '#ffd84a');
      b.globalAlpha = 0.7 + 0.3 * pulse; rect(b, a, camPY, 1, PH, '#ffe9a0'); rect(b, c - 1, camPY, 1, PH, '#ffe9a0');
      for (let k = 0; k < 6; k++) pset(b, a + 2 + ((k * 7 + Math.floor(t * 9)) % Math.max(1, c - a - 4)), camPY + PH - ((t * 40 + k * 29) % PH), '#fff6d0'); // 立ちのぼる光
    }
    b.globalAlpha = 1;
  }
  // 白き刻守の構え：体が赤く脈打って光る（放つ直前は白く速く）。巨体でも予兆が見える
  if (e.finalForm && wind) { b.globalAlpha = 0.35 + 0.45 * e.tell; glow(b, bx, by - 40, 34 + 14 * e.tell + 4 * pulse, hot ? '#ffffff' : '#ff4a2a', 0.5 + 0.5 * e.tell); b.globalAlpha = 1; if (e.stateT < 0.3) { rect(b, bx - 1, by - 112, 3, 9, '#ff4a2a'); rect(b, bx - 1, by - 101, 3, 3, '#ff4a2a'); } }
  if (e.state === 'triple' && e.stateT < 0.16) arc(b, bx + f * 6, Math.round(cy(e) / 2), 40, f > 0 ? -1.0 : Math.PI - 0.8, f > 0 ? 0.8 : Math.PI + 1.0, '#ffffff', 3);
  // 白き刻守：白く大きい（体を 1.45 倍に描く）。白い光をまとう
  const big = e.finalForm ? 1.45 : 1;
  if (e.finalForm) { glow(b, bx, by - 20, 26 + 3 * Math.sin(t * 3), '#ffffff', e.state === 'transform' ? 0.6 : 0.22); b.save(); b.translate(bx, by); b.scale(big, big); b.translate(-bx, -by); }
  // 予告（範囲）は体より先に
  if (e.state === 'leap') {
    const gx = Math.round(e.leapX / 2), gy = Math.round(game.map.groundBelow(e.leapX, e.y + e.h) / 2);
    for (let i = -23; i <= 23; i++) if ((i + Math.floor(t * 20)) % 2 === 0) pset(b, gx + i, gy - 1, '#ff4a2a');
    rect(b, gx - 14, gy - 2, 29, 1, '#ff4a2a');
  }
  if (e.state === 'swingWind') wedge(b, bx, Math.round(cy(e) / 2) - 2, 59, f > 0 ? -0.9 : Math.PI - 0.6, f > 0 ? 0.6 : Math.PI + 0.9, e.tell > 0.6 ? 'rgba(255,74,42,0.55)' : 'rgba(255,90,60,0.32)');
  if (e.state === 'handsWind' && e.targets) for (const tg of e.targets) dashLine(b, bx, by - 21, tg.x / 2, tg.y / 2, e.tell > 0.6 ? '#ff4a2a' : '#c0402a');
  if (e.ringT > 0) circle(b, bx, Math.round(cy(e) / 2), 22 + Math.round(Math.sin(t * 8)), '#b67cf0');
  // 時計の針の冠
  const hx = bx + f * 1, hy = by - 24;
  const spin = e.phase === 3 ? -t * 0.8 : 0;
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + spin, len = i % 3 === 0 ? 12 : 8;
    line(b, hx + Math.cos(a) * 5, hy + Math.sin(a) * 5, hx + Math.cos(a) * len, hy + Math.sin(a) * len, duel ? '#ffd38a' : '#c9a052');
  }
  const frame = e.state === 'defeated' ? 'kneel' : (e.state === 'swing' || e.state === 'riposte' || e.state === 'step') ? 'lunge' : wind ? 'wind' : 'stand';
  if (e.tellKind === 'real' && e.state === 'swingWind') outlined(b, 'boss', frame, bx, by, f, 1, 'white', duel); // フェイントの後の本当の一撃
  else if (wind) outlined(b, 'boss', frame, bx, by, f, 0.3 + e.tell * 0.7, 'red', duel);
  else if (e.state === 'parry') outlined(b, 'boss', frame, bx, by, f, 1, 'blue', duel);
  else outlined(b, 'boss', frame, bx, by, f, slowGlow, 'blue', duel);
  drawSprite(b, spr('boss', frame, flash ? 'white' : null, duel), bx, by, f);
  // 歯車の外殻（連撃対策）：体のまわりを回る装甲板
  if (e.counter === 'combo' && e.shell > 0) {
    const n = 8, cyy = Math.round(cy(e) / 2);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + t * 1.5, px = bx + Math.cos(a) * 15, py = cyy + Math.sin(a) * 15;
      rect(b, px - 2, py - 2, 4, 4, '#120c14'); rect(b, px - 1, py - 1, 2, 2, Math.sin(a) > 0 ? '#c9a052' : '#8a6a34');
    }
  }
  // 振り子の剣
  if (e.state !== 'defeated') {
    let ang = f > 0 ? 0.6 : Math.PI - 0.6;
    if (e.state === 'swingWind') ang = f > 0 ? Math.PI + 0.6 + e.tell * 0.5 : -0.6 - e.tell * 0.5;
    if (e.state === 'swing' || e.state === 'riposte' || e.state === 'step') ang = f > 0 ? 0.1 : Math.PI - 0.1;
    const sx = bx + f * 5, sy = by - 15;
    const ex = sx + Math.cos(ang) * 30, ey = sy + Math.sin(ang) * 30;
    line(b, sx, sy, ex, ey, '#e2d6b8', 2);
    for (let i = 0; i < 4; i++) rect(b, ex - i, ey - 3 + i, i * 2 + 1, 1, '#f2c14e'), rect(b, ex - i, ey + 3 - i, i * 2 + 1, 1, '#f2c14e');
    if (e.state === 'swing') arc(b, bx, Math.round(cy(e) / 2) - 2, 50, f > 0 ? -0.9 : Math.PI - 0.6, f > 0 ? 0.6 : Math.PI + 0.9, '#ffc878', 4);
  }
  if (e.finalForm) b.restore();
  // 懐中時計
  if (e.state === 'stopWind') {
    const k = e.tell, wx = bx - f * 3, wy = by - 34 - Math.round(k * 5);
    disc(b, wx, wy, 4 + Math.round(k * 2), '#ffffff'); circle(b, wx, wy, 4 + Math.round(k * 2), '#8c6d2a');
    line(b, wx, wy, wx + Math.cos(t * 12) * 3, wy + Math.sin(t * 12) * 3, '#1a1420');
    b.globalAlpha = k * 0.6; circle(b, bx, Math.round(cy(e) / 2), 20 + Math.round(k * 40), '#ffffff'); b.globalAlpha = 1;
  }
  if (e.state === 'antiAirWind') for (let i = 0; i < 6; i++) rect(b, bx - i, by - 46 + i, i * 2 + 1, 1, e.tell > 0.5 ? '#ff4a2a' : '#c0402a');
  if (e.state === 'leapWind') rect(b, bx - 12, by - 1, 25, 1, '#ff4a2a');
}

function hpBar(b, e, top = e.y) {
  // 弱体の印：錆び（茶の点）・脆さ（紫のひび）・鎖（灰の輪）
  if (e.hp > 0 && (e.rustT > 0 || e.brittleT > 0 || e.snareT > 0)) {
    let mx = Math.round(cx(e) / 2) - 6; const my = Math.round(top / 2) - 11;
    if (e.rustT > 0) { rect(b, mx, my, 3, 3, '#a8652a'); rect(b, mx + 1, my + 1, 1, 1, '#e0a050'); mx += 5; }
    if (e.brittleT > 0) { rect(b, mx, my, 1, 3, '#c07cff'); rect(b, mx + 1, my + 1, 1, 1, '#c07cff'); rect(b, mx + 2, my, 1, 2, '#c07cff'); mx += 5; }
    if (e.snareT > 0) { rect(b, mx, my, 3, 1, '#b8b8c0'); rect(b, mx, my + 2, 3, 1, '#b8b8c0'); rect(b, mx, my, 1, 3, '#b8b8c0'); rect(b, mx + 2, my, 1, 3, '#b8b8c0'); }
  }
  if (e.hp >= e.maxHp || e.boss || e.hp <= 0) return;
  const w = e.elite ? 24 : 14, x = Math.round(cx(e) / 2 - w / 2), y = Math.round(top / 2) - 6;
  rect(b, x - 1, y - 1, w + 2, 4, '#0a0610');
  rect(b, x, y, Math.max(1, Math.round(w * clamp(e.hp / e.maxHp, 0, 1))), 2, e.elite ? '#f2c14e' : '#e35d5d');
}

function drawProjectile(b, pr, t) {
  const x = Math.round((pr.x + pr.w / 2) / 2), y = Math.round((pr.y + pr.h / 2) / 2);
  if (pr.delay > 0 && Math.floor(t * 16) % 2) b.globalAlpha = 0.5;
  if (pr.kind === 'bolt') {
    disc(b, x, y, 2, '#ffb347'); pset(b, x - 1, y - 1, '#fff0c0');
    pset(b, x - Math.sign(pr.vx) * 3, y - Math.sign(pr.vy) * 2, '#ff8a3c');
  } else if (pr.kind === 'hand') {
    const vx = pr.vx || (pr.homing ? 0 : 1), vy = pr.vy || (pr.homing ? 1 : 0), d = Math.hypot(vx, vy) || 1;
    const ux = vx / d, uy = vy / d;
    const col = pr.delay > 0 ? '#e8e8ff' : '#f2c14e';
    line(b, x - ux * 5, y - uy * 5, x + ux * 4, y + uy * 4, col);
    pset(b, x + ux * 5, y + uy * 5, '#ffffff');
    pset(b, x - uy * 1 + ux * 2, y + ux * 1 + uy * 2, col); pset(b, x + uy * 1 + ux * 2, y - ux * 1 + uy * 2, col);
  } else if (pr.kind === 'arrow') {
    const d = Math.hypot(pr.vx, pr.vy) || 1, ux = pr.vx / d, uy = pr.vy / d;
    line(b, x - ux * 5, y - uy * 5, x + ux * 3, y + uy * 3, '#c8b898');
    pset(b, x + ux * 4, y + uy * 4, '#ffffff');
    pset(b, x - ux * 5 - uy, y - uy * 5 + ux, '#ff4a2a'); pset(b, x - ux * 5 + uy, y - uy * 5 - ux, '#ff4a2a');
  } else if (pr.kind === 'bomb') {
    disc(b, x, y, 2, '#2c2531'); pset(b, x, y - 3, Math.floor(t * 12) % 2 ? '#ff4a2a' : '#ffe14a');
  } else if (pr.kind === 'ring') {
    const k = pr.r / pr.maxR;
    b.globalAlpha = 1 - k * 0.6;
    for (let i = 0; i < Math.max(1, Math.round(pr.band / 4)); i++) circle(b, pr.x / 2, pr.y / 2, Math.max(1, pr.r / 2 - i * 2), i % 2 ? '#c9a052' : '#ffe6a0');
    b.globalAlpha = 1;
  } else if (pr.kind === 'javelin') { // 投げ槍：飛ぶ向きに傾く
    const d = Math.hypot(pr.vx, pr.vy) || 1, ux = pr.vx / d, uy = pr.vy / d;
    line(b, x - ux * 7, y - uy * 7, x + ux * 5, y + uy * 5, '#c8b898'); pset(b, x + ux * 6, y + uy * 6, '#ffffff'); pset(b, x + ux * 5 - uy, y + uy * 5 + ux, '#e8e0d0');
  } else if (pr.kind === 'trap') { // 歯車の罠：置かれた直後は点滅、準備ができると歯が開く
    const gy = Math.round((pr.y + pr.h) / 2), armed = pr.delay <= 0;
    if (armed) glow(b, x, gy - 2, 6, '#ff6a3a', 0.25 + 0.15 * Math.sin(t * 8));
    rect(b, x - 6, gy - 2, 12, 2, '#3a2a1e'); rect(b, x - 6, gy - 3, 12, 1, '#c9a052'); disc(b, x, gy - 2, 1, '#7a6a52');
    for (let i = 0; i < 6; i++) { const tx = x - 5 + i * 2; rect(b, tx, gy - (armed ? 6 : 4), 1, armed ? 3 : 1, armed ? '#f0e8d8' : '#9a9a9a'); }
    if (armed) { pset(b, x - 7, gy - 4, '#ff4a2a'); pset(b, x + 6, gy - 4, '#ff4a2a'); }
    if (pr.delay > 0 && pr.from && pr.t < 0.3) { const k = pr.t / 0.3; disc(b, Math.round((pr.from.x / 2) * (1 - k) + x * k), Math.round((pr.from.y / 2) * (1 - k) + gy * k - Math.sin(k * Math.PI) * 10), 2, '#c9a052'); }
  } else if (pr.kind === 'mark') { // 時計の印 → 光の柱
    const gy = Math.round(pr.gy / 2);
    if (pr.delay > 0) {
      const total = pr.life - 0.25, k = clamp(1 - pr.delay / total, 0, 1);
      b.globalAlpha = 1;
      circle(b, x, gy - 2, 8, k > 0.75 ? '#ff4a2a' : '#c9a052');
      for (let i = 0; i < 12; i++) { const a = -Math.PI / 2 + i / 12 * Math.PI * 2; if (i / 12 <= k) pset(b, x + Math.round(Math.cos(a) * 8), gy - 2 + Math.round(Math.sin(a) * 3), '#ffe14a'); }
      const ha = -Math.PI / 2 + k * Math.PI * 2; line(b, x, gy - 2, x + Math.round(Math.cos(ha) * 7), gy - 2 + Math.round(Math.sin(ha) * 3), '#ffffff');
      if (k > 0.75) { b.globalAlpha = 0.25; rect(b, x - 9, gy - 48, 18, 46, '#ff4a2a'); b.globalAlpha = 1; }
    } else {
      glow(b, x, gy - 24, 14, '#ffe6a0', 0.6);
      rect(b, x - 8, gy - 48, 16, 48, '#ffe6a0'); rect(b, x - 4, gy - 48, 8, 48, '#ffffff');
    }
  } else if (pr.kind === 'needle') { // 指向性の針：止まると向き直る線が出る
    if (!pr.turned && pr.t > pr.turnAt && pr.aimA != null) {
      b.globalAlpha = 0.5; dashLine(b, x, y, x + Math.round(Math.cos(pr.aimA) * 80), y + Math.round(Math.sin(pr.aimA) * 80), '#ff4a2a', 1, 2); b.globalAlpha = 1;
      disc(b, x, y, 2, '#ffffff');
    } else {
      const d = Math.hypot(pr.vx, pr.vy) || 1, ux = pr.vx / d, uy = pr.vy / d;
      line(b, x - ux * 4, y - uy * 4, x + ux * 3, y + uy * 3, '#e8e8ff'); pset(b, x + ux * 4, y + uy * 4, '#ffffff');
    }
  } else if (pr.kind === 'biggear') { // 戻ってくる大歯車
    const a = pr.spin || 0;
    glow(b, x, y, 9, '#ffb04a', 0.35);
    disc(b, x, y, 6, '#2a1e18'); disc(b, x, y, 5, '#8a6a3a'); disc(b, x, y, 2, '#2a1e18');
    for (let i = 0; i < 8; i++) { const aa = a + i / 8 * Math.PI * 2; rect(b, Math.round(x + Math.cos(aa) * 7) - 1, Math.round(y + Math.sin(aa) * 7) - 1, 2, 2, '#c9a052'); }
  } else if (pr.kind === 'blade') { // 回る振り子の刃
    const a = pr.t * 18;
    glow(b, x, y, 8, '#ff8a5a', 0.3);
    for (let i = 0; i < 2; i++) { const aa = a + i * Math.PI; line(b, x, y, Math.round(x + Math.cos(aa) * 7), Math.round(y + Math.sin(aa) * 4), '#ffe6c0', 2); }
    disc(b, x, y, 2, '#c9a052');
  } else if (pr.kind === 'note') { // 追ってくる鐘の音・火花
    const col = pr.color || '#ffe14a';
    glow(b, x, y, 6, col, 0.45);
    disc(b, x, y, 3, col); pset(b, x - 1, y - 1, '#ffffff');
    const d = Math.hypot(pr.vx, pr.vy) || 1;
    for (let i = 1; i <= 3; i++) { b.globalAlpha = 0.5 - i * 0.12; pset(b, Math.round(x - pr.vx / d * i * 2), Math.round(y - pr.vy / d * i * 2), col); }
    b.globalAlpha = 1;
  } else if (pr.kind === 'wave') {
    const bx = Math.round(pr.x / 2), by = Math.round((pr.y + pr.h) / 2);
    for (let i = 0; i < 8; i++) { const h = Math.round(Math.sin(i / 7 * Math.PI) * 8); rect(b, bx + i, by - h, 1, h, i % 2 ? '#ffaa5a' : '#ffd08a'); }
  }
  b.globalAlpha = 1;
}

// ───────── 小物・仕掛け ─────────
function causalMark(b, x, y, t, wedged) {
  x = Math.round(x); y = Math.round(y);
  circle(b, x, y, 3, '#f2c14e');
  line(b, x, y, x, y - 2, '#f2c14e'); pset(b, x + 1, y + 1, '#f2c14e');
  if (wedged) {
    const on = Math.sin(t * 3) > -0.3;
    for (let i = 0; i < 5; i++) rect(b, x - 2 + Math.floor(i / 2), y + 5 + i, 5 - Math.floor(i / 2) * 2, 1, on ? '#f2c14e' : '#c9a052');
  }
}
function glyph(b, kind, x, y, col) {
  x = Math.round(x); y = Math.round(y);
  if (kind === 'boon' || kind === 'boon2') {
    const n = kind === 'boon2' ? 2 : 1;
    for (let k = 0; k < n; k++) { const ox = x + (n === 2 ? (k ? 3 : -3) : 0); for (let i = 0; i < 3; i++) rect(b, ox - i, y - 2 + i, i * 2 + 1, 1, col), rect(b, ox - i, y + 2 - i, i * 2 + 1, 1, col); }
  } else if (kind === 'heal') { rect(b, x - 1, y - 3, 3, 7, col); rect(b, x - 3, y - 1, 7, 3, col); }
  else if (kind === 'gold') { disc(b, x, y, 3, col); rect(b, x - 1, y - 1, 2, 1, '#fff6c0'); pset(b, x, y, '#8c6d2a'); }
  else if (kind === 'artifact') { for (let i = 0; i < 4; i++) rect(b, x - 3 + i, y - i, 7 - i * 2, 1, col), rect(b, x - 3 + i, y + i, 7 - i * 2, 1, col); pset(b, x - 1, y - 1, '#ffffff'); }
  else if (kind === 'key') { disc(b, x - 2, y - 1, 2, col); pset(b, x - 2, y - 1, '#0a0610'); rect(b, x, y - 1, 4, 1, col); rect(b, x + 2, y, 1, 2, col); rect(b, x + 3, y, 1, 1, col); }
  else if (kind === 'hourglass') { rect(b, x - 3, y - 3, 7, 1, col); rect(b, x - 3, y + 3, 7, 1, col); for (let i = 0; i < 3; i++) rect(b, x - 2 + i, y - 2 + i, 5 - i * 2, 1, col), rect(b, x - 2 + i, y + 2 - i, 5 - i * 2, 1, col); }
}
const REWARD_COLOR = { boon: '#f2c14e', boon2: '#f2c14e', heal: '#5fd18b', hourglass: '#efe4cc', gold: '#ffd84a', artifact: '#7fe0d0', key: '#ffd84a' };

function drawItem(b, game, it) {
  const t = game.time;
  const x = Math.round(it.x / 2), y = Math.round(it.y / 2), w = Math.round(it.w / 2), h = Math.round(it.h / 2);
  const bot = y + h, mid = x + Math.round(w / 2);
  if (it.vault && !game.run.vaultOpen) { dashLine(b, x, bot, x + w, bot, '#3a3242'); return; }
  switch (it.kind) {
    case 'door': {
      const frame = it.golden ? '#ffd84a' : it.causal ? '#f2c14e' : it.boss ? '#e35d5d' : '#8c7a5a';
      rect(b, x, y + 4, w, h - 4, '#0a0610');
      for (let i = 0; i < Math.ceil(w / 2); i++) { const hh = Math.round(Math.sqrt(Math.max(0, (w / 2) ** 2 - (i - w / 2) ** 2)) * 0.6); rect(b, x + i, y + 4 - hh, 1, hh, '#0a0610'); rect(b, x + w - 1 - i, y + 4 - hh, 1, hh, '#0a0610'); }
      // 枠
      for (let yy = y + 4; yy < bot; yy++) { pset(b, x - 1, yy, frame); pset(b, x + w, yy, frame); }
      for (let i = 0; i <= w; i++) { const hh = Math.round(Math.sqrt(Math.max(0, (w / 2) ** 2 - (i - w / 2) ** 2)) * 0.6); pset(b, x + i, y + 3 - hh, frame); }
      // 奥の光
      const glow = it.golden ? (Math.sin(t * 4) > 0 ? '#6a5418' : '#8a6c20') : Math.sin(t * 3) > 0 ? '#3a2a1a' : '#4a3420';
      if (it.golden) glyph(b, 'key', mid, y - 8 + Math.round(Math.sin(t * 3)), '#ffd84a');
      for (let yy = y + 6; yy < bot; yy += 2) rect(b, x + 2, yy, w - 4, 1, glow);
      if (it.reward) glyph(b, it.reward, mid, y - 8 + Math.round(Math.sin(t * 3)), REWARD_COLOR[it.reward]);
      if (it.causal) causalMark(b, mid, y - 10, t, false);
      break;
    }
    case 'reward': {
      const yy = y + Math.round(Math.sin((it.bob || 0) * 4) * 2) + 6;
      const r = 6 + (Math.floor(t * 6) % 2);
      b.globalAlpha = 0.35; disc(b, mid, yy, r, REWARD_COLOR[it.reward]); b.globalAlpha = 1;
      glyph(b, it.reward, mid, yy, '#ffffff');
      if (Math.floor(t * 8) % 4 === 0) pset(b, mid + 5, yy - 6, '#ffffff');
      break;
    }
    case 'merchant': { // 行商人の屋台：縞の日よけ・品物の並ぶ台・頭巾の商人
      const sx = x, sw = w;
      for (let i = 0; i < sw; i += 4) rect(b, sx + i, y, 2, 4, '#c94a3a'), rect(b, sx + i + 2, y, 2, 4, '#efe4cc');
      rect(b, sx, y + 4, sw, 1, '#7a2a22');
      rect(b, sx + 1, y + 5, 1, h - 5, '#4a3626'); rect(b, sx + sw - 2, y + 5, 1, h - 5, '#4a3626');
      // 商人（頭巾）
      const mx = sx + Math.round(sw / 2), bob = Math.floor(t * 2) % 2;
      rect(b, mx - 3, y + 7 + bob, 7, 6, '#3a5a4a'); rect(b, mx - 2, y + 9 + bob, 5, 3, '#e8c8a0'); pset(b, mx - 1, y + 10 + bob, '#1a1018'); pset(b, mx + 1, y + 10 + bob, '#1a1018');
      rect(b, mx - 4, y + 13, 9, 5, '#2e4a3c');
      // 台と品物
      rect(b, sx + 2, bot - 8, sw - 4, 8, '#5a4030'); rect(b, sx + 2, bot - 9, sw - 4, 1, '#8c6a4a');
      disc(b, sx + 7, bot - 11, 2, '#5fd18b'); disc(b, sx + 13, bot - 11, 2, '#ff6a6a');
      for (let i = 0; i < 3; i++) rect(b, sx + sw - 14 + i * 3, bot - 12 - (i % 2), 2, 3, '#ffd84a');
      if (Math.floor(t * 3) % 3 === 0) pset(b, sx + sw - 11, bot - 14, '#ffffff');
      break;
    }
    case 'shrine': { // 時の祠：石の台座に浮かぶ砂時計
      rect(b, x + 2, bot - 8, w - 4, 8, '#3a3242'); rect(b, x + 1, bot - 9, w - 2, 1, '#5c5068');
      rect(b, mid - 2, bot - 22, 5, 13, '#2a2433');
      if (!it.used) {
        const yy = bot - 32 + Math.round(Math.sin(t * 2) * 2);
        b.globalAlpha = 0.35; disc(b, mid, yy, 7, '#e35d5d'); b.globalAlpha = 1;
        glyph(b, 'hourglass', mid, yy, '#ffb0a0');
      }
      break;
    }
    case 'goldchest': {
      const open = it.opened;
      b.globalAlpha = 0.25 + 0.15 * Math.sin(t * 3); disc(b, mid, bot - 8, 14, '#ffd84a'); b.globalAlpha = 1;
      rect(b, x + 2, bot - 10, w - 4, 10, '#8a6420'); rect(b, x + 3, bot - 9, w - 6, 8, '#c9962e');
      rect(b, x + 2, bot - 6, w - 4, 1, '#ffd84a');
      if (!open) { rect(b, x + 2, bot - 14, w - 4, 4, '#ffd84a'); rect(b, x + 3, bot - 15, w - 6, 1, '#fff2b0'); rect(b, mid - 1, bot - 11, 3, 3, '#5a3a10'); }
      else { rect(b, x + 2, bot - 18, w - 4, 3, '#8a6420'); for (let i = 0; i < 4; i++) pset(b, mid - 4 + i * 3, bot - 13 - (Math.floor(t * 6 + i) % 3), '#fff2b0'); }
      if (!open && Math.floor(t * 6) % 4 === 0) pset(b, x + w - 3, bot - 16, '#ffffff');
      break;
    }
    case 'sign':
      rect(b, x + 5, y + 8, 2, 12, '#4a3626'); rect(b, x, y + 2, 12, 7, '#2e2016'); rect(b, x + 1, y + 3, 10, 5, '#8c7556');
      rect(b, x + 2, y + 4, 6, 1, '#5a4836'); rect(b, x + 2, y + 6, 8, 1, '#5a4836');
      break;
    case 'npc': {
      const bob = Math.floor(t * 1.5 + it.x) % 2;
      if (it.who === 'lira') drawSprite(b, spr('lira', 'a'), mid, bot - bob * 0, 1);
      else drawSprite(b, spr('glen', 'a'), mid, bot, 1);
      if (it.who === 'glen' && it.inDanger && game.run.glen === 'attacked') {
        const k = clamp(game.room.glenHp / 60, 0, 1);
        rect(b, mid - 11, y - 8, 22, 4, '#0a0610'); rect(b, mid - 10, y - 7, Math.round(20 * k), 2, k < 0.35 ? '#ff5a3c' : '#5fd18b');
      }
      if (it.causal) causalMark(b, mid, y - (it.inDanger ? 15 : 7), t, it.wedged || (it.who === 'lira' && game.meta.wedges.some((wd) => wd.target === 'lira')));
      break;
    }
    case 'corpse':
      rect(b, x - 4, bot - 2, w + 8, 2, '#5a1a16');
      rect(b, x, bot - 6, w, 5, '#1c1424'); rect(b, x + 1, bot - 5, w - 2, 3, '#7a5a44'); rect(b, x + w - 5, bot - 6, 4, 4, '#f3dcc0');
      break;
    case 'codedoor': {
      const open = game.run.vaultOpen;
      rect(b, x, y, w, h, '#120c14'); rect(b, x + 1, y + 1, w - 2, h - 1, open ? '#0a0610' : '#3a3242');
      if (!open) {
        for (let i = 0; i < 3; i++) { disc(b, x + 6 + i * 7, y + 13, 2, '#8c6d2a'); pset(b, x + 6 + i * 7, y + 11, '#f2c14e'); }
        rect(b, x + 3, y + 3, w - 6, 1, '#5c5068'); rect(b, x + 3, bot - 4, w - 6, 1, '#5c5068');
      } else for (let yy = y + 3; yy < bot; yy += 2) rect(b, x + 3, yy, w - 6, 1, '#1a1426');
      for (let yy = y; yy < bot; yy++) { pset(b, x - 1, yy, '#f2c14e'); pset(b, x + w, yy, '#f2c14e'); }
      causalMark(b, mid, y - 6, t, false);
      break;
    }
    case 'diary': rect(b, x + 3, bot - 7, 6, 7, '#3a2618'); rect(b, x, bot - 10, 12, 3, '#6b4a3a'); rect(b, x + 1, bot - 11, 10, 1, '#efe4cc'); break;
    case 'altar':
      rect(b, x + 2, bot - 10, 11, 10, '#2a3a5a'); rect(b, x + 1, bot - 11, 13, 2, '#3a4a6a');
      if (!game.run.altarUsed) glyph(b, 'boon', mid, bot - 17 + Math.round(Math.sin(t * 3)), '#5aa9e6');
      break;
    case 'note': rect(b, x, bot - 8, 15, 8, '#3a2a1e'); rect(b, x, bot - 9, 15, 1, '#5a4030'); rect(b, x + 3, bot - 12, 7, 3, '#efe4cc'); pset(b, x + 4, bot - 11, '#5a4a3a'); pset(b, x + 6, bot - 11, '#5a4a3a'); break;
    case 'fountain': {
      const used = game.run.fountainUsed[it.id];
      rect(b, x, bot - 7, 15, 7, '#3a3a48'); rect(b, x + 1, bot - 8, 13, 1, '#5a5a6a');
      rect(b, x + 2, bot - 7, 11, 2, used ? '#20202a' : (Math.floor(t * 4) % 2 ? '#5fd18b' : '#3fa86b'));
      if (!used && Math.floor(t * 5) % 3 === 0) pset(b, mid, bot - 11, '#9ff0c0');
      break;
    }
    case 'brake': {
      const img = gearFrame(8, 10, '#8a7a5a', true, it.wedged ? 0 : Math.floor(t * 6) % 8);
      b.drawImage(img, mid - img.width / 2, y + 2);
      rect(b, mid - 4, y + 18, 8, h - 18, '#4a3f4c'); rect(b, mid - 4, y + 18, 8, 1, '#5c5068');
      causalMark(b, mid, y - 4, t, it.wedged);
      break;
    }
    case 'wreck': {
      rect(b, x + 2, bot - 5, w - 4, 5, '#2c2531'); rect(b, x + 4, bot - 8, 6, 3, '#4a3f4c'); rect(b, x + w - 8, bot - 7, 5, 2, '#8a4a2e');
      const img = gearFrame(4, 6, '#a08a60', false, it.wedged ? 0 : Math.floor(t * 8) % 8);
      b.drawImage(img, mid - img.width / 2, bot - 12);
      if (!it.permanent && !it.wedged) rect(b, x, y - 5, Math.round(w * clamp(it.life / 12, 0, 1)), 1, '#f2c14e');
      causalMark(b, mid, y - 12, t, it.wedged);
      break;
    }
    case 'lift': {
      const col = it.dead ? '#3a3242' : '#f2c14e';
      for (let yy = y; yy < bot; yy++) { pset(b, x, yy, col); pset(b, x + w - 1, yy, col); }
      rect(b, x, y, w, 1, col); rect(b, x + 1, bot - 2, w - 2, 2, it.dead ? '#2c2531' : '#8a6a34');
      if (!it.dead) { const yy = y + 4 + (Math.floor(t * 4) % 3); for (let i = 0; i < 3; i++) rect(b, mid - i, yy + i, i * 2 + 1, 1, '#f2c14e'); }
      break;
    }
  }
}

// ───────── 拡大後の画面に描く文字 ─────────
function label(ctx, str, x, y, color, size = 15) {
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = 'center';
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = '#0a0610';
  for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) ctx.fillText(str, x + dx, y + dy);
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}
function drawWorldLabels(ctx, game) {
  for (const it of game.room.items) {
    if (it.kind === 'door' && !it.reward && it.label) label(ctx, it.label, SX(it.x + it.w / 2), SY(it.y) - 40, it.golden ? '#ffd84a' : it.causal ? '#f2c14e' : it.boss ? '#ff8a6a' : '#efe6d2', 14);
  }
  if (game.room.quake && game.room.quake.tell) label(ctx, '床が震える――跳べ！', VIEW_W / 2, 200, '#ff6a6a', 22);
  for (const e of game.room.enemies) {
    if (e.guardT > 0 && e.alive) label(ctx, '構', SX(cx(e)), SY(e.y) - 24, '#7fc8ff', 15);
    if (e.state === 'stagger') label(ctx, '崩れ', SX(cx(e)), SY(e.y) - 22, '#f2c14e', 15);
    if (e.boss && e.state === 'parry') label(ctx, '受', SX(cx(e)), SY(e.y) - 34, '#5aa9e6', 18);
    if (e.kind === 'knight' && e.state === 'slamWind' && e.tell > 0.3) label(ctx, '！', SX(cx(e)), SY(e.y) - 44, '#ff4a2a', 20);
  }
}
function drawPrompt(ctx, game) {
  const p = game.player;
  if (game.modal || p.state !== 'normal') return;
  const it = game.nearestInteractable();
  if (!it) return;
  const text = game.interactPrompt(it);
  if (!text) return;
  ctx.font = `15px ${FONT}`; ctx.textAlign = 'center';
  const w = Math.ceil(ctx.measureText(text).width) + (game.touch ? 42 : 58);
  const x = Math.round(SX(it.x + it.w / 2)), y = Math.round(SY(it.y) - (it.kind === 'door' ? 54 : it.causal ? 46 : 18));
  ctx.fillStyle = '#0a0610'; ctx.fillRect(x - w / 2 - 3, y - 21, w + 6, 30);
  ctx.fillStyle = it.causal ? '#f2c14e' : '#6a5a7a'; ctx.fillRect(x - w / 2, y - 18, w, 24);
  ctx.fillStyle = '#140f1c'; ctx.fillRect(x - w / 2 + 3, y - 15, w - 6, 18);
  ctx.fillStyle = '#f2c14e'; ctx.fillText(game.touch ? '◆' : 'Z/↑', x - w / 2 + (game.touch ? 14 : 22), y);
  ctx.fillStyle = C.text; ctx.fillText(text, x + (game.touch ? 8 : 16), y);
}
