import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, memStorage, Driver } from './helpers.mjs';
import { buildPlan, LAYOUTS } from '../src/world.js';
import {
  newMeta, addWedge, removeWedge, endLoop, bossCounter, serialize, deserialize, trueEndReady, learn,
  hasWedge, GLEN_DEADLINE, MAX_SLOTS,
} from '../src/meta.js';
import { Game } from '../src/game.js';

test('部屋レイアウトは決まった行数・幅が揃っている', () => {
  for (const [name, rows] of Object.entries(LAYOUTS)) {
    assert.ok([18, 24, 29].includes(rows.length), `${name}: ${rows.length} rows`);
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

test('楔：人の楔と技の楔は別の枠・枠の上限・重複不可・抜くと戻る', () => {
  const m = newMeta(1);
  assert.equal(m.slots, 3, 'every difficulty starts with 3 skill wedges');
  assert.equal(m.personSlots, 2, 'and 2 person wedges');
  m.personSlots = 1;
  assert.ok(addWedge(m, { target: 'lira' }));
  assert.ok(!addWedge(m, { target: 'glen' }), 'no free person slot');
  // 技の楔は人の楔の枠を使わない
  assert.ok(addWedge(m, { target: 'boon', boon: { id: 'echo', tier: 1 } }));
  m.slots = 1;
  assert.ok(!addWedge(m, { target: 'boon', boon: { id: 'gale', tier: 1 } }), 'no free skill slot');
  m.personSlots = 2;
  assert.ok(!addWedge(m, { target: 'lira' }), 'duplicate');
  assert.ok(addWedge(m, { target: 'glen' }));
  const w = removeWedge(m, 0);
  assert.equal(w.target, 'lira');
  assert.ok(!hasWedge(m, 'lira'));
});

test('周回の終わり：強化はリセット、楔の強化は保持、知識は保持', () => {
  const st = memStorage();
  const g = newGame(5, st);
  g.player.setBoons([{ id: 'echo', tier: 2 }, { id: 'gale', tier: 1 }, { id: 'lag', tier: 1 }, { id: 'mirror', tier: 1 }, { id: 'freeze', tier: 1 }]);
  g.meta.slots = 2;
  addWedge(g.meta, { target: 'boon', boon: { id: 'echo', tier: 2 } });
  g.learnK('code');
  g.endRun('death');
  assert.equal(g.scene, 'rewind');
  const rep = g.rewind.report;
  assert.ok(rep.kept.some((k) => k.text.includes('残響')));
  // 継承枠 3：楔の強化（残響）以外から 3 つを持ち越し、残り（凍刻）はリセット
  assert.deepEqual(g.meta.inherit.map((b) => b.id), ['gale', 'lag', 'mirror']);
  assert.ok(rep.reset.some((k) => k.sub.includes('凍刻')));
  g.startLoop();
  assert.equal(g.meta.loop, 2);
  assert.deepEqual(g.player.boons.map((b) => b.id).sort(), ['echo', 'gale', 'lag', 'mirror']);
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

test('刻守の記憶：前の夜の戦い方を分析し、最も多い手段への対策を1つ持つ', async () => {
  const { habitAnalysis } = await import('../src/meta.js');
  assert.equal(bossCounter(null), null);
  assert.equal(bossCounter({ dmgByCat: { combo: 40, heavy: 30 } }), null, 'below threshold');
  assert.equal(bossCounter({ dmgByCat: { combo: 200, heavy: 400, echo: 100 } }), 'heavy');
  // 回避を多用し、攻撃が偏っていなければ「読みのフェイント」
  assert.equal(bossCounter({ dmgByCat: { combo: 300, heavy: 300, air: 200 }, dodges: 60, clock: 180 }), 'dodge');
  const a = habitAnalysis({ dmgByCat: { combo: 300, heavy: 100 }, dodges: 6, clock: 120 });
  assert.equal(a.counter, 'combo'); assert.equal(Math.round(a.shares.combo * 100), 75); assert.equal(a.dodgeRate, 3);
  const m = newMeta(1);
  const r1 = endLoop(m, { cause: 'death', floor: 3, boons: [], dmgByCat: { combo: 500 } });
  const line = r1.changed.find((c) => c.text.includes('歯車の外殻'));
  assert.ok(line && line.text.includes('連撃') && line.sub.includes('崩し方'), 'announces counter, habit share and how to break it');
});

test('偽りの勝利（鐘）：初回だけ楔の枠+1', () => {
  const m = newMeta(1);
  endLoop(m, { cause: 'bell', floor: 3, boons: [] });
  assert.equal(m.slots, 4);
  endLoop(m, { cause: 'bell', floor: 3, boons: [] });
  assert.equal(m.slots, 4);
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
  g.enterRoom(2, g.run.plan.floors[2].findIndex((r) => r.type === 'boss'));
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
test('すべての部屋で（左右反転も含め）、敵・仕掛け・出口にジャンプで到達できる（進行不能がない）', async () => {
  const { mirrorRows } = await import('../src/world.js');
  const variants = Object.entries(LAYOUTS).flatMap(([n, r]) => [[n, r], [n + '(反転)', mirrorRows(r)]]);
  for (const [name, rows] of variants) {
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

test('すべての部屋に出現位置が1つ、出口が1つある（刻守の部屋を除く）', () => {
  for (const [name, rows] of Object.entries(LAYOUTS)) {
    const t = rows.join('');
    assert.equal(t.split('P').length - 1, 1, `${name} P`);
    if (name !== 'belfry') assert.equal(t.split('X').length - 1, 1, `${name} X`);
  }
});

test('部屋に入ると主人公は左端から始まり、出口は右側（左右反転した部屋でも）', async () => {
  const { mirrorRows } = await import('../src/world.js');
  for (const [name, rows] of Object.entries(LAYOUTS)) {
    if (name === 'belfry') continue;
    for (const r of [rows, mirrorRows(rows)]) {
      const w = r[0].length;
      const px = r.map((row) => row.indexOf('P')).find((x) => x >= 0);
      const xx = r.map((row) => row.indexOf('X')).find((x) => x >= 0);
      assert.ok(px <= 4, `${name}: P at col ${px}`);
      assert.ok(xx > w / 2, `${name}: X at col ${xx}`);
    }
  }
});

test('めちゃ簡単：何も設定しなくても、強化・術はすべて Lv ごと次の夜へ持ち越す（ほかの難易度では持ち越さない）', async () => {
  const { newGame } = await import('./helpers.mjs');
  for (const [diff, carry] of [['veryeasy', true], ['normal', false]]) {
    const g = newGame(21); g.meta.difficulty = diff; g.startLoop(); g.modal = null;
    g.meta.inherit = [];
    g.player.setBoons([{ id: 'edge', tier: 4 }, { id: 'satellites', tier: 2 }, { id: 'crown', tier: 1 }, { id: 'heavenblade', tier: 3 }, { id: 'gale', tier: 2 }, { id: 'crit', tier: 1 }]);
    g.endRun('death');
    g.meta.inherit = []; // 継承も使わない
    g.startLoop(); g.modal = null;
    const ids = g.player.boons.map((b) => b.id + ':' + b.tier);
    for (const want of ['edge:4', 'satellites:2', 'crown:1', 'heavenblade:3', 'gale:2', 'crit:1']) assert.equal(ids.includes(want), carry, `${diff} ${want}`);
    if (carry) assert.ok(g.rewind == null || true);
  }
});

test('古いセーブ（楔の枠 2）も読み込むと 3 つになる', () => {
  const m = newMeta(3); m.slots = 2;
  const back = deserialize(serialize(m));
  assert.equal(back.slots, 3);
});

test('敵 1 体ごとの金貨：めちゃ簡単 ×3・簡単 ×2・普通〜激ムズ ×1.25（以前と比べて）', async () => {
  const { newGame } = await import('./helpers.mjs');
  const { DIFFICULTY } = await import('../src/config.js');
  const goldOf = (diff) => {
    const g = newGame(31); g.meta.difficulty = diff; g.startLoop(); g.modal = null;
    g.enterRoom(0, 1); g.modal = null;
    const e = g.room.enemies.find((x) => x.kind === 'soldier') || g.room.enemies[0];
    let got = 0; g.dropGold = (n) => { got += n; };
    g.room.budget = null; // 部屋の取り分の分配を外して、1 体そのものの金貨を比べる
    e.hp = 0; e.alive = false; g.handleDeaths();
    return got;
  };
  const base = goldOf('normal') / 1.25;
  assert.equal(DIFFICULTY.veryeasy.goldMul, 3); assert.equal(DIFFICULTY.easy.goldMul, 2);
  for (const d of ['normal', 'hard', 'nightmare']) assert.equal(DIFFICULTY[d].goldMul, 1.25);
  assert.ok(Math.abs(goldOf('veryeasy') - base * 3) <= 1.5, 'x3');
  assert.ok(Math.abs(goldOf('easy') - base * 2) <= 1.5, 'x2');
});

test('めちゃ簡単：継承は最初から無限。夜を何度重ねても、すべての強化を Lv のまま最後まで持ち越す', async () => {
  const { newGame } = await import('./helpers.mjs');
  const { inheritCount, inheritLabel } = await import('../src/meta.js');
  const g = newGame(41); g.meta.difficulty = 'veryeasy'; g.startLoop(); g.modal = null;
  assert.equal(inheritCount(g.meta), Infinity); assert.equal(inheritLabel(g.meta), '∞');
  const all = [{ id: 'edge', tier: 5 }, { id: 'crit', tier: 3 }, { id: 'satellites', tier: 4 }, { id: 'gale', tier: 2 }, { id: 'echo', tier: 2 }, { id: 'aura', tier: 3 }, { id: 'meteor', tier: 2 }, { id: 'crown', tier: 1 }, { id: 'heavenblade', tier: 4 }, { id: 'timeshield', tier: 3 }];
  g.player.setBoons(all.map((b) => ({ ...b })));
  for (let night = 0; night < 4; night++) {
    g.endRun('death');
    assert.equal(g.meta.inherit.length >= all.length, true, 'all inherited');
    g.startLoop(); g.modal = null;
    for (const b of all) assert.ok(g.player.boons.some((x) => x.id === b.id && x.tier === b.tier), `night ${night + 2}: ${b.id} Lv${b.tier}`);
  }
  // ほかの難易度は従来どおり
  const n = newGame(42); n.meta.difficulty = 'normal';
  assert.equal(inheritCount(n.meta), 3);
});

test('難易度は、記録を消してはじめからやり直しても（読み込み直したあとでも）引き継ぐ', async () => {
  const { Game } = await import('../src/game.js');
  let save = null, settings = null;
  const storage = { load: () => save, save: (v) => { save = v; }, loadSettings: () => settings, saveSettings: (v) => { settings = v; } };
  for (const diff of ['veryeasy', 'easy', 'hard', 'nightmare']) {
    save = null; settings = null;
    let g = new Game({ deterministicFx: true, storage });
    while (g.difficulty().id !== diff) g.cycleDifficulty();
    g.newGame(1); g.modal = null;
    assert.equal(g.meta.difficulty, diff);
    // ページを読み込み直す → 「はじめから（記録を消す）」
    g = new Game({ deterministicFx: true, storage });
    assert.equal(g.difficulty().id, diff, 'remembered after reload');
    g.newGame(2); g.modal = null;
    assert.equal(g.meta.difficulty, diff, 'kept after erasing the save');
    assert.equal(g.run.diff.id, diff);
    // 設定だけが残っていて記録がないときも
    save = null;
    g = new Game({ deterministicFx: true, storage });
    g.newGame(3); g.modal = null;
    assert.equal(g.meta.difficulty, diff, 'settings alone keep it');
  }
  // 設定の保存がない古い環境でも、記録の難易度を引き継ぐ
  save = null;
  const old = { load: () => save, save: (v) => { save = v; } };
  let g = new Game({ deterministicFx: true, storage: old });
  g.cycleDifficulty(); g.newGame(4); // hard
  g = new Game({ deterministicFx: true, storage: old });
  g.newGame(5);
  assert.equal(g.meta.difficulty, 'hard');
});

test('めちゃ簡単の巻き戻り画面：継承の刻印は ∞（刻めない）、継承と楔はすべて自動で外せない（楔の枠は使わない）', async () => {
  const { newGame, Driver } = await import('./helpers.mjs');
  const g = newGame(43); g.meta.difficulty = 'veryeasy'; g.startLoop(); g.modal = null;
  const all = [{ id: 'edge', tier: 3 }, { id: 'crit', tier: 2 }, { id: 'satellites', tier: 2 }, { id: 'gale', tier: 1 }];
  g.player.setBoons(all.map((b) => ({ ...b })));
  g.endRun('death');
  const d = new Driver(g);
  d.until(() => g.scene === 'rewind', 300); d.frame(220);
  const opts = g.rewindOptions();
  const inh = opts.find((o) => o.id === 'inherit'), wd = opts.find((o) => o.id === 'wedgeBoon');
  assert.ok(inh && /すべて自動/.test(inh.label) && /∞/.test(inh.label), inh && inh.label);
  assert.ok(wd && /自動で打たれている/.test(wd.label), wd && wd.label);
  assert.equal(g.inheritCandidates().length, all.length);
  assert.equal(g.wedgeableBoons().length, all.length);
  const wedges0 = g.meta.wedges.length, inherit0 = JSON.stringify(g.meta.inherit);
  // 楔の一覧で決定しても、打ち直しも外しもできない
  g.rewind.sel = opts.indexOf(wd); d.frame(1, ['confirm']); d.frame(1);
  assert.equal(g.rewind.mode, 'wedgeBoon');
  d.frame(1, ['confirm']); d.frame(1);
  assert.equal(g.meta.wedges.length, wedges0, 'no wedge slot used'); assert.ok(g.rewind.lockedT > 0);
  d.frame(1, ['dodge']); d.frame(1);
  // 継承の一覧で決定しても外れない
  g.rewind.sel = g.rewindOptions().findIndex((o) => o.id === 'inherit'); d.frame(1, ['confirm']); d.frame(1);
  assert.equal(g.rewind.mode, 'inherit');
  for (let i = 0; i < all.length; i++) { g.rewind.sub = i; d.frame(1, ['confirm']); d.frame(1); }
  assert.equal(JSON.stringify(g.meta.inherit), inherit0);
  d.frame(1, ['dodge']); d.frame(1);
  // 継承の刻印は刻めない（欠片は減らない）
  g.meta.shards = 9999;
  g.rewind.sel = g.rewindOptions().findIndex((o) => o.id === 'upgrade'); d.frame(1, ['confirm']); d.frame(1);
  g.rewind.sub = Object.keys((await import('../src/meta.js')).UPGRADES).indexOf('inherit');
  d.frame(1, ['confirm']); d.frame(1);
  assert.equal(g.meta.shards, 9999); assert.equal(g.meta.upgrades.inherit || 0, 0);
  d.frame(1, ['dodge']); d.frame(1);
  // 次の夜はすべて持ったまま
  g.startLoop(); g.modal = null;
  for (const b of all) assert.ok(g.player.boons.some((x) => x.id === b.id && x.tier === b.tier), b.id);
  // ふつうの難易度では今までどおり選べる
  const n = newGame(44); n.meta.difficulty = 'normal'; n.startLoop(); n.modal = null;
  n.player.setBoons(all.map((b) => ({ ...b }))); n.endRun('death');
  assert.ok(n.rewindOptions().some((o) => o.label.startsWith('継承する強化を選ぶ')));
});

test('古いセーブ：人物・残骸に打った楔が人の楔の枠より多くても外れない。以前に夜明けを迎えた記録は真の結末として残る', () => {
  const m = newMeta(3);
  delete m.personSlots; delete m.flags.endings;
  m.wedges = [{ target: 'lira' }, { target: 'glen' }, { target: 'knight' }];
  m.flags.ending = true; m.loop = 6;
  const r = deserialize(serialize(m));
  assert.equal(r.personSlots, 3);
  assert.equal(r.wedges.length, 3);
  assert.equal(r.flags.endings.true, 6);
});

test('巻き戻り画面の助言は「次の夜」に合っている（第 1 夜の後は楔の案内、第 2 夜の後は最後の夜）', () => {
  const m = newMeta(4);
  let r = endLoop(m, { cause: 'death', floor: 1, boons: [], dmgByCat: {}, learned: [] });
  assert.equal(m.loop, 2); assert.match(r.tip, /楔を打つ/, 'after night 1 the wedge tutorial comes first');
  r = endLoop(m, { cause: 'wait', floor: 3, boons: [], dmgByCat: {}, learned: [] });
  assert.equal(m.loop, 3); assert.match(r.tip, /最後の夜/);
});
