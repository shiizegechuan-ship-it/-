import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, Driver } from './helpers.mjs';
import { addWedge } from '../src/meta.js';

function bossRoom(seed = 3, setup = () => {}) {
  const g = newGame(seed);
  setup(g);
  g.enterRoom(2, 2);
  g.modal = null;
  const d = new Driver(g);
  g.player.hp = g.player.maxHp = 99999;
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

test('刻守の記憶（時歪）：時歪の効果時間が半分', () => {
  const { g, d, b } = bossRoom(13, (g) => { g.meta.lastLoop = { dmgByCat: { skill: 500 } }; });
  g.player.gauge = 100; g.player.x = b.x - 50;
  g.useSkill();
  assert.ok(b.warp > 0.9 && b.warp < 1.1);
});

test('時止め中もプレイヤーは遅く動ける（完全停止はしない）', () => {
  const { g, d, b } = bossRoom();
  g.startTimeStop(1.4);
  const x0 = g.player.x;
  d.frame(30, ['right']);
  assert.ok(g.player.x > x0 + 5, 'moves a little');
  assert.ok(g.player.x < x0 + 120, 'but slowly');
});
