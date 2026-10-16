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
    this.tier = 1; // 夜の深さで上がる（攻撃パターンが増える）
  }
  get timeScale() { return this.warp > 0 ? 0.35 : this.lag > 0 ? 0.6 : 1; }
  get slowed() { return this.warp > 0 || this.lag > 0; }
  // 予備動作の長さの倍率（遅い敵・難易度）
  wmul(game) { return (this.slowed ? game.player.stats.slowWindupMul : 1) * (game.run && game.run.diff ? game.run.diff.windup : 1); }
  setState(s) { this.state = s; this.stateT = 0; this.tell = 0; }
  facePlayer(p) { this.face = cx(p) < cx(this) ? -1 : 1; }
  dx(p) { return cx(p) - cx(this); }
  dy(p) { return cy(p) - cy(this); }

  // 範囲攻撃を見切って躱す（前の夜に術が多かった／常時の術を積んでいるとき）。クールタイムあり
  tryDodgeAoe(game, dt) {
    if (this.dodgeI > 0) this.dodgeI -= dt;
    this.aoeCd = (this.aoeCd ?? 1) - dt;
    if (this.aoeCd > 0 || !game.room || this.defeated) return;
    const ex = cx(this), ey = this.y + this.h, ecy = cy(this);
    let away = 0, jump = false;
    for (const sp of game.room.spells) {
      if (sp.melee) continue;
      const k = sp.kind;
      if (k === 'groundwave' && sp.t >= 0) { const d = ex - sp.x; if (Math.abs(d) < 110 && sign(d) === sign(sp.vx) && Math.abs(ey - sp.y) < 40) { jump = true; break; } }
      else if ((k === 'star' || k === 'sword' || k === 'spike') && !sp.boomed && Math.abs(sp.x - ex) < 60) { away = sign(ex - sp.x) || 1; break; }
      else if (k === 'flamering' || k === 'ember' || k === 'toll' || k === 'frost' || k === 'quake') { const d = Math.hypot(ex - sp.x, ecy - sp.y); if (d < (sp.maxR || 100) + 20 && d > (sp.r || 0) - 10) { away = sign(ex - sp.x) || 1; break; } }
      else if (k === 'burnfloor' && Math.abs(ex - sp.x) < sp.half + 10 && Math.abs(ey - sp.y) < 34) { away = sign(ex - sp.x) || 1; break; }
    }
    if (!away && !jump) return;
    this.aoeCd = this.boss ? 8 : this.elite ? 4 : 3.5;
    this.dodgeI = 0.4; // この間は術が当たらない
    if (this.gravity && this.onGround) this.vy = jump ? -480 : -260;
    else if (!this.gravity) this.vy = -160;
    if (away) this.vx = away * 300;
    game.fx.text(ex, this.y - 14, 'かわす', '#9fd0ff', 10);
    game.fx.dust(ex, ey, 4);
  }
  // 激ムズ：近づくと盾を構える（青く光る）。構えの間、正面からの攻撃をパリィして跳ね返す
  tryGuard(game, dt) {
    if (this.guardT > 0) { this.guardT -= dt; this.facePlayer(game.player); this.vx *= 0.8; return; }
    this.guardCd = (this.guardCd ?? 1.5) - dt;
    const calm = ['idle', 'chase', 'patrol', 'run', 'walk', 'approach'].includes(this.state);
    if (this.guardCd <= 0 && calm && this.onGround && Math.abs(this.dx(game.player)) < 110 && Math.abs(this.dy(game.player)) < 50 && Math.random() < dt * 1.2) {
      this.guardT = 0.9; this.guardCd = 4;
    }
  }
  update(game, dt) {
    if (game.run && game.run.diff && game.run.diff.parry && !this.boss && !this.elite && this.gravity) this.tryGuard(game, dt);
    if (this.aoeDodge) this.tryDodgeAoe(game, dt);
    // 散開の陣形：仲間と固まらないように離れる
    if (this.spread && game.room) for (const o of game.room.enemies) if (o !== this && o.alive && Math.abs(cx(o) - cx(this)) < 44 && Math.abs(cy(o) - cy(this)) < 40) this.vx += sign(cx(this) - cx(o)) * 300 * dt;
    // 重撃への対策：溜めを見ると跳び退く
    const p = game.player;
    if (this.counter === 'heavy' && !this.elite && this.gravity && this.onGround) {
      if (p.state === 'charge' && Math.abs(this.dx(p)) < 140 && !this.hopped) { this.hopped = true; this.vx = -sign(this.dx(p)) * 260; this.vy = -260; game.fx.dust(cx(this), this.y + this.h, 4); }
      if (p.state !== 'charge') this.hopped = false;
    }
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
    // 常時の術はダメージだけで怯ませない（積んでも敵が動けなくならないように）
    // 連撃への対策：連撃では怯まない（鉄の意地）
    const ironWill = this.counter === 'combo' && info.cat === 'combo';
    if (!info.passive && !ironWill && (info.dmg >= this.poise || this.poise === 0)) {
      res.flinched = this.onFlinch(game, info);
    }
    if (this.hp <= 0) this.alive = false;
    return res;
  }
  onFlinch(game, info) {
    this.vx = info.dir * info.knock;
    if (!this.gravity) this.vy = info.lift ? -info.lift * 0.4 : -40;
    else if (info.lift) this.vy = -info.lift; // 打ち上げ（↑攻撃・足払い）
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
        if (adx < 72 && ady < 40 && this.cool <= 0 && !p.isNpc) { this.followed = false; this.setState('windup'); game.sfx.play('tell'); }
        // 第3段階：離れていると、赤い線を見せてから突進突き
        else if (this.tier >= 3 && adx > 110 && adx < 230 && ady < 40 && this.cool <= 0 && !p.isNpc && !this.ledgeAhead(map, this.face)) { this.setState('thrustWind'); game.sfx.play('tellBig'); }
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
        if (this.stateT >= 0.13) {
          // 第2段階：返しの二段斬り（短い予備動作つき）
          if (this.tier >= 2 && !this.followed && Math.random() < 0.6) { this.followed = true; this.setState('windup2'); this.facePlayer(game.player); }
          else this.setState('recover');
        }
        break;
      case 'windup2': {
        this.vx = approach(this.vx, 0, 1500 * dt);
        const wt = 0.3 * this.wmul(game);
        this.tell = clamp(this.stateT / wt, 0, 1); this.tellKind = 'glint';
        if (this.stateT >= wt) { this.setState('slash'); this.swing++; this.vx = this.face * 260; game.sfx.play('swing'); }
        break;
      }
      case 'thrustWind': {
        this.vx = 0;
        const wt = 0.55 * this.wmul(game);
        this.tell = clamp(this.stateT / wt, 0, 1); this.tellKind = 'thrust';
        if (this.stateT >= wt) { this.setState('thrust'); this.swing++; this.vx = this.face * 560; game.sfx.play('heavySwing'); }
        break;
      }
      case 'thrust':
        this.attacks.push({ ...this.frontBox(30, 18, -2), dmg: 18, key: this.id * 1000 + this.swing });
        this.vx = approach(this.vx, 0, 1300 * dt);
        if (this.stateT >= 0.3 || (this.coll && this.coll.hitX) || this.ledgeAhead(game.map, this.face)) { this.vx = 0; this.setState('recover'); }
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
        if (this.stateT * 520 > this.diveLen || this.stateT > 0.75) {
          // 第2段階：すぐにもう一度狙い直して急降下
          if (this.tier >= 2 && !this.second) { this.second = true; this.setState('tell'); this.target = { x: cx(p), y: cy(p) + 4 }; this.stateT = 0.15; game.sfx.play('tell'); }
          else { this.second = false; this.setState('rise'); }
        }
        if (this.coll && (this.coll.hitX || this.coll.hitY)) { this.setState('stunned'); game.fx.sparks(cx(this), cy(this), '#ccc', 6); }
        break;
      case 'rise':
        this.vx = approach(this.vx, 0, 700 * dt); this.vy = approach(this.vy, -110, 900 * dt);
        // 第3段階：上昇しながら爆弾を落とす
        if (this.tier >= 3 && !this.bombed && this.stateT > 0.2) { this.bombed = true; game.spawnProjectile(new Projectile('bomb', cx(this) - 4, cy(this), 0, 60, 14)); }
        if (this.stateT > 0.65) this.bombed = false;
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
    this.periodSet = false;
    this.poise = 999;
  }
  think(game, dt) {
    this.vx = 0; this.vy = 0;
    const p = game.player;
    const near = Math.abs(this.dx(p)) < 560 && Math.abs(this.dy(p)) < 300 && p.state !== 'dead';
    this.facePlayer(p);
    if (!near) { this.tell = 0; return; }
    if (!this.periodSet) { this.periodSet = true; if (this.tier >= 3) this.period = 1.8; }
    const before = this.clock;
    this.clock += dt;
    const q = this.period / 4;
    if (Math.floor(before / q) !== Math.floor(this.clock / q)) game.sfx.play('tick');
    const left = this.period - (this.clock % this.period);
    this.tell = left < 0.55 ? 1 - left / 0.55 : 0; this.tellKind = 'clock';
    if (Math.floor(before / this.period) !== Math.floor(this.clock / this.period)) {
      const ax = cx(p) - cx(this), ay = cy(p) - cy(this);
      const d = Math.hypot(ax, ay) || 1;
      const base = Math.atan2(ay, ax);
      // 第2段階から3方向
      for (const off of this.tier >= 2 ? [-0.28, 0, 0.28] : [0]) game.spawnProjectile(new Projectile('bolt', cx(this) - 5, cy(this) - 5, Math.cos(base + off) * 250, Math.sin(base + off) * 250, 10));
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
          const dy = this.dy(p);
          this.seq = (this.seq || 0);
          // 頭上の相手には大槌の突き上げ（上方向）
          if (dy < -50 && adx < 90) { this.setState('upperWind'); game.sfx.play('tellBig'); }
          else if (adx < 110) { this.setState(this.combo % 3 === 2 ? 'slamWind' : 'bashWind'); this.combo++; game.sfx.play('tellBig'); }
          // 中距離：跳び上がって空中から盾ごと急降下（空中攻撃）／第3夜からは叩きつけも
          else if (adx >= 140 && adx < 320 && this.stateT > 0.6) { this.setState(this.tier >= 3 && this.seq % 2 ? 'leapWind' : 'skyWind'); this.seq++; game.sfx.play('tellBig'); }
          // 遠距離：戻ってくる大歯車／追尾する火花
          else if (adx >= 200 && this.stateT > 0.5) { this.setState(this.seq % 2 ? 'sparkWind' : 'throwWind'); this.seq++; game.sfx.play('tellBig'); }
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
        // 盾突進は大きく突き飛ばす
        this.attacks.push({ ...this.frontBox(26, 40), dmg: 20, knock: 520, key: this.id * 1000 + this.swing });
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
          // 第2段階：少し遅れて二度目の衝撃波
          if (this.tier >= 2) for (const v of [200, -200]) { const w2 = new Projectile('wave', cx(this) - 8, gy, v, 0, 15); w2.delay = 0.35; game.spawnProjectile(w2); }
          game.fx.dust(cx(this), this.y + this.h, 10);
        }
        break;
      // 第3段階：跳び上がってプレイヤーの位置へ叩きつけ
      case 'leapWind':
        this.vx = 0;
        this.tell = clamp(this.stateT / (0.45 * wm), 0, 1); this.tellKind = 'hammer';
        if (this.stateT >= 0.45 * wm) { this.leapX = cx(p); this.setState('leap'); this.vy = -700; this.vx = clamp((this.leapX - cx(this)) / 0.65, -420, 420); }
        break;
      case 'leap':
        this.tell = 1; this.tellKind = 'shadow';
        if (this.stateT > 0.15 && this.onGround) { this.vx = 0; this.setState('slamWind'); this.stateT = 0.75 * wm; }
        break;
      case 'slam':
        if (this.stateT < 0.12) this.attacks.push({ ...this.frontBox(70, 44), dmg: 25, key: this.id * 1000 + this.swing });
        if (this.stateT >= 0.2) this.setState('recover');
        break;
      // 上方向：大槌を真上へ突き上げる（第2夜からは針も 3 本上へ）
      case 'upperWind':
        this.vx = approach(this.vx, 0, 900 * dt); this.facePlayer(p);
        this.tell = clamp(this.stateT / (0.45 * wm), 0, 1); this.tellKind = 'up';
        if (this.stateT >= 0.45 * wm) {
          this.setState('upper'); this.swing++; game.sfx.play('heavySwing');
          if (this.tier >= 2) for (const a of [-0.35, 0, 0.35]) game.spawnProjectile(new Projectile('hand', cx(this) - 6, this.y - 10, Math.sin(a) * 420, -Math.cos(a) * 420, 12));
        }
        break;
      case 'upper':
        if (this.stateT < 0.18) this.attacks.push({ x: this.x - 14, y: this.y - 96, w: this.w + 28, h: 100, dmg: 20, knock: 300, key: this.id * 1000 + this.swing });
        if (this.stateT >= 0.25) this.setState('recover');
        break;
      // 遠距離：回りながら飛んで戻ってくる大歯車（行きと帰りの 2 回当たりうる。跳ぶか回避で抜ける）
      case 'throwWind':
        this.vx = approach(this.vx, 0, 900 * dt); this.facePlayer(p);
        this.tell = clamp(this.stateT / (0.6 * wm), 0, 1); this.tellKind = 'throw';
        if (this.stateT >= 0.6 * wm) {
          const g = new Projectile('biggear', cx(this) - 11, this.y + this.h - 30, this.face * 420, 0, 16);
          g.owner = this; g.turnAt = Math.min(1.0, (adx + 80) / 420); g.life = 3.2;
          game.spawnProjectile(g); game.sfx.play('heavySwing');
          this.setState('recover');
        }
        break;
      // 追尾：鎧の継ぎ目から火花を放ち、しばらく追ってくる
      case 'sparkWind':
        this.vx = approach(this.vx, 0, 900 * dt); this.facePlayer(p);
        this.tell = clamp(this.stateT / (0.55 * wm), 0, 1); this.tellKind = 'spark';
        if (this.stateT >= 0.55 * wm) {
          const n = this.tier >= 2 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.7;
            const pr = new Projectile('note', cx(this) - 6, this.y + 4, Math.cos(a) * 200, Math.sin(a) * 200, 11);
            pr.seek = { speed: 190, turn: 2.6, time: 2.2 }; pr.life = 3.6; pr.color = '#ffb04a'; pr.delay = i * 0.12;
            game.spawnProjectile(pr);
          }
          game.sfx.play('shoot');
          this.setState('recover');
        }
        break;
      // 空中攻撃：高く跳び、頂点で一瞬止まってから相手へ向けて盾ごと急降下
      case 'skyWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.tell = clamp(this.stateT / (0.45 * wm), 0, 1); this.tellKind = 'shield';
        if (this.stateT >= 0.45 * wm) { this.setState('sky'); this.vy = -820; this.vx = clamp(dx * 0.6, -200, 200); game.sfx.play('jump'); }
        break;
      case 'sky':
        this.tell = 1; this.tellKind = 'shadow';
        if (this.stateT > 0.32) {
          this.facePlayer(p);
          const ax = cx(p) - cx(this), ay = cy(p) - cy(this), d = Math.hypot(ax, ay) || 1;
          this.diveV = { x: ax / d * 560, y: Math.max(260, ay / d * 560) };
          this.gravity = false; this.vx = 0; this.vy = 0; this.swing++;
          this.setState('diveHold');
        }
        break;
      case 'diveHold': // 頂点で光る（ここで横へ逃げる）
        this.vx = 0; this.vy = 0; this.tell = 1; this.tellKind = 'shield';
        if (this.stateT >= 0.22 * wm) { this.setState('dive'); this.vx = this.diveV.x; this.vy = this.diveV.y; game.sfx.play('heavySwing'); }
        break;
      case 'dive':
        this.attacks.push({ x: this.x - 6, y: this.y - 4, w: this.w + 12, h: this.h + 8, dmg: 20, knock: 460, key: this.id * 1000 + this.swing });
        if (this.onGround || (this.coll && (this.coll.hitX || this.coll.hitY)) || this.stateT > 1.2) {
          this.gravity = true; this.vx = 0;
          game.fx.shake(6, 0.2); game.sfx.play('heavyHit'); game.fx.dust(cx(this), this.y + this.h, 10);
          if (this.tier >= 2) for (const v of [260, -260]) game.spawnProjectile(new Projectile('wave', cx(this) - 8, this.y + this.h - 18, v, 0, 12));
          this.setState('recover');
        }
        break;
      case 'recover':
        this.gravity = true;
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.stateT >= 0.85) { this.cool = enraged ? 0.35 : 0.7; this.setState('approach'); }
        break;
      case 'stagger':
        this.gravity = true;
        this.vx = approach(this.vx, 0, 600 * dt);
        if (this.stateT >= 1.4) { this.cool = 0.3; this.setState('approach'); }
        break;
      case 'flinch':
        this.gravity = true;
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
    this.w = kind === 'wave' ? 16 : kind === 'hand' ? 12 : kind === 'arrow' ? 14 : kind === 'biggear' ? 22 : kind === 'blade' ? 24 : kind === 'note' ? 12 : 10;
    this.h = kind === 'wave' ? 18 : kind === 'hand' ? 12 : kind === 'arrow' ? 6 : kind === 'biggear' ? 22 : kind === 'blade' ? 12 : kind === 'note' ? 12 : 10;
    this.dmg = dmg;
    this.alive = true;
    this.t = 0;
    this.life = kind === 'wave' ? 1.6 : 3.5;
    this.destroyable = kind !== 'wave' && kind !== 'ring' && kind !== 'biggear';
    this.key = 'p' + nextId++;
    this.delay = 0; // 時止め中に置かれた刃は遅れて動く
  }
  update(game, dt) {
    this.t += dt;
    if (this.delay > 0) { this.delay -= dt; return; }
    if (this.kind === 'bomb') { this.vy += 900 * dt; if (game.map.solidAt(this.x + 5, this.y + 11)) { this.explode(game); return; } }
    if (this.kind === 'arrow') this.vy += 120 * dt;
    if (this.kind === 'ring') { this.r += this.speed * dt; if (this.r > this.maxR) this.alive = false; return; }
    // 追尾：しばらくのあいだプレイヤーの方へ少しずつ曲がる
    if (this.seek && this.t < this.seek.time) {
      const p = game.player, ax = cx(p) - (this.x + this.w / 2), ay = cy(p) - (this.y + this.h / 2);
      const want = Math.atan2(ay, ax), cur = Math.atan2(this.vy, this.vx);
      let da = want - cur; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      const na = cur + clamp(da, -this.seek.turn * dt, this.seek.turn * dt), sp = this.seek.speed;
      this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp;
    }
    // 戻ってくる大歯車：投げた者のところへ帰る
    if (this.kind === 'biggear' && this.owner) {
      this.spin = (this.spin || 0) + dt * 14;
      if (this.t > this.turnAt) { const ax = cx(this.owner) - (this.x + this.w / 2), ay = cy(this.owner) - (this.y + this.h / 2), d = Math.hypot(ax, ay) || 1; this.vx = approach(this.vx, ax / d * 380, 900 * dt); this.vy = approach(this.vy, ay / d * 380, 900 * dt); if (d < 24 || !this.owner.alive) { this.alive = false; return; } }
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.t > this.life) this.alive = false;
      return;
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.t > this.life) this.alive = false;
    if (this.kind !== 'wave' && game.map.solidAt(this.x + this.w / 2, this.y + this.h / 2)) { this.alive = false; game.fx.sparks(this.x, this.y, '#f2c14e', 4); }
    if (this.kind === 'wave' && game.map.solidAt(this.x + (this.vx > 0 ? this.w : 0), this.y + this.h / 2)) this.alive = false;
  }
}


// 歯車転がし：その場で回転を速め（火花＝予兆）、一直線に転がってくる。壁にぶつかると目を回す
export class GearRoller extends Enemy {
  constructor(x, y) {
    super('roller', x + 3, y - 24, 24, 24, 50);
    this.cool = 1.2; this.spin = 0; this.dir = -1; this.bounced = false;
    this.setState('roam');
  }
  think(game, dt) {
    const p = game.player, map = game.map;
    const dx = this.dx(p), adx = Math.abs(dx), ady = Math.abs(this.dy(p));
    if (this.cool > 0) this.cool -= dt;
    this.spin += dt * (this.state === 'charge' ? 16 : this.state === 'spinup' ? 4 + this.stateT * 20 : Math.abs(this.vx) / 14);
    switch (this.state) {
      case 'roam':
        this.vx = this.dir * 50; this.face = this.dir;
        if (this.wallAhead(map, this.dir) || this.ledgeAhead(map, this.dir)) this.dir *= -1;
        if (this.cool <= 0 && adx < 320 && ady < 70 && p.state !== 'dead') { this.facePlayer(p); this.setState('spinup'); game.sfx.play('tell'); }
        break;
      case 'spinup': {
        this.vx = 0;
        const wt = 0.6 * this.wmul(game);
        this.tell = clamp(this.stateT / wt, 0, 1); this.tellKind = 'spin';
        if (Math.random() < 0.3) game.fx.sparks(cx(this) - this.face * 10, this.y + this.h, '#ffcf6b', 1, 120, -this.face);
        if (this.stateT >= wt) { this.setState('charge'); this.swing++; this.bounced = false; game.sfx.play('dodge'); }
        break;
      }
      case 'charge': {
        this.vx = this.face * (this.tier >= 3 ? 470 : 380);
        this.attacks.push({ x: this.x, y: this.y, w: this.w, h: this.h, dmg: 14, key: this.id * 1000 + this.swing });
        const hit = this.coll && this.coll.hitX;
        if (hit || this.ledgeAhead(map, this.face) || this.stateT > 1.6) {
          if (hit) { game.fx.shake(3, 0.12); game.fx.sparks(cx(this) + this.face * 12, cy(this), '#ffcf6b', 8); game.sfx.play('block'); }
          // 第2段階：壁で跳ね返ってもう一度
          if (hit && this.tier >= 2 && !this.bounced) { this.bounced = true; this.face *= -1; this.stateT = 0; this.swing++; }
          else { this.vx = 0; this.setState('dizzy'); }
        }
        break;
      }
      case 'dizzy':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.stateT > 1.0) { this.cool = 1.3; this.dir = this.face; this.setState('roam'); }
        break;
      case 'flinch':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.stateT > 0.2) this.setState('roam');
        break;
    }
  }
  takeHit(game, info) {
    // 目を回している間は 1.5 倍。転がっている間は怯まない
    if (this.state === 'dizzy') info = { ...info, dmg: Math.round(info.dmg * 1.5) };
    this.poise = this.state === 'charge' || this.state === 'spinup' ? 999 : 0;
    return super.takeHit(game, info);
  }
}

// 時計弓兵：距離を取り、弓を引き絞って（光る弦と照準線）矢を放つ
export class ClockArcher extends Enemy {
  constructor(x, y) {
    super('archer', x + 6, y - 30, 18, 30, 34);
    this.cool = 1.4; this.aim = null; this.volleys = 0;
    this.setState('idle');
  }
  think(game, dt) {
    const p = game.player, map = game.map;
    const dx = this.dx(p), adx = Math.abs(dx), ady = Math.abs(this.dy(p));
    if (this.cool > 0) this.cool -= dt;
    switch (this.state) {
      case 'idle': {
        this.facePlayer(p);
        let want = 0;
        if (adx < 140) want = -this.face * 110; else if (adx > 320) want = this.face * 60;
        if (want !== 0 && (this.ledgeAhead(map, sign(want)) || this.wallAhead(map, sign(want)))) want = 0;
        this.vx = approach(this.vx, want, 700 * dt);
        if (this.cool <= 0 && adx < 440 && ady < 180 && p.state !== 'dead') { this.volleys = this.tier >= 3 ? 2 : 1; this.setState('draw'); game.sfx.play('tell'); }
        break;
      }
      case 'draw': {
        this.vx = approach(this.vx, 0, 900 * dt);
        this.facePlayer(p);
        const wt = 0.65 * this.wmul(game);
        if (this.stateT < wt * 0.6) this.aim = { x: cx(p), y: cy(p) };
        this.tell = clamp(this.stateT / wt, 0, 1); this.tellKind = 'bow';
        if (this.stateT >= wt) {
          const ax = this.aim.x - cx(this), ay = this.aim.y - (this.y + 12);
          const base = Math.atan2(ay, ax) - 0.05 * sign(ax);
          for (const off of this.tier >= 2 ? [-0.12, 0, 0.12] : [0]) game.spawnProjectile(new Projectile('arrow', cx(this) - 7, this.y + 10, Math.cos(base + off) * 380, Math.sin(base + off) * 380, 11));
          game.sfx.play('shoot');
          this.volleys--;
          if (this.volleys > 0) { this.setState('draw'); this.stateT = wt * 0.45; }
          else this.setState('recover');
        }
        break;
      }
      case 'recover':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.stateT > 0.55) { this.cool = 1.6; this.setState('idle'); }
        break;
      case 'flinch':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.stateT > 0.25) { this.cool = Math.max(this.cool, 0.5); this.setState('idle'); }
        break;
    }
  }
}

// 刻の亡霊：プレイヤーの背後に揺らぎ（予兆）を残し、そこへ跳んで斬る
export class Phantom extends Enemy {
  constructor(x, y) {
    super('phantom', x, y, 20, 30, 40);
    this.gravity = false;
    this.cool = 1.6; this.dest = null; this.chain = 0;
    this.setState('drift');
  }
  get faded() { return this.state === 'mark'; }
  think(game, dt) {
    const p = game.player, map = game.map;
    if (this.cool > 0) this.cool -= dt;
    switch (this.state) {
      case 'drift': {
        const tx = cx(p) + (cx(this) < cx(p) ? -130 : 130) - this.w / 2, ty = p.y - 30;
        this.vx = approach(this.vx, clamp((tx - this.x) * 1.5, -90, 90), 300 * dt);
        this.vy = approach(this.vy, clamp((ty - this.y) * 1.5, -90, 90) + Math.sin(this.stateT * 3) * 20, 300 * dt);
        this.facePlayer(p);
        if (this.cool <= 0 && p.state !== 'dead') { this.chain = this.tier >= 2 ? 2 : 1; this.mark(game); }
        break;
      }
      case 'mark': {
        this.vx = 0; this.vy = 0;
        const wt = (this.tier >= 3 ? 0.42 : 0.55) * this.wmul(game);
        this.tell = clamp(this.stateT / wt, 0, 1); this.tellKind = 'mark';
        if (this.stateT >= wt) {
          this.x = this.dest.x - this.w / 2; this.y = this.dest.y - this.h;
          this.facePlayer(p);
          game.fx.ring(cx(this), cy(this), '#b67cf0', 26, 0.25);
          this.setState('slashWind');
        }
        break;
      }
      case 'slashWind':
        this.tell = clamp(this.stateT / 0.18, 0, 1); this.tellKind = 'glint';
        if (this.stateT >= 0.18) { this.setState('slash'); this.swing++; game.sfx.play('swing'); }
        break;
      case 'slash':
        this.attacks.push({ ...this.frontBox(40, 26), dmg: 14, key: this.id * 1000 + this.swing });
        if (this.stateT >= 0.14) {
          this.chain--;
          if (this.chain > 0) this.mark(game); else this.setState('recover');
        }
        break;
      case 'recover':
        this.vx = 0; this.vy = approach(this.vy, -20, 200 * dt);
        if (this.stateT > 0.8) { this.cool = 1.8; this.setState('drift'); }
        break;
      case 'flinch':
        this.vx = approach(this.vx, 0, 500 * dt); this.vy = approach(this.vy, 0, 500 * dt);
        if (this.stateT > 0.3) { this.cool = Math.max(this.cool, 0.8); this.setState('drift'); }
        break;
    }
  }
  // 行き先：プレイヤーの背後（壁なら反対側）
  mark(game) {
    const p = game.player, map = game.map;
    let side = -p.face;
    let x = cx(p) + side * 46;
    if (map.solidAt(x, p.y + p.h - 4) || x < 40 || x > map.pxW - 40) { side = -side; x = cx(p) + side * 46; }
    this.dest = { x, y: p.y + p.h };
    this.setState('mark');
    game.sfx.play('tell');
  }
}

// 鐘撞き：槌を振り上げ（予兆）、胴の鐘を鳴らして広がる音の輪を放つ。輪は回避か距離でかわす
export class BellRinger extends Enemy {
  constructor(x, y) {
    super('bell', x + 2, y - 34, 26, 34, 70);
    this.cool = 1.5; this.rings = 0;
    this.setState('idle');
  }
  think(game, dt) {
    const p = game.player, map = game.map;
    const dx = this.dx(p), adx = Math.abs(dx), ady = Math.abs(this.dy(p));
    if (this.cool > 0) this.cool -= dt;
    switch (this.state) {
      case 'idle': {
        this.facePlayer(p);
        const want = adx > 90 && !this.ledgeAhead(map, this.face) && !this.wallAhead(map, this.face) ? this.face * 55 : 0;
        this.vx = approach(this.vx, want, 400 * dt);
        if (this.cool <= 0 && adx < 130 && ady < 120 && p.state !== 'dead') { this.rings = this.tier >= 3 ? 2 : 1; this.setState('lift'); game.sfx.play('tellBig'); }
        break;
      }
      case 'lift': {
        this.vx = 0;
        const wt = 0.75 * this.wmul(game);
        this.tell = clamp(this.stateT / wt, 0, 1); this.tellKind = 'bell';
        if (this.stateT >= wt) {
          const r = new Projectile('ring', cx(this), cy(this), 0, 0, 16);
          r.r = 8; r.maxR = this.tier >= 2 ? 185 : 140; r.speed = 230; r.band = 14; r.life = 2;
          game.spawnProjectile(r);
          game.sfx.play('bossBell'); game.fx.shake(3, 0.15);
          this.rings--;
          if (this.rings > 0) { this.setState('lift'); this.stateT = wt * 0.4; } else this.setState('recover');
        }
        break;
      }
      case 'recover':
        this.vx = approach(this.vx, 0, 600 * dt);
        if (this.stateT > 1.0) { this.cool = 1.6; this.setState('idle'); }
        break;
      case 'flinch':
        this.vx = approach(this.vx, 0, 600 * dt);
        if (this.stateT > 0.2) this.setState('idle');
        break;
    }
  }
  takeHit(game, info) {
    this.poise = this.state === 'lift' ? 18 : 0;
    return super.takeHit(game, info);
  }
}

// 振り子の番人（中ボス）：振り子の大薙ぎ・跳躍の叩きつけ（床を走る衝撃波）・鐘の輪。大技のあとは長い隙
export class Warden extends Enemy {
  constructor(x, y) {
    super('warden', x - 5, y - 56, 40, 56, 300);
    this.elite = true;
    this.cool = 1.2; this.seq = 0;
    this.setState('walk');
  }
  think(game, dt) {
    const p = game.player, map = game.map;
    const dx = this.dx(p), adx = Math.abs(dx);
    const enraged = this.hp < this.maxHp * 0.5;
    const wm = this.wmul(game) * (enraged ? 0.85 : 1);
    if (this.cool > 0) this.cool -= dt;
    this.pend = (this.pend || 0) + dt * (this.state === 'sweepWind' ? 9 : 3);
    switch (this.state) {
      case 'walk': {
        this.facePlayer(p);
        const blocked = this.ledgeAhead(map, this.face) || this.wallAhead(map, this.face);
        this.vx = approach(this.vx, adx > 70 && !blocked ? this.face * 60 : 0, 500 * dt);
        if (this.cool <= 0 && p.state !== 'dead') {
          const dy = this.dy(p);
          // 頭上の相手には振り子を真上へ振り上げる（上方向）
          if (dy < -60 && adx < 120) this.setState('liftWind');
          else if (adx < 130) this.setState(this.seq % 3 === 2 ? 'quakeWind' : this.seq % 3 === 1 ? 'spinWind' : 'sweepWind');
          // 中距離：鐘の輪・跳躍の衝撃波・追尾する鐘の音
          else if (adx < 240) this.setState(['quakeWind', 'notesWind', this.tier >= 2 ? 'tollWind' : 'spinWind'][this.seq % 3]);
          // 遠距離：飛ぶ振り子の刃／追尾する鐘の音
          else this.setState(this.seq % 2 ? 'notesWind' : 'bladeWind');
          this.seq++; game.sfx.play('tellBig');
        }
        break;
      }
      case 'sweepWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.tell = clamp(this.stateT / (0.7 * wm), 0, 1); this.tellKind = 'pendulum';
        if (this.stateT >= 0.7 * wm) { this.setState('sweep'); this.swing++; this.vx = this.face * 140; game.sfx.play('heavySwing'); game.fx.shake(4, 0.15); }
        break;
      case 'sweep':
        if (this.stateT < 0.25) this.attacks.push({ ...this.frontBox(88, 54, -6), dmg: 26, knock: 600, key: this.id * 1000 + this.swing });
        this.vx = approach(this.vx, 0, 700 * dt);
        if (this.stateT >= 0.3) {
          // 怒ると振り返ってもう一度薙ぐ
          if (enraged && !this.again) { this.again = true; this.face = -this.face; this.setState('sweepWind'); this.stateT = 0.35 * wm; }
          else { this.again = false; this.setState('recover'); }
        }
        break;
      case 'quakeWind':
        this.vx = 0;
        this.tell = clamp(this.stateT / (0.6 * wm), 0, 1); this.tellKind = 'hammer';
        if (this.stateT >= 0.6 * wm) { this.setState('jump'); this.vy = -640; this.vx = clamp(dx / 0.6, -360, 360); }
        break;
      case 'jump':
        this.tell = 1; this.tellKind = 'shadow';
        if (this.stateT > 0.15 && this.onGround) {
          this.vx = 0; this.swing++;
          game.fx.shake(8, 0.3); game.sfx.play('heavyHit'); game.fx.dust(cx(this), this.y + this.h, 14);
          const gy = this.y + this.h - 18;
          for (const v of [320, -320]) game.spawnProjectile(new Projectile('wave', cx(this) - 8, gy, v, 0, 18));
          if (this.tier >= 2) for (const v of [220, -220]) { const w2 = new Projectile('wave', cx(this) - 8, gy, v, 0, 18); w2.delay = 0.3; game.spawnProjectile(w2); }
          this.setState('slam');
        }
        break;
      case 'slam':
        if (this.stateT < 0.1) this.attacks.push({ x: this.x - 30, y: this.y + this.h - 30, w: this.w + 60, h: 30, dmg: 22, key: this.id * 1000 + this.swing });
        if (this.stateT >= 0.15) this.setState('recover');
        break;
      case 'tollWind':
        this.vx = 0;
        this.tell = clamp(this.stateT / (0.8 * wm), 0, 1); this.tellKind = 'bell';
        if (this.stateT >= 0.8 * wm) {
          for (let i = 0; i < (this.tier >= 3 ? 2 : 1); i++) {
            const r = new Projectile('ring', cx(this), cy(this), 0, 0, 18);
            r.r = 10; r.maxR = 230; r.speed = 210; r.band = 16; r.life = 2; r.delay = i * 0.45;
            game.spawnProjectile(r);
          }
          game.sfx.play('bossBell'); game.fx.shake(5, 0.2);
          this.setState('recover');
        }
        break;
      // 上方向：振り子を真上へ振り上げ、鐘の針を扇に撃ち上げる
      case 'liftWind':
        this.vx = approach(this.vx, 0, 900 * dt); this.facePlayer(p);
        this.tell = clamp(this.stateT / (0.5 * wm), 0, 1); this.tellKind = 'up';
        if (this.stateT >= 0.5 * wm) {
          this.setState('lift'); this.swing++; game.sfx.play('heavySwing');
          const n = this.tier >= 2 ? 5 : 3;
          for (let i = 0; i < n; i++) { const a = (i - (n - 1) / 2) * 0.3; game.spawnProjectile(new Projectile('hand', cx(this) - 6, this.y - 12, Math.sin(a) * 440, -Math.cos(a) * 440, 13)); }
        }
        break;
      case 'lift':
        if (this.stateT < 0.2) this.attacks.push({ x: this.x - 20, y: this.y - 110, w: this.w + 40, h: 114, dmg: 22, knock: 300, key: this.id * 1000 + this.swing });
        if (this.stateT >= 0.3) this.setState('recover');
        break;
      // 遠距離：回る振り子の刃を飛ばす（第2夜からは低い刃と高い刃の 2 枚。低い刃は跳ぶ、高い刃はくぐる）
      case 'bladeWind':
        this.vx = approach(this.vx, 0, 900 * dt); this.facePlayer(p);
        this.tell = clamp(this.stateT / (0.65 * wm), 0, 1); this.tellKind = 'throw';
        if (this.stateT >= 0.65 * wm) {
          const low = new Projectile('blade', cx(this) - 12, this.y + this.h - 16, this.face * 330, 0, 16); low.life = 3;
          game.spawnProjectile(low);
          if (this.tier >= 2) { const hi = new Projectile('blade', cx(this) - 12, this.y + this.h - 64, this.face * 330, 0, 16); hi.life = 3; hi.delay = 0.45; game.spawnProjectile(hi); }
          game.sfx.play('heavySwing');
          this.setState('recover');
        }
        break;
      // 追尾：胸の鐘を鳴らし、ゆっくり追ってくる鐘の音を放つ（斬れば消える）
      case 'notesWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.tell = clamp(this.stateT / (0.6 * wm), 0, 1); this.tellKind = 'bell';
        if (this.stateT >= 0.6 * wm) {
          const n = this.tier >= 3 ? 4 : 3;
          for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.8;
            const pr = new Projectile('note', cx(this) - 6, this.y + 6, Math.cos(a) * 170, Math.sin(a) * 170, 12);
            pr.seek = { speed: 165, turn: 2.2, time: 2.6 }; pr.life = 4; pr.color = '#ffe14a'; pr.delay = i * 0.15;
            game.spawnProjectile(pr);
          }
          game.sfx.play('bossBell');
          this.setState('recover');
        }
        break;
      // 空中攻撃：跳び上がって空中で振り子を一回転させ、周りを薙ぎ払う
      case 'spinWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.tell = clamp(this.stateT / (0.55 * wm), 0, 1); this.tellKind = 'pendulum';
        if (this.stateT >= 0.55 * wm) { this.setState('spinAir'); this.vy = -660; this.vx = clamp(dx / 0.7, -240, 240); this.swing++; game.sfx.play('jump'); }
        break;
      case 'spinAir':
        this.tell = 0; this.spinA = (this.spinA || 0) + dt * 16;
        if (this.stateT > 0.2) {
          if (Math.floor(this.stateT / 0.22) !== Math.floor((this.stateT - dt) / 0.22)) { this.swing++; game.sfx.play('swing'); }
          this.attacks.push({ x: this.x - 44, y: this.y - 30, w: this.w + 88, h: this.h + 44, dmg: 18, knock: 360, key: this.id * 1000 + this.swing });
        }
        if (this.stateT > 0.25 && this.onGround) { this.vx = 0; game.fx.dust(cx(this), this.y + this.h, 8); game.fx.shake(4, 0.15); this.setState('recover'); }
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 700 * dt);
        if (this.stateT >= (enraged ? 0.75 : 1.05)) { this.cool = enraged ? 0.35 : 0.6; this.setState('walk'); }
        break;
      case 'stagger':
        this.vx = approach(this.vx, 0, 600 * dt);
        if (this.stateT >= 1.6) { this.cool = 0.3; this.setState('walk'); }
        break;
    }
  }
  // 怯まない。大技の後の隙に重撃を当てると大きく崩れる
  takeHit(game, info) {
    this.hp -= info.dmg;
    this.hitFlash = 0.1;
    if (this.hp <= 0) this.alive = false;
    if (info.breaks && this.state === 'recover') { this.setState('stagger'); return { blocked: false, flinched: true, guardBreak: true }; }
    return { blocked: false, flinched: false };
  }
}

// 鐘楼の衛士（刻守の護衛）：錆兵の弱い仲間。刻守が倒れると崩れ落ちる
export class BellGuard extends RustSoldier {
  constructor(x, y) {
    super(x, y);
    this.kind = 'guard';
    this.hp = this.maxHp = 26;
    this.dmgMul = 0.6;
    this.cool = 1.2;
  }
}

// 光線砲手（遠距離）：照準線を引き、部屋を貫く光線を撃つ。近づかれると下がる。線の上から外れれば当たらない
export class Beamer extends Enemy {
  constructor(x, y) {
    super('beamer', x + 3, y - 30, 24, 30, 55);
    this.cool = 1.8; this.aimY = 0; this.beamLen = 0;
    this.setState('idle');
  }
  think(game, dt) {
    const p = game.player, map = game.map;
    const dx = this.dx(p), adx = Math.abs(dx), ady = Math.abs(this.dy(p));
    if (this.cool > 0) this.cool -= dt;
    switch (this.state) {
      case 'idle': {
        this.facePlayer(p);
        let want = adx < 170 ? -this.face * 80 : 0;
        if (want && (this.ledgeAhead(map, sign(want)) || this.wallAhead(map, sign(want)))) want = 0;
        this.vx = approach(this.vx, want, 500 * dt);
        if (this.cool <= 0 && ady < 70 && adx < 640 && p.state !== 'dead') { this.setState('aim'); this.aimY = cy(p); game.sfx.play('tell'); }
        break;
      }
      case 'aim': {
        // 照準線が光を増していく。最後の 0.3 秒は線が固定される（そこで跳ぶか伏せる）
        this.vx = approach(this.vx, 0, 900 * dt);
        const wt = 1.05 * this.wmul(game);
        if (this.stateT < wt - 0.3) { this.facePlayer(p); this.aimY = approach(this.aimY, cy(p), 90 * dt); }
        this.tell = clamp(this.stateT / wt, 0, 1); this.tellKind = 'beam';
        // 壁までの長さ
        let len = 0; const sx = cx(this);
        while (len < 720 && !map.solidAt(sx + this.face * (len + 15), this.aimY)) len += 15;
        this.beamLen = len;
        if (this.stateT >= wt) { this.setState('fire'); this.swing++; game.sfx.play('shoot'); game.fx.shake(2.5, 0.12); }
        break;
      }
      case 'fire': {
        const len = this.beamLen, x0 = this.face > 0 ? cx(this) : cx(this) - len;
        if (this.stateT < 0.3) this.attacks.push({ x: x0, y: this.aimY - 7, w: len, h: 14, dmg: 13, key: this.id * 1000 + this.swing });
        if (this.stateT >= 0.35) this.setState('recover');
        break;
      }
      case 'recover':
        this.vx = approach(this.vx, 0, 500 * dt);
        if (this.stateT >= 1.0) { this.cool = this.tier >= 2 ? 2.2 : 2.8; this.setState('idle'); }
        break;
      case 'flinch':
        this.vx = approach(this.vx, 0, 700 * dt);
        if (this.stateT > 0.25) { this.cool = Math.max(this.cool, 0.6); this.setState('idle'); }
        break;
    }
  }
}

// 鎖鎌兵（中距離）：少し離れた距離を保ち、鎖を振りかぶって前方へ伸ばす。鎖の届く先は約 180
export class ChainReaper extends Enemy {
  constructor(x, y) {
    super('chain', x + 4, y - 32, 20, 32, 60);
    this.cool = 1.2; this.reach = 0; this.lashes = 0;
    this.setState('idle');
  }
  think(game, dt) {
    const p = game.player, map = game.map;
    const dx = this.dx(p), adx = Math.abs(dx), ady = Math.abs(this.dy(p));
    if (this.cool > 0) this.cool -= dt;
    switch (this.state) {
      case 'idle': {
        this.facePlayer(p);
        let want = adx > 190 ? this.face * 80 : adx < 110 ? -this.face * 90 : 0;
        if (want && (this.ledgeAhead(map, sign(want)) || this.wallAhead(map, sign(want)))) want = 0;
        this.vx = approach(this.vx, want, 600 * dt);
        if (this.cool <= 0 && adx < 210 && ady < 60 && p.state !== 'dead') { this.lashes = this.tier >= 2 ? 2 : 1; this.setState('wind'); game.sfx.play('tell'); }
        break;
      }
      case 'wind': {
        this.vx = approach(this.vx, 0, 900 * dt);
        const wt = 0.55 * this.wmul(game);
        this.tell = clamp(this.stateT / wt, 0, 1); this.tellKind = 'chain';
        if (this.stateT >= wt) { this.setState('lash'); this.swing++; game.sfx.play('swing'); }
        break;
      }
      case 'lash': {
        this.reach = Math.min(180, this.stateT / 0.15 * 180);
        if (this.stateT < 0.25) this.attacks.push({ ...this.frontBox(this.reach, 14, -4), dmg: 14, key: this.id * 1000 + this.swing });
        if (this.stateT >= 0.3) {
          this.reach = 0; this.lashes--;
          if (this.lashes > 0) { this.setState('wind'); this.stateT = 0.3; } else this.setState('recover');
        }
        break;
      }
      case 'recover':
        this.vx = approach(this.vx, 0, 600 * dt);
        if (this.stateT >= 0.75) { this.cool = 1.3; this.setState('idle'); }
        break;
      case 'flinch':
        this.reach = 0;
        this.vx = approach(this.vx, 0, 700 * dt);
        if (this.stateT > 0.25) this.setState('idle');
        break;
    }
  }
}

// 歯車ネズミ（すばしっこい）：素早く駆け寄って噛みつき、すぐに逃げる。体力は低い
export class GearRat extends Enemy {
  constructor(x, y) {
    super('rat', x + 7, y - 12, 16, 12, 22);
    this.cool = 0.5;
    this.setState('run');
  }
  think(game, dt) {
    const p = game.player, map = game.map;
    const dx = this.dx(p), adx = Math.abs(dx), ady = Math.abs(this.dy(p));
    if (this.cool > 0) this.cool -= dt;
    // 段差や穴は跳び越える
    const hop = () => { if (this.onGround && (this.ledgeAhead(map, sign(this.vx) || this.face) || this.wallAhead(map, sign(this.vx) || this.face))) this.vy = -430; };
    switch (this.state) {
      case 'run':
        this.facePlayer(p);
        this.vx = approach(this.vx, this.face * 250, 1400 * dt); hop();
        if (this.cool <= 0 && adx < 110 && ady < 40 && p.state !== 'dead') this.setState('crouch');
        break;
      case 'crouch': {
        this.vx = approach(this.vx, 0, 1600 * dt);
        const wt = 0.28 * this.wmul(game);
        this.tell = clamp(this.stateT / wt, 0, 1); this.tellKind = 'bite';
        if (this.stateT >= wt) { this.setState('bite'); this.swing++; this.vx = this.face * 520; this.vy = -120; }
        break;
      }
      case 'bite':
        this.attacks.push({ ...this.frontBox(10, 12), dmg: 8, key: this.id * 1000 + this.swing });
        if (this.stateT >= 0.25) { this.setState('flee'); this.face = -this.face; }
        break;
      case 'flee':
        this.vx = approach(this.vx, this.face * 230, 1400 * dt); hop();
        if (this.stateT >= 0.55) { this.cool = 0.7; this.setState('run'); }
        break;
      case 'flinch':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.stateT > 0.18) this.setState('flee');
        break;
    }
  }
}

// 跳ね潰し（飛び跳ねて潰す）：身をかがめ、着地点に影を落としてから跳びかかる。着地のあとは隙だらけ
export class Hopper extends Enemy {
  constructor(x, y) {
    super('hopper', x + 2, y - 22, 26, 22, 75);
    this.cool = 1.2; this.landX = 0;
    this.setState('idle');
  }
  think(game, dt) {
    const p = game.player, map = game.map;
    const dx = this.dx(p), adx = Math.abs(dx);
    if (this.cool > 0) this.cool -= dt;
    switch (this.state) {
      case 'idle':
        this.facePlayer(p);
        this.vx = approach(this.vx, 0, 600 * dt);
        if (this.cool <= 0 && adx < 400 && p.state !== 'dead') { this.setState('crouch'); this.landX = cx(p); game.sfx.play('tell'); }
        break;
      case 'crouch': {
        const wt = 0.55 * this.wmul(game);
        if (this.stateT < wt * 0.7) this.landX = cx(p);
        this.tell = clamp(this.stateT / wt, 0, 1); this.tellKind = 'hop';
        if (this.stateT >= wt) { this.setState('air'); this.vy = -640; this.vx = clamp((this.landX - cx(this)) / 0.62, -460, 460); }
        break;
      }
      case 'air':
        this.tell = 1; this.tellKind = 'hop';
        if (this.stateT > 0.12 && this.onGround) {
          this.vx = 0; this.swing++;
          game.fx.shake(4, 0.15); game.fx.dust(cx(this), this.y + this.h, 10); game.sfx.play('heavyHit');
          if (this.tier >= 3) for (const v of [260, -260]) game.spawnProjectile(new Projectile('wave', cx(this) - 8, this.y + this.h - 18, v, 0, 10));
          this.setState('crush');
        }
        break;
      case 'crush':
        if (this.stateT < 0.1) this.attacks.push({ x: this.x - 18, y: this.y - 4, w: this.w + 36, h: this.h + 4, dmg: 20, key: this.id * 1000 + this.swing });
        if (this.stateT >= 0.12) this.setState('recover');
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 800 * dt);
        if (this.stateT >= 0.9) { this.cool = 0.9; this.setState('idle'); }
        break;
      case 'flinch':
        this.vx = approach(this.vx, 0, 700 * dt);
        if (this.stateT > 0.25) this.setState('idle');
        break;
    }
  }
}

// 大槌兵（吹き飛ばし）：大槌を後ろへ大きく振りかぶり、横薙ぎで遠くへ吹き飛ばす。壁を背にすると激突して余計に痛い。
// 振ったあとは槌の重さで長い隙。第3夜からは振り抜きに続けて二撃目（逆方向の打ち返し）
export class Mallet extends Enemy {
  constructor(x, y) {
    super('mallet', x + 2, y - 34, 26, 34, 95);
    this.cool = 1.0; this.poise = 12; this.hits = 0;
    this.setState('walk');
  }
  think(game, dt) {
    const p = game.player, map = game.map;
    const dx = this.dx(p), adx = Math.abs(dx), ady = Math.abs(this.dy(p));
    if (this.cool > 0) this.cool -= dt;
    switch (this.state) {
      case 'walk': {
        this.facePlayer(p);
        const blocked = this.ledgeAhead(map, this.face) || this.wallAhead(map, this.face);
        this.vx = approach(this.vx, adx > 50 && !blocked ? this.face * 65 : 0, 500 * dt);
        if (this.cool <= 0 && adx < 80 && ady < 50 && p.state !== 'dead') { this.hits = this.tier >= 3 ? 2 : 1; this.setState('wind'); game.sfx.play('tellBig'); }
        break;
      }
      case 'wind': {
        this.vx = approach(this.vx, 0, 900 * dt);
        const wt = (this.hits === 1 && this.tier >= 3 && this.again ? 0.4 : 0.8) * this.wmul(game);
        this.tell = clamp(this.stateT / wt, 0, 1); this.tellKind = 'mallet';
        if (this.stateT >= wt) { this.setState('swing'); this.swing++; this.vx = this.face * 160; game.sfx.play('heavySwing'); }
        break;
      }
      case 'swing':
        this.vx = approach(this.vx, 0, 800 * dt);
        if (this.stateT < 0.16) this.attacks.push({ ...this.frontBox(46, 40, -4), dmg: 15, knock: 580, key: this.id * 1000 + this.swing });
        if (this.stateT >= 0.22) {
          this.hits--;
          if (this.hits > 0) { this.again = true; this.face = sign(this.dx(p)) || this.face; this.setState('wind'); }
          else { this.again = false; this.setState('recover'); }
        }
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 700 * dt);
        if (this.stateT >= 1.0) { this.cool = 1.1; this.setState('walk'); }
        break;
      case 'flinch':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.stateT > 0.22) this.setState('walk');
        break;
    }
  }
}

// 爆弾：地面で弾けて小さな衝撃波
Projectile.prototype.explode = function (game) {
  this.alive = false;
  game.fx.burst(this.x + 5, this.y + 5, '#ff8a3c', 12);
  game.sfx.play('heavyHit');
  const r = new Projectile('ring', this.x + 5, this.y + 5, 0, 0, this.dmg);
  r.r = 4; r.maxR = 40; r.speed = 160; r.band = 12; r.life = 1;
  game.spawnProjectile(r); r.dmg = this.dmg;
};

export function makeEnemy(c, x, y) {
  switch (c) {
    case 'S': return new RustSoldier(x + 5, y + TILE);
    case 'B': return new PendulumBat(x + 3, y + 6);
    case 'T': return new ClockTurret(x, y + TILE);
    case 'K': return new GearKnight(x, y + TILE);
    case 'R': return new GearRoller(x, y + TILE);
    case 'A': return new ClockArcher(x, y + TILE);
    case 'P': return new Phantom(x + 5, y);
    case 'L': return new BellRinger(x, y + TILE);
    case 'E': return new Beamer(x, y + TILE);
    case 'N': return new ChainReaper(x, y + TILE);
    case 'F': return new GearRat(x, y + TILE);
    case 'J': return new Hopper(x, y + TILE);
    case 'H': return new Mallet(x, y + TILE);
  }
  return null;
}
