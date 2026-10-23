// 実際のキー入力で主な流れを確かめる：node tools/e2e/play.mjs
import path from 'node:path';
import { OUT, launch, startServer } from './lib.mjs';

const srv = await startServer();
const { browser, page, logs } = await launch({ width: 960, height: 540 });
const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok, info });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${info}`);
};
const step = (n) => page.evaluate((n) => window.__k.step(n), n);
const state = () => page.evaluate(() => window.__k.state());
const press = async (key, frames = 2) => {
  await page.keyboard.down(key);
  await step(frames);
  await page.keyboard.up(key);
  await step(1);
};
const hold = async (key, frames) => {
  await page.keyboard.down(key);
  for (let i = 0; i < frames; i += 10) await step(10);
  await page.keyboard.up(key);
  await step(1);
};
try {
  await page.goto(srv.url);
  await page.waitForFunction(() => window.__k, null, { timeout: 20000 });
  await page.evaluate(() => (window.__k.app.manual = true));
  await step(5);
  check('タイトル', (await state()) === 'title');
  await press('Enter');
  check('はじめから → 章題', (await state()) === 'card');
  for (let i = 0; i < 20; i++) await step(10);
  check('章題のあと会話（冒頭）', (await state()) === 'dialog');
  for (let i = 0; i < 12 && (await state()) === 'dialog'; i++) await press('KeyE', 2);
  check('会話を E で送って閉じる', (await state()) === 'play');
  const z0 = await page.evaluate(() => window.__k.sim().player.body.z);
  await hold('KeyW', 40);
  const z1 = await page.evaluate(() => window.__k.sim().player.body.z);
  check('W で前へ歩く', z1 > z0 + 1.5, `z ${z0.toFixed(2)} → ${z1.toFixed(2)}`);
  await page.keyboard.down('Space');
  await step(3);
  const vy = await page.evaluate(() => window.__k.sim().player.body.vy);
  await page.keyboard.up('Space');
  check('Space で跳ぶ', vy > 3, `vy ${vy.toFixed(2)}`);
  await step(60);
  await press('KeyJ', 2);
  const mode = await page.evaluate(() => window.__k.sim().player.mode);
  check('J で払う', mode === 'attack', mode);
  await step(40);
  await press('KeyL', 2);
  const lit = await page.evaluate(() => window.__k.sim().player.lanternOn);
  check('L で灯をともす', lit === true);
  console.log('state before Esc:', await state(), await page.evaluate(() => JSON.stringify(window.__k.sim().player.body)));
  await press('Escape', 2);
  check('Esc でポーズ', (await state()) === 'menu', await state());
  await page.screenshot({ path: path.join(OUT, 'play-pause.png'), timeout: 120000 });
  await press('Escape', 2);
  check('Esc でポーズを閉じる', (await state()) === 'play');
  // 鳥居へ移して質屋を開く
  await page.evaluate(() => {
    const s = window.__k.sim();
    for (const f of ['trig:pro_ditch', 'trig:pro_bell', 'down:pro_m1', 'trig:pro_fan', 'trig:pro_okon']) s.setFlag(f);
    s.player.body.x = 0;
    s.player.body.y = 0.05;
    s.player.body.z = 39;
    window.__k.app.cam.reset(s);
  });
  await step(10);
  await press('KeyE', 2);
  check('E で質屋を開く', (await state()) === 'shop');
  await step(5);
  await page.screenshot({ path: path.join(OUT, 'play-shop.png'), timeout: 120000 });
  await press('Enter', 2); // 1 行目（跳）を選ぶ → 確認
  await step(2);
  await press('Enter', 2); // 既定は「いいえ」
  const still = await page.evaluate(() => window.__k.sim().has('jump'));
  check('確認の既定は「いいえ」（誤って売らない）', still === true && (await state()) === 'shop');
  await press('Enter', 2);
  await press('ArrowLeft', 2);
  await page.screenshot({ path: path.join(OUT, 'play-confirm.png'), timeout: 120000 });
  await press('Enter', 2);
  const sold = await page.evaluate(() => ({ has: window.__k.sim().has('jump'), zeni: window.__k.sim().ledger.zeni }));
  check('はい で跳を質に入れる', sold.has === false && sold.zeni >= 30, JSON.stringify(sold));
  check('理が書き換わる演出（cine）', (await state()) === 'cine');
  await step(30);
  await page.screenshot({ path: path.join(OUT, 'play-mosh.png'), timeout: 120000 });
  for (let i = 0; i < 20 && (await state()) === 'cine'; i++) await step(10);
  check('演出のあと質屋に戻る', (await state()) === 'shop');
  await press('Escape', 2);
  check('Esc で店を出る', (await state()) === 'play');
  await page.keyboard.down('Space');
  await step(3);
  await page.keyboard.up('Space');
  const ev = await page.evaluate(() => window.__k.sim().player.body.vy);
  check('質入れ後は跳べない', ev <= 0.01, `vy ${ev}`);
  const errs = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
  check('コンソールにエラーが無い', errs.length === 0, errs.slice(0, 5).join(' / '));
} catch (e) {
  check('例外', false, e.message);
} finally {
  await browser.close();
  srv.stop();
}
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} OK`);
process.exit(fails.length ? 1 : 0);
