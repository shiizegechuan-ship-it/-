import { moveBody } from './tilemap.js';
import { approach, sign, cx, cy, clamp } from './util.js';
import { TILE } from './config.js';

let nextId = 1;

export class Enemy {
  constructor(kind, x, y, w, h, hp) {
    this.id = nextId++;
    this.kind = kind;
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.hp = hp; this.maxHp = hp;
    this.face = -1;
    this.state = 'idle'; this.stateT = 0;
    this.alive = true;
    this.hitFlash = 0;
    this.lag = 0; this.warp = 0; // 遅延（強化）・時歪（スキル）
    this.attacks = [];
    this.tell = 0; // 予備動作の強さ 0..1（描画用）
    this.tellKind = null;
    this.gravity = true;
    this.onGround = false;
    this.poise = 0; // この値以上のダメージでのみ怯む状態がある
    this.swing = 0; // 攻撃ごとの識別子
    this.elite = false;
    this.boss = false;
  }
  get timeScale() { return this.warp > 0 ? 0.35 : this.lag > 0 ? 0.6 : 1; }
  get slowed() { return this.warp > 0 || this.lag > 0; }
  wmul(game) { return this.slowed ? game.player.stats.slowWindupMul : 1; }
  setState(s) { this.state = s; this.stateT = 0; this.tell = 0; }
  facePlayer(p) { this.face = cx(p) < cx(this) ? -1 : 1; }
  dx(p) { return cx(p) - cx(this); }
  dy(p) { return cy(p) - cy(this); }

  update(game, dt) {
    if (this.lag > 0) this.lag -= dt;
    if (this.warp > 0) this.warp -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    const edt = dt * this.timeScale;
    this.attacks = [];
    this.stateT += edt;
    this.think(game, edt);
    if (this.gravity) this.vy = Math.min(this.vy + 2000 * edt, 900);
    const r = moveBody(this, game.map, edt);
    this.onGround = r.onGround;
    this.coll = r;
    if (this.y > game.map.pxH + 100) this.alive = false;
  }
  think() {}
  // 前方の足場が途切れるか
  ledgeAhead(map, dir) {
    const fx = dir > 0 ? this.x + this.w + 2 : this.x - 2;
    return !map.solidAt(fx, this.y + this.h + 4) && map.get(Math.floor(fx / TILE), Math.floor((this.y + this.h + 4) / TILE)) === 0;
  }
  wallAhead(map, dir) {
    const fx = dir > 0 ? this.x + this.w + 2 : this.x - 2;
    return map.solidAt(fx, this.y + this.h - 4);
  }
  frontBox(w, h, oy = 0) {
    return { x: this.face > 0 ? this.x + this.w : this.x - w, y: this.y + this.h / 2 - h / 2 + oy, w, h };
  }
  // 被弾。戻り値 {blocked, flinched}
  takeHit(game, info) {
    this.hp -= info.dmg;
    this.hitFlash = 0.1;
    const res = { blocked: false, flinched: false };
    if (info.dmg >= this.poise || this.poise === 0) {
      res.flinched = this.onFlinch(game, info);
    }
    if (this.hp <= 0) this.alive = false;
    return res;
  }
  onFlinch(game, info) {
    this.vx = info.dir * info.knock;
    if (!this.gravity) this.vy = -40;
    this.setState('flinch');
    return true;
  }
  // 被弾者側から見た攻撃面（盾判定用）
  isFrontHit(info) { return sign(info.dir) === -this.face; }
}

// 錆兵：剣を振り上げて光る → 踏み込み斬り。振った後は大きな隙。
export class RustSoldier extends Enemy {
  constructor(x, y) {
    super('soldier', x, y - 32, 20, 32, 42);
    this.poise = 18; // 予備動作中は連撃3段目・重撃でしか止まらない
    this.cool = 0.6;
    this.setState('patrol');
    this.dir = -1;
  }
  think(game, dt) {
    // 救出戦ではプレイヤーが離れているとグレンを狙う
    const p = game.targetFor ? game.targetFor(this) : game.player, map = game.map;
    const dx = this.dx(p), adx = Math.abs(dx), ady = Math.abs(this.dy(p));
    if (this.cool > 0) this.cool -= dt;
    const sees = (adx < 280 && ady < 70 && p.state !== 'dead') || p.isNpc;
    switch (this.state) {
      case 'patrol':
        this.vx = this.dir * 45; this.face = this.dir;
        if (this.wallAhead(map, this.dir) || this.ledgeAhead(map, this.dir) || this.stateT > 2.5) { this.dir *= -1; this.stateT = 0; }
        if (sees) this.setState('chase');
        break;
      case 'chase': {
        this.facePlayer(p);
        const want = adx > 58 ? this.face * 100 : 0;
        const blocked = this.ledgeAhead(map, this.face) || this.wallAhead(map, this.face);
        this.vx = approach(this.vx, blocked ? 0 : want, 900 * dt);
        if (adx < 72 && ady < 40 && this.cool <= 0 && !p.isNpc) { this.setState('windup'); game.sfx.play('tell'); }
        this.nearNpc = p.isNpc && adx < 60;
        if (!sees && this.stateT > 1) this.setState('patrol');
        break;
      }
      case 'windup': {
        this.vx = approach(this.vx, 0, 1200 * dt);
        const wt = 0.5 * this.wmul(game);
        this.tell = clamp(this.stateT / wt, 0, 1); this.tellKind = 'glint';
        if (this.stateT >= wt) { this.setState('slash'); this.swing++; this.vx = this.face * 300; game.sfx.play('swing'); }
        break;
      }
      case 'slash':
        this.vx = approach(this.vx, 0, 1500 * dt);
        this.attacks.push({ ...this.frontBox(44, 26, -2), dmg: 15, key: this.id * 1000 + this.swing });
        if (this.stateT >= 0.13) this.setState('recover');
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 1500 * dt);
        if (this.stateT >= 0.6) { this.cool = 0.5; this.setState('chase'); }
        break;
      case 'flinch':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.stateT >= 0.28) { this.cool = Math.max(this.cool, 0.25); this.setState('chase'); }
        break;
    }
  }
  takeHit(game, info) {
    // 予備動作・攻撃中以外は軽い攻撃でも怯む
    const armored = this.state === 'windup' || this.state === 'slash';
    this.poise = armored ? 18 : 0;
    return super.takeHit(game, info);
  }
}

// 振り子蝙蝠：一瞬止まり、突進の軌道線を見せてから急降下。突進後に上昇する間が隙。
export class PendulumBat extends Enemy {
  constructor(x, y) {
    super('bat', x, y, 24, 16, 24);
    this.gravity = false;
    this.phase = Math.random() * 6;
    this.cool = 1.2 + Math.random();
    this.setState('hover');
    this.target = null;
  }
  think(game, dt) {
    const p = game.player;
    this.phase += dt * 3;
    switch (this.state) {
      case 'hover': {
        const tx = cx(p) + Math.sin(this.phase * 0.6) * 90 - this.w / 2;
        const ty = p.y - 110 + Math.sin(this.phase) * 14;
        this.vx = approach(this.vx, clamp((tx - this.x) * 2.2, -170, 170), 600 * dt);
        this.vy = approach(this.vy, clamp((ty - this.y) * 2.2, -170, 170), 600 * dt);
        this.face = sign(this.dx(p)) || 1;
        this.cool -= dt;
        if (this.cool <= 0 && Math.abs(this.dx(p)) < 320 && p.state !== 'dead') {
          this.setState('tell');
          this.target = { x: cx(p), y: cy(p) + 4 };
          game.sfx.play('tell');
        }
        break;
      }
      case 'tell': {
        this.vx = approach(this.vx, 0, 900 * dt); this.vy = approach(this.vy, -30, 900 * dt);
        const wt = 0.45 * this.wmul(game);
        this.tell = clamp(this.stateT / wt, 0, 1); this.tellKind = 'line';
        if (this.stateT >= wt) {
          const ax = this.target.x - cx(this), ay = this.target.y - cy(this);
          const d = Math.hypot(ax, ay) || 1;
          this.vx = ax / d * 520; this.vy = ay / d * 520;
          this.diveLen = d + 70;
          this.swing++;
          this.setState('dive');
        }
        break;
      }
      case 'dive':
        this.attacks.push({ x: this.x, y: this.y, w: this.w, h: this.h, dmg: 12, key: this.id * 1000 + this.swing });
        if (this.stateT * 520 > this.diveLen || this.stateT > 0.75) this.setState('rise');
        if (this.coll && (this.coll.hitX || this.coll.hitY)) { this.setState('stunned'); game.fx.sparks(cx(this), cy(this), '#ccc', 6); }
        break;
      case 'rise':
        this.vx = approach(this.vx, 0, 700 * dt); this.vy = approach(this.vy, -110, 900 * dt);
        if (this.stateT > 0.7) { this.cool = 1.4 + Math.random() * 0.8; this.setState('hover'); }
        break;
      case 'stunned':
        this.vx = approach(this.vx, 0, 900 * dt); this.vy = approach(this.vy, 60, 400 * dt);
        if (this.stateT > 0.8) this.setState('rise');
        break;
      case 'flinch':
        this.vx = approach(this.vx, 0, 700 * dt); this.vy = approach(this.vy, 0, 700 * dt);
        if (this.stateT > 0.25) { this.cool = Math.max(this.cool, 0.6); this.setState('hover'); }
        break;
    }
  }
}

// 時計砲台：針が12時を指すと撃つ。針が見えるので周期を学習できる。
export class ClockTurret extends Enemy {
  constructor(x, y) {
    super('turret', x + 2, y - 26, 26, 26, 30);
    this.gravity = false;
    this.period = 2.4;
    this.clock = 0.6;
    this.poise = 999;
  }
  think(game, dt) {
    this.vx = 0; this.vy = 0;
    const p = game.player;
    const near = Math.abs(this.dx(p)) < 560 && Math.abs(this.dy(p)) < 300 && p.state !== 'dead';
    this.facePlayer(p);
    if (!near) { this.tell = 0; return; }
    const before = this.clock;
    this.clock += dt;
    const q = this.period / 4;
    if (Math.floor(before / q) !== Math.floor(this.clock / q)) game.sfx.play('tick');
    const left = this.period - (this.clock % this.period);
    this.tell = left < 0.55 ? 1 - left / 0.55 : 0; this.tellKind = 'clock';
    if (Math.floor(before / this.period) !== Math.floor(this.clock / this.period)) {
      const ax = cx(p) - cx(this), ay = cy(p) - cy(this);
      const d = Math.hypot(ax, ay) || 1;
      game.spawnProjectile(new Projectile('bolt', cx(this) - 5, cy(this) - 5, ax / d * 250, ay / d * 250, 10));
      game.sfx.play('shoot');
    }
  }
  get hand() { return (this.clock % this.period) / this.period; }
  onFlinch() { return false; }
}

// 歯車騎士（エリート）：正面の盾は通常攻撃を弾く。重撃か背後で崩す。
export class GearKnight extends Enemy {
  constructor(x, y) {
    super('knight', x, y - 44, 30, 44, 170);
    this.elite = true;
    this.cool = 1.0;
    this.setState('approach');
    this.combo = 0;
  }
  // 盾を構えているのは接近・盾突進の間。ハンマーの振り上げと硬直は無防備
  get guarding() { return this.state === 'approach' || this.state === 'bashWind' || this.state === 'bash'; }
  think(game, dt) {
    const p = game.player, map = game.map;
    const dx = this.dx(p), adx = Math.abs(dx);
    const enraged = this.hp < this.maxHp * 0.5;
    const wm = this.wmul(game) * (enraged ? 0.8 : 1);
    if (this.cool > 0) this.cool -= dt;
    switch (this.state) {
      case 'approach': {
        // 振り向きは遅い：回避で背後へ抜ければ盾の裏を取れる
        const behind = sign(dx) !== this.face && adx > 6;
        this.turnT = behind ? (this.turnT || 0) + dt : 0;
        if (this.turnT > 0.45) { this.face = sign(dx); this.turnT = 0; }
        const blocked = this.ledgeAhead(map, this.face) || this.wallAhead(map, this.face);
        this.vx = approach(this.vx, adx > 70 && !blocked ? this.face * 70 : 0, 600 * dt);
        if (this.cool <= 0 && p.state !== 'dead' && !behind) {
          if (adx < 110) { this.setState(this.combo % 3 === 2 ? 'slamWind' : 'bashWind'); this.combo++; game.sfx.play('tellBig'); }
          else if (adx < 260 && this.stateT > 1.2) { this.setState('bashWind'); game.sfx.play('tellBig'); }
        }
        break;
      }
      case 'bashWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.tell = clamp(this.stateT / (0.42 * wm), 0, 1); this.tellKind = 'shield';
        if (this.stateT >= 0.42 * wm) { this.setState('bash'); this.swing++; this.vx = this.face * 420; game.sfx.play('heavySwing'); }
        break;
      case 'bash':
        this.attacks.push({ ...this.frontBox(26, 40), dmg: 20, key: this.id * 1000 + this.swing });
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.stateT >= 0.25 || (this.coll && this.coll.hitX)) this.setState('recover');
        break;
      case 'slamWind':
        this.vx = 0;
        this.tell = clamp(this.stateT / (0.75 * wm), 0, 1); this.tellKind = 'hammer';
        if (this.stateT >= 0.75 * wm) {
          this.setState('slam'); this.swing++;
          game.fx.shake(7, 0.25); game.sfx.play('heavyHit');
          const gy = this.y + this.h - 18;
          game.spawnProjectile(new Projectile('wave', cx(this) - 8, gy, 300, 0, 15));
          game.spawnProjectile(new Projectile('wave', cx(this) - 8, gy, -300, 0, 15));
          game.fx.dust(cx(this), this.y + this.h, 10);
        }
        break;
      case 'slam':
        if (this.stateT < 0.12) this.attacks.push({ ...this.frontBox(70, 44), dmg: 25, key: this.id * 1000 + this.swing });
        if (this.stateT >= 0.2) this.setState('recover');
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.stateT >= 0.85) { this.cool = enraged ? 0.35 : 0.7; this.setState('approach'); }
        break;
      case 'stagger':
        this.vx = approach(this.vx, 0, 600 * dt);
        if (this.stateT >= 1.4) { this.cool = 0.3; this.setState('approach'); }
        break;
      case 'flinch':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.stateT >= 0.2) this.setState('approach');
        break;
    }
  }
  takeHit(game, info) {
    if (this.guarding && this.isFrontHit(info) && !info.echo) {
      if (info.breaks) {
        this.setState('stagger');
        this.hitFlash = 0.15;
        this.hp -= info.dmg * 0.5;
        if (this.hp <= 0) this.alive = false;
        return { blocked: false, flinched: true, guardBreak: true };
      }
      this.hitFlash = 0.05;
      this.vx = info.dir * 40;
      return { blocked: true };
    }
    this.hp -= info.dmg;
    this.hitFlash = 0.1;
    if (this.hp <= 0) this.alive = false;
    // 隙の間は小さく揺れるだけ（盾には戻らない）
    if (this.state === 'recover' || this.state === 'stagger') this.vx = info.dir * 30;
    return { blocked: false, flinched: false };
  }
}

export class Projectile {
  constructor(kind, x, y, vx, vy, dmg) {
    this.kind = kind;
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.w = kind === 'wave' ? 16 : kind === 'hand' ? 12 : 10;
    this.h = kind === 'wave' ? 18 : kind === 'hand' ? 12 : 10;
    this.dmg = dmg;
    this.alive = true;
    this.t = 0;
    this.life = kind === 'wave' ? 1.6 : 3.5;
    this.destroyable = kind !== 'wave';
    this.key = 'p' + nextId++;
    this.delay = 0; // 時止め中に置かれた刃は遅れて動く
  }
  update(game, dt) {
    this.t += dt;
    if (this.delay > 0) { this.delay -= dt; return; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.t > this.life) this.alive = false;
    if (this.kind !== 'wave' && game.map.solidAt(this.x + this.w / 2, this.y + this.h / 2)) { this.alive = false; game.fx.sparks(this.x, this.y, '#f2c14e', 4); }
    if (this.kind === 'wave' && game.map.solidAt(this.x + (this.vx > 0 ? this.w : 0), this.y + this.h / 2)) this.alive = false;
  }
}

export function makeEnemy(c, x, y) {
  switch (c) {
    case 'S': return new RustSoldier(x + 5, y + TILE);
    case 'B': return new PendulumBat(x + 3, y + 6);
    case 'T': return new ClockTurret(x, y + TILE);
    case 'K': return new GearKnight(x, y + TILE);
  }
  return null;
}
