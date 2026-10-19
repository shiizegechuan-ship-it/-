import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const SP = process.argv[2];
const b = await chromium.launch(); const p = await b.newPage({ locale: 'ja-JP', viewport: { width: 1000, height: 600 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('file://' + SP + '/build/wedge-of-dawn.html'); await p.waitForTimeout(600);
await p.click('#focus'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
for (let i = 0; i < 8; i++) { await p.keyboard.press("KeyZ"); await p.waitForTimeout(250); }
const modalLeft = await p.evaluate(() => window.__game.modal && window.__game.modal.type); console.log('modal after closing:', modalLeft);
await p.keyboard.down('ArrowRight'); await p.waitForTimeout(500); await p.keyboard.up('ArrowRight');
await p.keyboard.press('KeyX'); await p.waitForTimeout(200);
const s = await p.evaluate(() => ({ scene: window.__game.scene, x: Math.round(window.__game.player.x) }));
await p.screenshot({ path: SP + '/shots/single.png' });
console.log(JSON.stringify(s), errs); await b.close();
