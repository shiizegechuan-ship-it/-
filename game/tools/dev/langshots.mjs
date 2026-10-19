// 言語ごとの主な画面のスクリーンショット。使い方: node tools/dev/langshots.mjs <出力先> [言語…]（game/ で http.server を動かしておく）
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const [OUT = '/tmp/wedge-dev/lang', ...ls] = process.argv.slice(2);
const LANGS = ls.length ? ls : ['en', 'zh-Hans', 'zh-Hant', 'ko', 'ru', 'es', 'pt-BR', 'de', 'fr'];
mkdirSync(OUT, { recursive: true });
const scenes = {
  title: "g.scene = 'title'; g.modal = null;",
  settings: "g.scene = 'title'; g.modal = null; g.titleSettings = { sel: 3, about: false, t: 0 };",
  hud: "g.modal = null; g.fx.banner = null;",
  boon: "g.player.setBoons([{id:'orbit',tier:2},{id:'edge',tier:1}]); g.openBoonPick(1, null); g.modal.t = 5;",
  intro: "g.meta.loop = 1; g.meta.flags.seenRewind = false; g.startLoop(); g.modal.idx = 1;",
  rewind: "g.endRun('death'); g.rewind.t = 4;",
  journal: "g.openJournal(); g.modal.tab = 1;",
  about: "g.scene = 'title'; g.modal = null; g.titleSettings = { sel: 4, about: true, t: 0 };",
};
const b = await chromium.launch();
const errs = [];
for (const lang of LANGS) {
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, locale: 'en-US' });
  await ctx.addInitScript((l) => { try { localStorage.setItem('wedge-of-dawn-save-v1:settings', JSON.stringify({ lang: l })); } catch {} }, lang);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(lang + ': ' + e.message));
  await p.goto('http://localhost:8080/index.html'); await p.waitForTimeout(900);
  for (const [name, js] of Object.entries(scenes)) {
    await p.evaluate((js) => { const g = window.__game; g.newGame(9); g.modal = null; g.fx.banner = null; g.nightNote = null; eval(js); }, js);
    await p.waitForTimeout(450);
    await p.screenshot({ path: `${OUT}/${lang}-${name}.png` });
  }
  await ctx.close();
}
console.log('errors', errs);
await b.close();
