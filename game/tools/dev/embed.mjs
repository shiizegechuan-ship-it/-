import { newGame } from '/home/user/-/game/tests/helpers.mjs';
import { SOLID } from '/home/user/-/game/src/tilemap.js';
let rooms = 0, bad = [];
for (const diff of ['veryeasy', 'normal', 'nightmare']) for (const seed of [3, 17, 29, 41, 53]) {
  const g = newGame(seed); g.meta.difficulty = diff; g.startLoop(); g.modal = null;
  g.run.plan.floors.forEach((fl, fi) => fl.forEach((r, ri) => {
    g.enterRoom(fi, ri); g.modal = null; rooms++;
    for (const e of g.room.enemies) {
      if (e.gravity === false) continue;
      const l = Math.floor(e.x / 30), rr = Math.floor((e.x + e.w - 0.01) / 30), t = Math.floor(e.y / 30), b = Math.floor((e.y + e.h - 0.01) / 30);
      let hit = false; for (let y = t; y <= b; y++) for (let x = l; x <= rr; x++) if (g.map.get(x, y) === SOLID) hit = true;
      if (hit) bad.push(`${diff} s${seed} ${fi}-${ri} ${r.layout} ${e.kind} y${Math.round(e.y)} h${e.h}`);
    }
  }));
}
console.log('rooms', rooms, 'embedded', bad.length); console.log(bad.slice(0, 15).join('\n'));
