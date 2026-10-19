// HUD・メニュー・巻き戻り画面。装飾より可読性を優先する。
import { tr, FONT_STACK } from './i18n.js';
import { VIEW_W, VIEW_H, COLORS as C, PLAYER as PC, RELEASE } from './config.js';
import { clamp } from './util.js';
import { COMPANIONS, allComps, unionReady } from './companion.js';
import { BOONS, forgeDiff, SCHOOLS, RESONANCE, synergyHints, schoolCounts, fusionsFor } from './boons.js';
import { ACTIVE_ARTS } from './arts.js';
import { ARTIFACTS, ARTIFACT_COLOR } from './artifacts.js';
import { KNOWLEDGE, WEDGE_TARGETS, COUNTERS, fmtClock, wedgeLabel, bossCounter, GLEN_DEADLINE, hasWedge, UPGRADES, upLv, upMax, endlessName, hasPersistence, inheritLabel, DAWN_STEPS, dawnProgress, ENDING_IDS } from './meta.js';
import { ENDINGS } from './game.js';
import { FLOOR_NAMES } from './world.js';
import { expToNext, LEVEL } from './level.js';
import { LB, LB_CLOSE, lbStart, rewindGrid, cardRects, PAUSE, TITLE_MENU, TITLE_GEAR } from './layout.js';
export { LB, lbRowAt, rewindGrid } from './layout.js';

// ドット文字（DotGothic16）。読み込めない環境では OS の日本語フォントで表示される。中国語・韓国語は英数字だけドット文字（i18n.js）
export const FONT = FONT_STACK;
const SERIF = FONT;

// 文字の大きさの設定：normal（標準）・large（大）・xlarge（特大）。t は流れる文字の時計
export const TEXT = { mode: 'normal', t: 0 };
export const TEXT_MODES = ['normal', 'large', 'xlarge'];
export const TEXT_MODE_NAMES = { normal: tr('標準'), large: tr('大'), xlarge: tr('特大') };
export function setTextEnv(game) { TEXT.mode = (game.settings && game.settings.textSize) || 'normal'; TEXT.t = game.time || 0; }
// 実際に描く大きさ。標準でも、小さな文字ほど少し大きくする（収まる範囲で）。大・特大はさらに 1.2・1.4 倍
export function fontSize(size) {
  const base = size < 12 ? size + 2 : size < 15 ? size + 1 : size;
  return Math.round(base * (TEXT.mode === 'xlarge' ? 1.4 : TEXT.mode === 'large' ? 1.2 : 1));
}
// 流れる文字ごとの時計：その文字が出た時（しばらく描かれていなかった後）から数える。
// 画面全体の時計の周期の余りで決めると、文字が出た瞬間に周期の途中から始まり、速く飛んで見えるため
const SINCE = new Map();
function since(key) {
  const now = TEXT.t;
  let e = SINCE.get(key);
  if (!e || now - e.last > 0.25 || now < e.last) { e = { start: now, last: now }; SINCE.set(key, e); }
  e.last = now;
  if (SINCE.size > 400) for (const [k, v] of SINCE) if (now - v.last > 1) SINCE.delete(k);
  return now - e.start;
}
// その文字（key）の今の横送りの量
export const scrollOffset = (key, over) => marqueeOffset(over, since(key));
// 収まらない文字の横送り：はじめを 1 秒見せ、左へ一定の速さで流して終わりまで見せ、1 秒止まってから戻る（情報が欠けないように）
// t はその文字が出てからの時間
export function marqueeOffset(over, t) {
  const pause = 1, speed = 40, run = over / speed, period = pause * 2 + run;
  const k = t % period;
  return k < pause ? 0 : k < pause + run ? (k - pause) * speed : over;
}
// 行の間隔：文字の倍率に合わせて広げる（大・特大で行が重ならないように）
export const modeScale = () => (TEXT.mode === 'xlarge' ? 1.4 : TEXT.mode === 'large' ? 1.2 : 1);
export const lh = (n) => Math.round(n * modeScale());
// 縦に収まらない枠：中身を縦に流す（はじめを見せてから下まで流し、少し止まって戻る）。key ごとに前のフレームではみ出した量を覚える
const VSCROLL = {};
export function vOffset(over, t) {
  const pause = 1.5, speed = 22, run = over / speed, period = pause * 2 + run;
  const k = t % period;
  return k < pause ? 0 : k < pause + run ? (k - pause) * speed : over;
}
function vbegin(ctx, key, box) {
  ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
  // 流す量が決まってから（前のフレームで測った量）、その枠を流し始める。量が変わったら最初から
  const over = VSCROLL[key] || 0;
  return Math.round(vOffset(over, since(`v:${key}:${over}`)));
}
function vend(ctx, key, bottom, box) {
  ctx.restore();
  const over = Math.max(0, Math.ceil(bottom - (box.y + box.h)));
  VSCROLL[key] = over;
  if (over > 0) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; const ax = box.x + box.w - 14, ay = box.y + box.h - 8; ctx.fillRect(ax - 4, ay - 3, 9, 1); ctx.fillRect(ax - 3, ay - 2, 7, 1); ctx.fillRect(ax - 2, ay - 1, 5, 1); ctx.fillRect(ax - 1, ay, 3, 1); } // 続きがある印（▼）
}
function text(ctx, str, x, y, { size = 14, color = C.text, align = 'left', bold = false, font = FONT, shadow = true, maxW, fixed = false } = {}) {
  // ドット文字は太字にしない（にじむため）。影は 2px の硬い影。fixed：文字の大きさの設定で拡大しない（題字など）
  const fs = fixed ? Math.round(size) : fontSize(size);
  ctx.font = `${fs}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  x = Math.round(x); y = Math.round(y);
  // 使える幅：指定が無ければ、折り返しの幅か、画面の端まで
  const room = maxW ?? (str && str.maxW) ?? (align === 'left' ? VIEW_W - 6 - x : align === 'right' ? x - 6 : 2 * Math.min(x, VIEW_W - x) - 12);
  const w = ctx.measureText(str).width;
  if (w > room + 0.5 && room > 24) {
    const left = align === 'left' ? x : align === 'right' ? x - room : x - room / 2;
    const off = scrollOffset(`h:${str}:${Math.round(room)}`, w - room);
    ctx.save();
    ctx.beginPath(); ctx.rect(left - 1, y - fs * 1.15, room + 4, fs * 1.6); ctx.clip();
    ctx.textAlign = 'left';
    if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(str, left - off + 2, y + 2); }
    ctx.fillStyle = color; ctx.fillText(str, left - off, y);
    ctx.restore();
    return;
  }
  if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(str, x + 2, y + 2); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}
// 折り返し（日本語は文字単位）。標準の大きさでは描く大きさで折り返す。大・特大では行の数を変えず（枠からはみ出さないように）、
// 収まらない行は横に流す。行には使える幅（maxW）を持たせる
function wrap(ctx, str, maxW, size, font = FONT) {
  ctx.font = `${TEXT.mode === 'normal' ? fontSize(size) : size}px ${font}`;
  const lines = [];
  const tag = (s) => Object.assign(new String(s), { maxW });
  // 英語などは単語の途中で折らない（空白で区切った語をひとかたまりに。漢字・かな・ハングルは 1 文字ずつ）
  const tokens = (para) => para.match(/[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]|\s+|[^\s\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]+/g) || [];
  for (const para of String(str).split('\n')) {
    let cur = '';
    for (const tok of tokens(para)) {
      const fits = (t) => ctx.measureText(cur + t).width <= maxW;
      if (/^\s+$/.test(tok)) { if (!cur) continue; if (fits(tok)) cur += tok; else { lines.push(tag(cur)); cur = ''; } continue; } // 折り目の空白は捨てる
      if (fits(tok)) { cur += tok; continue; }
      if (cur.trim()) { lines.push(tag(cur.replace(/\s+$/, ''))); cur = ''; }
      if (fits(tok)) { cur = tok; continue; }
      // 1 語が幅より長いときだけ、文字で折る
      for (const ch of tok) {
        if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(tag(cur)); cur = ch; }
        else cur += ch;
      }
    }
    lines.push(tag(cur));
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
  if (!n) text(ctx, tr('選べるものがない'), x + 40, LB.top, { size: 18, color: C.muted });
  for (let k = 0; k < Math.min(LB.rows, n - start); k++) {
    const i = start + k, it = items[i], yy = LB.top + k * LB.rowH, on = i === sel;
    if (on) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 16, yy - 26, w - 32, LB.rowH - 4); ctx.fillStyle = color; ctx.fillRect(x + 16, yy - 26, 4, LB.rowH - 4); }
    // 伝説の強化：枠が虹色に光る（色が流れる）
    if (it.rainbow) {
      const t = (game.time || 0) * 120, rx = x + 16, ry = yy - 26, rw = w - 32, rh = LB.rowH - 4;
      const gr = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
      for (let k2 = 0; k2 <= 6; k2++) gr.addColorStop(k2 / 6, `hsl(${(t + k2 * 60) % 360},100%,65%)`);
      ctx.save(); ctx.strokeStyle = gr; ctx.lineWidth = 3; ctx.shadowColor = `hsl(${t % 360},100%,70%)`; ctx.shadowBlur = 10 + 4 * Math.sin((game.time || 0) * 6);
      ctx.strokeRect(rx + 1.5, ry + 1.5, rw - 3, rh - 3); ctx.restore();
    }
    text(ctx, (on ? '▶ ' : tr('　')) + it.label, x + 34, yy, { size: 19, color: it.rainbow ? `hsl(${((game.time || 0) * 120) % 360},100%,78%)` : on ? '#ffffff' : (it.color || '#d8d0c4') });
    if (it.right) text(ctx, it.right, x + w - 34, yy, { size: 16, align: 'right', color: it.rightColor || C.muted });
  }
  // 上下にまだ項目があるときの印（右端）
  if (start > 0) text(ctx, '▲', x + w - 12, LB.top - 6, { size: 12, align: 'right', color });
  if (start + LB.rows < n) text(ctx, '▼', x + w - 12, LB.top + (LB.rows - 1) * LB.rowH, { size: 12, align: 'right', color });
  // 選んでいる項目の説明
  const dy = LB.top + LB.rows * LB.rowH - 4;
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x + 16, dy, w - 32, 1);
  wrap(ctx, desc, w - 64, 16).slice(0, 2).forEach((l, i) => text(ctx, l, x + 32, dy + 26 + i * 22, { size: 16, color: '#cfe0ff' }));
  text(ctx, hint || (game.touch ? tr('項目をタップで選択、もう一度タップで決定／枠の外で戻る') : tr('↑↓ 選ぶ　Z 決定　C 戻る')), x + w / 2, y + h - 12, { size: 13, align: 'center', color: C.muted });
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
  text(ctx, `${art ? BOONS[art.id].name : tr('時歪')}${p.gauge >= cost ? ' V' : ''}`, 22 + hpW + 4, 47, { size: 10, color: p.gauge >= cost ? (art ? '#ff8ae0' : '#9fd0ff') : C.muted });
  // 仲間技：3 匹そろって全員が最後の姿なら印が出る。ゲージ満タンで光る
  if (unionReady(game)) {
    const full = p.gauge >= PC.gaugeMax && !game.union;
    const pulse = full ? 0.6 + 0.4 * Math.sin(game.time * 8) : 1;
    ctx.globalAlpha = pulse;
    text(ctx, full ? tr('仲間技 V！') : tr('仲間技（満タンで）'), 22 + hpW + 74, 47, { size: 10, bold: full, color: full ? '#ffe6a0' : C.muted });
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
  text(ctx, tr`稀少まで あと${toRare}`, 22 + hpW + 4, 69, { size: 10, color: '#ffd84a' });
  const threat = game.threatStep ? game.threatStep() : 0;

  // 中央：夜の時刻・階層・部屋の進み
  const fi = run.fi;
  text(ctx, tr`夜 ${fmtClock(run.clock)}`, VIEW_W / 2, 26, { size: 15, align: 'center', bold: true, color: '#efe6d2' });
  text(ctx, tr`${run.diff ? run.diff.name + tr('　') : ''}第${meta.loop}夜　${FLOOR_NAMES[fi]}　深さLv${run.scale ? run.scale.level : 0}` + (threat ? tr`　脅威${threat}` : ''), VIEW_W / 2, 42, { size: 11, align: 'center', color: threat ? '#ff9a7a' : C.muted });
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

  // 右上：楔の枠（上の段が人の楔、下の段が技の楔。打った楔は塗りつぶし）
  const bx = VIEW_W - 18;
  const wedgeRow = (label, used, slots, y, col) => {
    text(ctx, label, bx, y + 12, { size: 10, align: 'right', color: col, bold: true });
    const lw = Math.max(10, ctx.measureText(label).width); // 言語によって札の文字が長いので、その分だけ左へ
    for (let i = 0; i < slots; i++) {
      const x = bx - 12 - lw - i * 13;
      ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.lineTo(x + 1, y + 4); ctx.lineTo(x, y + 14); ctx.lineTo(x - 1, y + 4); ctx.closePath();
      if (i < used) { ctx.fillStyle = col; ctx.fill(); } else { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke(); }
    }
  };
  wedgeRow(tr('人'), meta.wedges.filter((w) => w.target !== 'boon').length, meta.personSlots || 2, 10, '#ffb070');
  wedgeRow(tr('技'), meta.wedges.filter((w) => w.target === 'boon').length, meta.slots, 28, C.gold);
  meta.wedges.forEach((w, i) => text(ctx, shortWedge(w), VIEW_W - 18, 58 + i * 13, { size: 10, align: 'right', color: w.target === 'boon' ? '#d8b968' : '#ffb070' }));

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
  if (res.length) text(ctx, tr`共鳴：${res.join(tr('・'))}`, 18, VIEW_H - 22 - (Math.ceil(p.boons.length / 8)) * 20, { size: 10, color: '#f2c14e' });

  // 夜の様相の一言（夜のはじめに数秒）
  const nn = game.nightNote;
  if (nn && nn.t > 2.4 && nn.t < 8) { ctx.globalAlpha = clamp(Math.min(nn.t - 2.4, 8 - nn.t) / 0.6, 0, 1); text(ctx, nn.text, VIEW_W / 2, 150, { size: 15, align: 'center', color: '#e8c8b0' }); ctx.globalAlpha = 1; }
  // 時の欠片
  text(ctx, tr`◆ 欠片 ${meta.shards + (run.shards || 0)}`, 22, 98, { size: 12, color: '#9fd0ff' });
  if (run.killStacks > 0) text(ctx, tr`血の秒針 +${Math.round(run.killStacks * 100)}%`, 120, 98, { size: 11, color: '#ff9a3c' });
  // 金貨・鍵（その夜だけ）・アーティファクト（持ち越し）
  const gp = game.hudPop ? game.hudPop.gold : 0;
  text(ctx, tr`● 金貨 ${run.gold || 0}` + (run.keys ? tr`　黄金の鍵 ×${run.keys}` : ''), 22, 116, { size: 12 + Math.round(gp * 4), color: gp > 0 ? '#fff6c0' : '#ffd84a' });
  // お供（段階は ★ の数）
  const comps = allComps(game);
  comps.forEach((comp, i) => { const d = COMPANIONS[comp.id]; text(ctx, tr`✦ ${d.forms[comp.stage - 1]}　${'★'.repeat(comp.stage)}${'☆'.repeat(3 - comp.stage)}` + (comp.stage < 3 ? tr`（Lv${[0, 5, 10][comp.stage]}で進化）` : ''), 22, 134 + i * 15, { size: 11, color: d.color }); });
  // アーティファクト（持ち越すので多くなったら数だけ）
  const arts = p.artifacts || [], ay = 134 + Math.max(1, comps.length) * 15 + 3;
  if (arts.length > 4) text(ctx, tr`◆ アーティファクト ${arts.length} 個`, 22, ay, { size: 11, color: ARTIFACT_COLOR.normal });
  else arts.forEach((id, i) => { const a = ARTIFACTS[id]; text(ctx, '◆ ' + a.name, 22, ay + i * 15, { size: 11, color: ARTIFACT_COLOR[a.rarity] }); });
  // コンボ
  const cb = game.combo;
  if (cb && cb.n >= 2) {
    const pop = cb.pop || 0, xr = VIEW_W - 26;
    const big = Math.round(34 + pop * 14 + Math.min(16, cb.n / 6));
    const col = cb.n >= 50 ? '#ff4a2a' : cb.n >= 20 ? '#ff9a3c' : '#ffe14a';
    text(ctx, String(cb.n), xr - 52, 150, { size: big, align: 'right', color: col });
    text(ctx, 'HIT', xr, 150, { size: 18, align: 'right', color: col });
    text(ctx, tr`与ダメージ +${Math.round(cb.n * p.stats.comboPer * 100)}%`, xr, 172, { size: 12, align: 'right', color: '#ffd8a0' });
    const k = clamp(cb.t / (2.2 + 0.4 * upLv(meta, 'combo')), 0, 1);
    ctx.fillStyle = '#05040a'; ctx.fillRect(xr - 120, 180, 120, 6);
    ctx.fillStyle = col; ctx.fillRect(xr - 119, 181, Math.round(118 * k), 4);
  }
  // 鍛冶屋の危機
  if (game.room.desc.type === 'forge' && run.glen === 'attacked') {
    text(ctx, tr('グレンを守れ ― 近づいて錆兵を引きつけろ'), VIEW_W / 2, 78, { size: 13, align: 'center', color: '#ff8a6a', bold: true });
  }
  // 刻守のHP
  const b = game.room.boss;
  if (b) {
    const w = 520, x = VIEW_W / 2 - w / 2, y = VIEW_H - 40;
    text(ctx, b.finalForm ? tr('白き刻守 ― 第 2 形態') : b.trueDuel ? tr('刻守 ― 夜明けの決闘') : tr('刻守'), x, y - 6, { size: 13, bold: true, color: b.trueDuel ? '#ffd38a' : '#efe6d2', font: SERIF });
    if (b.counter) {
      text(ctx, tr`対策：${COUNTERS[b.counter].name}`, x + w, y - 6, { size: 11, align: 'right', color: '#ff9a7a' });
      text(ctx, tr`崩し方：${COUNTERS[b.counter].weak}`, VIEW_W / 2, y + 26, { size: 11, align: 'center', color: '#c9b0a0' });
      if (b.counter === 'combo') {
        const sw = 120, sx = x + w - sw;
        ctx.fillStyle = '#05040a'; ctx.fillRect(sx - 1, y - 30, sw + 2, 6);
        ctx.fillStyle = b.shell > 0 ? '#c9a052' : '#3a3242'; ctx.fillRect(sx, y - 29, Math.round(sw * Math.max(0, b.shell) / (b.shellMax || 1)), 4);
        text(ctx, b.shell > 0 ? tr('外殻') : tr`外殻なし ${Math.ceil(b.shellDown)}秒`, sx - 6, y - 23, { size: 10, align: 'right', color: '#c9a052' });
      }
    }
    if (b.brake) text(ctx, b.trueDuel ? '' : tr('時止め封印'), x + w - (b.counter ? 150 : 0), y - 6, { size: 10, align: 'right', color: C.gold });
    ctx.fillStyle = '#1a1018'; ctx.fillRect(x, y, w, 10);
    ctx.fillStyle = b.trueDuel ? '#ffd38a' : '#c94a3a'; ctx.fillRect(x, y, w * clamp(b.hp / b.maxHp, 0, 1), 10);
    for (const t of [b.p2At, b.p3At]) { ctx.fillStyle = '#fff'; ctx.fillRect(x + w * t - 1, y - 2, 2, 14); }
  }
  // 楔の溜め
  if (p.state === 'channel') text(ctx, tr('楔を打っている……（回避・ジャンプで中断）'), VIEW_W / 2, VIEW_H - 70, { size: 12, align: 'center', color: C.gold });
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
  const x = 120, w = VIEW_W - 240, bottom = VIEW_H - 60; // 下の端は固定（選択肢のタップの位置が変わらないように）
  const last = m.idx >= m.lines.length - 1;
  const choices = last && m.choices ? m.choices : [];
  const CH = 28; // 選択肢の行の高さ
  const lines = wrap(ctx, line.text, w - 36, 16, SERIF);
  // 本文・補足・選択肢がすべて収まる高さにする（補足と選択肢が重ならないように）
  const LH = lh(22);
  const bodyH = 52 + lines.length * LH + (line.note ? LH : 0);
  const h = Math.max(110, bodyH + (choices.length ? 22 : 8)) + choices.length * CH;
  const top = bottom - h;
  panel(ctx, x, top, w, h, 'rgba(242,193,78,0.35)');
  if (line.who) text(ctx, line.who, x + 18, top + 26, { size: 13, bold: true, color: C.gold });
  const shown = Math.floor(clamp(m.t * 60, 0, 999)); // 文字送り
  let used = 0;
  lines.forEach((l, i) => { const s = l.slice(0, Math.max(0, shown - used)); used += l.length; text(ctx, s, x + 18, top + 52 + i * LH, { size: 16, font: SERIF, maxW: w - 36 }); });
  if (line.note) text(ctx, '◆ ' + line.note, x + 18, top + 52 + lines.length * LH + 4, { size: 11, color: '#7fb8ff', maxW: w - 36 });
  choices.forEach((c, i) => {
    const cy = top + h - (choices.length - i) * CH - 8;
    if (i === m.sel) { ctx.fillStyle = 'rgba(242,193,78,0.15)'; ctx.fillRect(x + 12, cy - 20, w - 24, CH - 2); }
    text(ctx, (i === m.sel ? '▶ ' : tr('　')) + c.label, x + 22, cy, { size: 16, color: i === m.sel ? C.gold : '#ddd', maxW: w - 44 });
  });
  if (!choices.length) text(ctx, game.touch ? (last ? tr('タップで閉じる') : tr('タップで次へ')) : (last ? tr('Z：閉じる') : tr('Z：次へ')), x + w - 14, top + h - 10, { size: 10, align: 'right', color: C.muted });
}

function drawBoonPick(ctx, game, m) {
  const p = game.player;
  text(ctx, m.rare ? tr`レベル ${game.run.level} ― 稀少の強化を選ぶ` : m.school ? tr('書庫の祭壇 ―「停滞」の強化') : tr('強化を選ぶ'), VIEW_W / 2, 92, { size: 22, align: 'center', bold: true, font: SERIF, color: C.gold });
  if (m.count > 1) text(ctx, tr`あと ${m.count} つ`, VIEW_W / 2, 114, { size: 12, align: 'center', color: C.muted });
  const lay = cardRects(m.offer.length);
  m.offer.forEach((id, i) => {
    const def = BOONS[id], sc = SCHOOLS[def.school];
    // 1枚ずつ滑り込む
    const appear = clamp((m.t - i * 0.07) / 0.2, 0, 1);
    if (appear <= 0) return;
    ctx.globalAlpha = appear;
    const R = lay.rects[i], cw = R.w, ch = R.h;
    const x = R.x, y = R.y - (i === m.sel ? 8 : 0) + (1 - appear) * 24;
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
    if (curArt) text(ctx, tr`持ち替え：${BOONS[curArt.id].name} を外す`, x + 16, y + ch - 32, { size: 11, color: '#ff8ae0' });
    // 合成の素材なら、カードの下に「合成先・相手の素材・持っているか」を色つきの枠で見せる
    const fus = fusionsFor(id, p.boons);
    // 「◆ 合成素材」の印は、系統名と Lv の間に入る時だけ（文字が大きいと重なるので省く。合成の枠は下に出る）
    ctx.font = `${fontSize(11)}px ${FONT}`; const fx0 = x + 16 + ctx.measureText(sc.name + tr('　')).width;
    ctx.font = `${fontSize(10)}px ${FONT}`; const fx1 = fx0 + ctx.measureText(tr('◆ 合成素材')).width;
    ctx.font = `${fontSize(13)}px ${FONT}`; const lvX = x + cw - 16 - (def.max ? ctx.measureText(own ? `Lv${own.tier} → ${nt}` : 'Lv1').width + 8 : 0);
    if (fus.length && fx1 < lvX) text(ctx, tr('◆ 合成素材'), fx0, y + 28, { size: 10, color: fus[0].color, bold: true });
    const FB = lh(34), boxH = fus.length * FB;
    // 説明（17px）→ 補足（共鳴・相乗）の順に、合成の枠より上へ詰める。文字が大きくて入りきらない時は、
    // 補足を省いて説明を優先し、それでも入らない分は最後の行につなげて横に流す（重ならず、欠けない）
    const L = lh(24), HL = lh(15), top = y + 88, bottom = y + ch - boxH - 12 - (curArt ? lh(18) : 0);
    const lines = wrap(ctx, own ? (forgeDiff(id, own.tier).diff || def.desc(nt)) : def.desc(nt), cw - 28, 17);
    let hintLines = synergyHints(id, p.boons, { fusion: false }).flatMap((h) => wrap(ctx, h, cw - 32, 11));
    const fit = (nh) => Math.max(1, Math.floor((bottom - top - (nh ? lh(8) + nh * HL : 0)) / L) + 1);
    if (lines.length > fit(hintLines.length)) hintLines = hintLines.slice(0, Math.max(0, Math.floor((bottom - top - lines.length * L) / HL)));
    const maxL = fit(hintLines.length);
    const shown = lines.length > maxL ? [...lines.slice(0, maxL - 1), lines.slice(maxL - 1).join('')] : lines;
    shown.forEach((l, j) => text(ctx, l, x + 14, top + j * L, { size: 17, color: def.school === 'risk' ? '#ffb0a0' : '#e8e0d0', maxW: cw - 28 }));
    let hy = top + (shown.length - 1) * L + lh(8) + HL;
    for (const l of hintLines) { if (hy <= bottom) text(ctx, l, x + 16, hy, { size: 11, color: '#f2c14e', maxW: cw - 32 }); hy += HL; }
    const hints = hintLines;
    fus.forEach((f, j) => {
      const by = y + ch - boxH - 6 + j * FB;
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x + 8, by, cw - 16, FB - 4);
      ctx.fillStyle = f.color; ctx.fillRect(x + 8, by, 3, FB - 4);
      text(ctx, tr`合成 ▶ ${BOONS[f.to].name}`, x + 18, by + lh(13), { size: 12, bold: true, color: f.color, maxW: cw - 32 });
      const have = f.otherLv > 0, ready = f.otherLv >= 2;
      text(ctx, tr`＋ ${BOONS[f.other].name}`, x + 18, by + lh(27), { size: 11, color: '#e8e0d0' });
      text(ctx, ready ? tr`手持ち Lv${f.otherLv} ✓` : have ? tr`手持ち Lv${f.otherLv}（Lv2 で）` : tr('未所持'), x + cw - 14, by + lh(27), { size: 10, align: 'right', color: ready ? '#7dff9a' : have ? '#ffe14a' : C.muted });
    });
    if (!fus.length && !hints.length && RESONANCE[def.school] && !schoolCounts(p.boons)[def.school]) text(ctx, tr`同じ系統をもう1つで共鳴：${RESONANCE[def.school]}`, x + 16, y + ch - 16, { size: 9, color: C.muted, maxW: cw - 28 });
    ctx.globalAlpha = 1;
  });
  text(ctx, game.touch ? tr('カードをタップで選択、もう一度タップで決定') : tr('← → 選ぶ　Z 決定'), VIEW_W / 2, 428, { size: 12, align: 'center', color: C.muted });
  // 現在の手持ち。選んでいるカードと合成の組になるものは、その合成の色で光らせる
  if (p.boons.length) {
    const pair = new Map(fusionsFor(m.offer[m.sel], p.boons).map((f) => [f.other, f.color]));
    const parts = p.boons.map((b) => ({ s: BOONS[b.id].name + (BOONS[b.id].max ? ` Lv${b.tier}` : b.tier > 1 ? 'II' : ''), c: pair.get(b.id) }));
    ctx.font = `${fontSize(11)}px ${FONT}`; // 実際に描く大きさで幅を測る
    const label = tr('手持ち：'), sep = tr('・');
    const widths = parts.map((q) => ctx.measureText(q.s).width), sw = ctx.measureText(sep).width, lw = ctx.measureText(label).width;
    const total = lw + widths.reduce((a, b) => a + b, 0) + sw * (parts.length - 1);
    // 画面に収まらない（文字が大きい・手持ちが多い）ときは、1 行にまとめて横に流す
    if (total > VIEW_W - 40) { text(ctx, label + parts.map((q) => q.s).join(sep), 20, 452, { size: 11, color: '#bbb', maxW: VIEW_W - 40 }); return; }
    let tx = VIEW_W / 2 - total / 2;
    text(ctx, label, tx, 452, { size: 11, color: '#bbb' }); tx += lw;
    parts.forEach((q, i) => { text(ctx, q.s, tx, 452, { size: 11, color: q.c || '#bbb', bold: !!q.c }); tx += widths[i]; if (i < parts.length - 1) { text(ctx, sep, tx, 452, { size: 11, color: '#bbb' }); tx += sw; } });
  }
}

function drawShop(ctx, game, m) {
  const items = m.stock.map((s) => { const l = game.shopLabel(s); const can = !s.sold && game.run.gold >= s.price; return { label: l.name, color: s.sold ? '#5a5260' : s.tier === 'legend' ? '#ff7ae0' : s.tier === 'rare' ? '#ffd84a' : s.kind === 'key' ? '#ffd84a' : s.kind === 'artifact' ? '#7fe0d0' : s.kind === 'whetstone' ? '#f2c14e' : s.kind === 'reroll' ? '#9fe3ff' : '#d8d0c4', right: s.sold ? tr('売り切れ') : `${s.price} G`, rightColor: s.sold ? '#5a5260' : can ? '#ffd84a' : '#8a6a7a', desc: l.desc, rainbow: s.tier === 'legend' && !s.sold }; });
  drawLightbox(ctx, game, { title: tr('行商人の店'), right: tr`● 金貨 ${game.run.gold}`, items, sel: m.sel, color: '#ffd84a', st: m, desc: items[m.sel] ? items[m.sel].desc : '', hint: game.touch ? tr('タップで選択、もう一度タップで買う／枠の外で閉じる') : tr('↑↓ 選ぶ　Z 買う　C 閉じる') });
}

// 合成：素材 A ＋ 素材 B → 上位の強化
function drawFusion(ctx, game, m) {
  const { a, b, to } = m.recipe, p = game.player;
  const lv = (id) => (p.boons.find((x) => x.id === id) || {}).tier || 1;
  const k = clamp(m.t / 0.5, 0, 1);
  text(ctx, tr('合成できる！'), VIEW_W / 2, 74, { size: 26, align: 'center', color: '#ffd84a' });
  text(ctx, tr('素材の 2 つは消え、上位の強化を Lv1 で得る（Lv1 でも素材より強い。さらに Lv5 まで伸びる）'), VIEW_W / 2, 100, { size: 13, align: 'center', color: C.muted });
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
  const opts = [tr('合成する'), tr('今はしない')];
  opts.forEach((o, i) => {
    const x = i === 0 ? VIEW_W / 2 - 230 : VIEW_W / 2 + 30, on = m.sel === i;
    panel(ctx, x, 400, 200, 44, on ? '#ffd84a' : 'rgba(255,255,255,0.2)', on ? 'rgba(60,44,10,0.95)' : 'rgba(14,11,20,0.95)');
    text(ctx, (on ? '▶ ' : '') + o, x + 100, 429, { size: 18, align: 'center', color: on ? '#ffe9a0' : '#bbb' });
  });
  text(ctx, game.touch ? tr('ボタンをタップで選択、もう一度タップで決定') : tr('← → 選ぶ　Z 決定　C 今はしない'), VIEW_W / 2, 470, { size: 12, align: 'center', color: C.muted });
}

// アーティファクトの選択（カード）
function drawArtifactPick(ctx, game, m) {
  const gold = m.rarity === 'gold';
  const hasLegend = m.offer.some((id) => id.startsWith('boon:'));
  text(ctx, hasLegend ? tr('黄金の宝箱 ― 1 つ選ぶ') : gold ? tr('黄金の宝箱 ― アーティファクトを 1 つ選ぶ') : tr('アーティファクトを 1 つ選ぶ'), VIEW_W / 2, 92, { size: 22, align: 'center', color: gold ? '#ffd84a' : '#7fe0d0' });
  text(ctx, hasLegend ? tr('アーティファクトは夜が戻っても残る。伝説の強化は楔か継承で持ち越す') : tr('アーティファクトは夜が戻っても失われない'), VIEW_W / 2, 114, { size: 12, align: 'center', color: C.muted });
  const cw = 250, ch = 240, gap = 18, total = m.offer.length * cw + (m.offer.length - 1) * gap;
  m.offer.forEach((id, i) => {
    // 黄金の宝箱では、まれに伝説の強化が混ざる（'boon:id'）
    const boon = id.startsWith('boon:') ? BOONS[id.slice(5)] : null;
    const a = boon ? { name: boon.name, desc: boon.desc(1) } : ARTIFACTS[id], col = boon ? '#ff7ae0' : ARTIFACT_COLOR[a.rarity];
    const appear = clamp((m.t - i * 0.07) / 0.2, 0, 1);
    if (appear <= 0) return;
    ctx.globalAlpha = appear;
    const sel = i === m.sel;
    const x = VIEW_W / 2 - total / 2 + i * (cw + gap), y = 140 - (sel ? 8 : 0) + (1 - appear) * 24;
    panel(ctx, x, y, cw, ch, sel ? col : 'rgba(255,255,255,0.15)', sel ? 'rgba(24,18,32,0.98)' : 'rgba(14,11,20,0.95)');
    ctx.fillStyle = col; ctx.fillRect(x, y, cw, 5);
    text(ctx, boon ? tr('★伝説の強化') : gold ? tr('黄金のアーティファクト') : tr('アーティファクト'), x + 16, y + 28, { size: 11, color: col });
    text(ctx, a.name, x + 16, y + 58, { size: 20 });
    wrap(ctx, a.desc, cw - 28, 15).forEach((l, j) => text(ctx, l, x + 14, y + 90 + j * lh(21), { size: 15, color: '#e8e0d0' }));
    ctx.globalAlpha = 1;
  });
  text(ctx, game.touch ? tr('カードをタップで選択、もう一度タップで決定') : tr('← → 選ぶ　Z 決定'), VIEW_W / 2, 412, { size: 12, align: 'center', color: C.muted });
}

function drawCompanionPick(ctx, game, m) {
  const items = m.list.map((id) => { const d = COMPANIONS[id]; return { label: tr`${d.name}（${d.forms.join(' → ')}）`, right: id === game.meta.companion ? tr('連れている') : '', rightColor: d.color, color: d.color, desc: d.desc + tr(' 技：') + d.skills.map((s) => s.names.filter(Boolean).join('→')).join(tr('／')) + tr('。手助け：') + d.buff.name }; });
  drawLightbox(ctx, game, { title: tr('お供を選ぶ ― Lv5・Lv10 で進化する'), items, sel: m.sel, color: '#7fe0b0', st: m, desc: items[m.sel] ? items[m.sel].desc : '' });
}

function drawForge(ctx, game, m) {
  // 鍛えると何がどう変わるかを、選ぶ前に数字で見せる（例：35%→50%）
  const items = m.list.map((b) => { const d = BOONS[b.id], nt = (b.tier || 1) + 1, f = forgeDiff(b.id, b.tier || 1); return { label: d.name, right: d.max ? `Lv${b.tier} → ${nt}` : '→ II', rightColor: '#ffe14a', desc: f.diff ? tr('鍛えると：') + f.diff : tr`今：${f.now}／鍛えると：${f.next}` }; });
  drawLightbox(ctx, game, { title: m.hourglass ? tr('砂時計 ― 時を進めて、どれを鍛える？') : m.shop ? tr('砥石 ― どれを鍛える？（やめれば代金を返す）') : tr('グレンの鍛冶 ― どれを鍛える？'), items, sel: m.sel, color: C.gold, st: m, desc: items[m.sel] ? items[m.sel].desc : '', hint: m.hourglass ? (game.touch ? tr('項目をタップで選択、もう一度タップで鍛える') : tr('↑↓ 選ぶ　Z 鍛える')) : undefined });
}

function drawCode(ctx, game, m) {
  const x = VIEW_W / 2 - 170, y = 150, w = 340, h = 220;
  panel(ctx, x, y, w, h, C.gold);
  text(ctx, tr('書庫の扉'), VIEW_W / 2, y + 34, { size: 18, align: 'center', bold: true, color: C.gold, font: SERIF });
  const shakeX = m.wrong > 0 ? Math.sin(m.wrong * 60) * 6 : 0;
  for (let i = 0; i < 3; i++) {
    const dx = VIEW_W / 2 - 80 + i * 80 + shakeX;
    ctx.fillStyle = i === m.pos ? 'rgba(242,193,78,0.2)' : 'rgba(255,255,255,0.05)'; ctx.fillRect(dx - 26, y + 66, 52, 70);
    text(ctx, String(m.digits[i]), dx, y + 116, { size: 40, align: 'center', bold: true, color: i === m.pos ? C.gold : '#ddd' });
    if (i === m.pos) { text(ctx, '▲', dx, y + 62, { size: 11, align: 'center', color: C.gold }); text(ctx, '▼', dx, y + 150, { size: 11, align: 'center', color: C.gold }); }
  }
  const known = game.meta.knowledge.code;
  text(ctx, known ? tr`記録帳：「書庫の扉 ${game.meta.code.join('-')}」` : tr('番号の手がかりはまだない'), VIEW_W / 2, y + 180, { size: 12, align: 'center', color: known ? '#7fb8ff' : C.muted });
  text(ctx, game.touch ? tr('数字の上半分で＋・下半分で−／この帯をタップで決定') : tr('←→ 桁　↑↓ 数字　Z 決定　C 戻る'), VIEW_W / 2, y + 204, { size: 10, align: 'center', color: C.muted });
}

function drawPause(ctx, game, m) {
  const opts = game.pauseOptions();
  const x = VIEW_W / 2 - 170, y = PAUSE.y - 74, w = 340, h = 66 + opts.length * PAUSE.step;
  panel(ctx, x, y, w, h);
  text(ctx, tr('中断'), VIEW_W / 2, y + 36, { size: 20, align: 'center', bold: true, font: SERIF });
  opts.forEach((o, i) => {
    const yy = PAUSE.y + i * PAUSE.step;
    text(ctx, (i === m.sel ? '▶ ' : '') + o.label, VIEW_W / 2, yy, { size: 14, align: 'center', color: i === m.sel ? C.gold : '#ddd', maxW: w - 24 });
  });
  drawDawnStrip(ctx, game, y + h + 30);
  if (!game.touch) text(ctx, tr('移動 ←→　ジャンプ Z　攻撃 X（長押しで重撃・↑↓＋Xで上下）　回避 C　術 V（ゲージ消費／術がなければ時歪）　調べる Z/↑/E（調べられる物の前）'), VIEW_W / 2, VIEW_H - 30, { size: 11, align: 'center', color: C.muted });
}

const TABS = [tr('人物'), tr('謎'), tr('敵'), tr('夜明け')];
export function drawJournal(ctx, game, m) {
  const meta = game.meta;
  const x = 90, y = 50, w = VIEW_W - 180, h = VIEW_H - 100;
  panel(ctx, x, y, w, h, 'rgba(127,184,255,0.4)');
  text(ctx, tr('記録帳'), x + 24, y + 36, { size: 20, bold: true, font: SERIF, color: '#9fd0ff' });
  text(ctx, tr('周回をまたいで残る。知っていることが、次の夜の攻略になる。'), x + 120, y + 34, { size: 11, color: C.muted });
  TABS.forEach((t, i) => {
    const tx = x + 24 + i * 90, ty = y + 62;
    ctx.fillStyle = i === m.tab ? 'rgba(127,184,255,0.25)' : 'rgba(255,255,255,0.04)'; ctx.fillRect(tx, ty, 80, 24);
    text(ctx, t, tx + 40, ty + 17, { size: 13, align: 'center', color: i === m.tab ? '#fff' : '#aaa' });
  });
  // 中身の枠（入りきらなければ縦に流す）
  const box = { x: x + 4, y: y + 96, w: w - 8, h: h - 130 };
  const sk = 'journal' + m.tab;
  let yy = y + 116 - vbegin(ctx, sk, box);
  const draw = (title, body, isNew, color = '#efe6d2') => {
    text(ctx, (isNew ? '● ' : '') + title, x + 28, yy, { size: 14, bold: true, color });
    yy += lh(18);
    for (const l of wrap(ctx, body, w - 70, 12)) { text(ctx, l, x + 40, yy, { size: 12, color: '#cfc8bb' }); yy += lh(16); }
    yy += lh(8);
  };
  if (m.tab < 3) {
    const cat = TABS[m.tab];
    const entries = Object.entries(KNOWLEDGE).filter(([k, v]) => v.cat === cat && meta.knowledge[k]);
    if (m.tab === 0) {
      // 登場人物：誰が誰とどういう関係か（知ったぶんだけ詳しくなる）
      const k = (key) => !!meta.knowledge[key];
      const cast = [
        [tr('あなた'), tr('刻守の弟子。師に習った「時の楔」で、夜をまたいで覚えていられる唯一の人。')],
        [tr('刻守'), tr('時計塔の主で、あなたの師。禁忌の鐘で夜を戻し続け、そのたびに自分の命を削っている。') + (k('master_reason') ? tr('娘を見送る朝を恐れている。') : '')],
        k('lira_father') ? [tr('リラ'), tr('師の娘。朝の汽車で遠くの療養所へ発つ。')] : k('lira_name') ? [tr('リラ'), tr('市場の少女。師が名を呼んだ。')] : [tr('市場の少女'), tr('朝を待ちながら、父の見送りを気にしている。')],
        [tr('グレン'), tr('鍛冶屋。師の古い友で、塔の歯車を共に作った。') + (k('glen_time') || k('glen_saved') ? tr('夜の途中で時計人形に襲われる。') : '')],
      ];
      const nameW = Math.round(92 * modeScale());
      for (const [nm, d] of cast) { text(ctx, nm, x + 28, yy, { size: 13, color: C.gold, maxW: nameW - 6 }); for (const l of wrap(ctx, d, w - 58 - nameW, 12)) { text(ctx, l, x + 28 + nameW, yy, { size: 12, color: '#cfc8bb' }); yy += lh(16); } yy += lh(4); }
      yy += lh(8);
    }
    if (!entries.length) { text(ctx, tr('まだ何も知らない。'), x + 28, yy, { size: 13, color: C.muted }); yy += lh(24); }
    for (const [k, v] of entries) draw(v.title, v.text(meta), meta.knowledge[k] === meta.loop && game.scene === 'play', cat === tr('敵') ? '#ffb0a0' : '#efe6d2');
    if (m.tab === 0) {
      // 楔の状態もここで確認できる
      yy += lh(6);
      text(ctx, tr`楔（${wedgeCount(meta)}）`, x + 28, yy, { size: 13, bold: true, color: C.gold }); yy += lh(18);
      for (const wd of meta.wedges) { text(ctx, tr`◆ ${wedgeLabel(wd)}：${wd.target === 'boon' ? WEDGE_TARGETS.boon.effect : WEDGE_TARGETS[wd.target].effect}`, x + 40, yy, { size: 12, color: '#d8b968', maxW: w - 70 }); yy += lh(16); }
    }
  } else {
    const pr = dawnProgress(meta);
    text(ctx, tr`夜明けへの道　${pr.done} / ${pr.total}`, x + 28, yy, { size: 15, color: '#ffd38a' }); yy += lh(26);
    DAWN_STEPS.forEach((st, i) => {
      const ok = st.done(meta), isNext = pr.next === st;
      text(ctx, `${ok ? '■' : '□'} ${i + 1}. ${st.title}`, x + 36, yy, { size: 14, color: ok ? '#9a8fa6' : isNext ? '#ffd38a' : '#efe6d2', maxW: w - 60 });
      if (isNext) { yy += lh(18); text(ctx, `→ ${st.hint}`, x + 60, yy, { size: 12, color: '#9fd0ff', maxW: w - 84 }); }
      yy += lh(22);
    });
    const c = bossCounter(meta.lastLoop);
    if (c) draw(tr('刻守の記憶'), tr`前の夜の戦い方を覚えている：${COUNTERS[c].name}――${COUNTERS[c].desc}`, false, '#ff9a7a');
  }
  vend(ctx, sk, yy, box);
  text(ctx, game.touch ? tr('タブをタップ／枠の外をタップで閉じる') : tr('←→ タブ　Tab/Esc 閉じる'), x + w - 20, y + h - 14, { size: 10, align: 'right', color: C.muted });
}

// ───────── タイトル ─────────
export function drawTitle(ctx, game) {
  const t = game.time;
  // 背景（星空の時計塔）は render.js がドット絵で描く
  // 題字は項目（TITLE_MENU）より上に収める。cinema：紹介動画の撮影用（'bare' は背景だけ、ほかは題字だけ）
  if (game.cinema === 'bare') return;
  text(ctx, tr('夜明けの楔'), VIEW_W / 2, TITLE_MENU.y - 46, { size: 50, align: 'center', bold: true, font: SERIF, color: '#f3e7cf', fixed: true });
  text(ctx, 'WEDGE OF DAWN', VIEW_W / 2, TITLE_MENU.y - 26, { size: 12, align: 'center', color: C.gold, fixed: true });
  if (game.cinema) return;
  if (game.titleConfirm) {
    panel(ctx, VIEW_W / 2 - 200, 390, 400, 80, '#e35d5d');
    text(ctx, tr('記録をすべて消して、はじめから遊びますか？'), VIEW_W / 2, 422, { size: 14, align: 'center' });
    text(ctx, tr('Z：消してはじめる　C：やめる'), VIEW_W / 2, 450, { size: 12, align: 'center', color: C.muted });
    return;
  }
  const opts = game.titleOptions();
  opts.forEach((o, i) => text(ctx, (i === game.titleSel ? '▶ ' : '') + o.label, VIEW_W / 2, TITLE_MENU.y + i * TITLE_MENU.step, { size: 16, align: 'center', color: i === game.titleSel ? (o.id === 'diff' ? game.difficulty().color : C.gold) : o.id === 'diff' ? game.difficulty().color : '#bbb' }));
  text(ctx, game.touch ? tr('タップで選ぶ') : tr('↑↓ 選ぶ　Z/Enter 決定　｜　移動 ←→　ジャンプ Z　攻撃 X　回避 C　術 V　調べる ↑'), VIEW_W / 2, VIEW_H - 14, { size: 11, align: 'center', color: C.muted });
  if (game.meta && game.meta.flags.ending) { const en = game.meta.flags.endings || {}; text(ctx, tr`★ クリア済み ― 結末 ${ENDING_IDS.filter((k) => en[k]).length}/${ENDING_IDS.length}（${ENDING_IDS.filter((k) => en[k]).map((k) => ENDINGS[k].name).join(tr('・')) || tr('夜明け')}）`, VIEW_W / 2, 510, { size: 12, align: 'center', color: '#ffd38a' }); }
  else if (game.meta) drawDawnStrip(ctx, game, 510);
  drawGearButton(ctx, game);
  if (game.titleSettings) drawTitleSettings(ctx, game, game.titleSettings);
}

// 左上の設定ボタン（歯車の印と「設定」）
function drawGearButton(ctx, game) {
  const { x, y, w, h } = TITLE_GEAR, on = game.titleSel === -1 && !game.titleSettings;
  panel(ctx, x, y, w, h, on ? C.gold : 'rgba(255,255,255,0.3)', on ? 'rgba(40,30,20,0.9)' : 'rgba(10,8,16,0.75)');
  const gx = x + 22, gy = y + h / 2, col = on ? C.gold : '#cfc8bb';
  ctx.fillStyle = col;
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.fillRect(Math.round(gx + Math.cos(a) * 9 - 2), Math.round(gy + Math.sin(a) * 9 - 2), 4, 4); }
  ctx.beginPath(); ctx.arc(gx, gy, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = on ? 'rgba(40,30,20,1)' : 'rgba(10,8,16,1)'; ctx.beginPath(); ctx.arc(gx, gy, 3, 0, Math.PI * 2); ctx.fill();
  text(ctx, tr('設定'), x + 44, y + h / 2 + 6, { size: 16, color: col, maxW: w - 50 });
}
// ライトボックスの右上の閉じるボタン（×）
function drawCloseButton(ctx, color) {
  const { x, y, w, h } = LB_CLOSE;
  panel(ctx, x, y, w, h, color, 'rgba(20,16,28,0.95)');
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath();
  ctx.moveTo(x + 12, y + 12); ctx.lineTo(x + w - 12, y + h - 12); ctx.moveTo(x + w - 12, y + 12); ctx.lineTo(x + 12, y + h - 12); ctx.stroke();
}
// 「ゲームについて」の本文
export const ABOUT_LINES = [
  { h: tr('夜明けの楔　WEDGE OF DAWN') },
  { t: tr('同じ夜をくり返す時計塔で、「時の楔」を手に夜明けを目指す、2D アクション・ローグライトです。') },
  { t: tr('版：') + RELEASE.version },
  { h: tr('つくった人たち') },
  { t: tr('原案・監修：当開発元') + (RELEASE.publisher ? tr`（${RELEASE.publisher}）` : '') },
  { t: tr('シナリオの推敲：ChatGPT（OpenAI の AI）') },
  { t: tr('制作（プログラム・ドット絵・音楽・効果音・テキストの実装）：Claude（Anthropic の AI）') },
  { h: tr('生成 AI の利用について') },
  { t: tr('この作品のプログラム・絵・音楽・効果音・文章は、生成 AI を使ってつくられています。企画と方針、遊びごこちの確認と取捨選択は人が行いました。') },
  { h: tr('おことわり') },
  { t: tr('この作品はフィクションです。登場する人物・団体・場所・出来事はすべて架空のものであり、実在の人物・団体、ほかのゲームや創作物とは一切関係ありません。') },
  { h: tr('権利と素材') },
  { t: tr('絵・音楽・効果音はすべてプログラムで生成しており、外部の画像や音源は使っていません。') },
  { t: tr('文字：DotGothic16（Copyright 2020 The DotGothic16 Project Authors）。SIL Open Font License 1.1 にもとづいて同梱しています（許諾書は assets/fonts/OFL-DotGothic16.txt）。') },
  { h: tr('健康のための注意') },
  { t: tr('ごくまれに、強い光の刺激や点滅を見て、一時的に筋肉のけいれんや意識の喪失などを起こす人がいます。こうした経験のある方は、遊ぶ前に医師に相談してください。遊んでいて異常を感じたら、すぐにやめて医師の診察を受けてください。') },
  { t: tr('画面全体が光る演出は「光の点滅を抑える」で、画面の揺れは「画面揺れ」で弱められます（この設定画面）。明るい部屋で画面から離れて遊び、長く遊ぶときは適度に休憩をとってください。') },
  { h: tr('記録と個人情報') },
  { t: tr('記録（セーブ）と設定は、この端末の中にだけ保存されます。ブラウザや端末のデータを消すと記録も消えます。') },
  { t: tr('個人の情報は集めません。通信・広告・課金はありません。') },
  { h: tr('ご利用にあたって') },
  { t: tr('動作は端末やブラウザによって異なる場合があります。この作品を遊んだことで生じた損害について、制作者は責任を負いかねます。') },
  ...(RELEASE.contact ? [{ h: tr('お問い合わせ') }, { t: RELEASE.contact }] : []),
];
function drawTitleSettings(ctx, game, ts) {
  if (!ts.about) {
    const items = game.settingsOptions().map((o) => ({ label: o.label, right: o.right, rightColor: C.muted }));
    drawLightbox(ctx, game, { title: ts.lang ? /* i18n-skip */ '言語 / Language' : tr('設定'), items, sel: ts.sel, color: C.gold, st: ts, desc: ts.lang ? tr('選ぶと、その言語で読み込み直します') : { lang: tr('表示する言語を選びます'), about: tr('原案・制作・おことわり・権利表記など'), flash: tr('画面全体が白く光る演出を弱くします（光の点滅が苦手な方に）') }[(game.settingsOptions()[ts.sel] || {}).id] || '', hint: game.touch ? tr('タップで選択、もう一度タップで決定／×で閉じる') : tr('↑↓ 選ぶ　Z 決定　C 閉じる') });
    drawCloseButton(ctx, C.gold);
    return;
  }
  // ゲームについて：本文は枠の中に折り返して描き、入りきらなければ縦にゆっくり送る
  ctx.fillStyle = 'rgba(4,3,8,0.86)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const { x, y, w, h } = LB, col = '#9fd0ff';
  panel(ctx, x, y, w, h, col, 'rgba(14,11,20,0.98)');
  ctx.fillStyle = col; ctx.fillRect(x, y, w, 4);
  text(ctx, tr('ゲームについて'), x + 28, y + 44, { size: 22, color: col });
  drawCloseButton(ctx, col);
  const box = { x: x + 20, y: y + 64, w: w - 40, h: h - 100 };
  const off = vbegin(ctx, 'about', box);
  let yy = box.y + 22 - off;
  for (const l of ABOUT_LINES) {
    if (l.h) { yy += lh(6); text(ctx, '◆ ' + l.h, box.x + 8, yy, { size: 15, color: C.gold }); yy += lh(24); continue; }
    // 文字を大きくしても横に流さず、描く大きさで折り返す（縦に送るので行が増えてもよい）
    for (const s of wrap(ctx, l.t, (box.w - 30) * 13 / fontSize(13), 13)) { text(ctx, s, box.x + 22, yy, { size: 13, color: '#e8e0d0', maxW: box.w - 26 }); yy += lh(20); }
  }
  vend(ctx, 'about', yy - lh(20) + 8 + off, box);
  text(ctx, game.touch ? tr('どこかをタップで閉じる') : tr('Z / C で閉じる'), VIEW_W / 2, y + h - 14, { size: 11, align: 'center', color: C.muted });
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
  const causeText = rep.cause === 'ending' ? tr('決着がついた。塔に朝が来た。') : rep.cause === 'bell' ? tr('鐘が鳴った。夜が戻る。') : rep.cause === 'badend' ? tr('刻守を倒した。けれど、夜は明けない。') : tr('あなたは倒れた。同じ夜のはじめに戻る。');
  text(ctx, causeText + (rep.retry ? tr`　（第 ${rep.loop} 夜をもう一度）` : rep.cause === 'ending' ? tr`　（次は${endlessName(meta)}・第 ${meta.loop} 夜）` : tr`　（第 ${rep.loop} 夜 → 第 ${meta.loop} 夜）`), VIEW_W / 2, 50, { size: 19, align: 'center', font: SERIF, color: rep.cause === 'bell' || rep.cause === 'ending' ? C.gold : '#efe6d2' });
  // 夜ごとに変わる語り（時間の経過と、師の変化）
  if (rep.story) { ctx.globalAlpha = clamp(t / 0.8, 0, 1); text(ctx, rep.story, VIEW_W / 2, 80, { size: 14, align: 'center', font: SERIF, color: '#d9c7a8' }); ctx.globalAlpha = 1; }
  if (game.cinema === 'clock') return; // 紹介動画の撮影用：逆回りの時計と一文だけ
  if (rep.tip && t > 2.2) text(ctx, '◆ ' + rep.tip, VIEW_W / 2, 366, { size: 12, align: 'center', color: '#f2c14e' });
  const cols = [
    { title: tr('残ったもの'), color: C.gold, items: rep.kept, at: 0.5 },
    { title: tr('戻ったもの'), color: C.reset, items: rep.reset, at: 1.1 },
    { title: tr('変わったこと'), color: C.change, items: rep.changed, at: 1.7 },
  ];
  const cw = 280, gap = 22, x0 = VIEW_W / 2 - (cw * 3 + gap * 2) / 2;
  cols.forEach((c, i) => {
    const a = clamp((t - c.at) / 0.4, 0, 1);
    if (a <= 0) return;
    ctx.globalAlpha = a;
    const x = x0 + i * (cw + gap), y = 100 + (1 - a) * 12;
    panel(ctx, x, y, cw, 250, c.color + '88', 'rgba(14,11,20,0.9)');
    text(ctx, c.title, x + 14, y + 26, { size: 15, bold: true, color: c.color, font: SERIF });
    // 中身の枠（入りきらなければ縦に流す）
    const box = { x: x + 2, y: y + 36, w: cw - 4, h: 210 }, sk = 'rewind' + i;
    let yy = y + 52 - vbegin(ctx, sk, box);
    if (!c.items.length) text(ctx, '―', x + 14, yy, { size: 12, color: C.muted });
    c.items.forEach((it, j) => {
      const ia = clamp((t - c.at - 0.15 - j * 0.12) / 0.3, 0, 1);
      if (ia <= 0) return;
      ctx.globalAlpha = a * ia;
      const col = i === 1 ? '#9a9aa2' : it.tone === 'risk' ? '#ff9a7a' : it.tone === 'blue' ? '#7fb8ff' : it.tone === 'reset' ? '#9a9aa2' : i === 0 ? '#f3dca0' : '#d9c2ff';
      for (const l of wrap(ctx, it.text, cw - 28, 12)) { text(ctx, l, x + 14, yy, { size: 12, color: col }); if (i === 1) { ctx.fillStyle = 'rgba(160,160,170,0.6)'; ctx.fillRect(x + 14, yy - 4, Math.min(cw - 28, ctx.measureText(l).width) * ia, 1); } yy += lh(16); }
      if (it.sub) for (const l of wrap(ctx, it.sub, cw - 40, 10)) { text(ctx, l, x + 22, yy, { size: 10, color: C.muted }); yy += lh(14); }
      yy += lh(6);
    });
    vend(ctx, sk, yy, box);
    ctx.globalAlpha = 1;
  });
  ctx.globalAlpha = 1;
  if (t < 3.2) { text(ctx, game.touch ? tr('タップでとばす') : tr('Z：とばす'), VIEW_W - 20, VIEW_H - 16, { size: 10, align: 'right', color: C.muted }); return; }
  // 選択肢（2 列のボタン）
  if (r.mode === 'view') {
    const opts = game.rewindOptions();
    const g = rewindGrid(opts.length);
    panel(ctx, g.x - 12, g.y - 30, g.cw * 2 + g.gap + 24, g.rowH * Math.ceil(opts.length / 2) + 22, 'rgba(242,193,78,0.35)', 'rgba(12,9,18,0.94)');
    opts.forEach((o, i) => {
      const bx = g.x + (i % 2) * (g.cw + g.gap), byy = g.y + Math.floor(i / 2) * g.rowH, on = i === r.sel;
      if (on) { ctx.fillStyle = 'rgba(242,193,78,0.16)'; ctx.fillRect(bx - 6, byy - 24, g.cw, g.rowH - 6); }
      text(ctx, (on ? '▶ ' : tr('　')) + o.label, bx, byy, { size: 17, color: on ? C.gold : '#d8d0c4' });
    });
    text(ctx, tr`楔 ${wedgeCount(meta)}`, VIEW_W - 24, VIEW_H - 12, { size: 12, align: 'right', color: C.gold });
    drawDawnStrip(ctx, game, VIEW_H - 12, 'left');
  } else if (r.mode === 'pull' || r.mode === 'wedgeBoon') {
    const pull = r.mode === 'pull';
    const items = pull
      ? meta.wedges.map((w) => ({ label: wedgeLabel(w), desc: w.target === 'boon' ? WEDGE_TARGETS.boon.effect : WEDGE_TARGETS[w.target].effect }))
      : game.carryAll()
        // めちゃ簡単：すべての強化に、はじめから楔が打たれている（楔の枠は使わない。外せない）
        ? game.wedgeableBoons().map((b) => { const d = BOONS[b.id]; return { label: '▼ ' + d.name + (d.max ? ` Lv${b.tier}` : b.tier > 1 ? ' II' : ''), color: C.gold, right: tr('楔（自動・外せない）'), rightColor: C.gold, desc: d.desc(b.tier || 1) }; })
        : game.wedgeableBoons().map((b) => { const d = BOONS[b.id]; return { label: d.name + (d.max ? ` Lv${b.tier}` : b.tier > 1 ? ' II' : ''), right: SCHOOLS[d.school].name, rightColor: SCHOOLS[d.school].color, desc: d.desc(b.tier || 1) }; });
    const autoW = !pull && game.carryAll();
    drawLightbox(ctx, game, {
      title: pull ? tr('楔を抜く ― 抜いた対象は次の夜、元に戻る') : autoW ? tr('強化の楔 ― めちゃ簡単：すべて自動で打たれている') : tr('強化に楔を打つ ― 次の夜も持ったまま始まる'),
      right: autoW ? tr`自動 ${items.length}` : tr`楔 ${wedgeCount(meta)}`,
      items, sel: r.sub, color: C.gold, desc: autoW && r.lockedT > 0 ? tr('めちゃ簡単では、すべての強化に自動で楔が打たれています（外せません。楔の枠は使いません）') : items[r.sub] ? items[r.sub].desc : '', st: r,
      hint: autoW ? (game.touch ? tr('枠の外で戻る') : tr('↑↓ 見る　C 戻る')) : undefined,
    });
  }
  if (r.mode === 'upgrade' || r.mode === 'inherit') drawRewindShop(ctx, game, r);
  // 決着のあと、何も強化しないままタイトルへ戻ろうとした時の案内
  if (r.mode === 'notice') drawLightbox(ctx, game, {
    title: tr('シナリオは終わっても、夜は続く'), color: C.gold, sel: -1, st: r,
    items: [
      { label: tr`◆ シナリオが終了しても、「${endlessName(meta)}」としてエンドレスで遊べます`, color: '#efe6d2' },
      { label: tr`◆ 次の${endlessName(meta)}のための強化は、この画面で行ってください`, color: '#efe6d2' },
      { label: tr('　（刻印を刻む・継承する強化を選ぶ・楔を打つ など）'), color: C.muted },
      hasPersistence(meta) ? { label: tr('◆ 記憶の固執：Lv と金貨も次の夜へ持ち越し、継承の刻印に上限が無い'), color: '#ff9ad8' } : { label: tr('◆ 真の結末「夜明けの楔」を見ると、Lv と金貨も持ち越す「記憶の固執の夜」になる'), color: C.muted },
    ],
    desc: tr('もう一度「タイトル画面に戻る」を押すと、強化せずにタイトルへ戻ります。'),
    hint: game.touch ? tr('タップで閉じる') : tr('Z 閉じる'),
  });
  // 巻き戻り画面の上に開いた窓（記録帳・お供を選ぶ）も描く
  if (game.modal) { ctx.fillStyle = 'rgba(5,4,8,0.7)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); if (game.modal.type === 'journal') drawJournal(ctx, game, game.modal); else drawModal(ctx, game); }
}

// ───────── 結末 ─────────
// 楔の数の表示：人 1/2・技 0/3
const wedgeCount = (meta) => tr`人 ${meta.wedges.filter((w) => w.target !== 'boon').length}/${meta.personSlots || 2}・技 ${meta.wedges.filter((w) => w.target === 'boon').length}/${meta.slots}`;
export function drawEnding(ctx, game) {
  const e = game.ending, PAGES = e.pages;
  const k = clamp(e.page / (PAGES.length - 1), 0, 1) * (e.tone ?? 1);
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, `rgb(${30 + k * 200},${20 + k * 140},${40 + k * 60})`);
  g.addColorStop(1, `rgb(${10 + k * 90},${8 + k * 50},${14 + k * 20})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const page = PAGES[Math.min(e.page, PAGES.length - 1)];
  const a = clamp(e.t / 0.8, 0, 1);
  ctx.globalAlpha = a;
  page.forEach((l, i) => text(ctx, l, VIEW_W / 2, VIEW_H / 2 - 10 + i * 34, { size: i === 0 && e.page === PAGES.length - 1 ? 36 : 20, align: 'center', font: SERIF, color: '#fff6e0' }));
  if (e.page === PAGES.length - 1) {
    const m = game.meta;
    text(ctx, tr`${m.loop} 夜／倒れた回数 ${m.stats.deaths}／偽りの勝利 ${m.stats.falseWins}`, VIEW_W / 2, VIEW_H / 2 + 90, { size: 12, align: 'center', color: '#fff6e0' });
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
      // めちゃ簡単：継承は最初から無限（刻印は要らない）
      if (k === 'inherit' && game.carryAll()) return { label: tr`${u.name}　∞`, right: tr('無限'), rightColor: C.gold, desc: tr('めちゃ簡単：前の夜の強化と術を、すべて Lv ごと持ち越す（刻む必要はない）') };
      const mx = upMax(m, k), lv = upLv(m, k), maxed = lv >= mx, c = maxed ? 0 : u.cost(lv);
      return { label: tr`${u.name}　Lv${lv}/${Number.isFinite(mx) ? mx : '∞'}`, right: maxed ? tr('最大') : tr`欠片 ${c}`, rightColor: maxed ? C.muted : m.shards >= c ? '#9fd0ff' : '#8a6a7a', desc: maxed ? u.desc(lv) : tr`いま：${lv ? u.desc(lv) : tr('なし')}　→　次：${u.desc(lv + 1)}` };
    });
    drawLightbox(ctx, game, { title: tr('刻印 ― 夜を越えて残る力'), right: tr`時の欠片 ${m.shards}`, items, sel: r.sub, color: '#9fd0ff', desc: items[r.sub] ? items[r.sub].desc : '', st: r });
  } else {
    const list = game.inheritCandidates(), auto = game.carryAll();
    const items = list.map((b) => {
      const def = BOONS[b.id], on = auto || m.inherit.some((x2) => x2.id === b.id);
      if (auto) return { label: '◆ ' + def.name + (def.max ? ` Lv${b.tier}` : b.tier > 1 ? ' II' : ''), color: C.gold, right: tr('自動で持ち越す'), rightColor: C.gold, desc: def.desc(b.tier || 1) };
      return { label: (on ? '◆ ' : '◇ ') + def.name + (def.max ? ` Lv${b.tier}` : b.tier > 1 ? ' II' : ''), color: on ? C.gold : '#bbb', right: on ? tr('持ち越す') : SCHOOLS[def.school].name, rightColor: on ? C.gold : SCHOOLS[def.school].color, desc: def.desc(b.tier || 1) };
    });
    if (auto) { drawLightbox(ctx, game, { title: tr('継承 ― めちゃ簡単：すべて自動で持ち越す'), right: `${list.length} / ∞`, items, sel: r.sub, color: C.gold, st: r, desc: r.lockedT > 0 ? tr('めちゃ簡単では、すべての強化を自動で持ち越します（外せません）') : items[r.sub] ? items[r.sub].desc : '', hint: game.touch ? tr('枠の外で戻る') : tr('↑↓ 見る　C 戻る') }); return; }
    drawLightbox(ctx, game, { title: tr`継承 ― 次の夜に持ち越す強化`, right: `${m.inherit.length} / ${inheritLabel(m)}`, items, sel: r.sub, color: C.gold, st: r, desc: items[r.sub] ? items[r.sub].desc : '', hint: game.touch ? tr('タップで選択、もう一度タップで ◆持ち越す／◇外す　枠の外で戻る') : tr('↑↓ 選ぶ　Z ◆持ち越す／◇外す　C 戻る') });
  }
}

// 刻守の分析：前の夜のあなたの戦い方と、用意された対策
const HABIT_LABEL = { combo: tr('連撃'), heavy: tr('重撃'), air: tr('空中'), skill: tr('術'), echo: tr('残響') };
function drawAnalysis(ctx, game, m) {
  const x = 150, y = 60, w = VIEW_W - 300, h = 420;
  const k = clamp(m.t / 0.6, 0, 1);
  panel(ctx, x, y, w, h, '#ff9a7a');
  text(ctx, tr('刻守はあなたを見ていた'), x + 24, y + 38, { size: 22, color: '#ff9a7a' });
  text(ctx, tr('前の夜の戦い方'), x + 24, y + 70, { size: 13, color: C.muted });
  const a = m.a;
  Object.entries(HABIT_LABEL).forEach(([cat, label], i) => {
    const yy = y + 96 + i * 26, share = a ? a.shares[cat] : 0, top = cat === m.counter;
    text(ctx, label, x + 24, yy, { size: 14, color: top ? '#ffffff' : '#bbb' });
    ctx.fillStyle = '#1a1420'; ctx.fillRect(x + 90, yy - 12, 300, 12);
    ctx.fillStyle = top ? '#ff4a2a' : '#6a5a7a'; ctx.fillRect(x + 90, yy - 12, Math.round(300 * share * k), 12);
    text(ctx, `${Math.round(share * 100)}%`, x + 400, yy, { size: 13, color: top ? '#ff9a7a' : '#999' });
  });
  const dy = y + 96 + 5 * 26;
  text(ctx, tr`回避  毎分 ${a ? Math.round(a.dodgeRate) : 0} 回`, x + 24, dy, { size: 14, color: m.counter === 'dodge' ? '#ffffff' : '#bbb' });
  const c = COUNTERS[m.counter];
  if (k >= 1) {
    text(ctx, tr`対策：${c.name}`, x + 24, dy + 44, { size: 20, color: '#ff4a2a' });
    const dl = wrap(ctx, c.desc, w - 48, 14);
    dl.forEach((l, i) => text(ctx, l, x + 24, dy + 70 + i * lh(20), { size: 14, color: '#efe6d2' }));
    wrap(ctx, tr('崩し方：') + c.weak, w - 48, 14).forEach((l, i) => text(ctx, l, x + 24, dy + 70 + Math.max(46, dl.length * lh(20) + 6) + i * lh(20), { size: 14, color: '#9fd0ff' }));
  }
  text(ctx, game.touch ? tr('タップで続ける') : tr('Z で続ける'), x + w - 20, y + h - 14, { size: 11, align: 'right', color: C.muted });
}

// 夜明けへの道（進み具合と次にすること）を 1 行で
export function drawDawnStrip(ctx, game, y, align = 'center') {
  const m = game.meta; if (!m) return;
  const pr = dawnProgress(m);
  const x = align === 'center' ? VIEW_W / 2 : 24;
  if (!pr.next) { text(ctx, tr('夜明けを迎えた（クリア済み）'), x, y, { size: 13, align, color: '#ffd38a' }); return; }
  text(ctx, tr`夜明けへの道 ${pr.done}/${pr.total}　次：${pr.next.title}`, x, y, { size: 13, align, color: '#ffd38a' });
}
