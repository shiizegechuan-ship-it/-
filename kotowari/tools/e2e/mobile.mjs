// スマホのエミュレーション（Chromium）：タッチでタイトル→会話→スティックで歩く→ボタンで跳ぶ。縦横のスクリーンショット
import path from 'node:path';
import { OUT, chromium, imageStats, startServer } from './lib.mjs';

const srv = await startServer();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (n, ok, info = '') => {
  results.push(ok);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${n} ${info}`);
};
try {
  for (const [w, h, name] of [
    [844, 390, '横'],
    [390, 844, '縦'],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const logs = [];
    page.on('pageerror', (e) => logs.push(e.message));
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
    const step = (n) => page.evaluate((n) => window.__k.step(n), n);
    await page.goto(srv.url);
    await page.waitForFunction(() => window.__k, null, { timeout: 20000 });
    await page.evaluate(() => (window.__k.app.manual = true));
    await step(3);
    check(`${name}：タッチ用の操作を使う`, await page.evaluate(() => window.__k.app.isTouch));
    const scale = await page.evaluate(() => ({ s: window.__k.app.pipe.scale, w: window.__k.app.pipe.width, h: window.__k.app.pipe.height }));
    check(`${name}：ドットの倍率は 2 以上`, scale.s >= 2, JSON.stringify(scale));
    await page.screenshot({ path: path.join(OUT, `mobile-${name}-title.png`), timeout: 120000 });
    // 「はじめから」をタップ
    const btn = await page.locator('.title .btn').first().boundingBox();
    await page.touchscreen.tap(btn.x + btn.width / 2, btn.y + btn.height / 2);
    await step(3);
    check(`${name}：タップで はじめから`, (await page.evaluate(() => window.__k.state())) === 'card');
    for (let i = 0; i < 20; i++) await step(10);
    // 会話をタップで送る
    for (let i = 0; i < 12 && (await page.evaluate(() => window.__k.state())) === 'dialog'; i++) {
      const d = await page.locator('.dialog').boundingBox();
      await page.touchscreen.tap(d.x + d.width / 2, d.y + d.height / 2);
      await step(2);
    }
    check(`${name}：タップで会話を送る`, (await page.evaluate(() => window.__k.state())) === 'play');
    await step(2);
    check(`${name}：タッチのボタンが出る`, await page.locator('.touch:not(.hidden) .b-jump').isVisible());
    await page.screenshot({ path: path.join(OUT, `mobile-${name}-play.png`), timeout: 120000 });
    const st = await imageStats(page, path.join(OUT, `mobile-${name}-play.png`));
    check(`${name}：画面が真っ黒でない`, st.mean > 0.05, JSON.stringify(st));
    // 左側でスティックを前へ倒す
    const z0 = await page.evaluate(() => window.__k.sim().player.body.z);
    const sx = w * 0.18;
    const sy = h * 0.7;
    await touch('touchStart', [[sx, sy]]);
    await step(1);
    for (let i = 0; i < 6; i++) {
      await touch('touchMove', [[sx, sy - 10 - i * 12]]);
      await step(1);
    }
    for (let i = 0; i < 6; i++) await step(10);
    await page.screenshot({ path: path.join(OUT, `mobile-${name}-stick.png`), timeout: 120000 });
    await touch('touchEnd', []);
    await step(2);
    const z1 = await page.evaluate(() => window.__k.sim().player.body.z);
    check(`${name}：スティックで前へ歩く`, z1 > z0 + 1.5, `z ${z0.toFixed(2)} → ${z1.toFixed(2)}`);
    // 跳ボタン
    const jb = await page.locator('.b-jump').boundingBox();
    await touch('touchStart', [[jb.x + jb.width / 2, jb.y + jb.height / 2]]);
    await step(3);
    const vy = await page.evaluate(() => window.__k.sim().player.body.vy);
    await touch('touchEnd', []);
    check(`${name}：跳ボタンで跳ぶ`, vy > 2, `vy ${vy.toFixed(2)}`);
    await step(30);
    // 右側をなぞって見回す
    const yaw0 = await page.evaluate(() => window.__k.app.cam.yaw);
    await touch('touchStart', [[w * 0.6, h * 0.4]]);
    for (let i = 0; i < 5; i++) {
      await touch('touchMove', [[w * 0.6 + i * 20, h * 0.4]]);
      await step(1);
    }
    await touch('touchEnd', []);
    await step(2);
    const yaw1 = await page.evaluate(() => window.__k.app.cam.yaw);
    check(`${name}：右側をなぞって見回す`, Math.abs(yaw1 - yaw0) > 0.1, `${yaw0.toFixed(2)} → ${yaw1.toFixed(2)}`);
    // ポーズボタン
    const pb = await page.locator('.b-pause').boundingBox();
    await page.touchscreen.tap(pb.x + pb.width / 2, pb.y + pb.height / 2);
    await step(2);
    check(`${name}：≡ でポーズ`, (await page.evaluate(() => window.__k.state())) === 'menu');
    await page.screenshot({ path: path.join(OUT, `mobile-${name}-pause.png`), timeout: 120000 });
    // はみ出し：HUD とボタンが画面の内側にあるか
    const out = await page.evaluate(() => {
      const bad = [];
      for (const e of document.querySelectorAll('.hud-tl, .hud-tr, .tbtn:not(.hidden), .panel')) {
        const r = e.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) bad.push(e.className);
      }
      return bad;
    });
    check(`${name}：画面の外へはみ出す UI が無い`, out.length === 0, out.join(','));
    check(`${name}：エラーが無い`, logs.length === 0, logs.join(' / '));
    await ctx.close();
  }
} catch (e) {
  check('例外', false, e.message);
} finally {
  srv.stop();
  await browser.close();
}
const fails = results.filter((r) => !r).length;
console.log(`${results.length - fails}/${results.length} OK`);
process.exit(fails ? 1 : 0);
