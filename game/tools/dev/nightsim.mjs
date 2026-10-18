// 1 夜を通しで遊ぶボット。使い方: node nightsim.mjs <skill:good|mid|bad> <pick:first|passive> <loop> <startBoons JSON> <seeds>
import { newGame, Driver } from '/home/user/-/game/tests/helpers.mjs';
import { botInputs } from '/home/user/-/game/tests/bot.mjs';
import { PASSIVE_IDS, BOONS } from '/home/user/-/game/src/boons.js';
import { cx } from '/home/user/-/game/src/util.js';
import { THREAT } from '/home/user/-/game/src/game.js';
if (process.env.THREAT) Object.assign(THREAT, JSON.parse(process.env.THREAT));
const [skill = 'mid', pick = 'first', loop = '1', start = '[]', seedsArg = '10'] = process.argv.slice(2);
const startBoons = JSON.parse(start);
const out = { minHp: 0, bossHp0: 0, bossT: 0, nb: 0, clear: 0, deaths: {}, lv: 0, threat: 0, boons: 0, passiveLv: 0, n: 0, bossHpLeft: 0, time: 0 };
for (let seed = 1; seed <= +seedsArg; seed++) {
  const g = newGame(seed * 7919);
  g.meta.loop = +loop; g.meta.slots = 3; g.meta.difficulty = process.env.DIFF || 'normal'; if (process.env.COMP) g.meta.companion = process.env.COMP;
  g.startLoop(); g.modal = null; if (process.env.NOCOMP) g.comp = null;
  if (startBoons.length) g.player.setBoons(startBoons);
  const d = new Driver(g);
  const dp = g.damagePlayer.bind(g); g.damagePlayer = (dmg, o = {}) => { if (o.pit) return; return dp(dmg, o); };
  const hp0 = g.hitPlayer.bind(g); g.hitPlayer = (box, dmg, fromX, key, knock) => { const before = g.player.hp; const r = hp0(box, dmg, fromX, key, knock); if (r && g.player.hp < before) { const src = g.room.enemies.find((e) => Math.abs(cx(e) - fromX) < 2) || (box.kind ? { kind: 'proj:' + box.kind } : { kind: '?' }); (globalThis.DMG ||= {})[src.kind] = ((globalThis.DMG ||= {})[src.kind] || 0) + (before - g.player.hp); } return r; };
  const choose = () => {
    const m = g.modal;
    if (!m) return;
    if (m.type === 'fusion') { m.t = 1; m.sel = 0; d.frame(1, ['confirm']); d.frame(1); return; }
    if (m.type !== 'boon') { g.modal = null; return; }
    let i = 0;
    if (pick === 'passive') { const j = m.offer.findIndex((id) => PASSIVE_IDS.includes(id)); if (j >= 0) i = j; }
    if (pick === 'melee') { const j = m.offer.findIndex((id) => BOONS[id].melee); if (j >= 0) i = j; }
    m.sel = i; m.t = 1;
    d.frame(1, ['confirm']); d.frame(1);
  };
  out.k0 = 0;
  let died = null, frames = 0, minHp = 1, bossStart = 0; let bossT = 0;
  outer: for (let fi = 0; fi < g.run.plan.floors.length; fi++) for (let ri = 0; ri < g.run.plan.floors[fi].length; ri++) {
    const desc = g.run.plan.floors[fi][ri];
    if (!['combat', 'elite', 'elite2', 'trial', 'boss'].includes(desc.type)) continue;
    g.enterRoom(fi, ri);
    for (let k = 0; k < 5 && g.modal; k++) choose();
    let f = 0;
    const done = () => g.player.state === 'dead' || (g.room.boss ? g.room.boss.defeated : g.room.enemies.every((e) => !e.alive) && (desc.type !== 'combat' || g.room.cleared || !('incoming' in g.room)));
    if (desc.type === "boss") { out.bossHp0 += g.player.hp / g.player.maxHp; out.nb++; bossStart = frames; }
    while (!done() && f < 60 * 150) {
      if (g.modal) choose(); d.frame(1, botInputs(g, f, skill)); f++;
      minHp = Math.min(minHp, g.player.hp / g.player.maxHp);
      // 届かない敵（高台の砲台など）は 40 秒で片付けたことにする（ボットの移動の限界。人なら跳んで届く）
      if (!g.room.boss && f % 2400 === 0) for (const e of g.room.enemies) if (e.alive) { e.hp = 0; e.alive = false; }
    }
    if (desc.type === "combat") { out.kN = (out.kN || 0) + g.run.kills - (out.k0 || 0); } out.k0 = g.run.kills;
    if (desc.type === "combat") { out.cT = (out.cT || 0) + f / 60; out.cN = (out.cN || 0) + 1; out.cMin = Math.min(out.cMin ?? 1e9, f / 60); }
    frames += f; if (desc.type === 'boss') out.bossT += f / 60;
    if (g.player.state === 'dead' || f >= 60 * 150) { died = `${fi}-${ri}${desc.type === 'boss' ? 'B' : ''}`; if (g.room.boss) out.bossHpLeft += g.room.boss.hp / g.room.boss.maxHp; break outer; }
    d.frame(30); for (let k = 0; k < 5 && g.modal; k++) choose();
    if (desc.type === 'combat') { g.takeReward(desc.rewardChoices[0]); for (let k = 0; k < 5 && g.modal; k++) choose(); }
    if (desc.type === 'elite' || desc.type === 'elite2' || desc.type === 'trial') { for (let k = 0; k < 5 && g.modal; k++) choose(); }
  }
  out.n++; out.minHp += Math.max(0, minHp); out.gold = (out.gold || 0) + g.run.gold;
  if (!died) out.clear++; else out.deaths[died] = (out.deaths[died] || 0) + 1;
  out.lv += g.run.level; out.threat += g.threatStep(); out.boons += g.player.boons.length;
  out.passiveLv += g.player.boons.filter((b) => PASSIVE_IDS.includes(b.id)).reduce((a, b) => a + b.tier, 0);
  out.time += frames / 60;
}
const n = out.n;
if (process.env.DMG) console.log(JSON.stringify(Object.entries(globalThis.DMG || {}).sort((a, b) => b[1] - a[1])));
console.log(`${skill}/${pick}/night${loop} start=${startBoons.length}: clear ${out.clear}/${n}  avgLv ${(out.lv / n).toFixed(1)}  threat ${(out.threat / n).toFixed(1)}  boons ${(out.boons / n).toFixed(1)}  passiveLv ${(out.passiveLv / n).toFixed(1)}  time ${(out.time / n).toFixed(0)}s  gold ${Math.round(out.gold / n)}  minHp ${Math.round(out.minHp / n * 100)}%  hpAtBoss ${Math.round(out.bossHp0 / Math.max(1, out.nb) * 100)}%  bossFight ${(out.bossT / Math.max(1, out.nb)).toFixed(0)}s  deaths ${JSON.stringify(out.deaths)}  kills/room ${(out.kN / out.cN).toFixed(1)}  combatAvg ${(out.cT / out.cN).toFixed(1)}s min ${out.cMin?.toFixed(1)}s`);
