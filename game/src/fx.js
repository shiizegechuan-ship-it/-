// 見た目の演出データ。シミュレーションとは独立（描画だけが読む）。
export class Fx {
  constructor() {
    this.parts = [];
    this.texts = [];
    this.ghosts = [];
    this.slashes = [];
    this.rings = [];
    this.impacts = [];
    this.streaks = []; // 跳躍の風切り線
    this.twinkles = []; // キラキラ（四方に光る十字）
    this.flares = []; // 放射状の光の筋（パリィ・伝説の術）
    this.pillars = []; // 撃破の光の柱
    this.strikes = []; // 敵の攻撃の軌跡（三日月の斬光と風切り）
    this.shakeT = 0; this.shakeMag = 0;
    this.flash = 0; this.flashColor = '#fff';
    this.vignette = 0; // 被弾時の赤
    this.banner = null; // 画面中央の大きな文字
    this.rand = Math.random;
    this.settings = { shake: true };
  }
  shake(mag, t = 0.18) {
    if (!this.settings.shake) return;
    mag *= 1.25; // 画面の揺れは全体に 1.25 倍
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
  // 跳躍の砂煙（足元から左右へ）
  jumpPuff(x, y) {
    for (const d of [-1, 1]) for (let i = 0; i < 3; i++) this.parts.push({ x: x + d * 3, y: y - 1, vx: d * (60 + this.rand() * 80), vy: -20 - this.rand() * 40, life: 0.3, t: 0, color: 'rgba(210,200,180,0.7)', size: 3, g: 0 });
    this.streaks.push({ x, y, t: 0, life: 0.16, vertical: true });
  }
  // 2段ジャンプ：足元に時計の輪と羽のような光
  airJump(x, y, p) {
    this.rings.push({ x, y: y + 2, color: '#ffe14a', r: 22, life: 0.28, t: 0, flat: true });
    for (let i = 0; i < 10; i++) { const a = Math.PI * (0.15 + 0.7 * (i / 9)); this.parts.push({ x, y, vx: Math.cos(a) * 160 * (i % 2 ? 1 : -1), vy: Math.sin(a) * 90, life: 0.35, t: 0, color: i % 3 ? '#fff3c4' : '#ffe14a', size: 2, g: 200 }); }
    if (p) this.afterimage(p);
    this.streaks.push({ x, y, t: 0, life: 0.2, vertical: true });
  }
  landPuff(x, y, k = 0.5) {
    const n = Math.round(3 + 5 * k);
    for (const d of [-1, 1]) for (let i = 0; i < n; i++) this.parts.push({ x: x + d * 4, y: y - 1, vx: d * (80 + this.rand() * 160 * k), vy: -this.rand() * 50, life: 0.3 + 0.15 * k, t: 0, color: 'rgba(210,200,180,0.65)', size: 3 + this.rand() * 2, g: 0 });
  }
  step(x, y, dir) { this.parts.push({ x, y: y - 1, vx: dir * (40 + this.rand() * 40), vy: -20 - this.rand() * 20, life: 0.25, t: 0, color: 'rgba(200,190,170,0.5)', size: 2 + this.rand() * 2, g: 0 }); }
  skid(x, y, dir) { if (this.rand() < 0.5) this.parts.push({ x, y: y - 1, vx: dir * (60 + this.rand() * 60), vy: -30 - this.rand() * 40, life: 0.3, t: 0, color: 'rgba(220,210,190,0.7)', size: 3, g: 300 }); }
  // 敵の攻撃が出た瞬間：攻撃の範囲に三日月の斬光を走らせ、火花を散らす（big：中ボス・刻守は衝撃の輪と揺れも）
  enemyStrike(box, dir, color, big = false) {
    this.strikes.push({ x: box.x, y: box.y, w: box.w, h: box.h, dir: dir || 1, color, big, t: 0, life: big ? 0.28 : 0.2 });
    this.sparks(box.x + box.w / 2 + (dir || 1) * box.w / 3, box.y + box.h / 2, color, big ? 10 : 5, big ? 320 : 220, dir || 1);
    if (big) { this.ring(box.x + box.w / 2, box.y + box.h / 2, color, Math.max(box.w, box.h) * 0.7, 0.3); this.shake(3, 0.12); }
  }
  pillar(x, y, color) { this.pillars.push({ x, y, color, t: 0, life: 1.6 }); }
  burst(x, y, color, n = 18) { this.sparks(x, y, color, n, 340); this.ring(x, y, color, 40); }
  impact(x, y, color = '#ffffff', size = 6) { this.impacts.push({ x, y, color, size, t: 0, life: 0.14 }); }
  ring(x, y, color, r = 30, life = 0.3) { this.rings.push({ x, y, color, r, life, t: 0 }); }
  text(x, y, str, color = '#fff', size = 14) { this.texts.push({ x, y, str, color, size, t: 0, life: 0.7 }); }
  afterimage(e) { this.ghosts.push({ x: e.x, y: e.y, w: e.w, h: e.h, face: e.face, t: 0, life: 0.22 }); }
  slash(p, name) { this.slashes.push({ owner: p, name, t: 0, life: name === 'dropSpin' ? 0.32 : name === 'heavy' || name === 'parry' ? 0.26 : name === 'down' ? 0.2 : name === 'combo3' || name === 'combo4' ? 0.22 : 0.17, face: p.face }); }
  // キラキラ：点の周りに小さな十字の光をいくつか散らす
  twinkle(x, y, colors, n = 6, spread = 30, life = 0.45) {
    const cs = Array.isArray(colors) ? colors : [colors];
    for (let i = 0; i < n; i++) this.twinkles.push({ x: x + (this.rand() - 0.5) * spread * 2, y: y + (this.rand() - 0.5) * spread * 2, color: cs[i % cs.length], t: -this.rand() * 0.12, life, size: 2 + Math.floor(this.rand() * 3) });
  }
  // 放射状の光の筋（色を順に巡らせる）
  flare(x, y, colors, rays = 12, r = 60, life = 0.4) { this.flares.push({ x, y, colors: Array.isArray(colors) ? colors : [colors], rays, r, life, t: 0, rot: this.rand() * Math.PI }); }
  // いくつかの色の火花をまとめて
  prism(x, y, colors, n = 18, speed = 340) { const per = Math.max(1, Math.round(n / colors.length)); for (const c of colors) this.sparks(x, y, c, per, speed); }
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
    for (const s of this.strikes) s.t += dt;
    this.strikes = this.strikes.filter((s) => s.t < s.life);
    for (const s of this.pillars) s.t += dt;
    this.pillars = this.pillars.filter((s) => s.t < s.life);
    for (const s of this.twinkles) s.t += dt;
    this.twinkles = this.twinkles.filter((s) => s.t < s.life);
    for (const s of this.flares) s.t += dt;
    this.flares = this.flares.filter((s) => s.t < s.life);
    for (const s of this.streaks) s.t += dt;
    this.streaks = this.streaks.filter((s) => s.t < s.life);
    if (this.shakeT > 0) this.shakeT -= dt; else this.shakeMag = 0;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.vignette = Math.max(0, this.vignette - dt * 2);
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.life) this.banner = null; }
  }
  clear() { this.parts = []; this.texts = []; this.ghosts = []; this.slashes = []; this.rings = []; this.impacts = []; this.streaks = []; this.pillars = []; this.strikes = []; this.twinkles = []; this.flares = []; this.shakeT = 0; this.flash = 0; }
}
