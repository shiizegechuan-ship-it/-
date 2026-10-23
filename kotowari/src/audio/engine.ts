import { SONGS, type Song } from './songs';

export type Sfx =
  | 'swing'
  | 'swing3'
  | 'hit'
  | 'hitHeavy'
  | 'immune'
  | 'jump'
  | 'land'
  | 'dash'
  | 'perfect'
  | 'hurt'
  | 'dead'
  | 'pickup'
  | 'pawn'
  | 'redeem'
  | 'deny'
  | 'telegraph'
  | 'slam'
  | 'ui'
  | 'uiMove'
  | 'bell'
  | 'lantern'
  | 'checkpoint'
  | 'gate'
  | 'float'
  | 'enemyDown'
  | 'fall'
  | 'text';

/** 効果音ごとの音量の補正（書き出して最大値をそろえた値。tools/e2e/audio.mjs） */
const SFX_GAIN: Partial<Record<Sfx, number>> = {
  swing: 3.2,
  swing3: 2.2,
  hit: 2.0,
  immune: 2.5,
  jump: 2.0,
  land: 5,
  dash: 3.5,
  telegraph: 7,
  ui: 3,
  uiMove: 3.5,
  lantern: 3.5,
  fall: 2.5,
  text: 5,
  deny: 2,
  enemyDown: 1.8,
  hurt: 2.2,
  pickup: 1.6,
  bell: 0.8,
};

/** 都節音階（D Eb G A Bb）の度数 → 半音 */
const MIYAKO = [0, 1, 5, 7, 8];
export const degreeToSemis = (deg: number): number => {
  const o = Math.floor(deg / 5);
  const i = ((deg % 5) + 5) % 5;
  return o * 12 + MIYAKO[i];
};
const ROOT = 293.66; // D4
export const freqOf = (deg: number, oct = 0): number => ROOT * Math.pow(2, (degreeToSemis(deg) + oct * 12) / 12);

/** 音。最初のユーザー操作まで AudioContext を作らない（ブラウザの決まり） */
export class AudioEngine {
  ctx: BaseAudioContext | null = null;
  private master!: GainNode;
  private bgmGain!: GainNode;
  private seGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private vol = { master: 0.8, bgm: 0.7, se: 0.8 };
  private lastPlay = new Map<string, number>();
  private active = new Map<string, number>();
  private song: Song | null = null;
  private songName = '';
  private nextStep = 0;
  private step = 0;
  private schedTimer = 0;
  private bgmDuck = 1;
  /** テスト・検査用：鳴らした効果音の記録 */
  readonly log: { name: string; t: number }[] = [];

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && this.ctx instanceof AudioContext) void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.init(new AC());
    if (this.songName) {
      const n = this.songName;
      this.songName = '';
      this.playSong(n);
    }
  }

  private init(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.bgmGain = ctx.createGain();
    this.seGain = ctx.createGain();
    // 耳に痛い高音を落とす
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 9000;
    this.bgmGain.connect(this.master);
    this.seGain.connect(this.master);
    this.master.connect(lp).connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 1.5;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (s / 0x7fffffff) * 2 - 1;
    }
    this.applyVolumes();
  }

  setVolumes(master: number, bgm: number, se: number): void {
    this.vol = { master: master / 10, bgm: bgm / 10, se: se / 10 };
    this.applyVolumes();
  }
  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master * 0.9, t, 0.02);
    this.bgmGain.gain.setTargetAtTime(this.vol.bgm * 0.55 * this.bgmDuck, t, 0.05);
    this.seGain.gain.setTargetAtTime(this.vol.se, t, 0.02);
  }
  /** 会話や演出の間、音楽を少し下げる */
  duck(on: boolean): void {
    this.bgmDuck = on ? 0.55 : 1;
    this.applyVolumes();
  }

  // ───────────── 音源
  private env(g: GainNode, t: number, a: number, peak: number, d: number, sustain = 0, r = 0.05): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
    if (sustain) g.gain.setTargetAtTime(0.0001, t + a + d, r);
  }
  private osc(type: OscillatorType, f: number, t: number, dur: number, out: AudioNode, gain: number, a = 0.005, slideTo?: number): OscillatorNode {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    this.env(g, t, a, gain, dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + a + dur + 0.05);
    return o;
  }
  private noise(t: number, dur: number, out: AudioNode, gain: number, type: BiquadFilterType, freq: number, q = 1, freqTo?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, 0.004, gain, dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }
  /** 箏（はじく弦）：減衰の速い三角波＋倍音 */
  koto(f: number, t: number, out: AudioNode, gain = 0.22, dur = 1.6): void {
    this.osc('triangle', f, t, dur, out, gain, 0.002);
    this.osc('sine', f * 2, t, dur * 0.4, out, gain * 0.35, 0.002);
    this.osc('square', f * 3, t, 0.05, out, gain * 0.06, 0.001);
    this.noise(t, 0.03, out, gain * 0.3, 'bandpass', f * 4, 3);
  }
  /** 尺八：息の音＋ゆれる正弦波 */
  shaku(f: number, t: number, dur: number, out: AudioNode, gain = 0.12): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 0.97, t);
    o.frequency.linearRampToValueAtTime(f, t + 0.12);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * 0.012, t + dur * 0.6);
    lfo.connect(lg).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.09);
    g.gain.setValueAtTime(gain, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
    this.noise(t, Math.min(0.25, dur), out, gain * 0.45, 'bandpass', f * 2, 2);
  }
  /** 太鼓 */
  taiko(t: number, out: AudioNode, gain = 0.5, big = true): void {
    this.osc('sine', big ? 110 : 190, t, big ? 0.45 : 0.18, out, gain, 0.002, big ? 48 : 120);
    this.noise(t, big ? 0.12 : 0.06, out, gain * 0.5, 'lowpass', big ? 900 : 2200);
  }
  /** 鈴・鉦 */
  bellTone(f: number, t: number, out: AudioNode, gain = 0.12, dur = 1.2): void {
    for (const [m, g] of [
      [1, 1],
      [2.76, 0.5],
      [5.4, 0.25],
      [8.9, 0.12],
    ] as [number, number][])
      this.osc('sine', f * m, t, dur / Math.sqrt(m), out, gain * g, 0.001);
  }

  // ───────────── 効果音
  sfx(name: Sfx, opts: { pitch?: number } = {}): void {
    this.log.push({ name, t: performance.now() });
    if (this.log.length > 400) this.log.shift();
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    // 同じ音は 30ms 以内に重ねない・同時に 5 つまで
    const last = this.lastPlay.get(name) ?? -1;
    if (now - last < 0.03) return;
    const act = this.active.get(name) ?? 0;
    if (act >= 5) return;
    this.lastPlay.set(name, now);
    this.active.set(name, act + 1);
    window.setTimeout(() => this.active.set(name, Math.max(0, (this.active.get(name) ?? 1) - 1)), 400);
    let o: AudioNode = this.seGain;
    const gm = SFX_GAIN[name];
    if (gm) {
      const g = ctx.createGain();
      g.gain.value = gm;
      g.connect(this.seGain);
      o = g;
    }
    const t = now + 0.001;
    const p = opts.pitch ?? 1;
    switch (name) {
      case 'swing':
        this.noise(t, 0.11, o, 0.35, 'bandpass', 1800 * p, 1.2, 600);
        break;
      case 'swing3':
        this.noise(t, 0.2, o, 0.45, 'bandpass', 2400, 1, 400);
        this.osc('triangle', 520, t, 0.15, o, 0.08, 0.002, 260);
        break;
      case 'hit':
        this.noise(t, 0.08, o, 0.5, 'lowpass', 3000);
        this.osc('square', 180 * p, t, 0.07, o, 0.18, 0.001, 70);
        this.bellTone(1320 * p, t, o, 0.05, 0.25);
        break;
      case 'hitHeavy':
        this.taiko(t, o, 0.6, false);
        this.noise(t, 0.16, o, 0.55, 'lowpass', 2000);
        this.bellTone(990, t, o, 0.08, 0.5);
        break;
      case 'immune':
        this.bellTone(1700, t, o, 0.12, 0.3);
        this.osc('square', 900, t, 0.05, o, 0.06, 0.001);
        break;
      case 'jump':
        this.osc('triangle', 300, t, 0.1, o, 0.1, 0.003, 600);
        this.noise(t, 0.06, o, 0.12, 'highpass', 3000);
        break;
      case 'land':
        this.noise(t, 0.07, o, 0.18, 'lowpass', 600);
        break;
      case 'dash':
        this.noise(t, 0.2, o, 0.35, 'bandpass', 900, 0.8, 3200);
        break;
      case 'perfect':
        this.bellTone(freqOf(9), t, o, 0.18, 1.6);
        this.bellTone(freqOf(12), t + 0.08, o, 0.12, 1.6);
        this.noise(t, 0.5, o, 0.2, 'highpass', 5000);
        break;
      case 'hurt':
        this.osc('sawtooth', 220, t, 0.18, o, 0.18, 0.002, 90);
        this.noise(t, 0.12, o, 0.3, 'lowpass', 1500);
        break;
      case 'dead':
        this.osc('triangle', freqOf(4), t, 1.2, o, 0.2, 0.01, freqOf(-3));
        this.bellTone(freqOf(0, -1), t + 0.2, o, 0.15, 2.5);
        break;
      case 'pickup':
        this.bellTone(freqOf(10) * p, t, o, 0.1, 0.4);
        this.bellTone(freqOf(12) * p, t + 0.05, o, 0.08, 0.4);
        break;
      case 'pawn':
        // 引き出しが閉まる音＋低い鉦（理が変わる）
        this.noise(t, 0.08, o, 0.4, 'lowpass', 900);
        this.bellTone(freqOf(0, -1), t + 0.05, o, 0.22, 2.4);
        this.bellTone(freqOf(3, -1), t + 0.05, o, 0.12, 2.4);
        this.osc('sine', 70, t, 1.4, o, 0.25, 0.05, 40);
        break;
      case 'redeem':
        for (let i = 0; i < 4; i++) this.bellTone(freqOf(5 + i * 2), t + i * 0.06, o, 0.08, 0.5);
        break;
      case 'deny':
        this.osc('square', 160, t, 0.08, o, 0.08, 0.001);
        this.osc('square', 130, t + 0.09, 0.1, o, 0.08, 0.001);
        break;
      case 'telegraph':
        this.osc('sine', 1400, t, 0.12, o, 0.07, 0.002, 2000);
        break;
      case 'slam':
        this.taiko(t, o, 0.7, true);
        this.noise(t, 0.3, o, 0.4, 'lowpass', 400);
        break;
      case 'ui':
        this.koto(freqOf(7), t, o, 0.12, 0.5);
        break;
      case 'uiMove':
        this.osc('triangle', freqOf(5), t, 0.04, o, 0.05, 0.001);
        break;
      case 'bell':
        this.bellTone(freqOf(0, -2) * 1.5, t, o, 0.35, 6);
        this.osc('sine', 55, t, 5, o, 0.25, 0.02);
        break;
      case 'lantern':
        this.noise(t, 0.15, o, 0.15, 'bandpass', 2500, 2);
        this.osc('sine', 880, t + 0.03, 0.2, o, 0.04, 0.01);
        break;
      case 'checkpoint':
        this.bellTone(freqOf(7), t, o, 0.12, 1.2);
        this.bellTone(freqOf(9), t + 0.12, o, 0.1, 1.2);
        break;
      case 'gate':
        this.noise(t, 0.9, o, 0.25, 'lowpass', 400, 1, 150);
        this.taiko(t + 0.7, o, 0.4, true);
        break;
      case 'float':
        this.osc('sine', 120, t, 2.0, o, 0.18, 0.4, 240);
        this.noise(t, 1.5, o, 0.12, 'lowpass', 300, 1, 1200);
        break;
      case 'enemyDown':
        this.noise(t, 0.4, o, 0.25, 'bandpass', 1200, 1, 200);
        this.bellTone(freqOf(2), t + 0.05, o, 0.06, 0.8);
        break;
      case 'fall':
        this.osc('sine', 600, t, 0.5, o, 0.12, 0.01, 120);
        break;
      case 'text':
        this.osc('triangle', 900 + Math.random() * 60, t, 0.025, o, 0.025, 0.001);
        break;
    }
  }

  // ───────────── 音楽
  playSong(name: string): void {
    if (name === this.songName) return;
    this.songName = name;
    this.song = SONGS[name] ?? null;
    if (!this.ctx) return;
    this.step = 0;
    this.nextStep = this.ctx.currentTime + 0.12;
    if (!this.schedTimer) this.schedTimer = window.setInterval(() => this.schedule(), 50);
  }
  stopSong(): void {
    this.songName = '';
    this.song = null;
  }
  get currentSong(): string {
    return this.songName;
  }

  /** 先読み 0.25 秒で次の拍を予約（ループの継ぎ目が出ない） */
  private schedule(until?: number): void {
    const ctx = this.ctx;
    const song = this.song;
    if (!ctx || !song) return;
    const spb = 60 / song.bpm / 4; // 16 分
    const limit = until ?? ctx.currentTime + 0.25;
    while (this.nextStep < limit) {
      const i = this.step % song.length;
      for (const tr of song.tracks) {
        for (const n of tr.notes) {
          if (n[0] !== i) continue;
          const [, deg, len, vel = 1] = n;
          const t = this.nextStep;
          const dur = len * spb;
          switch (tr.inst) {
            case 'koto':
              this.koto(freqOf(deg, tr.oct ?? 0), t, this.bgmGain, 0.16 * vel * (tr.gain ?? 1), Math.max(0.6, dur * 2));
              break;
            case 'shaku':
              this.shaku(freqOf(deg, tr.oct ?? 0), t, dur, this.bgmGain, 0.1 * vel * (tr.gain ?? 1));
              break;
            case 'taiko':
              this.taiko(t, this.bgmGain, 0.32 * vel * (tr.gain ?? 1), deg === 0);
              break;
            case 'kane':
              this.bellTone(freqOf(deg, tr.oct ?? 1), t, this.bgmGain, 0.05 * vel * (tr.gain ?? 1), 0.6);
              break;
            case 'drone':
              this.osc('sine', freqOf(deg, tr.oct ?? -1), t, dur, this.bgmGain, 0.06 * vel * (tr.gain ?? 1), 0.6);
              this.osc('triangle', freqOf(deg, (tr.oct ?? -1) + 1) * 1.003, t, dur, this.bgmGain, 0.02 * vel * (tr.gain ?? 1), 0.8);
              break;
          }
        }
      }
      this.nextStep += spb;
      this.step++;
    }
  }
}

/** 検査用：曲または効果音をオフラインで書き出し、最大値・平均の強さを返す */
export async function renderOffline(kind: 'song' | 'sfx', name: string, seconds: number): Promise<{ peak: number; rms: number; samples: Float32Array; rate: number }> {
  const rate = 22050;
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
  const eng = new AudioEngine();
  (eng as unknown as { init(c: BaseAudioContext): void }).init(ctx);
  eng.setVolumes(10, 10, 10);
  if (kind === 'song') {
    const e = eng as unknown as { song: Song | null; songName: string; nextStep: number; step: number; schedule(u: number): void };
    e.song = SONGS[name];
    e.songName = name;
    e.nextStep = 0.05;
    e.step = 0;
    e.schedule(seconds - 0.1);
  } else eng.sfx(name as Sfx);
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0);
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    const v = Math.abs(d[i]);
    if (v > peak) peak = v;
    sum += d[i] * d[i];
  }
  return { peak, rms: Math.sqrt(sum / d.length), samples: d, rate };
}
