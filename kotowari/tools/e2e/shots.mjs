// 主な場面のスクリーンショット：node tools/e2e/shots.mjs [幅] [高さ]
import path from 'node:path';
import { OUT, imageStats, launch, startServer } from './lib.mjs';

const W = Number(process.argv[2] ?? 960);
const H = Number(process.argv[3] ?? 540);
const srv = await startServer();
const { browser, page, logs } = await launch({ width: W, height: H });
const shot = async (name) => {
  const f = path.join(OUT, `${name}-${W}x${H}.png`);
  await page.evaluate(() => window.__k.step(1));
  await page.screenshot({ path: f, timeout: 120000 });
  const st = await imageStats(page, f);
  console.log(name, JSON.stringify(st));
  return st;
};
try {
  await page.goto(srv.url);
  await page.waitForFunction(() => window.__k, null, { timeout: 20000 });
  await page.evaluate(() => (window.__k.app.manual = true));
  for (let i = 0; i < 6; i++) await page.evaluate(() => window.__k.step(15));
  await shot('01-title');
  await page.evaluate(() => {
    window.__k.app.newGame();
    window.__k.step(20);
  });
  await shot('02-card');
  await page.evaluate(() => {
    window.__k.skipCard();
    window.__k.step(2);
  });
  // 冒頭の会話を送る
  for (let i = 0; i < 8; i++) await page.evaluate(() => { const ui = window.__k.app.ui; if (ui.dialogOpen) ui.advanceDialog(), ui.advanceDialog(); window.__k.step(3); });
  await page.evaluate(() => window.__k.step(30));
  await shot('03-stage');
  await page.evaluate(() => {
    const k = window.__k;
    k.startAt('ch1', { ledger: { zeni: 20, debt: 0, pawned: [] } });
    k.skipCard();
    const s = k.sim();
    s.player.body.x = 0; s.player.body.y = 4; s.player.body.z = 18.5;
    s.player.yaw = 0;
    k.app.cam.reset(s);
    s.setFlag('trig:c1_gap'); s.setFlag('trig:c1_mask'); s.setFlag('trig:c1_intro');
    k.step(40);
  });
  await shot('04-ch1-gap');
  await page.evaluate(() => {
    const k = window.__k;
    k.sim().doPawn('jump');
    k.step(200);
  });
  await shot('05-ch1-floated');
  console.log(logs.filter((l) => !l.includes('[debug]')).slice(0, 30).join('\n'));
} finally {
  await browser.close();
  srv.stop();
}
