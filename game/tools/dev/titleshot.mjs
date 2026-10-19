import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [name, setup = ''] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ locale: 'ja-JP', viewport: { width: 960, height: 540 } });
await p.goto('http://localhost:8080/index.html'); await p.waitForTimeout(900);
await p.evaluate((s) => { const g = window.__game; eval(s); }, setup); await p.waitForTimeout(500);
await p.screenshot({ path: `/tmp/wedge-dev/shots/${name}.png` }); await b.close();
