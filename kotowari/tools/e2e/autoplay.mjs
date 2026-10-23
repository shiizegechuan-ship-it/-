// ブラウザで自動プレイ：タイトル → 序章 → 一の章 → つづく。会話・質屋・演出・章の移動をアプリの流れで通す
import path from 'node:path';
import { OUT, launch, startServer } from './lib.mjs';

const srv = await startServer();
const { browser, page, logs } = await launch({ width: 960, height: 540 });
let ok = false;
try {
  await page.goto(srv.url);
  await page.waitForFunction(() => window.__k, null, { timeout: 20000 });
  const ending = process.env.ENDING ?? 'dawn';
  const startCh = process.env.START ?? '';
  await page.evaluate(
    ([ending, startCh]) => {
      window.__k.app.manual = true;
      if (startCh) window.__k.startAt(startCh, { ledger: { zeni: 120, debt: 0, pawned: [] } });
      else window.__k.app.newGame();
      window.__k.auto(1, ending);
    },
    [ending, startCh],
  );
  const t0 = Date.now();
  let last = '';
  for (let i = 0; i < 4000; i++) {
    const st = await page.evaluate(() => {
      window.__k.step(30);
      const s = window.__k.sim();
      return { state: window.__k.state(), ch: s.progress.chapter, z: s.player.body.z.toFixed(1), hp: s.player.hp, zeni: s.ledger.zeni };
    });
    const key = `${st.ch} ${st.state}`;
    if (key !== last) {
      console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${key} z=${st.z} hp=${st.hp} 銭=${st.zeni}`);
      last = key;
    }
    if (st.state === 'end') {
      const endings = await page.evaluate(() => window.__k.endings());
      ok = endings.includes(ending);
      console.log('結末', endings.join(','));
      await page.screenshot({ path: path.join(OUT, `auto-ending-${ending}.png`), timeout: 120000 });
      break;
    }
    if (process.env.SHOTS && i % 20 === 0) await page.screenshot({ path: path.join(OUT, `auto-${String(i).padStart(4, '0')}.png`), timeout: 120000 });
  }
  await page.screenshot({ path: path.join(OUT, 'auto-end.png'), timeout: 120000 });
  console.log((await page.evaluate(() => window.__k.autoLog())).join('\n'));
  const ms = await page.evaluate(() => window.__k.frameMs());
  ms.sort((a, b) => a - b);
  console.log(`描画の時間（SwiftShader）中央値 ${ms[ms.length >> 1].toFixed(2)}ms 最悪 ${ms[ms.length - 1].toFixed(2)}ms`);
  const errs = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
  if (errs.length) {
    ok = false;
    console.log(errs.join('\n'));
  }
} finally {
  await browser.close();
  srv.stop();
}
console.log(ok ? '通しプレイ：結末まで到達' : '通しプレイ：失敗');
process.exit(ok ? 0 : 1);
