import test from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, Driver, FLAT } from './helpers.mjs';
import { RustSoldier, GearKnight, PendulumBat } from '../src/enemies.js';
import { cx } from '../src/util.js';

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
  const combo = g.combo.n;
  d.frame(1); d.until(() => e.hp < before, 30);
  assert.equal(before - e.hp, Math.round(40 * 2 * (1 + combo * 0.01)), 'heavy x2 on slowed (+combo bonus)');
});

test('時歪：ゲージを 75 消費して刻閃を放ち、周囲の敵を遅くする。不足時は不発', () => {
  const { g, d, e } = withEnemy(PendulumBat, 80);
  d.frame(1, ['skill']);
  assert.equal(e.warp, 0, 'no gauge -> no warp');
  g.player.gauge = 100;
  d.frame(1);
  d.frame(1, ['skill']);
  assert.ok(e.warp > 1.5);
  assert.equal(g.player.gauge, 25);
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

test('ジャスト回避に成功したら、クールタイム無しで（回避の最中からでも）すぐ次の回避ができる', () => {
  const { g, d, e } = withEnemy(RustSoldier, 46);
  e.facePlayer(g.player);
  e.setState('windup');
  d.until(() => e.state === 'slash', 60);
  d.frame(1, ['dodge']);
  d.frame(2);
  assert.ok(g.run.perfects >= 1);
  assert.equal(g.player.state, 'dodge');
  const n = g.player.dodgeCount;
  d.frame(1, ['dodge', 'right']);
  assert.equal(g.player.dodgeCount, n + 1, 'chained a new dodge immediately');
  // ふつうの回避（ジャストでない）では、すぐには回避できない
  const { g: g2, d: d2 } = withEnemy(RustSoldier, 300);
  d2.frame(1, ['dodge']); d2.frame(2);
  const n2 = g2.player.dodgeCount;
  d2.frame(1, ['dodge']); d2.frame(1);
  assert.equal(g2.player.dodgeCount, n2, 'normal dodge still has a cooldown');
});

test('すり抜け床の上で ↓ を倒すと、回転斬りしながら降りる（周りの敵に 2 回当たる）。すぐ攻撃を押せば足払い', () => {
  const ROWS = [
    '################################################',
    ...Array.from({ length: 8 }, () => '#..............................................#'),
    '#P.............................................#',
    '#=========.....................................#',
    ...Array.from({ length: 3 }, () => '#..............................................#'),
    '################################################',
    '################################################',
  ];
  const g = sandbox(ROWS); const d = new Driver(g);
  d.frame(20);
  const p = g.player;
  assert.ok(p.onGround, 'standing on the platform');
  const y0 = p.y;
  const e = new RustSoldier(p.x + 4, p.y + p.h + 60); e.hp = e.maxHp = 500; e.cool = 99; g.addEnemy(e);
  e.y = p.y + p.h + 8; e.gravity = false; e.vy = 0;
  d.frame(8, ['down']);
  assert.equal(p.atk && p.atk.name, 'dropSpin');
  d.frame(20);
  assert.ok(p.y > y0 + 20, 'fell through');
  assert.ok(e.maxHp - e.hp >= 20, `spin hit twice (${e.maxHp - e.hp})`);
  // すぐ攻撃を押すと、降りずに足払い
  const g2 = sandbox(ROWS); const d2 = new Driver(g2); d2.frame(20);
  const y1 = g2.player.y;
  d2.frame(1, ['down', 'attack']);
  assert.equal(g2.player.atk.name, 'sweep');
  d2.frame(20);
  assert.ok(Math.abs(g2.player.y - y1) < 2, 'stayed on the platform');
});

test('守護の強化：時の盾・鉄の心・棘の外套・不動・踏みとどまる', () => {
  // 時の盾：張られると次の被弾を 1 回まるごと防ぐ
  let { g, d, e } = withEnemy(RustSoldier, 300);
  const p = g.player; p.setBoons([{ id: 'timeshield', tier: 3 }]); g.room.enemies = [];
  d.frame(60 * 8 + 5);
  assert.ok(p.wardUp, 'shield up after 8s');
  const hp = p.hp; g.damagePlayer(30, { fromX: p.x + 20 });
  assert.equal(p.hp, hp, 'blocked'); assert.equal(p.wardUp, false);
  // 鉄の心
  ({ g, d, e } = withEnemy(RustSoldier, 300));
  g.player.setBoons([{ id: 'ironheart', tier: 3 }]); g.player.hp = 100; g.player.maxHp = 1000;
  g.damagePlayer(40, { fromX: g.player.x + 20 });
  assert.equal(100 - g.player.hp, 30, '-25%');
  // 棘の外套：殴ってきた敵へ返す
  ({ g, d, e } = withEnemy(RustSoldier, 40));
  g.player.setBoons([{ id: 'thornmail', tier: 3 }]); g.player.hp = g.player.maxHp = 1000; e.hp = e.maxHp = 1000;
  e.facePlayer(g.player); e.setState('windup');
  d.until(() => g.player.hp < 1000, 120);
  d.frame(2);
  assert.ok(e.hp < 1000, 'thorns hurt the attacker');
  // 不動：吹き飛ばされにくく、無敵が延びる
  ({ g, d, e } = withEnemy(RustSoldier, 300));
  const q = g.player; q.setBoons([{ id: 'steadfast', tier: 3 }]); q.hp = q.maxHp = 1000;
  g.room.enemies = []; const x0 = q.x; g.damagePlayer(10, { fromX: q.x + 30, knock: 600 }); d.frame(20);
  assert.ok(Math.abs(q.x - x0) < 40, `barely moved ${q.x - x0}`);
  // 踏みとどまる：部屋ごとに 1 度、HP1 で耐え、Lv3 なら回復
  ({ g, d, e } = withEnemy(RustSoldier, 300));
  const r = g.player; r.setBoons([{ id: 'laststand', tier: 3 }]); r.maxHp = 100; r.hp = 10;
  g.damagePlayer(50, { fromX: r.x + 20 });
  assert.ok(r.state !== 'dead' && r.hp >= 1 + 20 - 1, `survived with ${r.hp}`);
  r.iframeT = 0; r.hp = 5; g.damagePlayer(50, { fromX: r.x + 20 });
  assert.equal(r.state, 'dead', 'only once per room');
});

test('弱体の強化：錆びつかせ（敵の与ダメージ減）・脆くする（受けるダメージ増）・足止めの鎖（重撃で縛る）。中ボス以上は半分', async () => {
  const { sandbox, Driver, FLAT } = await import('./helpers.mjs');
  const { RustSoldier } = await import('../src/enemies.js');
  const mk = (boons) => {
    const g = sandbox(FLAT); const d = new Driver(g); g.player.setBoons(boons);
    const e = new RustSoldier(g.player.x + 40, g.player.y + g.player.h - 40); e.hp = e.maxHp = 1e5; e.cool = 99; g.addEnemy(e);
    e.spawnT = -10; e.age = 99; return { g, d, e };
  };
  // 脆くする：同じ一撃のダメージが増える
  const hit = (boons, pre) => { const { g, e } = mk(boons); g.run.critRng = { next: () => 1 }; if (pre) pre(g, e); const h0 = e.hp; g.dealDamage(e, { base: 100, cat: 'combo', dir: 1 }); return { dmg: h0 - e.hp, e, g }; };
  const base = hit([]).dmg;
  const { e: be } = hit([{ id: 'brittle', tier: 3 }]);
  assert.ok(be.brittleT > 3.5 && be.brittleK === 0.28, 'brittle applied by a direct hit');
  const second = hit([{ id: 'brittle', tier: 3 }], (g, e) => { e.brittleT = 4; e.brittleK = 0.28; }).dmg;
  assert.ok(Math.abs(second / base - 1.28) < 0.03, `${second} vs ${base}`);
  // 錆びつかせ：敵の攻撃が弱まる
  const { g: rg, e: re } = hit([{ id: 'rust', tier: 2 }]);
  assert.ok(re.rustT > 0 && Math.abs(rg.rustMul(re) - 0.7) < 1e-9);
  // 中ボス以上は半分
  const { g: eg, e: ee } = mk([{ id: 'rust', tier: 2 }]); ee.elite = true; eg.run.critRng = { next: () => 1 };
  eg.dealDamage(ee, { base: 10, cat: 'combo', dir: 1 }); assert.ok(Math.abs(eg.rustMul(ee) - 0.85) < 1e-9);
  // 足止めの鎖：重撃で縛られ、ほとんど動けない
  const { g: sg, e: se } = mk([{ id: 'snare', tier: 2 }]); sg.run.critRng = { next: () => 1 };
  sg.dealDamage(se, { base: 10, cat: 'combo', dir: 1 }); assert.ok(!(se.snareT > 0), 'normal hit does not snare');
  sg.dealDamage(se, { base: 10, cat: 'heavy', heavy: true, dir: 1 }); assert.ok(se.snareT >= 1.4 && se.timeScale === 0.15);
  // 錆びた敵の攻撃で受けるダメージ
  const { g: dg, e: de } = mk([]);
  const hp0 = dg.player.hp; de.rustT = 4; de.rustK = 0.4; dg.attacker = de;
  dg.hitPlayer({ x: dg.player.x, y: dg.player.y, w: 10, h: 10, dmg: 20 }, Math.round(20 * dg.rustMul(de)), cx(de), 'x', 0);
  assert.ok(hp0 - dg.player.hp <= 12, `rusted hit ${hp0 - dg.player.hp}`);
});

test('守護の強化：不動の構え（立ち止まっている間の被ダメージ減）・再生の刻（制圧で回復）', async () => {
  const { sandbox, Driver, FLAT } = await import('./helpers.mjs');
  const g = sandbox(FLAT); const d = new Driver(g); d.frame(10);
  const p = g.player;
  let h = p.hp; g.damagePlayer(40, { fromX: cx(p) }); const plain = h - p.hp;
  p.hp = p.maxHp; p.iframeT = 0; p.state = 'normal'; d.frame(60);
  p.setBoons([{ id: 'stance', tier: 3 }]); p.iframeT = 0; p.state = 'normal'; p.vx = 0; d.frame(1);
  h = p.hp; g.damagePlayer(40, { fromX: cx(p) }); const stood = h - p.hp;
  assert.ok(stood <= Math.ceil(plain * 0.56), `${stood} vs ${plain}`);
  // 走っている間は減らない
  p.hp = p.maxHp; p.state = 'normal'; p.iframeT = 0; p.vx = 200; p.onGround = true;
  h = p.hp; g.damagePlayer(40, { fromX: cx(p) }); assert.equal(h - p.hp, plain);
  // 再生の刻
  p.setBoons([{ id: 'recover', tier: 2 }]); p.state = 'normal'; p.hp = 50;
  g.room.desc = { ...g.room.desc, type: 'combat' }; g.room.cleared = false; g.clearRoom(false);
  assert.equal(p.hp, 50 + Math.round(p.maxHp * 0.12));
  // 敵のいない部屋（店・入口など）に入っただけでは回復しない
  const { newGame } = await import('./helpers.mjs');
  const s2 = newGame(5); s2.player.setBoons([{ id: 'recover', tier: 3 }]); s2.player.hp = 50;
  const fi = s2.run.plan.floors.findIndex((fl) => fl.some((r) => r.type === 'shop'));
  s2.enterRoom(fi, s2.run.plan.floors[fi].findIndex((r) => r.type === 'shop'));
  assert.ok(s2.room.cleared); assert.equal(s2.player.hp, 50);
});

test('敵の大きさ：通常の敵は見た目 1.25 倍・当たり判定 1.12 倍、最後の中ボスと刻守は 1.5 倍（足元の位置は変わらない）', async () => {
  const { ENEMY_SIZE } = await import('../src/game.js');
  const { Warden } = await import('../src/enemies.js');
  const g = sandbox(FLAT);
  const e = new RustSoldier(300, 300); const w0 = e.w, h0 = e.h, foot = e.y + e.h, mid = e.x + e.w / 2;
  g.addEnemy(e);
  assert.equal(e.drawScale, ENEMY_SIZE.look);
  assert.equal(e.w, Math.round(w0 * 1.12)); assert.equal(e.h, Math.round(h0 * 1.12));
  assert.ok(Math.abs(e.y + e.h - foot) < 1e-9 && Math.abs(e.x + e.w / 2 - mid) < 1e-9);
  const wd = new Warden(400, 400); const ww = wd.w; g.addEnemy(wd);
  assert.equal(wd.drawScale, 1.5); assert.equal(wd.w, Math.round(ww * 1.5));
  // 二重に大きくならない
  g.addEnemy(e); assert.equal(e.w, Math.round(w0 * 1.12));
  const k = new GearKnight(500, 400); const kw = k.w; g.addEnemy(k);
  assert.ok(!k.drawScale && k.w === kw, 'other mid-bosses keep their size');
});

test('刻守の時の障壁：強い一撃を続けても、戦った時間ぶんしか削れない（最短約 20 秒）。弱い攻撃には何もしない', async () => {
  const { BOSS_MIN_TIME } = await import('../src/game.js');
  const { newGame, Driver } = await import('./helpers.mjs');
  const g = newGame(31); const d = new Driver(g);
  g.enterRoom(2, g.run.plan.floors[2].findIndex((r) => r.type === 'boss')); g.modal = null;
  const b = g.room.boss; b.state = 'idle';
  const rate = b.maxHp / BOSS_MIN_TIME;
  // 戦い始めに桁違いの一撃
  g.dealDamage(b, { base: 1e5, cat: 'combo', dir: 1 });
  assert.ok(b.maxHp - b.hp <= rate * 1.5 + rate * 0.25 + 1, `first hit ${b.maxHp - b.hp}`);
  // 10 秒たっても、削れるのは約 10 秒ぶん
  b.barrier.t = 10;
  for (let i = 0; i < 30; i++) { b.state = 'idle'; g.dealDamage(b, { base: 1e5, cat: 'combo', dir: 1 }); }
  assert.ok(b.maxHp - b.hp <= rate * 11.5 + rate * 0.25 * 31 + 1, `after 10s ${b.maxHp - b.hp}`);
  assert.ok(b.hp > 0 && !b.defeated, 'still standing');
  // 弱い攻撃（目安より遅いペース）は減らない
  const h = newGame(32);
  h.enterRoom(2, h.run.plan.floors[2].findIndex((r) => r.type === 'boss')); h.modal = null;
  const c = h.room.boss; c.state = 'idle'; c.barrier = { t: 30, dealt: 0 }; h.run.critRng = { next: () => 1 };
  const hp0 = c.hp; h.dealDamage(c, { base: 10, cat: 'combo', dir: 1 });
  const plain = newGame(32); plain.enterRoom(2, plain.run.plan.floors[2].findIndex((r) => r.type === 'boss')); plain.modal = null;
  const pc = plain.room.boss; pc.state = 'idle'; pc.barrier = { t: 1e9, dealt: 0 }; plain.run.critRng = { next: () => 1 };
  const p0 = pc.hp; plain.dealDamage(pc, { base: 10, cat: 'combo', dir: 1 });
  assert.equal(hp0 - c.hp, p0 - pc.hp);
});
