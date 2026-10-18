import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const SP = process.argv[2];
const b = await chromium.launch();
const vp = { width: 844, height: 390 };
const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: vp });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('file://' + SP + '/build/wedge-of-dawn.html'); await p.waitForTimeout(800); await p.touchscreen.tap(400, 200); await p.waitForTimeout(200);
await p.evaluate(() => { const g = window.__game; g.newGame(9); g.modal = null; g.meta.difficulty = 'normal'; });
await p.waitForTimeout(500);
await p.evaluate(() => { window.__game.modal = null; });
const c = await p.evaluate(() => document.getElementById('game').getBoundingClientRect().toJSON());
const st = () => p.evaluate(() => { const q = window.__game.player; return { x: Math.round(q.x), y: Math.round(q.y), state: q.state, modal: window.__game.modal && window.__game.modal.type, scrollY: window.scrollY, vv: window.visualViewport ? window.visualViewport.offsetTop : 0, right: window.__input.raw.right }; });
console.log('start', await st()); await p.evaluate(() => { window.__lastTap = null; document.getElementById('game').addEventListener('pointerdown', (e) => { window.__lastTap = [e.clientX, e.clientY, e.pointerType]; }); });
// 画面の右寄り（操作盤から離れた所）をタップ → 移動
await p.touchscreen.tap(c.x + c.width * 0.62, c.y + c.height * 0.3); await p.waitForTimeout(80);
console.log('after tap', await st(), await p.evaluate(() => window.__lastTap), await p.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el && (el.id || el.className || el.tagName); }, [c.x + c.width * 0.62, c.y + c.height * 0.3])); await p.waitForTimeout(900);
console.log('arrived', await st());
await p.screenshot({ path: `${SP}/shots/tapmove.png` });
// ボタンのすぐ横（デッドゾーン）をタップ → 動かない
const r = await p.evaluate(() => document.querySelector('#touch .t-btn').getBoundingClientRect().toJSON());
const before = await st();
await p.touchscreen.tap(r.left - 10, r.top + r.height / 2); await p.waitForTimeout(600);
const after = await st(); console.log('dead zone moved?', after.state === 'travel' || Math.abs(after.x - before.x) > 40);
// ボタンを素早く 2 回 → ページはずれない
for (let i = 0; i < 3; i++) { await p.touchscreen.tap(r.left + r.width / 2, r.top + r.height / 2); await p.waitForTimeout(90); await p.touchscreen.tap(r.left + r.width / 2, r.top + r.height / 2); await p.waitForTimeout(300); }
console.log('after double taps', await st());
// スティックを右へ倒したまま、pointerup が届かずに指が離れた（touchend だけ）→ 右は離れる
await p.evaluate(() => { const el = document.querySelector('#touch .t-pad'); const rr = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, pointerType: 'touch', bubbles: true, clientX: rr.left + rr.width / 2 + 45, clientY: rr.top + rr.height / 2 })); });
await p.waitForTimeout(100);
console.log('holding', (await st()).right);
await p.evaluate(() => { const t = new TouchEvent('touchend', { touches: [], bubbles: true, cancelable: true }); document.dispatchEvent(t); });
await p.waitForTimeout(50);
console.log('released', (await st()).right === false);
console.log('errors', errs);
await b.close();
