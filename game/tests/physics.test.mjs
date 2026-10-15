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

test('崖から落ちても、戻ったあとに同じ穴へ落ち続けない（ダメージは1回だけ）', () => {
  const PIT = [
    '################################',
    ...Array.from({ length: 13 }, () => '#..............................#'),
    '#P.............................#',
    '#####..........#################',
    '#####..........#################',
    '#####..........#################',
  ];
  for (const held of [['right'], ['right', 'dodge'], ['right', 'jump']]) {
    const g = sandbox(PIT); const d = new Driver(g);
    d.frame(2);
    let falls = 0, wasLow = false;
    for (let i = 0; i < 600; i++) {
      d.frame(1, i < 40 ? held : []);
      const low = g.player.y > 460;
      if (low && !wasLow) falls++;
      wasLow = low;
    }
    assert.equal(falls, 1, `held ${held}: fell ${falls} times`);
    assert.equal(g.player.hp, g.player.maxHp - 12);
    assert.ok(g.player.onGround && g.player.state === 'normal');
  }
});

import { Input, readPads } from '../src/input.js';
test('左右を同時に押したときは、後から押した方向を優先する（十字キーの転がし）', () => {
  const inp = new Input();
  inp.set('left', true); inp.step();
  assert.equal(inp.dirX(), -1);
  inp.set('right', true); inp.step();
  assert.equal(inp.dirX(), 1, 'right pressed later wins');
  inp.set('left', false); inp.step();
  assert.equal(inp.dirX(), 1);
});

test('ゲームパッド：先頭に動かない仮想デバイスがいても読める。スティックは境目でぶれない', () => {
  const pad = (axes, pressed = []) => ({ connected: true, mapping: 'standard', index: 1, axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) });
  const phantom = { connected: true, mapping: '', index: 0, axes: [0, 0], buttons: [] };
  const st = {};
  let r = readPads([phantom, pad([0.17, 0])], st); // 遊びは 15%（少し倒すだけで反応）
  assert.ok(r.right && !r.left);
  r = readPads([phantom, pad([0.12, 0])], st); // 押した後は 10% まで保つ
  assert.ok(r.right);
  r = readPads([phantom, pad([0.05, 0])], st);
  assert.ok(!r.right);
  r = readPads([phantom, pad([0.13, 0])], st); // 離した後は 15% まで押されない
  assert.ok(!r.right);
  r = readPads([phantom, pad([0, 0], [14])], st);
  assert.ok(r.left);
  // 非標準配置の十字キー（軸 6）
  const ns = { connected: true, mapping: '', index: 2, axes: [0, 0, 0, 0, 0, 0, 1, 0], buttons: [] };
  assert.ok(readPads([ns], {}).right);
});

test('地上の回避は底なしの穴の手前で止まる（空中の回避は止まらない）', () => {
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
  g.player.x = 100; // 崖の縁（x=150）の少し手前
  d.frame(1, ['right', 'dodge']); d.frame(30);
  assert.ok(g.player.onGround && g.player.y < 460, 'did not fall');
  assert.ok(g.player.x + g.player.w <= 156, `stopped at the edge (${g.player.x})`);
  // 空中の回避は穴を越えるために使える
  d.frame(40); g.player.x = 120; d.frame(1, ['jump']); d.frame(6, ['jump']); d.frame(1, ['right', 'dodge']); d.frame(6);
  assert.ok(g.player.x > 160, 'air dodge goes over the pit');
});
