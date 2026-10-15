// HUD・メニュー・巻き戻り画面。装飾より可読性を優先する。
import { VIEW_W, VIEW_H, COLORS as C, PLAYER as PC } from './config.js';
import { clamp } from './util.js';
import { BOONS, SCHOOLS, RESONANCE, synergyHints, schoolCounts } from './boons.js';
import { KNOWLEDGE, WEDGE_TARGETS, COUNTERS, fmtClock, wedgeLabel, openQuestions, bossCounter, GLEN_DEADLINE, hasWedge } from './meta.js';
import { FLOOR_NAMES } from './world.js';

export const FONT = `'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'IPAGothic', sans-serif`;
const SERIF = `'Noto Serif JP', 'Hiragino Mincho ProN', 'Yu Mincho', 'IPAGothic', serif`;

function text(ctx, str, x, y, { size = 14, color = C.text, align = 'left', bold = false, font = FONT, shadow = true } = {}) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(str, x + 1, y + 1); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}
// 折り返し（日本語は文字単位）
function wrap(ctx, str, maxW, size, font = FONT) {
  ctx.font = `${size}px ${font}`;
  const lines = [];
  for (const para of String(str).split('\n')) {
    let cur = '';
    for (const ch of para) {
      if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; }
      else cur += ch;
    }
    lines.push(cur);
  }
  return lines;
}
function panel(ctx, x, y, w, h, border = 'rgba(255,255,255,0.18)', bg = 'rgba(12,9,18,0.92)') {
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

// ───────── HUD ─────────
export function drawHud(ctx, game) {
  const p = game.player, run = game.run, meta = game.meta;
  // HP
  const hpW = 200;
  panel(ctx, 14, 12, hpW + 16, 46, 'rgba(255,255,255,0.12)', 'rgba(10,8,14,0.6)');
  ctx.fillStyle = '#2a1a1e'; ctx.fillRect(22, 20, hpW, 12);
  const k = clamp(p.hp / p.maxHp, 0, 1);
  ctx.fillStyle = k < 0.3 ? '#ff5a3c' : '#e35d5d'; ctx.fillRect(22, 20, hpW * k, 12);
  text(ctx, `${Math.ceil(p.hp)} / ${p.maxHp}`, 22 + hpW - 4, 31, { size: 10, align: 'right', color: '#fff' });
  // 秒針ゲージ（時歪の消費量に目盛り）
  const cost = PC.skillCost * p.stats.skillCostMul;
  ctx.fillStyle = '#16202c'; ctx.fillRect(22, 38, hpW, 8);
  ctx.fillStyle = p.gauge >= cost ? '#5aa9e6' : '#3a6a90'; ctx.fillRect(22, 38, hpW * (p.gauge / PC.gaugeMax), 8);
  for (let c = cost; c < PC.gaugeMax; c += cost) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(22 + hpW * (c / PC.gaugeMax), 37, 1, 10); }
  text(ctx, p.gauge >= cost ? '時歪 V' : '秒針', 22 + hpW + 4, 47, { size: 9, color: p.gauge >= cost ? '#9fd0ff' : C.muted });
  if (p.dodgeCd > 0) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(22, 50, hpW * clamp(1 - p.dodgeCd / 0.8, 0, 1), 2); }

  // 中央：夜の時刻・階層・部屋の進み
  const fi = run.fi;
  text(ctx, `夜 ${fmtClock(run.clock)}`, VIEW_W / 2, 26, { size: 15, align: 'center', bold: true, color: '#efe6d2' });
  text(ctx, `第${meta.loop}夜　${FLOOR_NAMES[fi]}`, VIEW_W / 2, 42, { size: 10, align: 'center', color: C.muted });
  const rooms = run.plan.floors[fi];
  const dotW = 14, sx = VIEW_W / 2 - (rooms.length * dotW) / 2 + dotW / 2;
  rooms.forEach((r, i) => {
    const causal = ['forge', 'archive', 'study', 'entry'].includes(r.type);
    ctx.fillStyle = i === run.ri ? '#fff' : i < run.ri ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)';
    if (causal) ctx.fillStyle = i === run.ri ? C.gold : i < run.ri ? C.goldDim : 'rgba(242,193,78,0.35)';
    if (r.type === 'boss') ctx.fillStyle = i === run.ri ? '#ff8a6a' : 'rgba(227,93,93,0.5)';
    ctx.beginPath(); ctx.arc(sx + i * dotW, 52, i === run.ri ? 4 : 3, 0, Math.PI * 2); ctx.fill();
  });

  // 右上：楔の枠
  const slots = meta.slots;
  const bx = VIEW_W - 18;
  text(ctx, '楔', bx, 24, { size: 11, align: 'right', color: C.gold, bold: true });
  for (let i = 0; i < 3; i++) {
    const x = bx - 30 - i * 22, y = 14;
    const w = meta.wedges[i];
    if (i >= slots) { ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.strokeRect(x - 7, y, 14, 22); continue; }
    if (w) {
      ctx.fillStyle = C.gold;
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.lineTo(x + 2, y + 6); ctx.lineTo(x, y + 22); ctx.lineTo(x - 2, y + 6); ctx.closePath(); ctx.fill();
    } else {
      ctx.strokeStyle = C.gold; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.lineTo(x + 2, y + 6); ctx.lineTo(x, y + 22); ctx.lineTo(x - 2, y + 6); ctx.closePath(); ctx.stroke();
    }
  }
  meta.wedges.forEach((w, i) => text(ctx, shortWedge(w), VIEW_W - 18, 52 + i * 13, { size: 10, align: 'right', color: '#d8b968' }));

  // 左下：強化
  const counts = schoolCounts(p.boons);
  p.boons.forEach((b, i) => {
    const def = BOONS[b.id], col = SCHOOLS[def.school].color;
    const x = 18 + (i % 8) * 112, y = VIEW_H - 22 - Math.floor(i / 8) * 20;
    ctx.fillStyle = col; ctx.save(); ctx.translate(x + 5, y - 4); ctx.rotate(Math.PI / 4); ctx.fillRect(-4, -4, 8, 8); ctx.restore();
    const wedged = meta.wedges.some((w) => w.target === 'boon' && w.boon.id === b.id);
    text(ctx, def.name + (b.tier > 1 ? ' II' : ''), x + 14, y, { size: 11, color: wedged ? C.gold : '#ddd' });
  });
  const res = Object.entries(counts).filter(([s, n]) => s !== 'risk' && n >= 2).map(([s]) => SCHOOLS[s].name);
  if (res.length) text(ctx, `共鳴：${res.join('・')}`, 18, VIEW_H - 22 - (Math.ceil(p.boons.length / 8)) * 20, { size: 10, color: '#f2c14e' });

  // 鍛冶屋の危機
  if (game.room.desc.type === 'forge' && run.glen === 'attacked') {
    text(ctx, 'グレンを守れ', VIEW_W / 2, 78, { size: 13, align: 'center', color: '#ff8a6a', bold: true });
  }
  // 刻守のHP
  const b = game.room.boss;
  if (b) {
    const w = 520, x = VIEW_W / 2 - w / 2, y = VIEW_H - 40;
    text(ctx, b.trueDuel ? '刻守 ― 夜明けの決闘' : '刻守', x, y - 6, { size: 13, bold: true, color: b.trueDuel ? '#ffd38a' : '#efe6d2', font: SERIF });
    if (b.counter) text(ctx, `対策：${COUNTERS[b.counter].name}`, x + w, y - 6, { size: 10, align: 'right', color: '#ff9a7a' });
    if (b.brake) text(ctx, b.trueDuel ? '' : '時止め封印', x + w - (b.counter ? 150 : 0), y - 6, { size: 10, align: 'right', color: C.gold });
    ctx.fillStyle = '#1a1018'; ctx.fillRect(x, y, w, 10);
    ctx.fillStyle = b.trueDuel ? '#ffd38a' : '#c94a3a'; ctx.fillRect(x, y, w * clamp(b.hp / b.maxHp, 0, 1), 10);
    for (const t of [b.p2At, b.p3At]) { ctx.fillStyle = '#fff'; ctx.fillRect(x + w * t - 1, y - 2, 2, 14); }
  }
  // 楔の溜め
  if (p.state === 'channel') text(ctx, '楔を打っている……（回避・ジャンプで中断）', VIEW_W / 2, VIEW_H - 70, { size: 12, align: 'center', color: C.gold });
  // 大見出し
  const bn = game.fx.banner;
  if (bn) {
    const a = bn.t < 0.2 ? bn.t / 0.2 : bn.t > bn.life - 0.4 ? (bn.life - bn.t) / 0.4 : 1;
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.fillStyle = 'rgba(8,6,12,0.55)'; ctx.fillRect(0, VIEW_H * 0.3 - 34, VIEW_W, bn.sub ? 62 : 46);
    text(ctx, bn.text, VIEW_W / 2, VIEW_H * 0.3, { size: 26, align: 'center', color: bn.color, bold: true, font: SERIF });
    if (bn.sub) text(ctx, bn.sub, VIEW_W / 2, VIEW_H * 0.3 + 20, { size: 12, align: 'center', color: '#d8d0c0' });
    ctx.globalAlpha = 1;
  }
}
function shortWedge(w) {
  if (w.target === 'boon') return BOONS[w.boon.id].name + (w.boon.tier > 1 ? ' II' : '');
  return WEDGE_TARGETS[w.target].name;
}

// ───────── モーダル ─────────
export function drawModal(ctx, game) {
  const m = game.modal;
  if (m.type === 'dialog') return drawDialog(ctx, game, m);
  ctx.fillStyle = 'rgba(5,4,8,0.7)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (m.type === 'boon') drawBoonPick(ctx, game, m);
  if (m.type === 'forge') drawForge(ctx, game, m);
  if (m.type === 'code') drawCode(ctx, game, m);
  if (m.type === 'pause') drawPause(ctx, game, m);
  if (m.type === 'journal') drawJournal(ctx, game, m);
}

function drawDialog(ctx, game, m) {
  const line = m.lines[m.idx];
  const x = 120, w = VIEW_W - 240, y = VIEW_H - 170;
  const last = m.idx >= m.lines.length - 1;
  const choices = last && m.choices ? m.choices : [];
  const h = 110 + choices.length * 22;
  panel(ctx, x, y - choices.length * 22, w, h, 'rgba(242,193,78,0.35)');
  const top = y - choices.length * 22;
  if (line.who) text(ctx, line.who, x + 18, top + 26, { size: 13, bold: true, color: C.gold });
  const shown = Math.floor(clamp(m.t * 60, 0, 999)); // 文字送り
  const lines = wrap(ctx, line.text, w - 36, 16, SERIF);
  let used = 0;
  lines.forEach((l, i) => { const s = l.slice(0, Math.max(0, shown - used)); used += l.length; text(ctx, s, x + 18, top + 52 + i * 22, { size: 16, font: SERIF }); });
  if (line.note) text(ctx, '◆ ' + line.note, x + 18, top + 52 + lines.length * 22 + 4, { size: 11, color: '#7fb8ff' });
  choices.forEach((c, i) => {
    const cy = top + h - (choices.length - i) * 22 - 8;
    if (i === m.sel) { ctx.fillStyle = 'rgba(242,193,78,0.15)'; ctx.fillRect(x + 12, cy - 15, w - 24, 20); }
    text(ctx, (i === m.sel ? '▶ ' : '　') + c.label, x + 22, cy, { size: 13, color: i === m.sel ? C.gold : '#ddd' });
  });
  if (!choices.length) text(ctx, last ? 'Z：閉じる' : 'Z：次へ', x + w - 14, top + h - 10, { size: 10, align: 'right', color: C.muted });
}

function drawBoonPick(ctx, game, m) {
  const p = game.player;
  text(ctx, m.school ? '書庫の祭壇 ―「停滞」の強化' : '強化を選ぶ', VIEW_W / 2, 92, { size: 22, align: 'center', bold: true, font: SERIF, color: C.gold });
  if (m.count > 1) text(ctx, `あと ${m.count} つ`, VIEW_W / 2, 114, { size: 12, align: 'center', color: C.muted });
  const cw = 250, ch = 230, gap = 22;
  const total = m.offer.length * cw + (m.offer.length - 1) * gap;
  m.offer.forEach((id, i) => {
    const def = BOONS[id], sc = SCHOOLS[def.school];
    // 1枚ずつ滑り込む
    const appear = clamp((m.t - i * 0.07) / 0.2, 0, 1);
    if (appear <= 0) return;
    ctx.globalAlpha = appear;
    const x = VIEW_W / 2 - total / 2 + i * (cw + gap), y = 140 - (i === m.sel ? 8 : 0) + (1 - appear) * 24;
    const sel = i === m.sel;
    panel(ctx, x, y, cw, ch, sel ? sc.color : 'rgba(255,255,255,0.15)', sel ? 'rgba(24,18,32,0.98)' : 'rgba(14,11,20,0.95)');
    if (sel) { ctx.lineWidth = 2; ctx.strokeStyle = sc.color; ctx.strokeRect(x + 1, y + 1, cw - 2, ch - 2); }
    ctx.fillStyle = sc.color; ctx.fillRect(x, y, cw, 5);
    text(ctx, sc.name, x + 16, y + 28, { size: 11, color: sc.color, bold: true });
    text(ctx, def.name, x + 16, y + 56, { size: 20, bold: true, font: SERIF });
    wrap(ctx, def.desc(1), cw - 32, 13).forEach((l, j) => text(ctx, l, x + 16, y + 86 + j * 19, { size: 13, color: def.school === 'risk' ? '#ffb0a0' : '#e8e0d0' }));
    const hints = synergyHints(id, p.boons);
    let hy = y + 170;
    for (const h of hints) { wrap(ctx, h, cw - 32, 11).forEach((l) => { text(ctx, l, x + 16, hy, { size: 11, color: '#f2c14e' }); hy += 15; }); }
    if (!hints.length && def.school !== 'risk') text(ctx, `同じ系統をもう1つで共鳴：${RESONANCE[def.school]}`, x + 16, y + ch - 16, { size: 9, color: C.muted });
    ctx.globalAlpha = 1;
  });
  text(ctx, '← → 選ぶ　Z 決定', VIEW_W / 2, 412, { size: 12, align: 'center', color: C.muted });
  // 現在の手持ち
  if (p.boons.length) text(ctx, '手持ち：' + p.boons.map((b) => BOONS[b.id].name + (b.tier > 1 ? 'II' : '')).join('・'), VIEW_W / 2, 440, { size: 11, align: 'center', color: '#bbb' });
}

function drawForge(ctx, game, m) {
  const x = VIEW_W / 2 - 220, y = 120, w = 440, h = 60 + m.list.length * 30;
  panel(ctx, x, y, w, h, C.gold);
  text(ctx, 'グレンの鍛冶 ― どれを鍛える？', x + 20, y + 32, { size: 16, bold: true, color: C.gold, font: SERIF });
  m.list.forEach((b, i) => {
    const yy = y + 62 + i * 30;
    if (i === m.sel) { ctx.fillStyle = 'rgba(242,193,78,0.15)'; ctx.fillRect(x + 10, yy - 18, w - 20, 26); }
    text(ctx, `${BOONS[b.id].name} → II`, x + 24, yy, { size: 14, color: i === m.sel ? C.gold : '#ddd' });
    if (i === m.sel) text(ctx, BOONS[b.id].desc(2), x + 200, yy, { size: 11, color: '#cfc' });
  });
}

function drawCode(ctx, game, m) {
  const x = VIEW_W / 2 - 170, y = 150, w = 340, h = 220;
  panel(ctx, x, y, w, h, C.gold);
  text(ctx, '書庫の扉', VIEW_W / 2, y + 34, { size: 18, align: 'center', bold: true, color: C.gold, font: SERIF });
  const shakeX = m.wrong > 0 ? Math.sin(m.wrong * 60) * 6 : 0;
  for (let i = 0; i < 3; i++) {
    const dx = VIEW_W / 2 - 80 + i * 80 + shakeX;
    ctx.fillStyle = i === m.pos ? 'rgba(242,193,78,0.2)' : 'rgba(255,255,255,0.05)'; ctx.fillRect(dx - 26, y + 66, 52, 70);
    text(ctx, String(m.digits[i]), dx, y + 116, { size: 40, align: 'center', bold: true, color: i === m.pos ? C.gold : '#ddd' });
    if (i === m.pos) { text(ctx, '▲', dx, y + 62, { size: 11, align: 'center', color: C.gold }); text(ctx, '▼', dx, y + 150, { size: 11, align: 'center', color: C.gold }); }
  }
  const known = game.meta.knowledge.code;
  text(ctx, known ? `記録帳：「書庫の扉 ${game.meta.code.join('-')}」` : '番号の手がかりはまだない', VIEW_W / 2, y + 180, { size: 12, align: 'center', color: known ? '#7fb8ff' : C.muted });
  text(ctx, '←→ 桁　↑↓ 数字　Z 決定　C 戻る', VIEW_W / 2, y + 204, { size: 10, align: 'center', color: C.muted });
}

function drawPause(ctx, game, m) {
  const opts = game.pauseOptions();
  const x = VIEW_W / 2 - 160, y = 140, w = 320, h = 70 + opts.length * 32;
  panel(ctx, x, y, w, h);
  text(ctx, '中断', VIEW_W / 2, y + 36, { size: 20, align: 'center', bold: true, font: SERIF });
  opts.forEach((o, i) => {
    const yy = y + 74 + i * 32;
    text(ctx, (i === m.sel ? '▶ ' : '') + o.label, VIEW_W / 2, yy, { size: 14, align: 'center', color: i === m.sel ? C.gold : '#ddd' });
  });
  text(ctx, '移動 ←→　ジャンプ Z　攻撃 X（長押しで重撃）　回避 C　時歪 V　調べる ↑/E', VIEW_W / 2, VIEW_H - 30, { size: 11, align: 'center', color: C.muted });
}

const TABS = ['人物', '謎', '敵', '問い'];
export function drawJournal(ctx, game, m) {
  const meta = game.meta;
  const x = 90, y = 50, w = VIEW_W - 180, h = VIEW_H - 100;
  panel(ctx, x, y, w, h, 'rgba(127,184,255,0.4)');
  text(ctx, '記録帳', x + 24, y + 36, { size: 20, bold: true, font: SERIF, color: '#9fd0ff' });
  text(ctx, '周回をまたいで残る。知っていることが、次の夜の攻略になる。', x + 120, y + 34, { size: 11, color: C.muted });
  TABS.forEach((t, i) => {
    const tx = x + 24 + i * 90, ty = y + 62;
    ctx.fillStyle = i === m.tab ? 'rgba(127,184,255,0.25)' : 'rgba(255,255,255,0.04)'; ctx.fillRect(tx, ty, 80, 24);
    text(ctx, t, tx + 40, ty + 17, { size: 13, align: 'center', color: i === m.tab ? '#fff' : '#aaa' });
  });
  let yy = y + 116;
  const maxY = y + h - 40;
  const draw = (title, body, isNew, color = '#efe6d2') => {
    if (yy > maxY) return;
    text(ctx, (isNew ? '● ' : '') + title, x + 28, yy, { size: 14, bold: true, color });
    yy += 18;
    for (const l of wrap(ctx, body, w - 70, 12)) { if (yy > maxY) return; text(ctx, l, x + 40, yy, { size: 12, color: '#cfc8bb' }); yy += 16; }
    yy += 8;
  };
  if (m.tab < 3) {
    const cat = TABS[m.tab];
    const entries = Object.entries(KNOWLEDGE).filter(([k, v]) => v.cat === cat && meta.knowledge[k]);
    if (!entries.length) { text(ctx, 'まだ何も知らない。', x + 28, yy, { size: 13, color: C.muted }); yy += 24; }
    for (const [k, v] of entries) draw(v.title, v.text(meta), meta.knowledge[k] === meta.loop && game.scene === 'play', cat === '敵' ? '#ffb0a0' : '#efe6d2');
    if (m.tab === 0) {
      // 楔の状態もここで確認できる
      yy += 6;
      text(ctx, `楔（${meta.wedges.length}/${meta.slots}）`, x + 28, yy, { size: 13, bold: true, color: C.gold }); yy += 18;
      for (const wd of meta.wedges) { text(ctx, `◆ ${wedgeLabel(wd)}：${wd.target === 'boon' ? WEDGE_TARGETS.boon.effect : WEDGE_TARGETS[wd.target].effect}`, x + 40, yy, { size: 12, color: '#d8b968' }); yy += 16; }
    }
  } else {
    for (const q of openQuestions(meta)) draw('？', q, false, '#9fd0ff');
    const c = bossCounter(meta.lastLoop);
    if (c) draw('刻守の記憶', `前の夜の戦い方を覚えている：${COUNTERS[c].name}――${COUNTERS[c].desc}`, false, '#ff9a7a');
  }
  text(ctx, '←→ タブ　Tab/Esc 閉じる', x + w - 20, y + h - 14, { size: 10, align: 'right', color: C.muted });
}

// ───────── タイトル ─────────
export function drawTitle(ctx, game) {
  const t = game.time;
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#1b1426'); g.addColorStop(1, '#07060b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // 時計塔のシルエット
  ctx.fillStyle = '#0d0a12';
  ctx.fillRect(VIEW_W / 2 - 70, 140, 140, VIEW_H - 140);
  ctx.beginPath(); ctx.moveTo(VIEW_W / 2 - 90, 145); ctx.lineTo(VIEW_W / 2, 60); ctx.lineTo(VIEW_W / 2 + 90, 145); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e8dcc4'; ctx.beginPath(); ctx.arc(VIEW_W / 2, 200, 44, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#1a1420'; ctx.lineWidth = 3;
  const a1 = -t * 0.6 - Math.PI / 2, a2 = -t * 0.05 - Math.PI / 2; // 逆回り
  ctx.beginPath(); ctx.moveTo(VIEW_W / 2, 200); ctx.lineTo(VIEW_W / 2 + Math.cos(a1) * 36, 200 + Math.sin(a1) * 36); ctx.stroke();
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(VIEW_W / 2, 200); ctx.lineTo(VIEW_W / 2 + Math.cos(a2) * 24, 200 + Math.sin(a2) * 24); ctx.stroke();
  ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(VIEW_W / 2 - 6, 248); ctx.lineTo(VIEW_W / 2 + 6, 248); ctx.lineTo(VIEW_W / 2, 290); ctx.closePath(); ctx.fill();
  text(ctx, '夜明けの楔', VIEW_W / 2, 340, { size: 46, align: 'center', bold: true, font: SERIF, color: '#f3e7cf' });
  text(ctx, 'WEDGE OF DAWN', VIEW_W / 2, 364, { size: 12, align: 'center', color: C.gold });
  if (game.titleConfirm) {
    panel(ctx, VIEW_W / 2 - 200, 390, 400, 80, '#e35d5d');
    text(ctx, '記録をすべて消して、はじめから遊びますか？', VIEW_W / 2, 422, { size: 14, align: 'center' });
    text(ctx, 'Z：消してはじめる　C：やめる', VIEW_W / 2, 450, { size: 12, align: 'center', color: C.muted });
    return;
  }
  const opts = game.titleOptions();
  opts.forEach((o, i) => text(ctx, (i === game.titleSel ? '▶ ' : '') + o.label, VIEW_W / 2, 410 + i * 28, { size: 16, align: 'center', color: i === game.titleSel ? C.gold : '#bbb' }));
  text(ctx, '↑↓ 選ぶ　Z/Enter 決定　｜　移動 ←→　ジャンプ Z　攻撃 X　回避 C　時歪 V　調べる ↑', VIEW_W / 2, VIEW_H - 18, { size: 11, align: 'center', color: C.muted });
  if (game.meta && game.meta.flags.ending) text(ctx, '― 夜明けを迎えた ―', VIEW_W / 2, 386, { size: 11, align: 'center', color: '#ffd38a' });
}

// ───────── 巻き戻り ─────────
export function drawRewind(ctx, game) {
  const r = game.rewind, rep = r.report, meta = game.meta;
  const t = r.t;
  ctx.fillStyle = '#07060b'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // 逆回りの大時計
  const spin = t < 1.4 ? -t * t * 6 : -1.96 * 6 - (t - 1.4) * 0.6;
  ctx.save(); ctx.globalAlpha = 0.18;
  ctx.strokeStyle = C.gold; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(VIEW_W / 2, VIEW_H / 2, 230, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.fillStyle = C.gold; ctx.fillRect(VIEW_W / 2 + Math.cos(a) * 220 - 2, VIEW_H / 2 + Math.sin(a) * 220 - 2, 4, 4); }
  ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(VIEW_W / 2, VIEW_H / 2); ctx.lineTo(VIEW_W / 2 + Math.cos(spin) * 190, VIEW_H / 2 + Math.sin(spin) * 190); ctx.stroke();
  ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(VIEW_W / 2, VIEW_H / 2); ctx.lineTo(VIEW_W / 2 + Math.cos(spin / 12) * 120, VIEW_H / 2 + Math.sin(spin / 12) * 120); ctx.stroke();
  ctx.restore();
  const causeText = rep.cause === 'bell' ? '鐘が鳴った。夜が戻る。' : 'あなたは倒れた。夜が戻る。';
  text(ctx, causeText, VIEW_W / 2, 52, { size: 20, align: 'center', font: SERIF, color: rep.cause === 'bell' ? C.gold : '#efe6d2' });
  text(ctx, `第 ${rep.loop} 夜 → 第 ${meta.loop} 夜`, VIEW_W / 2, 76, { size: 12, align: 'center', color: C.muted });
  if (rep.tip && t > 2.2) text(ctx, '◆ ' + rep.tip, VIEW_W / 2, 366, { size: 12, align: 'center', color: '#f2c14e' });
  const cols = [
    { title: '残ったもの', color: C.gold, items: rep.kept, at: 0.5 },
    { title: '戻ったもの', color: C.reset, items: rep.reset, at: 1.1 },
    { title: '変わったこと', color: C.change, items: rep.changed, at: 1.7 },
  ];
  const cw = 280, gap = 22, x0 = VIEW_W / 2 - (cw * 3 + gap * 2) / 2;
  cols.forEach((c, i) => {
    const a = clamp((t - c.at) / 0.4, 0, 1);
    if (a <= 0) return;
    ctx.globalAlpha = a;
    const x = x0 + i * (cw + gap), y = 100 + (1 - a) * 12;
    panel(ctx, x, y, cw, 250, c.color + '88', 'rgba(14,11,20,0.9)');
    text(ctx, c.title, x + 14, y + 26, { size: 15, bold: true, color: c.color, font: SERIF });
    let yy = y + 52;
    if (!c.items.length) text(ctx, '―', x + 14, yy, { size: 12, color: C.muted });
    c.items.forEach((it, j) => {
      const ia = clamp((t - c.at - 0.15 - j * 0.12) / 0.3, 0, 1);
      if (ia <= 0 || yy > y + 236) return;
      ctx.globalAlpha = a * ia;
      const col = i === 1 ? '#9a9aa2' : it.tone === 'risk' ? '#ff9a7a' : it.tone === 'blue' ? '#7fb8ff' : it.tone === 'reset' ? '#9a9aa2' : i === 0 ? '#f3dca0' : '#d9c2ff';
      for (const l of wrap(ctx, it.text, cw - 28, 12)) { text(ctx, l, x + 14, yy, { size: 12, color: col }); if (i === 1) { ctx.fillStyle = 'rgba(160,160,170,0.6)'; ctx.fillRect(x + 14, yy - 4, Math.min(cw - 28, ctx.measureText(l).width) * ia, 1); } yy += 16; }
      if (it.sub) for (const l of wrap(ctx, it.sub, cw - 40, 10)) { text(ctx, l, x + 22, yy, { size: 10, color: C.muted }); yy += 14; }
      yy += 6;
    });
    ctx.globalAlpha = 1;
  });
  ctx.globalAlpha = 1;
  if (t < 3.2) { text(ctx, 'Z：とばす', VIEW_W - 20, VIEW_H - 16, { size: 10, align: 'right', color: C.muted }); return; }
  // 選択肢
  const by = rep.tip ? 396 : 380;
  if (r.mode === 'view') {
    const opts = game.rewindOptions();
    opts.forEach((o, i) => text(ctx, (i === r.sel ? '▶ ' : '') + o.label, VIEW_W / 2, by + i * 26, { size: 15, align: 'center', color: i === r.sel ? C.gold : '#ccc', bold: i === r.sel }));
    text(ctx, `楔 ${meta.wedges.length}/${meta.slots}`, VIEW_W / 2, VIEW_H - 16, { size: 11, align: 'center', color: C.gold });
  } else {
    const list = r.mode === 'pull' ? meta.wedges.map((w) => wedgeLabel(w)) : game.wedgeableBoons().map((b) => `${BOONS[b.id].name}${b.tier > 1 ? ' II' : ''}（${SCHOOLS[BOONS[b.id].school].name}）`);
    text(ctx, r.mode === 'pull' ? 'どの楔を抜く？（その対象は次の夜、元に戻る）' : 'どの強化に楔を打つ？（次の夜、持ったまま始まる）', VIEW_W / 2, by - 4, { size: 13, align: 'center', color: C.gold });
    list.forEach((l, i) => text(ctx, (i === r.sub ? '▶ ' : '') + l, VIEW_W / 2, by + 22 + i * 22, { size: 14, align: 'center', color: i === r.sub ? C.gold : '#ccc' }));
    text(ctx, 'Z 決定　C 戻る', VIEW_W / 2, VIEW_H - 16, { size: 11, align: 'center', color: C.muted });
  }
  if (game.modal && game.modal.type === 'journal') { ctx.fillStyle = 'rgba(5,4,8,0.7)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); drawJournal(ctx, game, game.modal); }
}

// ───────── 結末 ─────────
import { ENDING_PAGES } from './game.js';
export function drawEnding(ctx, game) {
  const e = game.ending;
  const k = clamp(e.page / (ENDING_PAGES.length - 1), 0, 1);
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, `rgb(${30 + k * 200},${20 + k * 140},${40 + k * 60})`);
  g.addColorStop(1, `rgb(${10 + k * 90},${8 + k * 50},${14 + k * 20})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const page = ENDING_PAGES[Math.min(e.page, ENDING_PAGES.length - 1)];
  const a = clamp(e.t / 0.8, 0, 1);
  ctx.globalAlpha = a;
  page.forEach((l, i) => text(ctx, l, VIEW_W / 2, VIEW_H / 2 - 10 + i * 34, { size: i === 0 && e.page === ENDING_PAGES.length - 1 ? 36 : 20, align: 'center', font: SERIF, color: '#fff6e0' }));
  if (e.page === ENDING_PAGES.length - 1) {
    const m = game.meta;
    text(ctx, `${m.loop} 夜／倒れた回数 ${m.stats.deaths}／偽りの勝利 ${m.stats.falseWins}`, VIEW_W / 2, VIEW_H / 2 + 90, { size: 12, align: 'center', color: '#fff6e0' });
  }
  ctx.globalAlpha = 1;
  if (e.t > 0.8) text(ctx, 'Z', VIEW_W - 24, VIEW_H - 18, { size: 11, align: 'right', color: 'rgba(255,255,255,0.5)' });
}
export { GLEN_DEADLINE, hasWedge };
