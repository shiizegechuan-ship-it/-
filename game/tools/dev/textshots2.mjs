import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const SP = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:8080/index.html'); await p.waitForTimeout(700);
const scenes = {
  rewind: "for (const k of ['lira_name','code','master_reason','glen_time','boss_bell','tell_soldier','tell_bat']) g.learnK(k, true); g.player.setBoons([{id:'orbit',tier:3},{id:'edge',tier:2},{id:'rust',tier:1},{id:'satellites',tier:2}]); g.run.newWedges=[{target:'lira'}]; g.endRun('death'); g.rewind.t = 9;",
  journal: "for (const k of ['lira_name','lira_father','code','master_reason','glen_time','glen_saved','boss_bell','knight_lift']) g.learnK(k, true); g.openJournal(); g.modal.tab = 0;",
  rare: "g.player.setBoons([{id:'orbit',tier:2},{id:'gearsaw',tier:1}]); g.run.pendingRare = 1; g.run.level = 5; g.openRarePick(); g.modal.t = 5;",
  artifact: "g.openArtifactPick('gold', 3, false); g.modal.t = 5;",
  boon3: "g.player.setBoons([{id:'orbit',tier:2},{id:'gearsaw',tier:1},{id:'meteor',tier:1}]); g.openBoonPick(1, 'stasis'); g.modal.t = 5;",
};
for (const mode of ['normal', 'xlarge']) for (const [name, js] of Object.entries(scenes)) {
  await p.evaluate(([mode, js]) => { const g = window.__game; g.newGame(9); g.modal = null; g.settings.textSize = mode; g.fx.banner = null; g.nightNote = null; eval(js); }, [mode, js]);
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${SP}/shots/t2-${mode}-${name}.png` });
}
console.log(errs); await b.close();
