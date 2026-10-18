import { newGame, Driver } from '/home/user/-/game/tests/helpers.mjs';
const g = newGame(31); const d = new Driver(g);
g.enterRoom(2, g.run.plan.floors[2].findIndex((r) => r.type === 'boss')); g.modal = null;
const p = g.player; p.hp = p.maxHp = 1e6;
let invFrames = 0, hp0 = p.hp;
for (let f = 0; f < 60 * 20; f++) {
  if (g.modal) g.modal = null;
  if (process.env.NOTAP !== '1' && f % 20 === 0) g.tapMove(f % 40 ? 200 : 700, 300);
  d.frame(1);
  if (p.invulnerable) invFrames++;
}
console.log('無敵だったフレームの割合', (invFrames / 1200 * 100).toFixed(0) + '%', '受けたダメージ', hp0 - p.hp);
