// 見た目の演出データ。シミュレーションとは独立（描画だけが読む）。
export class Fx {
  constructor() {
    this.parts = [];
    this.texts = [];
    this.ghosts = [];
    this.slashes = [];
    this.rings = [];
    this.impacts = [];
    this.shakeT = 0; this.shakeMag = 0;
    this.flash = 0; this.flashColor = '#fff';
    this.vignette = 0; // 被弾時の赤
    this.banner = null; // 画面中央の大きな文字
    this.rand = Math.random;
    this.settings = { shake: true };
  }
  shake(mag, t = 0.18) {
    if (!this.settings.shake) return;
    if (mag >= this.shakeMag || this.shakeT <= 0) { this.shakeMag = mag; this.shakeT = t; }
  }
  screenFlash(color, a = 0.5) { this.flash = a; this.flashColor = color; }
  sparks(x, y, color, n = 8, speed = 260, dir = 0) {
    for (let i = 0; i < n; i++) {
      const ang = dir ? Math.atan2(0, dir) + (this.rand() - 0.5) * 1.6 : this.rand() * Math.PI * 2;
      const s = speed * (0.4 + this.rand() * 0.8);
      this.parts.push({ x, y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s - 60, life: 0.25 + this.rand() * 0.2, t: 0, color, size: 2 + this.rand() * 2, g: 600 });
    }
  }
  dust(x, y, n = 4) {
    for (let i = 0; i < n; i++) {
      this.parts.push({ x: x + (this.rand() - 0.5) * 12, y, vx: (this.rand() - 0.5) * 120, vy: -this.rand() * 60, life: 0.35, t: 0, color: 'rgba(200,190,170,0.6)', size: 3 + this.rand() * 2, g: 0 });
    }
  }
  burst(x, y, color, n = 18) { this.sparks(x, y, color, n, 340); this.ring(x, y, color, 40); }
  impact(x, y, color = '#ffffff', size = 6) { this.impacts.push({ x, y, color, size, t: 0, life: 0.14 }); }
  ring(x, y, color, r = 30, life = 0.3) { this.rings.push({ x, y, color, r, life, t: 0 }); }
  text(x, y, str, color = '#fff', size = 14) { this.texts.push({ x, y, str, color, size, t: 0, life: 0.7 }); }
  afterimage(e) { this.ghosts.push({ x: e.x, y: e.y, w: e.w, h: e.h, face: e.face, t: 0, life: 0.22 }); }
  slash(p, name) { this.slashes.push({ owner: p, name, t: 0, life: name === 'heavy' || name === 'parry' ? 0.26 : name === 'combo3' || name === 'combo4' ? 0.22 : 0.17, face: p.face }); }
  setBanner(text, sub = '', color = '#efe6d2', life = 1.6) { this.banner = { text, sub, color, t: 0, life }; }

  update(dt) {
    for (const p of this.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= 0.96; }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const t of this.texts) { t.t += dt; t.y -= 40 * dt; }
    this.texts = this.texts.filter((t) => t.t < t.life);
    for (const g of this.ghosts) g.t += dt;
    this.ghosts = this.ghosts.filter((g) => g.t < g.life);
    for (const s of this.slashes) s.t += dt;
    this.slashes = this.slashes.filter((s) => s.t < s.life);
    for (const im of this.impacts) im.t += dt;
    this.impacts = this.impacts.filter((im) => im.t < im.life);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    if (this.shakeT > 0) this.shakeT -= dt; else this.shakeMag = 0;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.vignette = Math.max(0, this.vignette - dt * 2);
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.life) this.banner = null; }
  }
  clear() { this.parts = []; this.texts = []; this.ghosts = []; this.slashes = []; this.rings = []; this.impacts = []; this.shakeT = 0; this.flash = 0; }
}
