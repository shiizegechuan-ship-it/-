// 刻守（ときもり）。3段階。前の周回の戦い方への対策を1つだけ持ち込む（刻守の記憶）。
import { Enemy, Projectile } from './enemies.js';
import { COUNTERS } from './meta.js';
import { approach, clamp, cx, cy, sign } from './util.js';

export class Tokimori extends Enemy {
  constructor(x, y, opts) {
    super('boss', x, y - 58, 34, 58, 800);
    this.boss = true;
    this.counter = opts.counter || null; // 'combo'|'heavy'|'air'|'echo'|'skill'
    this.brake = !!opts.brake;
    this.rng = opts.rng;
    this.phase = 1;
    this.p2At = this.brake ? 0.75 : 0.6;
    this.p3At = 0.25;
    this.cool = 1.2;
    this.poiseDmg = 0;
    this.lightHits = []; // 反撃の足捌き用
    this.airWatch = 0;
    this.ringT = 0; this.ringCool = 4; this.ringHits = 0;
    this.resist = this.counter ? COUNTERS[this.counter].resist : {};
    // 歯車の外殻（連撃対策）：重撃・術で割れる
    this.shellMax = 0; this.shell = 0; this.shellDown = 0;
    this.trueDuel = false;
    this.defeated = false;
    this.pendingPhase = null;
    this.lastMoveName = null;
    this.moveHist = [];
    this.setState('intro');
  }
  get enraged() { return this.brake && this.phase >= 2; }
  get speedMul() { return (this.phase === 3 ? 0.85 : 1) * (this.enraged ? 0.85 : 1) * (this.trueDuel ? 0.9 : 1); }
  get invuln() { return this.state === 'phaseShift' || this.state === 'intro' || this.state === 'defeated' || this.state === 'talk'; }

  think(game, dt) {
    const p = game.player;
    const adx = Math.abs(this.dx(p));
    const wm = this.wmul(game) * this.speedMul;
    if (this.cool > 0) this.cool -= dt;
    if (this.ringT > 0) { this.ringT -= dt; if (this.ringT <= 0) this.ringHits = 0; }
    if (this.counter === 'combo') {
      if (!this.shellMax) { this.shellMax = this.shell = Math.round(this.maxHp * 0.07); }
      if (this.shell <= 0) { this.shellDown -= dt; if (this.shellDown <= 0) { this.shell = this.shellMax; game.fx.setBanner('外殻が戻った', '', '#c9a052', 0.8); } }
    }
    this.lightHits = this.lightHits.filter((t) => game.run.clock - t < 1.2);

    // 残響喰い：周期的に紫の輪をまとう
    if (this.counter === 'echo' && this.state !== 'defeated') {
      this.ringCool -= dt;
      if (this.ringCool <= 0) { this.ringT = 2.5; this.ringCool = 6.5; game.sfx.play('tell'); }
    }

    switch (this.state) {
      case 'intro':
        this.facePlayer(p);
        if (this.stateT > 1.0) this.setState('idle');
        break;
      case 'idle': {
        this.facePlayer(p);
        this.vx = approach(this.vx, adx > 170 ? this.face * 120 : 0, 700 * dt);
        if (this.tryCounter(game, adx)) break;
        if (this.cool <= 0 && p.state !== 'dead') this.chooseMove(game, adx);
        break;
      }
      // 振り子斬り
      case 'swingWind':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.tell = clamp(this.stateT / (0.6 * wm), 0, 1); this.tellKind = this.real ? 'real' : 'pendulum';
        // 読みのフェイント：振りかぶったまま一拍止め、白く光ってから振る
        if (this.feint && !this.feintDone && this.stateT >= 0.6 * wm * 0.55) { this.feintDone = true; this.holdUntil = 0.42; this.setState('feint'); this.tell = 0.6; break; }
        if (this.stateT >= 0.6 * wm) { this.setState('swing'); this.swing++; this.vx = this.face * 260; game.sfx.play('heavySwing'); }
        break;
      case 'swing':
        this.vx = approach(this.vx, 0, 1200 * dt);
        this.attacks.push({ ...this.frontBox(118, 54, -4), dmg: 20, key: this.id * 1000 + this.swing });
        if (this.stateT >= 0.18) {
          // 第3段階・怒り時は針投げへ連携
          if ((this.phase === 3 || this.enraged) && this.rng.next() < 0.55) { this.setState('handsWind'); this.aimHands(p); game.sfx.play('tellBig'); }
          else this.recover(0.55);
        }
        break;
      // 針投げ
      case 'handsWind':
        this.vx = 0;
        this.tell = clamp(this.stateT / (0.5 * wm), 0, 1); this.tellKind = 'hands';
        if (this.stateT >= 0.5 * wm) {
          for (const t of this.targets) {
            const ax = t.x - cx(this), ay = t.y - (this.y + 16);
            const d = Math.hypot(ax, ay) || 1;
            game.spawnProjectile(new Projectile('hand', cx(this) - 6, this.y + 10, ax / d * 430, ay / d * 430, 12));
          }
          game.sfx.play('shoot');
          this.recover(0.45);
        }
        break;
      // 跳躍叩きつけ
      case 'leapWind':
        this.vx = 0;
        this.tell = clamp(this.stateT / (0.3 * wm), 0, 1); this.tellKind = 'crouch';
        if (this.stateT >= 0.3 * wm) {
          this.leapX = clamp(cx(p), 60, game.map.pxW - 60);
          this.setState('leap'); this.vy = -820; this.vx = (this.leapX - cx(this)) / 0.78;
          game.sfx.play('jump');
        }
        break;
      case 'leap':
        this.tell = 1; this.tellKind = 'shadow';
        if (this.stateT > 0.2 && this.onGround) {
          this.setState('slam'); this.swing++; this.vx = 0;
          game.fx.shake(8, 0.25); game.sfx.play('heavyHit'); game.fx.dust(cx(this), this.y + this.h, 12);
          const gy = this.y + this.h - 18;
          game.spawnProjectile(new Projectile('wave', cx(this) - 8, gy, 280, 0, 14));
          game.spawnProjectile(new Projectile('wave', cx(this) - 8, gy, -280, 0, 14));
        }
        break;
      case 'slam':
        if (this.stateT < 0.1) this.attacks.push({ x: this.x - 34, y: this.y + this.h - 30, w: this.w + 68, h: 30, dmg: 22, key: this.id * 1000 + this.swing });
        if (this.stateT >= 0.1) this.recover(0.6);
        break;
      // 時止め（第2段階以降。歯止めに楔があると使えない）
      case 'stopWind':
        this.vx = 0;
        this.tell = clamp(this.stateT / (0.8 * wm), 0, 1); this.tellKind = 'watch';
        if (Math.floor(this.stateT * 6) !== Math.floor((this.stateT - dt) * 6)) game.sfx.play('tick');
        if (this.stateT >= 0.8 * wm) {
          this.setState('stopped');
          game.startTimeStop(1.4);
          const pc = { x: cx(p), y: cy(p) };
          const n = this.phase === 3 ? 5 : 4;
          for (let i = 0; i < n; i++) {
            const ang = -Math.PI / 2 + (i - (n - 1) / 2) * 0.7;
            const pr = new Projectile('hand', pc.x + Math.cos(ang) * 150 - 6, pc.y + Math.sin(ang) * 150 - 6, 0, 0, 14);
            pr.delay = 1.4 + i * 0.06; pr.homing = 470; pr.life = 5;
            game.spawnProjectile(pr);
          }
        }
        break;
      case 'feint':
        this.vx = 0; this.tell = 0.6; this.tellKind = 'pendulum';
        if (this.stateT >= this.holdUntil) { this.real = true; this.setState('swingWind'); this.stateT = 0.6 * wm - 0.16; game.sfx.play('tellBig'); }
        break;
      case 'punishWind':
        this.vx = 0; this.tell = clamp(this.stateT / 0.32, 0, 1); this.tellKind = 'red';
        if (this.stateT >= 0.32) { this.setState('punish'); this.swing++; this.vx = this.face * 520; game.sfx.play('heavySwing'); }
        break;
      case 'punish':
        this.attacks.push({ ...this.frontBox(60, 50), dmg: 20, key: this.id * 1000 + this.swing });
        this.vx = approach(this.vx, 0, 700 * dt);
        if (this.stateT >= 0.35 || (this.coll && this.coll.hitX)) this.recover(1.1);
        break;
      case 'stopped':
        this.vx = 0;
        if (this.stateT >= 1.4) this.recover(0.9);
        break;
      // 対策技
      case 'parry':
        this.vx = 0; this.tell = 1; this.tellKind = 'parry';
        if (this.stateT >= 0.75) this.recover(0.3);
        break;
      case 'riposte':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.stateT >= 0.12 && this.stateT < 0.28) this.attacks.push({ ...this.frontBox(90, 50), dmg: 18, key: this.id * 1000 + this.swing });
        if (this.stateT >= 0.28) this.recover(0.5);
        break;
      case 'stepWind':
        this.vx = 0; this.tell = clamp(this.stateT / 0.25, 0, 1); this.tellKind = 'red';
        if (this.stateT >= 0.25) { this.setState('step'); this.swing++; this.vx = -this.face * 380; this.vy = -260; }
        break;
      case 'step':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.stateT < 0.2) this.attacks.push({ ...this.frontBox(80, 50), dmg: 16, key: this.id * 1000 + this.swing });
        if (this.stateT >= 0.3) this.recover(0.4);
        break;
      case 'antiAirWind':
        this.vx = 0; this.tell = clamp(this.stateT / 0.4, 0, 1); this.tellKind = 'up';
        if (this.stateT >= 0.4) {
          for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) game.spawnProjectile(new Projectile('hand', cx(this) - 6, this.y - 8, Math.sin(a) * 460, -Math.cos(a) * 460, 12));
          game.sfx.play('shoot');
          this.recover(1.0); // 撃った直後は長い隙
        }
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.stateT >= this.recT) { this.cool = this.nextCool(); this.setState('idle'); }
        break;
      case 'stagger':
        this.vx = approach(this.vx, 0, 600 * dt);
        if (this.stateT >= 1.3) { this.cool = 0.2; this.setState('idle'); }
        break;
      case 'phaseShift':
        this.vx = 0;
        if (this.stateT >= 1.3) { this.cool = 0.4; this.setState('idle'); }
        break;
      case 'talk':
      case 'defeated':
        this.vx = approach(this.vx, 0, 600 * dt);
        break;
    }
  }
  nextCool() {
    const base = this.phase === 1 ? 0.75 : this.phase === 2 ? 0.55 : 0.4;
    return base * (this.enraged ? 0.7 : 1) + this.rng.next() * 0.3;
  }
  recover(t) { this.setState('recover'); this.recT = t; }
  aimHands(p) {
    const px = cx(p), py = cy(p);
    this.targets = [{ x: px, y: py }, { x: px - 70, y: py - 20 }, { x: px + 70, y: py - 20 }];
  }
  chooseMove(game, adx) {
    const p = game.player;
    const opts = [];
    if (adx < 150) opts.push('swing', 'swing');
    if (adx > 120) opts.push('hands', 'leap');
    opts.push('hands', 'leap');
    if (this.phase >= 2 && !this.brake && this.lastMoveName !== 'stop') opts.push('stop', 'stop');
    let m = this.rng.pick(opts);
    // 同じ技の3連続は避ける
    if (this.moveHist.length >= 2 && this.moveHist.slice(-2).every((x) => x === m)) m = opts.find((x) => x !== m) || m;
    this.moveHist.push(m); this.lastMoveName = m;
    this.real = false; this.feintDone = false;
    this.feint = this.counter === 'dodge' && this.rng.next() < 0.65;
    if (m === 'swing') { this.setState('swingWind'); game.sfx.play('tellBig'); }
    if (m === 'hands') { this.setState('handsWind'); this.aimHands(p); game.sfx.play('tellBig'); }
    if (m === 'leap') { this.setState('leapWind'); }
    if (m === 'stop') { this.setState('stopWind'); game.sfx.play('tellBig'); }
  }
  tryCounter(game, adx) {
    const p = game.player;
    if (this.counter === 'heavy' && p.state === 'charge' && adx < 170 && this.cool < 0.6) {
      this.setState('parry'); game.sfx.play('tellBig'); return true;
    }
    if (this.counter === 'combo' && this.lightHits.length >= 3) {
      this.lightHits = []; this.facePlayer(p); this.setState('stepWind'); game.sfx.play('tellBig'); return true;
    }
    if (this.counter === 'air') {
      if (this.dy(p) < -50 && adx < 170) this.airWatch += 1 / 60; else this.airWatch = 0;
      if (this.airWatch > 0.22) { this.airWatch = 0; this.setState('antiAirWind'); game.sfx.play('tellBig'); return true; }
    }
    return false;
  }

  // 術を使われたとき（術潰し）
  onPlayerCast(game) {
    if (this.counter !== 'skill' || this.defeated) return;
    if (['idle', 'recover'].includes(this.state)) { this.facePlayer(game.player); this.setState('punishWind'); game.sfx.play('tellBig'); }
  }
  takeHit(game, info) {
    if (this.invuln) return { blocked: true, silent: true };
    const cat = info.echo ? 'echo' : info.cat;
    // 残響喰い：輪の間は残響を吸って回復。直接攻撃 3 回で輪が割れる
    if (this.ringT > 0) {
      if (info.echo) { this.hp = Math.min(this.maxHp, this.hp + info.dmg * 0.5); return { blocked: true, absorbed: true }; }
      if (++this.ringHits >= 3) { this.ringT = 0; this.ringHits = 0; this.setState('stagger'); game.fx.setBanner('輪が割れた', '', '#b67cf0', 0.8); game.sfx.play('guardBreak'); }
    }
    if (this.state === 'parry') {
      if (info.cat === 'heavy') {
        // 受け流し → 斬り返し
        this.setState('riposte'); this.swing++; this.facePlayer(game.player);
        return { blocked: true, parried: true };
      }
      if (!info.echo) { this.setState('stagger'); this.stateT = -0.4; this.hp -= info.dmg; this.hitFlash = 0.12; game.fx.setBanner('構えが崩れた', '', '#5aa9e6', 0.8); return { blocked: false, guardBreak: true }; }
    }
    if (info.cat === 'combo' && !info.echo) this.lightHits.push(game.run.clock);
    // 耐性（対策）。外殻は割れている間は効かない。よろめき中は耐性なし
    let mult = this.resist[cat] ?? 1;
    if (this.counter === 'combo' && this.shell <= 0) mult = 1;
    if (this.state === 'stagger') mult = 1;
    if (this.counter === 'combo' && this.shell > 0 && (info.cat === 'heavy' || info.cat === 'skill')) {
      this.shell -= info.dmg;
      game.fx.sparks(cx(this), cy(this), '#c9a052', 6);
      if (this.shell <= 0) { this.shellDown = 7; this.setState('stagger'); this.stateT = -0.3; game.fx.setBanner('外殻が割れた', '7秒間、連撃が通る', '#f2c14e', 1.2); game.sfx.play('guardBreak'); game.fx.shake(6, 0.2); }
    }
    const dmg = Math.round(info.dmg * mult);
    this.hp -= dmg;
    this.hitFlash = 0.1;
    // 怯みゲージ：溜まると大きくよろめく（HP に比例）
    if (!info.passive) this.poiseDmg += dmg * (info.cat === 'heavy' ? 2 : 1); // 常時の術ではよろめかない
    const busy = ['stopped', 'stopWind', 'leap', 'phaseShift'].includes(this.state);
    if (this.poiseDmg >= this.maxHp * 0.14 && !busy) { this.poiseDmg = 0; this.setState('stagger'); game.sfx.play('guardBreak'); game.fx.shake(5); return { blocked: false, guardBreak: true }; }
    this.checkPhase(game);
    return { blocked: false, dmg, resisted: mult < 1 };
  }
  checkPhase(game) {
    const r = this.hp / this.maxHp;
    if (this.hp <= 0) {
      this.hp = 0;
      this.defeated = true;
      this.setState('defeated');
      game.onBossDefeated(this);
      return;
    }
    if (this.phase === 1 && r <= this.p2At) {
      this.phase = 2; this.setState('phaseShift');
      game.onBossPhase(this, 2);
    } else if (this.phase === 2 && r <= this.p3At) {
      this.phase = 3; this.setState('phaseShift');
      game.onBossPhase(this, 3);
    }
  }
}

// 時止めの刃：止まった時間が戻った瞬間にプレイヤーへ向かう
export function updateHoming(pr, game) {
  if (pr.homing && pr.delay <= 0 && !pr.launched) {
    const p = game.player;
    const ax = cx(p) - (pr.x + pr.w / 2), ay = cy(p) - (pr.y + pr.h / 2);
    const d = Math.hypot(ax, ay) || 1;
    pr.vx = ax / d * pr.homing; pr.vy = ay / d * pr.homing;
    pr.launched = true;
  }
}
export { sign };
