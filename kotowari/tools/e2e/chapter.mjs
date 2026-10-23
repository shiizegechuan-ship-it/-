// 章のスクリーンショット：node tools/e2e/chapter.mjs ch2 [x,y,z,yaw]... 各地点で撮る。PAWN=fan で質入れしてから
import path from 'node:path';
import { OUT, launch, startServer } from './lib.mjs';

const [ch, ...spots] = process.argv.slice(2);
const srv = await startServer();
const { browser, page, logs } = await launch({ width: 960, height: 540 });
try {
  await page.goto(srv.url);
  await page.waitForFunction(() => window.__k, null, { timeout: 20000 });
  await page.evaluate(
    ([ch, pawn]) => {
      const k = window.__k;
      k.app.manual = true;
      k.startAt(ch, {});
      k.skipCard();
      const s = k.sim();
      // 会話のきっかけを全部済みにする（景色だけ見る）
      for (const t of s.level.triggers) s.setFlag('trig:' + t.id);
      for (const id of pawn ? pawn.split(',') : []) s.doPawn(id);
      k.step(5);
    },
    [ch, process.env.PAWN ?? ''],
  );
  let i = 0;
  for (const spot of spots) {
    const [x, y, z, yaw] = spot.split(',').map(Number);
    await page.evaluate(
      ([x, y, z, yaw]) => {
        const k = window.__k;
        const s = k.sim();
        s.player.body.x = x;
        s.player.body.y = y;
        s.player.body.z = z;
        s.player.yaw = yaw ?? 0;
        k.app.cam.reset(s);
        k.app.cam.yaw = yaw ?? 0;
      },
      [x, y, z, yaw],
    );
    for (let j = 0; j < 4; j++) await page.evaluate(() => window.__k.step(15));
    await page.screenshot({ path: path.join(OUT, `${ch}-${++i}.png`), timeout: 120000 });
    console.log('shot', ch, i, spot, await page.evaluate(() => window.__k.state()));
  }
  console.log(logs.filter((l) => l.includes('error')).join('\n') || 'エラーなし');
} finally {
  await browser.close();
  srv.stop();
}
