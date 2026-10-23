import { App } from './app';
import { renderOffline } from './audio/engine';
import { SONGS } from './audio/songs';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const app = new App(canvas, ui);
(window as unknown as { __k: ReturnType<App['debugApi']> }).__k = app.debugApi();
// 検査用：音の書き出し
(window as unknown as { __audio: unknown }).__audio = {
  songs: () => Object.fromEntries(Object.entries(SONGS).map(([k, v]) => [k, (v.length * 60) / v.bpm / 4])),
  render: async (kind: 'song' | 'sfx', name: string, sec: number) => {
    const r = await renderOffline(kind, name, sec);
    // 16bit に詰めて返す（大きな配列を渡さない）
    const pcm = new Int16Array(r.samples.length);
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(r.samples[i] * 32767)));
    let bin = '';
    const u8 = new Uint8Array(pcm.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return { peak: r.peak, rms: r.rms, rate: r.rate, b64: btoa(bin) };
  },
};
const loop = (t: number) => {
  app.frame(t);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
