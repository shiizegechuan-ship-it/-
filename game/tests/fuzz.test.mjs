import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, Driver } from './helpers.mjs';
import { makeRng } from '../src/util.js';
import { ACTIONS } from '../src/input.js';
import { botInputs } from './bot.mjs';

// ランダム入力＋ボットで長時間動かし、不変条件が崩れないか確かめる
function fuzz(seed, frames) {
  const g = newGame(seed);
  const d = new Driver(g);
  const r = makeRng(seed);
  let held = [];
  const scenes = new Set();
  const rooms = new Set();
  for (let f = 0; f < frames; f++) {
    if (f % 6 === 0) {
      held = r.next() < 0.6 ? botInputs(g, f, 'mid') : ACTIONS.filter((a) => a !== 'pause' && r.next() < (a === 'journal' ? 0.02 : 0.12));
      if (g.scene !== 'play' && r.next() < 0.3) held.push('confirm');
    }
    // ときどき部屋の攻略を早める（全体の流れを広く通すため）
    if (g.scene === 'play' && g.player.state !== 'dead' && f % 240 === 0 && r.next() < 0.7) g.player.hp = g.player.maxHp; // 到達範囲を広げる
    if (g.scene === 'play' && g.roomDesc().type === 'boss' && f % 600 === 599 && g.room.boss && !g.room.boss.invuln) g.room.boss.hp = Math.max(1, g.room.boss.hp - 250), g.room.boss.checkPhase(g);
    if (g.scene === 'play' && !g.modal && f % 420 === 419) {
      for (const e of g.room.enemies) if (!e.boss) { e.hp = 0; e.alive = false; }
      const it = g.room.items.find((i) => i.kind === 'reward' || i.kind === 'door');
      if (it) { g.player.x = it.x + 4; g.player.y = it.y + it.h - g.player.h; held = ['up']; }
    }
    d.frame(1, held);
    scenes.add(g.scene);
    if (g.scene === 'play') rooms.add(g.roomDesc().type);
    if (g.scene === 'play' && g.player) {
      const p = g.player;
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `finite pos @${f}`);
      assert.ok(p.hp >= 0 && p.hp <= p.maxHp, `hp range @${f}: ${p.hp}/${p.maxHp}`);
      assert.ok(p.gauge >= 0 && p.gauge <= 100.001, `gauge @${f}`);
      for (const e of g.room.enemies) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), `enemy pos @${f}`);
      assert.ok(g.meta.wedges.length <= g.meta.slots, 'wedges within slots');
    }
  }
  return { g, scenes, rooms };
}

test('耐久：ランダム入力で複数の夜を回しても壊れない', () => {
  let loops = 0;
  const allRooms = new Set(), allScenes = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const { g, rooms, scenes } = fuzz(seed, 60 * 60 * 9); // 1 夜の部屋数が増えたので長めに回す
    loops += g.meta.loop;
    rooms.forEach((x) => allRooms.add(x)); scenes.forEach((x) => allScenes.add(x));
  }
  assert.ok(loops > 6, 'went through several loops');
  for (const t of ['entry', 'combat', 'forge', 'elite', 'archive', 'study', 'shrine', 'trial', 'shop', 'elite2', 'boss']) assert.ok(allRooms.has(t), `reached ${t}`);
  assert.ok(allScenes.has('rewind'));
});
