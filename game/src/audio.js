// 効果音はすべて WebAudio で合成する（仮素材。外部ファイル不要）。
export class NullSfx { play() {} setVolume() {} unlock() {} }

export class Sfx {
  constructor() {
    this.ctx = null;
    this.vol = 0.6;
    this.last = {};
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.vol;
    this.master.connect(this.ctx.destination);
    // ノイズ素材
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }

  tone(type, f0, f1, dur, gain = 0.3, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noiseHit(dur, freq, gain = 0.3, q = 1, type = 'bandpass', freqEnd = null, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.02);
  }
  bell(f, dur = 1.2, gain = 0.25, delay = 0) {
    for (const [m, a] of [[1, 1], [2.76, 0.4], [5.4, 0.2], [0.5, 0.3]]) this.tone('sine', f * m, f * m, dur * (m > 1 ? 0.6 : 1), gain * a, delay);
  }

  play(name) {
    if (!this.ctx) return;
    // 同じ音の連打を間引く
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.03) return;
    this.last[name] = now;
    switch (name) {
      case 'jump': this.tone('square', 220, 420, 0.09, 0.08); break;
      case 'airJump': this.tone('square', 330, 660, 0.08, 0.07); this.tone('triangle', 990, 1320, 0.1, 0.06, 0.03); break;
      case 'land': this.noiseHit(0.06, 400, 0.12, 0.8, 'lowpass'); break;
      case 'dodge': this.noiseHit(0.18, 2400, 0.16, 0.7, 'bandpass', 500); break;
      case 'swing': this.noiseHit(0.08, 3000, 0.12, 1.2, 'bandpass', 1200); break;
      case 'heavySwing': this.noiseHit(0.16, 1600, 0.2, 1, 'bandpass', 300); break;
      case 'hit': this.noiseHit(0.08, 1800, 0.3, 0.9); this.tone('sine', 160, 60, 0.1, 0.35); break;
      case 'heavyHit': this.noiseHit(0.16, 900, 0.4, 0.7); this.tone('sine', 120, 40, 0.22, 0.5); break;
      case 'block': this.tone('square', 1300, 900, 0.07, 0.12); this.noiseHit(0.05, 5000, 0.15, 2); break;
      case 'guardBreak': this.tone('sawtooth', 300, 80, 0.3, 0.2); this.noiseHit(0.25, 1200, 0.3, 0.6); break;
      case 'kill': this.tone('triangle', 520, 130, 0.25, 0.25); this.noiseHit(0.2, 700, 0.25, 0.5); break;
      case 'hurt': this.tone('sawtooth', 300, 90, 0.2, 0.25); this.noiseHit(0.12, 600, 0.3, 0.6); break;
      case 'perfect': this.bell(1320, 0.6, 0.18); break;
      case 'charged': this.tone('triangle', 660, 990, 0.12, 0.15); break;
      case 'tell': this.tone('square', 1760, 1760, 0.04, 0.06); break;
      case 'tellBig': this.tone('square', 880, 880, 0.06, 0.1); this.tone('square', 1320, 1320, 0.06, 0.08, 0.07); break;
      case 'shoot': this.tone('square', 700, 300, 0.08, 0.08); break;
      case 'skill': this.tone('sine', 900, 200, 0.6, 0.25); this.bell(440, 1.0, 0.15); break;
      case 'pickup': [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.14, i * 0.06)); break;
      case 'heal': [392, 523, 659].forEach((f, i) => this.tone('sine', f, f, 0.25, 0.15, i * 0.08)); break;
      case 'door': this.tone('triangle', 196, 294, 0.25, 0.15); break;
      case 'wedge': this.noiseHit(0.08, 4000, 0.3, 3); this.tone('square', 220, 110, 0.12, 0.2); this.bell(660, 1.6, 0.22, 0.05); break;
      case 'rewind': this.tone('sawtooth', 120, 900, 1.2, 0.12); this.noiseHit(1.2, 300, 0.12, 0.5, 'bandpass', 3000); break;
      case 'bossBell': this.bell(196, 3.2, 0.4); this.bell(98, 3.2, 0.25, 0.02); break;
      case 'timeStop': this.tone('sine', 400, 60, 0.8, 0.3); break;
      case 'timeResume': this.tone('sine', 60, 500, 0.25, 0.3); break;
      case 'knowledge': this.bell(990, 0.8, 0.14); this.bell(1485, 0.8, 0.1, 0.1); break;
      case 'select': this.tone('square', 660, 660, 0.03, 0.06); break;
      case 'confirm': this.tone('triangle', 523, 784, 0.1, 0.12); break;
      case 'deny': this.tone('square', 200, 150, 0.12, 0.1); break;
      case 'tick': this.tone('square', 2400, 2400, 0.015, 0.05); break;
    }
  }
}
