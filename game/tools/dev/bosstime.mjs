// 刻守戦の長さを、強さの違う構成で測る： node bosstime.mjs
import { newGame, Driver } from '/home/user/-/game/tests/helpers.mjs';
import { botInputs } from '/home/user/-/game/tests/bot.mjs';
const BUILDS = {
  weak: [],
  mid: [{ id: 'edge', tier: 2 }, { id: 'critdmg', tier: 2 }, { id: 'orbit', tier: 2 }],
  strong: [{ id: 'swordsaint', tier: 3 }, { id: 'critdmg', tier: 5 }, { id: 'heavyart', tier: 5 }, { id: 'crown', tier: 1 }, { id: 'goldeye', tier: 1 }, { id: 'galaxy', tier: 3 }, { id: 'starblade', tier: 3 }],
  absurd: [{ id: 'swordsaint', tier: 5 }, { id: 'critdmg', tier: 5 }, { id: 'heavyart', tier: 5 }, { id: 'crown', tier: 1 }, { id: 'goldeye', tier: 1 }, { id: 'sandglass', tier: 1 }, { id: 'galaxy', tier: 5 }, { id: 'starblade', tier: 5 }, { id: 'thundergod', tier: 5 }, { id: 'towerblessing', tier: 1 }],
};
for (const [name, boons] of Object.entries(BUILDS)) {
  const times = [];
  for (let seed = 1; seed <= 3; seed++) {
    const g = newGame(seed * 31); const d = new Driver(g);
    g.enterRoom(2, g.run.plan.floors[2].findIndex((r) => r.type === 'boss'));
    g.player.setBoons(boons.map((b) => ({ ...b }))); g.player.hp = g.player.maxHp = 1e6;
    if (name !== 'weak') { g.run.level = name === 'absurd' ? 25 : 12; }
    const b = g.room.boss; let f = 0, fightF = 0;
    while (f < 60 * 120 && !b.defeated) { if (g.modal) g.modal = null; d.frame(1, botInputs(g, f, 'mid')); f++; if (!b.invuln) fightF++; }
    times.push(`${(fightF / 60).toFixed(1)}s${b.defeated ? '' : '(未)'}`);
  }
  console.log(name.padEnd(7), times.join('  '));
}
