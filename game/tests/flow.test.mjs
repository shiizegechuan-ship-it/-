import test from 'node:test';
import assert from 'node:assert/strict';
import { cx } from '../src/util.js';
import { newGame, Driver, sandbox, memStorage } from './helpers.mjs';
import { addWedge, learn } from '../src/meta.js';
import { MIN_FIGHT } from '../src/game.js';

// 部屋を「攻略」して次へ進む（敵は直接倒し、報酬を取り、扉に入る）
function clearAndAdvance(g, d, pickDoor = 0) {
  for (let guard = 0; guard < 400; guard++) {
    if (g.modal) {
      if (g.modal.type === 'boon' || g.modal.type === 'artifact') { d.frame(20); d.frame(1, ['confirm']); d.frame(1); continue; }
      if (g.modal.type === 'shop') { g.modal = null; continue; }
      if (g.modal.type === 'forge') { d.frame(20); d.frame(1, ['confirm']); d.frame(1); continue; }
      if (g.modal.type === 'dialog') { d.frame(10); d.frame(1, ['confirm']); d.frame(1); continue; }
    }
    if (g.transition) { d.frame(1); continue; }
    const live = g.room.enemies.filter((e) => e.alive && !e.boss);
    if (live.length) { g.room.t = Math.max(g.room.t, MIN_FIGHT); for (const e of live) { e.hp = 0; e.alive = false; } d.frame(2); continue; }
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

// 刻守の部屋に入り、最初の会話を（選択肢があれば pick 番目で）閉じる
function enterBoss(g, d, pick = 0) {
  g.enterRoom(2, g.run.plan.floors[2].findIndex((r) => r.type === 'boss'));
  for (let guard = 0; g.modal && guard < 40; guard++) {
    const m = g.modal;
    if (m.type === 'dialog' && m.choices && m.idx >= m.lines.length - 1) { d.frame(10); m.sel = pick; d.frame(1, ['confirm']); d.frame(1); break; }
    d.frame(10); d.frame(1, ['confirm']);
  }
}

test('第 1 夜は決着の戦いではない（倒しても鐘が鳴る）。条件がそろっていても伝言は届かない', () => {
  const g = newGame(7); const d = new Driver(g);
  addWedge(g.meta, { target: 'lira' });
  learn(g.meta, 'lira_message'); learn(g.meta, 'master_reason');
  enterBoss(g, d);
  assert.ok(!g.run.decisive);
  const b = g.room.boss;
  b.hp = b.maxHp * 0.2; b.phase = 2; b.checkPhase(g);
  assert.ok(!g.modal.choices, 'no choice to tell yet');
  assert.ok(g.modal.lines.some((l) => l.text.includes('決着の戦いでなければ')));
});

test('第 2 夜：刻守の部屋で「ここで決着を着けますか？」。はい＝倒せば結末、いいえ＝夜が戻って第 3 夜（必ず決着）', () => {
  // いいえ
  let g = newGame(7); let d = new Driver(g);
  g.meta.loop = 2; g.startLoop(); g.modal = null;
  g.enterRoom(2, g.run.plan.floors[2].findIndex((r) => r.type === 'boss'));
  while (g.modal && g.modal.type === 'analysis') { d.frame(30); d.frame(1, ['confirm']); }
  assert.ok(g.modal.lines.some((l) => l.text === 'ここで決着を着けますか？'));
  enterBoss(g, d, 1);
  d.frame(5);
  assert.equal(g.scene, 'rewind'); assert.equal(g.meta.loop, 3);
  // 第 3 夜は聞かずに決着の戦い
  d.until(() => g.rewind.t > 3.3, 400); g.startLoop(); g.modal = null;
  enterBoss(g, d);
  assert.ok(g.run.decisive, 'night 3 is always decisive');
  // はい：倒すと結末（条件が無ければ「鐘の沈黙」）
  g = newGame(9); d = new Driver(g);
  g.meta.loop = 2; g.startLoop(); g.modal = null;
  enterBoss(g, d, 0);
  assert.ok(g.run.decisive);
  while (g.modal) { d.frame(10); d.frame(1, ['confirm']); }
  const b = g.room.boss; b.phase = 3; b.hp = 1; b.state = 'idle'; b.takeHit(g, { dmg: 5, dir: 1, knock: 0, cat: 'combo' });
  d.until(() => g.scene === 'ending', 60 * 8);
  assert.equal(g.scene, 'ending'); assert.equal(g.ending.id, 'silence');
  assert.ok(g.meta.flags.endings.silence && !g.meta.flags.endings.true);
});

test('結末の条件：日誌を読んでいれば「師の眠り」、リラの伝言を伝えれば「夜明けの楔」。人に楔を打たなくてもクリアできる', async () => {
  const { endingFor } = await import('../src/meta.js');
  const g = newGame(3);
  assert.equal(endingFor(g.meta, false), 'silence');
  learn(g.meta, 'master_reason');
  assert.equal(endingFor(g.meta, false), 'sleep');
  assert.equal(endingFor(g.meta, true), 'sleep', 'telling needs the wedge and the message');
  addWedge(g.meta, { target: 'lira' }); learn(g.meta, 'lira_message');
  assert.equal(endingFor(g.meta, true), 'true');
  // 人の楔なしで、決着の戦いに勝つと結末（日誌あり＝師の眠り）
  const h = newGame(4); const d = new Driver(h);
  learn(h.meta, 'master_reason'); h.meta.loop = 3; h.startLoop(); h.modal = null;
  assert.equal(h.meta.wedges.filter((w) => w.target !== 'boon').length, 0);
  enterBoss(h, d);
  while (h.modal) { d.frame(10); d.frame(1, ['confirm']); }
  const b = h.room.boss; b.phase = 3; b.hp = 1; b.state = 'idle'; b.takeHit(h, { dmg: 5, dir: 1, knock: 0, cat: 'combo' });
  d.until(() => h.scene === 'ending', 60 * 8);
  assert.equal(h.ending.id, 'sleep');
  // 最後のページは見た結末の数
  assert.match(h.ending.pages[h.ending.pages.length - 1][1], /結末 1\/3/);
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

test('会話の選択肢：カーソルがどこにあっても、回避（戻る）ボタンで「立ち去る」を選べる', () => {
  const g = newGame(13); const d = new Driver(g);
  let left = false, other = false;
  g.openDialog([{ who: 'a', text: '一行目' }, { who: 'a', text: '二行目' }], [{ label: '話を聞く', fn: () => { other = true; } }, { label: '強化を鍛えてもらう', fn: () => { other = true; } }, { label: '立ち去る', fn: () => { left = true; } }]);
  d.frame(10);
  d.frame(1, ['dodge']); // まだ一行目でも
  assert.equal(g.modal, null);
  assert.ok(left && !other);
  assert.equal(g.player.state === 'dodge', false, 'did not dodge');
});

test('部屋を終えたら、跳ぶボタンで扉の横までくるくる回って移動し、落ちている金貨と粒も回収する', () => {
  const g = newGame(14); g.startLoop(); g.modal = null;
  const ri = g.run.plan.floors[0].findIndex((r) => r.type === 'combat');
  g.enterRoom(0, ri); g.modal = null;
  const d = new Driver(g), p = g.player;
  g.room.t = MIN_FIGHT; // 最短の戦いは済んだことにする
  for (const e of g.room.enemies) { e.hp = 0; e.alive = false; }
  d.frame(5);
  // 報酬が残っている間は動かない
  assert.ok(g.room.items.some((i) => i.kind === 'reward'));
  assert.equal(g.canAutoTravel(), false);
  g.room.items = g.room.items.filter((i) => i.kind !== 'reward'); g.openDoors();
  g.room.pickups = [{ type: 'gold', v: 7, x: p.x + 300, y: p.y, vx: 0, vy: 0, t: 1 }, { type: 'exp', v: 5, x: p.x + 200, y: p.y, vx: 0, vy: 0, t: 1 }];
  const gold0 = g.run.gold;
  d.until(() => p.onGround && p.state === 'normal', 60);
  d.frame(1, ['jump']); if (p.state !== 'travel') d.frame(1); // ヒットストップ中の入力は次のコマへ持ち越される
  assert.equal(p.state, 'travel');
  assert.equal(g.run.gold, gold0 + 7, 'coins collected');
  d.until(() => p.state !== 'travel', 120);
  const door = g.room.items.filter((i) => i.kind === 'door').sort((a, b) => Math.abs(cx(a) - cx(p)) - Math.abs(cx(b) - cx(p)))[0];
  assert.ok(Math.abs(cx(door) - cx(p)) < 50, 'next to a door');
  d.frame(10);
  assert.ok(p.onGround, 'standing on the floor');
  // 扉の前ではそのまま跳ぶボタンで入れる
  assert.equal(g.nearestInteractable() && g.nearestInteractable().kind, 'door');
});

test('戦闘部屋は最低15秒続く：敵を一瞬で倒しても、時間差で増援が湧き続ける', () => {
  const g = newGame(31); g.startLoop(); g.modal = null;
  const ri = g.run.plan.floors[0].findIndex((r) => r.type === 'combat');
  g.enterRoom(0, ri); g.modal = null;
  const d = new Driver(g);
  let killed = 0, clearedAt = null;
  const reinfKinds = new Set();
  for (let f = 0; f < 60 * 25 && clearedAt === null; f++) {
    if (g.modal) g.modal = null; // 粒で上がった段の選択などは閉じる
    // 強い術の代わり：出てきた敵はすぐに倒す
    for (const e of g.room.enemies) if (e.alive && !e.boss) { if (e.reinf) reinfKinds.add(e.kind); e.hp = 0; e.alive = false; killed++; }
    d.frame(1);
    if (g.room.cleared) clearedAt = g.room.t;
  }
  assert.ok(clearedAt !== null, 'room eventually clears');
  assert.ok(clearedAt >= MIN_FIGHT, `cleared at ${clearedAt}`);
  assert.ok(clearedAt < MIN_FIGHT + 3, 'ends soon after the minimum');
  assert.ok(g.room.waves >= 4, `waves: ${g.room.waves}`);
  assert.ok(reinfKinds.size >= 1 && killed >= 10, `killed ${killed}`);
});

test('15秒の間は1体倒すごとに1体、主人公から遠く（画面の外）・扉の側に湧く。15秒を過ぎたら湧かない', () => {
  const g = newGame(32); g.startLoop(); g.modal = null;
  const ri = g.run.plan.floors[0].findIndex((r) => r.type === 'combat');
  g.enterRoom(0, ri); g.modal = null;
  const d = new Driver(g), p = g.player;
  d.frame(5);
  const foes = g.room.enemies.filter((e) => e.alive && !e.boss);
  foes[0].hp = 0; foes[0].alive = false;
  d.frame(1);
  assert.equal(g.room.incoming.length, 1, 'one kill → one reinforcement');
  for (const e of foes.slice(1)) { e.hp = 0; e.alive = false; }
  d.until(() => foes.every((e) => e.handled), 30); // ヒットストップの間は進まない
  assert.equal(g.room.incoming.length, foes.length, 'one per kill');
  assert.equal(g.room.cleared, false);
  const X = g.marker('X'), vw = 640;
  for (const s of g.room.incoming) {
    const sx = s.x + 10;
    assert.ok(Math.abs(sx - cx(p)) > 5 * 16, 'far from the hero');
    const off = sx < g.cam.x || sx > g.cam.x + vw;
    // 画面の外か、少なくとも主人公より扉に近い
    assert.ok(off || Math.abs(sx - X.x) < Math.abs(cx(p) - X.x), 'off screen or on the door side');
  }
  d.until(() => g.room.enemies.some((e) => e.alive && e.reinf), 120);
  assert.ok(g.room.enemies.some((e) => e.alive && e.reinf));
  // 15秒を過ぎて全滅させたら、もう湧かずに制圧
  g.room.t = MIN_FIGHT; g.room.incoming = [];
  for (const e of g.room.enemies) { e.hp = 0; e.alive = false; }
  d.frame(2);
  assert.ok(g.room.cleared);
  assert.equal(g.room.incoming.length, 0);
});

test('増援で倒す数が増えても、部屋1つで受け取る金貨・粒・欠片の総量は今までとほぼ同じ', () => {
  const run = (instant) => {
    const g = newGame(41); g.startLoop(); g.modal = null;
    const ri = g.run.plan.floors[0].findIndex((r) => r.type === 'combat');
    g.enterRoom(0, ri); g.modal = null;
    g.player.maxHp = g.player.hp = 1e9;
    const d = new Driver(g);
    const exp0 = () => g.run.exp + g.run.level * 1000;
    let gold = 0, exp = 0;
    const dg = g.dropGold.bind(g), de = g.dropExp.bind(g);
    g.dropGold = (n, ...a) => { gold += n; return dg(n, ...a); };
    g.dropExp = (n, ...a) => { exp += n; return de(n, ...a); };
    const sh0 = g.run.shards;
    if (instant) g.room.t = MIN_FIGHT; // 今まで：最初の敵を倒せば終わり
    let kills = 0;
    for (let f = 0; f < 60 * 30 && !g.room.cleared; f++) {
      if (g.modal) g.modal = null;
      // 1秒に1体ずつ倒す
      if (f % 60 === 30) { const e = g.room.enemies.find((o) => o.alive && !o.boss); if (e) { e.hp = 0; e.alive = false; kills++; } }
      d.frame(1);
    }
    assert.ok(g.room.cleared);
    return { gold, exp, shards: g.run.shards - sh0, kills };
  };
  const old = run(true), now = run(false);
  assert.ok(now.kills >= old.kills + 8, `kills ${old.kills} → ${now.kills}`);
  for (const k of ['gold', 'exp', 'shards']) {
    assert.ok(Math.abs(now[k] - old[k]) <= Math.max(2, old[k] * 0.05), `${k}: ${old[k]} → ${now[k]}`);
  }
});

test('増援は戦闘部屋だけ：中ボス部屋は全滅で即制圧のまま', () => {
  const g = newGame(33); g.startLoop(); g.modal = null;
  const plan = g.run.plan.floors;
  let at = null;
  plan.forEach((fl, fi) => fl.forEach((r, ri) => { if (!at && r.type === 'elite') at = [fi, ri]; }));
  if (!at) return;
  g.enterRoom(at[0], at[1]); g.modal = null;
  const d = new Driver(g);
  d.until(() => !g.modal, 200);
  while (g.modal) { g.modal = null; }
  for (const e of g.room.enemies) if (!e.boss) { e.hp = 0; e.alive = false; }
  d.frame(3);
  assert.ok(!g.room.incoming || g.room.incoming.length === 0);
});

import { tapGoal } from '../src/game.js';
import { TILE } from '../src/config.js';
test('跳ぶボタン：戦いを終えて報酬（ひし形）が出たら、報酬の所までくるくる回って移動して取る', () => {
  const g = newGame(5); const d = new Driver(g);
  g.enterRoom(0, g.run.plan.floors[0].findIndex((r) => r.type === 'combat')); g.modal = null;
  for (const e of g.room.enemies) { e.alive = false; }
  g.room.enemies = []; g.room.t = 99; g.room.incoming = [];
  g.clearRoom(false);
  const rw = g.room.items.find((it) => it.kind === 'reward');
  assert.ok(rw);
  const p = g.player;
  d.until(() => p.onGround, 60);
  if (Math.abs(cx(rw) - cx(p)) < 60) p.x = cx(rw) + 200 < g.map.pxW - 40 ? cx(rw) + 200 : cx(rw) - 200;
  d.frame(20);
  assert.ok(g.rewardTravelGoal(), 'goal');
  d.frame(1, ['jump']);
  assert.equal(p.state, 'travel');
  d.frame(70);
  assert.ok(rw.taken || g.modal, 'reward taken');
});

test('跳ぶボタン：戦いの無い部屋では、右にある最寄りのイベント地点へ 1 回だけ移動する（右から左へは戻らない）', () => {
  const g = newGame(5); const d = new Driver(g);
  const fi = g.run.plan.floors.findIndex((fl) => fl.some((r) => r.type === 'shop'));
  g.enterRoom(fi, g.run.plan.floors[fi].findIndex((r) => r.type === 'shop')); g.modal = null;
  const p = g.player, shop = g.room.items.find((it) => it.kind === 'merchant');
  d.until(() => p.onGround, 60); d.frame(5);
  if (cx(shop) < cx(p) + 60) { p.x = Math.max(40, shop.x - 200); d.until(() => p.onGround, 60); d.frame(5); }
  assert.ok(g.eventHopGoal(), 'hop goal');
  d.frame(1, ['jump']);
  assert.equal(p.state, 'travel');
  d.frame(70);
  assert.ok(Math.abs(cx(p) - cx(shop)) < 30, 'arrived at the merchant');
  assert.equal(g.nearestInteractable(), shop);
  // もう一度跳ぶと、普通に跳ぶ（部屋ごとに 1 回）
  p.x = Math.max(40, shop.x - 200); d.until(() => p.onGround, 60); d.frame(5);
  assert.equal(g.eventHopGoal(), null);
  const y0 = p.y; d.frame(1, ['jump']); d.frame(5);
  assert.ok(p.y < y0 - 5, 'normal jump');
  // 右から左へは移動しない
  const g2 = newGame(5); const d2 = new Driver(g2);
  g2.enterRoom(fi, g2.run.plan.floors[fi].findIndex((r) => r.type === 'shop')); g2.modal = null;
  const s2 = g2.room.items.find((it) => it.kind === 'merchant');
  g2.player.x = Math.min(g2.map.pxW - 60, s2.x + s2.w + 120); d2.until(() => g2.player.onGround, 60); d2.frame(5);
  const right = g2.room.items.some((it) => it.kind !== 'door' && g2.interactPrompt(it) && cx(it) > cx(g2.player) + 40);
  if (!right) assert.equal(g2.eventHopGoal(), null);
});

test('タップ移動：普通以上はタップした x の列のいちばん下の床へ、簡単以下は床の上の空中へ。床の無い列ではいちばん近い列', () => {
  const rows = [
    '################################################',
    ...Array.from({ length: 8 }, () => '#..............................................#'),
    '#....=========.................................#',
    ...Array.from({ length: 4 }, () => '#..............................................#'),
    '#P.............................................#',
    '##########.....#################################',
    '##########.....#################################',
    '##########.....#################################',
  ];
  const g = sandbox(rows); const p = g.player;
  // 板の真上をタップ：普通以上は板ではなく、その列のいちばん下の床
  let goal = tapGoal(g.map, p, 8 * TILE, 5 * TILE, false);
  assert.equal(goal.y + p.h, 15 * TILE);
  assert.equal(Math.floor((goal.x + p.w / 2) / TILE), 8);
  // 穴（床の無い列）をタップ：いちばん近い床のある列
  // （その列に板しか無ければ、板がその列のいちばん下の床）
  goal = tapGoal(g.map, p, 12 * TILE + 5, 10 * TILE, false);
  assert.equal(goal.y + p.h, 9 * TILE);
  goal = tapGoal(g.map, p, 14 * TILE + 5, 10 * TILE, false);
  const col = Math.floor((goal.x + p.w / 2) / TILE);
  assert.ok(col === 13 || col === 15, `nearest column with floor: ${col}`);
  assert.ok(g.map.get(col, Math.floor((goal.y + p.h) / TILE)) !== 0, 'stands on a floor');
  // 簡単以下：タップした高さの空中（床のある列の上）
  goal = tapGoal(g.map, p, 30 * TILE, 6 * TILE, true);
  assert.ok(goal.y + p.h < 15 * TILE - 60, 'in the air');
  assert.equal(Math.floor((goal.x + p.w / 2) / TILE), 30);
  // 実際に動く：画面の座標でタップすると移動して、着いたら落ちて床に乗る
  g.run.diff = { ...g.run.diff, id: 'easy' }; g.meta.difficulty = 'easy';
  const d = new Driver(g); d.frame(5);
  assert.ok(g.tapMove((30 * TILE - g.cam.x) * 1.5, (6 * TILE - g.cam.y) * 1.5));
  assert.equal(p.state, 'travel');
  d.frame(60); d.until(() => p.onGround, 120);
  assert.ok(Math.abs(cx(p) - 30 * TILE - TILE / 2) < 20 && Math.abs(p.y + p.h - 15 * TILE) < 2, 'landed below the tap');
});

test('1 つの階で得られる金貨・経験値の総量は、どの階・どの難易度でも同じ（改修前のめちゃ簡単が基準）', async () => {
  const { FLOOR_REWARD } = await import('../src/game.js');
  for (const diff of ['veryeasy', 'normal', 'nightmare']) {
    const g = newGame(11); g.meta.difficulty = diff; g.startLoop(); g.modal = null;
    const lv = 1 + 0.25 * g.run.scale.level;
    g.run.plan.floors.forEach((fl, fi) => {
      let gold = 0, exp = 0;
      fl.forEach((r, ri) => { if (r.type !== 'combat' && r.type !== 'trial') return; g.enterRoom(fi, ri); g.modal = null; gold += g.room.budget.gold * (g.run.diff.goldMul || 1); exp += g.room.budget.exp; });
      assert.ok(Math.abs(gold - FLOOR_REWARD.gold * lv) < 1e-6, `${diff} floor ${fi} gold ${gold}`);
      assert.ok(Math.abs(exp - FLOOR_REWARD.exp * lv) < 1e-6, `${diff} floor ${fi} exp ${exp}`);
    });
  }
});

test('文字の大きさ：標準でも小さな文字は少し大きく、大・特大は 1.2・1.4 倍。収まらない文字は左→右へ流して最後まで見せる。設定は保存される', async () => {
  const { fontSize, TEXT, marqueeOffset } = await import('../src/ui.js');
  TEXT.mode = 'normal';
  assert.equal(fontSize(10), 12); assert.equal(fontSize(13), 14); assert.equal(fontSize(20), 20);
  TEXT.mode = 'large'; assert.equal(fontSize(20), 24);
  TEXT.mode = 'xlarge'; assert.equal(fontSize(20), 28); assert.equal(fontSize(10), 17);
  TEXT.mode = 'normal';
  // 流す量：はじめは 0、途中で増え、最後に全部（はみ出した分）を見せる
  const over = 120;
  assert.equal(marqueeOffset(over, 0.5), 0);
  assert.ok(marqueeOffset(over, 2) > 0 && marqueeOffset(over, 2) < over);
  assert.equal(marqueeOffset(over, 1 + over / 40 + 0.5), over);
  // 中断メニュー・タイトルで切り替え、保存される
  const st = memStorage();
  const g = newGame(5, st); g.storage.saveSettings = (s) => { g._saved = s; };
  const i = g.titleOptions().findIndex((o) => o.id === 'text');
  assert.ok(i >= 0); assert.match(g.titleOptions()[i].label, /標準/);
  g.cycleTextSize(); assert.equal(g.settings.textSize, 'large');
  g.cycleTextSize(); assert.equal(g.settings.textSize, 'xlarge');
  assert.match(g._saved, /xlarge/);
  assert.ok(g.pauseOptions().some((o) => o.id === 'text' && /特大/.test(o.label)));
});

test('タップ移動は無敵にならず、着いてすぐは次のタップ移動を受け付けない（連打で無敵のまま飛び回れない）', async () => {
  const { TAP_MOVE_CD } = await import('../src/game.js');
  const g = sandbox(FLAT_ROWS()); const d = new Driver(g); d.frame(5);
  const p = g.player; p.iframeT = 0;
  assert.ok(g.tapMove((30 * 30 - g.cam.x) * 1.5, (14 * 30 - g.cam.y) * 1.5));
  d.frame(3);
  assert.equal(p.state, 'travel'); assert.ok(!p.invulnerable, 'no i-frames while tap-moving');
  assert.equal(g.tapMove(100, 300), false, 'no new tap move while travelling');
  d.until(() => p.state !== 'travel', 120);
  assert.equal(g.tapMove(100, 300), false, 'cooldown after arriving');
  d.frame(Math.ceil(TAP_MOVE_CD * 60) + 2);
  assert.ok(g.tapMove(100, 300), 'ready again');
  // 戦いの後の扉への移動は、今までどおり無敵
  p.startTravel(p.x + 100, p.y); d.frame(2); assert.ok(p.invulnerable);
});
function FLAT_ROWS() {
  return ['################################################', ...Array.from({ length: 13 }, () => '#..............................................#'), '#P.............................................#', '################################################', '################################################', '################################################'];
}

test('黄金の部屋（戦いの無い部屋）でも、跳ぶボタンで右の宝箱へ移動できる', () => {
  const g = newGame(5); const d = new Driver(g);
  g.enterRoom(0, 1, { type: 'golden', layout: 'vault' }); g.modal = null;
  assert.equal(g.room.desc.type, 'golden');
  const chest = g.room.items.find((it) => it.kind === 'goldchest');
  assert.ok(chest);
  const p = g.player; d.until(() => p.onGround, 60);
  p.x = Math.max(40, chest.x - 200); d.until(() => p.onGround, 60); d.frame(3);
  assert.ok(g.eventHopGoal());
  d.frame(1, ['jump']); d.until(() => p.state !== 'travel', 90);
  assert.equal(g.nearestInteractable(), chest);
});
