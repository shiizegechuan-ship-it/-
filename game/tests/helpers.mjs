import { Game } from '../src/game.js';
import { Input } from '../src/input.js';
import { TileMap } from '../src/tilemap.js';
import { Player } from '../src/player.js';
import { Fx } from '../src/fx.js';
import { NullSfx } from '../src/audio.js';

export function memStorage(initial = null) {
  let s = initial;
  return { load: () => s, save: (v) => { s = v; }, get raw() { return s; } };
}

// 入力を持つ小さなドライバ
export class Driver {
  constructor(game) { this.g = game; this.in = new Input(); }
  frame(n = 1, held = []) {
    for (let i = 0; i < n; i++) {
      for (const a of Object.keys(this.in.raw)) this.in.set(a, held.includes(a));
      this.in.step();
      this.g.tick(this.in);
    }
  }
  tap(action, after = 1) { this.frame(1, [action]); this.frame(after); }
  until(pred, max = 600, held = []) {
    for (let i = 0; i < max; i++) { if (pred()) return i; this.frame(1, held); }
    return -1;
  }
}

export function newGame(seed = 777, storage = memStorage()) {
  const g = new Game({ deterministicFx: true, storage });
  g.newGame(seed);
  g.modal = null; // 最初の夜の目的説明を閉じる
  return g;
}

// 平らな試験用の部屋にプレイヤーを置く（物理・操作感のテスト用）
export function sandbox(rows) {
  const g = new Game({ deterministicFx: true });
  g.newGame(1);
  g.modal = null;
  g.map = new TileMap(rows);
  g.room.enemies = []; g.room.items = []; g.room.projectiles = []; g.room.cleared = true;
  const P = g.map.markers.find((m) => m.c === 'P');
  g.player.x = P.x + 7; g.player.y = P.y + 30 - g.player.h;
  g.fx.clear(); g.fx.banner = null;
  return g;
}
export const FLAT = [
  '################################################',
  ...Array.from({ length: 13 }, () => '#..............................................#'),
  '#P.............................................#',
  '################################################',
  '################################################',
  '################################################',
];
