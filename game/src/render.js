// 世界の描画（仮素材：図形とシルエット。輪郭・色・予備動作の読みやすさを優先）
import { TILE, VIEW_W, VIEW_H, ZOOM, COLORS as C, PLAYER as PC } from './config.js';
import { SOLID, ONEWAY } from './tilemap.js';
import { cx, cy, clamp } from './util.js';
import { drawHud, drawModal, drawTitle, drawRewind, drawEnding, FONT } from './ui.js';

const FLOOR_SKY = [
  ['#2a1b2e', '#140e19'],
  ['#162327', '#0b1214'],
  ['#141a33', '#07080f'],
];

export function render(ctx, game) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = C.bg0;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (game.scene === 'title') drawTitle(ctx, game);
  else if (game.scene === 'play') renderPlay(ctx, game);
  else if (game.scene === 'rewind') drawRewind(ctx, game);
  else if (game.scene === 'ending') drawEnding(ctx, game);
  ctx.restore();
}

function renderPlay(ctx, game) {
  const fx = game.fx;
  let sx = 0, sy = 0;
  if (fx.shakeT > 0) { sx = (Math.random() - 0.5) * fx.shakeMag * 2; sy = (Math.random() - 0.5) * fx.shakeMag * 2; }
  const camX = game.cam.x + sx / ZOOM, camY = game.cam.y + sy / ZOOM;
  drawBackground(ctx, game, camX);
  ctx.save();
  ctx.scale(ZOOM, ZOOM);
  ctx.translate(-Math.round(camX * ZOOM) / ZOOM, -Math.round(camY * ZOOM) / ZOOM);
  drawTiles(ctx, game.map, camX);
  for (const it of game.room.items) drawItem(ctx, game, it);
  for (const g of fx.ghosts) drawGhost(ctx, g);
  for (const e of game.room.enemies) drawEnemy(ctx, game, e);
  drawPlayer(ctx, game, game.player);
  for (const s of fx.slashes) drawSlash(ctx, s);
  for (const pr of game.room.projectiles) drawProjectile(ctx, pr);
  for (const r of fx.rings) {
    const k = r.t / r.life;
    ctx.strokeStyle = r.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 3 * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.3 + 0.7 * k), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const p of fx.parts) {
    ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  drawPrompt(ctx, game);
  for (const t of fx.texts) {
    ctx.globalAlpha = 1 - Math.max(0, t.t / t.life - 0.5) * 2;
    ctx.font = `bold ${t.size}px ${FONT}`; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(t.str, t.x, t.y);
    ctx.fillStyle = t.color; ctx.fillText(t.str, t.x, t.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // 時止め：彩度を落とす
  if (game.timeStopT > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = 'hsl(0,0%,50%)'; ctx.globalAlpha = Math.min(1, game.timeStopT * 4);
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
    ctx.fillStyle = 'rgba(180,200,255,0.08)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (game.slowT > 0 && game.slowScale < 0.5) { ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  if (fx.vignette > 0) {
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85);
    g.addColorStop(0, 'rgba(200,20,20,0)'); g.addColorStop(1, `rgba(200,20,20,${0.45 * fx.vignette})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  // 低HPの警告
  const p = game.player;
  if (p.hp > 0 && p.hp / p.maxHp < 0.3) {
    const a = 0.12 + Math.sin(game.time * 6) * 0.06;
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.9);
    g.addColorStop(0, 'rgba(150,0,0,0)'); g.addColorStop(1, `rgba(150,0,0,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (fx.flash > 0) { ctx.globalAlpha = fx.flash; ctx.fillStyle = fx.flashColor; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = 1; }
  drawHud(ctx, game);
  if (game.transition) {
    const t = game.transition.t;
    const a = t < 0.22 ? t / 0.22 : 1 - (t - 0.22) / 0.22;
    ctx.fillStyle = `rgba(5,4,8,${clamp(a, 0, 1)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (p.state === 'dead') {
    const a = clamp(game.run.deathT / 1.6, 0, 1);
    ctx.fillStyle = `rgba(10,5,15,${a * 0.85})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (game.modal) drawModal(ctx, game);
}

function drawBackground(ctx, game, camX) {
  const fi = game.run.fi;
  const [top, bot] = FLOOR_SKY[fi] || FLOOR_SKY[0];
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, top); g.addColorStop(1, bot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // 遠景の歯車（ゆっくり回る）
  const t = game.time;
  ctx.save();
  for (let i = 0; i < 6; i++) {
    const par = 0.2 + (i % 3) * 0.12;
    const x = ((i * 233 + 80) - camX * par) % (VIEW_W + 300);
    const y = 120 + (i * 97) % 300;
    const r = 40 + (i * 37) % 70;
    drawGear(ctx, x < -150 ? x + VIEW_W + 300 : x, y, r, (i % 2 ? 1 : -1) * t * 0.15 + i, `rgba(255,255,255,${0.025 + (i % 3) * 0.012})`);
  }
  // 窓の明かり／月
  if (fi === 2) {
    ctx.fillStyle = 'rgba(230,230,255,0.12)';
    ctx.beginPath(); ctx.arc(760 - camX * 0.05, 110, 46, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawGear(ctx, x, y, r, ang, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const teeth = Math.max(8, Math.round(r / 6));
  for (let i = 0; i < teeth * 2; i++) {
    const a = ang + (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r : r * 1.14;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.arc(x, y, r * 0.35, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
}

function drawTiles(ctx, map, camX) {
  const x0 = Math.max(0, Math.floor(camX / TILE) - 1), x1 = Math.min(map.w, Math.ceil((camX + VIEW_W / ZOOM) / TILE) + 1);
  for (let ty = 0; ty < map.h; ty++) for (let tx = x0; tx < x1; tx++) {
    const t = map.get(tx, ty);
    const x = tx * TILE, y = ty * TILE;
    if (t === SOLID) {
      ctx.fillStyle = C.stone; ctx.fillRect(x, y, TILE, TILE);
      // 石積みの目地
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x, y + TILE / 2, TILE, 1);
      ctx.fillRect(x + ((ty % 2) ? TILE / 2 : 0), y, 1, TILE / 2);
      ctx.fillRect(x + ((ty % 2) ? 0 : TILE / 2), y + TILE / 2, 1, TILE / 2);
      if (map.get(tx, ty - 1) !== SOLID && ty > 0) { ctx.fillStyle = C.stoneHi; ctx.fillRect(x, y, TILE, 3); }
      if (map.get(tx - 1, ty) !== SOLID && tx > 0) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x, y, 2, TILE); }
    } else if (t === ONEWAY) {
      ctx.fillStyle = C.platform; ctx.fillRect(x, y, TILE, 6);
      ctx.fillStyle = 'rgba(255,230,180,0.25)'; ctx.fillRect(x, y, TILE, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + TILE / 2 - 1, y + 6, 2, 8);
    }
  }
}

function drawPlayer(ctx, game, p) {
  const blink = p.state === 'hurt' || (p.iframeT > 0 && !p.dodging && p.state !== 'dead');
  if (blink && Math.floor(game.time * 20) % 2 === 0) return;
  const sq = p.squash;
  const w = p.w * (1 - sq * 0.5), h = p.h * (1 + sq);
  const x = cx(p), by = p.y + p.h;
  ctx.save();
  if (p.dodging) ctx.globalAlpha = 0.65;
  if (p.state === 'dead') ctx.globalAlpha = clamp(1 - game.run.deathT / 1.2, 0, 1);
  // 溜め
  if (p.state === 'charge') {
    const k = clamp(p.holdT / PC.heavyCharge, 0, 1);
    ctx.fillStyle = p.charged ? `rgba(242,193,78,${0.25 + Math.sin(game.time * 30) * 0.12})` : `rgba(242,193,78,${k * 0.2})`;
    ctx.beginPath(); ctx.arc(x, by - h / 2, 22 + k * 8, 0, Math.PI * 2); ctx.fill();
  }
  // マフラー（速度に応じてたなびく）
  const sway = Math.sin(game.time * 12) * 2;
  ctx.strokeStyle = C.scarf; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath();
  const nx = x - p.face * 2, ny = by - h + 9;
  ctx.moveTo(nx, ny);
  ctx.quadraticCurveTo(nx - p.face * 10 - p.vx * 0.02, ny + 2 + sway - p.vy * 0.01, nx - p.face * 18 - p.vx * 0.04, ny + 6 + sway - p.vy * 0.02);
  ctx.stroke();
  // 体（外套）
  ctx.fillStyle = p.state === 'dead' ? '#777' : C.player;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + 1, by - h + 10);
  ctx.lineTo(x + w / 2 - 1, by - h + 10);
  ctx.lineTo(x + w / 2 + 2, by);
  ctx.lineTo(x - w / 2 - 2, by);
  ctx.closePath(); ctx.fill();
  // 頭
  ctx.beginPath(); ctx.arc(x, by - h + 6, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1420'; ctx.fillRect(x + p.face * 3 - 1, by - h + 4, 2, 3);
  // 足（走り）
  if (p.onGround && Math.abs(p.vx) > 30) {
    const k = Math.sin(p.runAnim * 1.6) * 4;
    ctx.fillStyle = '#3a3040';
    ctx.fillRect(x - 4 + k, by - 3, 4, 3); ctx.fillRect(x + 1 - k, by - 3, 4, 3);
  }
  // 剣（構え）
  if (p.state !== 'attack') {
    ctx.strokeStyle = '#cfd6e0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - p.face * 4, by - h / 2 + 2); ctx.lineTo(x - p.face * 14, by - h / 2 + 14); ctx.stroke();
  }
  // 楔を打つ動作
  if (p.state === 'channel') {
    const k = clamp(p.stateT / p.channel.duration, 0, 1);
    ctx.strokeStyle = C.gold; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, by - h / 2, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
  }
  ctx.restore();
}

function drawGhost(ctx, g) {
  ctx.globalAlpha = 0.35 * (1 - g.t / g.life);
  ctx.fillStyle = '#9fe3ff';
  ctx.fillRect(g.x, g.y + 8, g.w, g.h - 8);
  ctx.beginPath(); ctx.arc(g.x + g.w / 2, g.y + 6, 6, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawSlash(ctx, s) {
  const p = s.owner;
  const k = s.t / s.life;
  const heavy = s.name === 'heavy';
  const spin = s.name === 'combo4';
  const r = heavy ? 48 : s.name === 'combo3' ? 42 : 34;
  const x = cx(p) + (spin ? 0 : s.face * 10), y = cy(p) - 2;
  ctx.save();
  ctx.globalAlpha = 1 - k;
  ctx.strokeStyle = heavy ? C.gold : '#fff8e6';
  ctx.lineWidth = heavy ? 9 : 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (spin) ctx.arc(x, y, r, 0, Math.PI * 2 * (0.4 + k * 0.6));
  else if (s.name === 'combo2') ctx.arc(x, y, r, s.face > 0 ? Math.PI * 0.35 : Math.PI * 0.65, s.face > 0 ? -Math.PI * 0.45 : Math.PI * 1.45, s.face > 0);
  else if (s.name === 'air') ctx.arc(x, y, r, s.face > 0 ? -Math.PI * 0.6 : Math.PI * 1.6, s.face > 0 ? Math.PI * 0.6 : Math.PI * 0.4, s.face < 0);
  else ctx.arc(x, y, r, s.face > 0 ? -Math.PI * 0.45 : Math.PI * 1.45, s.face > 0 ? Math.PI * 0.35 : Math.PI * 0.65, s.face < 0);
  ctx.stroke();
  ctx.restore();
}

function hpBar(ctx, e, w = 30) {
  if (e.hp >= e.maxHp || e.boss) return;
  const x = cx(e) - w / 2, y = e.y - 9;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
  ctx.fillStyle = e.elite ? C.gold : '#e35d5d'; ctx.fillRect(x, y, w * clamp(e.hp / e.maxHp, 0, 1), 3);
}

let flashCanvas = null;
function drawEnemy(ctx, game, e) {
  const t = game.time;
  const drawBody = (c) => {
    // 遅延・時歪の表示
    if (e.slowed) {
      c.strokeStyle = e.warp > 0 ? 'rgba(90,169,230,0.9)' : 'rgba(90,169,230,0.5)';
      c.lineWidth = 2; c.setLineDash([4, 4]);
      c.strokeRect(e.x - 4, e.y - 4, e.w + 8, e.h + 8);
      c.setLineDash([]);
    }
    switch (e.kind) {
      case 'soldier': drawSoldier(c, e, t); break;
      case 'bat': drawBat(c, e, t); break;
      case 'turret': drawTurret(c, e, t); break;
      case 'knight': drawKnight(c, e, t); break;
      case 'boss': drawBoss(c, game, e, t); break;
    }
  };
  ctx.save();
  if (e.hitFlash > 0 && typeof document !== 'undefined') {
    // 被弾の白フラッシュ：別キャンバスに描いて輪郭だけ白く塗る
    const W = 480, H = 360;
    if (!flashCanvas) { flashCanvas = document.createElement('canvas'); flashCanvas.width = W; flashCanvas.height = H; }
    const fc = flashCanvas.getContext('2d');
    fc.setTransform(1, 0, 0, 1, 0, 0); fc.clearRect(0, 0, W, H);
    const ox = W / 2 - cx(e), oy = H / 2 - cy(e);
    fc.translate(ox, oy);
    drawBody(fc);
    fc.setTransform(1, 0, 0, 1, 0, 0);
    fc.globalCompositeOperation = 'source-atop';
    fc.fillStyle = 'rgba(255,255,255,0.85)'; fc.fillRect(0, 0, W, H);
    fc.globalCompositeOperation = 'source-over';
    ctx.drawImage(flashCanvas, -ox, -oy);
  } else drawBody(ctx);
  ctx.restore();
  hpBar(ctx, e, e.elite ? 50 : 30);
}

function tellOutline(ctx, e, color) {
  if (e.tell <= 0) return;
  ctx.strokeStyle = color; ctx.globalAlpha = 0.4 + e.tell * 0.6; ctx.lineWidth = 2 + e.tell * 2;
  ctx.strokeRect(e.x - 2, e.y - 2, e.w + 4, e.h + 4);
  ctx.globalAlpha = 1;
}

function drawSoldier(ctx, e, t) {
  const x = e.x, y = e.y, f = e.face;
  ctx.fillStyle = '#7a4a32'; ctx.fillRect(x + 2, y + 10, e.w - 4, e.h - 10);
  ctx.fillStyle = '#9a6a48'; ctx.fillRect(x + 1, y, e.w - 2, 12);
  ctx.fillStyle = '#ffcf6b'; ctx.fillRect(x + (f > 0 ? e.w - 7 : 3), y + 5, 4, 2);
  // 剣：予備動作で振り上げる
  const sx = cx(e) + f * 6, sy = y + 16;
  let ang = f > 0 ? 0.3 : Math.PI - 0.3;
  if (e.state === 'windup') ang = f > 0 ? -Math.PI * 0.5 - e.tell * 0.5 : -Math.PI * 0.5 + e.tell * 0.5;
  if (e.state === 'slash') ang = f > 0 ? 0.1 : Math.PI - 0.1;
  ctx.strokeStyle = '#c8b9a0'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(ang) * 26, sy + Math.sin(ang) * 26); ctx.stroke();
  if (e.state === 'windup' && e.tell < 0.35) {
    // 振り上げ直後のきらめき
    const gx = sx + Math.cos(ang) * 26, gy = sy + Math.sin(ang) * 26, s = 10 * (1 - e.tell / 0.35);
    ctx.fillStyle = '#fff'; ctx.beginPath();
    ctx.moveTo(gx, gy - s); ctx.lineTo(gx + 2, gy); ctx.lineTo(gx, gy + s); ctx.lineTo(gx - 2, gy); ctx.closePath(); ctx.fill();
    ctx.fillRect(gx - s, gy - 1, s * 2, 2);
  }
  if (e.state === 'slash') {
    ctx.strokeStyle = 'rgba(255,120,80,0.8)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(cx(e) + f * 8, cy(e), 30, f > 0 ? -1 : Math.PI - 0.6, f > 0 ? 0.6 : Math.PI + 1); ctx.stroke();
  }
  tellOutline(ctx, e, '#ff7a4a');
  if (e.state === 'recover') { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('…', cx(e), y - 4); }
}

function drawBat(ctx, e, t) {
  const x = cx(e), y = cy(e);
  if (e.state === 'tell' && e.target) {
    ctx.strokeStyle = `rgba(255,70,50,${0.25 + e.tell * 0.6})`; ctx.lineWidth = 1 + e.tell * 3;
    ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(e.target.x, e.target.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(e.target.x, e.target.y, 10 - e.tell * 4, 0, Math.PI * 2); ctx.stroke();
  }
  const flap = e.state === 'dive' ? -0.2 : Math.sin(t * 18) * 0.6;
  ctx.fillStyle = '#3d2f4f';
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + s * 16, y - 8 + flap * 10 * s * s); ctx.lineTo(x + s * 13, y + 4); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = e.state === 'stunned' ? '#888' : '#c9a24a';
  ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff5a3c'; ctx.fillRect(x - 3, y - 2, 2, 2); ctx.fillRect(x + 1, y - 2, 2, 2);
  if (e.state === 'stunned') { ctx.fillStyle = '#fff'; ctx.font = `10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('@', x, e.y - 4); }
}

function drawTurret(ctx, e, t) {
  const x = cx(e), y = cy(e), r = 13;
  ctx.fillStyle = '#4a3b2a'; ctx.fillRect(e.x, e.y + e.h - 6, e.w, 6);
  ctx.fillStyle = e.tell > 0 ? `rgb(${200 + e.tell * 55},${200 - e.tell * 120},${170 - e.tell * 120})` : '#d9ceb2';
  ctx.beginPath(); ctx.arc(x, y - 2, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3a2c1c'; ctx.lineWidth = 2; ctx.stroke();
  // 12時の目盛り
  ctx.fillStyle = '#e35d5d'; ctx.fillRect(x - 1, y - 2 - r + 1, 2, 4);
  const a = e.hand * Math.PI * 2 - Math.PI / 2;
  ctx.strokeStyle = '#1a1420'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x + Math.cos(a) * (r - 3), y - 2 + Math.sin(a) * (r - 3)); ctx.stroke();
}

function drawKnight(ctx, e, t) {
  const x = e.x, y = e.y, f = e.face;
  drawGear(ctx, cx(e), y + 24, 15, t * (e.state === 'stagger' ? 0.5 : 2), '#8a7a5a');
  ctx.fillStyle = '#5b5060'; ctx.fillRect(x + 4, y + 8, e.w - 8, e.h - 8);
  ctx.fillStyle = '#6e6475'; ctx.fillRect(x + 6, y, e.w - 12, 12);
  ctx.fillStyle = '#ffcf6b'; ctx.fillRect(x + (f > 0 ? e.w - 12 : 8), y + 4, 4, 2);
  // 盾
  const guarding = e.guarding;
  const shx = f > 0 ? x + e.w - 2 : x - 8;
  if (e.state !== 'stagger') {
    ctx.fillStyle = guarding ? '#b8a68a' : '#7a6e5c';
    if (e.tellKind === 'shield' && e.tell > 0) ctx.fillStyle = `rgb(255,${180 - e.tell * 100},${80 - e.tell * 60})`;
    ctx.fillRect(shx, y + 8, 10, e.h - 14);
    if (guarding) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(shx + (f > 0 ? 7 : 1), y + 10, 2, e.h - 18); }
  }
  // ハンマー
  if (e.state === 'slamWind' || e.state === 'slam') {
    const up = e.state === 'slamWind';
    const hx = cx(e) + f * (up ? -4 : 30), hy = up ? y - 18 - e.tell * 8 : y + e.h - 14;
    ctx.fillStyle = '#9c8a70'; ctx.fillRect(hx - 9, hy - 7, 18, 14);
    ctx.strokeStyle = '#6a5a44'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx(e), y + 14); ctx.lineTo(hx, hy); ctx.stroke();
    if (up) { ctx.fillStyle = `rgba(255,90,60,${e.tell})`; ctx.font = `bold 16px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('！', cx(e), y - 34); }
  }
  if (e.state === 'stagger') { ctx.fillStyle = '#f2c14e'; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('崩れ', cx(e), y - 12); }
  tellOutline(ctx, e, '#ff7a4a');
}

function drawBoss(ctx, game, e, t) {
  const x = e.x, y = e.y, f = e.face;
  // 背後の時計の光輪
  ctx.strokeStyle = e.trueDuel ? 'rgba(255,211,138,0.6)' : 'rgba(242,193,78,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx(e), y + 8, 26, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + (e.phase === 3 ? -t : 0) * 0.5;
    ctx.fillRect(cx(e) + Math.cos(a) * 26 - 1, y + 8 + Math.sin(a) * 26 - 1, 2, 2);
  }
  // 残響喰いの輪
  if (e.ringT > 0) { ctx.strokeStyle = 'rgba(182,124,240,0.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx(e), cy(e), 44 + Math.sin(t * 8) * 3, 0, Math.PI * 2); ctx.stroke(); }
  // 跳躍の着地点
  if (e.state === 'leap') {
    ctx.fillStyle = 'rgba(255,60,40,0.35)';
    const gy = game.map.groundBelow(e.leapX, e.y + e.h);
    ctx.beginPath(); ctx.ellipse(e.leapX, gy, 46, 7, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 振り子斬りの予告弧
  if (e.state === 'swingWind') {
    ctx.fillStyle = `rgba(255,90,60,${0.12 + e.tell * 0.25})`;
    ctx.beginPath(); ctx.moveTo(cx(e), cy(e));
    ctx.arc(cx(e), cy(e) - 4, 118, f > 0 ? -0.9 : Math.PI - 0.6, f > 0 ? 0.6 : Math.PI + 0.9); ctx.closePath(); ctx.fill();
  }
  if (e.state === 'handsWind' && e.targets) {
    ctx.strokeStyle = `rgba(255,90,60,${0.3 + e.tell * 0.6})`; ctx.lineWidth = 1 + e.tell * 2; ctx.setLineDash([6, 6]);
    for (const tg of e.targets) { ctx.beginPath(); ctx.moveTo(cx(e), y + 16); ctx.lineTo(tg.x, tg.y); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  // 体（長衣）
  ctx.fillStyle = e.trueDuel ? '#3c3448' : '#2e2638';
  ctx.beginPath();
  ctx.moveTo(cx(e) - 10, y + 12); ctx.lineTo(cx(e) + 10, y + 12);
  ctx.lineTo(x + e.w + 6, y + e.h); ctx.lineTo(x - 6, y + e.h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d8ccb4'; ctx.beginPath(); ctx.arc(cx(e), y + 8, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2c14e'; ctx.fillRect(cx(e) + f * 4 - 1, y + 6, 2, 2);
  // 振り子の剣
  let ang = f > 0 ? 0.6 : Math.PI - 0.6;
  if (e.state === 'swingWind') ang = f > 0 ? Math.PI + 0.6 + e.tell * 0.5 : -0.6 - e.tell * 0.5;
  if (e.state === 'swing' || e.state === 'riposte' || e.state === 'step') ang = f > 0 ? 0.1 : Math.PI - 0.1;
  ctx.strokeStyle = '#e2d6b8'; ctx.lineWidth = 4;
  const hx = cx(e), hy = y + 22;
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(ang) * 60, hy + Math.sin(ang) * 60); ctx.stroke();
  ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(hx + Math.cos(ang) * 60, hy + Math.sin(ang) * 60, 7, 0, Math.PI * 2); ctx.fill();
  if (e.state === 'swing') { ctx.strokeStyle = 'rgba(255,200,120,0.85)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx(e), cy(e) - 4, 100, f > 0 ? -0.9 : Math.PI - 0.6, f > 0 ? 0.6 : Math.PI + 0.9); ctx.stroke(); }
  // 懐中時計（時止めの予兆）
  if (e.state === 'stopWind') {
    const k = e.tell;
    ctx.fillStyle = `rgba(255,255,255,${0.5 + k * 0.5})`;
    ctx.beginPath(); ctx.arc(cx(e) - f * 6, y - 14 - k * 10, 8 + k * 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1a1420'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(cx(e) - f * 6, y - 14 - k * 10); ctx.lineTo(cx(e) - f * 6 + Math.cos(t * 12) * 6, y - 14 - k * 10 + Math.sin(t * 12) * 6); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${k * 0.5})`; ctx.beginPath(); ctx.arc(cx(e), cy(e), 40 + k * 80, 0, Math.PI * 2); ctx.stroke();
  }
  if (e.tellKind === 'parry' && e.state === 'parry') { ctx.strokeStyle = 'rgba(90,169,230,0.95)'; ctx.lineWidth = 4; ctx.strokeRect(x - 6, y - 6, e.w + 12, e.h + 12); ctx.fillStyle = '#5aa9e6'; ctx.font = `bold 13px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('受', cx(e), y - 26); }
  if (e.state === 'stepWind') { ctx.strokeStyle = `rgba(255,60,40,${e.tell})`; ctx.lineWidth = 4; ctx.strokeRect(x - 6, y - 6, e.w + 12, e.h + 12); }
  if (e.state === 'antiAirWind') { ctx.fillStyle = `rgba(255,90,60,${e.tell})`; ctx.beginPath(); ctx.moveTo(cx(e), y - 40); ctx.lineTo(cx(e) - 9, y - 24); ctx.lineTo(cx(e) + 9, y - 24); ctx.closePath(); ctx.fill(); }
  if (e.state === 'crouch' || e.tellKind === 'crouch' && e.state === 'leapWind') { ctx.fillStyle = 'rgba(255,90,60,0.6)'; ctx.fillRect(x - 4, y + e.h - 3, e.w + 8, 3); }
  if (e.state === 'stagger') { ctx.fillStyle = '#f2c14e'; ctx.font = `bold 13px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('崩れ', cx(e), y - 24); }
}

function drawProjectile(ctx, pr) {
  ctx.save();
  if (pr.delay > 0) ctx.globalAlpha = 0.55 + Math.sin(pr.t * 30) * 0.2;
  if (pr.kind === 'bolt') {
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(pr.x + 5, pr.y + 5, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,180,70,0.3)'; ctx.beginPath(); ctx.arc(pr.x + 5 - pr.vx * 0.03, pr.y + 5 - pr.vy * 0.03, 4, 0, Math.PI * 2); ctx.fill();
  } else if (pr.kind === 'hand') {
    const vx = pr.vx || (pr.homing ? 0 : 1), vy = pr.vy || (pr.homing ? 1 : 0);
    const a = Math.atan2(vy, vx);
    ctx.translate(pr.x + 6, pr.y + 6); ctx.rotate(a);
    ctx.fillStyle = pr.delay > 0 ? '#e8e8ff' : '#f2c14e';
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -3); ctx.lineTo(-8, 3); ctx.closePath(); ctx.fill();
    ctx.fillRect(-12, -1, 6, 2);
  } else if (pr.kind === 'wave') {
    ctx.fillStyle = 'rgba(255,170,90,0.85)';
    ctx.beginPath(); ctx.moveTo(pr.x, pr.y + pr.h); ctx.quadraticCurveTo(pr.x + pr.w / 2, pr.y - 6, pr.x + pr.w, pr.y + pr.h); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function causalMark(ctx, x, y, t, wedged) {
  // 時計の針の金の印（因果点）
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = C.gold; ctx.fillStyle = C.gold;
  ctx.globalAlpha = wedged ? 0.75 + Math.sin(t * 3) * 0.25 : 0.8;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -5); ctx.moveTo(0, 0); ctx.lineTo(4, 2); ctx.stroke();
  if (wedged) { ctx.beginPath(); ctx.moveTo(-3, 10); ctx.lineTo(3, 10); ctx.lineTo(0, 20); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}

const REWARD_ICON = { boon: '◆', boon2: '◆◆', heal: '✚', hourglass: '⧗' };
const REWARD_COLOR = { boon: '#f2c14e', boon2: '#f2c14e', heal: '#5fd18b', hourglass: '#e8dcc4' };

function drawItem(ctx, game, it) {
  const t = game.time;
  if (it.vault && !game.run.vaultOpen) {
    // 封印中は輪郭だけ
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.strokeRect(it.x, it.y, it.w, it.h);
    return;
  }
  ctx.font = `12px ${FONT}`; ctx.textAlign = 'center';
  switch (it.kind) {
    case 'door': {
      ctx.fillStyle = '#120d18'; ctx.fillRect(it.x, it.y, it.w, it.h);
      ctx.strokeStyle = it.causal ? C.gold : it.boss ? '#e35d5d' : '#8c7a5a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(it.x, it.y + it.h); ctx.lineTo(it.x, it.y + 12); ctx.arc(cx(it), it.y + 12, it.w / 2, Math.PI, 0); ctx.lineTo(it.x + it.w, it.y + it.h); ctx.stroke();
      ctx.fillStyle = `rgba(255,220,150,${0.15 + Math.sin(t * 3) * 0.05})`; ctx.fillRect(it.x + 4, it.y + 14, it.w - 8, it.h - 14);
      if (it.reward) {
        ctx.font = `bold 18px ${FONT}`; ctx.fillStyle = REWARD_COLOR[it.reward];
        ctx.fillText(REWARD_ICON[it.reward], cx(it), it.y - 8 + Math.sin(t * 3) * 2);
      } else if (it.label) {
        ctx.font = `bold 12px ${FONT}`; ctx.fillStyle = it.causal ? C.gold : it.boss ? '#ff8a6a' : '#efe6d2';
        ctx.fillText(it.label, cx(it), it.y - 8);
        if (it.causal) causalMark(ctx, cx(it), it.y - 30, t, false);
      }
      break;
    }
    case 'reward': {
      const y = it.y + Math.sin(it.bob * 4) * 4;
      ctx.fillStyle = 'rgba(242,193,78,0.25)'; ctx.beginPath(); ctx.arc(it.x + 12, y + 12, 18 + Math.sin(t * 6) * 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = REWARD_COLOR[it.reward]; ctx.font = `bold 22px ${FONT}`; ctx.fillText(REWARD_ICON[it.reward], it.x + 12, y + 20);
      break;
    }
    case 'sign':
      ctx.fillStyle = '#5a4a36'; ctx.fillRect(it.x + 10, it.y + 16, 4, 24);
      ctx.fillStyle = '#8c7556'; ctx.fillRect(it.x, it.y + 4, 24, 14);
      break;
    case 'npc': drawNpc(ctx, game, it, t); break;
    case 'corpse':
      ctx.fillStyle = '#5a4436'; ctx.fillRect(it.x, it.y + 4, it.w, 10);
      ctx.fillStyle = '#7a2a22'; ctx.fillRect(it.x - 8, it.y + 11, it.w + 16, 3);
      break;
    case 'codedoor': {
      const open = game.run.vaultOpen;
      ctx.fillStyle = open ? '#120d18' : '#3a3242'; ctx.fillRect(it.x, it.y, it.w, it.h);
      ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.strokeRect(it.x, it.y, it.w, it.h);
      if (!open) for (let i = 0; i < 3; i++) { ctx.fillStyle = '#1a1420'; ctx.fillRect(it.x + 8 + i * 12, it.y + 22, 10, 14); }
      causalMark(ctx, cx(it), it.y - 12, t, false);
      break;
    }
    case 'diary': ctx.fillStyle = '#6b4a3a'; ctx.fillRect(it.x, it.y + 12, it.w, it.h - 12); ctx.fillStyle = '#efe6d2'; ctx.fillRect(it.x + 4, it.y + 8, it.w - 8, 6); break;
    case 'altar': {
      ctx.fillStyle = '#3a4a6a'; ctx.fillRect(it.x, it.y + 10, it.w, it.h - 10);
      if (!game.run.altarUsed) { ctx.fillStyle = '#5aa9e6'; ctx.font = `bold 18px ${FONT}`; ctx.fillText('◆', cx(it), it.y + 4 + Math.sin(t * 3) * 3); }
      break;
    }
    case 'note': ctx.fillStyle = '#4a3a2a'; ctx.fillRect(it.x, it.y + 14, it.w, it.h - 14); ctx.fillStyle = '#efe6d2'; ctx.fillRect(it.x + 6, it.y + 8, 16, 8); break;
    case 'fountain': {
      const used = game.run.fountainUsed[it.id];
      ctx.fillStyle = '#4a4a58'; ctx.fillRect(it.x, it.y + 14, it.w, it.h - 14);
      ctx.fillStyle = used ? '#2a2a33' : `rgba(95,209,139,${0.6 + Math.sin(t * 4) * 0.2})`; ctx.fillRect(it.x + 4, it.y + 12, it.w - 8, 5);
      break;
    }
    case 'brake': {
      drawGear(ctx, cx(it), it.y + 22, 16, it.wedged ? 0 : t * 1.5, '#8a7a5a');
      ctx.fillStyle = '#5b5060'; ctx.fillRect(it.x + 12, it.y + 36, 16, 24);
      causalMark(ctx, cx(it), it.y - 6, t, it.wedged);
      break;
    }
    case 'wreck': {
      ctx.fillStyle = '#4a4050'; ctx.fillRect(it.x, it.y + 8, it.w, it.h - 8);
      drawGear(ctx, cx(it), it.y + 10, 10, it.wedged ? 0 : t, '#6a5a44');
      if (!it.permanent && !it.wedged) { ctx.fillStyle = C.gold; ctx.fillRect(it.x, it.y - 8, it.w * clamp(it.life / 12, 0, 1), 3); }
      causalMark(ctx, cx(it), it.y - 20, t, it.wedged);
      break;
    }
    case 'lift': {
      ctx.strokeStyle = it.dead ? '#3a3242' : C.gold; ctx.lineWidth = 2; ctx.strokeRect(it.x, it.y, it.w, it.h);
      ctx.fillStyle = it.dead ? '#1a1420' : `rgba(242,193,78,${0.12 + Math.sin(t * 3) * 0.06})`; ctx.fillRect(it.x + 2, it.y + 2, it.w - 4, it.h - 4);
      ctx.fillStyle = it.dead ? '#555' : C.gold; ctx.font = `bold 12px ${FONT}`; ctx.fillText('▲', cx(it), it.y - 6);
      break;
    }
  }
}

function drawNpc(ctx, game, it, t) {
  const x = cx(it), by = it.y + it.h;
  if (it.who === 'lira') {
    ctx.fillStyle = '#c9b8d8';
    ctx.beginPath(); ctx.moveTo(x - 6, by - 22); ctx.lineTo(x + 6, by - 22); ctx.lineTo(x + 9, by); ctx.lineTo(x - 9, by); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8dcc4'; ctx.beginPath(); ctx.arc(x, by - 27, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d24d3a'; ctx.fillRect(x - 7, by - 33, 5, 3);
  } else {
    ctx.fillStyle = '#6a5040'; ctx.fillRect(x - 11, by - 30, 22, 30);
    ctx.fillStyle = '#9a8060'; ctx.fillRect(x - 9, by - 22, 18, 18);
    ctx.fillStyle = '#d8b898'; ctx.beginPath(); ctx.arc(x, by - 34, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a3a2a'; ctx.fillRect(x - 7, by - 30, 14, 4);
    if (it.inDanger && game.run.glen === 'attacked') {
      const k = clamp(game.room.glenHp / 60, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 22, it.y - 16, 44, 6);
      ctx.fillStyle = k < 0.35 ? '#ff5a3c' : '#5fd18b'; ctx.fillRect(x - 21, it.y - 15, 42 * k, 4);
    }
  }
  if (it.causal) causalMark(ctx, x, it.y - (it.inDanger ? 30 : 14), t, it.wedged || (it.who === 'lira' && hasLiraWedge(game)) );
}
const hasLiraWedge = (game) => game.meta.wedges.some((w) => w.target === 'lira');

function drawPrompt(ctx, game) {
  const p = game.player;
  if (game.modal || p.state !== 'normal') return;
  const it = game.nearestInteractable();
  if (!it) return;
  const label = game.interactPrompt(it);
  if (!label) return;
  ctx.font = `bold 13px ${FONT}`; ctx.textAlign = 'center';
  const w = ctx.measureText(label).width + 40;
  const x = cx(it), y = it.y - (it.kind === 'door' ? 34 : it.causal ? 40 : 18);
  ctx.fillStyle = 'rgba(10,8,14,0.85)'; ctx.fillRect(x - w / 2, y - 16, w, 22);
  ctx.strokeStyle = it.causal ? C.gold : 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(x - w / 2 + 0.5, y - 15.5, w - 1, 21);
  ctx.fillStyle = C.gold; ctx.fillText('↑', x - w / 2 + 12, y);
  ctx.fillStyle = C.text; ctx.fillText(label, x + 8, y);
}
