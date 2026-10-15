// 術（じゅつ）：秒針ゲージで放つ「発動する術」と、条件で自動的に出る「発動条件つきの術」。
// 術の当たり判定はここで持ち、ダメージ計算は game.dealDamage（cat:'skill', spell:true）に任せる。
import { cx, cy, sign, clamp } from './util.js';
import { PASSIVE_IDS, passiveSynergy } from './boons.js';

const lvMul = (lv) => 1 + 0.4 * (lv - 1);
// 発動する術（V／時歪ボタン）。1 つだけ装着でき、取り直すと Lv が上がる
export const ACTIVE_ARTS = {
  flamering: { cost: (lv) => 40 - 3 * (lv - 1), color: '#ff7a3c' },
  starfall: { cost: (lv) => 55 - 4 * (lv - 1), color: '#ffe14a' },
  rewindblade: { cost: (lv) => 35 - 3 * (lv - 1), color: '#9fe3ff' },
  belltoll: { cost: (lv) => 45 - 3 * (lv - 1), color: '#f2c14e' },
};

export class Spell {
  constructor(kind, x, y, opts = {}) {
    this.kind = kind; this.x = x; this.y = y; this.t = 0; this.alive = true;
    this.hit = new Set();
    Object.assign(this, opts);
  }
}

function enemiesNear(game, x, y, r) {
  return game.room.enemies.filter((e) => e.alive && !(e.boss && e.defeated) && Math.hypot(cx(e) - x, cy(e) - y) <= r);
}
function strike(game, sp, e, base, extra = {}) {
  if (!e.alive) return;
  game.dealDamage(e, { base, cat: 'skill', knock: extra.knock || 120, dir: extra.dir || sign(cx(e) - sp.x) || 1, spell: true, passive: !!sp.passive, ...extra });
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
  game.emit('art', { id: art.id });
}

// 斬撃波（稀少）：地上の攻撃のたびに前へ飛ぶ小さな斬撃
export function spawnWave(game, p) {
  const f = p.face;
  game.room.spells.push(new Spell('blade', cx(p) + f * 18, cy(p), { vx: f * 480, life: 0.45, h: 34, dmg: 30, face: f }));
}

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
      case 'flamering': {
        const pt = sp.t - sp.pulse * 0.35;
        sp.r = clamp(pt / 0.25, 0, 1) * sp.maxR;
        for (const e of enemiesNear(game, sp.x, sp.y, sp.r)) if (!sp.hit.has(e.id + ':' + sp.pulse)) { sp.hit.add(e.id + ':' + sp.pulse); strike(game, sp, e, sp.dmg, { knock: 90 }); }
        if (pt > 0.35) { sp.pulse++; if (sp.pulse >= sp.pulses) sp.alive = false; }
        if (Math.random() < 0.6) game.fx.sparks(sp.x + (Math.random() - 0.5) * sp.r * 2, sp.y + 4, Math.random() < 0.5 ? '#ff7a3c' : '#ffe14a', 1, 90);
        break;
      }
      case 'star': {
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
          if (sp.kind === 'toll' && e.alive && !e.boss && e.setState) { e.setState('flinch'); e.stateT = -0.6; }
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
      case 'riposte': case 'thunder': case 'zap':
        if (sp.t > sp.life) sp.alive = false;
        break;
      case 'frost': {
        sp.r = clamp(sp.t / 0.3, 0, 1) * sp.maxR;
        for (const e of enemiesNear(game, sp.x, sp.y, sp.r)) if (!sp.hit.has(e.id)) {
          sp.hit.add(e.id); strike(game, sp, e, sp.dmg, { knock: 80 });
          e.lag = Math.max(e.lag || 0, sp.slow);
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
  dt *= p.stats.passiveSpeed || 1; // 星の心臓：常時の術が速く回る
  const px = cx(p), py = cy(p);
  const owned = PASSIVE_IDS.filter((id) => pv[id]).length;
  const syn = passiveSynergy(owned);
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
  } else p.cloud = null;
  if (pv.wake && p.onGround && Math.abs(p.vx) > 150 && tick('wake', 0.12)) {
    game.room.spells.push(new Spell('trail', px, p.y + p.h - 6, { passive: true, life: 1.4, dmg: dmg(7, 'wake') }));
  }
}
