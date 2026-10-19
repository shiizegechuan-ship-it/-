// ストアページ用の画面写真（1920×1080）。使い方: node tools/dev/store.mjs shots（紹介動画は trailer.mjs）（game/ で python3 -m http.server 8080 を動かしておく）
// ボット（tests/bot.mjs）に操作させて、戦っている場面を撮る
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const what = process.argv[2] || 'shots';
const OUT = new URL('../../store/', import.meta.url).pathname;
const W = 1920, H = 1080;

// ページの中で使う道具：ボットを入力につなぐ・部屋に入る・選択画面を自動で閉じる
const SETUP = `(async () => {
  const { botInputs } = await import('/tests/bot.mjs');
  const g = window.__game, input = window.__input, step = input.step.bind(input);
  window.__bot = { on: false, f: 0, skill: 'good', autoModal: true };
  input.step = () => {
    const B = window.__bot;
    if (B.on && g.scene === 'play') {
      if (g.modal && B.autoModal) { if (g.modal.type === 'boon' || g.modal.type === 'fusion') { g.modal.t = 9; g.modal.sel = 0; input.set('confirm', B.f % 2 === 0); } else if (g.modal.choices) { g.modal.idx = g.modal.lines.length - 1; g.modal.sel = 0; input.set('confirm', B.f % 2 === 0); } else g.modal = null; }
      else if (!g.modal) { const held = g.room ? botInputs(g, B.f, B.skill) : []; for (const a of Object.keys(input.raw)) input.set(a, held.includes(a)); }
      B.f++;
    }
    step();
  };
  window.__prep = (o = {}) => {
    g.newGame(o.seed || 11); g.modal = null; g.fx.banner = null; g.nightNote = null;
    g.meta.difficulty = 'normal'; g.meta.loop = o.loop || 2; g.meta.slots = 3;
    Object.assign(g.meta.upgrades, o.upg || { atk: 6, hp: 6 });
    if (o.wedges) for (const w of o.wedges) g.meta.wedges.push(w);
    g.startLoop(); g.modal = null; g.fx.banner = null; g.nightNote = null;
    if (o.boons) g.player.setBoons([...g.player.boons, ...o.boons]);
    if (o.level) { g.run.level = o.level; g.player.baseMaxHp += 6 * (o.level - 1); g.player.setBoons(g.player.boons); g.player.hp = g.player.maxHp; }
  };
  window.__room = (type, n = 0) => { const fl = g.run.plan.floors; let k = 0; for (let fi = 0; fi < fl.length; fi++) for (let ri = 0; ri < fl[fi].length; ri++) if (fl[fi][ri].type === type && k++ === n) { g.enterRoom(fi, ri); g.modal = null; g.fx.banner = null; return fi + '-' + ri; } return null; };
  return true;
})()`;

const BOONS = "[{id:'edge',tier:2},{id:'orbit',tier:2},{id:'crit',tier:1},{id:'satellites',tier:1},{id:'heavyart',tier:1}]";
const SCENES = [
  // [ファイル名, 準備, 待つ秒（ボットが戦う時間）]
  ['01-title', "g.newGame(3); g.scene='title'; g.modal=null;", 1.5],
  ['02-combat', `__prep({ boons: ${BOONS}, level: 5 }); __room('combat', 1); __bot.on = true;`, 5.5],
  ['03-boss', `__prep({ boons: ${BOONS}, level: 9, upg: { atk: 10, hp: 10 } }); __room('boss'); __bot.on = true;`, 9],
  ['04-boon', `__prep({ boons: ${BOONS}, level: 4 }); __room('combat', 2); g.openBoonPick(1, null); g.modal.t = 5;`, 1],
  ['05-elite', `__prep({ boons: ${BOONS}, level: 7 }); __room('elite'); __bot.on = true;`, 6],
  ['06-golden', `__prep({ boons: ${BOONS}, level: 6 }); g.enterRoom(g.run.fi, g.run.ri, { type: 'golden', layout: 'vault' }); g.modal = null; g.fx.banner = null;`, 1.5],
  ['07-combat2', `__prep({ boons: ${BOONS}, level: 7, seed: 29 }); __room('combat', 4); __bot.on = true;`, 6],
  ['08-dawn', "g.newGame(5); g.meta.flags.ending = true; g.meta.flags.endings = { true: true }; g.scene='title'; g.modal=null;", 1.5],
];

const b = await chromium.launch();
const errs = [];
async function page(opts = {}) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, ...opts });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8080/index.html'); await p.waitForTimeout(900);
  await p.evaluate(SETUP);
  return [ctx, p];
}

if (what === 'shots') {
  mkdirSync(OUT + 'screenshots', { recursive: true });
  const [ctx, p] = await page();
  for (const [name, js, wait] of SCENES) {
    await p.evaluate((js) => { window.__bot.on = false; window.__bot.f = 0; const g = window.__game; eval(js); }, js);
    await p.waitForTimeout(wait * 1000);
    await p.evaluate(() => { const g = window.__game; if (g.fx) g.fx.banner = null; });
    await p.screenshot({ path: `${OUT}screenshots/${name}.png` });
    console.log(name, await p.evaluate(() => { const g = window.__game; return g.scene + (g.player ? ` hp ${Math.round(g.player.hp)}/${g.player.maxHp}` : '') + (g.room && g.room.boss ? ` boss ${Math.round(g.room.boss.hp / g.room.boss.maxHp * 100)}%` : ''); }));
  }
  await ctx.close();
} else {
  console.log('紹介動画は tools/dev/trailer.mjs で作る');
}
console.log('errors', errs);
await b.close();
