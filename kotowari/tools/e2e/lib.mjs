// 自動検査の共通部品：vite preview を立て、Playwright の Chromium で開く
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const cands = ['playwright', '/opt/node22/lib/node_modules/playwright/index.js'];
  for (const c of cands) {
    try {
      return require(c);
    } catch {
      /* 次へ */
    }
  }
  throw new Error('playwright が見つからない');
}
export const { chromium } = loadPlaywright();

export const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
export const OUT = process.env.OUT ?? path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });

export async function startServer(port = Number(process.env.PORT ?? 4173)) {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  const url = `http://localhost:${port}/`;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return { url, stop: () => proc.kill() };
    } catch {
      /* まだ */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  proc.kill();
  throw new Error('preview が立たない');
}

export async function launch(viewport = { width: 1280, height: 720 }) {
  const exe = fs.existsSync('/opt/pw-browsers/chromium') ? undefined : undefined;
  const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  return { browser, page, logs };
}

/** 画像の統計（真っ黒・真っ白の検出）。PNG を canvas で読む */
export async function imageStats(page, file) {
  const b64 = fs.readFileSync(file).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    let dark = 0;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 4 * 7) {
      const l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
      sum += l;
      if (l < 0.04) dark++;
      colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    }
    const n = d.length / (4 * 7);
    return { mean: sum / n, darkRatio: dark / n, colors: colors.size, w: c.width, h: c.height };
  }, b64);
}
