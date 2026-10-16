// お供：主人公の周りをついて回る小さな相棒。近くの敵を自動で狙って攻撃する。
// 主人公のレベルで 3 段階に進化する（Lv1〜 / Lv5〜 / Lv10〜）。進化すると見た目が変わり、技が増えて強くなる。
// 技は 3 つ：1 つ目は最初から（段階ごとに強くなる）、2 つ目は第 2 段階から、3 つ目（大技）は第 3 段階から。
// それぞれ主人公への手助け（お供からのバフ）を 1 つ持つ。
import { cx, cy, sign, clamp } from './util.js';

export const STAGE_LV = [1, 5, 10];
export const stageOf = (lv) => (lv >= STAGE_LV[2] ? 3 : lv >= STAGE_LV[1] ? 2 : 1);
const STAGE_MUL = [1, 1.5, 2.2];
export const COMP_DMG = 0.22; // お供の火力の全体の倍率（主役は主人公。お供は手助け）

export const COMPANIONS = {
  hotaru: {
    name: 'ホタル', forms: ['灯り蛍', '篝火蛍', '星灯の蛍'], color: '#ffe14a',
    desc: '遠くの敵を光の弾で撃つ。進化すると光の帯と星火の雨。',
    skills: [
      { names: ['灯弾', '双灯弾', '三連灯弾'], desc: (s) => `${s} 発の追う光の弾（各 8）` },
      { names: [null, '光の帯', '極光の帯'], desc: (s) => `敵へ光の帯を当て続ける（${s === 3 ? '貫通・' : ''}4／0.1秒）` },
      { names: [null, null, '星火の雨'], desc: () => '敵の上へ星火が 8 つ降る（各 14）' },
    ],
    buff: { name: '癒しの灯', desc: (s) => (s >= 3 ? '8 秒ごとに主人公の HP を 2% 癒やす' : s >= 2 ? '10 秒ごとに主人公の HP を 1.5% 癒やす' : '（第 2 段階から）主人公の HP を少しずつ癒やす') },
  },
  neji: {
    name: 'ネジ', forms: ['歯車の雛', '真鍮の小鳥', '雷翼の鳥'], color: '#9fd0ff',
    desc: '敵へ飛び込んで啄む。進化すると回る歯車と雷の羽。',
    skills: [
      { names: ['啄み', '二度啄み', '雷啄み'], desc: (s) => `敵へ飛び込んで啄む（${s >= 2 ? '2 回・' : ''}各 10）` },
      { names: [null, '回る歯車', '双つ歯車'], desc: (s) => `貫く歯車を${s === 3 ? ' 2 つ' : ''}投げる（各 12）` },
      { names: [null, null, '雷の羽'], desc: () => '近くの敵 4 体へ雷を落とす（各 22）' },
    ],
    buff: { name: '追い風', desc: (s) => (s >= 3 ? '主人公の移動 +15%、回避のクールタイム -15%' : s >= 2 ? '主人公の移動 +8%' : '（第 2 段階から）主人公の足が速くなる') },
  },
  chiku: {
    name: 'チク', forms: ['時計の子猫', '鈴の猫', '九影の猫'], color: '#d8c8ff',
    desc: '近くの敵へ跳びかかって爪で裂く。進化すると時止めの鈴と九つの影。',
    skills: [
      { names: ['爪', '十字爪', '三爪'], desc: (s) => `跳びかかって${s} 本の爪で裂く（各 11）` },
      { names: [null, '時止めの鈴', '大時止めの鈴'], desc: (s) => `鈴を鳴らし、周りの雑魚を ${s === 3 ? '2.2' : '1.5'} 秒遅くする（10）` },
      { names: [null, null, '九つの影'], desc: () => '影が 9 回、部屋の敵を次々に裂く（各 12）' },
    ],
    buff: { name: '猫の目', desc: (s) => (s >= 3 ? '主人公の会心率 +10%' : s >= 2 ? '主人公の会心率 +5%' : '（第 2 段階から）主人公の会心率が上がる') },
  },
};
export const COMPANION_IDS = Object.keys(COMPANIONS);

// お供から主人公への能力値の手助け（Player.setBoons で重ねる）
export function companionMods(id, stage) {
  const m = { moveMul: 1, dodgeCdMul: 1, critAdd: 0 };
  if (id === 'neji' && stage >= 2) { m.moveMul = stage >= 3 ? 1.15 : 1.08; if (stage >= 3) m.dodgeCdMul = 0.85; }
  if (id === 'chiku' && stage >= 2) m.critAdd = stage >= 3 ? 0.1 : 0.05;
  return m;
}

export function makeCompanion(id, p, stage = 1) {
  return { id, x: cx(p) - 20, y: cy(p) - 24, t: 0, stage, face: 1, cds: [0.6, 1.5, 3], shots: [], fx: [], dash: null, healT: 0, shieldT: 0, pop: 0 };
}

const foes = (game) => game.room.enemies.filter((e) => e.alive && !(e.boss && e.defeated) && !e.invuln);
function nearest(game, x, y, r) {
  let best = null, bd = r;
  for (const e of foes(game)) { const d = Math.hypot(cx(e) - x, cy(e) - y); if (d < bd) { bd = d; best = e; } }
  return best;
}
function segHits(game, x1, y1, x2, y2, pad = 6) {
  const out = [], len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.ceil(len / 10));
  for (const e of foes(game)) for (let i = 0; i <= n; i++) { const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n; if (x > e.x - pad && x < e.x + e.w + pad && y > e.y - pad && y < e.y + e.h + pad) { out.push(e); break; } }
  return out;
}

// お供の一撃：術と同じく「常時の術」扱い（敵を怯ませず、刻守の術の守りを受ける）
function hit(game, c, e, base, extra = {}) {
  if (!e.alive) return;
  const st = game.player.stats;
  const was = e.alive;
  game.dealDamage(e, { base: base * COMP_DMG * STAGE_MUL[c.stage - 1] * (st.compDmg || 1), cat: 'skill', knock: extra.knock ?? 40, dir: extra.dir || sign(cx(e) - c.x) || 1, spell: true, passive: true, companion: true });
  if (was && !e.alive) onCompKill(game, c, e);
}
function onCompKill(game, c, e) {
  const p = game.player, st = p.stats;
  if (st.compHealKill) { const amt = Math.round(st.compHealKill * (st.healMul || 1)); p.hp = Math.min(p.maxHp, p.hp + amt); game.fx.text(cx(p), p.y - 16, `+${amt}`, '#5fd18b', 11); }
  if (st.compRally) { p.rallyT = 5; p.rallyMul = st.compRally; game.fx.text(cx(p), p.y - 26, '鼓舞', '#ffb04a', 11); }
}

// いま連れているお供すべて（主のお供＋稀少の強化で呼んだ仲間）
export const allComps = (game) => [game.comp, ...(game.allies || [])].filter(Boolean);
// お供たちからの手助けを重ねる
export function combinedMods(list) {
  const m = { moveMul: 1, dodgeCdMul: 1, critAdd: 0 };
  for (const c of list) { const x = companionMods(c.id, c.stage); m.moveMul *= x.moveMul; m.dodgeCdMul *= x.dodgeCdMul; m.critAdd += x.critAdd; }
  return m;
}

export function updateCompanions(game, dt) {
  const p = game.player;
  if (p && p.rallyT > 0) p.rallyT -= dt;
  allComps(game).forEach((c, i) => updateCompanion(game, dt, c, i));
  if (game.union) updateUnion(game, dt);
}

export function updateCompanion(game, dt, c = game.comp, slot = 0) {
  const p = game.player;
  if (!c || !game.room) return;
  const st = p.stats;
  c.t += dt;
  if (c.pop > 0) c.pop -= dt;
  // ついて回る：主人公の周りをゆっくり回りながら追いかける
  let tx, ty;
  if (c.dash) {
    const e = c.dash.e;
    c.dash.t += dt;
    tx = e.alive ? cx(e) : c.dash.x; ty = e.alive ? cy(e) - 4 : c.dash.y;
    if (e.alive) { c.dash.x = tx; c.dash.y = ty; }
    const k = Math.min(1, dt * 18);
    c.x += (tx - c.x) * k; c.y += (ty - c.y) * k;
    if (c.dash.t >= c.dash.hitAt && !c.dash.done) { c.dash.done = true; c.dash.hits.forEach((fn) => fn()); }
    if (c.dash.t > c.dash.life) c.dash = null;
  } else {
    const a = c.t * 1.6 + slot * Math.PI * 2 / 3; // 仲間どうしは輪の上でずらす
    const side = slot === 2 ? 1 : -1;
    tx = cx(p) + side * p.face * (slot ? 30 : 26) + Math.cos(a) * 20; ty = cy(p) - 36 - (slot === 1 ? 14 : 0) + Math.sin(a * 1.3) * 8;
    const k = Math.min(1, dt * 6);
    c.x += (tx - c.x) * k; c.y += (ty - c.y) * k;
    if (Math.abs(tx - c.x) > 2) c.face = sign(tx - c.x);
  }
  if (p.state === 'dead') return;

  // お供からの手助け（癒しの灯・守りの羽）
  if (c.id === 'hotaru' && c.stage >= 2) {
    c.healT += dt;
    const per = c.stage >= 3 ? 8 : 10;
    if (c.healT >= per) { c.healT = 0; const amt = Math.max(1, Math.round(p.maxHp * (c.stage >= 3 ? 0.02 : 0.015) * (st.healMul || 1))); if (p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + amt); game.fx.text(cx(p), p.y - 16, `+${amt}`, '#5fd18b', 11); game.fx.ring(cx(p), cy(p), '#ffe14a', 26, 0.3); } }
  }
  if (st.compShield && slot === 0) {
    if (!p.compShield) { c.shieldT += dt; if (c.shieldT >= st.compShield) { c.shieldT = 0; p.compShield = true; game.fx.ring(cx(p), cy(p), '#9fe3ff', 22, 0.35); game.fx.text(cx(p), p.y - 22, '守りの羽', '#9fe3ff', 10); } }
  }

  // 技の待ち時間
  const cdMul = st.compCd || 1;
  for (let i = 0; i < 3; i++) c.cds[i] -= dt;
  const tgt = nearest(game, c.x, c.y, 300) || nearest(game, cx(p), cy(p), 300);
  if (tgt) {
    const use = (i, cd) => { if (i + 1 > c.stage || c.cds[i] > 0) return false; c.cds[i] = cd * cdMul; return true; };
    SKILLS[c.id](game, c, tgt, use);
  }
  // 弾と演出
  for (const s of c.shots) updateShot(game, c, s, dt);
  c.shots = c.shots.filter((s) => s.alive);
  for (const f of c.fx) { f.t += dt; if (f.tick) f.tick(dt); }
  c.fx = c.fx.filter((f) => f.t < f.life);
}

// 主人公の直接攻撃が当たったとき（共鳴の印）
export function onHeroHit(game) {
  const k = game.player.stats.compResonate;
  if (!k) return;
  for (const c of allComps(game)) for (let i = 0; i < 3; i++) c.cds[i] -= k;
}

function updateShot(game, c, s, dt) {
  s.t += dt;
  if (s.kind === 'orb') {
    const e = s.target && s.target.alive ? s.target : nearest(game, s.x, s.y, 260);
    if (e) { const a = Math.atan2(cy(e) - s.y, cx(e) - s.x), cur = Math.atan2(s.vy, s.vx); let da = a - cur; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; const na = cur + clamp(da, -8 * dt, 8 * dt); s.vx = Math.cos(na) * 320; s.vy = Math.sin(na) * 320; }
  }
  if (s.kind === 'gear') s.spin = (s.spin || 0) + dt * 20;
  s.x += s.vx * dt; s.y += s.vy * dt;
  for (const e of foes(game)) {
    if (s.hit.has(e.id)) continue;
    if (s.x > e.x - 5 && s.x < e.x + e.w + 5 && s.y > e.y - 5 && s.y < e.y + e.h + 5) {
      s.hit.add(e.id); hit(game, c, e, s.dmg, { dir: sign(s.vx) || 1 });
      game.fx.sparks(s.x, s.y, s.color, 4, 160);
      if (!s.pierce) { s.alive = false; break; }
    }
  }
  if (s.t > s.life || game.map.solidAt(s.x, s.y)) s.alive = false;
}

const SKILLS = {
  hotaru(game, c, e, use) {
    if (use(0, 1.1)) {
      for (let i = 0; i < c.stage; i++) { const a = Math.atan2(cy(e) - c.y, cx(e) - c.x) + (i - (c.stage - 1) / 2) * 0.5; c.shots.push({ kind: 'orb', x: c.x, y: c.y, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, t: 0, life: 1.6, dmg: 8, target: e, hit: new Set(), alive: true, color: '#ffe14a' }); }
      game.sfx.play('shoot');
    }
    if (c.stage >= 2 && use(1, 4)) {
      const f = { kind: 'beam', t: 0, life: 0.6, tk: 0, e, x1: c.x, y1: c.y, x2: cx(e), y2: cy(e), wide: c.stage >= 3 };
      f.tick = (dt) => {
        if (f.e.alive) { f.x2 = cx(f.e); f.y2 = cy(f.e); }
        f.x1 = c.x; f.y1 = c.y;
        f.tk -= dt; if (f.tk > 0) return; f.tk = 0.1;
        if (f.wide) { const a = Math.atan2(f.y2 - f.y1, f.x2 - f.x1); for (const o of segHits(game, f.x1, f.y1, f.x1 + Math.cos(a) * 320, f.y1 + Math.sin(a) * 320)) hit(game, c, o, 4, { knock: 0 }); }
        else if (f.e.alive) hit(game, c, f.e, 4, { knock: 0 });
      };
      c.fx.push(f);
    }
    if (c.stage >= 3 && use(2, 8)) {
      const list = foes(game).sort((a, b) => Math.hypot(cx(a) - cx(e), cy(a) - cy(e)) - Math.hypot(cx(b) - cx(e), cy(b) - cy(e))).slice(0, 4);
      for (let i = 0; i < 8; i++) {
        const o = list[i % list.length];
        const f = { kind: 'spark', t: 0, life: 0.5 + i * 0.07, at: 0.3 + i * 0.07, x: cx(o) + (i % 2 ? 6 : -6), y: cy(o), o, done: false };
        f.tick = () => { if (f.o.alive) { f.x = cx(f.o); f.y = cy(f.o); } if (!f.done && f.t >= f.at) { f.done = true; if (f.o.alive) hit(game, c, f.o, 14, { knock: 80 }); game.fx.burst(f.x, f.y, '#ffe14a', 8); } };
        c.fx.push(f);
      }
      game.fx.text(c.x, c.y - 14, '星火の雨', '#ffe14a', 11);
    }
  },
  neji(game, c, e, use) {
    if (!c.dash && Math.hypot(cx(e) - c.x, cy(e) - c.y) < 240 && use(0, 1.4)) {
      const n = c.stage >= 2 ? 2 : 1;
      const hits = [() => { hit(game, c, e, 10, { knock: c.stage >= 3 ? 160 : 60 }); game.fx.sparks(cx(e), cy(e), '#9fd0ff', 6, 200); if (c.stage >= 3) game.fx.burst(cx(e), cy(e), '#cfe8ff', 8); }];
      c.dash = { e, t: 0, hitAt: 0.16, life: n === 2 ? 0.45 : 0.3, x: cx(e), y: cy(e), hits, done: false };
      if (n === 2) c.fx.push({ kind: 'none', t: 0, life: 0.3, done: false, tick() { if (!this.done && this.t >= 0.28) { this.done = true; if (e.alive) hit(game, c, e, 10, { knock: 60 }); } } });
      game.sfx.play('swing');
    }
    if (c.stage >= 2 && use(1, 3.5)) {
      const base = Math.atan2(cy(e) - c.y, cx(e) - c.x), n = c.stage >= 3 ? 2 : 1;
      for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * 0.25; c.shots.push({ kind: 'gear', x: c.x, y: c.y, vx: Math.cos(a) * 360, vy: Math.sin(a) * 360, t: 0, life: 1.2, dmg: 12, hit: new Set(), alive: true, pierce: true, color: '#c9a052' }); }
    }
    if (c.stage >= 3 && use(2, 7)) {
      const list = foes(game).sort((a, b) => Math.hypot(cx(a) - c.x, cy(a) - c.y) - Math.hypot(cx(b) - c.x, cy(b) - c.y)).slice(0, 4);
      list.forEach((o, i) => c.fx.push({ kind: 'bolt', t: -i * 0.08, life: 0.3, x: cx(o), y: o.y + o.h, top: game.cam.y - 10, o, done: false, tick() { if (!this.done && this.t >= 0) { this.done = true; if (this.o.alive) hit(game, c, this.o, 22, { knock: 60 }); game.fx.sparks(this.x, this.y - 6, '#cfe8ff', 6, 220); } } }));
      game.sfx.play('heavyHit'); game.fx.text(c.x, c.y - 14, '雷の羽', '#9fd0ff', 11);
    }
  },
  chiku(game, c, e, use) {
    if (!c.dash && Math.hypot(cx(e) - c.x, cy(e) - c.y) < 170 && use(0, 1.3)) {
      const n = c.stage;
      c.dash = { e, t: 0, hitAt: 0.14, life: 0.32, x: cx(e), y: cy(e), done: false, hits: [() => { for (let i = 0; i < n; i++) hit(game, c, e, 11, { knock: 50 }); c.fx.push({ kind: 'claw', t: 0, life: 0.22, x: cx(e), y: cy(e), n }); }] };
      game.sfx.play('swing');
    }
    if (c.stage >= 2 && use(1, 5)) {
      const R = c.stage >= 3 ? 100 : 70, slow = c.stage >= 3 ? 2.2 : 1.5;
      for (const o of foes(game)) if (Math.hypot(cx(o) - cx(e), cy(o) - cy(e)) < R) { hit(game, c, o, 10, { knock: 0 }); if (!o.boss && !o.elite) o.lag = Math.max(o.lag || 0, slow); }
      c.fx.push({ kind: 'bell', t: 0, life: 0.45, x: cx(e), y: cy(e), r: R });
      game.sfx.play('tick');
    }
    if (c.stage >= 3 && use(2, 9)) {
      for (let i = 0; i < 9; i++) c.fx.push({ kind: 'shadow', t: -i * 0.06, life: 0.2, done: false, x: 0, y: 0, tick() { if (this.done || this.t < 0) return; this.done = true; const list = foes(game); if (!list.length) return; const o = list[Math.floor(Math.random() * list.length)]; this.x = cx(o); this.y = cy(o); this.a = Math.random() * Math.PI; hit(game, c, o, 12, { knock: 30 }); } });
      game.fx.text(c.x, c.y - 14, '九つの影', '#d8c8ff', 11);
    }
  },
};

// ───────── 仲間を呼ぶ稀少の強化 ─────────
export const CALL_BOON = { hotaru: 'call_hotaru', neji: 'call_neji', chiku: 'call_chiku' };
export const callTarget = (boonId) => Object.keys(CALL_BOON).find((k) => CALL_BOON[k] === boonId) || null;

// ───────── 仲間技「夜明けの協奏」 ─────────
// 3 匹すべてを連れ、3 匹とも最後の姿（★3）まで育ったとき、秒針ゲージが満タンで術ボタンを押すと、
// いつもの時歪・刻閃に重ねて発動する。主人公と 3 匹が力を合わせ、部屋じゅうの敵を打つ
export function unionReady(game) {
  const list = allComps(game);
  return COMPANION_IDS.every((id) => list.some((c) => c.id === id && c.stage >= 3));
}
const U = { sparks: 16, spark: 30, bolt: 40, shadows: 18, shadow: 30, dawn: 120, dawnAt: 2.0, life: 2.6 };
export const UNION = U;
function unionHit(game, e, base, knock = 80) {
  if (!e.alive || (e.boss && e.defeated)) return;
  game.dealDamage(e, { base, cat: 'skill', knock, dir: sign(cx(e) - cx(game.player)) || 1, spell: true, companion: true, union: true });
}
export function castUnion(game) {
  const p = game.player, list = allComps(game);
  game.union = { t: 0, dawn: false };
  p.iframeT = Math.max(p.iframeT, U.life);
  for (const c of list) c.pop = 2.4;
  game.fx.setBanner('仲間技「夜明けの協奏」', 'ホタル・ネジ・チク、そしてあなたの力をひとつに', '#ffe6a0', 2.6);
  game.fx.screenFlash('#ffe6a0', 0.4); game.sfx.play('perfect'); game.sfx.play('bossBell');
  const foes = () => game.room.enemies.filter((e) => e.alive && !(e.boss && e.defeated) && !e.invuln);
  const by = (id) => list.find((c) => c.id === id);
  const ho = by('hotaru'), ne = by('neji'), ch = by('chiku');
  // ホタル：星火の大雨
  for (let i = 0; i < U.sparks; i++) {
    const f = { kind: 'spark', t: -0.3 - i * 0.05, life: 0.5, at: 0.3, x: 0, y: 0, o: null, done: false };
    f.tick = () => { if (f.t < 0) return; const fs = foes(); if (!fs.length) { f.done = true; return; } if (!f.o) { f.o = fs[i % fs.length]; f.x = cx(f.o) + ((i * 7) % 13 - 6); f.y = cy(f.o); } if (!f.done && f.t >= f.at) { f.done = true; unionHit(game, f.o, U.spark, 60); game.fx.burst(f.x, f.y, '#ffe14a', 8); } };
    ho.fx.push(f);
  }
  // ネジ：すべての敵へ雷を二度
  for (let k = 0; k < 2; k++) {
    const f = { kind: 'none', t: -0.5 - k * 0.35, life: 0.1, done: false };
    f.tick = () => { if (f.done || f.t < 0) return; f.done = true; for (const e of foes()) { ne.fx.push({ kind: 'bolt', t: 0, life: 0.3, x: cx(e), y: e.y + e.h, top: game.cam.y - 10 }); unionHit(game, e, U.bolt, 60); } game.sfx.play('heavyHit'); game.fx.shake(5, 0.15); };
    ne.fx.push(f);
  }
  // チク：影が 18 回裂く
  for (let i = 0; i < U.shadows; i++) {
    const f = { kind: 'shadow', t: -0.7 - i * 0.04, life: 0.2, done: false, x: 0, y: 0 };
    f.tick = () => { if (f.done || f.t < 0) return; f.done = true; const fs = foes(); if (!fs.length) return; const o = fs[i % fs.length]; f.x = cx(o); f.y = cy(o); f.a = (i * 0.9) % Math.PI; unionHit(game, o, U.shadow, 30); };
    ch.fx.push(f);
  }
}
function updateUnion(game, dt) {
  const u = game.union;
  u.t += dt;
  if (!u.dawn && u.t >= U.dawnAt) {
    // 夜明けの一閃：部屋じゅうの敵を、金色の光がまとめて打つ
    u.dawn = true;
    for (const e of game.room.enemies) unionHit(game, e, U.dawn, 220);
    game.fx.screenFlash('#fff6d0', 0.6); game.fx.shake(14, 0.5); game.sfx.play('guardBreak'); game.sfx.play('heavyHit');
    game.hitstop = Math.max(game.hitstop, 10 / 60);
  }
  if (u.t > U.life) game.union = null;
}
