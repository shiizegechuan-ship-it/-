import test from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, Driver, FLAT, newGame } from './helpers.mjs';
import { RustSoldier, GearRoller, ClockArcher, Phantom, BellRinger, PendulumBat, ClockTurret, GearKnight } from '../src/enemies.js';
import { newMeta, buyUpgrade, upLv, enemyScale, endLoop, inheritCount, UPGRADES } from '../src/meta.js';
import { computeStats, rollOffer, BOONS } from '../src/boons.js';
import { makeRng } from '../src/util.js';

function arena(E, dx = 120, tier = 1) {
  const g = sandbox(FLAT); const d = new Driver(g);
  d.frame(2);
  const e = new E(g.player.x + dx, E === Phantom || E === PendulumBat ? 380 : 450);
  g.addEnemy(e); e.tier = tier;
  g.room.cleared = true;
  g.player.hp = g.player.maxHp = 1e6;
  return { g, d, e };
}

for (const [name, E] of [['歯車転がし', GearRoller], ['時計弓兵', ClockArcher], ['刻の亡霊', Phantom], ['鐘撞き', BellRinger]]) {
  test(`新しい敵「${name}」：予兆を見せてから攻撃し、プレイヤーに当たる`, () => {
    const { g, d, e } = arena(E, E === ClockArcher ? 220 : 150);
    let told = false;
    for (let i = 0; i < 60 * 8; i++) { d.frame(1); if (e.tell > 0.5) told = true; g.player.iframeT = 0; }
    assert.ok(told, 'shows a tell');
    assert.ok(g.player.hp < g.player.maxHp, 'eventually hits the player');
    assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y));
  });
}

test('夜の深さ：夜を重ねると敵の HP・攻撃が上がり、段階が変わる', () => {
  const m = newMeta(1);
  assert.deepEqual(enemyScale(m), { hp: 1, dmg: 1, tier: 1, level: 0 });
  m.loop = 3; assert.equal(enemyScale(m).tier, 2);
  m.loop = 6; assert.equal(enemyScale(m).tier, 3);
  assert.ok(enemyScale(m).hp > 2.5);
  const g = newGame(5); g.meta.loop = 6; g.endRun('death'); g.startLoop();
  g.enterRoom(0, 1);
  for (const e of g.room.enemies) { assert.equal(e.tier, 3); assert.ok(e.maxHp > 60); }
});

test('段階2の錆兵は返しの二段斬りを使う', () => {
  let seen = false;
  for (let k = 0; k < 6 && !seen; k++) {
    const { g, d, e } = arena(RustSoldier, 40, 2);
    e.facePlayer(g.player); e.setState('windup');
    for (let i = 0; i < 90; i++) { d.frame(1); if (e.state === 'windup2') seen = true; g.player.iframeT = 0; }
  }
  assert.ok(seen);
});

test('段階2の砲台は3方向に撃つ', () => {
  const { g, d, e } = arena(ClockTurret, 200, 2);
  d.until(() => g.room.projectiles.length > 0, 200);
  assert.equal(g.room.projectiles.length, 3);
});

test('コンボ：当て続けると加算が増え、被弾で途切れる', () => {
  const { g, d, e } = arena(RustSoldier, 40);
  e.hp = e.maxHp = 1e6; e.cool = 99;
  for (let i = 0; i < 5; i++) g.dealDamage(e, { base: 10, cat: 'combo', knock: 0, dir: 1 });
  assert.equal(g.combo.n, 5);
  const before = e.hp;
  g.dealDamage(e, { base: 100, cat: 'combo', knock: 0, dir: 1 });
  assert.equal(before - e.hp, Math.round(100 * 1.05), '+1% per combo');
  g.damagePlayer(5, { fromX: 0 });
  assert.equal(g.combo.n, 0);
});

test('コンボは時間が経つと途切れる', () => {
  const { g, d, e } = arena(RustSoldier, 300);
  e.cool = 99;
  g.dealDamage(e, { base: 1, cat: 'combo', knock: 0, dir: 1 });
  assert.equal(g.combo.n, 1);
  d.frame(60 * 3);
  assert.equal(g.combo.n, 0);
});

test('火力の強化は取るたびに Lv が上がり、ダメージが伸びる', () => {
  assert.equal(computeStats([{ id: 'edge', tier: 1 }]).edgeMul, 1.2);
  assert.equal(computeStats([{ id: 'edge', tier: 5 }]).edgeMul, 2);
  // 手持ちの火力強化は Lv アップ候補として出る。上限なら出ない
  const r = makeRng(3);
  let seenOwned = false;
  for (let i = 0; i < 40; i++) if (rollOffer(r, [{ id: 'edge', tier: 2 }], ['power'], 3).includes('edge')) seenOwned = true;
  assert.ok(seenOwned);
  for (let i = 0; i < 40; i++) assert.ok(!rollOffer(r, [{ id: 'edge', tier: 5 }], ['power'], 3).includes('edge'));
  assert.ok(Object.values(BOONS).filter((b) => b.school === 'power').length >= 10);
});

test('強化選択で手持ちの火力強化を選ぶと Lv が上がる', () => {
  const g = newGame(8); const d = new Driver(g);
  g.player.setBoons([{ id: 'edge', tier: 1 }]);
  g.modal = { type: 'boon', offer: ['edge'], sel: 0, count: 1, school: null, t: 1 };
  d.frame(1, ['confirm']);
  assert.deepEqual(g.player.boons, [{ id: 'edge', tier: 2 }]);
});

test('会心は周回の乱数で決まり、同じ夜なら再現する', () => {
  const run = (seed) => {
    const { g, e } = arena(RustSoldier, 40);
    e.hp = e.maxHp = 1e9;
    g.player.setBoons([{ id: 'crit', tier: 5 }]);
    const out = [];
    for (let i = 0; i < 20; i++) { const h = e.hp; g.dealDamage(e, { base: 10, cat: 'combo', knock: 0, dir: 1 }); out.push(h - e.hp); g.combo.n = 0; }
    return out;
  };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.ok(a.some((v) => v >= 20), 'some crits (x2)');
  assert.ok(a.some((v) => v < 20), 'some normal hits');
});

test('時の欠片：倒すと貯まり、刻印で恒久強化。次の夜に反映される', () => {
  const g = newGame(12);
  g.enterRoom(0, 1);
  for (const e of g.room.enemies) { e.hp = 0; e.alive = false; }
  new Driver(g).frame(2);
  assert.ok(g.run.shards > 0);
  g.meta.shards = 1000;
  assert.ok(buyUpgrade(g.meta, 'atk'));
  assert.ok(buyUpgrade(g.meta, 'hp'));
  assert.ok(buyUpgrade(g.meta, 'inherit'));
  assert.equal(inheritCount(g.meta), 2);
  g.player.setBoons([{ id: 'edge', tier: 3 }, { id: 'crit', tier: 2 }, { id: 'gale', tier: 1 }]);
  g.endRun('death');
  assert.equal(g.meta.inherit.length, 2, 'two boons inherited');
  g.startLoop();
  assert.equal(g.player.maxHp, 330);
  assert.ok(Math.abs(g.player.metaAtk - 1.1) < 1e-9);
  assert.deepEqual(g.player.boons.map((b) => b.id + b.tier).sort(), ['crit2', 'edge3']);
});

test('刻印は欠片が足りないと買えず、上限で止まる', () => {
  const m = newMeta(1);
  assert.ok(!buyUpgrade(m, 'atk'));
  m.shards = 1e9;
  for (let i = 0; i < 50; i++) buyUpgrade(m, 'choice');
  assert.equal(upLv(m, 'choice'), UPGRADES.choice.max);
});

test('古いセーブ（欠片・刻印なし）も読み込める', async () => {
  const { deserialize, serialize } = await import('../src/meta.js');
  const m = newMeta(4);
  delete m.shards; delete m.upgrades; delete m.inherit; m.unlocked = ['haste', 'echo', 'risk'];
  const r = deserialize(serialize(m));
  assert.equal(r.shards, 0);
  assert.ok(r.unlocked.includes('power'));
});

import { dawnProgress, learn as learnK2, addWedge as addW2 } from '../src/meta.js';
test('夜明けへの道：段階が順に進み、次にすることが分かる', () => {
  const m = newMeta(2);
  let p = dawnProgress(m);
  assert.equal(p.done, 0); assert.equal(p.total, 7); assert.equal(p.next.title, '刻守を倒す');
  m.flags.bossBeaten = true; learnK2(m, 'lira_name'); learnK2(m, 'code');
  p = dawnProgress(m); assert.equal(p.done, 3); assert.equal(p.next.title, '師の日誌を読む');
  learnK2(m, 'master_reason'); m.slots = 3; addW2(m, { target: 'lira' }); learnK2(m, 'lira_message');
  p = dawnProgress(m); assert.equal(p.next.title, '夜明けの決闘に勝つ');
  m.flags.ending = true;
  p = dawnProgress(m); assert.equal(p.done, 7); assert.equal(p.next, null);
});

for (const art of ['flamering', 'starfall', 'rewindblade', 'belltoll']) {
  test(`発動する術「${art}」：ゲージを使って放ち、敵に当たる`, () => {
    const { g, d, e } = arena(RustSoldier, 70);
    e.hp = e.maxHp = 1e6; e.cool = 99;
    g.player.setBoons([{ id: art, tier: 1 }]);
    g.player.gauge = 100;
    d.frame(1); d.frame(1, ['skill']);
    assert.ok(g.player.gauge < 100, 'gauge spent');
    d.frame(60);
    assert.ok(e.hp < e.maxHp, 'spell hit the enemy');
    assert.ok(g.run.dmgByCat.skill > 0, 'counted as 術 for the boss analysis');
  });
}

test('発動条件つきの術：10コンボで秒針、重撃で落雷、ジャスト回避で斬り抜け', () => {
  const { g, d, e } = arena(RustSoldier, 60);
  e.hp = e.maxHp = 1e6; e.cool = 99;
  g.player.setBoons([{ id: 'secondhand', tier: 1 }, { id: 'thunderbell', tier: 1 }, { id: 'riposte', tier: 1 }]);
  for (let i = 0; i < 10; i++) g.dealDamage(e, { base: 1, cat: 'combo', knock: 0, dir: 1 });
  assert.ok(g.room.spells.some((s) => s.kind === 'hand'));
  g.dealDamage(e, { base: 10, cat: 'heavy', heavy: true, knock: 0, dir: 1 });
  assert.ok(g.room.spells.some((s) => s.kind === 'thunder'));
  g.perfectDodge();
  assert.ok(g.room.spells.some((s) => s.kind === 'riposte'));
});

test('発動する術は 1 つだけ。別の術を取ると持ち替える', () => {
  const g = newGame(8); const dd = new Driver(g);
  g.player.setBoons([{ id: 'flamering', tier: 2 }]);
  g.modal = { type: 'boon', offer: ['starfall'], sel: 0, count: 1, school: null, t: 1 };
  dd.frame(1, ['confirm']);
  assert.deepEqual(g.player.boons, [{ id: 'starfall', tier: 1 }]);
});
