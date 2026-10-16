import { PLAYER as P, ATTACKS, F } from './config.js';
import { approach, sign } from './util.js';
import { moveBody, standingOnOneway } from './tilemap.js';
import { computeStats } from './boons.js';
import { applyArtifacts } from './artifacts.js';
import { spawnWave, MELEE } from './arts.js';

export class Player {
  constructor(x, y) {
    this.w = P.w; this.h = P.h;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.face = 1;
    this.onGround = false;
    this.state = 'normal';
    this.stateT = 0;
    this.coyoteT = 0;
    this.bufferT = 0;
    this.dodgeCd = 0;
    this.iframeT = 0;
    this.airDodgeUsed = false;
    this.airJumpsLeft = P.airJumps;
    this.aimY = 0; // ↑=-1 / ↓=1（方向攻撃の向き）
    this.stepT = 0;
    this.atk = null; // {name, def, t, hitIds:Set, queued}
    this.comboIndex = 0;
    this.comboGrace = 0;
    this.holdT = 0; // 攻撃ボタンを押し続けている時間
    this.charged = false;
    this.boons = [];
    this.artifacts = []; // その夜だけのアーティファクト
    this.stats = applyArtifacts(computeStats([]), []);
    this.baseMaxHp = P.maxHp;
    this.maxHp = P.maxHp;
    this.hp = P.maxHp;
    this.gauge = 0;
    this.sinceDodge = 99; // 回避開始からの経過
    this.perfectUsed = false;
    this.empowerNext = 1; // 逆さ時計
    this.dropT = 0;
    this.squash = 0; // 描画用（着地・跳躍の伸縮）
    this.runAnim = 0;
    this.channel = null; // 楔を打つなどの溜め動作
    this.landedThisFrame = false;
    this.skillT = 0;
    this.lastSafe = { x, y };
    this.afterT = 0; // 残影の一撃の受付
  }

  setBoons(boons) {
    const ratio = this.hp / this.maxHp;
    this.boons = boons;
    this.stats = applyArtifacts(computeStats(boons), this.artifacts || []);
    this.maxHp = Math.round((this.baseMaxHp + this.stats.hpAdd) * this.stats.maxHpMul);
    this.hp = Math.max(1, Math.min(this.maxHp, Math.round(this.maxHp * ratio)));
  }

  addArtifact(id) {
    if (this.artifacts.includes(id)) return false;
    const hp = this.hp;
    this.artifacts = [...this.artifacts, id];
    this.setBoons(this.boons);
    this.hp = Math.min(this.maxHp, hp + (this.stats.hpAdd && id === 'timeheart' ? this.stats.hpAdd : 0));
    return true;
  }
  get airJumpMax() { return P.airJumps + (this.stats.extraAirJumps || 0); }

  get invulnerable() { return this.iframeT > 0 || this.state === 'dead'; }
  get dodging() { return this.state === 'dodge'; }

  canAct() { return this.state === 'normal'; }

  update(game, input, dt) {
    const map = game.map;
    this.stateT += dt;
    this.sinceDodge += dt;
    if (this.iframeT > 0) this.iframeT -= dt;
    if (this.dodgeCd > 0) this.dodgeCd -= dt;
    if (this.comboGrace > 0) this.comboGrace -= dt; else if (this.state === 'normal') this.comboIndex = 0;
    if (this.dropT > 0) this.dropT -= dt;
    if (this.parryT > 0) this.parryT -= dt;
    if (this.frenzyT > 0) { this.frenzyT -= dt; if (this.frenzyT <= 0) this.frenzyN = 0; }
    if (this.saintT > 0) this.saintT -= dt;
    this.squash = approach(this.squash, 0, dt * 5);
    if (this.flipT > 0) this.flipT -= dt; // 前転
    this.landedThisFrame = false;

    if (input.down('attack')) this.holdT += dt; else if (this.state !== 'charge') this.holdT = 0;

    // ジャンプの先行入力
    if (input.pressed('jump')) this.bufferT = P.jumpBuffer; else if (this.bufferT > 0) this.bufferT -= dt;

    this.aimY = input.down('up') ? -1 : input.down('down') ? 1 : 0;
    const dirX = input.dirX ? input.dirX() : (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0);

    switch (this.state) {
      case 'normal': this.updateNormal(game, input, dt, dirX); break;
      case 'attack': this.updateAttack(game, input, dt, dirX); break;
      case 'charge': this.updateCharge(game, input, dt, dirX); break;
      case 'dodge': this.updateDodge(game, input, dt); break;
      case 'hurt': this.updateHurt(dt); this.stopAtAbyss(game.map, dt); break;
      case 'channel': this.updateChannel(game, input, dt); break;
      case 'dead': this.vx = approach(this.vx, 0, 900 * dt); break;
      case 'frozen': this.vx = 0; break; // 会話・演出中
    }

    // 重力（回避中は無重力）
    if (this.state !== 'dodge') {
      const g = P.gravity * (this.vy > 0 ? P.fallGravityMul : 1);
      this.vy = Math.min(this.vy + g * dt, P.maxFall);
    }
    const wasGround = this.onGround;
    if (!this.onGround) this.fallV = this.vy;
    const r = moveBody(this, map, dt, { dropThrough: this.dropT > 0 });
    this.onGround = r.onGround;
    if (this.onGround) {
      this.coyoteT = P.coyote;
      this.airDodgeUsed = false;
      this.airJumpsLeft = this.airJumpMax;
      if (!wasGround) {
        this.landedThisFrame = true;
        this.squash = -0.35;
        // 落ちた速さに応じて左右に砂煙が広がる
        const hard = this.fallV > 700;
        game.fx.landPuff(this.x + this.w / 2, this.y + this.h, hard ? 1 : 0.5);
        if (hard) game.fx.shake(1.5, 0.05);
        game.sfx.play('land');
      }
      // 安全な足場を覚えておく（奈落からの救済用）
      // 戻し先は「両足とも固い床の上」のときだけ記録する（崖の縁ぎりぎりを避ける）
      if (this.state === 'normal' && !standingOnOneway(this, map) && map.solidAt(this.x + 1, this.y + this.h + 2) && map.solidAt(this.x + this.w - 1, this.y + this.h + 2)) this.lastSafe = { x: this.x, y: this.y };
    } else if (this.coyoteT > 0) this.coyoteT -= dt;
    if (r.hitCeil && this.vy < 0) this.vy = 0;

    // 奈落
    if (this.y > map.pxH + 60 && this.state !== 'dead') {
      this.x = this.lastSafe.x; this.y = this.lastSafe.y - 2; this.vx = this.vy = 0;
      game.damagePlayer(12, { fromX: this.x, pit: true });
    }
    if (this.onGround && Math.abs(this.vx) > 20) this.runAnim += dt * Math.abs(this.vx) / 30;
    // 走りの足音の砂煙と、切り返しの土煙
    if (this.onGround && this.state === 'normal' && Math.abs(this.vx) > 180) {
      this.stepT -= dt;
      if (this.stepT <= 0) { this.stepT = 0.16; game.fx.step(this.x + this.w / 2 - sign(this.vx) * 6, this.y + this.h, -sign(this.vx)); }
    }
    if (this.onGround && this.state === 'normal' && dirX !== 0 && sign(this.vx) === -dirX && Math.abs(this.vx) > 120) game.fx.skid(this.x + this.w / 2 + dirX * 6, this.y + this.h, dirX);
  }

  tryJump(game, input) {
    if (this.bufferT > 0 && this.coyoteT > 0) {
      // 下＋ジャンプですり抜け床を降りる
      if (input.down('down') && this.onGround && standingOnOneway(this, game.map)) {
        this.dropT = 0.2; this.bufferT = 0; this.coyoteT = 0; this.onGround = false; this.y += 1;
        return true;
      }
      this.vy = -P.jumpVel;
      this.bufferT = 0; this.coyoteT = 0; this.onGround = false;
      this.squash = 0.35; this.flipT = 0.34;
      game.fx.jumpPuff(this.x + this.w / 2, this.y + this.h);
      game.sfx.play('jump');
      return true;
    }
    // 2段ジャンプ：空中でもう一度跳べる（着地・下突きの命中で回復）
    if (this.bufferT > 0 && !this.onGround && this.airJumpsLeft > 0) {
      this.airJumpsLeft--;
      this.vy = -P.airJumpVel;
      this.bufferT = 0;
      this.squash = 0.3; this.flipT = 0.34;
      game.fx.airJump(this.x + this.w / 2, this.y + this.h, this);
      game.sfx.play('airJump');
      return true;
    }
    return false;
  }

  horizontal(dirX, dt, speedMul = 1) {
    const max = P.runSpeed * this.stats.moveMul * speedMul;
    if (dirX !== 0) {
      const turning = sign(this.vx) !== 0 && sign(this.vx) !== dirX;
      const acc = this.onGround ? (turning ? P.turnAccel : P.groundAccel) : P.airAccel;
      this.vx = approach(this.vx, dirX * max, acc * dt);
    } else {
      this.vx = approach(this.vx, 0, (this.onGround ? P.groundDecel : P.airDecel) * dt);
    }
  }

  updateNormal(game, input, dt, dirX) {
    if (dirX !== 0) this.face = dirX;
    this.horizontal(dirX, dt);
    this.tryJump(game, input);
    if (!input.down('jump') && this.vy < 0) this.vy *= Math.pow(P.jumpCutMul, dt * 60 / 4) ; // 早く離すと低いジャンプ
    if (input.pressed('dodge')) { if (this.startDodge(game, dirX)) return; }
    if (input.pressed('attack')) { this.startAttack(game, dirX, this.parryT > 0 ? 'parry' : undefined); this.parryT = 0; return; }
    if (input.pressed('skill')) game.useSkill();
  }

  startDodge(game, dirX) {
    if (this.dodgeCd > 0) return false;
    if (!this.onGround && this.airDodgeUsed) return false;
    if (!this.onGround) this.airDodgeUsed = true;
    if (dirX !== 0) this.face = dirX;
    this.state = 'dodge'; this.stateT = 0;
    this.dodgeCount = (this.dodgeCount || 0) + 1;
    this.dodgeFrom = { x: this.x, y: this.y, w: this.w, h: this.h }; // ジャスト回避の判定に使う
    this.atk = null;
    this.iframeT = this.stats.dodgeIframes ?? P.dodgeIframes;
    this.sinceDodge = 0;
    this.perfectUsed = false;
    this.vy = 0;
    this.dodgeCd = P.dodgeCooldown * this.stats.dodgeCdMul + P.dodgeTime;
    if (this.stats.afterimageTime) this.afterT = P.dodgeTime + this.stats.afterimageTime;
    game.sfx.play('dodge');
    game.fx.afterimage(this);
    if (game.onDodge) game.onDodge();
    return true;
  }

  // 足元の先が底なしの穴なら止まる（地上の回避と吹き飛びだけ。空中の回避は止めない）
  stopAtAbyss(map, dt) {
    if (!this.onGround || this.vx === 0) return;
    const fx = this.vx > 0 ? this.x + this.w + this.vx * dt + 2 : this.x + this.vx * dt - 2;
    if (map.groundBelow(fx, this.y + this.h + 1) >= map.pxH) this.vx = 0;
  }
  updateDodge(game, input, dt) {
    const t = this.stateT / P.dodgeTime;
    const speed = P.dodgeSpeed * this.stats.dodgeDistMul * (t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3 * 0.7);
    this.vx = this.face * speed;
    this.stopAtAbyss(game.map, dt);
    if (Math.floor(this.stateT / (3 * F)) !== Math.floor((this.stateT - dt) / (3 * F))) game.fx.afterimage(this);
    // 回避の後半に攻撃を押すとパリィ斬り
    if (this.stateT > P.dodgeTime * 0.45 && input.pressed('attack')) { this.parryT = 0; this.startAttack(game, 0, 'parry'); return; }
    if (this.stateT >= P.dodgeTime) {
      this.state = 'normal'; this.stateT = 0;
      this.vx = this.face * P.runSpeed * 0.8;
      this.parryT = P.parryWindow; // この間の攻撃はパリィ斬り
    }
    // 回避の終わり際はジャンプでキャンセル可能（地上のみ）
    if (this.stateT > P.dodgeTime * 0.5 && this.onGround && this.bufferT > 0) {
      this.state = 'normal';
      this.tryJump(game, input);
    }
  }

  attackDef(name) {
    const d = ATTACKS[name];
    const speed = this.stats.comboSpeed * (1 + 0.04 * (this.stats.frenzy || 0) * (this.frenzyN || 0)); // 乱舞
    if (speed !== 1 && d.cat === 'combo') {
      const k = 1 / speed;
      return { ...d, startup: d.startup * k, active: d.active, recovery: d.recovery * k, cancel: d.cancel * k };
    }
    if (name === 'combo4') return { ...d, dmg: this.stats.fourthDmg };
    return d;
  }

  startAttack(game, dirX, forceName) {
    if (dirX !== 0) this.face = dirX;
    let name = forceName;
    if (!name) {
      if (this.aimY < 0) name = this.onGround ? 'up' : 'upAir';
      else if (this.aimY > 0) name = this.onGround ? 'sweep' : 'down';
      else if (!this.onGround) name = 'air';
      else {
        const max = this.stats.fourth ? 4 : 3;
        this.comboIndex = this.comboIndex % max + 1;
        name = 'combo' + this.comboIndex;
      }
    }
    const def = this.attackDef(name);
    this.atk = { name, def, t: 0, hitIds: new Set(), queued: false, swung: false };
    this.state = 'attack'; this.stateT = 0;
    // 踏み込み。走っている勢いは半分残す（急停止しない）
    if (this.onGround && def.lunge) this.vx = this.face * Math.max(def.lunge, Math.abs(this.vx) * 0.5 * (sign(this.vx) === this.face ? 1 : 0));
    if ((name === 'air' || name === 'upAir') && this.vy > 0) this.vy *= 0.5;
    if (name === 'down') this.vy = Math.max(this.vy, 120); // 下突きは少し沈み込む // 空中攻撃で少しだけ滞空
    if (name === 'parry') { this.comboIndex = 0; game.sfx.play('perfect'); if (!this.onGround) this.vy = Math.min(this.vy, 0); }
  }

  // 攻撃判定の矩形（持続中のみ）
  hitbox() {
    const a = this.atk;
    if (!a || this.state !== 'attack') return null;
    let d = a.def;
    if (a.t < d.startup || a.t >= d.startup + d.active) return null;
    const mx = this.x + this.w / 2;
    const rm = this.stats.rangeMul || 1; // 剛剣
    if (rm !== 1) d = { ...d, w: d.w * rm, h: d.h * rm };
    // 頭上・足元の攻撃：体ごと覆う
    if (d.dir === 'up') return { x: mx - d.w / 2, y: this.y - d.h, w: d.w, h: d.h + this.h };
    if (d.dir === 'down') return { x: mx - d.w / 2, y: this.y, w: d.w, h: this.h + d.h };
    const ox = d.ox || 0, oy = d.oy || 0;
    const x = this.face > 0 ? this.x + this.w + ox : this.x - d.w - ox;
    const fx = d.spin ? mx - d.w / 2 : x;
    const fy = this.y + this.h / 2 - d.h / 2 + oy;
    // 前方の判定と、主人公の体（少し背中側まで）を合わせた範囲。密着した敵にも当たる
    const x0 = Math.min(fx, this.x - 4), x1 = Math.max(fx + d.w, this.x + this.w + 4);
    const y0 = Math.min(fy, this.y), y1 = Math.max(fy + d.h, this.y + this.h);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  updateAttack(game, input, dt, dirX) {
    const a = this.atk;
    const d = a.def;
    a.t += dt;
    if (!a.swung && a.t >= d.startup) {
      a.swung = true; game.sfx.play(a.name === 'heavy' ? 'heavySwing' : 'swing'); game.fx.slash(this, a.name);
      if (this.stats.wave && this.onGround && game.room) spawnWave(game, this);
      // 剣の道：振りから飛ぶ斬撃・衝撃波・刃
      const st = this.stats;
      if (game.room) {
        if ((st.swordqi || st.thousand) && this.onGround && a.name.startsWith('combo')) MELEE.qi(game, this);
        if (st.crusher && a.name === 'heavy') MELEE.crush(game, this, st.crusher);
        if (st.skyrend && (a.name === 'up' || a.name === 'upAir')) MELEE.rend(game, this, st.skyrend, -1);
        if (st.skyrend && a.name === 'down') MELEE.rend(game, this, st.skyrend, 1);
      }
      if (this.onGround && d.lunge >= 90) game.fx.step(this.x + this.w / 2 - this.face * 6, this.y + this.h, -this.face); // 踏み込みの土煙
    }
    // 移動：地上は踏み込み後に減速、空中はゆるく制御可能
    if (this.onGround) this.vx = approach(this.vx, 0, 1400 * dt);
    else this.horizontal(dirX, dt, 0.7);
    if (input.pressed('attack') && a.name !== 'heavy') a.queued = true;
    const total = d.startup + d.active + d.recovery;
    const inRecovery = a.t >= d.startup + d.active;
    // 硬直のキャンセル：回避・ジャンプ
    if (inRecovery) {
      if (input.pressed('dodge') && this.startDodge(game, dirX)) return;
      if (this.bufferT > 0 && this.tryJump(game, input)) { this.state = 'normal'; this.atk = null; return; }
    }
    // 連撃の移行
    if (a.queued && a.t >= d.cancel && a.name !== 'heavy' && a.name !== 'parry') {
      const max = this.stats.fourth ? 4 : 3;
      // 方向攻撃・空中攻撃はいつでも次へつなげられる。地上の連撃は最大段数まで
      if (!a.name.startsWith('combo') || this.aimY !== 0 || !this.onGround || this.comboIndex < max) { this.startAttack(game, dirX); return; }
    }
    if (a.t >= total) {
      this.atk = null;
      this.comboGrace = 10 * F;
      if (input.down('attack') && a.name !== 'heavy' && this.holdT > 6 * F) {
        this.state = 'charge'; this.stateT = 0; this.charged = false;
      } else {
        this.state = 'normal'; this.stateT = 0;
        if (a.name.startsWith('combo') && this.comboIndex >= (this.stats.fourth ? 4 : 3)) this.comboIndex = 0;
      }
    }
  }

  updateCharge(game, input, dt, dirX) {
    if (dirX !== 0) this.face = dirX;
    this.horizontal(dirX, dt, 0.35);
    if (!this.charged && this.holdT >= P.heavyCharge * (this.stats.chargeMul || 1)) {
      this.charged = true;
      game.sfx.play('charged');
      game.fx.ring(this.x + this.w / 2, this.y + this.h / 2, '#f2c14e', 26);
    }
    if (input.pressed('dodge') && this.startDodge(game, dirX)) { this.holdT = 0; return; }
    if (!input.down('attack')) {
      this.holdT = 0;
      if (this.charged) { this.startAttack(game, 0, 'heavy'); this.comboIndex = 0; }
      else { this.state = 'normal'; this.stateT = 0; }
      return;
    }
    // 溜め中もジャンプは可（溜めは維持）
    if (this.onGround) this.tryJump(game, input);
  }

  updateHurt(dt) {
    this.vx = approach(this.vx, 0, 800 * dt);
    if (this.stateT >= P.hurtStun) { this.state = 'normal'; this.stateT = 0; }
  }

  startChannel(duration, label, onDone, onCancel) {
    this.state = 'channel'; this.stateT = 0;
    this.channel = { duration, label, onDone, onCancel };
    this.vx = 0;
  }
  updateChannel(game, input, dt) {
    this.vx = 0;
    const c = this.channel;
    if (input.pressed('dodge') || input.pressed('jump')) {
      this.state = 'normal'; this.channel = null; c.onCancel && c.onCancel(); return;
    }
    if (this.stateT >= c.duration) {
      this.state = 'normal'; this.channel = null; c.onDone();
    }
  }

  hurt(dmg, fromX) {
    this.hp = Math.max(0, this.hp - dmg);
    this.atk = null; this.channel = null;
    if (this.hp <= 0) {
      this.state = 'dead'; this.stateT = 0;
      this.vy = -300; this.vx = sign(this.x - fromX || 1) * 120;
      return;
    }
    this.state = 'hurt'; this.stateT = 0;
    this.iframeT = P.hurtIframes;
    const dir = sign(this.x + this.w / 2 - fromX) || -this.face;
    this.vx = dir * P.hurtKnockX;
    this.vy = P.hurtKnockY;
    this.comboIndex = 0;
  }
}
