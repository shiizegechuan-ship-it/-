import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const SP = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:8080/index.html'); await p.waitForTimeout(700);
const scenes = {
  hud: "g.modal = null;",
  boon: "g.player.setBoons([{id:'orbit',tier:2},{id:'edge',tier:1},{id:'satellites',tier:1}]); g.openBoonPick(1, null); g.modal.t = 5;",
  shop: "g.run.gold = 300; g.openShop(); g.modal.t = 5;",
  pause: "g.openPause();",
  dialog: "g.openDialog([{ who: 'グレン', text: 'お前の「守りの秒針」と「歯車の鋸」――両方 Lv2 まで上げりゃ、噛み合って「歯車の輪舞」になるぜ。「守りの秒針」は今 Lv2、「歯車の鋸」はまだ持ってねえな。', note: '合成の手がかり：守りの秒針（Lv2）＋歯車の鋸（Lv2）→ 歯車の輪舞' }], [{ label: '強化を鍛えてもらう（II）', fn(){} }, { label: '立ち去る', fn(){} }]); g.modal.idx = 0; g.modal.t = 5;",
  journal: "g.openJournal(); g.modal.tab = 3;",
};
for (const mode of ['normal', 'xlarge']) for (const [name, js] of Object.entries(scenes)) {
  await p.evaluate(([mode, js]) => { const g = window.__game; g.newGame(9); g.modal = null; g.settings.textSize = mode; g.fx.banner = null; g.nightNote = null; eval(js); }, [mode, js]);
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${SP}/shots/txt-${mode}-${name}.png` });
}
console.log(errs);
await b.close();
