import test from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, Driver, FLAT } from './helpers.mjs';
import { PLAYER } from '../src/config.js';

const LEDGE = [
  '################################',
  ...Array.from({ length: 10 }, () => '#..............................#'),
  '#..............................#',
  '#P.......#.....................#',
  '##########.....................#',
  '#..............................#',
  '################################',
  '################################',
  '################################',
];

test('最大ジャンプは約3タイル、短押しは低くなる（可変ジャンプ）', () => {
  const g = sandbox(FLAT); const d = new Driver(g);
  d.frame(2);
  const y0 = g.player.y;
  let minY = y0;
  d.frame(1, ['jump']);
  for (let i = 0; i < 60; i++) { d.frame(1, ['jump']); minY = Math.min(minY, g.player.y); }
  const full = y0 - minY;
  d.frame(60);
  const y1 = g.player.y; let min2 = y1;
  d.frame(3, ['jump']);
  for (let i = 0; i < 60; i++) { d.frame(1); min2 = Math.min(min2, g.player.y); }
  const short = y1 - min2;
  assert.ok(full > 85 && full < 115, `full jump ${full}`);
  assert.ok(short < full * 0.55, `short jump ${short} vs ${full}`);
});

test('最高速には数フレームで到達し、反転は素早い', () => {
  const g = sandbox(FLAT); const d = new Driver(g);
  d.frame(2);
  d.frame(5, ['right']);
  assert.ok(g.player.vx >= PLAYER.runSpeed * 0.95, `vx ${g.player.vx}`);
  d.frame(4, ['left']);
  assert.ok(g.player.vx < 0, `turned vx ${g.player.vx}`);
});

test('コヨーテタイム：足場を離れた直後でもジャンプできる', () => {
  const g = sandbox(LEDGE); const d = new Driver(g);
  d.frame(2);
  // 足場の端まで歩く
  d.until(() => !g.player.onGround, 200, ['right']);
  d.frame(3, ['right']); // 3フレーム遅れて押す
  d.frame(1, ['right', 'jump']);
  assert.ok(g.player.vy < -400, `should jump, vy=${g.player.vy}`);
});

test('先行入力：着地の少し前に押したジャンプが着地時に出る', () => {
  const g = sandbox(FLAT); const d = new Driver(g);
  d.frame(2);
  d.frame(1, ['jump']); d.frame(40);
  // 落下中、着地の数フレーム前に押す
  d.until(() => g.player.vy > 0 && g.player.y + g.player.h > 450 - 18, 120);
  d.frame(1, ['jump']);
  const landed = d.until(() => g.player.onGround || g.player.vy < -300, 20);
  d.frame(2);
  assert.ok(landed >= 0);
  assert.ok(g.player.vy < -300 || g.player.y < 400, `buffered jump should fire (vy=${g.player.vy}, y=${g.player.y})`);
});

test('回避：無敵があり、約4タイル進み、攻撃の硬直をキャンセルできる', () => {
  const g = sandbox(FLAT); const d = new Driver(g);
  d.frame(2);
  const x0 = g.player.x;
  d.frame(1, ['dodge']);
  assert.equal(g.player.state, 'dodge');
  assert.ok(g.player.invulnerable);
  d.frame(25);
  const dist = g.player.x - x0;
  assert.ok(dist > 100 && dist < 190, `dodge dist ${dist}`);
  // 攻撃 → 硬直中に回避
  d.frame(40);
  d.frame(1, ['attack']);
  d.frame(9);
  assert.equal(g.player.state, 'attack');
  d.frame(1, ['dodge']);
  assert.equal(g.player.state, 'dodge', 'recovery should be dodge-cancellable');
});

test('攻撃は押した次のフレームから始まる（入力遅延なし）', () => {
  const g = sandbox(FLAT); const d = new Driver(g);
  d.frame(2);
  d.frame(1, ['attack']);
  assert.equal(g.player.state, 'attack');
  assert.equal(g.player.atk.name, 'combo1');
});

test('奈落に落ちたら少しのダメージで足場に戻る', () => {
  const PIT = [
    '################################',
    ...Array.from({ length: 13 }, () => '#..............................#'),
    '#P.............................#',
    '#####..........#################',
    '#####..........#################',
    '#####..........#################',
  ];
  const g = sandbox(PIT); const d = new Driver(g);
  d.frame(2);
  d.until(() => g.player.y > 600, 300, ['right']);
  d.frame(5);
  assert.ok(g.player.y < 460, 'respawned on ledge');
  assert.ok(g.player.hp < g.player.maxHp);
});
