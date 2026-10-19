import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const p = await b.newPage({ locale: 'ja-JP', viewport: { width: 960, height: 540 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:8080/index.html'); await p.waitForTimeout(600);
await p.mouse.click(5, 5); await p.waitForTimeout(800); // 音を鳴らせるように（最初の操作）
const cur = () => p.evaluate(() => window.__music.cur && window.__music.cur.id);
console.log('タイトル画面:', await cur());
await p.evaluate(() => { const g = window.__game; g.newGame(9); g.modal = null; }); await p.waitForTimeout(500);
console.log('夜のはじめの入口:', await cur());
await p.evaluate(() => { const g = window.__game; const fi = g.run.plan.floors.findIndex((fl) => fl.some((r) => r.type === 'archive')); g.enterRoom(fi, g.run.plan.floors[fi].findIndex((r) => r.type === 'archive')); g.modal = null; }); await p.waitForTimeout(800);
console.log('書庫:', await cur());
await p.evaluate(() => { const g = window.__game; g.enterRoom(1, g.run.plan.floors[1].findIndex((r) => r.type === 'combat')); g.modal = null; }); await p.waitForTimeout(800);
console.log('中層の戦闘部屋:', await cur());
console.log(errs); await b.close();
