// 音の検査：曲と効果音をオフラインで書き出し、最大値・強さ・ループの継ぎ目を調べる。WAV を out/audio/ に保存
import fs from 'node:fs';
import path from 'node:path';
import { OUT, launch, startServer } from './lib.mjs';

const SFX = ['swing', 'swing3', 'hit', 'hitHeavy', 'immune', 'jump', 'land', 'dash', 'perfect', 'hurt', 'dead', 'pickup', 'pawn', 'redeem', 'deny', 'telegraph', 'slam', 'ui', 'uiMove', 'bell', 'lantern', 'checkpoint', 'gate', 'float', 'enemyDown', 'fall', 'text'];
const dir = path.join(OUT, 'audio');
fs.mkdirSync(dir, { recursive: true });
const wav = (pcm, rate) => {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
};
const srv = await startServer();
const { browser, page } = await launch({ width: 640, height: 360 });
let bad = 0;
try {
  await page.goto(srv.url);
  await page.waitForFunction(() => window.__audio && window.__k, null, { timeout: 20000 });
  await page.evaluate(() => (window.__k.app.manual = true));
  const songs = await page.evaluate(() => window.__audio.songs());
  for (const [name, loopSec] of Object.entries(songs)) {
    const sec = loopSec * 2 + 1;
    const r = await page.evaluate(([n, s]) => window.__audio.render('song', n, s), [name, sec]);
    const pcm = Buffer.from(r.b64, 'base64');
    fs.writeFileSync(path.join(dir, `bgm-${name}.wav`), wav(pcm, r.rate));
    // 継ぎ目：1 周目の終わり前後 0.2 秒の強さが、全体の平均から大きく外れていないか
    const s16 = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
    const at = Math.round((loopSec + 0.05) * r.rate);
    const win = Math.round(0.2 * r.rate);
    let e = 0;
    for (let i = at - win; i < at + win; i++) e += (s16[i] / 32767) ** 2;
    const seam = Math.sqrt(e / (2 * win));
    const ok = r.peak < 0.9 && r.rms > 0.01;
    if (!ok) bad++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} BGM ${name.padEnd(9)} 1周 ${loopSec.toFixed(1)}s 最大 ${r.peak.toFixed(3)} 平均 ${r.rms.toFixed(3)} 継ぎ目の強さ ${seam.toFixed(3)}`);
  }
  for (const name of SFX) {
    const r = await page.evaluate((n) => window.__audio.render('sfx', n, 2.5), name);
    const pcm = Buffer.from(r.b64, 'base64');
    fs.writeFileSync(path.join(dir, `se-${name}.wav`), wav(pcm, r.rate));
    const ok = r.peak < 0.95 && r.peak > 0.005;
    if (!ok) bad++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} SE  ${name.padEnd(11)} 最大 ${r.peak.toFixed(3)}`);
  }
} finally {
  await browser.close();
  srv.stop();
}
console.log(bad ? `${bad} 件に問題` : 'すべて OK');
process.exit(bad ? 1 : 0);
