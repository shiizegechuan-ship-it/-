// HUD・メニュー・巻き戻り画面。装飾より可読性を優先する。
import { VIEW_W, VIEW_H, COLORS as C, PLAYER as PC } from './config.js';
import { clamp } from './util.js';
import { COMPANIONS, stageOf, allComps, unionReady } from './companion.js';
import { BOONS, forgeDiff, SCHOOLS, RESONANCE, synergyHints, schoolCounts } from './boons.js';
import { ACTIVE_ARTS } from './arts.js';
import { ARTIFACTS, ARTIFACT_COLOR } from './artifacts.js';
import { KNOWLEDGE, WEDGE_TARGETS, COUNTERS, fmtClock, wedgeLabel, openQuestions, bossCounter, GLEN_DEADLINE, hasWedge, UPGRADES, upLv, inheritCount, enemyScale, DAWN_STEPS, dawnProgress } from './meta.js';
import { FLOOR_NAMES } from './world.js';
import { expToNext, LEVEL } from './level.js';
import { LB, lbStart, rewindGrid } from './layout.js';
export { LB, lbRowAt, rewindGrid } from './layout.js';

// ドット文字（DotGothic16）。読み込めない環境では OS の日本語フォントで表示される
export const FONT = `'DotGothic16', 'Hiragino Sans', 'Yu Gothic', 'IPAGothic', sans-serif`;
const SERIF = FONT;

function text(ctx, str, x, y, { size = 14, color = C.text, align = 'left', bold = false, font = FONT, shadow = true } = {}) {
  // ドット文字は太字にしない（にじむため）。影は 2px の硬い影
  ctx.font = `${Math.round(size)}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  x = Math.round(x); y = Math.round(y);
  if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(str, x + 2, y + 2); }
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
  // ドット絵風の枠：外側の黒ふち＋2px の線
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  ctx.fillStyle = '#05040a'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = border;
  ctx.fillRect(x, y, w, 2); ctx.fillRect(x, y + h - 2, w, 2); ctx.fillRect(x, y, 2, h); ctx.fillRect(x + w - 2, y, 2, h);
}

// ───────── ライトボックス（選択画面の共通部品） ─────────
// 画面中央の大きな枠の中に、大きめの文字で一覧を出す。多いときは選んでいる行が見えるように送る。
export function drawLightbox(ctx, game, { title, right = '', items, sel, color = C.gold, hint, desc = '', st }) {
  ctx.fillStyle = 'rgba(4,3,8,0.82)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const { x, y, w, h } = LB;
  panel(ctx, x, y, w, h, color, 'rgba(14,11,20,0.97)');
  ctx.fillStyle = color; ctx.fillRect(x, y, w, 4);
  text(ctx, title, x + 28, y + 44, { size: 22, color });
  if (right) text(ctx, right, x + w - 28, y + 44, { size: 16, align: 'right', color: '#cfc8bb' });
  const n = items.length, start = lbStart(n, sel, st);
  if (!n) text(ctx, '選べるものがない', x + 40, LB.top, { size: 18, color: C.muted });
  for (let k = 0; k < Math.min(LB.rows, n - start); k++) {
    const i = start + k, it = items[i], yy = LB.top + k * LB.rowH, on = i === sel;
    if (on) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 16, yy - 26, w - 32, LB.rowH - 4); ctx.fillStyle = color; ctx.fillRect(x + 16, yy - 26, 4, LB.rowH - 4); }
    text(ctx, (on ? '▶ ' : '　') + it.label, x + 34, yy, { size: 19, color: on ? '#ffffff' : (it.color || '#d8d0c4') });
    if (it.right) text(ctx, it.right, x + w - 34, yy, { size: 16, align: 'right', color: it.rightColor || C.muted });
  }
  // 上下にまだ項目があるときの印（右端）
  if (start > 0) text(ctx, '▲', x + w - 12, LB.top - 6, { size: 12, align: 'right', color });
  if (start + LB.rows < n) text(ctx, '▼', x + w - 12, LB.top + (LB.rows - 1) * LB.rowH, { size: 12, align: 'right', color });
  // 選んでいる項目の説明
  const dy = LB.top + LB.rows * LB.rowH - 4;
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x + 16, dy, w - 32, 1);
  wrap(ctx, desc, w - 64, 16).slice(0, 2).forEach((l, i) => text(ctx, l, x + 32, dy + 26 + i * 22, { size: 16, color: '#cfe0ff' }));
  text(ctx, hint || (game.touch ? '項目をタップで選択、もう一度タップで決定／枠の外で戻る' : '↑↓ 選ぶ　Z 決定　C 戻る'), x + w / 2, y + h - 12, { size: 13, align: 'center', color: C.muted });
}

// ───────── HUD ─────────
export function drawHud(ctx, game) {
  const p = game.player, run = game.run, meta = game.meta;
  // HP
  const hpW = 200;
  panel(ctx, 14, 12, hpW + 16, 66, 'rgba(255,255,255,0.12)', 'rgba(10,8,14,0.6)');
  ctx.fillStyle = '#2a1a1e'; ctx.fillRect(22, 20, hpW, 12);
  const k = clamp(p.hp / p.maxHp, 0, 1);
  ctx.fillStyle = k < 0.3 ? '#ff5a3c' : '#e35d5d'; ctx.fillRect(22, 20, hpW * k, 12);
  text(ctx, `${Math.ceil(p.hp)} / ${p.maxHp}`, 22 + hpW - 4, 31, { size: 10, align: 'right', color: '#fff' });
  // 秒針ゲージ（時歪の消費量に目盛り）
  const art = p.stats.activeArt;
  const cost = art ? ACTIVE_ARTS[art.id].cost(art.tier || 1) : PC.skillCost * p.stats.skillCostMul;
  ctx.fillStyle = '#16202c'; ctx.fillRect(22, 38, hpW, 8);
  ctx.fillStyle = p.gauge >= cost ? '#5aa9e6' : '#3a6a90'; ctx.fillRect(22, 38, hpW * (p.gauge / PC.gaugeMax), 8);
  for (let c = cost; c < PC.gaugeMax; c += cost) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(22 + hpW * (c / PC.gaugeMax), 37, 1, 10); }
  text(ctx, `${art ? BOONS[art.id].name : '時歪'}${p.gauge >= cost ? ' V' : ''}`, 22 + hpW + 4, 47, { size: 10, color: p.gauge >= cost ? (art ? '#ff8ae0' : '#9fd0ff') : C.muted });
  // 仲間技：3 匹そろって全員が最後の姿なら印が出る。ゲージ満タンで光る
  if (unionReady(game)) {
    const full = p.gauge >= PC.gaugeMax && !game.union;
    const pulse = full ? 0.6 + 0.4 * Math.sin(game.time * 8) : 1;
    ctx.globalAlpha = pulse;
    text(ctx, full ? '仲間技 V！' : '仲間技（満タンで）', 22 + hpW + 74, 47, { size: 10, bold: full, color: full ? '#ffe6a0' : C.muted });
    ctx.globalAlpha = 1;
  }
  if (p.dodgeCd > 0) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(22, 50, hpW * clamp(1 - p.dodgeCd / 0.8, 0, 1), 2); }
  // レベルと経験値
  const lv = run.level || 1, need = expToNext(lv);
  const ep = game.hudPop ? game.hudPop.exp : 0;
  text(ctx, `Lv ${lv}`, 22, 70, { size: 13, color: ep > 0 ? '#e8ffd0' : '#a8f07a' });
  if (ep > 0) { ctx.fillStyle = `rgba(200,255,160,${0.5 * ep})`; ctx.fillRect(64, 58, hpW - 40, 11); }
  ctx.fillStyle = '#1c2616'; ctx.fillRect(66, 60, hpW - 44, 7);
  ctx.fillStyle = '#7fd85a'; ctx.fillRect(66, 60, (hpW - 44) * clamp((run.exp || 0) / need, 0, 1), 7);
  const toRare = LEVEL.rareEvery - (lv % LEVEL.rareEvery);
  text(ctx, `稀少まで あと${toRare}`, 22 + hpW + 4, 69, { size: 10, color: '#ffd84a' });
  const threat = game.threatStep ? game.threatStep() : 0;

  // 中央：夜の時刻・階層・部屋の進み
  const fi = run.fi;
  text(ctx, `夜 ${fmtClock(run.clock)}`, VIEW_W / 2, 26, { size: 15, align: 'center', bold: true, color: '#efe6d2' });
  text(ctx, `${run.diff ? run.diff.name + '　' : ''}第${meta.loop}夜　${FLOOR_NAMES[fi]}　深さLv${run.scale ? run.scale.level : 0}` + (threat ? `　脅威${threat}` : ''), VIEW_W / 2, 42, { size: 11, align: 'center', color: threat ? '#ff9a7a' : C.muted });
  const rooms = run.plan.floors[fi];
  const dotW = 14, sx = VIEW_W / 2 - (rooms.length * dotW) / 2 + dotW / 2;
  rooms.forEach((r, i) => {
    const causal = ['forge', 'archive', 'study', 'entry'].includes(r.type);
    ctx.fillStyle = i === run.ri ? '#fff' : i < run.ri ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)';
    if (causal) ctx.fillStyle = i === run.ri ? C.gold : i < run.ri ? C.goldDim : 'rgba(242,193,78,0.35)';
    if (r.type === 'boss') ctx.fillStyle = i === run.ri ? '#ff8a6a' : 'rgba(227,93,93,0.5)';
    if (r.type === 'shop') ctx.fillStyle = i === run.ri ? '#ffd84a' : 'rgba(255,216,74,0.45)';
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
    text(ctx, (def.fusion ? '★' : '') + def.name + (def.max ? ` ${b.tier}` : b.tier > 1 ? ' II' : ''), x + 14, y, { size: 11, color: wedged ? C.gold : def.fusion ? '#ffd84a' : '#ddd' });
  });
  const res = Object.entries(counts).filter(([s, n]) => RESONANCE[s] && n >= 2).map(([s]) => SCHOOLS[s].name);
  if (res.length) text(ctx, `共鳴：${res.join('・')}`, 18, VIEW_H - 22 - (Math.ceil(p.boons.length / 8)) * 20, { size: 10, color: '#f2c14e' });

  // 夜の様相の一言（夜のはじめに数秒）
  const nn = game.nightNote;
  if (nn && nn.t > 2.4 && nn.t < 8) { ctx.globalAlpha = clamp(Math.min(nn.t - 2.4, 8 - nn.t) / 0.6, 0, 1); text(ctx, nn.text, VIEW_W / 2, 150, { size: 15, align: 'center', color: '#e8c8b0' }); ctx.globalAlpha = 1; }
  // 時の欠片
  text(ctx, `◆ 欠片 ${meta.shards + (run.shards || 0)}`, 22, 98, { size: 12, color: '#9fd0ff' });
  if (run.killStacks > 0) text(ctx, `血の秒針 +${Math.round(run.killStacks * 100)}%`, 120, 98, { size: 11, color: '#ff9a3c' });
  // 金貨・鍵（その夜だけ）・アーティファクト（持ち越し）
  const gp = game.hudPop ? game.hudPop.gold : 0;
  text(ctx, `● 金貨 ${run.gold || 0}` + (run.keys ? `　黄金の鍵 ×${run.keys}` : ''), 22, 116, { size: 12 + Math.round(gp * 4), color: gp > 0 ? '#fff6c0' : '#ffd84a' });
  // お供（段階は ★ の数）
  const comps = allComps(game);
  comps.forEach((comp, i) => { const d = COMPANIONS[comp.id]; text(ctx, `✦ ${d.forms[comp.stage - 1]}　${'★'.repeat(comp.stage)}${'☆'.repeat(3 - comp.stage)}` + (comp.stage < 3 ? `（Lv${[0, 5, 10][comp.stage]}で進化）` : ''), 22, 134 + i * 15, { size: 11, color: d.color }); });
  // アーティファクト（持ち越すので多くなったら数だけ）
  const arts = p.artifacts || [], ay = 134 + Math.max(1, comps.length) * 15 + 3;
  if (arts.length > 4) text(ctx, `◆ アーティファクト ${arts.length} 個`, 22, ay, { size: 11, color: ARTIFACT_COLOR.normal });
  else arts.forEach((id, i) => { const a = ARTIFACTS[id]; text(ctx, '◆ ' + a.name, 22, ay + i * 15, { size: 11, color: ARTIFACT_COLOR[a.rarity] }); });
  // コンボ
  const cb = game.combo;
  if (cb && cb.n >= 2) {
    const pop = cb.pop || 0, xr = VIEW_W - 26;
    const big = Math.round(34 + pop * 14 + Math.min(16, cb.n / 6));
    const col = cb.n >= 50 ? '#ff4a2a' : cb.n >= 20 ? '#ff9a3c' : '#ffe14a';
    text(ctx, String(cb.n), xr - 52, 150, { size: big, align: 'right', color: col });
    text(ctx, 'HIT', xr, 150, { size: 18, align: 'right', color: col });
    text(ctx, `与ダメージ +${Math.round(cb.n * p.stats.comboPer * 100)}%`, xr, 172, { size: 12, align: 'right', color: '#ffd8a0' });
    const k = clamp(cb.t / (2.2 + 0.4 * upLv(meta, 'combo')), 0, 1);
    ctx.fillStyle = '#05040a'; ctx.fillRect(xr - 120, 180, 120, 6);
    ctx.fillStyle = col; ctx.fillRect(xr - 119, 181, Math.round(118 * k), 4);
  }
  // 鍛冶屋の危機
  if (game.room.desc.type === 'forge' && run.glen === 'attacked') {
    text(ctx, 'グレンを守れ ― 近づいて錆兵を引きつけろ', VIEW_W / 2, 78, { size: 13, align: 'center', color: '#ff8a6a', bold: true });
  }
  // 刻守のHP
  const b = game.room.boss;
  if (b) {
    const w = 520, x = VIEW_W / 2 - w / 2, y = VIEW_H - 40;
    text(ctx, b.finalForm ? '白き刻守 ― 第 2 形態' : b.trueDuel ? '刻守 ― 夜明けの決闘' : '刻守', x, y - 6, { size: 13, bold: true, color: b.trueDuel ? '#ffd38a' : '#efe6d2', font: SERIF });
    if (b.counter) {
      text(ctx, `対策：${COUNTERS[b.counter].name}`, x + w, y - 6, { size: 11, align: 'right', color: '#ff9a7a' });
      text(ctx, `崩し方：${COUNTERS[b.counter].weak}`, VIEW_W / 2, y + 26, { size: 11, align: 'center', color: '#c9b0a0' });
      if (b.counter === 'combo') {
        const sw = 120, sx = x + w - sw;
        ctx.fillStyle = '#05040a'; ctx.fillRect(sx - 1, y - 30, sw + 2, 6);
        ctx.fillStyle = b.shell > 0 ? '#c9a052' : '#3a3242'; ctx.fillRect(sx, y - 29, Math.round(sw * Math.max(0, b.shell) / (b.shellMax || 1)), 4);
        text(ctx, b.shell > 0 ? '外殻' : `外殻なし ${Math.ceil(b.shellDown)}秒`, sx - 6, y - 23, { size: 10, align: 'right', color: '#c9a052' });
      }
    }
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
  if (m.type === 'companion') drawCompanionPick(ctx, game, m);
  if (m.type === 'shop') drawShop(ctx, game, m);
  if (m.type === 'artifact') drawArtifactPick(ctx, game, m);
  if (m.type === 'fusion') drawFusion(ctx, game, m);
  if (m.type === 'code') drawCode(ctx, game, m);
  if (m.type === 'pause') drawPause(ctx, game, m);
  if (m.type === 'analysis') drawAnalysis(ctx, game, m);
  if (m.type === 'journal') drawJournal(ctx, game, m);
}

function drawDialog(ctx, game, m) {
  const line = m.lines[m.idx];
  const x = 120, w = VIEW_W - 240, y = VIEW_H - 170;
  const last = m.idx >= m.lines.length - 1;
  const choices = last && m.choices ? m.choices : [];
  const CH = 28; // 選択肢の行の高さ
  const h = 110 + choices.length * CH;
  panel(ctx, x, y - choices.length * CH, w, h, 'rgba(242,193,78,0.35)');
  const top = y - choices.length * CH;
  if (line.who) text(ctx, line.who, x + 18, top + 26, { size: 13, bold: true, color: C.gold });
  const shown = Math.floor(clamp(m.t * 60, 0, 999)); // 文字送り
  const lines = wrap(ctx, line.text, w - 36, 16, SERIF);
  let used = 0;
  lines.forEach((l, i) => { const s = l.slice(0, Math.max(0, shown - used)); used += l.length; text(ctx, s, x + 18, top + 52 + i * 22, { size: 16, font: SERIF }); });
  if (line.note) text(ctx, '◆ ' + line.note, x + 18, top + 52 + lines.length * 22 + 4, { size: 11, color: '#7fb8ff' });
  choices.forEach((c, i) => {
    const cy = top + h - (choices.length - i) * CH - 8;
    if (i === m.sel) { ctx.fillStyle = 'rgba(242,193,78,0.15)'; ctx.fillRect(x + 12, cy - 20, w - 24, CH - 2); }
    text(ctx, (i === m.sel ? '▶ ' : '　') + c.label, x + 22, cy, { size: 16, color: i === m.sel ? C.gold : '#ddd' });
  });
  if (!choices.length) text(ctx, game.touch ? (last ? 'タップで閉じる' : 'タップで次へ') : (last ? 'Z：閉じる' : 'Z：次へ'), x + w - 14, top + h - 10, { size: 10, align: 'right', color: C.muted });
}

function drawBoonPick(ctx, game, m) {
  const p = game.player;
  text(ctx, m.rare ? `レベル ${game.run.level} ― 稀少の強化を選ぶ` : m.school ? '書庫の祭壇 ―「停滞」の強化' : '強化を選ぶ', VIEW_W / 2, 92, { size: 22, align: 'center', bold: true, font: SERIF, color: C.gold });
  if (m.count > 1) text(ctx, `あと ${m.count} つ`, VIEW_W / 2, 114, { size: 12, align: 'center', color: C.muted });
  const cw = m.offer.length > 3 ? 214 : 250, ch = 240, gap = 18;
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
    const own = p.boons.find((b) => b.id === id);
    const nt = own ? own.tier + 1 : 1;
    text(ctx, def.name, x + 16, y + 56, { size: 20, bold: true, font: SERIF });
    if (def.max) text(ctx, own ? `Lv${own.tier} → ${nt}` : 'Lv1', x + cw - 16, y + 28, { size: 13, align: 'right', color: own ? '#ffe14a' : C.muted });
    const curArt = def.active && !own ? p.boons.find((b) => BOONS[b.id].active) : null;
    if (curArt) text(ctx, `持ち替え：${BOONS[curArt.id].name} を外す`, x + 16, y + ch - 32, { size: 11, color: '#ff8ae0' });
    wrap(ctx, own ? (forgeDiff(id, own.tier).diff || def.desc(nt)) : def.desc(nt), cw - 28, 15).forEach((l, j) => text(ctx, l, x + 14, y + 86 + j * 21, { size: 15, color: def.school === 'risk' ? '#ffb0a0' : '#e8e0d0' }));
    const hints = synergyHints(id, p.boons);
    let hy = y + 180;
    for (const h of hints) { wrap(ctx, h, cw - 32, 11).forEach((l) => { text(ctx, l, x + 16, hy, { size: 11, color: '#f2c14e' }); hy += 15; }); }
    if (!hints.length && RESONANCE[def.school] && !schoolCounts(p.boons)[def.school]) text(ctx, `同じ系統をもう1つで共鳴：${RESONANCE[def.school]}`, x + 16, y + ch - 16, { size: 9, color: C.muted });
    ctx.globalAlpha = 1;
  });
  text(ctx, game.touch ? 'カードをタップで選択、もう一度タップで決定' : '← → 選ぶ　Z 決定', VIEW_W / 2, 412, { size: 12, align: 'center', color: C.muted });
  // 現在の手持ち
  if (p.boons.length) text(ctx, '手持ち：' + p.boons.map((b) => BOONS[b.id].name + (BOONS[b.id].max ? ` Lv${b.tier}` : b.tier > 1 ? 'II' : '')).join('・'), VIEW_W / 2, 440, { size: 11, align: 'center', color: '#bbb' });
}

function drawShop(ctx, game, m) {
  const items = m.stock.map((s) => { const l = game.shopLabel(s); const can = !s.sold && game.run.gold >= s.price; return { label: l.name, color: s.sold ? '#5a5260' : s.tier === 'legend' ? '#ff7ae0' : s.tier === 'rare' ? '#ffd84a' : s.kind === 'key' ? '#ffd84a' : s.kind === 'artifact' ? '#7fe0d0' : '#d8d0c4', right: s.sold ? '売り切れ' : `${s.price} G`, rightColor: s.sold ? '#5a5260' : can ? '#ffd84a' : '#8a6a7a', desc: l.desc }; });
  drawLightbox(ctx, game, { title: '行商人の店', right: `● 金貨 ${game.run.gold}`, items, sel: m.sel, color: '#ffd84a', st: m, desc: items[m.sel] ? items[m.sel].desc : '', hint: game.touch ? 'タップで選択、もう一度タップで買う／枠の外で閉じる' : '↑↓ 選ぶ　Z 買う　C 閉じる' });
}

// 合成：素材 A ＋ 素材 B → 上位の強化
function drawFusion(ctx, game, m) {
  const { a, b, to } = m.recipe, p = game.player;
  const lv = (id) => (p.boons.find((x) => x.id === id) || {}).tier || 1;
  const k = clamp(m.t / 0.5, 0, 1);
  text(ctx, '合成できる！', VIEW_W / 2, 74, { size: 26, align: 'center', color: '#ffd84a' });
  text(ctx, '素材の 2 つは消え、上位の強化を Lv1 で得る（Lv1 でも素材より強い。さらに Lv5 まで伸びる）', VIEW_W / 2, 100, { size: 13, align: 'center', color: C.muted });
  const card = (id, x, y, w, h, tier, big) => {
    const d = BOONS[id], col = SCHOOLS[d.school].color;
    panel(ctx, x, y, w, h, big ? '#ffd84a' : col, 'rgba(18,14,26,0.97)');
    ctx.fillStyle = big ? '#ffd84a' : col; ctx.fillRect(x, y, w, 4);
    text(ctx, (big ? '★ ' : '') + d.name, x + 14, y + 32, { size: big ? 22 : 17, color: big ? '#ffe9a0' : '#efe6d2' });
    text(ctx, `Lv${tier}`, x + w - 14, y + 32, { size: 14, align: 'right', color: big ? '#ffd84a' : '#ffe14a' });
    wrap(ctx, d.desc(tier), w - 26, big ? 15 : 12).slice(0, 5).forEach((l, i) => text(ctx, l, x + 13, y + 58 + i * (big ? 21 : 17), { size: big ? 15 : 12, color: '#e0d8c8' }));
  };
  card(a, 50, 130, 220, 150, lv(a));
  text(ctx, '+', 285, 216, { size: 34, align: 'center', color: '#ffd84a' });
  card(b, 50 + 250, 130, 220, 150, lv(b));
  ctx.globalAlpha = k;
  text(ctx, '→', 50 + 480 + 8, 210, { size: 30, color: '#ffd84a' });
  card(to, 50 + 520, 116, 340, 180, 1, true);
  ctx.globalAlpha = 1;
  const opts = ['合成する', '今はしない'];
  opts.forEach((o, i) => {
    const x = i === 0 ? VIEW_W / 2 - 230 : VIEW_W / 2 + 30, on = m.sel === i;
    panel(ctx, x, 400, 200, 44, on ? '#ffd84a' : 'rgba(255,255,255,0.2)', on ? 'rgba(60,44,10,0.95)' : 'rgba(14,11,20,0.95)');
    text(ctx, (on ? '▶ ' : '') + o, x + 100, 429, { size: 18, align: 'center', color: on ? '#ffe9a0' : '#bbb' });
  });
  text(ctx, game.touch ? 'ボタンをタップで選択、もう一度タップで決定' : '← → 選ぶ　Z 決定　C 今はしない', VIEW_W / 2, 470, { size: 12, align: 'center', color: C.muted });
}

// アーティファクトの選択（カード）
function drawArtifactPick(ctx, game, m) {
  const gold = m.rarity === 'gold';
  text(ctx, gold ? '黄金の宝箱 ― アーティファクトを 1 つ選ぶ' : 'アーティファクトを 1 つ選ぶ', VIEW_W / 2, 92, { size: 22, align: 'center', color: gold ? '#ffd84a' : '#7fe0d0' });
  text(ctx, 'アーティファクトは夜が戻っても失われない', VIEW_W / 2, 114, { size: 12, align: 'center', color: C.muted });
  const cw = 250, ch = 240, gap = 18, total = m.offer.length * cw + (m.offer.length - 1) * gap;
  m.offer.forEach((id, i) => {
    const a = ARTIFACTS[id], col = ARTIFACT_COLOR[a.rarity];
    const appear = clamp((m.t - i * 0.07) / 0.2, 0, 1);
    if (appear <= 0) return;
    ctx.globalAlpha = appear;
    const sel = i === m.sel;
    const x = VIEW_W / 2 - total / 2 + i * (cw + gap), y = 140 - (sel ? 8 : 0) + (1 - appear) * 24;
    panel(ctx, x, y, cw, ch, sel ? col : 'rgba(255,255,255,0.15)', sel ? 'rgba(24,18,32,0.98)' : 'rgba(14,11,20,0.95)');
    ctx.fillStyle = col; ctx.fillRect(x, y, cw, 5);
    text(ctx, gold ? '黄金のアーティファクト' : 'アーティファクト', x + 16, y + 28, { size: 11, color: col });
    text(ctx, a.name, x + 16, y + 58, { size: 20 });
    wrap(ctx, a.desc, cw - 28, 15).forEach((l, j) => text(ctx, l, x + 14, y + 90 + j * 21, { size: 15, color: '#e8e0d0' }));
    ctx.globalAlpha = 1;
  });
  text(ctx, game.touch ? 'カードをタップで選択、もう一度タップで決定' : '← → 選ぶ　Z 決定', VIEW_W / 2, 412, { size: 12, align: 'center', color: C.muted });
}

function drawCompanionPick(ctx, game, m) {
  const items = m.list.map((id) => { const d = COMPANIONS[id]; return { label: `${d.name}（${d.forms.join(' → ')}）`, right: id === game.meta.companion ? '連れている' : '', rightColor: d.color, color: d.color, desc: d.desc + ' 技：' + d.skills.map((s) => s.names.filter(Boolean).join('→')).join('／') + '。手助け：' + d.buff.name }; });
  drawLightbox(ctx, game, { title: 'お供を選ぶ ― Lv5・Lv10 で進化する', items, sel: m.sel, color: '#7fe0b0', st: m, desc: items[m.sel] ? items[m.sel].desc : '' });
}

function drawForge(ctx, game, m) {
  // 鍛えると何がどう変わるかを、選ぶ前に数字で見せる（例：35%→50%）
  const items = m.list.map((b) => { const d = BOONS[b.id], nt = (b.tier || 1) + 1, f = forgeDiff(b.id, b.tier || 1); return { label: d.name, right: d.max ? `Lv${b.tier} → ${nt}` : '→ II', rightColor: '#ffe14a', desc: f.diff ? '鍛えると：' + f.diff : `今：${f.now}／鍛えると：${f.next}` }; });
  drawLightbox(ctx, game, { title: 'グレンの鍛冶 ― どれを鍛える？', items, sel: m.sel, color: C.gold, st: m, desc: items[m.sel] ? items[m.sel].desc : '' });
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
  text(ctx, game.touch ? '数字の上半分で＋・下半分で−／この帯をタップで決定' : '←→ 桁　↑↓ 数字　Z 決定　C 戻る', VIEW_W / 2, y + 204, { size: 10, align: 'center', color: C.muted });
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
  drawDawnStrip(ctx, game, y + h + 30);
  if (!game.touch) text(ctx, '移動 ←→　ジャンプ Z　攻撃 X（長押しで重撃・↑↓＋Xで上下）　回避 C　術 V（ゲージ消費／術がなければ時歪）　調べる Z/↑/E（調べられる物の前）', VIEW_W / 2, VIEW_H - 30, { size: 11, align: 'center', color: C.muted });
}

const TABS = ['人物', '謎', '敵', '夜明け'];
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
    if (m.tab === 0) {
      // 登場人物：誰が誰とどういう関係か（知ったぶんだけ詳しくなる）
      const k = (key) => !!meta.knowledge[key];
      const cast = [
        ['あなた', '刻守の弟子。師に習った「時の楔」で、夜をまたいで覚えていられる唯一の人。'],
        ['刻守', '時計塔の主で、あなたの師。禁忌の鐘で夜を戻し続け、そのたびに自分の命を削っている。' + (k('master_reason') ? '娘を見送る朝を恐れている。' : '')],
        k('lira_father') ? ['リラ', '師の娘。朝の汽車で遠くの療養所へ発つ。'] : k('lira_name') ? ['リラ', '市場の少女。師が名を呼んだ。'] : ['市場の少女', '朝を待ちながら、父の見送りを気にしている。'],
        ['グレン', '鍛冶屋。師の古い友で、塔の歯車を共に作った。' + (k('glen_time') || k('glen_saved') ? '夜の途中で時計人形に襲われる。' : '')],
      ];
      for (const [nm, d] of cast) { if (yy > maxY) break; text(ctx, nm, x + 28, yy, { size: 13, color: C.gold }); for (const l of wrap(ctx, d, w - 150, 12)) { text(ctx, l, x + 120, yy, { size: 12, color: '#cfc8bb' }); yy += 16; } yy += 4; }
      yy += 8;
    }
    if (!entries.length) { text(ctx, 'まだ何も知らない。', x + 28, yy, { size: 13, color: C.muted }); yy += 24; }
    for (const [k, v] of entries) draw(v.title, v.text(meta), meta.knowledge[k] === meta.loop && game.scene === 'play', cat === '敵' ? '#ffb0a0' : '#efe6d2');
    if (m.tab === 0) {
      // 楔の状態もここで確認できる
      yy += 6;
      text(ctx, `楔（${meta.wedges.length}/${meta.slots}）`, x + 28, yy, { size: 13, bold: true, color: C.gold }); yy += 18;
      for (const wd of meta.wedges) { text(ctx, `◆ ${wedgeLabel(wd)}：${wd.target === 'boon' ? WEDGE_TARGETS.boon.effect : WEDGE_TARGETS[wd.target].effect}`, x + 40, yy, { size: 12, color: '#d8b968' }); yy += 16; }
    }
  } else {
    const pr = dawnProgress(meta);
    text(ctx, `夜明けへの道　${pr.done} / ${pr.total}`, x + 28, yy, { size: 15, color: '#ffd38a' }); yy += 26;
    DAWN_STEPS.forEach((st, i) => {
      const ok = st.done(meta), isNext = pr.next === st;
      text(ctx, `${ok ? '■' : '□'} ${i + 1}. ${st.title}`, x + 36, yy, { size: 14, color: ok ? '#9a8fa6' : isNext ? '#ffd38a' : '#efe6d2' });
      if (isNext) { yy += 18; text(ctx, `→ ${st.hint}`, x + 60, yy, { size: 12, color: '#9fd0ff' }); }
      yy += 22;
    });
    const c = bossCounter(meta.lastLoop);
    if (c) draw('刻守の記憶', `前の夜の戦い方を覚えている：${COUNTERS[c].name}――${COUNTERS[c].desc}`, false, '#ff9a7a');
  }
  text(ctx, game.touch ? 'タブをタップ／枠の外をタップで閉じる' : '←→ タブ　Tab/Esc 閉じる', x + w - 20, y + h - 14, { size: 10, align: 'right', color: C.muted });
}

// ───────── タイトル ─────────
export function drawTitle(ctx, game) {
  const t = game.time;
  // 背景（星空の時計塔）は render.js がドット絵で描く
  text(ctx, '夜明けの楔', VIEW_W / 2, 352, { size: 56, align: 'center', bold: true, font: SERIF, color: '#f3e7cf' });
  text(ctx, 'WEDGE OF DAWN', VIEW_W / 2, 378, { size: 12, align: 'center', color: C.gold });
  if (game.titleConfirm) {
    panel(ctx, VIEW_W / 2 - 200, 390, 400, 80, '#e35d5d');
    text(ctx, '記録をすべて消して、はじめから遊びますか？', VIEW_W / 2, 422, { size: 14, align: 'center' });
    text(ctx, 'Z：消してはじめる　C：やめる', VIEW_W / 2, 450, { size: 12, align: 'center', color: C.muted });
    return;
  }
  const opts = game.titleOptions();
  opts.forEach((o, i) => text(ctx, (i === game.titleSel ? '▶ ' : '') + o.label, VIEW_W / 2, 400 + i * 26, { size: 16, align: 'center', color: i === game.titleSel ? (o.id === 'diff' ? game.difficulty().color : C.gold) : o.id === 'diff' ? game.difficulty().color : '#bbb' }));
  text(ctx, game.touch ? 'タップで選ぶ' : '↑↓ 選ぶ　Z/Enter 決定　｜　移動 ←→　ジャンプ Z　攻撃 X　回避 C　術 V　調べる ↑', VIEW_W / 2, VIEW_H - 18, { size: 11, align: 'center', color: C.muted });
  if (game.meta && game.meta.flags.ending) text(ctx, '★ クリア済み ― 夜明けを迎えた', VIEW_W / 2, 506, { size: 12, align: 'center', color: '#ffd38a' });
  else if (game.meta) drawDawnStrip(ctx, game, 506);
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
  text(ctx, causeText + `　（第 ${rep.loop} 夜 → 第 ${meta.loop} 夜）`, VIEW_W / 2, 50, { size: 19, align: 'center', font: SERIF, color: rep.cause === 'bell' ? C.gold : '#efe6d2' });
  // 夜ごとに変わる語り（時間の経過と、師の変化）
  if (rep.story) { ctx.globalAlpha = clamp(t / 0.8, 0, 1); text(ctx, rep.story, VIEW_W / 2, 80, { size: 14, align: 'center', font: SERIF, color: '#d9c7a8' }); ctx.globalAlpha = 1; }
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
  if (t < 3.2) { text(ctx, game.touch ? 'タップでとばす' : 'Z：とばす', VIEW_W - 20, VIEW_H - 16, { size: 10, align: 'right', color: C.muted }); return; }
  // 選択肢（2 列のボタン）
  if (r.mode === 'view') {
    const opts = game.rewindOptions();
    const g = rewindGrid(opts.length);
    panel(ctx, g.x - 12, g.y - 30, g.cw * 2 + g.gap + 24, g.rowH * Math.ceil(opts.length / 2) + 22, 'rgba(242,193,78,0.35)', 'rgba(12,9,18,0.94)');
    opts.forEach((o, i) => {
      const bx = g.x + (i % 2) * (g.cw + g.gap), byy = g.y + Math.floor(i / 2) * g.rowH, on = i === r.sel;
      if (on) { ctx.fillStyle = 'rgba(242,193,78,0.16)'; ctx.fillRect(bx - 6, byy - 24, g.cw, g.rowH - 6); }
      text(ctx, (on ? '▶ ' : '　') + o.label, bx, byy, { size: 17, color: on ? C.gold : '#d8d0c4' });
    });
    text(ctx, `楔 ${meta.wedges.length}/${meta.slots}`, VIEW_W - 24, VIEW_H - 12, { size: 12, align: 'right', color: C.gold });
    drawDawnStrip(ctx, game, VIEW_H - 12, 'left');
  } else if (r.mode === 'pull' || r.mode === 'wedgeBoon') {
    const pull = r.mode === 'pull';
    const items = pull
      ? meta.wedges.map((w) => ({ label: wedgeLabel(w), desc: w.target === 'boon' ? WEDGE_TARGETS.boon.effect : WEDGE_TARGETS[w.target].effect }))
      : game.wedgeableBoons().map((b) => { const d = BOONS[b.id]; return { label: d.name + (d.max ? ` Lv${b.tier}` : b.tier > 1 ? ' II' : ''), right: SCHOOLS[d.school].name, rightColor: SCHOOLS[d.school].color, desc: d.desc(b.tier || 1) }; });
    drawLightbox(ctx, game, {
      title: pull ? '楔を抜く ― 抜いた対象は次の夜、元に戻る' : '強化に楔を打つ ― 次の夜も持ったまま始まる',
      right: `楔 ${meta.wedges.length}/${meta.slots}`,
      items, sel: r.sub, color: C.gold, desc: items[r.sub] ? items[r.sub].desc : '', st: r,
    });
  }
  if (r.mode === 'upgrade' || r.mode === 'inherit') drawRewindShop(ctx, game, r);
  // 巻き戻り画面の上に開いた窓（記録帳・お供を選ぶ）も描く
  if (game.modal) { ctx.fillStyle = 'rgba(5,4,8,0.7)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); if (game.modal.type === 'journal') drawJournal(ctx, game, game.modal); else drawModal(ctx, game); }
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

// 刻印（恒久強化）と継承の選択画面
function drawRewindShop(ctx, game, r) {
  const m = game.meta;
  if (r.mode === 'upgrade') {
    const items = Object.entries(UPGRADES).map(([k, u]) => {
      const lv = upLv(m, k), maxed = lv >= u.max, c = maxed ? 0 : u.cost(lv);
      return { label: `${u.name}　Lv${lv}/${u.max}`, right: maxed ? '最大' : `欠片 ${c}`, rightColor: maxed ? C.muted : m.shards >= c ? '#9fd0ff' : '#8a6a7a', desc: maxed ? u.desc(lv) : `いま：${lv ? u.desc(lv) : 'なし'}　→　次：${u.desc(lv + 1)}` };
    });
    drawLightbox(ctx, game, { title: '刻印 ― 夜を越えて残る力', right: `時の欠片 ${m.shards}`, items, sel: r.sub, color: '#9fd0ff', desc: items[r.sub] ? items[r.sub].desc : '', st: r });
  } else {
    const list = game.inheritCandidates();
    const items = list.map((b) => {
      const def = BOONS[b.id], on = m.inherit.some((x2) => x2.id === b.id);
      return { label: (on ? '◆ ' : '◇ ') + def.name + (def.max ? ` Lv${b.tier}` : b.tier > 1 ? ' II' : ''), color: on ? C.gold : '#bbb', right: on ? '持ち越す' : SCHOOLS[def.school].name, rightColor: on ? C.gold : SCHOOLS[def.school].color, desc: def.desc(b.tier || 1) };
    });
    drawLightbox(ctx, game, { title: `継承 ― 次の夜に持ち越す強化`, right: `${m.inherit.length} / ${inheritCount(m)}`, items, sel: r.sub, color: C.gold, st: r, desc: items[r.sub] ? items[r.sub].desc : '', hint: game.touch ? 'タップで選択、もう一度タップで ◆持ち越す／◇外す　枠の外で戻る' : '↑↓ 選ぶ　Z ◆持ち越す／◇外す　C 戻る' });
  }
}

// 刻守の分析：前の夜のあなたの戦い方と、用意された対策
const HABIT_LABEL = { combo: '連撃', heavy: '重撃', air: '空中', skill: '術', echo: '残響' };
function drawAnalysis(ctx, game, m) {
  const x = 150, y = 60, w = VIEW_W - 300, h = 420;
  const k = clamp(m.t / 0.6, 0, 1);
  panel(ctx, x, y, w, h, '#ff9a7a');
  text(ctx, '刻守はあなたを見ていた', x + 24, y + 38, { size: 22, color: '#ff9a7a' });
  text(ctx, '前の夜の戦い方', x + 24, y + 70, { size: 13, color: C.muted });
  const a = m.a;
  Object.entries(HABIT_LABEL).forEach(([cat, label], i) => {
    const yy = y + 96 + i * 26, share = a ? a.shares[cat] : 0, top = cat === m.counter;
    text(ctx, label, x + 24, yy, { size: 14, color: top ? '#ffffff' : '#bbb' });
    ctx.fillStyle = '#1a1420'; ctx.fillRect(x + 90, yy - 12, 300, 12);
    ctx.fillStyle = top ? '#ff4a2a' : '#6a5a7a'; ctx.fillRect(x + 90, yy - 12, Math.round(300 * share * k), 12);
    text(ctx, `${Math.round(share * 100)}%`, x + 400, yy, { size: 13, color: top ? '#ff9a7a' : '#999' });
  });
  const dy = y + 96 + 5 * 26;
  text(ctx, `回避  毎分 ${a ? Math.round(a.dodgeRate) : 0} 回`, x + 24, dy, { size: 14, color: m.counter === 'dodge' ? '#ffffff' : '#bbb' });
  const c = COUNTERS[m.counter];
  if (k >= 1) {
    text(ctx, `対策：${c.name}`, x + 24, dy + 44, { size: 20, color: '#ff4a2a' });
    wrap(ctx, c.desc, w - 48, 14).forEach((l, i) => text(ctx, l, x + 24, dy + 70 + i * 20, { size: 14, color: '#efe6d2' }));
    wrap(ctx, '崩し方：' + c.weak, w - 48, 14).forEach((l, i) => text(ctx, l, x + 24, dy + 116 + i * 20, { size: 14, color: '#9fd0ff' }));
  }
  text(ctx, game.touch ? 'タップで続ける' : 'Z で続ける', x + w - 20, y + h - 14, { size: 11, align: 'right', color: C.muted });
}

// 夜明けへの道（進み具合と次にすること）を 1 行で
export function drawDawnStrip(ctx, game, y, align = 'center') {
  const m = game.meta; if (!m) return;
  const pr = dawnProgress(m);
  const x = align === 'center' ? VIEW_W / 2 : 24;
  if (!pr.next) { text(ctx, '夜明けを迎えた（クリア済み）', x, y, { size: 13, align, color: '#ffd38a' }); return; }
  text(ctx, `夜明けへの道 ${pr.done}/${pr.total}　次：${pr.next.title}`, x, y, { size: 13, align, color: '#ffd38a' });
}
