import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, memStorage, Driver } from './helpers.mjs';
import { buildPlan, LAYOUTS } from '../src/world.js';
import {
  newMeta, addWedge, removeWedge, endLoop, bossCounter, serialize, deserialize, trueEndReady, learn,
  hasWedge, GLEN_DEADLINE, MAX_SLOTS,
} from '../src/meta.js';
import { Game } from '../src/game.js';

test('部屋レイアウトはすべて18行・幅が揃っている', () => {
  for (const [name, rows] of Object.entries(LAYOUTS)) {
    assert.equal(rows.length, 18, name);
    const w = rows[0].length;
    for (const r of rows) assert.equal(r.length, w, `${name}: ${r}`);
    assert.ok(rows.some((r) => r.includes('P')), `${name} has spawn`);
  }
});

test('塔の構成：同じセーブ・同じ夜なら完全に同じ（再現性）', () => {
  const m = newMeta(42);
  assert.deepEqual(buildPlan(m, 1000), buildPlan(m, 1000));
});

test('揺らぎと因果：夜が変わると戦闘部屋は揺らぐが、因果部屋の位置は不変', () => {
  const m = newMeta(42);
  const sig = (p) => p.floors.map((f) => f.map((r) => r.type).join(',')).join('|');
  const combats = (p) => p.floors.flat().filter((r) => r.type === 'combat').map((r) => r.layout + JSON.stringify(r.enemies)).join(';');
  const plans = [1, 2, 3, 4, 5].map((s) => buildPlan(m, s * 7919));
  for (const p of plans) assert.equal(sig(p), sig(plans[0]));
  const distinct = new Set(plans.map(combats));
  assert.ok(distinct.size >= 3, 'combat rooms vary per loop');
});

test('楔：枠の上限・重複不可・抜くと戻る', () => {
  const m = newMeta(1);
  assert.equal(m.slots, 1);
  assert.ok(addWedge(m, { target: 'lira' }));
  assert.ok(!addWedge(m, { target: 'glen' }), 'no free slot');
  m.slots = 2;
  assert.ok(!addWedge(m, { target: 'lira' }), 'duplicate');
  assert.ok(addWedge(m, { target: 'glen' }));
  const w = removeWedge(m, 0);
  assert.equal(w.target, 'lira');
  assert.ok(!hasWedge(m, 'lira'));
});

test('周回の終わり：強化はリセット、楔の強化は保持、知識は保持', () => {
  const st = memStorage();
  const g = newGame(5, st);
  g.player.setBoons([{ id: 'echo', tier: 2 }, { id: 'gale', tier: 1 }]);
  g.meta.slots = 2;
  addWedge(g.meta, { target: 'boon', boon: { id: 'echo', tier: 2 } });
  g.learnK('code');
  g.endRun('death');
  assert.equal(g.scene, 'rewind');
  const rep = g.rewind.report;
  assert.ok(rep.kept.some((k) => k.text.includes('残響')));
  assert.ok(rep.reset.some((k) => k.sub.includes('疾風')));
  g.startLoop();
  assert.equal(g.meta.loop, 2);
  assert.deepEqual(g.player.boons, [{ id: 'echo', tier: 2 }]);
  assert.equal(g.player.hp, g.player.maxHp);
  assert.ok(g.meta.knowledge.code);
  // 保存されている
  const re = deserialize(st.raw);
  assert.equal(re.loop, 2);
});

test('セーブの読み込み：壊れたデータ・古い版は無視して新規扱い', () => {
  assert.equal(deserialize('{bad json'), null);
  assert.equal(deserialize(JSON.stringify({ v: 0 })), null);
  const m = newMeta(9);
  assert.deepEqual(deserialize(serialize(m)), m);
  const g = new Game({ storage: memStorage('garbage') });
  assert.equal(g.meta, null);
});

test('刻守の記憶：前の夜に最も使った手段への対策を1つだけ持つ', () => {
  assert.equal(bossCounter(null), null);
  assert.equal(bossCounter({ dmgByCat: { combo: 50, heavy: 30 } }), null, 'below threshold');
  assert.equal(bossCounter({ dmgByCat: { combo: 200, heavy: 400, echo: 100 } }), 'heavy');
  const m = newMeta(1);
  const r1 = endLoop(m, { cause: 'death', floor: 3, boons: [], dmgByCat: { combo: 500 } });
  assert.ok(r1.changed.some((c) => c.text.includes('反撃の足捌き')));
  const r2 = endLoop(m, { cause: 'death', floor: 3, boons: [], dmgByCat: { combo: 500 } });
  assert.ok(!r2.changed.some((c) => c.text.includes('覚えた')), 'same counter is not re-announced');
});

test('偽りの勝利（鐘）：初回だけ楔の枠+1', () => {
  const m = newMeta(1);
  endLoop(m, { cause: 'bell', floor: 3, boons: [] });
  assert.equal(m.slots, 2);
  endLoop(m, { cause: 'bell', floor: 3, boons: [] });
  assert.equal(m.slots, 2);
  assert.ok(m.slots <= MAX_SLOTS);
});

test('真の結末の条件：リラの楔＋伝言＋師の動機', () => {
  const m = newMeta(1);
  m.slots = 3;
  learn(m, 'lira_message'); learn(m, 'master_reason');
  assert.ok(!trueEndReady(m));
  addWedge(m, { target: 'lira' });
  assert.ok(trueEndReady(m));
});

test('因果：リラに楔を打つと、次の夜の入口で彼女は覚えている', () => {
  const g = newGame(11);
  const d = new Driver(g);
  addWedge(g.meta, { target: 'lira' });
  g.endRun('death'); g.startLoop();
  const lira = g.room.items.find((i) => i.who === 'lira');
  assert.ok(lira.wedged);
  // 名前を知らない状態 → 父の手がかり
  g.player.x = lira.x; d.frame(1); d.frame(1, ['up']);
  assert.equal(g.modal.type, 'dialog');
  assert.ok(g.meta.knowledge.lira_father);
});

test('因果：グレンの期限を過ぎて鍛冶場に着くと死んでいる／間に合えば襲撃戦', () => {
  const g = newGame(3);
  g.run.clock = GLEN_DEADLINE + 1;
  g.enterRoom(0, 3);
  assert.equal(g.run.glen, 'dead');
  assert.ok(g.room.items.some((i) => i.kind === 'corpse'));
  const g2 = newGame(3);
  g2.run.clock = 30;
  g2.enterRoom(0, 3);
  assert.equal(g2.run.glen, 'attacked');
  assert.equal(g2.room.enemies.length, 2);
  for (const e of g2.room.enemies) e.hp = 0, e.alive = false;
  new Driver(g2).frame(2);
  assert.equal(g2.run.glen, 'saved');
  assert.ok(g2.meta.knowledge.glen_saved);
});

test('因果：グレンに楔 → 次の夜は入口にいて、鍛冶場は空', () => {
  const g = newGame(3);
  addWedge(g.meta, { target: 'glen' });
  g.endRun('death'); g.startLoop();
  assert.ok(g.room.items.some((i) => i.who === 'glen'));
  g.enterRoom(0, 3);
  assert.ok(g.room.cleared);
  assert.equal(g.room.enemies.length, 0);
});

test('因果：騎士の残骸に楔 → 次の夜は騎士がおらず、昇降機で書斎へ直行（報酬なし）', () => {
  const g = newGame(8);
  const d = new Driver(g);
  g.enterRoom(1, 1);
  assert.ok(g.room.enemies.some((e) => e.kind === 'knight'));
  addWedge(g.meta, { target: 'knight' });
  g.endRun('death'); g.startLoop();
  g.enterRoom(1, 1);
  assert.equal(g.room.enemies.length, 0);
  assert.ok(!g.room.items.some((i) => i.kind === 'reward'), 'no reward without a fight');
  const lift = g.room.items.find((i) => i.kind === 'lift');
  assert.ok(lift && !lift.dead);
  g.player.x = lift.x + 10; g.player.y = lift.y + lift.h - g.player.h; d.frame(2);
  d.frame(1, ['up']);
  d.frame(40);
  assert.equal(g.roomDesc().type, 'study');
});

test('因果：歯止めに楔 → 刻守は時止めを使わず、第2段階が75%から', () => {
  const g = newGame(8);
  addWedge(g.meta, { target: 'brake' });
  g.endRun('death'); g.startLoop();
  g.enterRoom(2, 2);
  const b = g.room.boss;
  assert.ok(b.brake);
  assert.equal(b.p2At, 0.75);
});

test('知識：書庫の番号はセーブ固定で、知っていれば次の夜も開けられる', () => {
  const g = newGame(21);
  const code = g.meta.code.slice();
  g.endRun('death'); g.startLoop();
  assert.deepEqual(g.meta.code, code, 'code does not change between loops');
  g.enterRoom(1, 2);
  g.openCode();
  g.modal.digits = code.slice();
  const d = new Driver(g);
  d.frame(12);
  d.frame(1, ['confirm']);
  assert.ok(g.run.vaultOpen);
});

// 到達可能性：出現位置から、すべての敵枠・仕掛け・出口へ歩き＋ジャンプ（上に3タイルまで）で届くこと
import { TileMap, SOLID, ONEWAY } from '../src/tilemap.js';
test('すべての部屋で、敵・仕掛け・出口にジャンプで到達できる（進行不能がない）', () => {
  for (const [name, rows] of Object.entries(LAYOUTS)) {
    const m = new TileMap(rows);
    const empty = (x, y) => m.get(x, y) !== SOLID;
    const stand = (x, y) => y >= 1 && y < m.h - 1 && empty(x, y) && m.get(x, y) !== ONEWAY && (m.get(x, y + 1) === SOLID || m.get(x, y + 1) === ONEWAY);
    const cells = [];
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (stand(x, y)) cells.push([x, y]);
    const P = m.markers.find((k) => k.c === 'P');
    const key = (c) => c[0] + ',' + c[1];
    const seen = new Set([key([P.tx, P.ty])]);
    const q = [[P.tx, P.ty]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const c of cells) {
        if (seen.has(key(c))) continue;
        const dx = Math.abs(c[0] - x), up = y - c[1];
        if ((up <= 3 && up >= 0 && dx <= 4) || (up < 0 && dx <= 6)) { seen.add(key(c)); q.push(c); }
      }
    }
    for (const k of m.markers) {
      if (k.c === 'a' || k.c === 'P') continue;
      const ok = [...seen].some((s) => { const [x, y] = s.split(',').map(Number); return Math.abs(x - k.tx) <= 1 && Math.abs(y - k.ty) <= 1; });
      assert.ok(ok, `${name}: '${k.c}' at ${k.tx},${k.ty} unreachable`);
    }
  }
});

test('扉と人物・仕掛けが重ならない（調べる対象を取り違えない）', async () => {
  const { Game } = await import('../src/game.js');
  const { addWedge } = await import('../src/meta.js');
  const { overlap } = await import('../src/util.js');
  const g = new Game({ deterministicFx: true });
  g.newGame(31);
  g.meta.slots = 3; addWedge(g.meta, { target: 'glen' }); addWedge(g.meta, { target: 'knight' });
  for (let fi = 0; fi < 3; fi++) for (let ri = 0; ri < g.run.plan.floors[fi].length; ri++) {
    g.enterRoom(fi, ri); g.modal = null;
    for (const e of g.room.enemies) { e.hp = 0; e.alive = false; }
    g.openDoors();
    const doors = g.room.items.filter((i) => i.kind === 'door');
    const others = g.room.items.filter((i) => i.kind !== 'door' && i.kind !== 'reward' && i.kind !== 'sign');
    for (const d of doors) for (const o of others) assert.ok(!overlap(d, o), `${g.roomDesc().type}: door overlaps ${o.kind}`);
  }
});

test('救出戦：放っておくと錆兵がグレンを襲い、近づくと引きつけられる', () => {
  const g = newGame(3);
  const d = new Driver(g);
  g.run.clock = 10;
  g.enterRoom(0, 3);
  for (const e of g.room.enemies) e.lag = 0;
  // 入口に立ったまま放置
  d.frame(60 * 4);
  const hpIgnored = g.room.glenHp;
  assert.ok(hpIgnored < 60, `glen takes damage when ignored (${hpIgnored})`);
  // 錆兵のすぐそばへ
  const e = g.room.enemies[0];
  g.player.x = e.x - 40; g.player.y = e.y + e.h - g.player.h; g.player.hp = 9999; g.player.maxHp = 9999;
  d.frame(30);
  assert.ok(g.targetFor(e) === g.player, 'nearby soldier targets the player');
});
