// 刻限の張りつめ（鼓動・脈・灯が消える・迫る水）とゲームオーバーの画面
import path from 'node:path';
import { OUT, launch, startServer } from './lib.mjs';

const srv = await startServer();
const { browser, page, logs } = await launch({ width: 960, height: 540 });
const shot = (n) => page.screenshot({ path: path.join(OUT, `tension-${n}.png`), timeout: 120000 });
const step = (n) => page.evaluate((n) => window.__k.step(n), n);
try {
  await page.goto(srv.url);
  await page.waitForFunction(() => window.__k, null, { timeout: 20000 });
  // 三の章：日記を読んだ後、刻限の 8 割が過ぎた所
  await page.evaluate(() => {
    const k = window.__k;
    k.app.manual = true;
    k.startAt('ch3', { flags: { 'read:c3_diary': true } });
    k.skipCard();
    const s = k.sim();
    for (const t of s.level.triggers) s.setFlag('trig:' + t.id);
    s.player.body.x = 0;
    s.player.body.z = 31;
    s.player.yaw = 0;
    k.app.cam.reset(s);
    k.step(2);
    s.timer.left = 7;
  });
  for (let i = 0; i < 8; i++) await step(5);
  const st = await page.evaluate(() => ({ tension: window.__k.app.tension, pulse: window.__k.app.pipe.params.pulse, hearts: window.__k.app.audio.log.filter((l) => l.name === 'heart').length }));
  console.log('三の章', JSON.stringify(st));
  await page.evaluate(() => (window.__k.app.pipe.params.pulse = 1));
  await shot('1-town');
  // 刻限切れ → ゲームオーバー
  await page.evaluate(() => (window.__k.sim().timer.left = 0.05));
  for (let i = 0; i < 20; i++) await step(10);
  console.log('状態', await page.evaluate(() => window.__k.state()));
  await shot('2-gameover');
  // 四の章：迫る水
  await page.evaluate(() => {
    const k = window.__k;
    k.app.ui.clearOverlay();
    k.app.pipe.params.fade = 0;
    k.startAt('ch4', { flags: { 'trig:c4_contract': true } });
    k.skipCard();
    const s = k.sim();
    for (const t of s.level.triggers) s.setFlag('trig:' + t.id);
    s.player.body.x = 0;
    s.player.body.z = 32;
    s.player.yaw = 0;
    k.app.cam.reset(s);
    k.step(2);
    s.timer.left = 6;
  });
  for (let i = 0; i < 6; i++) await step(5);
  await shot('3-flood');
  console.log(logs.filter((l) => l.includes('error')).join('\n') || 'エラーなし');
} finally {
  srv.stop();
  await browser.close();
  process.exit(0);
}
