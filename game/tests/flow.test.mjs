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
  assert.equal(g.meta.slots, 2, 'first false victory grants a slot');
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

test('真の結末：条件を満たして第3段階で言葉を伝え、決闘に勝つ', () => {
  const g = newGame(7);
  const d = new Driver(g);
  g.meta.slots = 3;
  addWedge(g.meta, { target: 'lira' });
  learn(g.meta, 'lira_message'); learn(g.meta, 'master_reason');
  g.enterRoom(2, 2);
  while (g.modal) { d.frame(10); d.frame(1, ['confirm']); }
  const b = g.room.boss;
  b.hp = b.maxHp * 0.2; b.phase = 2; b.checkPhase(g);
  assert.equal(g.modal.type, 'dialog');
  assert.ok(g.modal.choices && g.modal.choices[0].label.includes('リラは覚えている'));
  d.frame(10); d.frame(1, ['confirm']);
  while (g.modal) { d.frame(10); d.frame(1, ['confirm']); }
  assert.ok(b.trueDuel);
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
