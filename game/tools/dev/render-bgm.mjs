// 各曲を 1 周ぶん、ブラウザの中でオフライン演奏して WAV に書き出す
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const SP = process.argv[2];
const b = await chromium.launch(); const p = await b.newPage({ locale: 'ja-JP' });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:8080/index.html'); await p.waitForTimeout(800);
for (const id of ['market', 'gears', 'belfry', 'bellfight', 'boss', 'final', 'calm', 'title']) {
  const res = await p.evaluate(async (id) => {
    const { Music } = await import('/src/music.js');
    const { buildSong } = await import('/src/songs.js');
    const song = buildSong(id), loop = song.steps * 60 / song.bpm / 4, sec = Math.ceil(loop + 1.5), rate = 44100;
    const off = new OfflineAudioContext(1, rate * sec, rate);
    let now = 0;
    const ctx = new Proxy(off, { get: (t, k) => (k === 'currentTime' ? now : k === 'state' ? 'running' : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
    const master = off.createGain(); master.gain.value = 0.6; master.connect(off.destination);
    const m = new Music({ ctx, master });
    for (now = 0; now < sec - 0.3; now += 1 / 60) m.update(id);
    const buf = await off.startRendering();
    const d = buf.getChannelData(0);
    let peak = 0, sum = 0; for (const v of d) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
    // 16 ビットの WAV
    const n = d.length, out = new DataView(new ArrayBuffer(44 + n * 2));
    const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
    out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
    const bytes = new Uint8Array(out.buffer); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { b64: btoa(s), peak, rms: Math.sqrt(sum / n), sec, name: song.name };
  }, id);
  writeFileSync(`${SP}/bgm/${id}.wav`, Buffer.from(res.b64, 'base64'));
  console.log(id, res.name, `${res.sec}s`, 'peak', res.peak.toFixed(2), 'rms', res.rms.toFixed(3));
}
console.log('errors', errs); await b.close();
