import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const SP = process.argv[2];
const b = await chromium.launch();
for (const [name, vp] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'ja-JP', viewport: vp });
  const p = await ctx.newPage({ locale: 'ja-JP' });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + SP + '/build/wedge-of-dawn.html'); await p.waitForTimeout(800); await p.touchscreen.tap(vp.width/2, vp.height/2); await p.waitForTimeout(200);
  const info = await p.evaluate(() => ({ touch: document.body.className, canvas: document.getElementById('game').getBoundingClientRect().toJSON(), btns: document.querySelectorAll('#touch .t-btn').length, scrollW: document.documentElement.scrollWidth }));
  await p.screenshot({ path: `${SP}/shots/s-${name}-title.png` });
  // タイトルの「はじめる」をタップ（ゲーム座標 → 画面座標）
  const c = info.canvas;
  await p.touchscreen.tap(c.x + c.width * 0.5, c.y + c.height * (380 / 540));
  await p.waitForTimeout(400);
  for (let i = 0; i < 10; i++) { await p.touchscreen.tap(c.x + c.width * 0.5, c.y + c.height * 0.5); await p.waitForTimeout(250); }
  const s1 = await p.evaluate(() => window.__game.scene + (window.__game.modal ? ':modal' : ''));
  // スティックを右へ倒し続ける
  const hold = async (sel, dx, dy, ms) => {
    await p.evaluate(([sel, dx, dy]) => { const el = document.querySelector(sel); const r = el.getBoundingClientRect(); const o = { pointerId: 7, pointerType: 'touch', bubbles: true, clientX: r.left + r.width / 2 + dx, clientY: r.top + r.height / 2 + dy }; el.dispatchEvent(new PointerEvent('pointerdown', o)); }, [sel, dx, dy]);
    await p.waitForTimeout(ms);
    await p.evaluate(([sel]) => { const el = document.querySelector(sel); el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', bubbles: true })); }, [sel]);
  };
  const x0 = await p.evaluate(() => window.__game.player.x);
  await hold('#touch .t-pad', 45, 0, 600);
  const x1 = await p.evaluate(() => window.__game.player.x);
  await p.evaluate(() => { const el = document.querySelector('#touch .t-btn'); el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 8, pointerType: 'touch', bubbles: true })); });
  await p.waitForTimeout(40);
  const atk = await p.evaluate(() => window.__game.player.atk && window.__game.player.atk.name);
  await p.evaluate(() => { const el = document.querySelector('#touch .t-btn'); el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8, pointerType: 'touch', bubbles: true })); });
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${SP}/shots/s-${name}-play.png` });
  // 強化カードのタップ選択
  await p.evaluate(() => window.__game.openBoonPick(1, null));
  await p.waitForTimeout(500);
  const c2 = await p.evaluate(() => document.getElementById('game').getBoundingClientRect().toJSON());
  const tapGame = (gx, gy) => p.touchscreen.tap(c2.x + c2.width * gx / 960, c2.y + c2.height * gy / 540);
  await tapGame(480 - 386 + 125, 250); await p.waitForTimeout(100);
  const sel = await p.evaluate(() => window.__game.modal && window.__game.modal.sel);
  await p.screenshot({ path: `${SP}/shots/s-${name}-boon.png` });
  await tapGame(480 - 386 + 125, 250); await p.waitForTimeout(200);
  const boons = await p.evaluate(() => window.__game.player.boons.map(b => b.id));
  console.log(name, JSON.stringify({ ...info, scene: s1, moved: Math.round(x1 - x0), atk, sel, boons }), errs);
  await ctx.close();
}
await b.close();
