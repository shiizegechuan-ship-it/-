import test from 'node:test';
import { cx, cy } from '../src/util.js';
import assert from 'node:assert/strict';
import { newGame, Driver } from './helpers.mjs';
import { addWedge } from '../src/meta.js';

function bossRoom(seed = 3, setup = () => {}) {
  const g = newGame(seed);
  setup(g);
  g.enterRoom(2, g.run.plan.floors[2].findIndex((r) => r.type === 'boss'));
  g.modal = null;
  const d = new Driver(g);
  g.player.hp = g.player.maxHp = 99999;
  g.room.boss.barrier = { t: 1e9, dealt: 0 }; // 時の障壁は別のテストで確かめる（ここでは長く戦った後と同じにして外す）
  return { g, d, b: g.room.boss };
}

test('刻守：各段階で複数の技を使い、止まったままにならない', () => {
  const { g, d, b } = bossRoom();
  const seen = new Set();
  const track = (n) => { for (let i = 0; i < n; i++) { d.frame(1); seen.add(b.state); g.player.iframeT = 0; } };
  track(60 * 25);
  for (const s of ['swingWind', 'handsWind', 'leapWind']) assert.ok(seen.has(s), `phase1 uses ${s}`);
  assert.ok(!seen.has('stopWind'), 'no time stop in phase 1');
  b.hp = b.maxHp * 0.55; b.checkPhase(g);
  seen.clear(); track(60 * 30);
  assert.ok(seen.has('stopWind') && seen.has('stopped'), 'time stop in phase 2');
  assert.ok(g.room.projectiles.length >= 0);
  // 状態が長時間変わらないことがない
  let last = b.state, same = 0, maxSame = 0;
  for (let i = 0; i < 60 * 20; i++) { d.frame(1); if (b.state === last) same++; else { maxSame = Math.max(maxSame, same); same = 0; last = b.state; } }
  assert.ok(maxSame < 60 * 4, `stuck in ${last} for ${maxSame} frames`);
});

test('歯止めに楔：時止めを一切使わない', () => {
  const { g, d, b } = bossRoom(5, (g) => addWedge(g.meta, { target: 'brake' }));
  b.hp = b.maxHp * 0.7; b.checkPhase(g);
  assert.equal(b.phase, 2, 'phase 2 starts at 75% with brake');
  let stopped = false;
  for (let i = 0; i < 60 * 40; i++) { d.frame(1); if (b.state === 'stopWind') stopped = true; }
  assert.ok(!stopped);
});

test('刻守の記憶（重撃）：溜めを見せると受け流しの構え、重撃は弾かれる', () => {
  const { g, d, b } = bossRoom(7, (g) => { g.meta.lastLoop = { dmgByCat: { heavy: 500 } }; });
  assert.equal(b.counter, 'heavy');
  d.until(() => b.state === 'idle', 200);
  b.cool = 0.3;
  g.player.x = b.x - 60; g.player.face = 1;
  d.frame(30, ['attack']);
  d.until(() => b.state === 'parry', 60, ['attack']);
  assert.equal(b.state, 'parry');
  const hp = b.hp;
  const r = g.dealDamage(b, { base: 40, cat: 'heavy', knock: 0, dir: 1, heavy: true });
  assert.ok(r.parried);
  assert.equal(b.hp, hp);
  assert.equal(b.state, 'riposte');
});

test('対策（連撃）：外殻が連撃を弾き（耐性）、重撃で割れると連撃が通る', () => {
  const { g, d, b } = bossRoom(21, (g) => { g.meta.lastLoop = { dmgByCat: { combo: 500 } }; });
  d.until(() => b.state === 'idle', 200);
  b.cool = 99; b.state = 'recover'; b.recT = 99;
  const h0 = b.hp;
  g.dealDamage(b, { base: 100, cat: 'combo', knock: 0, dir: 1 }); g.combo.n = 0;
  const lightDmg = h0 - b.hp;
  assert.ok(lightDmg <= 31 && lightDmg >= 29, `combo resisted to 30% (${lightDmg})`);
  // 重撃で外殻を割る
  for (let i = 0; i < 50 && b.shell > 0; i++) { b.state = 'recover'; g.dealDamage(b, { base: 200, cat: 'heavy', heavy: true, knock: 0, dir: 1 }); g.combo.n = 0; }
  assert.ok(b.shellDown > 0);
  b.state = 'recover';
  const h1 = b.hp;
  g.dealDamage(b, { base: 100, cat: 'combo', knock: 0, dir: 1 });
  assert.ok(h1 - b.hp >= 99, 'full damage after the shell breaks');
});

test('対策（術）：術を使うと突進してくる。術のダメージは軽減', () => {
  const { g, d, b } = bossRoom(23, (g) => { g.meta.lastLoop = { dmgByCat: { skill: 500 } }; });
  d.until(() => b.state === 'idle', 200);
  g.player.setBoons([{ id: 'rewindblade', tier: 1 }]);
  g.player.gauge = 100; d.frame(1); d.frame(1, ['skill']);
  assert.equal(b.state, 'punishWind');
});

test('対策（回避）：フェイントで一拍止め、白く光ってから振る', () => {
  const { g, d, b } = bossRoom(25, (g) => { g.meta.lastLoop = { dmgByCat: { combo: 300, heavy: 300, air: 300 }, dodges: 80, clock: 200 }; });
  assert.equal(b.counter, 'dodge');
  let feint = false, real = false;
  for (let i = 0; i < 60 * 30 && !(feint && real); i++) { d.frame(1); g.player.iframeT = 0; if (b.state === 'feint') feint = true; if (b.state === 'swingWind' && b.tellKind === 'real') real = true; }
  assert.ok(feint && real);
});

test('刻守の記憶（連撃）：短時間に3発受けると赤く光って跳び退く', () => {
  const { g, d, b } = bossRoom(9, (g) => { g.meta.lastLoop = { dmgByCat: { combo: 500 } }; });
  d.until(() => b.state === 'idle', 200);
  for (let i = 0; i < 3; i++) g.dealDamage(b, { base: 10, cat: 'combo', knock: 0, dir: 1 });
  d.until(() => b.state !== 'idle', 20); // ヒットストップ分だけ待つ
  assert.equal(b.state, 'stepWind');
});

test('刻守の記憶（残響）：紫の輪の間は残響を吸収する', () => {
  const { g, d, b } = bossRoom(11, (g) => { g.meta.lastLoop = { dmgByCat: { echo: 500 } }; });
  d.until(() => b.state === 'idle', 200);
  b.ringT = 2;
  const hp = b.hp;
  const r = g.dealDamage(b, { base: 10, cat: 'echo', knock: 0, dir: 1, echo: true });
  assert.ok(r.absorbed);
  assert.equal(b.hp, hp);
});

test('刻守には時歪の遅くする効果が効かない（術潰しの対策があってもなくても）', () => {
  for (const lastLoop of [null, { dmgByCat: { skill: 500 } }]) {
    const { g, b } = bossRoom(13, (g) => { g.meta.lastLoop = lastLoop; });
    g.player.gauge = 100; g.player.x = b.x - 50;
    g.useSkill();
    assert.ok(!(b.warp > 0) && b.timeScale === 1 && !b.slowed);
  }
});

test('時止め中もプレイヤーは遅く動ける（完全停止はしない）', () => {
  const { g, d, b } = bossRoom();
  g.startTimeStop(1.4);
  const x0 = g.player.x;
  d.frame(30, ['right']);
  assert.ok(g.player.x > x0 + 5, 'moves a little');
  assert.ok(g.player.x < x0 + 120, 'but slowly');
});

// ───── 中ボスの遠距離・空中・追尾・上方向の攻撃 ─────
import { GearKnight as GK2, Warden as WD2 } from '../src/enemies.js';
import { sandbox as sb2, Driver as Dr2, FLAT as FL2 } from './helpers.mjs';
function midArena(E, dx) {
  const g = sb2(FL2); const d = new Dr2(g); d.frame(2);
  const e = new E(g.player.x + dx, 450); g.addEnemy(e); e.cool = 0; e.stateT = 2;
  g.room.cleared = true; g.player.hp = g.player.maxHp = 1e6;
  return { g, d, e };
}
const seen = (g, d, e, states, frames, hold) => { const s = new Set(); for (let i = 0; i < frames; i++) { if (hold) hold(); d.frame(1); s.add(e.state); g.player.iframeT = 0; } return states.filter((x) => s.has(x)); };
for (const [name, E, ranged, homing, air, up] of [['歯車騎士', GK2, 'throwWind', 'sparkWind', 'dive', 'upper'], ['振り子の番人', WD2, 'bladeWind', 'notesWind', 'spinAir', 'lift']]) {
  test(`中ボス「${name}」：遠く離れると遠距離攻撃と追尾する弾を使い、どちらもプレイヤーに届く`, () => {
    const { g, d, e } = midArena(E, 560);
    const p = g.player; const px = p.x;
    const got = seen(g, d, e, [ranged, homing], 60 * 14, () => { p.x = px; p.vx = 0; if (Math.abs(cx(e) - cx(p)) < 400) e.x = p.x + 520; });
    assert.deepEqual(got.sort(), [ranged, homing].sort());
    assert.ok(p.hp < p.maxHp, 'ranged attacks reach the player');
  });
  test(`中ボス「${name}」：空中攻撃と、頭上の相手への上方向の攻撃がある`, () => {
    const { g, d, e } = midArena(E, 180);
    const p = g.player;
    const got = seen(g, d, e, [air], 60 * 12, () => { if (Math.abs(cx(e) - cx(p)) < 140 || Math.abs(cx(e) - cx(p)) > 300) { e.x = p.x + 190; e.gravity = true; } });
    assert.deepEqual(got, [air]);
    const m = midArena(E, 30);
    m.g.player.y -= 90; m.g.player.vy = 0;
    const got2 = seen(m.g, m.d, m.e, [up], 60 * 3, () => { m.g.player.y = m.e.y - 90; m.g.player.vy = 0; m.g.player.x = m.e.x; });
    assert.deepEqual(got2, [up]);
  });
}

test('刻守は何があってもノックバックしない（範囲攻撃の見切り・反撃の足捌き・外から加わる速さでも横へ動かない）', async () => {
  const { newGame: ng } = await import('./helpers.mjs');
  const { Spell } = await import('../src/arts.js');
  const g = ng(5); g.meta.loop = 6; g.startLoop(); g.modal = null;
  const bi = g.run.plan.floors[2].findIndex((r) => r.type === 'boss');
  g.enterRoom(2, bi); g.modal = null;
  const b = g.room.boss, dt = 1 / 60;
  // 1) 範囲攻撃の見切り：その場で見切る（跳び退かない）
  b.aoeCd = 0; b.vx = 0; b.vy = 0;
  g.room.spells.push(new Spell('flamering', cx(b) + 60, cy(b), { r: 40, maxR: 100, pulses: 3, pulse: 0, dmg: 1 }));
  b.tryDodgeAoe(g, dt);
  assert.ok(b.dodgeI > 0, 'still reads the attack');
  assert.equal(b.vx, 0); assert.equal(b.vy, 0);
  // 2) 反撃の足捌き：下がらずにその場で斬り返す
  b.setState('stepWind'); b.stateT = 0.3; b.think(g, dt);
  assert.equal(b.state, 'step'); assert.equal(b.vx, 0);
  // 3) 外から加わった横の速さは打ち消される
  b.think = function () {}; b.setState('idle'); b.ownVx = 0; b.vx = 700;
  const x0 = b.x; b.update(g, dt);
  assert.ok(Math.abs(b.x - x0) < 0.01, `moved ${b.x - x0}`);
  // 4) 重撃の溜めを見ても跳び退かない
  b.counter = 'heavy'; g.player.state = 'charge'; g.player.x = b.x - 60; b.onGround = true; b.ownVx = 0; b.vx = 0;
  b.update(g, dt);
  assert.ok(!b.hopped && Math.abs(b.vx) < 1);
});

test('難易度で、中ボス・刻守の攻撃と攻撃の間（休み）が変わる。白き刻守の重さと速さは難しい・激ムズだけ', async () => {
  const { newGame } = await import('./helpers.mjs');
  const { DIFFICULTY } = await import('../src/config.js');
  const rest = {};
  for (const id of ['veryeasy', 'easy', 'normal', 'hard', 'nightmare']) {
    const g = newGame(14); g.meta.difficulty = id; g.startLoop(); g.modal = null;
    g.enterRoom(2, g.run.plan.floors[2].findIndex((r) => r.type === 'boss')); g.modal = null;
    const b = g.room.boss;
    assert.equal(b.gapMul, DIFFICULTY[id].gap);
    b.rng = { next: () => 0.5, pick: (a) => a[0] };
    b.recover(1); const recT = b.recT; b.cool = 0; b.cool = b.nextCool(); rest[id] = recT + b.cool;
    b.trueDuel = true; g.beginFinalForm(b); g.modal = null;
    assert.equal(!!b.fierce, id === 'hard' || id === 'nightmare', `${id}: fierce`);
  }
  assert.ok(rest.veryeasy > rest.easy && rest.easy > rest.normal && rest.normal > rest.hard && rest.hard > rest.nightmare, JSON.stringify(rest));
});

test('激ムズ・第 3 段階の怒った刻守と白き刻守：どの技にも、無傷で済む動き方がある（回避の待ち時間・無敵時間は実際のまま）', async () => {
  const { canAvoid, BASE, FINAL } = await import('../tools/dev/avoid.mjs');
  for (const m of [...BASE, ...FINAL]) for (const offset of [-170, 70]) {
    const n = canAvoid([m], { final: FINAL.includes(m), brake: m !== 'stop', offset, tries: 80 });
    assert.ok(n > 0, `${m} at ${offset}: no way to avoid`);
  }
});
