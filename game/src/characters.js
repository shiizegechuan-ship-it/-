// キャラクターの描画（仮素材）。
// 形の約束：味方は曲線だけ（丸い頭・鐘の形の外套・たなびく布）、敵は直線とトゲ（前かがみ・角ばった兜・赤い目）。
// 影絵にしても、輪郭だけで敵味方が分かることを優先する。
import { PLAYER as PC, COLORS as C } from './config.js';
import { cx, cy, clamp } from './util.js';

export const ALLY = { cloak: '#efe4cc', shade: '#c9b994', scarf: '#d24d3a', face: '#2a2230', eye: '#fff3d6', skin: '#f3dcc0' };
export const FOE = { body: '#2c2531', plate: '#4a3f4c', rust: '#8a4a2e', rim: '#c8643a', eye: '#ff4a3a', blade: '#b9a58a' };

// 向き f の座標系で多角形を作る（原点＝足元の中心）
function poly(ctx, ox, oy, f, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(ox + f * x, oy + y) : ctx.moveTo(ox + f * x, oy + y)));
  ctx.closePath();
}
function foeFill(ctx, color, glow) {
  ctx.fillStyle = color; ctx.fill();
  ctx.lineJoin = 'miter';
  ctx.strokeStyle = glow > 0 ? `rgba(255,${150 - glow * 90},${80 - glow * 60},${0.6 + glow * 0.4})` : FOE.rim;
  ctx.lineWidth = glow > 0 ? 1.5 + glow * 2 : 1.2;
  ctx.stroke();
}
function slit(ctx, ox, oy, f, x0, x1, y, h = 2) {
  poly(ctx, ox, oy, f, [[x0, y], [x1, y - 0.6], [x1, y + h - 0.6], [x0, y + h]]);
  ctx.fillStyle = FOE.eye; ctx.fill();
}

// ───────── 味方 ─────────
export function drawPlayer(ctx, game, p) {
  const blink = p.state === 'hurt' || (p.iframeT > 0 && !p.dodging && p.state !== 'dead');
  if (blink && Math.floor(game.time * 20) % 2 === 0) return;
  const f = p.face, t = game.time;
  const x0 = cx(p), by = p.y + p.h;
  ctx.save();
  if (p.dodging) ctx.globalAlpha = 0.7;
  if (p.state === 'dead') ctx.globalAlpha = clamp(1 - game.run.deathT / 1.2, 0, 1);
  // 溜め
  if (p.state === 'charge') {
    const k = clamp(p.holdT / PC.heavyCharge, 0, 1);
    ctx.fillStyle = p.charged ? `rgba(242,193,78,${0.25 + Math.sin(t * 30) * 0.12})` : `rgba(242,193,78,${k * 0.2})`;
    ctx.beginPath(); ctx.arc(x0, by - 15, 22 + k * 8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.translate(x0, by);
  const sq = p.squash;
  ctx.scale(1 - sq * 0.4, 1 + sq);
  const X = (x) => f * x;
  const run = p.onGround && Math.abs(p.vx) > 30;
  const bob = run ? Math.abs(Math.sin(p.runAnim * 1.6)) * 1.5 : 0;
  const sway = Math.sin(t * 9) * 1.5;
  const back = clamp(Math.abs(p.vx) * 0.012, 0, 4) + (p.dodging ? 4 : 0);
  const lift = clamp(-p.vy * 0.006, -3, 3);
  // マフラー（体の後ろ。丸い先端）
  ctx.strokeStyle = ALLY.scarf; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(X(-1), -19 - bob);
  ctx.quadraticCurveTo(X(-10 - back * 2), -20 + sway - p.vy * 0.01 - bob, X(-17 - back * 3), -15 + sway * 1.5 - p.vy * 0.02);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(X(-17 - back * 3), -15 + sway * 1.5 - p.vy * 0.02, 2.6, 0, Math.PI * 2); ctx.fillStyle = ALLY.scarf; ctx.fill();
  // 鐘の形の外套
  ctx.fillStyle = p.state === 'dead' ? '#888' : ALLY.cloak;
  ctx.beginPath();
  ctx.moveTo(X(4), -19 - bob);
  ctx.quadraticCurveTo(X(9), -9, X(10), lift);
  ctx.quadraticCurveTo(X(-1), 3, X(-11 - back), lift - back * 0.4);
  ctx.quadraticCurveTo(X(-9), -9 - bob, X(-4), -19 - bob);
  ctx.closePath(); ctx.fill();
  // 外套のひだ
  ctx.strokeStyle = ALLY.shade; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(X(-1), -14 - bob); ctx.quadraticCurveTo(X(-3), -6, X(-4 - back * 0.5), 0); ctx.stroke();
  // 足
  if (run) {
    const k = Math.sin(p.runAnim * 1.6) * 4;
    ctx.fillStyle = '#3a3040';
    ctx.beginPath(); ctx.ellipse(X(-2 + k), 0.5, 3, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(X(3 - k), 0.5, 3, 1.8, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 頭巾：丸い頭と、後ろへ垂れる丸い先
  ctx.fillStyle = p.state === 'dead' ? '#888' : ALLY.cloak;
  ctx.beginPath();
  ctx.moveTo(X(-2), -30 - bob);
  ctx.quadraticCurveTo(X(-12 - back), -29 - bob + sway * 0.5, X(-9 - back), -20 - bob);
  ctx.quadraticCurveTo(X(-5), -22 - bob, X(-2), -24 - bob);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(X(0.5), -24.5 - bob, 7.5, 0, Math.PI * 2); ctx.fill();
  // 顔の陰と目
  ctx.fillStyle = ALLY.face;
  ctx.beginPath(); ctx.ellipse(X(3.2), -24 - bob, 3.8, 4.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ALLY.eye;
  ctx.beginPath(); ctx.arc(X(4.4), -24.6 - bob, 1.3, 0, Math.PI * 2); ctx.fill();
  // 背中の剣（構え中）
  if (p.state !== 'attack') {
    ctx.strokeStyle = '#cfd6e0'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(X(-3), -14 - bob); ctx.lineTo(X(-13), -3); ctx.stroke();
  }
  ctx.restore();
  // 楔を打つ動作
  if (p.state === 'channel') {
    const k = clamp(p.stateT / p.channel.duration, 0, 1);
    ctx.strokeStyle = C.gold; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x0, by - 15, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
  }
}

export function drawLira(ctx, x, by, t) {
  const sway = Math.sin(t * 2) * 1;
  ctx.fillStyle = '#c9b8d8';
  ctx.beginPath();
  ctx.moveTo(-4 + x, by - 20);
  ctx.quadraticCurveTo(x - 8, by - 10, x - 9 + sway, by);
  ctx.quadraticCurveTo(x, by + 2.5, x + 9 + sway, by);
  ctx.quadraticCurveTo(x + 8, by - 10, x + 4, by - 20);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5a4060';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * 6.5, by - 30, 3.4, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = ALLY.skin; ctx.beginPath(); ctx.arc(x, by - 26, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5a4060'; ctx.beginPath(); ctx.arc(x, by - 28, 6, Math.PI, 0); ctx.fill();
  ctx.fillStyle = ALLY.scarf; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * 8.5, by - 32, 1.8, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = ALLY.face; ctx.beginPath(); ctx.arc(x - 2, by - 25, 0.9, 0, Math.PI * 2); ctx.arc(x + 2, by - 25, 0.9, 0, Math.PI * 2); ctx.fill();
}

export function drawGlen(ctx, x, by, t) {
  ctx.fillStyle = '#7a5a44';
  ctx.beginPath(); ctx.ellipse(x, by - 14, 12, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b39a74';
  ctx.beginPath(); ctx.ellipse(x, by - 10, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ALLY.skin; ctx.beginPath(); ctx.arc(x, by - 31, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d9d2c4'; ctx.beginPath(); ctx.arc(x, by - 28, 6.5, 0, Math.PI); ctx.fill();
  ctx.fillStyle = '#5a3a2a'; ctx.beginPath(); ctx.arc(x, by - 33, 7.5, Math.PI, 0); ctx.fill();
  ctx.fillStyle = ALLY.face; ctx.beginPath(); ctx.arc(x - 2.5, by - 31.5, 0.9, 0, Math.PI * 2); ctx.arc(x + 2.5, by - 31.5, 0.9, 0, Math.PI * 2); ctx.fill();
}

// ───────── 敵 ─────────
export function drawSoldier(ctx, e, t) {
  const f = e.face, ox = cx(e), oy = e.y + e.h;
  const g = e.state === 'windup' ? e.tell : 0;
  const walk = Math.abs(e.vx) > 10 ? Math.sin(t * 14) * 2 : 0;
  // 尖った脚
  poly(ctx, ox, oy, f, [[-7 + walk, 0], [-3 + walk, 0], [-3, -11]]); foeFill(ctx, FOE.body, 0);
  poly(ctx, ox, oy, f, [[3 - walk, 0], [8 - walk, 0], [4, -11]]); foeFill(ctx, FOE.body, 0);
  // 背中のトゲ
  poly(ctx, ox, oy, f, [[-6, -27], [-16, -34], [-9, -22]]); foeFill(ctx, FOE.rust, g);
  poly(ctx, ox, oy, f, [[-9, -20], [-18, -21], [-10, -15]]); foeFill(ctx, FOE.rust, g);
  // 前かがみの胴
  poly(ctx, ox, oy, f, [[-9, -10], [-10, -22], [-4, -29], [7, -27], [11, -17], [8, -9]]); foeFill(ctx, FOE.plate, g);
  // 角ばった兜と前へ突き出たとさか
  poly(ctx, ox, oy, f, [[1, -26], [2, -35], [-3, -42], [7, -36], [11, -36], [15, -30], [11, -24]]); foeFill(ctx, FOE.plate, g);
  slit(ctx, ox, oy, f, 7, 14, -31);
  // ギザギザの剣
  const sx = ox + f * 7, sy = oy - 17;
  let ang = f > 0 ? 0.35 : Math.PI - 0.35;
  if (e.state === 'windup') ang = f > 0 ? -Math.PI * 0.5 - e.tell * 0.5 : -Math.PI * 0.5 + e.tell * 0.5;
  if (e.state === 'slash') ang = f > 0 ? 0.1 : Math.PI - 0.1;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  ctx.strokeStyle = FOE.blade; ctx.lineWidth = 3; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + ca * 26, sy + sa * 26); ctx.stroke();
  ctx.fillStyle = FOE.blade;
  for (const d of [9, 15, 21]) {
    const px = sx + ca * d, py = sy + sa * d, nx = -sa, ny = ca;
    ctx.beginPath(); ctx.moveTo(px + nx * 1.5, py + ny * 1.5); ctx.lineTo(px + nx * 5 + ca * 2, py + ny * 5 + sa * 2); ctx.lineTo(px + ca * 4, py + sa * 4); ctx.closePath(); ctx.fill();
  }
  if (e.state === 'windup' && e.tell < 0.35) {
    const gx = sx + ca * 26, gy = sy + sa * 26, s = 10 * (1 - e.tell / 0.35);
    ctx.fillStyle = '#fff'; ctx.beginPath();
    ctx.moveTo(gx, gy - s); ctx.lineTo(gx + 2, gy); ctx.lineTo(gx, gy + s); ctx.lineTo(gx - 2, gy); ctx.closePath(); ctx.fill();
    ctx.fillRect(gx - s, gy - 1, s * 2, 2);
  }
  if (e.state === 'slash') {
    ctx.strokeStyle = 'rgba(255,120,80,0.8)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(ox + f * 8, cy(e), 30, f > 0 ? -1 : Math.PI - 0.6, f > 0 ? 0.6 : Math.PI + 1); ctx.stroke();
  }
  if (e.state === 'recover') { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('…', ox, e.y - 10); }
}

export function drawBat(ctx, e, t) {
  const x = cx(e), y = cy(e);
  if (e.state === 'tell' && e.target) {
    ctx.strokeStyle = `rgba(255,70,50,${0.25 + e.tell * 0.6})`; ctx.lineWidth = 1 + e.tell * 3;
    ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(e.target.x, e.target.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(e.target.x, e.target.y, 10 - e.tell * 4, 0, Math.PI * 2); ctx.stroke();
  }
  const g = e.state === 'tell' ? e.tell : 0;
  const flap = e.state === 'dive' ? -3 : Math.sin(t * 18) * 5;
  // ギザギザの翼
  for (const s of [-1, 1]) {
    poly(ctx, x, y, s, [[3, -2], [12, -8 + flap], [19, -11 + flap], [16, -4 + flap * 0.5], [22, -1 + flap * 0.3], [14, 2], [17, 6], [5, 4]]);
    foeFill(ctx, FOE.body, g);
  }
  // ひし形の胴と振り子の尾
  poly(ctx, x, y, 1, [[0, -8], [6, 0], [0, 8], [-6, 0]]); foeFill(ctx, e.state === 'stunned' ? '#666' : FOE.rust, g);
  poly(ctx, x, y, 1, [[-1, 7], [1, 7], [0, 16]]); foeFill(ctx, FOE.plate, g);
  slit(ctx, x, y, 1, 1, 4.5, -2.5, 1.6); slit(ctx, x, y, -1, 1, 4.5, -2.5, 1.6);
  if (e.state === 'stunned') { ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('@', x, e.y - 6); }
}

export function drawTurret(ctx, e, t) {
  const x = cx(e), y = cy(e) - 2, r = 11;
  // トゲの台座
  poly(ctx, x, e.y + e.h, 1, [[-13, 0], [-9, -7], [9, -7], [13, 0]]); foeFill(ctx, FOE.body, 0);
  // 歯の付いた外枠（外向きのトゲ）
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, rr = i % 2 ? r + 2 : r + 6;
    i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); foeFill(ctx, FOE.plate, e.tell);
  ctx.fillStyle = e.tell > 0 ? `rgb(${200 + e.tell * 55},${200 - e.tell * 120},${170 - e.tell * 120})` : '#cfc3a6';
  ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = FOE.eye; ctx.fillRect(x - 1, y - r + 1, 2, 4);
  const a = e.hand * Math.PI * 2 - Math.PI / 2;
  ctx.strokeStyle = '#1a1420'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (r - 3), y + Math.sin(a) * (r - 3)); ctx.stroke();
}

export function drawKnight(ctx, e, t, drawGear) {
  const f = e.face, ox = cx(e), oy = e.y + e.h;
  const g = e.tellKind === 'shield' || e.tellKind === 'hammer' ? e.tell : 0;
  // 角ばった脚
  poly(ctx, ox, oy, f, [[-11, 0], [-4, 0], [-6, -12], [-10, -12]]); foeFill(ctx, FOE.body, 0);
  poly(ctx, ox, oy, f, [[4, 0], [11, 0], [10, -12], [6, -12]]); foeFill(ctx, FOE.body, 0);
  // 肩幅の広い胴と肩のトゲ
  poly(ctx, ox, oy, f, [[-11, -11], [-16, -34], [16, -34], [11, -11]]); foeFill(ctx, FOE.plate, g);
  poly(ctx, ox, oy, f, [[-16, -34], [-22, -41], [-9, -34]]); foeFill(ctx, FOE.rust, g);
  poly(ctx, ox, oy, f, [[16, -34], [22, -41], [9, -34]]); foeFill(ctx, FOE.rust, g);
  drawGear(ctx, ox, oy - 22, 6, t * (e.state === 'stagger' ? 0.5 : 2), '#a08a60');
  // 二本角の兜
  poly(ctx, ox, oy, f, [[-7, -34], [-8, -44], [8, -44], [9, -34]]); foeFill(ctx, FOE.plate, g);
  poly(ctx, ox, oy, f, [[-7, -43], [-12, -52], [-3, -44]]); foeFill(ctx, FOE.rust, g);
  poly(ctx, ox, oy, f, [[7, -43], [12, -52], [3, -44]]); foeFill(ctx, FOE.rust, g);
  slit(ctx, ox, oy, f, 1, 9, -40);
  // 盾（前面にトゲ）
  if (e.state !== 'stagger') {
    const glow = e.tellKind === 'shield' ? e.tell : 0;
    poly(ctx, ox, oy, f, [[14, -6], [14, -38], [21, -38], [21, -24], [27, -22], [21, -20], [21, -6]]);
    foeFill(ctx, e.guarding ? '#7d6e5a' : '#4e4438', glow);
  }
  // ハンマー
  if (e.state === 'slamWind' || e.state === 'slam') {
    const up = e.state === 'slamWind';
    const hx = ox + f * (up ? -4 : 30), hy = up ? e.y - 18 - e.tell * 8 : oy - 14;
    ctx.strokeStyle = '#6a5a44'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ox, e.y + 14); ctx.lineTo(hx, hy); ctx.stroke();
    poly(ctx, hx, hy, 1, [[-10, -7], [10, -7], [12, 0], [10, 7], [-10, 7], [-12, 0]]); foeFill(ctx, '#7a6a52', up ? e.tell : 0);
    if (up) { ctx.fillStyle = `rgba(255,90,60,${e.tell})`; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('！', ox, e.y - 40); }
  }
  if (e.state === 'stagger') { ctx.fillStyle = '#f2c14e'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('崩れ', ox, e.y - 16); }
}

export function drawBoss(ctx, game, e, t, FONT) {
  const x = e.x, y = e.y, f = e.face, ox = cx(e), oy = y + e.h;
  // 残響喰いの輪
  if (e.ringT > 0) { ctx.strokeStyle = 'rgba(182,124,240,0.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ox, cy(e), 44 + Math.sin(t * 8) * 3, 0, Math.PI * 2); ctx.stroke(); }
  // 跳躍の着地点
  if (e.state === 'leap') {
    ctx.fillStyle = 'rgba(255,60,40,0.35)';
    const gy = game.map.groundBelow(e.leapX, e.y + e.h);
    ctx.beginPath(); ctx.ellipse(e.leapX, gy, 46, 7, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 振り子斬りの予告弧
  if (e.state === 'swingWind') {
    ctx.fillStyle = `rgba(255,90,60,${0.12 + e.tell * 0.25})`;
    ctx.beginPath(); ctx.moveTo(ox, cy(e));
    ctx.arc(ox, cy(e) - 4, 118, f > 0 ? -0.9 : Math.PI - 0.6, f > 0 ? 0.6 : Math.PI + 0.9); ctx.closePath(); ctx.fill();
  }
  if (e.state === 'handsWind' && e.targets) {
    ctx.strokeStyle = `rgba(255,90,60,${0.3 + e.tell * 0.6})`; ctx.lineWidth = 1 + e.tell * 2; ctx.setLineDash([6, 6]);
    for (const tg of e.targets) { ctx.beginPath(); ctx.moveTo(ox, y + 16); ctx.lineTo(tg.x, tg.y); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  const duel = e.trueDuel;
  const g = e.tell > 0 && ['swingWind', 'handsWind', 'stopWind', 'stepWind', 'antiAirWind', 'leapWind'].includes(e.state) ? e.tell : 0;
  // 時計の針の冠（後光の代わりにトゲが放射する）
  const spin = e.phase === 3 ? -t * 0.8 : 0;
  ctx.fillStyle = duel ? 'rgba(255,211,138,0.8)' : 'rgba(242,193,78,0.75)';
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + spin, len = i % 3 === 0 ? 24 : 15;
    const hx = ox, hy = oy - 54;
    ctx.beginPath();
    ctx.moveTo(hx + Math.cos(a - 0.08) * 9, hy + Math.sin(a - 0.08) * 9);
    ctx.lineTo(hx + Math.cos(a) * len, hy + Math.sin(a) * len);
    ctx.lineTo(hx + Math.cos(a + 0.08) * 9, hy + Math.sin(a + 0.08) * 9);
    ctx.closePath(); ctx.fill();
  }
  // 尖った肩とギザギザの裾の長衣
  const hem = [];
  for (let i = 0; i <= 8; i++) hem.push([16 - i * 4, i % 2 ? -7 : 0]);
  poly(ctx, ox, oy, f, [[8, -50], [21, -46], [27, -55], [19, -40], ...hem, [-19, -40], [-26, -54], [-20, -46], [-8, -50]]);
  foeFill(ctx, duel ? '#3c3448' : FOE.body, g);
  // 角ばった仮面
  poly(ctx, ox, oy, f, [[-6, -49], [-7, -57], [0, -64], [7, -58], [8, -50], [1, -46]]);
  ctx.fillStyle = '#d8ccb4'; ctx.fill(); ctx.strokeStyle = FOE.rim; ctx.lineWidth = 1.2; ctx.stroke();
  slit(ctx, ox, oy, f, 1, 7, -56);
  // 振り子の剣
  let ang = f > 0 ? 0.6 : Math.PI - 0.6;
  if (e.state === 'swingWind') ang = f > 0 ? Math.PI + 0.6 + e.tell * 0.5 : -0.6 - e.tell * 0.5;
  if (e.state === 'swing' || e.state === 'riposte' || e.state === 'step') ang = f > 0 ? 0.1 : Math.PI - 0.1;
  ctx.strokeStyle = '#e2d6b8'; ctx.lineWidth = 4;
  const hx = ox, hy = y + 22;
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(ang) * 60, hy + Math.sin(ang) * 60); ctx.stroke();
  const px = hx + Math.cos(ang) * 60, py = hy + Math.sin(ang) * 60;
  ctx.fillStyle = '#f2c14e';
  ctx.beginPath(); ctx.moveTo(px, py - 9); ctx.lineTo(px + 8, py); ctx.lineTo(px, py + 9); ctx.lineTo(px - 8, py); ctx.closePath(); ctx.fill();
  if (e.state === 'swing') { ctx.strokeStyle = 'rgba(255,200,120,0.85)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(ox, cy(e) - 4, 100, f > 0 ? -0.9 : Math.PI - 0.6, f > 0 ? 0.6 : Math.PI + 0.9); ctx.stroke(); }
  // 懐中時計（時止めの予兆）
  if (e.state === 'stopWind') {
    const k = e.tell;
    ctx.fillStyle = `rgba(255,255,255,${0.5 + k * 0.5})`;
    ctx.beginPath(); ctx.arc(ox - f * 6, y - 14 - k * 10, 8 + k * 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1a1420'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(ox - f * 6, y - 14 - k * 10); ctx.lineTo(ox - f * 6 + Math.cos(t * 12) * 6, y - 14 - k * 10 + Math.sin(t * 12) * 6); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${k * 0.5})`; ctx.beginPath(); ctx.arc(ox, cy(e), 40 + k * 80, 0, Math.PI * 2); ctx.stroke();
  }
  if (e.state === 'parry') { ctx.strokeStyle = 'rgba(90,169,230,0.95)'; ctx.lineWidth = 4; ctx.strokeRect(x - 8, y - 8, e.w + 16, e.h + 16); ctx.fillStyle = '#5aa9e6'; ctx.font = `bold 13px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('受', ox, y - 30); }
  if (e.state === 'stepWind') { ctx.strokeStyle = `rgba(255,60,40,${e.tell})`; ctx.lineWidth = 4; ctx.strokeRect(x - 8, y - 8, e.w + 16, e.h + 16); }
  if (e.state === 'antiAirWind') { ctx.fillStyle = `rgba(255,90,60,${e.tell})`; ctx.beginPath(); ctx.moveTo(ox, y - 44); ctx.lineTo(ox - 9, y - 28); ctx.lineTo(ox + 9, y - 28); ctx.closePath(); ctx.fill(); }
  if (e.state === 'leapWind') { ctx.fillStyle = 'rgba(255,90,60,0.6)'; ctx.fillRect(x - 4, oy - 3, e.w + 8, 3); }
  if (e.state === 'stagger') { ctx.fillStyle = '#f2c14e'; ctx.font = `bold 13px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('崩れ', ox, y - 30); }
}
