// 真の結末の決闘（刻守 → 白き刻守）を、実際の HP でボットに戦わせる。使い方: node trueduel.mjs <難易度> <刻印 JSON> <シード数>（例: node trueduel.mjs nightmare '{"atk":15,"hp":15}' 6）
import { newGame, Driver } from '/home/user/-/game/tests/helpers.mjs';
import { botInputs } from '/home/user/-/game/tests/bot.mjs';
import { addWedge, learn } from '/home/user/-/game/src/meta.js';
const [diff, upg, seeds = '6'] = process.argv.slice(2);
let wins = 0; const res = [];
for (let seed = 1; seed <= +seeds; seed++) {
  const g = newGame(seed * 131); const d = new Driver(g);
  g.meta.difficulty = diff; Object.assign(g.meta.upgrades, JSON.parse(upg)); g.meta.loop = 3;
  addWedge(g.meta, { target: 'lira' }); addWedge(g.meta, { target: 'brake' }); learn(g.meta, 'lira_message'); learn(g.meta, 'master_reason');
  g.startLoop(); g.modal = null;
  // 夜の終わりの頃の、ふつうの手持ち（nightsim の平均：強化 6〜7 個・Lv8〜10）
  g.player.setBoons([...g.player.boons, { id: 'edge', tier: 2 }, { id: 'crit', tier: 2 }, { id: 'orbit', tier: 2 }, { id: 'heavyart', tier: 1 }, { id: 'ironheart', tier: 1 }]);
  g.run.level = 9; g.player.baseMaxHp += 6 * 8; g.player.setBoons(g.player.boons); g.player.hp = g.player.maxHp;
  g.enterRoom(2, g.run.plan.floors[2].findIndex((r) => r.type === 'boss'));
  const b = g.room.boss; let f = 0;
  while (f < 60 * 300 && !(b.defeated && b.finalForm) && g.player.state !== 'dead' && g.scene === 'play') {
    if (g.modal) { if (g.modal.choices) { g.modal.idx = g.modal.lines.length - 1; g.modal.sel = 0; } d.frame(8); d.frame(1, ['confirm']); continue; }
    d.frame(1, botInputs(g, f, 'good')); f++;
  }
  const win = b.defeated && b.finalForm || g.scene === 'ending';
  if (win) wins++;
  res.push(`${win ? '勝ち' : g.player.state === 'dead' ? '負け' : '時間切れ'}(${(f / 60).toFixed(0)}s, ${b.finalForm ? '白き刻守 HP ' + Math.round(b.hp / b.maxHp * 100) + '%' : '刻守 HP ' + Math.round(b.hp / b.maxHp * 100) + '%'})`);
}
console.log(diff, upg, `${wins}/${seeds}`, res.join(' '));
