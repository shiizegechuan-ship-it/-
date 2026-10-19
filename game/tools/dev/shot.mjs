// 使い方: node shot.mjs <名前> '<ページ内で実行する式>' [待つms] [幅] [高さ]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [name, expr, wait = '600', w = '960', h = '540'] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ locale: 'ja-JP', viewport: { width: +w, height: +h } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:8080/index.html'); await p.waitForTimeout(700);
await p.evaluate(() => { const g = window.__game; g.newGame(9); g.modal = null; });
await p.waitForTimeout(200);
const out = await p.evaluate(expr);
await p.waitForTimeout(+wait);
await p.screenshot({ path: `/tmp/wedge-dev/shots/${name}.png` });
console.log(name, JSON.stringify(out), errs);
await b.close();
