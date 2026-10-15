// 世界の描画（仮素材：図形とシルエット。輪郭・色・予備動作の読みやすさを優先）
import { TILE, VIEW_W, VIEW_H, ZOOM, COLORS as C, PLAYER as PC } from './config.js';
import { SOLID, ONEWAY } from './tilemap.js';
import { cx, cy, clamp } from './util.js';
import { drawHud, drawModal, drawTitle, drawRewind, drawEnding, FONT } from './ui.js';
import { drawPlayer, drawSoldier, drawBat, drawTurret, drawKnight, drawBoss, drawLira, drawGlen } from './characters.js';

const FLOOR_SKY = [
  ['#2a1b2e', '#140e19'],
  ['#162327', '#0b1214'],
  ['#141a33', '#07080f'],
];

export function render(ctx, game) {
  ctx.save();
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
  if (game.silhouette) {
    // 検証用：キャラクターを黒一色の影絵にして、輪郭だけで敵味方が分かるか確かめる
    ctx.fillStyle = '#e9e3d6'; ctx.fillRect(camX - 50, camY - 50, VIEW_W, VIEW_H);
    ctx.filter = 'brightness(0)';
    for (const it of game.room.items) if (it.kind === 'npc') drawItem(ctx, game, it);
    for (const e of game.room.enemies) drawEnemy(ctx, game, e);
    drawPlayer(ctx, game, game.player);
    ctx.filter = 'none';
    ctx.restore();
    return;
  }
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
      case 'knight': drawKnight(c, e, t, drawGear); break;
      case 'boss': drawBoss(c, game, e, t, FONT); break;
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
  if (it.who === 'lira') drawLira(ctx, x, by, t);
  else {
    drawGlen(ctx, x, by, t);
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
