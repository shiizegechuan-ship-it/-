import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [name, setup] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ locale: 'ja-JP', viewport: { width: 960, height: 540 } });
await p.goto('http://localhost:8080/index.html'); await p.waitForTimeout(700);
const out = await p.evaluate((setup) => {
  const g = window.__game; g.newGame(9); g.modal = null; window.__setManual(true);
  eval(setup);
  const tgt = g.room.boss || g.room.enemies.find((e) => e.kind === 'warden');
  g.player.hp = g.player.maxHp = 1e6;
  let found = []; const shots = [];
  for (let n = 0; n < 60 * 30 && shots.length < 3; n++) {
    if (g.modal) g.modal = null;
    g.player.x = tgt.x + (tgt.face > 0 ? tgt.w + 30 : -60); g.player.iframeT = 9;
    window.__step(1);
    if (tgt.attacks.length && !found.includes(tgt.state)) { found.push(tgt.state); shots.push(tgt.attacks.map((a) => ({ ...a })).map((a) => [a.x, a.y, a.w, a.h])); window.__lastBoxes = shots[shots.length - 1]; window.__lastState = tgt.state; break; }
  }
  const c = document.getElementById('game'), ctx = c.getContext('2d'), k = c.width / 960;
  ctx.setTransform(k, 0, 0, k, 0, 0); ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 2;
  for (const [x, y, w, h] of window.__lastBoxes || []) ctx.strokeRect((x - g.cam.x) * 1.5, (y - g.cam.y) * 1.5, w * 1.5, h * 1.5);
  ctx.strokeStyle = '#ffffff'; ctx.strokeRect((tgt.x - g.cam.x) * 1.5, (tgt.y - g.cam.y) * 1.5, tgt.w * 1.5, tgt.h * 1.5);
  return [window.__lastState, window.__lastBoxes];
}, setup);
await p.screenshot({ path: `/tmp/wedge-dev/shots/${name}.png` });
console.log(name, JSON.stringify(out)); await b.close();
