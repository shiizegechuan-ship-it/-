// BGM の演奏（WebAudio）。ビット音：4 ビットの波形表（主旋律の「リード」・副旋律の「うつろ」）、
// 矩形波（デューティ比 25%・37.5%）、8 段の粗い三角波、LFSR のノイズ。高すぎる音はローパス（ハイカット）で落とす。
// 音量は 4 ビット（16 段）の階段状、ビブラートは 1 コマ（1/60 秒）ごとの階段状の揺れ。
// エコーは主旋律を少し遅らせ小さくした写し（声部には数えない）。
import { buildSong } from './songs.js';

const FRAME = 1 / 60;
// 音量の形（16 段の値をコマごとに。最後の値を保つ）
const ENV = {
  lead: [13, 12, 11, 10, 10, 9],
  counter: [10, 9, 9, 8, 8, 7],
  chord: [12, 11, 10, 9, 9, 8, 8, 7],
  bass: [15],
  k: [15, 13, 10, 7, 4, 2, 0],
  s: [14, 12, 10, 8, 6, 5, 4, 3, 2, 1, 0],
  h: [8, 5, 3, 1, 0],
  o: [8, 7, 6, 6, 5, 4, 3, 2, 2, 1, 0],
};
// 声部ごとの音量のつり合い
const MIX = { lead: 0.15, counter: 0.1, bass: 0.2, chord: 0.075, drum: 0.15, echo: 0.3 };
// ノイズの細かさ（1 秒あたりの切り替わり）と、短い周期（金属的な音）かどうか
const NOISE = { k: [1800, false], s: [11000, false], h: [42000, true], o: [42000, true] };
const VIB = [0, 1, 2, 1, 0, -1, -2, -1]; // 1 コマごとの音程のずれ（段）
const VIB_STEP = 0.0045; // 1 段あたり（約 8 セント）
export const HICUT = 4200; // BGM のハイカット（Hz）
// 先読みの長さ。描画（requestAnimationFrame）が長押しなどで一瞬止まっても、曲が途切れないように長めにとり、
// 描画とは別のタイマーからも予約する
export const LOOKAHEAD = 0.6;

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.cur = null;
    this.level = 0.5;
    this.quiet = false;
    this.songs = {};
  }
  get ctx() { return this.sfx.ctx; }
  setLevel(v) { this.level = v; this.applyGain(); }
  target() { return this.level * (this.quiet ? 0.45 : 1); }
  applyGain() { if (this.cur && this.ctx) this.cur.gain.gain.setTargetAtTime(this.target(), this.ctx.currentTime, 0.08); }

  // 毎コマ呼ぶ：want は流したい曲の名前（null で止める）
  update(want, { quiet = false } = {}) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    if (!this.waves) this.init();
    if (!this.timer && typeof setInterval === 'function') { this.timer = setInterval(() => { if (this.cur && this.ctx.state === 'running') this.schedule(); }, 100); if (this.timer.unref) this.timer.unref(); }
    if (quiet !== this.quiet) { this.quiet = quiet; this.applyGain(); }
    if ((this.cur ? this.cur.id : null) !== want) { this.stop(); if (want) this.start(want); }
    if (this.cur) this.schedule();
  }

  // 音色の素：矩形波と 4 ビットの三角波（倍音の形）、LFSR のノイズ
  init() {
    const c = this.ctx;
    const fromTable = (tab) => {
      const N = tab.length, H = N / 2, re = new Float32Array(H), im = new Float32Array(H);
      for (let n = 1; n < H; n++) for (let k = 0; k < N; k++) { const a = (2 * Math.PI * n * k) / N; re[n] += (2 / N) * tab[k] * Math.cos(a); im[n] += (2 / N) * tab[k] * Math.sin(a); }
      return c.createPeriodicWave(re, im);
    };
    const pulse = (d) => fromTable(Array.from({ length: 64 }, (_, k) => (k < 64 * d ? 1 : -1)));
    const bit4 = (f) => Array.from({ length: 32 }, (_, k) => Math.round(f(k / 32) * 15) / 7.5 - 1); // 0..1 の形を 16 段に
    this.waves = {
      0.25: pulse(0.25), 0.375: pulse(0.375), 0.5: pulse(0.5),
      // リード：矩形と下り坂を混ぜた形（角のある、少しかすれた音）
      reed: fromTable(bit4((x) => 0.55 * (x < 0.375 ? 1 : 0) + 0.45 * (1 - x))),
      // うつろ：丸い波に 1 オクターブ上を少し混ぜた形（笛のような、こもった音）
      hollow: fromTable(bit4((x) => 0.5 + 0.35 * Math.sin(2 * Math.PI * x) + 0.15 * Math.sin(4 * Math.PI * x))),
      // 三角波は 8 段に粗く（ざらついた低音）
      triangle: fromTable(Array.from({ length: 32 }, (_, k) => Math.round((k < 16 ? 15 - k : k - 16) / 2) / 3.75 - 1)),
    };
    // ハイカット：BGM 全体を通してから出す
    this.hicut = c.createBiquadFilter();
    this.hicut.type = 'lowpass'; this.hicut.frequency.value = HICUT; this.hicut.Q.value = 0.5;
    this.hicut.connect(this.sfx.master);
    this.noise = {};
    for (const [hit, [rate, short]] of Object.entries(NOISE)) {
      const len = c.sampleRate, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      let reg = 1, v = 1, acc = 0;
      for (let i = 0; i < len; i++) {
        acc += rate / c.sampleRate;
        while (acc >= 1) { acc -= 1; const bit = (reg ^ (reg >> (short ? 6 : 1))) & 1; reg = (reg >> 1) | (bit << 14); v = reg & 1 ? -1 : 1; }
        d[i] = v;
      }
      this.noise[hit] = buf;
    }
  }

  start(id) {
    const c = this.ctx;
    const song = (this.songs[id] ||= buildSong(id));
    // 小節の頭ごとに、始まる音をまとめておく
    if (!song.byStep) {
      song.byStep = Array.from({ length: song.steps }, () => []);
      song.tracks.forEach((tr) => tr.notes.forEach((n) => song.byStep[n.s].push({ tr, n })));
    }
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(this.target(), c.currentTime + 0.4);
    gain.connect(this.hicut);
    this.cur = { id, song, gain, step: 0, t: c.currentTime + 0.08, sd: 60 / song.bpm / 4 };
  }
  stop() {
    if (!this.cur) return;
    const c = this.ctx, g = this.cur.gain;
    g.gain.cancelScheduledValues(c.currentTime);
    g.gain.setValueAtTime(g.gain.value, c.currentTime);
    g.gain.linearRampToValueAtTime(0, c.currentTime + 0.5);
    setTimeout(() => g.disconnect(), 900);
    this.cur = null;
  }
  // 少し先（LOOKAHEAD 秒）までの音を予約する。タブを離れて遅れたら、今から鳴らし直す
  schedule() {
    const cur = this.cur, now = this.ctx.currentTime;
    if (cur.t < now - 0.1) cur.t = now + 0.05;
    while (cur.t < now + LOOKAHEAD) {
      for (const { tr, n } of cur.song.byStep[cur.step % cur.song.steps]) this.play(tr, n, cur.t, n.len * cur.sd, cur);
      cur.step++; cur.t += cur.sd;
    }
  }

  play(tr, n, t, dur, cur) {
    const c = this.ctx;
    if (tr.wave === 'noise') {
      const src = c.createBufferSource(); src.buffer = this.noise[n.hit]; src.loop = true;
      const g = c.createGain();
      this.env(g.gain, t, dur, ENV[n.hit], MIX.drum);
      src.connect(g); g.connect(cur.gain);
      src.start(t, (cur.step * 0.137) % 0.5); // 打つたびに少し違う所から（ゲームの乱数は使わない）
      src.stop(t + dur); // ループする音源なので、止めないと鳴らないまま溜まり続ける
      src.part = 'drum';
      return src;
    }
    const part = tr.part;
    const o = this.tone(tr, n.m, t, dur, ENV[part], MIX[part], cur, part === 'lead' || part === 'counter');
    // エコー：主旋律の写しを、遅らせて小さく（声部に数えない）
    if (part === 'lead' && cur.song.echo) {
      const e = this.tone(tr, n.m, t + cur.song.echo * cur.sd, Math.min(dur, 4 * cur.sd), ENV.lead, MIX.lead * MIX.echo, cur, false);
      e.part = 'echo';
    }
    return o;
  }
  tone(tr, m, t, dur, env, mix, cur, vib) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.setPeriodicWave(this.waves[tr.wave === 'pulse' ? tr.duty || 0.5 : tr.wave]);
    const f = hz(m);
    o.frequency.setValueAtTime(f, t);
    // 長い音だけ、少し置いてから階段状に揺らす
    if (vib && dur > 0.3) for (let i = 0, t0 = t + 0.18; t0 + i * FRAME < t + dur; i++) o.frequency.setValueAtTime(f * (1 + VIB[i % VIB.length] * VIB_STEP), t0 + i * FRAME);
    const play = tr.wave === 'triangle' ? dur * 0.9 : dur * 0.92; // 音の切れ目を少しだけ空ける
    this.env(g.gain, t, play, env, mix);
    o.connect(g); g.connect(cur.gain);
    o.start(t); o.stop(t + dur);
    o.part = tr.part;
    return o;
  }
  // 4 ビットの音量を、コマごとに階段状に
  env(param, t, dur, levels, mix) {
    param.setValueAtTime(0, t);
    for (let i = 0; i < levels.length && i * FRAME < dur; i++) param.setValueAtTime((levels[i] / 15) * mix, t + i * FRAME);
    param.setValueAtTime(0, t + dur);
  }
}
