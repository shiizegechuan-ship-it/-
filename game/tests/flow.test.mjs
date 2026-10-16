import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, Driver } from './helpers.mjs';
import { addWedge, learn } from '../src/meta.js';

// 部屋を「攻略」して次へ進む（敵は直接倒し、報酬を取り、扉に入る）
function clearAndAdvance(g, d, pickDoor = 0) {
  for (let guard = 0; guard < 400; guard++) {
    if (g.modal) {
      if (g.modal.type === 'boon' || g.modal.type === 'artifact') { d.frame(20); d.frame(1, ['confirm']); d.frame(1); continue; }
      if (g.modal.type === 'shop') { g.modal = null; continue; }
      if (g.modal.type === 'dialog') { d.frame(10); d.frame(1, ['confirm']); d.frame(1); continue; }
    }
    if (g.transition) { d.frame(1); continue; }
    const live = g.room.enemies.filter((e) => e.alive && !e.boss);
    if (live.length) { for (const e of live) { e.hp = 0; e.alive = false; } d.frame(2); continue; }
    const rw = g.room.items.find((i) => i.kind === 'reward');
    if (rw) { g.player.x = rw.x; g.player.y = rw.y; d.frame(2); continue; }
    const doors = g.room.items.filter((i) => i.kind === 'door');
    if (doors.length) {
      const door = doors[Math.min(pickDoor, doors.length - 1)];
      const before = `${g.run.fi}/${g.run.ri}`;
      g.player.x = door.x + 8; g.player.y = door.y + door.h - g.player.h; g.player.vy = 0;
      d.frame(2); d.frame(1, ['up']);
      d.until(() => !g.transition, 60);
      if (`${g.run.fi}/${g.run.ri}` !== before) return true;
      continue;
    }
    d.frame(1);
  }
  return false;
}

test('1周を最後まで通せる：全部屋→刻守撃破→鐘→巻き戻り→次の夜', () => {
  const g = newGame(2024);
  const d = new Driver(g);
  d.frame(5);
  let steps = 0;
  while (g.roomDesc().type !== 'boss' && steps++ < 20) assert.ok(clearAndAdvance(g, d), `stuck at ${g.run.fi}/${g.run.ri} ${g.roomDesc().type}`);
  assert.equal(g.roomDesc().type, 'boss');
  assert.ok(g.player.boons.length >= 3, `got boons: ${g.player.boons.length}`);
  // 開幕の台詞を閉じる
  d.until(() => !g.modal, 200, []); while (g.modal) { d.frame(10); d.frame(1, ['confirm']); }
  const b = g.room.boss;
  // 段階を順に通す
  b.hp = b.maxHp * 0.59; b.checkPhase(g);
  assert.equal(b.phase, 2);
  d.frame(90);
  b.hp = b.maxHp * 0.2; b.checkPhase(g);
  assert.equal(b.phase, 3);
  assert.ok(g.meta.knowledge.lira_name, 'boss reveals the name at phase 3');
  while (g.modal) { d.frame(10); d.frame(1, ['confirm']); }
  d.until(() => b.state !== 'phaseShift', 200);
  b.hp = 1; b.takeHit(g, { dmg: 5, dir: 1, knock: 0, cat: 'combo' });
  assert.ok(b.defeated);
  d.until(() => g.scene === 'rewind', 400);
  assert.equal(g.scene, 'rewind');
  assert.equal(g.rewind.report.cause, 'bell');
  assert.equal(g.meta.slots, 4, 'first false victory grants a slot');
  // 巻き戻り画面 → 次の夜
  d.frame(220);
  d.frame(1, ['confirm']);
  assert.equal(g.scene, 'play');
  assert.equal(g.meta.loop, 2);
});

test('死亡 → 巻き戻り → 強化に楔 → 次の夜をその強化で始める', () => {
  const g = newGame(99);
  const d = new Driver(g);
  g.player.setBoons([{ id: 'lag', tier: 1 }]);
  g.meta.unlocked.push('stasis');
  g.damagePlayer(999, { fromX: 0 });
  d.until(() => g.scene === 'rewind', 300);
  assert.equal(g.scene, 'rewind');
  d.frame(220);
  const opts = g.rewindOptions().map((o) => o.id);
  assert.ok(opts.includes('wedgeBoon'));
  g.rewind.sel = opts.indexOf('wedgeBoon');
  d.frame(1, ['confirm']); d.frame(1);
  assert.equal(g.rewind.mode, 'wedgeBoon');
  d.frame(1, ['confirm']); d.frame(1);
  assert.equal(g.meta.wedges[0].target, 'boon');
  g.rewind.sel = 0; d.frame(1, ['confirm']);
  assert.deepEqual(g.player.boons, [{ id: 'lag', tier: 1 }]);
});

test('真の結末：最終夜（第5夜以降）に、条件を満たして第3段階で言葉を伝え、白き刻守（第2形態）まで倒す', () => {
  const g = newGame(7);
  const d = new Driver(g);
  g.meta.slots = 3; g.meta.loop = 5;
  addWedge(g.meta, { target: 'lira' });
  learn(g.meta, 'lira_message'); learn(g.meta, 'master_reason');
  g.enterRoom(2, g.run.plan.floors[2].findIndex((r) => r.type === 'boss'));
  while (g.modal) { d.frame(10); d.frame(1, ['confirm']); }
  const b = g.room.boss;
  b.hp = b.maxHp * 0.2; b.phase = 2; b.checkPhase(g);
  assert.equal(g.modal.type, 'dialog');
  assert.ok(g.modal.choices && g.modal.choices[0].label.includes('リラは覚えている'));
  d.frame(10); d.frame(1, ['confirm']);
  while (g.modal) { d.frame(10); d.frame(1, ['confirm']); }
  assert.ok(b.trueDuel);
  b.hp = 1; b.state = 'idle'; b.takeHit(g, { dmg: 5, dir: 1, knock: 0, cat: 'combo' });
  // 一度倒すと白き刻守（第 2 形態）になる：大きく、夜明けはまだ来ない
  assert.ok(b.finalForm && !b.defeated && b.hp === b.maxHp);
  assert.ok(b.h > 70 && b.w > 40, 'bigger');
  assert.notEqual(g.scene, 'ending');
  while (g.modal) { d.frame(10); d.frame(1, ['confirm']); }
  b.hp = 1; b.state = 'idle'; b.takeHit(g, { dmg: 5, dir: 1, knock: 0, cat: 'combo' });
  d.until(() => g.scene === 'ending', 400);
  assert.equal(g.scene, 'ending');
  assert.ok(g.meta.flags.ending);
});

test('同じセーブ・同じ夜を2回遊ぶと、敵配置と強化候補が一致する（再挑戦の再現性）', () => {
  const a = newGame(555), b = newGame(555);
  const sig = (g) => JSON.stringify(g.run.plan) + JSON.stringify(g.run.offerRng.next());
  assert.equal(sig(a), sig(b));
});

test('楔を打つ動作は回避で中断でき、中断すると楔は打たれない', () => {
  const g = newGame(1);
  const d = new Driver(g);
  const lira = g.room.items.find((i) => i.who === 'lira');
  g.doWedge({ target: 'lira' }, lira);
  d.frame(10);
  d.frame(1, ['dodge']);
  d.frame(80);
  assert.equal(g.meta.wedges.length, 0);
  g.doWedge({ target: 'lira' }, lira);
  d.frame(80);
  assert.equal(g.meta.wedges.length, 1);
  assert.ok(lira.wedged);
});

test('最終夜より前（第4夜まで）は、条件がそろっていても夜明けの決闘に入れない', () => {
  const g = newGame(7);
  const d = new Driver(g);
  g.meta.slots = 3; g.meta.loop = 4;
  addWedge(g.meta, { target: 'lira' });
  learn(g.meta, 'lira_message'); learn(g.meta, 'master_reason');
  g.enterRoom(2, g.run.plan.floors[2].findIndex((r) => r.type === 'boss'));
  while (g.modal) { d.frame(10); d.frame(1, ['confirm']); }
  const b = g.room.boss;
  b.hp = b.maxHp * 0.2; b.phase = 2; b.checkPhase(g);
  assert.ok(!g.modal.choices, 'no choice to tell yet');
  assert.ok(g.modal.lines.some((l) => l.text.includes('第5夜')));
});

test('白き刻守は新しい技（時針の雨・光輪・三連斬・突進）を使い、それぞれ当たる', async () => {
  const g = newGame(8); g.meta.loop = 5; g.startLoop(); g.modal = null;
  g.enterRoom(2, g.run.plan.floors[2].findIndex((r) => r.type === 'boss'));
  g.modal = null;
  const b = g.room.boss; b.trueDuel = true; b.brake = true; g.room.duel = true;
  g.beginFinalForm(b); g.modal = null;
  // 技の候補に入っている
  let opts = null; const pick0 = b.rng.pick.bind(b.rng); b.rng.pick = (o) => { opts = o.slice(); return pick0(o); };
  b.chooseMove(g, 100); b.rng.pick = pick0;
  for (const m of ['rain', 'rings', 'triple', 'dash']) assert.ok(opts.includes(m), m);
  // それぞれ実際に出して、主人公に当たる
  const d = new Driver(g), p = g.player;
  for (const m of ['rain', 'rings', 'triple', 'dash']) {
    p.hp = p.maxHp = 1e7; p.iframeT = 0; g.room.projectiles = [];
    p.x = b.x + (b.face > 0 ? 90 : -90); p.y = b.y + b.h - p.h;
    b.rng.pick = () => m; b.chooseMove(g, 90); b.rng.pick = pick0;
    for (let i = 0; i < 60 * 3 && p.hp === p.maxHp; i++) { d.frame(1); p.iframeT = 0; if (g.modal) g.modal = null; }
    assert.ok(p.hp < p.maxHp, `${m} hits`);
    b.setState('idle'); b.cool = 99;
  }
});

test('調べられる物の前では、跳ぶ（決定）ボタンで調べる（その時は跳ばない）。何もない所では跳ぶ', () => {
  const g = newGame(11); const d = new Driver(g);
  d.frame(5);
  const p = g.player;
  const sign = g.room.items.find((i) => i.kind === 'sign' || i.kind === 'npc');
  assert.ok(sign, 'room has something to read');
  p.x = sign.x + sign.w / 2 - p.w / 2; p.y = sign.y + sign.h - p.h; p.vy = 0;
  d.frame(5);
  assert.ok(p.onGround);
  d.frame(1, ['jump']);
  assert.equal(g.modal && g.modal.type, 'dialog', 'jump opens the dialog');
  assert.ok(p.vy >= 0, 'did not jump');
  // 会話は跳ぶボタンで進む
  while (g.modal) { d.frame(10); d.frame(1, ['jump']); }
  p.x += 300; d.frame(10);
  if (!g.nearestInteractable()) { d.frame(1, ['jump']); d.frame(2); assert.ok(p.vy < 0 || !p.onGround, 'jumps when nothing is near'); }
});

test('簡単では風見鶏（指向性の針を撃つ空の敵）が出ない', () => {
  for (let s = 1; s <= 25; s++) {
    const g = newGame(s * 31); g.meta.difficulty = 'easy'; g.startLoop(); g.modal = null;
    for (let fi = 0; fi < 3; fi++) g.run.plan.floors[fi].forEach((r, ri) => { if (r.type === 'combat' || r.type === 'trial') { g.enterRoom(fi, ri); g.modal = null; assert.ok(!g.room.enemies.some((e) => e.kind === 'vane'), `seed ${s} room ${fi}-${ri}`); } });
  }
});

test('楔を打つ物（騎士の残骸など）は扉と重ならない', () => {
  const g = newGame(12); g.startLoop(); g.modal = null;
  let fi = -1, ri = -1; g.run.plan.floors.forEach((fl, i) => fl.forEach((r, j) => { if (r.type === 'elite' && fi < 0) { fi = i; ri = j; } }));
  g.enterRoom(fi, ri); g.modal = null;
  const X = g.marker('X'), k = g.room.enemies.find((e) => e.kind === 'knight');
  k.x = X.x - 4; k.y = X.y + 30 - k.h; // 出口の上で倒れる
  k.hp = 0; k.alive = false;
  const d = new Driver(g); d.frame(30);
  g.openDoors(); // 報酬を取ると扉が開く
  const doors = g.room.items.filter((i) => i.kind === 'door'), wreck = g.room.items.find((i) => i.kind === 'wreck');
  assert.ok(doors.length && wreck);
  for (const dr of doors) assert.ok(wreck.x + wreck.w <= dr.x - 10 || wreck.x >= dr.x + dr.w + 10, `wreck ${wreck.x} vs door ${dr.x}`);
});

test('制圧後の報酬（ひし形）は、どの部屋のどこで制圧しても床や壁の中に出ない', () => {
  let n = 0;
  for (let s = 1; s <= 12; s++) {
    const g = newGame(s * 37); g.startLoop(); g.modal = null;
    for (let fi = 0; fi < 3; fi++) g.run.plan.floors[fi].forEach((r, ri) => {
      if (r.type !== 'combat') return;
      g.enterRoom(fi, ri); g.modal = null;
      const map = g.map, p = g.player;
      // 主人公を部屋のいろいろな足場（壁ぎわ・段差の前）に立たせて制圧する
      for (let tx = 1; tx < map.w - 1; tx += 3) for (let ty = 1; ty < map.h - 1; ty++) {
        if (map.get(tx, ty) !== 0 || map.get(tx, ty - 1) !== 0 || map.get(tx, ty + 1) === 0) continue;
        p.x = tx * 30 + 7; p.y = (ty + 1) * 30 - p.h; p.onGround = true; p.lastSafe = { x: p.x, y: p.y };
        for (const face of [1, -1]) {
          p.face = face;
          const { gx, gy } = g.rewardSpot();
          const box = { x: gx - 12, y: gy - 30, w: 24, h: 24 };
          for (const [x, y] of [[box.x + 2, box.y + 2], [box.x + 22, box.y + 2], [box.x + 2, box.y + 22], [box.x + 22, box.y + 22], [box.x + 12, box.y + 12]]) assert.equal(map.get(Math.floor(x / 30), Math.floor(y / 30)), 0, `seed ${s} room ${fi}-${ri} at ${tx},${ty} face ${face}`);
          // 主人公の足元から届く高さ
          assert.ok(gy - (p.y + p.h) <= 90 && gy - (p.y + p.h) >= -45);
          n++;
        }
      }
    });
  }
  assert.ok(n > 200);
});
