// 術（じゅつ）：秒針ゲージで放つ「発動する術」と、条件で自動的に出る「発動条件つきの術」。
// 術の当たり判定はここで持ち、ダメージ計算は game.dealDamage（cat:'skill', spell:true）に任せる。
import { cx, cy, sign, clamp } from './util.js';
import { PASSIVE_IDS, FUSED_PASSIVES, passiveSynergy } from './boons.js';

const lvMul = (lv) => 1 + 0.4 * (lv - 1);
// 発動する術（V／時歪ボタン）。1 つだけ装着でき、取り直すと Lv が上がる
export const ACTIVE_ARTS = {
  flamering: { cost: (lv) => 40 - 3 * (lv - 1), color: '#ff7a3c' },
  starfall: { cost: (lv) => 55 - 4 * (lv - 1), color: '#ffe14a' },
  rewindblade: { cost: (lv) => 35 - 3 * (lv - 1), color: '#9fe3ff' },
  belltoll: { cost: (lv) => 45 - 3 * (lv - 1), color: '#f2c14e' },
  timequake: { cost: (lv) => 60 - 4 * (lv - 1), color: '#c8b0ff' },
  thunderstorm: { cost: (lv) => 55 - 4 * (lv - 1), color: '#cfe8ff' },
  heavenblade: { cost: (lv) => 45 - 3 * (lv - 1), color: '#ffe9a0' },
  prismbeam: { cost: (lv) => 50 - 3 * (lv - 1), color: '#ff9af0' },
  novaorb: { cost: (lv) => 45 - 3 * (lv - 1), color: '#9fe3ff' },
};

export class Spell {
  constructor(kind, x, y, opts = {}) {
    this.kind = kind; this.x = x; this.y = y; this.t = 0; this.alive = true;
    this.hit = new Set();
    Object.assign(this, opts);
  }
}

// 線分（手元→剣先）に触れている敵
function enemiesOnSegment(game, x1, y1, x2, y2, pad = 8) {
  const out = [];
  const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.ceil(len / 12));
  for (const e of game.room.enemies) {
    if (!e.alive || (e.boss && e.defeated)) continue;
    for (let i = 0; i <= n; i++) {
      const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n;
      if (x > e.x - pad && x < e.x + e.w + pad && y > e.y - pad && y < e.y + e.h + pad) { out.push(e); break; }
    }
  }
  return out;
}
// 手元の位置（剣を持つ手）
const handOf = (p) => ({ x: cx(p) + p.face * 6, y: cy(p) - 2 });

function enemiesNear(game, x, y, r) {
  return game.room.enemies.filter((e) => e.alive && !(e.boss && e.defeated) && Math.hypot(cx(e) - x, cy(e) - y) <= r);
}
function strike(game, sp, e, base, extra = {}) {
  if (!e.alive) return;
  // 剣の道の飛ぶ斬撃は「連撃」扱い（術の守りに阻まれない・対策は連撃として受ける）
  if (sp.melee) { game.dealDamage(e, { base, cat: 'combo', knock: extra.knock || 120, dir: extra.dir || sign(cx(e) - sp.x) || 1, proj: true, ...extra }); return; }
  game.dealDamage(e, { base, cat: 'skill', knock: extra.knock || 120, dir: extra.dir || sign(cx(e) - sp.x) || 1, spell: true, passive: !!sp.passive, ...extra });
}

// ───────── 時歪の必殺技「刻閃（こくせん）」 ─────────
// 回避で身をかわしたあと、部屋の敵の数と同じ本数の白い直線の斬撃を、画面外から画面外へ超高速で続けて走らせる。
// 線はそれぞれ 1 体の敵を貫く向きに引かれ、線上の敵すべてに当たる。最後に全ての線が砕けて、もう一度斬れる
export const WARP_SLASH = { start: 0.3, every: 0.055, dmg: 18, shatter: 0.5, len: 1400 };
export function castWarpSlash(game) {
  const p = game.player, rng = game.fx;
  const foes = game.room.enemies.filter((e) => e.alive && !(e.boss && e.defeated) && !e.invuln);
  const st = p.stats || {};
  const mul = 1 + 0.25 * ((st.skillTimeAdd || 0) / 0.5); // 長い一秒で少し伸びる
  const lines = [];
  const n = Math.max(foes.length, 3);
  for (let i = 0; i < n; i++) {
    const e = foes.length ? foes[i % foes.length] : null;
    const ax = e ? cx(e) : cx(p) + (rng.rand() - 0.5) * 300, ay = e ? cy(e) : cy(p) + (rng.rand() - 0.5) * 120;
    // 斜めに交差するよう、角度を交互に振る
    const a = (i % 2 ? 1 : -1) * (0.15 + rng.rand() * 0.6) + (i % 3 === 2 ? Math.PI / 2 * 0.9 : 0);
    const L = WARP_SLASH.len;
    lines.push({ x1: ax - Math.cos(a) * L, y1: ay - Math.sin(a) * L, x2: ax + Math.cos(a) * L, y2: ay + Math.sin(a) * L, at: WARP_SLASH.start + i * WARP_SLASH.every, done: false, real: !!e });
  }
  const sp = new Spell('warpslash', cx(p), cy(p), { lines, life: WARP_SLASH.start + n * WARP_SLASH.every + WARP_SLASH.shatter + 0.3, dmg: WARP_SLASH.dmg * mul, shattered: false });
  game.room.spells.push(sp);
  return sp;
}

// ───────── 発動 ─────────
export function castArt(game, art) {
  const p = game.player, lv = art.tier || 1, f = p.face;
  const px = cx(p), py = cy(p);
  const m = lvMul(lv);
  switch (art.id) {
    case 'flamering':
      game.room.spells.push(new Spell('flamering', px, py + 6, { r: 0, maxR: 105 + 10 * lv, pulses: 3, pulse: 0, dmg: 22 * m }));
      game.sfx.play('skill'); game.fx.screenFlash('#ff7a3c', 0.18);
      break;
    case 'starfall': {
      const targets = enemiesNear(game, px, py, 460).sort((a, b) => Math.abs(cx(a) - px) - Math.abs(cx(b) - px));
      const n = 4 + lv;
      for (let i = 0; i < n; i++) {
        const e = targets[i % Math.max(1, targets.length)];
        const tx = e ? cx(e) + (i >= targets.length ? (i - targets.length) * 30 - 30 : 0) : px + f * (80 + i * 50);
        const ty = e ? cy(e) : game.map.groundBelow(tx, py) - 10;
        game.room.spells.push(new Spell('star', tx + (Math.random() - 0.5) * 10, ty, { delay: i * 0.1, fall: 0.32, dmg: 30 * m, from: { x: tx - 120, y: ty - 260 } }));
      }
      game.sfx.play('perfect'); game.fx.screenFlash('#ffe14a', 0.15);
      break;
    }
    case 'rewindblade':
      game.room.spells.push(new Spell('blade', px + f * 20, py, { vx: f * 560, life: 0.9, h: 70 + 6 * lv, dmg: 42 * m, face: f }));
      game.sfx.play('heavySwing'); game.fx.shake(3, 0.1);
      break;
    case 'belltoll':
      game.room.spells.push(new Spell('toll', px, py, { r: 0, maxR: 165 + 12 * lv, dmg: 34 * m }));
      game.sfx.play('bossBell'); game.fx.shake(5, 0.2); game.fx.screenFlash('#f2c14e', 0.2);
      break;
  }
  if (art.id === 'timequake') {
    // 部屋じゅうの敵を打つ（威力は低め）
    for (const e of game.room.enemies) {
      if (!e.alive || (e.boss && e.defeated)) continue;
      const sp = new Spell('roomhit', cx(e), cy(e), { life: 0.45, top: e.y });
      game.room.spells.push(sp);
      strike(game, sp, e, 16 * m, { knock: 60 });
      if (e.alive && !e.boss && !e.elite && e.setState) { e.setState('flinch'); e.stateT = -0.3; }
    }
    game.sfx.play('bossBell'); game.fx.shake(6, 0.3); game.fx.screenFlash('#c8b0ff', 0.25);
  }
  if (art.id === 'thunderstorm') {
    game.room.spells.push(new Spell('storm', px, py, { life: 1.5, every: 1.5 / (26 + 2 * lv), dmg: 15 * m, acc: 0 }));
    game.sfx.play('guardBreak'); game.fx.screenFlash('#e8f0ff', 0.35); game.fx.shake(5, 0.3);
  }
  if (art.id === 'heavenblade') {
    // 背中の上（-100°）から前の下（+60°）まで、手元を軸に大きく回す
    game.room.spells.push(new Spell('longblade', px, py, { owner: p, life: 0.5, len: 380 + 20 * lv, a0: -Math.PI * 0.55, a1: Math.PI * 0.35, dmg: 50 * m, face: f, trail: [] }));
    game.sfx.play('heavySwing'); game.fx.shake(4, 0.2);
  }
  if (art.id === 'prismbeam') {
    game.room.spells.push(new Spell('beam', px, py, { owner: p, life: 1.0, face: f, dmg: 9 * m, tick: 0, len: 0 }));
    game.sfx.play('shoot'); game.fx.screenFlash('#ffd0f8', 0.15);
  }
  if (art.id === 'novaorb') {
    game.room.spells.push(new Spell('orb', px + f * 30, py - 4, { vx: f * 210, life: 2.2, r: 30, dmg: 8 * m, boom: 50 * m, tick: 0 }));
    game.sfx.play('charged');
  }
  game.emit('art', { id: art.id });
}

// 斬撃波（稀少）：地上の攻撃のたびに前へ飛ぶ小さな斬撃
export function spawnWave(game, p) {
  const f = p.face;
  game.room.spells.push(new Spell('blade', cx(p) + f * 18, cy(p), { vx: f * 480, life: 0.45, h: 34, dmg: 30, face: f }));
}

// ───────── 剣の道（素の攻撃から出る斬撃） ─────────
export const MELEE = {
  // 剣気：連撃の振りから飛ぶ斬撃（千刃なら 3 本）
  qi(game, p) {
    const st = p.stats, f = p.face;
    const lv = st.thousand || st.swordqi;
    const n = st.thousand ? 3 : lv >= 3 ? 2 : 1;
    const dmg = (st.thousand ? 16 : 14) * lvMul(lv);
    for (let i = 0; i < n; i++) {
      const oy = n === 1 ? 0 : (i - (n - 1) / 2) * 12;
      game.room.spells.push(new Spell('blade', cx(p) + f * 18, cy(p) + oy, { melee: true, vx: f * 540, life: 0.38, h: 26, dmg, face: f, small: true }));
    }
  },
  // 残心：少し遅れて十字の追撃
  cross(game, e, lv) { game.room.spells.push(new Spell('cross', cx(e), cy(e), { melee: true, delay: 0.3, dmg: 34 * lvMul(lv), target: e })); },
  // 破砕：重撃から床を走る衝撃波
  crush(game, p, lv) {
    const fy = Math.min(game.map.groundBelow(cx(p), p.y + p.h - 4), game.map.pxH);
    game.room.spells.push(new Spell('groundwave', cx(p) + p.face * 20, fy, { melee: true, vx: p.face * 480, life: 0.8, dmg: 40 * lvMul(lv), big: true }));
    game.fx.shake(3, 0.1);
  },
  // 天裂：上攻撃は真上へ、下攻撃は真下へ刃
  rend(game, p, lv, dir) { game.room.spells.push(new Spell('vblade', cx(p), cy(p) + dir * 10, { melee: true, vy: dir * 560, life: 0.4, dmg: 34 * lvMul(lv) })); },
  // 剣聖：会心の一撃で斬撃が飛ぶ
  saint(game, p, lv) { game.room.spells.push(new Spell('blade', cx(p) + p.face * 18, cy(p), { melee: true, vx: p.face * 600, life: 0.45, h: 44, dmg: 30 * lvMul(lv), face: p.face })); },
};

// ───────── 発動条件つき ─────────
export const PROCS = {
  // 10 コンボごとに、追尾する秒針を 3 本
  secondhand(game, lv) {
    const p = game.player;
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i - 1) * 0.7;
      game.room.spells.push(new Spell('hand', cx(p) + Math.cos(a) * 16, cy(p) + Math.sin(a) * 16, { vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 1.6, dmg: 18 * lvMul(lv), delay: i * 0.06 }));
    }
    game.sfx.play('charged');
  },
  // ジャスト回避で、近くの敵を斬り抜ける
  riposte(game, lv) {
    const p = game.player;
    const e = enemiesNear(game, cx(p), cy(p), 190).sort((a, b) => Math.abs(cx(a) - cx(p)) - Math.abs(cx(b) - cx(p)))[0];
    if (!e) return;
    const dir = sign(cx(e) - cx(p)) || p.face;
    const sp = new Spell('riposte', cx(p), cy(p), { tx: cx(e) + dir * 40, ty: cy(e), life: 0.25 });
    game.room.spells.push(sp);
    strike(game, sp, e, 60 * lvMul(lv), { dir, knock: 220 });
    p.iframeT = Math.max(p.iframeT, 0.35);
    game.sfx.play('heavySwing');
  },
  // 重撃の命中に雷を落とす（近くの 1 体へ連鎖）
  thunderbell(game, lv, e, mul = 1, passive = false) {
    const sp = new Spell('thunder', cx(e), cy(e), { life: 0.3, chain: null, passive });
    game.room.spells.push(sp);
    strike(game, sp, e, 45 * lvMul(lv) * mul, { knock: 60 });
    const other = enemiesNear(game, cx(e), cy(e), 170).find((o) => o !== e);
    if (other) { sp.chain = { x: cx(other), y: cy(other) }; strike(game, sp, other, 22 * lvMul(lv) * mul, { knock: 60 }); }
    game.fx.screenFlash('#e8f0ff', 0.2); game.fx.shake(4, 0.12); game.sfx.play('guardBreak');
  },
  // 空中で 3 回当てると、真下へ急降下して着地の衝撃波
  plunge(game, lv) {
    const p = game.player;
    p.vy = 900; p.plunging = { dmg: 32 * lvMul(lv) };
    game.sfx.play('dodge');
  },
  // 瀕死のあいだ、命中した敵が炎を噴く
  lastlight(game, lv, e) {
    game.room.spells.push(new Spell('ember', cx(e), cy(e), { r: 0, maxR: 40, dmg: 12 * lvMul(lv) }));
  },
};

// ───────── 毎フレームの更新（当たり判定） ─────────
export function updateSpells(game, dt) {
  const room = game.room, p = game.player;
  // 急降下の着地
  if (p.plunging && p.onGround) {
    room.spells.push(new Spell('quake', cx(p), p.y + p.h, { r: 0, maxR: 95, dmg: p.plunging.dmg }));
    p.plunging = null;
    game.fx.shake(6, 0.2); game.fx.dust(cx(p), p.y + p.h, 14); game.sfx.play('heavyHit');
  }
  for (const sp of room.spells) {
    sp.t += dt;
    switch (sp.kind) {
      case 'warpslash': {
        for (const ln of sp.lines) {
          if (ln.done || sp.t < ln.at) continue;
          ln.done = true;
          for (const e of enemiesOnSegment(game, ln.x1, ln.y1, ln.x2, ln.y2, 6)) {
            strike(game, sp, e, sp.dmg, { knock: 40, dir: sign(ln.x2 - ln.x1) || 1 });
            (sp.cut ||= new Map()).set(e, (sp.cut.get(e) || 0) + 1);
            game.fx.sparks(cx(e), cy(e), '#ffffff', 8, 320);
          }
          game.sfx.play('swing'); game.fx.shake(3, 0.06);
          game.hitstop = Math.max(game.hitstop, 2 / 60);
        }
        const last = sp.lines[sp.lines.length - 1].at;
        if (!sp.shattered && sp.t >= last + WARP_SLASH.shatter) {
          // 納刀：全ての線が一度に砕け、斬られた敵はもう一度（斬られた本数ぶん強く）斬れる
          sp.shattered = true; sp.shatterT = sp.t;
          for (const [e, k] of sp.cut || []) {
            if (!e.alive) continue; strike(game, sp, e, sp.dmg * 0.6 * Math.min(k, 3), { knock: 160 }); game.fx.burst(cx(e), cy(e), '#e8f4ff', 16);
          }
          game.fx.screenFlash('#ffffff', 0.45); game.fx.shake(12, 0.4); game.sfx.play('guardBreak'); game.sfx.play('heavyHit');
          game.hitstop = Math.max(game.hitstop, 8 / 60);
        }
        if (sp.t > sp.life) sp.alive = false;
        break;
      }
      case 'flamering': {
        const pt = sp.t - sp.pulse * 0.35;
        sp.r = clamp(pt / 0.25, 0, 1) * sp.maxR;
        for (const e of enemiesNear(game, sp.x, sp.y, sp.r)) if (!sp.hit.has(e.id + ':' + sp.pulse)) { sp.hit.add(e.id + ':' + sp.pulse); strike(game, sp, e, sp.dmg, { knock: 90 }); }
        if (pt > 0.35) { sp.pulse++; if (sp.pulse >= sp.pulses) sp.alive = false; }
        if (Math.random() < 0.6) game.fx.sparks(sp.x + (Math.random() - 0.5) * sp.r * 2, sp.y + 4, Math.random() < 0.5 ? '#ff7a3c' : '#ffe14a', 1, 90);
        break;
      }
      case 'star': {
        if (sp.track && sp.track.alive && !sp.boomed) { sp.x = cx(sp.track); sp.y = cy(sp.track); } // 星喰らいの流星は狙った敵を追う
        if (sp.t < sp.delay) break;
        const k = (sp.t - sp.delay) / sp.fall;
        if (k >= 1 && !sp.boomed) {
          sp.boomed = true;
          for (const e of enemiesNear(game, sp.x, sp.y, 44)) strike(game, sp, e, sp.dmg, { knock: 140 });
          game.fx.burst(sp.x, sp.y, '#ffe14a', 14); game.fx.shake(2, 0.06); game.sfx.play('hit');
        }
        if (k > 1.6) sp.alive = false;
        break;
      }
      case 'blade': {
        sp.x += sp.vx * dt;
        const box = { x: sp.x - 20, y: sp.y - sp.h / 2, w: 40, h: sp.h };
        for (const e of room.enemies) if (e.alive && !sp.hit.has(e.id) && e.x < box.x + box.w && e.x + e.w > box.x && e.y < box.y + box.h && e.y + e.h > box.y) { sp.hit.add(e.id); strike(game, sp, e, sp.dmg, { dir: sp.face, knock: 200 }); }
        if (sp.t > sp.life || game.map.solidAt(sp.x + sp.face * 20, sp.y)) sp.alive = false;
        break;
      }
      case 'toll': case 'quake': case 'ember': {
        const dur = sp.kind === 'toll' ? 0.45 : sp.kind === 'quake' ? 0.25 : 0.2;
        sp.r = clamp(sp.t / dur, 0, 1) * sp.maxR;
        for (const e of enemiesNear(game, sp.x, sp.y, sp.r)) if (!sp.hit.has(e.id)) {
          sp.hit.add(e.id);
          strike(game, sp, e, sp.dmg, { knock: sp.kind === 'toll' ? 320 : 160 });
          if (sp.kind === 'toll' && e.alive && !e.boss && !e.elite && e.setState) { e.setState('flinch'); e.stateT = -0.6; }
        }
        if (sp.t > dur + 0.25) sp.alive = false;
        break;
      }
      case 'hand': {
        if (sp.t < (sp.delay || 0)) break;
        const tgt = room.enemies.filter((e) => e.alive && !(e.boss && e.defeated)).sort((a, b) => Math.hypot(cx(a) - sp.x, cy(a) - sp.y) - Math.hypot(cx(b) - sp.x, cy(b) - sp.y))[0];
        if (tgt) {
          const ax = cx(tgt) - sp.x, ay = cy(tgt) - sp.y, d = Math.hypot(ax, ay) || 1;
          sp.vx += (ax / d * 520 - sp.vx) * Math.min(1, dt * 6); sp.vy += (ay / d * 520 - sp.vy) * Math.min(1, dt * 6);
          if (d < 14 && !sp.hit.has(tgt.id)) { sp.hit.add(tgt.id); strike(game, sp, tgt, sp.dmg, { knock: 80 }); sp.alive = false; game.fx.sparks(sp.x, sp.y, '#f2c14e', 6); }
        }
        sp.x += sp.vx * dt; sp.y += sp.vy * dt;
        if (sp.t > sp.life) sp.alive = false;
        break;
      }
      case 'storm': {
        // 画面じゅうに雷：半分は敵の真上へ、残りは画面のどこかへ
        sp.acc += dt;
        while (sp.acc >= sp.every && sp.t < sp.life) {
          sp.acc -= sp.every;
          const foes = room.enemies.filter((e) => e.alive && !(e.boss && e.defeated));
          const pick = foes.length && Math.random() < 0.6 ? foes[Math.floor(Math.random() * foes.length)] : null;
          const bx = pick ? cx(pick) + (Math.random() - 0.5) * 16 : game.cam.x + Math.random() * 640;
          const gy = Math.min(game.map.groundBelow(bx, game.cam.y + 10), game.map.pxH);
          room.spells.push(new Spell('bolt', bx, gy, { life: 0.3, top: game.cam.y - 20, seed: Math.random() * 99 }));
          for (const e of room.enemies) if (e.alive && !(e.boss && e.defeated) && Math.abs(cx(e) - bx) < e.w / 2 + 16) strike(game, sp, e, sp.dmg, { knock: 50 });
          game.fx.sparks(bx, gy - 4, '#cfe8ff', 5, 200);
          if (Math.random() < 0.35) game.fx.shake(2.5, 0.06);
        }
        if (sp.t > sp.life) sp.alive = false;
        break;
      }
      case 'bolt': if (sp.t > sp.life) sp.alive = false; break;
      case 'longblade': case 'spinsweep': {
        // 手元を軸に回る長い剣（剣先までの線が回転する）
        const p2 = sp.owner || p, h = handOf(p2);
        const k = Math.min(1, sp.t / sp.life), ease = 1 - Math.pow(1 - k, 2);
        const ang = sp.a0 + (sp.a1 - sp.a0) * ease;
        const dirA = sp.face > 0 ? ang : Math.PI - ang;
        sp.x = h.x; sp.y = h.y; sp.ang = dirA;
        sp.tx = h.x + Math.cos(dirA) * sp.len; sp.ty = h.y + Math.sin(dirA) * sp.len;
        (sp.trail ||= []).push(dirA); if (sp.trail.length > 7) sp.trail.shift();
        const rev = Math.floor((ang - sp.a0) / (Math.PI * 2)); if (rev !== (sp.rev || 0)) { sp.rev = rev; sp.hit.clear(); } // 一周ごとに当たり直す
        for (const e of enemiesOnSegment(game, h.x, h.y, sp.tx, sp.ty)) if (!sp.hit.has(e.id)) { sp.hit.add(e.id); strike(game, sp, e, sp.dmg, { knock: 160, dir: sign(cx(e) - h.x) || 1 }); game.fx.sparks(cx(e), cy(e), '#fff2c0', 8, 260); }
        if (sp.t > sp.life + 0.12) sp.alive = false;
        break;
      }
      case 'beam': {
        const p2 = sp.owner || p, h = handOf(p2);
        sp.x = h.x; sp.y = h.y; sp.face = p2.face;
        let len = 0; while (len < 640 && !game.map.solidAt(h.x + sp.face * (len + 12), h.y)) len += 12;
        sp.len = len;
        sp.tick -= dt;
        if (sp.tick <= 0) {
          sp.tick = 0.09;
          const x0 = sp.face > 0 ? h.x : h.x - len;
          for (const e of room.enemies) if (e.alive && !(e.boss && e.defeated) && e.x < x0 + len && e.x + e.w > x0 && e.y < h.y + 15 && e.y + e.h > h.y - 15) { strike(game, sp, e, sp.dmg, { knock: 30, dir: sp.face }); if (Math.random() < 0.5) game.fx.sparks(cx(e), h.y, ['#ff9af0', '#9fe3ff', '#ffe14a'][Math.floor(Math.random() * 3)], 3, 220); }
          game.fx.shake(1.2, 0.05);
        }
        if (sp.t > sp.life) sp.alive = false;
        break;
      }
      case 'orb': {
        sp.x += sp.vx * dt; sp.y += Math.sin(sp.t * 5) * 20 * dt;
        sp.tick -= dt;
        if (sp.tick <= 0) { sp.tick = 0.15; for (const e of enemiesNear(game, sp.x, sp.y, sp.r + 10)) strike(game, sp, e, sp.dmg, { knock: 40 }); }
        if (Math.random() < 0.7) game.fx.sparks(sp.x + (Math.random() - 0.5) * sp.r * 2, sp.y + (Math.random() - 0.5) * sp.r * 2, Math.random() < 0.5 ? '#9fe3ff' : '#ffffff', 1, 80);
        if (sp.t > sp.life || game.map.solidAt(sp.x + Math.sign(sp.vx) * sp.r, sp.y)) {
          sp.alive = false;
          for (const e of enemiesNear(game, sp.x, sp.y, 110)) strike(game, sp, e, sp.boom, { knock: 260 });
          game.fx.burst(sp.x, sp.y, '#9fe3ff', 40); game.fx.ring(sp.x, sp.y, '#ffffff', 220, 0.45); game.fx.ring(sp.x, sp.y, '#9fe3ff', 150, 0.35);
          game.fx.screenFlash('#cfefff', 0.35); game.fx.shake(9, 0.35); game.sfx.play('heavyHit');
        }
        break;
      }
      case 'tornado': {
        sp.x += (sp.vx || 0) * dt;
        sp.tick = (sp.tick || 0) - dt;
        for (const e of room.enemies) if (e.alive && !e.boss && !e.elite && Math.abs(cx(e) - sp.x) < 110 && Math.abs(cy(e) - sp.y) < 80) e.vx += sign(sp.x - cx(e)) * 900 * dt; // 吸い込む
        if (sp.tick <= 0) { sp.tick = 0.3; for (const e of room.enemies) if (e.alive && !(e.boss && e.defeated) && Math.abs(cx(e) - sp.x) < sp.w && Math.abs(cy(e) - sp.y) < 70) strike(game, sp, e, sp.dmg, { knock: 0 }); }
        if (Math.random() < 0.6) game.fx.sparks(sp.x + (Math.random() - 0.5) * 30, sp.y + 30 - Math.random() * 70, sp.color || '#cfe8ff', 1, 120);
        if (sp.t > sp.life || game.map.solidAt(sp.x + sign(sp.vx || 1) * 20, sp.y)) sp.alive = false;
        break;
      }
      case 'cross': {
        if (sp.t >= sp.delay && !sp.boomed) {
          sp.boomed = true;
          const e = sp.target;
          if (e && e.alive) { sp.x = cx(e); sp.y = cy(e); strike(game, sp, e, sp.dmg, { knock: 80 }); }
          game.fx.sparks(sp.x, sp.y, '#ffffff', 6, 200);
        }
        if (sp.t > sp.delay + 0.22) sp.alive = false;
        break;
      }
      case 'vblade': {
        sp.y += sp.vy * dt;
        const box = { x: sp.x - 16, y: sp.y - 20, w: 32, h: 40 };
        for (const e of room.enemies) if (e.alive && !sp.hit.has(e.id) && e.x < box.x + box.w && e.x + e.w > box.x && e.y < box.y + box.h && e.y + e.h > box.y) { sp.hit.add(e.id); strike(game, sp, e, sp.dmg, { knock: 60, lift: sp.vy < 0 ? 300 : 0 }); }
        if (sp.t > sp.life || game.map.solidAt(sp.x, sp.y + Math.sign(sp.vy) * 20)) sp.alive = false;
        break;
      }
      case 'groundwave': {
        // 床を走る衝撃波：床の上にいる敵に一度ずつ当たる（t が負の間は待機）
        if (sp.t < 0) break;
        sp.x += sp.vx * dt;
        for (const e of room.enemies) if (e.alive && !(e.boss && e.defeated) && !sp.hit.has(e.id) && Math.abs(cx(e) - sp.x) < e.w / 2 + 14 && Math.abs(e.y + e.h - sp.y) < 40) { sp.hit.add(e.id); strike(game, sp, e, sp.dmg, { knock: 60, dir: sign(sp.vx) }); }
        if (sp.t > sp.life || game.map.solidAt(sp.x + sign(sp.vx) * 8, sp.y - 10)) sp.alive = false;
        break;
      }
      case 'spike': {
        if (sp.t >= sp.delay && !sp.boomed) {
          sp.boomed = true;
          for (const e of room.enemies) if (e.alive && !(e.boss && e.defeated) && Math.abs(cx(e) - sp.x) < e.w / 2 + 16 && Math.abs(e.y + e.h - sp.y) < 50) { strike(game, sp, e, sp.dmg, { knock: 40 }); if (sp.ice && !e.boss && !e.elite) e.lag = Math.max(e.lag || 0, 1.5); }
          game.fx.sparks(sp.x, sp.y - 10, sp.ice ? '#9fe3ff' : '#e8f0ff', 6, 220);
        }
        if (sp.t > sp.delay + 0.45) sp.alive = false;
        break;
      }
      case 'burnfloor': {
        sp.tick = (sp.tick || 0) - dt;
        if (sp.tick <= 0) {
          sp.tick = 0.3;
          for (const e of room.enemies) if (e.alive && !(e.boss && e.defeated) && Math.abs(cx(e) - sp.x) < sp.half && Math.abs(e.y + e.h - sp.y) < 34) strike(game, sp, e, sp.dmg, { knock: 0 });
        }
        if (Math.random() < 0.5) game.fx.sparks(sp.x + (Math.random() - 0.5) * sp.half * 2, sp.y - 2, Math.random() < 0.5 ? '#ff7a3c' : '#ffe14a', 1, 70);
        if (sp.t > sp.life) sp.alive = false;
        break;
      }
      case 'riposte': case 'thunder': case 'zap': case 'roomhit':
        if (sp.t > sp.life) sp.alive = false;
        break;
      case 'frost': {
        sp.r = clamp(sp.t / 0.3, 0, 1) * sp.maxR;
        for (const e of enemiesNear(game, sp.x, sp.y, sp.r)) if (!sp.hit.has(e.id)) {
          sp.hit.add(e.id); strike(game, sp, e, sp.dmg, { knock: 80 });
          if (!e.boss && !e.elite) e.lag = Math.max(e.lag || 0, sp.slow);
          game.fx.sparks(cx(e), cy(e), '#cfe8ff', 5, 160);
        }
        if (sp.t > 0.55) sp.alive = false;
        break;
      }
      case 'sword': {
        if (sp.t < sp.delay) break;
        const k = (sp.t - sp.delay) / sp.fall;
        if (k >= 1 && !sp.boomed) {
          sp.boomed = true;
          for (const e of room.enemies) if (e.alive && !(e.boss && e.defeated) && Math.abs(cx(e) - sp.x) < 26 && sp.y > e.y - 10 && sp.y - 60 < e.y + e.h) strike(game, sp, e, sp.dmg, { knock: 60 });
          game.fx.sparks(sp.x, sp.y, '#e8f4ff', 6, 200); game.fx.shake(1, 0.04);
        }
        if (k > 2.4) sp.alive = false;
        break;
      }
      case 'gear': {
        // 行きは減速し、半分を過ぎたら持ち主のもとへ戻る（行きと帰りで当たり直す）
        const half = sp.life / 2, back = sp.t > half;
        const tx = back ? cx(p) : sp.ox + sp.face * 260;
        if (back && !sp.turned) { sp.turned = true; sp.hit.clear(); }
        sp.x += (tx - sp.x) * Math.min(1, dt * (back ? 7 : 4.5));
        sp.y += (cy(p) - 4 - sp.y) * Math.min(1, dt * 4);
        for (const e of room.enemies) if (e.alive && !(e.boss && e.defeated) && !sp.hit.has(e.id) && Math.abs(cx(e) - sp.x) < e.w / 2 + 14 && Math.abs(cy(e) - sp.y) < e.h / 2 + 14) { sp.hit.add(e.id); strike(game, sp, e, sp.dmg, { knock: 90 }); game.fx.sparks(sp.x, sp.y, '#c9a052', 5, 220); }
        if (sp.t > sp.life || (back && Math.abs(sp.x - cx(p)) < 12)) sp.alive = false;
        break;
      }
      case 'trail': {
        sp.tick = (sp.tick || 0) - dt;
        if (sp.tick <= 0) {
          sp.tick = 0.4;
          for (const e of room.enemies) if (e.alive && !(e.boss && e.defeated) && Math.abs(cx(e) - sp.x) < e.w / 2 + 8 && sp.y > e.y - 6 && sp.y < e.y + e.h + 8) strike(game, sp, e, sp.dmg, { knock: 20 });
        }
        if (Math.random() < 0.15) game.fx.sparks(sp.x + (Math.random() - 0.5) * 8, sp.y, Math.random() < 0.5 ? '#ff7a3c' : '#ffe14a', 1, 50);
        if (sp.t > sp.life) sp.alive = false;
        break;
      }
    }
  }
  room.spells = room.spells.filter((s) => s.alive);
}

// ───────── 常に発動する術（パッシブ） ─────────
// orbit：体のまわりを秒針が回る／aura：炎の波動／seeker：追尾する秒針／chainlight：連鎖する雷
// meteor：流星／frostnova：氷の波動（遅くする）／swordrain：光の剣の雨／gearsaw：往復する歯車
// stormcloud：頭上の雷雲／wake：走った跡の炎
// 種類を多く持つほど、すべての常時の術が強くなる（術の共鳴）
function nearestTargets(game, x, y, r) {
  return enemiesNear(game, x, y, r).sort((a, b) => Math.hypot(cx(a) - x, cy(a) - y) - Math.hypot(cx(b) - x, cy(b) - y));
}
export function updatePassives(game, dt) {
  const p = game.player, pv = p.stats.passives;
  if (!pv || p.state === 'dead') return;
  const T = (p.passiveT ||= { orbitHit: {} });
  // 刻の支配者（伝説）：10 秒ごとに刻閃が自動で走る
  if (p.stats.chronarch && game.room.enemies.some((e) => e.alive && !(e.boss && e.defeated)) && !game.room.spells.some((s) => s.kind === 'warpslash')) {
    T.chronarch = (T.chronarch || 0) + dt;
    if (T.chronarch >= 10) { T.chronarch = 0; castWarpSlash(game); game.fx.text(cx(p), p.y - 26, '刻閃', '#ff7ae0', 16); game.sfx.play('skill'); }
  }
  dt *= p.stats.passiveSpeed || 1; // 星の心臓：常時の術が速く回る
  const px = cx(p), py = cy(p);
  const owned = PASSIVE_IDS.filter((id) => pv[id]).length + FUSED_PASSIVES.filter((id) => pv[id]).length; // 合成した術は 2 種ぶん
  const syn = passiveSynergy(owned) * (p.stats.passiveMul || 1); // 星界の地図
  p.passiveSyn = syn;
  const dmg = (base, id) => base * lvMul(pv[id]) * syn;
  const tick = (id, period) => { T[id] = (T[id] || 0) + dt; if (T[id] >= period) { T[id] = 0; return true; } return false; };
  const anyFoe = () => game.room.enemies.some((e) => e.alive && !(e.boss && e.defeated));
  if (pv.orbit) {
    T.orbit = (T.orbit || 0) + dt;
    const n = 1 + pv.orbit, r = 34;
    p.orbitHands = [];
    for (let i = 0; i < n; i++) {
      const a = T.orbit * 4 + i / n * Math.PI * 2;
      const hx = px + Math.cos(a) * r, hy = py + Math.sin(a) * r * 0.8;
      p.orbitHands.push({ x: hx, y: hy, a });
      for (const e of game.room.enemies) {
        if (!e.alive || (e.boss && e.defeated)) continue;
        if (hx < e.x - 6 || hx > e.x + e.w + 6 || hy < e.y - 6 || hy > e.y + e.h + 6) continue;
        if ((T.orbitHit[e.id] || 0) > T.orbit) continue;
        T.orbitHit[e.id] = T.orbit + 0.45; // 同じ敵へは 0.45 秒おき
        game.dealDamage(e, { base: dmg(8, 'orbit'), cat: 'skill', knock: 60, dir: sign(cx(e) - px) || 1, spell: true, passive: true });
        game.fx.sparks(hx, hy, '#f2c14e', 3, 140);
      }
    }
  } else p.orbitHands = null;
  if (pv.aura && tick('aura', 3)) game.room.spells.push(new Spell('ember', px, py, { passive: true, r: 0, maxR: 80, dmg: dmg(15, 'aura') }));
  if (pv.seeker && anyFoe() && tick('seeker', 2.4)) game.room.spells.push(new Spell('hand', px, py - 20, { passive: true, vx: 0, vy: -180, life: 2, dmg: dmg(20, 'seeker'), delay: 0 }));
  if (pv.chainlight && (T.chainlight = (T.chainlight || 0) + dt) >= 4) {
    const e = nearestTargets(game, px, py, 300)[0];
    if (e) { T.chainlight = 0; PROCS.thunderbell(game, pv.chainlight, e, syn, true); }
  }
  if (pv.meteor && (T.meteor = (T.meteor || 0) + dt) >= 3.5) {
    const ts = nearestTargets(game, px, py, 420);
    if (ts.length) {
      T.meteor = 0;
      for (let i = 0; i < 1 + pv.meteor; i++) {
        const e = ts[i % ts.length];
        const tx = cx(e) + (i >= ts.length ? (Math.random() - 0.5) * 50 : 0), ty = cy(e);
        game.room.spells.push(new Spell('star', tx, ty, { passive: true, delay: i * 0.12, fall: 0.35, dmg: dmg(24, 'meteor'), from: { x: tx + 140, y: ty - 280 } }));
      }
    }
  }
  if (pv.frostnova && anyFoe() && tick('frostnova', 5)) {
    game.room.spells.push(new Spell('frost', px, py, { passive: true, r: 0, maxR: 115, dmg: dmg(20, 'frostnova'), slow: 1.2 + 0.3 * pv.frostnova }));
    game.sfx.play('block');
  }
  if (pv.swordrain && anyFoe() && tick('swordrain', 4)) {
    const ts = nearestTargets(game, px, py, 360);
    for (let i = 0; i < 2 + pv.swordrain; i++) {
      const e = ts[i % Math.max(1, ts.length)];
      const tx = e && i < ts.length ? cx(e) : px + (i - (1 + pv.swordrain) / 2) * 34;
      const gy = game.map.groundBelow(tx, (e ? e.y : py) - 10);
      const ty = Math.min(gy, game.map.pxH) - 4;
      game.room.spells.push(new Spell('sword', tx, ty, { passive: true, delay: i * 0.08, fall: 0.22, dmg: dmg(22, 'swordrain') }));
    }
  }
  if (pv.gearsaw && anyFoe() && tick('gearsaw', 2.8)) {
    game.room.spells.push(new Spell('gear', px, py - 4, { passive: true, vx: p.face * 520, ox: px, face: p.face, life: 1.3, dmg: dmg(14, 'gearsaw') }));
    game.sfx.play('swing');
  }
  if (pv.stormcloud) {
    p.cloud = { x: px - p.face * 10, y: py - 58 };
    if ((T.storm = (T.storm || 0) + dt) >= 1.6 - 0.15 * pv.stormcloud) {
      const ts = nearestTargets(game, p.cloud.x, p.cloud.y, 280);
      if (ts.length) {
        T.storm = 0;
        const e = ts[Math.floor(Math.random() * Math.min(3, ts.length))];
        const sp = new Spell('zap', p.cloud.x, p.cloud.y, { passive: true, tx: cx(e), ty: cy(e), life: 0.18 });
        game.room.spells.push(sp);
        strike(game, sp, e, dmg(16, 'stormcloud'), { knock: 40 });
        game.fx.sparks(cx(e), cy(e), '#cfe8ff', 6, 200);
      }
    }
  } else if (!pv.thundergod) p.cloud = null;
  // 雷冠（アーティファクト）：常時の術ではないので脅威には数えない
  if (p.stats.stormcrown && (T.crown = (T.crown || 0) + dt) >= 2.5) {
    const e = nearestTargets(game, px, py, 300)[0];
    if (e) { T.crown = 0; PROCS.thunderbell(game, 1, e, 50 / 45, true); }
  }
  // 床を攻める術：足元の床の高さを基準にする
  const floorY = () => Math.min(game.map.groundBelow(px, p.y + p.h - 4), game.map.pxH);
  if (pv.quakeline && anyFoe() && tick('quakeline', 3)) {
    const fy = floorY();
    for (const v of [-430, 430]) game.room.spells.push(new Spell('groundwave', px, fy, { passive: true, vx: v, life: 0.9, dmg: dmg(18, 'quakeline') }));
    game.fx.shake(1.5, 0.06); game.fx.dust(px, fy, 6);
  }
  if (pv.spikes && (T.spikes = (T.spikes || 0) + dt) >= 4) {
    const ts = nearestTargets(game, px, py, 320).filter((e) => e.gravity !== false).slice(0, 2 + pv.spikes);
    if (ts.length) {
      T.spikes = 0;
      for (const e of ts) game.room.spells.push(new Spell('spike', cx(e), Math.min(game.map.groundBelow(cx(e), e.y + e.h - 4), game.map.pxH), { passive: true, delay: 0.35, dmg: dmg(30, 'spikes') }));
    }
  }
  if (pv.emberfloor && anyFoe() && tick('emberfloor', 5)) {
    game.room.spells.push(new Spell('burnfloor', px, floorY(), { passive: true, life: 2.2, half: 150, dmg: dmg(7, 'emberfloor') }));
  }
  // ───── 部屋全体を攻める常時の術 ─────
  const everyone = () => game.room.enemies.filter((e) => e.alive && !(e.boss && e.defeated));
  if (pv.tolling && anyFoe() && tick('tolling', 6)) {
    for (const e of everyone()) { const sp = new Spell('roomhit', cx(e), cy(e), { passive: true, life: 0.35, top: e.y, soft: true }); game.room.spells.push(sp); strike(game, sp, e, dmg(6, 'tolling'), { knock: 20 }); }
    game.sfx.play('bossBell'); game.fx.shake(1.5, 0.1);
  }
  if (pv.starfield && anyFoe() && tick('starfield', 5)) {
    everyone().forEach((e, i) => game.room.spells.push(new Spell('star', cx(e), cy(e), { passive: true, delay: i * 0.05, fall: 0.3, dmg: dmg(8, 'starfield'), from: { x: cx(e) - 40, y: cy(e) - 220 }, small: true })));
  }
  if (pv.celestial && anyFoe() && tick('celestial', 3)) {
    everyone().forEach((e, i) => {
      game.room.spells.push(new Spell('star', cx(e), cy(e), { passive: true, delay: i * 0.04, fall: 0.25, dmg: dmg(28, 'celestial'), from: { x: cx(e) - 50, y: cy(e) - 260 } }));
      game.room.spells.push(new Spell('roomhit', cx(e), cy(e), { passive: true, life: 0.35, top: e.y, soft: true }));
    });
    game.sfx.play('bossBell'); game.fx.shake(2.5, 0.12); game.fx.screenFlash('#ffe9a0', 0.1);
  }
  // ───── 派手な常時の術 ─────
  const satN = pv.galaxy ? 5 + pv.galaxy : pv.satellites ? 2 + pv.satellites : 0;
  if (satN) {
    T.sat = (T.sat || 0) + dt;
    const R = pv.galaxy ? 84 : 70, base = pv.galaxy ? dmg(22, 'galaxy') : dmg(12, 'satellites');
    p.satellites = [];
    for (let i = 0; i < satN; i++) {
      // 銀河：内と外の二重の輪が逆向きに回る
      const inner = pv.galaxy && i % 2 === 1, r = inner ? 46 : R;
      const a = (inner ? -T.sat * 3.2 : T.sat * 2.6) + i / satN * Math.PI * 2;
      const sx = px + Math.cos(a) * r, sy = py + Math.sin(a) * r * 0.7;
      p.satellites.push({ x: sx, y: sy, a, big: !!pv.galaxy });
      for (const e of game.room.enemies) {
        if (!e.alive || (e.boss && e.defeated)) continue;
        if (sx < e.x - 10 || sx > e.x + e.w + 10 || sy < e.y - 10 || sy > e.y + e.h + 10) continue;
        if ((T.orbitHit['s' + e.id] || 0) > T.sat) continue;
        T.orbitHit['s' + e.id] = T.sat + 0.4;
        game.dealDamage(e, { base, cat: 'skill', knock: pv.galaxy ? 0 : 60, dir: sign(cx(e) - px) || 1, spell: true, passive: true });
        game.fx.sparks(sx, sy, pv.galaxy ? '#ffe9a0' : '#9fe3ff', 5, 180);
      }
    }
  } else p.satellites = null;
  if (pv.galaxy && anyFoe() && tick('galaxyV', 4)) game.room.spells.push(new Spell('tornado', px, py, { passive: true, vx: 0, life: 2, w: 60, dmg: dmg(12, 'galaxy'), color: '#ffe9a0', nebula: true }));
  if (pv.tornado && anyFoe() && tick('tornado', 5)) game.room.spells.push(new Spell('tornado', px + p.face * 30, py, { passive: true, vx: p.face * 70, life: 3.5, w: 40, dmg: dmg(14, 'tornado') }));
  if (pv.spinblade && anyFoe() && tick('spinblade', 3)) game.room.spells.push(new Spell('spinsweep', px, py, { passive: true, owner: p, life: 0.8, len: 150, a0: -Math.PI / 2, a1: Math.PI * 3.5, dmg: dmg(26, 'spinblade'), face: p.face, trail: [] }));
  if (pv.clockhand) {
    // 絶えず回る長針
    T.ch = (T.ch || 0) + dt;
    const h = handOf(p), a = T.ch * 7.5, len = 220;
    p.clockhand = { x: h.x, y: h.y, a, len };
    for (const e of enemiesOnSegment(game, h.x, h.y, h.x + Math.cos(a) * len, h.y + Math.sin(a) * len)) {
      if ((T.orbitHit['c' + e.id] || 0) > T.ch) continue;
      T.orbitHit['c' + e.id] = T.ch + 0.3;
      game.dealDamage(e, { base: dmg(26, 'clockhand'), cat: 'skill', knock: 90, dir: sign(cx(e) - px) || 1, spell: true, passive: true });
      game.fx.sparks(cx(e), cy(e), '#fff2c0', 4, 200);
    }
  } else p.clockhand = null;
  // ───── 合成した常時の術 ─────
  if (pv.gearwaltz) {
    T.gw = (T.gw || 0) + dt;
    const n = 4 + pv.gearwaltz, r = 46;
    p.orbitGears = [];
    for (let i = 0; i < n; i++) {
      const a = T.gw * 3 + i / n * Math.PI * 2;
      const hx = px + Math.cos(a) * r, hy = py + Math.sin(a) * r * 0.75;
      p.orbitGears.push({ x: hx, y: hy, a });
      for (const e of game.room.enemies) {
        if (!e.alive || (e.boss && e.defeated)) continue;
        if (hx < e.x - 9 || hx > e.x + e.w + 9 || hy < e.y - 9 || hy > e.y + e.h + 9) continue;
        if ((T.orbitHit['g' + e.id] || 0) > T.gw) continue;
        T.orbitHit['g' + e.id] = T.gw + 0.35;
        game.dealDamage(e, { base: dmg(20, 'gearwaltz'), cat: 'skill', knock: 70, dir: sign(cx(e) - px) || 1, spell: true, passive: true });
        game.fx.sparks(hx, hy, '#c9a052', 4, 160);
      }
    }
    if (anyFoe() && tick('gwThrow', 2)) for (const f of [-1, 1]) game.room.spells.push(new Spell('gear', px, py - 4, { passive: true, vx: f * 520, ox: px, face: f, life: 1.3, dmg: dmg(20, 'gearwaltz') }));
  } else p.orbitGears = null;
  if (pv.starblade && (T.sb = (T.sb || 0) + dt) >= 2.5) {
    const ts = nearestTargets(game, px, py, 460);
    if (ts.length) {
      T.sb = 0;
      for (let i = 0; i < 4 + pv.starblade; i++) {
        const e = ts[i % ts.length], tx = cx(e) + (i >= ts.length ? (Math.random() - 0.5) * 60 : 0);
        game.room.spells.push(new Spell('star', tx, cy(e), { passive: true, delay: i * 0.07, fall: 0.25, dmg: dmg(60, 'starblade'), from: { x: tx - 60, y: cy(e) - 300 }, sword: true }));
      }
    }
  }
  if (pv.thundergod) {
    p.cloud = { x: px - p.face * 10, y: py - 62, big: true };
    if ((T.tg = (T.tg || 0) + dt) >= 0.7) {
      const ts = nearestTargets(game, p.cloud.x, p.cloud.y, 320);
      if (ts.length) {
        T.tg = 0;
        const e = ts[Math.floor(Math.random() * Math.min(3, ts.length))];
        const sp = new Spell('zap', p.cloud.x, p.cloud.y, { passive: true, tx: cx(e), ty: cy(e), life: 0.2 });
        game.room.spells.push(sp);
        strike(game, sp, e, dmg(34, 'thundergod'), { knock: 40 });
        const o = ts.find((x) => x !== e);
        if (o) { game.room.spells.push(new Spell('zap', cx(e), cy(e), { passive: true, tx: cx(o), ty: cy(o), life: 0.2 })); strike(game, sp, o, dmg(34, 'thundergod') * 0.6, { knock: 30 }); }
        game.fx.sparks(cx(e), cy(e), '#cfe8ff', 8, 220);
      }
    }
  }
  if (pv.inferno && anyFoe() && tick('inferno', 2.5)) {
    game.room.spells.push(new Spell('flamering', px, py + 6, { passive: true, r: 0, maxR: 125, pulses: 1, pulse: 0, dmg: dmg(40, 'inferno') }));
    game.room.spells.push(new Spell('burnfloor', px, floorY(), { passive: true, life: 2, half: 170, dmg: dmg(9, 'inferno') }));
  }
  if (pv.icejail && (T.ij = (T.ij || 0) + dt) >= 3) {
    const ts = nearestTargets(game, px, py, 360).slice(0, 3 + pv.icejail);
    if (ts.length) {
      T.ij = 0;
      for (const e of ts) game.room.spells.push(new Spell('spike', cx(e), Math.min(game.map.groundBelow(cx(e), e.y + e.h - 4), game.map.pxH), { passive: true, delay: 0.3, dmg: dmg(60, 'icejail'), ice: true }));
    }
  }
  if (pv.earthpulse && anyFoe() && tick('earthpulse', 2)) {
    const fy = floorY();
    for (const d of [0, 0.35]) for (const v of [-480, 480]) { const w = new Spell('groundwave', px, fy, { passive: true, vx: v, life: 0.9, dmg: dmg(45, 'earthpulse'), big: true }); w.t = -d; game.room.spells.push(w); }
    game.fx.shake(2.5, 0.1); game.fx.dust(px, fy, 10);
  }
  if (pv.wake && p.onGround && Math.abs(p.vx) > 150 && tick('wake', 0.12)) {
    game.room.spells.push(new Spell('trail', px, p.y + p.h - 6, { passive: true, life: 1.4, dmg: dmg(7, 'wake') }));
  }
}
