// 戦闘の見え方：予兆・払の軌跡・石坊主の叩きつけ・浮いた石坊主
import path from 'node:path';
import { OUT, launch, startServer } from './lib.mjs';

const srv = await startServer();
const { browser, page, logs } = await launch({ width: 960, height: 540 });
const shot = (n) => page.screenshot({ path: path.join(OUT, `combat-${n}.png`), timeout: 120000 });
const step = (n) => page.evaluate((n) => window.__k.step(n), n);
try {
  await page.goto(srv.url);
  await page.waitForFunction(() => window.__k, null, { timeout: 20000 });
  await page.evaluate(() => {
    const k = window.__k;
    k.app.manual = true;
    k.startAt('ch1', { flags: { 'trig:c1_intro': true, 'trig:c1_gap': true, 'trig:c1_mask': true } });
    k.skipCard();
    const s = k.sim();
    s.player.body.x = 1;
    s.player.body.y = 4;
    s.player.body.z = 13.2;
    s.player.yaw = 0;
    k.app.cam.reset(s);
  });
  // 妖が近づいて予兆を出すまで待つ
  let st = '';
  for (let i = 0; i < 80; i++) {
    await step(2);
    st = await page.evaluate(() => window.__k.sim().enemies.map((e) => e.mode).join(','));
    if (st.includes('windup')) break;
  }
  await step(8);
  await shot('1-telegraph');
  // 払う
  await page.keyboard.down('KeyJ');
  await step(2);
  await page.keyboard.up('KeyJ');
  await step(6);
  await shot('2-swing');
  await step(30);
  // 石坊主
  await page.evaluate(() => {
    const k = window.__k;
    const s = k.sim();
    s.enemies = s.enemies.filter((e) => e.spawn.type === 'ishibozu');
    s.player.body.x = 0;
    s.player.body.y = 4.5;
    s.player.body.z = 32.5;
    s.player.yaw = 0;
    s.player.hp = 5;
    k.app.cam.reset(s);
  });
  for (let i = 0; i < 120; i++) {
    await step(2);
    const m = await page.evaluate(() => window.__k.sim().enemies.find((e) => e.spawn.type === 'ishibozu' && e.body.z < 40)?.mode ?? '');
    if (m === 'windup') break;
  }
  await step(40);
  await shot('3-ishibozu-windup');
  await page.evaluate(() => window.__k.sim().doPawn('jump'));
  await step(150);
  await shot('4-ishibozu-float');
  console.log(logs.filter((l) => l.includes('error')).join('\n') || 'エラーなし');
} finally {
  await browser.close();
  srv.stop();
}
