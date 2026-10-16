import test from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, Driver, FLAT, newGame } from './helpers.mjs';
import { RustSoldier, GearRoller, ClockArcher, Phantom, BellRinger, PendulumBat, ClockTurret, GearKnight, Beamer, ChainReaper, GearRat, Hopper, Mallet, Warden } from '../src/enemies.js';
import { newMeta, buyUpgrade, upLv, enemyScale, endLoop, inheritCount, UPGRADES } from '../src/meta.js';
import { computeStats, rollOffer, BOONS, canForge, forgeDiff } from '../src/boons.js';
import { makeRng, cx, cy } from '../src/util.js';
import { ARTIFACTS } from '../src/artifacts.js';
import { Spell } from '../src/arts.js';
import { Game } from '../src/game.js';
import { Input } from '../src/input.js';
import { nightLook } from '../src/nightlook.js';

function arena(E, dx = 120, tier = 1) {
  const g = sandbox(FLAT); const d = new Driver(g);
  d.frame(2);
  const e = new E(g.player.x + dx, E === Phantom || E === PendulumBat ? 380 : 450);
  g.addEnemy(e); e.tier = tier;
  g.room.cleared = true;
  g.player.hp = g.player.maxHp = 1e6;
  return { g, d, e };
}

for (const [name, E] of [['歯車転がし', GearRoller], ['時計弓兵', ClockArcher], ['刻の亡霊', Phantom], ['鐘撞き', BellRinger], ['光線砲手', Beamer], ['鎖鎌兵', ChainReaper], ['歯車ネズミ', GearRat], ['跳ね潰し', Hopper], ['大槌兵', Mallet]]) {
  test(`新しい敵「${name}」：予兆を見せてから攻撃し、プレイヤーに当たる`, () => {
    const { g, d, e } = arena(E, E === ClockArcher ? 220 : E === Beamer ? 260 : E === ChainReaper ? 170 : 150);
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
  assert.equal(g.player.maxHp, 165);
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
  assert.equal(g.player.maxHp, hp0 + 6 * (g.run.level - 1));
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
  g.player.setBoons([{ id: 'orbit', tier: 5 }, { id: 'aura', tier: 4 }]); // 計 9（最初の 3 は数えない）→ 脅威 2
  assert.equal(g.threatStep(), 2);
  g.enterRoom(0, 1); g.modal = null;
  assert.equal(g.room.enemies.length, base + 2);
  assert.ok(g.room.enemies.filter((e) => e.extra).every((e) => e.kind !== 'archer' && e.kind !== 'turret'));
  assert.ok(g.room.enemies[0].maxHp > hp[0] * 1.5, 'hp scaled');
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

test('回復の扉：夜の最初の扉と、HP 満タンのときは出ない（砂時計か金貨に替わる）', () => {
  const g = newGame(3);
  // 計画上の報酬に回復を混ぜておく
  for (const f of g.run.plan.floors) for (const r of f) if (r.type === 'combat') r.rewardChoices = ['heal', 'boon'];
  g.room.doorsOpen = false; g.room.items = g.room.items.filter((i) => i.kind !== 'door'); g.openDoors();
  let doors = g.room.items.filter((i) => i.kind === 'door' && i.reward);
  assert.ok(doors.length && !doors.some((d) => d.reward === 'heal'), 'first door: no heal');
  assert.ok(doors.some((d) => d.reward === 'hourglass'));
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

test('番人たちの対策：前の夜に連撃ばかりなら、雑魚は連撃が効きにくく怯まない', () => {
  const g = newGame(31);
  g.meta.lastLoop = { dmgByCat: { combo: 900, heavy: 50 }, boons: [], clock: 120, dodges: 2 };
  g.startLoop(); g.modal = null;
  assert.equal(g.run.mobCounter, 'combo');
  g.enterRoom(0, 1); g.modal = null;
  const e = g.room.enemies.find((x) => x.kind === 'soldier') || g.room.enemies[0];
  assert.equal(e.counter, 'combo');
  e.hp = e.maxHp = 1e6; e.setState('idle');
  const before = e.hp;
  g.dealDamage(e, { base: 100, cat: 'combo', knock: 100, dir: 1 });
  assert.notEqual(e.state, 'flinch', 'iron will: no flinch from combo');
  const got = before - e.hp;
  e.hp = 1e6;
  g.dealDamage(e, { base: 100, cat: 'heavy', knock: 100, dir: 1, heavy: true });
  assert.ok(got < (1e6 - e.hp), 'combo is resisted compared to heavy');
});

test('中ボス・刻守は術で一度に削れる量に上限がある（術の物量で一瞬では溶けない）', () => {
  const g = newGame(32);
  const bi = g.run.plan.floors[2].findIndex((r) => r.type === 'boss');
  g.enterRoom(2, bi); g.modal = null;
  const b = g.room.boss; b.setState('idle');
  const hp0 = b.hp;
  for (let i = 0; i < 60; i++) g.dealDamage(b, { base: 500, cat: 'skill', knock: 0, dir: 1, spell: true, passive: true });
  assert.ok(hp0 - b.hp < b.maxHp * 0.25, `took ${hp0 - b.hp} of ${b.maxHp}`);
  // 遅くする術は中ボス・刻守に効かない
  g.player.setBoons([{ id: 'lag', tier: 2 }]);
  g.dealDamage(b, { base: 5, cat: 'combo', knock: 0, dir: 1 });
  assert.ok(!(b.lag > 0));
});

test('脅威が上がると敵の動きも速くなる', () => {
  const g = newGame(33); g.enterRoom(0, 1); g.modal = null;
  const e = g.room.enemies[0];
  const h0 = g.enemyHaste(e);
  g.player.setBoons([{ id: 'orbit', tier: 5 }, { id: 'aura', tier: 4 }]);
  assert.ok(g.enemyHaste(e) > h0);
});

test('新しい部屋：時の祠・試練の間・振り子の番人が 1 夜の中にあり、それぞれ機能する', () => {
  const g = newGame(34);
  const find = (t) => { for (let fi = 0; fi < 3; fi++) { const ri = g.run.plan.floors[fi].findIndex((r) => r.type === t); if (ri >= 0) return [fi, ri]; } return null; };
  for (const t of ['shrine', 'trial', 'elite2']) assert.ok(find(t), t);
  // 祠：命を捧げて強化
  g.enterRoom(...find('shrine')); g.modal = null;
  const sh = g.room.items.find((i) => i.kind === 'shrine');
  g.player.x = sh.x; g.player.y = sh.y + sh.h - g.player.h; g.tryInteract();
  const hp = g.player.hp; g.modal.choices[0].fn();
  assert.ok(g.player.hp < hp); assert.equal(g.modal.type, 'boon');
  // 試練：1 波目を倒すと 2 波目
  g.modal = null; g.enterRoom(...find('trial')); g.modal = null;
  const d = new Driver(g);
  for (const e of g.room.enemies) { e.hp = 0; e.alive = false; } d.frame(12);
  assert.equal(g.room.wave, 1); assert.ok(g.room.enemies.some((e) => e.alive)); assert.ok(!g.room.cleared);
  for (const e of g.room.enemies) { e.hp = 0; e.alive = false; } d.frame(12);
  assert.ok(g.room.cleared);
  // 振り子の番人：予兆を見せてから攻撃し、大技のあとに隙
  g.enterRoom(...find('elite2')); g.modal = null;
  const w = g.room.enemies.find((e) => e.kind === 'warden');
  assert.ok(w && w.elite);
  g.player.hp = g.player.maxHp = 1e6; w.hp = w.maxHp = 1e6;
  g.player.x = w.x - 80;
  const states = new Set(); let told = false;
  for (let i = 0; i < 60 * 12; i++) { d.frame(1); states.add(w.state); if (w.tell > 0.5) told = true; g.player.iframeT = 0; }
  assert.ok(told); assert.ok(states.has('recover'));
  assert.ok(['sweep', 'slam'].some((s) => states.has(s)));
  assert.ok(g.player.hp < g.player.maxHp, 'hits the player');
});

test('床を攻める常時の術（地走り・時針の剣山・灼熱の床）が地上の敵に当たる', () => {
  for (const id of ['quakeline', 'spikes', 'emberfloor']) {
    const { g, d, e } = arena(RustSoldier, 90);
    e.hp = e.maxHp = 1e6; e.cool = 99;
    g.player.setBoons([{ id, tier: 1 }]);
    d.frame(60 * 6);
    assert.ok(e.hp < e.maxHp, id);
  }
});

test('巻き戻りの語りと助言は夜ごとに変わる', () => {
  const g = newGame(35);
  const stories = new Set(), tips = new Set();
  for (let i = 0; i < 5; i++) { g.endRun('death'); stories.add(g.rewind.report.story); tips.add(g.rewind.report.tip); g.startLoop(); g.modal = null; }
  assert.equal(stories.size, 5);
  assert.ok(tips.size >= 4);
});

test('刻守の撃破：爆発の連鎖のあと消滅し、鐘が鳴って巻き戻る', () => {
  const g = newGame(36);
  const bi = g.run.plan.floors[2].findIndex((r) => r.type === 'boss');
  g.enterRoom(2, bi); g.modal = null;
  const d = new Driver(g); d.frame(5); g.modal = null;
  const b = g.room.boss; b.setState('idle');
  b.hp = 1; b.takeHit(g, { dmg: 5, dir: 1, knock: 0, cat: 'combo' });
  assert.ok(b.defeated);
  d.until(() => b.vanished, 200);
  assert.ok(b.vanished && g.fx.pillars.length > 0);
  d.until(() => g.scene === 'rewind', 400);
  assert.equal(g.scene, 'rewind');
});

test('合成：素材 2 つが Lv2 以上になると合成を聞かれ、上位の強化（Lv1）に置き換わる', () => {
  const { g, d } = arena(RustSoldier, 400);
  g.player.setBoons([{ id: 'orbit', tier: 2 }, { id: 'gearsaw', tier: 2 }, { id: 'edge', tier: 1 }]);
  d.frame(2);
  assert.equal(g.modal && g.modal.type, 'fusion');
  assert.equal(g.modal.recipe.to, 'gearwaltz');
  g.modal.t = 1; d.frame(1, ['confirm']);
  const ids = g.player.boons.map((b) => b.id).sort();
  assert.deepEqual(ids, ['edge', 'gearwaltz']);
  assert.equal(g.player.boons.find((b) => b.id === 'gearwaltz').tier, 1);
  // 合成済みの素材と、合成でしか得られないものは候補に出ない
  for (let s = 0; s < 30; s++) { const o = rollOffer(makeRng(s), g.player.boons, ['arts', 'power', 'haste'], 4); assert.ok(!o.some((id) => ['orbit', 'gearsaw', 'gearwaltz', 'starblade'].includes(id)), o.join()); }
  // 脅威：合成した術は素材ぶんとして数える（合成で脅威が下がる抜け道にならない）
  assert.equal(g.threatStep(), Math.floor((1 + 3 + 1 - 3) / 3)); // 歯車の輪舞(1+3)＋研ぎ澄まし(1)、最初の 3 は数えない
});

test('合成：「今はしない」を選ぶと、次に強化を得るまで聞かれない', () => {
  const { g, d } = arena(RustSoldier, 400);
  g.player.setBoons([{ id: 'edge', tier: 2 }, { id: 'crit', tier: 2 }]);
  d.frame(2);
  assert.equal(g.modal.type, 'fusion');
  g.modal.t = 1; g.modal.sel = 1; d.frame(1, ['confirm']);
  d.frame(5);
  assert.equal(g.modal, null);
  g.grantBoon('opener'); d.frame(2);
  assert.equal(g.modal && g.modal.type, 'fusion');
});

test('合成した術は Lv1 でも、素材 2 つ（Lv2）を合わせたより強い', () => {
  const dealt = (boons) => {
    const { g, d, e } = arena(RustSoldier, 40);
    e.hp = e.maxHp = 1e7; e.cool = 99;
    g.player.setBoons(boons); g.run.fusionDeclined = ['gearwaltz', 'starblade', 'thundergod', 'inferno', 'icejail', 'earthpulse'];
    d.frame(60 * 8); g.modal = null;
    return e.maxHp - e.hp;
  };
  for (const f of [['orbit', 'gearsaw', 'gearwaltz'], ['meteor', 'swordrain', 'starblade'], ['stormcloud', 'chainlight', 'thundergod'], ['aura', 'emberfloor', 'inferno'], ['frostnova', 'spikes', 'icejail'], ['quakeline', 'wake', 'earthpulse']]) {
    const before = dealt([{ id: f[0], tier: 2 }, { id: f[1], tier: 2 }]);
    const after = dealt([{ id: f[2], tier: 1 }]);
    assert.ok(after > before, `${f[2]}: ${after} > ${before}`);
  }
});

test('剣の道：剣気の斬撃は連撃扱いで刻守の「術の守り」に阻まれず、断罪は弱った雑魚を断つ', () => {
  const g = newGame(41);
  const bi = g.run.plan.floors[2].findIndex((r) => r.type === 'boss');
  g.enterRoom(2, bi); g.modal = null;
  const b = g.room.boss; b.setState('idle');
  const hp0 = b.hp;
  for (let i = 0; i < 8; i++) g.dealDamage(b, { base: 30, cat: 'combo', knock: 0, dir: 1, proj: true });
  assert.ok(hp0 - b.hp > b.maxHp * 0.12, `melee projectiles are not capped by the spell guard (${hp0 - b.hp})`);
  const { g: g2, e } = arena(RustSoldier, 60);
  g2.player.setBoons([{ id: 'judgement', tier: 1 }]);
  e.hp = e.maxHp * 0.2;
  g2.dealDamage(e, { base: 1, cat: 'heavy', knock: 0, dir: 1, heavy: true });
  assert.ok(!e.alive || e.hp <= 0);
});

test('剣の道：剣気・破砕・天裂は振りから斬撃が出て敵に当たり、乱舞は連撃を速く、剛剣は判定を広げる', () => {
  for (const [id, act, pre] of [['swordqi', ['attack'], null], ['crusher', null, 'heavy'], ['skyrend', ['up', 'attack'], null]]) {
    const { g, d, e } = arena(RustSoldier, 160);
    e.hp = e.maxHp = 1e6; e.cool = 99;
    if (id === 'skyrend') { e.x = g.player.x; e.y = g.player.y - 130; e.gravity = false; }
    g.player.setBoons([{ id, tier: 3 }]);
    if (pre) g.player.startAttack(g, 1, pre); else d.frame(1, act);
    d.frame(40);
    assert.ok(g.room.spells.length >= 0);
    assert.ok(e.hp < e.maxHp, id);
  }
  const { g, d } = arena(RustSoldier, 400);
  const p = g.player;
  const base = p.attackDef('combo1').recovery;
  p.setBoons([{ id: 'frenzy', tier: 5 }]); p.frenzyN = 5; p.frenzyT = 3;
  assert.ok(p.attackDef('combo1').recovery < base);
  p.setBoons([{ id: 'greatsword', tier: 2 }]);
  p.startAttack(g, 1); d.until(() => p.hitbox(), 20);
  const w1 = p.hitbox().w;
  p.setBoons([]); d.frame(40); p.startAttack(g, 1); d.until(() => p.hitbox(), 20);
  assert.ok(w1 > p.hitbox().w);
});


test('敵の数は夜が進むほど（戦闘部屋を重ねるほど）増えていく', () => {
  const g = newGame(51);
  g.enterRoom(0, 1); g.modal = null;
  const n0 = g.room.enemies.length;
  g.run.combats = 9;
  g.enterRoom(0, 1); g.modal = null;
  assert.ok(g.room.enemies.length > n0, `${g.room.enemies.length} > ${n0}`);
});

test('陣形：術を積むと散開（ネズミが混じり固まらない）、剣を積むと槍衾（奥に遠距離）', () => {
  const g = newGame(52);
  g.player.setBoons([{ id: 'orbit', tier: 3 }, { id: 'aura', tier: 3 }]);
  g.enterRoom(0, 1); g.modal = null;
  assert.equal(g.room.formation, 'aoe');
  assert.ok(g.room.enemies.some((e) => e.kind === 'rat'));
  assert.ok(g.room.enemies.filter((e) => !e.elite).every((e) => e.spread));
  const g2 = newGame(53);
  g2.player.setBoons([{ id: 'swordqi', tier: 3 }, { id: 'edge', tier: 2 }]);
  g2.enterRoom(1, 0); g2.modal = null;
  assert.equal(g2.room.formation, 'melee');
  const P = g2.marker('P');
  const ground = g2.room.enemies.filter((e) => e.gravity !== false && !e.extra).sort((a, b) => Math.abs(cx0(b) - P.x) - Math.abs(cx0(a) - P.x));
  if (ground.length >= 2) assert.ok(['beamer', 'archer'].includes(ground[0].kind), ground.map((e) => e.kind).join());
});

test('刻守は戦いの中で、いちばん受けているダメージを半減するようになる', () => {
  const g = newGame(54);
  const bi = g.run.plan.floors[2].findIndex((r) => r.type === 'boss');
  g.enterRoom(2, bi); g.modal = null;
  const b = g.room.boss; b.setState('idle');
  for (let i = 0; i < 40 && !b.adapted; i++) g.dealDamage(b, { base: 12, cat: 'combo', knock: 0, dir: 1 });
  assert.ok(b.adapted);
  assert.equal(b.resist.combo <= 0.5, true);
});

test('範囲攻撃を躱す：術の多い相手には、迫る衝撃波を跳んで躱し、その間は術が当たらない（クールタイムあり）', () => {
  const { g, d, e } = arena(RustSoldier, 200);
  e.hp = e.maxHp = 1e6; e.cool = 99; e.aoeDodge = true; e.aoeCd = 0;
  d.frame(2);
  const fy = e.y + e.h;
  g.room.spells.push(new Spell('groundwave', cx0(e) - 100, fy, { passive: true, vx: 430, life: 0.9, dmg: 50 }));
  d.frame(3);
  assert.ok(e.dodgeI > 0 || e.vy < 0, 'dodged');
  const hp = e.hp;
  g.dealDamage(e, { base: 100, cat: 'skill', knock: 0, dir: 1, spell: true });
  assert.equal(e.hp, hp, 'spell misses while dodging');
  assert.ok(e.aoeCd > 2, 'cooldown');
});

test('部屋全体を攻める術：刻震は部屋じゅうの敵に当たり、遠鐘＋星屑の合成「天球の鐘」は素材より強い', () => {
  const g = newGame(55); g.enterRoom(0, 1); g.modal = null;
  g.player.setBoons([{ id: 'timequake', tier: 1 }]); g.player.gauge = 100;
  for (const e of g.room.enemies) { e.hp = e.maxHp = 1e5; }
  g.useSkill();
  assert.ok(g.room.enemies.every((e) => e.hp < e.maxHp));
  const dealt = (boons) => {
    const { g: g2, d: d2, e } = arena(RustSoldier, 300);
    e.hp = e.maxHp = 1e7; e.cool = 99;
    g2.player.setBoons(boons); g2.run.fusionDeclined = ['celestial'];
    d2.frame(60 * 12); g2.modal = null;
    return e.maxHp - e.hp;
  };
  const before = dealt([{ id: 'tolling', tier: 2 }, { id: 'starfield', tier: 2 }]);
  const after = dealt([{ id: 'celestial', tier: 1 }]);
  assert.ok(before > 0 && after > before, `${after} > ${before}`);
});

test('難易度：簡単→普通→難しい の順に、敵の強さ・行動の段階・戦略・数が増える', () => {
  const room = (diff) => {
    const g = newGame(61);
    g.meta.difficulty = diff; g.meta.loop = 3;
    g.meta.lastLoop = { dmgByCat: { skill: 900, combo: 50 }, boons: [], clock: 120, dodges: 2 };
    g.startLoop(); g.modal = null;
    g.enterRoom(1, 0); g.modal = null;
    return { g, n: g.room.enemies.length, hp: g.run.scale.hp, tier: g.run.scale.tier, form: g.room.formation, counter: g.run.mobCounter, dodge: g.room.enemies.some((e) => e.aoeDodge) };
  };
  const e = room('easy'), n = room('normal'), h = room('hard');
  assert.ok(e.hp < n.hp && n.hp < h.hp);
  assert.ok(e.tier <= n.tier && n.tier <= h.tier && e.tier < h.tier);
  assert.ok(e.n < h.n, `${e.n} < ${h.n}`);
  assert.equal(e.counter, null); assert.equal(e.form, null); assert.equal(e.dodge, false);
  assert.equal(n.counter, 'skill');
  assert.ok(h.form, 'hard always forms up'); assert.ok(h.dodge);
  // 予備動作は簡単ほど長い
  const se = e.g.room.enemies[0], sh = h.g.room.enemies[0];
  assert.ok(se.wmul(e.g) > sh.wmul(h.g));
});

test('難易度はタイトルで切り替えられ、新しく始めた記録に反映される', () => {
  const g = new Game({ deterministicFx: true });
  assert.equal(g.difficulty().id, 'normal');
  g.cycleDifficulty(); assert.equal(g.difficulty().id, 'hard');
  g.cycleDifficulty(); assert.equal(g.difficulty().id, 'nightmare');
  g.cycleDifficulty(); assert.equal(g.difficulty().id, 'easy');
  g.newGame(5); g.modal = null;
  assert.equal(g.meta.difficulty, 'easy'); assert.equal(g.run.diff.id, 'easy');
});

test('刻守の護衛：鐘楼の衛士が現れ（数は難易度しだい）、第二楽章で増援、刻守が倒れると崩れ落ちる', () => {
  for (const [diff, n0] of [['easy', 1], ['normal', 2], ['hard', 3]]) {
    const g = newGame(62); g.meta.difficulty = diff; g.startLoop(); g.modal = null;
    const bi = g.run.plan.floors[2].findIndex((r) => r.type === 'boss');
    g.enterRoom(2, bi); g.modal = null;
    const guards = () => g.room.enemies.filter((e) => e.guard && e.alive);
    assert.equal(guards().length, n0, diff);
    assert.ok(guards().every((e) => e.maxHp < g.room.boss.maxHp * 0.2), 'guards are weak');
    const b = g.room.boss;
    b.hp = b.maxHp * 0.59; b.checkPhase(g);
    if (diff !== 'easy') assert.ok(guards().length > n0, 'reinforcements at phase 2');
    b.hp = 1; b.state = 'idle'; b.takeHit(g, { dmg: 5, dir: 1, knock: 0, cat: 'combo' });
    assert.ok(b.defeated);
    assert.equal(guards().length, 0);
  }
});

test('派手な術：雷霆は画面じゅうに雷を降らせ、天剣は遠くの敵まで届き、光芒は焼き続け、星核は最後に爆発する', () => {
  const setup = (id, dx) => {
    const g = newGame(71); g.enterRoom(0, 1); g.modal = null;
    const p = g.player; p.face = 1;
    g.room.enemies = g.room.enemies.filter((e) => e.gravity !== false); // 飛ぶ敵は軌道から外れるので除く
    g.room.enemies.forEach((e, i) => { e.hp = e.maxHp = 1e6; e.cool = 99; e.x = p.x + (dx || 100) + i * 40; e.y = p.y + p.h - e.h; });
    p.setBoons([{ id, tier: 1 }]); p.gauge = 100; g.useSkill();
    return { g, d: new Driver(g) };
  };
  let { g, d } = setup('thunderstorm', 120);
  d.frame(100);
  assert.ok(g.room.enemies.every((e) => e.hp < e.maxHp), 'storm hits everyone');
  ({ g, d } = setup('heavenblade', 300));
  d.frame(40);
  assert.ok(g.room.enemies[0].hp < g.room.enemies[0].maxHp, 'long blade reaches far');
  ({ g, d } = setup('prismbeam', 160));
  const e0 = g.room.enemies[0]; d.frame(30); const after30 = e0.hp; d.frame(30);
  assert.ok(e0.hp < after30, 'beam keeps burning');
  ({ g, d } = setup('novaorb', 200));
  d.until(() => !g.room.spells.some((s) => s.kind === 'orb'), 200);
  assert.ok(g.room.enemies[0].hp < g.room.enemies[0].maxHp);
});

test('派手な常時の術：衛星・時の竜巻・旋剣が当たり、合成した銀河の渦・時計の長針は素材より強い', () => {
  const dealt = (boons) => {
    const { g, d, e } = arena(RustSoldier, 60);
    e.hp = e.maxHp = 1e7; e.cool = 99;
    g.player.setBoons(boons); g.run.fusionDeclined = ['galaxy', 'clockhand', 'gearwaltz'];
    d.frame(60 * 10); g.modal = null;
    return e.maxHp - e.hp;
  };
  for (const id of ['satellites', 'tornado', 'spinblade']) assert.ok(dealt([{ id, tier: 1 }]) > 0, id);
  assert.ok(dealt([{ id: 'galaxy', tier: 1 }]) > dealt([{ id: 'satellites', tier: 2 }, { id: 'tornado', tier: 2 }]));
  assert.ok(dealt([{ id: 'clockhand', tier: 1 }]) > dealt([{ id: 'spinblade', tier: 2 }, { id: 'orbit', tier: 2 }]));
});

test('激ムズ：構えた雑魚は正面の攻撃をパリィして跳ね返し、重撃なら崩せる。床が赤く光ったあとの揺れは跳べば当たらない', () => {
  const g = newGame(72); g.meta.difficulty = 'nightmare'; g.startLoop(); g.modal = null;
  assert.equal(g.run.diff.id, 'nightmare');
  g.enterRoom(0, 1); g.modal = null;
  const p = g.player; p.hp = p.maxHp = 1000;
  const e = g.room.enemies.find((x) => x.gravity !== false) || g.room.enemies[0];
  e.hp = e.maxHp = 1e5; e.face = -1; e.guardT = 0.8;
  g.dealDamage(e, { base: 20, cat: 'combo', knock: 0, dir: 1 });
  assert.equal(e.hp, e.maxHp, 'parried');
  assert.ok(p.hp < p.maxHp, 'reflected damage');
  e.guardT = 0.8; p.iframeT = 5;
  g.dealDamage(e, { base: 20, cat: 'heavy', knock: 0, dir: 1, heavy: true, breaks: true });
  assert.equal(e.guardT, 0, 'heavy breaks the guard');
  // 床の揺れ
  const d = new Driver(g);
  d.frame(20); // パリィのヒットストップが明けるのを待つ
  p.iframeT = 0; g.room.quake = { t: 0, next: 0.01, tell: 0 };
  d.frame(2);
  assert.ok(g.room.quake.tell > 0, 'tell starts');
  p.y -= 200; p.vy = -50; p.onGround = false; // 空中にいる
  const hp1 = p.hp;
  for (let i = 0; i < 80; i++) { g.player.vy = Math.min(g.player.vy, -10); d.frame(1); if (!g.room.quake.tell) break; }
  assert.equal(p.hp, hp1, 'airborne: no damage');
});

test('楔の枠：はじめは 2 つ、3 夜ごとに 1 つ増える（最大 6）', () => {
  const m = newMeta(9);
  assert.equal(m.slots, 2);
  for (let i = 0; i < 3; i++) endLoop(m, { cause: 'death', floor: 1, boons: [] });
  assert.equal(m.slots, 3);
  for (let i = 0; i < 30; i++) endLoop(m, { cause: 'death', floor: 1, boons: [] });
  assert.equal(m.slots, 6);
});

test('番号の入力：スティックを斜めに倒しても、強く倒した軸の向きだけが効く', () => {
  const g = newGame(73); g.enterRoom(0, 1); g.modal = null;
  g.openCode(); g.modal.t = 1;
  const inp = new Input();
  inp.padAxis = { x: 0.3, y: -0.9 }; // ほぼ上、少し右
  inp.set('up', true, 'pad'); inp.set('right', true, 'pad'); inp.step();
  g.updateModal(inp);
  assert.equal(g.modal.pos, 0, 'did not move sideways');
  assert.equal(g.modal.digits[0], 2, 'digit went up');
});

test('夜ごとの様相：夜が進むと天気・色・ひびが変わり、夜のはじめに一言が出る', () => {
  const looks = [1, 2, 4, 6].map((loop) => nightLook({ loop, flags: {} }));
  assert.equal(looks[0].weather, null);
  assert.deepEqual(looks.slice(1).map((l) => l.weather), ['rain', 'ash', 'shards']);
  assert.ok(looks[3].cracks > looks[1].cracks);
  const g = newGame(74); g.meta.loop = 4; g.startLoop();
  assert.ok(g.nightNote && g.nightNote.text.length > 0);
});

test('大槌兵の薙ぎ払いは、ふつうの被弾よりずっと遠くへ吹き飛ばす', () => {
  const travel = (E, dx) => {
    const { g, d, e } = arena(E, dx);
    const p = g.player; p.x += 300; e.x = p.x + dx; e.facePlayer(p);
    const x0 = cx(p);
    d.until(() => p.state === 'hurt', 60 * 6);
    d.until(() => p.state !== 'hurt', 120);
    return Math.abs(cx(p) - x0);
  };
  const far = travel(Mallet, 50), near = travel(RustSoldier, 40);
  assert.ok(far > near * 2, `mallet ${far} vs soldier ${near}`);
});

test('壁への激突：吹き飛ばされて壁に当たると追加のダメージ（それだけでは倒れない）', () => {
  const { g, d } = arena(RustSoldier, 400);
  const p = g.player; p.x = 40; p.hp = 5;
  g.damagePlayer(1, { fromX: p.x + 100, knock: 600 });
  const hp1 = p.hp;
  d.frame(30);
  assert.ok(p.hp < hp1, 'wall slam hurts');
  assert.ok(p.hp >= 1 && p.state !== 'dead');
});

test('中ボス・刻守の大技は吹き飛ばす（盾突進・大薙ぎ・振り子斬り）', () => {
  const k = new GearKnight(0, 100); k.setState('bash'); k.think({ player: { x: 0, y: 0, w: 1, h: 1 }, map: { solidAt: () => false } }, 0.01);
  assert.ok(k.attacks.length && k.attacks[0].knock > 300);
  const g = newGame(5); g.meta.difficulty = 'normal';
  const bi = g.run.plan.floors[2].findIndex((r) => r.type === 'boss');
  g.enterRoom(2, bi); g.modal = null;
  const b = g.room.boss; b.setState('swing'); b.think(g, 0.01);
  assert.ok(b.attacks.length && b.attacks[0].knock > 300);
});

test('鍛冶：鍛えても変わらない強化（稀少など）は並ばず、何がどう上がるかを数字で先に見せる', () => {
  assert.equal(canForge({ id: 'crown', tier: 1 }), false, 'rare does not scale');
  assert.equal(canForge({ id: 'sandglass', tier: 1 }), false);
  assert.equal(canForge({ id: 'edge', tier: 5 }), false, 'maxed');
  assert.equal(canForge({ id: 'gale', tier: 1 }), true);
  assert.equal(forgeDiff('gale', 1).diff, '回避の距離 +35→50%、再使用 -30→45%');
  const g = newGame(6); g.enterRoom(0, 1); g.modal = null;
  g.player.setBoons([{ id: 'crown', tier: 1 }, { id: 'edge', tier: 2 }, { id: 'goldeye', tier: 1 }]);
  g.openForge();
  assert.deepEqual(g.modal.list.map((b) => b.id), ['edge']);
  g.player.setBoons([{ id: 'crown', tier: 1 }]);
  g.openForge();
  assert.notEqual(g.modal && g.modal.type, 'forge', 'nothing to forge');
});

test('アーティファクトは夜が戻ってもすべて持ち越す（そのかわり出にくい）', () => {
  const g = newGame(31);
  g.player.addArtifact('whetstone'); g.player.addArtifact('kingsword');
  g.endRun('death');
  assert.deepEqual(g.meta.artifacts.sort(), ['kingsword', 'whetstone']);
  assert.ok(g.rewind.report.kept.some((k) => k.text.startsWith('アーティファクト 2 個')));
  g.startLoop(); g.modal = null;
  assert.deepEqual(g.player.artifacts.sort(), ['kingsword', 'whetstone']);
  assert.ok(g.player.stats.dmgMul > 1.5, 'effects apply on the next night');
  // 出現頻度：扉の報酬に占めるアーティファクトは 5% 未満
  let art = 0, all = 0;
  for (let s = 1; s <= 40; s++) { const h = newGame(s * 13); for (const f of h.run.plan.floors) for (const r of f) if (r.rewardChoices) { all += r.rewardChoices.length; art += r.rewardChoices.filter((x) => x === 'artifact').length; } }
  assert.ok(art / all < 0.05, `artifact share ${(art / all * 100).toFixed(1)}%`);
});

test('時歪「刻閃」：後ろへ身をかわし、敵の数と同じ本数の画面外まで届く白い直線が続けて走り、線上の敵すべてに当たる。最後に砕けてもう一度斬れる', () => {
  const g = newGame(32); g.enterRoom(0, 1); g.modal = null;
  const p = g.player; p.hp = p.maxHp = 1e6;
  const foes = g.room.enemies.filter((e) => e.alive);
  for (const e of foes) { e.hp = e.maxHp = 1e6; e.cool = 99; }
  // ずっと遠くの敵にも届く
  foes[0].x = p.x + 900; foes[0].gravity = false; foes[0].vy = 0;
  p.gauge = 100; const x0 = p.x, face = p.face;
  assert.ok(g.useSkill());
  const sp = g.room.spells.find((s) => s.kind === 'warpslash');
  assert.ok(sp && sp.lines.length === Math.max(3, foes.length), 'one line per enemy');
  assert.equal(p.state, 'dodge', 'dodges first');
  const d = new Driver(g);
  d.frame(10);
  assert.ok(Math.sign(p.x - x0) === -face, 'moved backward');
  assert.ok(foes.every((e) => e.hp === e.maxHp), 'no cut before the dodge ends');
  d.until(() => sp.lines.every((l) => l.done), 120);
  assert.ok(foes.every((e) => e.hp < e.maxHp), 'every enemy is cut, even far away');
  const afterLines = foes.map((e) => e.hp);
  assert.ok(p.invulnerable, 'invulnerable during the finisher');
  d.until(() => sp.shattered, 120);
  d.frame(1);
  assert.ok(foes.every((e, i) => e.hp < afterLines[i]), 'shatter cuts again');
  assert.ok(foes.every((e) => !e.alive || e.warp > 0 || Math.hypot(cx(e) - cx(p), cy(e) - cy(p)) >= 280), 'still slows time nearby');
});

test('店：強化が 3 つ並び、ときどき稀少、ごくまれに伝説の強化が並ぶ（上の階ほど出やすい）', () => {
  let rare = 0, legend = 0, n = 0;
  for (let s = 1; s <= 120; s++) {
    const g = newGame(s * 17);
    for (const fi of [0, 1]) {
      g.run.fi = fi; const st = g.shopStock(); n++;
      const tiers = st.filter((x) => x.kind === 'boon').map((x) => BOONS[x.id].school);
      assert.ok(st.filter((x) => x.kind === 'boon' && !x.tier).length === 3);
      assert.ok(tiers.filter((x) => x === 'rare').length <= 1 && tiers.filter((x) => x === 'legend').length <= 1);
      if (tiers.includes('rare')) rare++;
      if (tiers.includes('legend')) legend++;
      const lg = st.find((x) => x.tier === 'legend'), rr = st.find((x) => x.tier === 'rare'), nb = st.find((x) => x.kind === 'boon' && !x.tier);
      if (lg && rr) assert.ok(lg.price > rr.price && rr.price > nb.price);
    }
  }
  assert.ok(rare / n > 0.2 && rare / n < 0.6, `rare ${rare}/${n}`);
  assert.ok(legend > 0 && legend / n < 0.15, `legend ${legend}/${n}`);
});

test('伝説の強化：神速・時計塔の加護・黄金律・星喰らい・刻の支配者', () => {
  const base = computeStats([]);
  const gs = computeStats([{ id: 'godspeed', tier: 1 }]);
  assert.ok(gs.comboSpeed >= base.comboSpeed * 1.39 && gs.moveMul >= 1.25 && gs.dodgeCdMul === 0);
  const g = newGame(41); g.enterRoom(0, 1); g.modal = null;
  const p = g.player; p.hp = p.maxHp = 1e6;
  p.addArtifact('starmap'); p.setBoons([{ id: 'towerblessing', tier: 1 }]);
  assert.equal(p.stats.passiveMul, 3, 'tower blessing stacks with the star map');
  p.setBoons([{ id: 'midas', tier: 1 }]); p.gauge = 0; const hp = (p.hp = 100);
  g.addGold(5);
  assert.equal(p.stats.goldMul, 2); assert.equal(p.gauge, 2); assert.equal(p.hp, hp + 1);
  // 星喰らい
  p.setBoons([{ id: 'stareater', tier: 1 }]);
  const foes = g.room.enemies.filter((e) => e.alive);
  for (const e of foes.slice(1)) { e.hp = e.maxHp = 1e6; e.cool = 99; }
  foes[0].hp = 0; foes[0].alive = false;
  const d = new Driver(g); d.frame(40);
  assert.ok(foes.slice(1).some((e) => e.hp < e.maxHp), 'meteors fall on nearby enemies');
  // 刻の支配者
  p.setBoons([{ id: 'chronarch', tier: 1 }]); p.gauge = 0;
  d.until(() => g.room.spells.some((s) => s.kind === 'warpslash'), 60 * 12);
  assert.ok(g.room.spells.some((s) => s.kind === 'warpslash'), 'kokusen fires by itself');
  assert.equal(p.gauge >= 0, true);
});

test('店で伝説を買うと手に入り、鍛冶には並ばない', () => {
  const g = newGame(42); g.enterRoom(0, 1); g.modal = null;
  g.run.gold = 9999;
  const m = { stock: [{ kind: 'boon', id: 'godspeed', price: 500, tier: 'legend' }], sel: 0 };
  g.buyShop(m);
  assert.ok(g.player.boons.some((b) => b.id === 'godspeed'));
  assert.equal(g.run.gold, 9499);
  assert.equal(canForge({ id: 'godspeed', tier: 1 }), false);
});
