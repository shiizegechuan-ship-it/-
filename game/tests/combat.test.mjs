import test from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, Driver, FLAT } from './helpers.mjs';
import { RustSoldier, GearKnight, PendulumBat } from '../src/enemies.js';

function withEnemy(E, dx = 50) {
  const g = sandbox(FLAT); const d = new Driver(g);
  d.frame(2);
  const e = new E(g.player.x + dx, 450);
  g.addEnemy(e);
  g.room.cleared = true;
  return { g, d, e };
}

test('3段連撃：10 + 10 + 18 が入り、3段目で吹き飛ぶ', () => {
  const { g, d, e } = withEnemy(RustSoldier, 40);
  e.cool = 99; // 反撃させない
  const hp0 = e.hp;
  const dmgLog = [];
  let last = e.hp;
  for (let i = 0; i < 70; i++) {
    d.frame(1, i % 8 === 0 && i < 24 ? ['attack'] : []);
    if (e.hp !== last) { dmgLog.push(last - e.hp); last = e.hp; }
  }
  assert.deepEqual(dmgLog, [10, 10, 18], `log ${dmgLog}`);
  assert.equal(hp0 - e.hp, 38);
});

test('ヒットストップ：命中時にシミュレーションが数フレーム止まる', () => {
  const { g, d, e } = withEnemy(RustSoldier, 30);
  e.cool = 99;
  d.until(() => e.hp < e.maxHp, 20, ['attack']);
  assert.ok(g.hitstop > 0, 'hitstop set on hit');
});

test('重撃：押しっぱなしで溜め → 離して発動。騎士の盾を崩す', () => {
  const { g, d, e } = withEnemy(GearKnight, 60);
  e.cool = 99; e.face = -1;
  d.frame(40, ['attack']);
  assert.equal(g.player.state, 'charge');
  assert.ok(g.player.charged, 'should be fully charged');
  d.frame(1);
  assert.equal(g.player.atk && g.player.atk.name, 'heavy');
  d.until(() => e.state === 'stagger', 30);
  assert.equal(e.state, 'stagger');
});

test('騎士の正面は通常攻撃を弾き、背後からは通る', () => {
  const { g, d, e } = withEnemy(GearKnight, 40);
  e.cool = 99; e.face = -1;
  const hp0 = e.hp;
  d.frame(1, ['attack']); d.frame(20);
  assert.equal(e.hp, hp0, 'front light attack blocked');
  // 背後に回る
  g.player.x = e.x + e.w + 8; g.player.face = -1;
  e.face = -1; e.setState('approach'); e.cool = 99; e.turnT = 0;
  d.frame(1, ['attack', 'left']); d.frame(12);
  assert.ok(e.hp < hp0, 'back attack lands');
});

test('ジャスト回避：斬撃の直前に回避すると刹那（スロー＋ゲージ）', () => {
  const { g, d, e } = withEnemy(RustSoldier, 46);
  e.facePlayer(g.player);
  e.setState('windup');
  d.until(() => e.state === 'slash', 60);
  d.frame(1, ['dodge']);
  d.frame(3);
  assert.ok(g.run.perfects >= 1, 'perfect dodge registered');
  assert.equal(g.player.hp, g.player.maxHp);
  assert.ok(g.player.gauge >= 30);
});

test('回避しなければ被弾し、無敵時間とノックバックが入る', () => {
  const { g, d, e } = withEnemy(RustSoldier, 46);
  e.facePlayer(g.player);
  e.setState('windup');
  d.until(() => g.player.hp < g.player.maxHp, 80);
  assert.equal(g.player.hp, g.player.maxHp - 15);
  assert.equal(g.player.state, 'hurt');
  assert.ok(g.player.iframeT > 0.5);
  assert.ok(g.player.vx < 0, 'knocked away from enemy');
});

test('予備動作中の錆兵は弱攻撃では止まらず、3段目で止まる', () => {
  const { g, d, e } = withEnemy(RustSoldier, 40);
  e.facePlayer(g.player);
  e.setState('windup');
  d.frame(1, ['attack']); d.frame(6);
  assert.equal(e.state, 'windup', 'light hit does not interrupt windup');
});

test('強化「残響」：命中の0.45秒後に半分の威力で再命中', () => {
  const { g, d, e } = withEnemy(RustSoldier, 40);
  e.cool = 99;
  g.player.setBoons([{ id: 'echo', tier: 1 }]);
  d.frame(1, ['attack']);
  d.until(() => e.hp < e.maxHp, 20);
  const after1 = e.hp;
  d.frame(35);
  assert.equal(after1 - e.hp, 5);
});

test('強化「遅延の刃」＋「粉砕」：遅い敵への重撃が2倍', () => {
  const { g, d, e } = withEnemy(RustSoldier, 50);
  e.cool = 99; e.hp = e.maxHp = 500;
  g.player.setBoons([{ id: 'lag', tier: 1 }, { id: 'shatter', tier: 1 }]);
  d.frame(40, ['attack']); // 1段目が当たって遅延 → 溜め
  assert.ok(e.slowed);
  const before = e.hp;
  d.frame(1); d.until(() => e.hp < before, 30);
  assert.equal(before - e.hp, 80);
});

test('時歪：ゲージを消費して周囲の敵を遅くする。不足時は不発', () => {
  const { g, d, e } = withEnemy(PendulumBat, 80);
  d.frame(1, ['skill']);
  assert.equal(e.warp, 0, 'no gauge -> no warp');
  g.player.gauge = 100;
  d.frame(1);
  d.frame(1, ['skill']);
  assert.ok(e.warp > 1.5);
  assert.equal(g.player.gauge, 50);
});

test('砲台の弾は斬り落とせる', () => {
  const { g, d } = withEnemy(RustSoldier, 400);
  g.room.enemies = [];
  const { Projectile } = awaitImport;
  const pr = new Projectile('bolt', g.player.x + 30, g.player.y + 8, -100, 0, 10);
  g.spawnProjectile(pr);
  d.frame(1, ['attack']); d.frame(8);
  assert.equal(pr.alive, false);
  assert.equal(g.player.hp, g.player.maxHp);
});
import * as awaitImport from '../src/enemies.js';

test('ジャスト回避：後ろへ避けても、元の位置に当たるはずだった攻撃なら成立する', () => {
  const { g, d, e } = withEnemy(RustSoldier, 46);
  e.facePlayer(g.player);
  e.setState('windup');
  d.until(() => e.state === 'windup' && e.tell > 0.92, 60);
  d.frame(1, ['dodge', 'left']);
  d.frame(12);
  assert.ok(g.run.perfects >= 1);
});

test('早すぎる回避は刹那にならない（無敵で避けるだけ）', () => {
  const { g, d, e } = withEnemy(RustSoldier, 46);
  e.facePlayer(g.player);
  e.setState('windup');
  d.frame(4);
  d.frame(1, ['dodge', 'left']);
  d.frame(40);
  assert.equal(g.run.perfects, 0);
});
