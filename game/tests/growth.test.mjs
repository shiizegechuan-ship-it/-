import test from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, Driver, FLAT, newGame } from './helpers.mjs';
import { RustSoldier, GearRoller, ClockArcher, Phantom, BellRinger, PendulumBat, ClockTurret, GearKnight } from '../src/enemies.js';
import { newMeta, buyUpgrade, upLv, enemyScale, endLoop, inheritCount, UPGRADES } from '../src/meta.js';
import { computeStats, rollOffer, BOONS } from '../src/boons.js';
import { makeRng } from '../src/util.js';
import { ARTIFACTS } from '../src/artifacts.js';

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
  assert.equal(inheritCount(g.meta), 4, 'base 3 + 1');
  g.player.setBoons([{ id: 'edge', tier: 3 }, { id: 'crit', tier: 2 }, { id: 'execute', tier: 2 }, { id: 'opener', tier: 2 }, { id: 'gale', tier: 1 }]);
  g.endRun('death');
  assert.equal(g.meta.inherit.length, 4, 'four boons inherited');
  g.startLoop();
  assert.equal(g.player.maxHp, 330);
  assert.ok(Math.abs(g.player.metaAtk - 1.1) < 1e-9);
  assert.deepEqual(g.player.boons.map((b) => b.id + b.tier).sort(), ['crit2', 'edge3', 'execute2', 'opener2']);
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

test('パリィ斬り：回避の直後の攻撃は範囲が広く、当たれば必ず会心', () => {
  const { g, d, e } = arena(RustSoldier, 75);
  e.hp = e.maxHp = 1e6; e.cool = 99;
  d.frame(1, ['dodge', 'left']); // 敵から離れる向きに回避
  d.until(() => g.player.state === 'normal', 40);
  g.player.face = 1;
  const before = e.hp;
  d.frame(1, ['attack', 'right']);
  assert.equal(g.player.atk && g.player.atk.name, 'parry');
  d.until(() => e.hp < before, 20);
  assert.equal(before - e.hp, Math.round(16 * 2 * (1 + 0.01 * (g.combo.n - 1))), 'guaranteed crit (x2)');
  // 通常の攻撃（回避から時間が経ったあと）はパリィにならない
  d.frame(60);
  d.frame(1, ['attack']);
  assert.notEqual(g.player.atk && g.player.atk.name, 'parry');
});

test('常に発動する術：守りの秒針は回り続けて触れた敵を斬り、雷鎖は周期的に落ちる', () => {
  const { g, d, e } = arena(RustSoldier, 30);
  e.hp = e.maxHp = 1e6; e.cool = 99;
  g.player.setBoons([{ id: 'orbit', tier: 2 }, { id: 'chainlight', tier: 1 }, { id: 'aura', tier: 1 }, { id: 'seeker', tier: 1 }]);
  d.frame(60 * 5);
  assert.ok(e.hp < e.maxHp);
  assert.ok(g.player.orbitHands && g.player.orbitHands.length === 3);
  assert.ok(g.log.length >= 0);
});

test('新しい常時の術6種：それぞれ単独で敵にダメージを与え、種類が多いほど共鳴で強くなる', () => {
  for (const id of ['meteor', 'frostnova', 'swordrain', 'gearsaw', 'stormcloud', 'wake']) {
    const { g, d, e } = arena(RustSoldier, id === 'wake' ? 200 : 60);
    e.hp = e.maxHp = 1e6; e.cool = 99;
    g.player.setBoons([{ id, tier: 1 }]);
    if (id === 'wake') { for (let i = 0; i < 60 * 3; i++) d.frame(1, [i < 50 ? 'right' : 'left']); }
    else d.frame(60 * 6);
    assert.ok(e.hp < e.maxHp, `${id} damages`);
  }
  const { g, d } = arena(RustSoldier, 60);
  g.player.setBoons(['orbit', 'aura', 'meteor', 'gearsaw'].map((id) => ({ id, tier: 1 })));
  d.frame(2);
  assert.ok(Math.abs(g.player.passiveSyn - 1.45) < 1e-9, 'synergy +15% per extra kind');
});

test('凍てつく刻は敵を遅くする', () => {
  const { g, d, e } = arena(RustSoldier, 60);
  e.hp = e.maxHp = 1e6; e.cool = 99;
  g.player.setBoons([{ id: 'frostnova', tier: 1 }]);
  d.until(() => e.lag > 0, 60 * 6);
  assert.ok(e.slowed);
});

test('2段ジャンプ：空中でもう一度跳べるが、3回目は出ない。着地で回復', () => {
  const g = sandbox(FLAT); const d = new Driver(g); d.frame(5);
  const p = g.player;
  d.frame(1, ['jump']); d.frame(12, ['jump']); d.frame(6);
  assert.ok(!p.onGround);
  const y1 = p.y;
  d.frame(1, ['jump']); d.frame(1);
  assert.ok(p.vy < -400, 'second jump launches upward');
  d.frame(8);
  d.frame(1, ['jump']); d.frame(1);
  assert.ok(p.vy > -400, 'no third jump');
  d.until(() => p.onGround, 200);
  assert.equal(p.airJumpsLeft, 1);
  void y1;
});

test('上攻撃・下攻撃：↑＋攻撃は頭上に、↓＋攻撃は空中なら足元・地上なら足払い', () => {
  const g = sandbox(FLAT); const d = new Driver(g); d.frame(5);
  const p = g.player;
  d.frame(1, ['up', 'attack']);
  assert.equal(p.atk.name, 'up');
  d.until(() => p.hitbox(), 20);
  let hb = p.hitbox();
  assert.ok(hb.y < p.y - 30 && hb.y + hb.h >= p.y + p.h, 'covers above the head down to the feet');
  d.frame(40);
  d.frame(1, ['down', 'attack']);
  assert.equal(p.atk.name, 'sweep');
  d.frame(40);
  d.frame(1, ['jump']); d.frame(10, ['jump']);
  d.frame(1, ['down', 'attack']);
  assert.equal(p.atk.name, 'down');
  d.until(() => p.hitbox(), 20);
  hb = p.hitbox();
  assert.ok(hb.y <= p.y && hb.y + hb.h > p.y + p.h + 30, 'covers the body down below the feet');
});

test('下突きが当たると跳ね上がり、2段ジャンプも回復する', () => {
  const { g, d, e } = arena(RustSoldier, 0);
  e.hp = e.maxHp = 1e6; e.cool = 99;
  const p = g.player;
  e.x = p.x - 2;
  p.y = e.y - p.h - 50; p.vy = 0; p.onGround = false; p.airJumpsLeft = 0;
  d.frame(1, ['down', 'attack']);
  d.until(() => p.vy < -300, 30);
  assert.ok(p.vy < -300, 'bounced');
  assert.equal(p.airJumpsLeft, 1);
  assert.ok(e.hp < e.maxHp);
});

test('通常攻撃の判定は主人公の体まで覆う（密着・背中寄りの敵にも当たる）', () => {
  const { g, d, e } = arena(RustSoldier, 0);
  e.hp = e.maxHp = 1e6; e.cool = 99;
  const p = g.player; p.face = 1;
  e.x = p.x - 6; // 体に重なる位置（少し背中側）
  d.frame(1, ['attack']);
  d.until(() => e.hp < e.maxHp, 20);
  assert.ok(e.hp < e.maxHp);
});

test('経験値とレベル：敵を倒すと経験値、レベルアップで最大HP・攻撃が伸び、5 レベルごとに稀少の強化を選べる', () => {
  const g = newGame(11);
  const d = new Driver(g);
  g.enterRoom(0, 1); g.modal = null;
  const hp0 = g.player.maxHp;
  assert.equal(g.run.level, 1);
  g.gainExp(5000);
  assert.ok(g.run.level >= 10, `level ${g.run.level}`);
  assert.equal(g.player.maxHp, hp0 + 12 * (g.run.level - 1));
  assert.equal(g.run.pendingRare, Math.floor(g.run.level / 5));
  d.frame(1);
  assert.equal(g.modal && g.modal.type, 'boon');
  assert.ok(g.modal.rare && g.modal.offer.every((id) => BOONS[id].school === 'rare'));
  const id = g.modal.offer[g.modal.sel];
  g.modal.t = 1; d.frame(1, ['confirm']);
  assert.ok(g.player.boons.some((b) => b.id === id));
  // 倒した敵からも経験値が入る
  const g2 = newGame(12); g2.enterRoom(0, 1); g2.modal = null;
  for (const e of g2.room.enemies) { e.hp = 0; e.alive = false; }
  new Driver(g2).frame(120); // 経験値の粒が主人公へ集まるまで
  assert.ok(g2.run.exp > 0 || g2.run.level > 1);
});

test('稀少の強化：不死鳥は一度だけ立ち上がる、王冠は与ダメージ ×1.5、永劫ならコンボが時間で途切れない', () => {
  const { g, d, e } = arena(RustSoldier, 60);
  e.hp = e.maxHp = 1e6; e.cool = 99;
  g.player.maxHp = 300; g.player.hp = 5;
  g.player.setBoons([{ id: 'phoenix', tier: 1 }, { id: 'eternal', tier: 1 }]);
  g.damagePlayer(999, { fromX: 0 });
  assert.notEqual(g.player.state, 'dead');
  assert.ok(g.player.hp > 0);
  g.player.iframeT = 0; g.damagePlayer(9999, { fromX: 0 });
  assert.equal(g.player.state, 'dead', 'only once');
  assert.equal(computeStats([{ id: 'crown', tier: 1 }]).dmgMul, 1.5);
  const { g: g3, d: d3 } = arena(RustSoldier, 400);
  g3.player.setBoons([{ id: 'eternal', tier: 1 }]);
  g3.combo.n = 7; g3.combo.t = 0.1;
  d3.frame(60 * 5);
  assert.equal(g3.combo.n, 7);
  void d; void e;
});

test('継承：前の夜の強化を基本 3 個まで持ち越せる', () => {
  const m = newMeta(1);
  assert.equal(inheritCount(m), 3);
});

test('脅威：常時の術を 3 つ積むごとに敵が強く・多くなる（弓兵は増えない）', () => {
  const g = newGame(21);
  g.enterRoom(0, 1); g.modal = null;
  const base = g.room.enemies.length, hp = g.room.enemies.map((e) => e.maxHp);
  g.player.setBoons([{ id: 'orbit', tier: 3 }, { id: 'aura', tier: 3 }]); // 計 6 → 脅威 2
  assert.equal(g.threatStep(), 2);
  g.enterRoom(0, 1); g.modal = null;
  assert.equal(g.room.enemies.length, base + 2);
  assert.ok(g.room.enemies.filter((e) => e.extra).every((e) => e.kind !== 'archer' && e.kind !== 'turret'));
  assert.ok(g.room.enemies[0].maxHp > hp[0] * 2, 'hp scaled');
});

test('常時の術は敵を怯ませない（積んでも敵が攻撃してくる）', () => {
  const { g, d, e } = arena(RustSoldier, 40);
  e.hp = e.maxHp = 1e6;
  g.player.setBoons([{ id: 'orbit', tier: 5 }, { id: 'stormcloud', tier: 5 }]);
  let flinched = false;
  for (let i = 0; i < 60 * 4; i++) { d.frame(1); if (e.state === 'flinch') flinched = true; }
  assert.ok(e.hp < e.maxHp, 'takes damage');
  assert.ok(!flinched, 'never flinches from passives');
});

test('回復の扉：夜の最初の扉と、HP 満タンのときは出ない（アーティファクトか金貨に替わる）', () => {
  const g = newGame(3);
  // 計画上の報酬に回復を混ぜておく
  for (const f of g.run.plan.floors) for (const r of f) if (r.type === 'combat') r.rewardChoices = ['heal', 'boon'];
  g.room.doorsOpen = false; g.room.items = g.room.items.filter((i) => i.kind !== 'door'); g.openDoors();
  let doors = g.room.items.filter((i) => i.kind === 'door' && i.reward);
  assert.ok(doors.length && !doors.some((d) => d.reward === 'heal'), 'first door: no heal');
  assert.ok(doors.some((d) => d.reward === 'artifact'));
  // 2 回目以降：満タンなら出ない、減っていれば出る
  g.enterRoom(0, 1); g.modal = null;
  for (const e of g.room.enemies) { e.hp = 0; e.alive = false; }
  g.room.doorsOpen = false; g.player.hp = g.player.maxHp; g.openDoors();
  doors = g.room.items.filter((i) => i.kind === 'door' && i.reward);
  assert.ok(!doors.some((d) => d.reward === 'heal'), 'full hp: no heal');
  g.room.doorsOpen = false; g.room.items = g.room.items.filter((i) => i.kind !== 'door'); g.player.hp = 10; g.openDoors();
  doors = g.room.items.filter((i) => i.kind === 'door' && i.reward);
  assert.ok(doors.some((d) => d.reward === 'heal'), 'hurt: heal offered');
});

test('金貨：敵を倒すと貯まる。店で強化・回復薬・アーティファクト・黄金の鍵を買える', () => {
  const g = newGame(4);
  g.enterRoom(0, 1); g.modal = null;
  for (const e of g.room.enemies) { e.hp = 0; e.alive = false; }
  new Driver(g).frame(240); // 制圧すると金貨が集まってくる
  assert.ok(g.run.gold > 0, 'gold from kills');
  const si = g.run.plan.floors[0].findIndex((r) => r.type === 'shop');
  assert.ok(si > 0, 'shop room in floor 0');
  g.enterRoom(0, si); g.modal = null;
  assert.ok(g.room.items.some((i) => i.kind === 'merchant'));
  g.openShop();
  const m = g.modal;
  assert.deepEqual([...new Set(m.stock.map((s) => s.kind))].sort(), ['artifact', 'boon', 'key', 'potion']);
  g.run.gold = 10000;
  const nb = g.player.boons.length;
  for (let i = 0; i < m.stock.length; i++) { m.sel = i; g.buyShop(m); }
  assert.ok(m.stock.every((s) => s.sold));
  assert.ok(g.player.boons.length > nb);
  assert.equal(g.player.artifacts.length, 1);
  assert.equal(g.run.keys, 1);
  // 売り切れは買えない／金貨が足りないと買えない
  const gold = g.run.gold; m.sel = 0; g.buyShop(m); assert.equal(g.run.gold, gold);
  // 鍵があると黄金の部屋への扉が出る
  const gd = g.room.items.find((i) => i.kind === 'door' && i.golden);
  assert.ok(gd, 'golden door');
  g.goDoor(gd);
  const d = new Driver(g); d.until(() => !g.transition, 60);
  assert.equal(g.room.desc.type, 'golden');
  assert.equal(g.run.keys, 0);
  const chest = g.room.items.find((i) => i.kind === 'goldchest');
  g.player.x = chest.x; g.player.y = chest.y + chest.h - g.player.h; g.tryInteract();
  assert.equal(g.modal.type, 'artifact');
  assert.ok(g.modal.offer.every((id) => ARTIFACTS[id].rarity === 'gold'));
  g.modal.t = 1; d.frame(1, ['confirm']);
  assert.equal(g.player.artifacts.length, 2);
  // 黄金の部屋の出口は、元の次の部屋へ続く
  assert.ok(g.room.items.some((i) => i.kind === 'door' && !i.golden));
});

test('アーティファクトの効果：守りの歯車・跳ね靴・王者の剣・不滅の歯車', () => {
  const { g, d } = arena(RustSoldier, 400);
  const p = g.player; p.hp = p.maxHp = 300; p.baseMaxHp = 300;
  p.addArtifact('guardgear'); p.iframeT = 0;
  const hp0 = p.hp; g.damagePlayer(100, { fromX: 0 });
  assert.equal(hp0 - p.hp, 85);
  p.addArtifact('springboots');
  assert.equal(p.airJumpMax, 2);
  const base = computeStats([]).dmgMul;
  p.addArtifact('kingsword');
  assert.ok(Math.abs(p.stats.dmgMul - base * 1.4) < 1e-9);
  p.addArtifact('aegis'); p.iframeT = 0; d.frame(60);
  g.damagePlayer(99999, { fromX: 0 });
  assert.equal(p.state, 'normal'); assert.equal(p.hp, p.maxHp);
});

test('拾い物：経験値の粒は自動で主人公に集まり、金貨は床に落ちて触れると拾える', () => {
  const { g, d } = arena(RustSoldier, 400);
  g.room.cleared = false; // 制圧前（金貨は自動では集まらない）
  const p = g.player;
  const exp0 = g.run.exp, lv0 = g.run.level;
  g.dropExp(10, cx0(p) + 150, p.y - 40);
  d.frame(90);
  assert.ok(g.run.exp > exp0 || g.run.level > lv0, 'exp orbs home in');
  assert.equal(g.room.pickups.filter((k) => k.type === 'exp').length, 0);
  g.dropGold(20, cx0(p) + 200, p.y - 40);
  d.frame(90);
  const coins = g.room.pickups.filter((k) => k.type === 'coin');
  assert.ok(coins.length > 0 && coins.every((k) => !k.magnet), 'coins rest on the floor');
  assert.equal(g.run.gold, 0);
  // 歩いて近づくと拾える
  d.until(() => g.run.gold >= 20, 240, ['right']);
  assert.equal(g.run.gold, 20);
});
function cx0(e) { return e.x + e.w / 2; }
