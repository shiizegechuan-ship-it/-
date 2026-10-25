import type { AbilityId } from '../data/abilities';
import { PLAYER, WORLD } from '../data/tuning';
import { wrapAngle } from '../math';
import { Sim, type EnemyState } from '../sim';
import { emptyInput, type InputFrame } from '../input';
import type { RouteNode } from '../levels/types';

/**
 * 章の道しるべ（route）をたどる自動プレイ。テストと性能計測に使う。
 * skill：0 = 下手（駆で避けない・攻撃が遅い）、1 = 普通
 */
export class RouteBot {
  idx = 0;
  waitT = 0;
  stuckT = 0;
  lastDist = Infinity;
  log: string[] = [];
  private toggled = false;
  private frame = 0;
  constructor(
    private sim: Sim,
    private skill = 1,
    /** 店での売買を上書き（分岐を試す） */
    private shopPlan?: (node: RouteNode, sim: Sim) => { pawn?: AbilityId[]; redeem?: AbilityId[] } | null,
    /** 売買の実行（既定は Sim を直接。アプリでは演出つきの取引に差し替える） */
    private trade: (kind: 'pawn' | 'redeem', id: AbilityId) => void = (k, id) => {
      if (k === 'pawn') this.sim.doPawn(id);
      else this.sim.doRedeem(id);
    },
  ) {}

  get done(): boolean {
    return this.idx >= this.sim.level.route.length;
  }

  next(): InputFrame {
    this.frame++;
    const sim = this.sim;
    const inp = emptyInput(0);
    const route = sim.level.route;
    if (this.done) return inp;
    const raw = route[this.idx];
    const node = raw.alt && !sim.has(raw.alt.whenPawned as AbilityId) ? { ...raw, x: raw.alt.x, z: raw.alt.z } : raw;
    const p = sim.player;
    const b = p.body;
    if (p.mode === 'dead') return inp;

    // 夜守との戦い
    const boss = sim.boss;
    if (boss && sim.flag('boss_fighting') && boss.mode !== 'kneel') return this.fightBoss(inp, boss);

    // 近くの妖と戦う（fight の点の前後・襲われたとき）
    const foe = this.closestFoe(node.act === 'fight' ? 9 : 3.2);
    if (foe) {
      const dx = foe.body.x - b.x;
      const dz = foe.body.z - b.z;
      const d = Math.hypot(dx, dz);
      const immune = foe.def.fanImmune || (foe.def.needsShadowLaw && sim.has('lantern'));
      if (immune || !sim.has('fan')) {
        // 扇が効かない：かわして先へ
      } else {
        if (d > 1.3) this.steer(inp, dx, dz);
        if (d < 2.0 && this.frame % (this.skill > 0 ? 6 : 14) === 0) inp.attackPressed = true;
        if (this.skill > 0 && foe.mode === 'windup' && foe.t > foe.def.windup - 0.1 && sim.has('dash')) {
          inp.dashPressed = true;
          this.steer(inp, -dz, dx);
        }
        return inp;
      }
    }

    const dx = node.x - b.x;
    const dz = node.z - b.z;
    const dist = Math.hypot(dx, dz);
    const r = node.r ?? 0.9;
    // 仕掛けの時機を見る（危ない帯の手前で待つ）
    if (this.skill > 0 && this.hazardAhead()) return inp;

    if (node.act === 'lantern' && sim.has('lantern') && !p.lanternOn && !this.toggled) {
      inp.lanternPressed = true;
      this.toggled = true;
    }

    const bossPending = node.act === 'fight' && !!sim.boss && !sim.flag('boss_done');
    if (dist < r && Math.abs(node.y - b.y) < 1.2 && !bossPending) {
      if (node.act === 'wait' && this.waitT < (node.wait ?? 1)) {
        this.waitT += 1 / 60;
        return inp;
      }
      if (node.act === 'shop') this.shop(node);
      if (node.act === 'read') {
        // 調べられる所まで寄ってから押す
        if (sim.interactable()?.kind !== 'read') {
          const rd = sim.level.readables.reduce((a, c) => (Math.hypot(c.x - b.x, c.z - b.z) < Math.hypot(a.x - b.x, a.z - b.z) ? c : a));
          this.steer(inp, rd.x - b.x, rd.z - b.z);
          return inp;
        }
        inp.interactPressed = true;
      }
      this.log.push(`node ${this.idx} @${sim.frame}`);
      this.idx++;
      this.waitT = 0;
      this.toggled = false;
      this.stuckT = 0;
      this.lastDist = Infinity;
      return inp;
    }
    this.steer(inp, dx, dz);
    if (node.act === 'jump' && dist < 1.8 && b.onGround) {
      inp.jumpPressed = true;
    }
    inp.jumpHeld = true;
    // 詰まったら跳んでみる（段差など）
    if (dist > this.lastDist - 0.002) this.stuckT += 1 / 60;
    else this.stuckT = Math.max(0, this.stuckT - 1 / 60);
    this.lastDist = Math.min(this.lastDist, dist);
    if (this.stuckT > 1.2 && b.onGround && sim.has('jump')) {
      inp.jumpPressed = true;
      this.stuckT = 0.6;
    }
    return inp;
  }

  /** 夜守：予兆を見て避け、隙に払う。skill 0 は避けが遅い */
  private fightBoss(inp: InputFrame, boss: EnemyState): InputFrame {
    const sim = this.sim;
    const b = sim.player.body;
    const dx = boss.body.x - b.x;
    const dz = boss.body.z - b.z;
    const d = Math.hypot(dx, dz) || 1;
    // 呼ばれた面の妖が近ければ先に払う
    const minion = this.closestFoe(2.2);
    if (minion && minion !== boss && sim.has('fan')) {
      this.steer(inp, minion.body.x - b.x, minion.body.z - b.z);
      if (this.frame % 6 === 0) inp.attackPressed = true;
      return inp;
    }
    // 飛んでくる扇
    for (const pr of sim.projectiles) {
      const rx = b.x - pr.x;
      const rz = b.z - pr.z;
      const along = (rx * pr.vx + rz * pr.vz) / Math.hypot(pr.vx, pr.vz);
      const side = Math.abs(rx * pr.vz - rz * pr.vx) / Math.hypot(pr.vx, pr.vz);
      if (along > 0 && along < 3.5 && side < 1.0) {
        this.steer(inp, pr.vz, -pr.vx);
        if (this.skill > 0 && along < 1.4 && sim.has('dash')) inp.dashPressed = true;
        return inp;
      }
    }
    const react = this.skill > 0 ? 1 : 0.55; // 下手なボットは予兆の後半にならないと動かない
    if (boss.mode === 'windup') {
      const wu = boss.move === 'slam' ? 0.95 : boss.move === 'fans' ? 0.85 : 0.75;
      if (boss.t > wu * (1 - react)) {
        if (boss.move === 'slam') this.steer(inp, -dx, -dz);
        else {
          // 向きに対して横へ
          const fx = Math.sin(boss.yaw);
          const fz = Math.cos(boss.yaw);
          const sgn = (b.x - boss.body.x) * fz - (b.z - boss.body.z) * fx >= 0 ? 1 : -1;
          this.steer(inp, fz * sgn, -fx * sgn);
        }
        if (this.skill > 0 && boss.t > wu - 0.12 && sim.has('dash') && (boss.move !== 'slam' || d < 3.6)) inp.dashPressed = true;
        return inp;
      }
    }
    if (boss.mode === 'attack' && boss.move === 'slam' && d < 4) {
      this.steer(inp, -dx, -dz);
      return inp;
    }
    // 近づいて払う
    if (d > 1.7) this.steer(inp, dx, dz);
    if (d < 2.3 && sim.has('fan') && this.frame % (this.skill > 0 ? 6 : 12) === 0) inp.attackPressed = true;
    return inp;
  }

  /** これから通る仕掛けが、通り抜ける間に危なくなるなら true（手前で待つ） */
  private hazardAhead(): boolean {
    const sim = this.sim;
    const b = sim.player.body;
    const rate = sim.ledger.pawned.includes('dash') ? WORLD.slowLawTimeScale : 1;
    for (const h of sim.level.hazards) {
      if (Math.abs(b.y - h.y) > 2) continue;
      if (h.kind === 'blade') {
        if (Math.abs(b.x - h.x) > (h.width ?? 4) / 2) continue;
        const reach = h.radius * Math.sin(Sim.BLADE_ARC) + 0.75;
        const before = h.z - reach - b.z; // 帯の手前までの距離
        if (before < 0 || before > 1.2) continue; // 帯の中・遠い所では判断しない
        // 今走り出したら、各時刻の自分の z と羽根の先の z が重なるか
        const cross = (2 * reach + before + 0.4) / PLAYER.runSpeed;
        for (let t = 0; t <= cross; t += 0.03) {
          const pz = b.z + PLAYER.runSpeed * Math.max(0, t - 0.08);
          const clock = sim.hazardClock + t * rate;
          for (let k = 0; k < 2; k++) {
            const d = wrapAngle((clock / h.period + (h.phase ?? 0)) * Math.PI * 2 * (h.dir ?? 1) + k * Math.PI);
            if (Math.abs(d) > Sim.BLADE_ARC + 0.05) continue;
            const tipZ = h.z + Math.sin(d) * h.radius;
            if (Math.abs(pz - tipZ) < 0.35 + b.hw + 0.35) return true;
          }
        }
      } else {
        const dzr = h.z - b.z;
        if (dzr < h.radius || dzr > h.radius + 1.0 || Math.abs(b.x - h.x) > h.radius + 0.6) continue;
        const cross = (2 * h.radius + 1.6) / PLAYER.runSpeed;
        for (let t = 0; t <= cross; t += 0.04) {
          const u = (sim.hazardClock + t * rate) / h.period + (h.phase ?? 0);
          const f = u - Math.floor(u);
          if (f >= Sim.ROCK_FALL - 0.03 && f < Sim.ROCK_FALL + 0.1) return true;
        }
      }
    }
    return false;
  }

  private shop(node: RouteNode): void {
    const plan = this.shopPlan ? this.shopPlan(node, this.sim) : { pawn: node.pawn as AbilityId[] | undefined, redeem: node.redeem as AbilityId[] | undefined };
    if (!plan) return;
    for (const id of plan.pawn ?? [])
      if (this.sim.has(id)) {
        this.trade('pawn', id);
        this.log.push(`pawn ${id} zeni=${this.sim.ledger.zeni}`);
      }
    for (const id of plan.redeem ?? [])
      if (!this.sim.has(id)) {
        this.trade('redeem', id);
        this.log.push(`redeem ${id} zeni=${this.sim.ledger.zeni}`);
      }
  }

  private closestFoe(range: number) {
    const b = this.sim.player.body;
    let best = null;
    let bd = range;
    for (const e of this.sim.enemies) {
      if (e.mode === 'dead' || e.mode === 'float' || e.mode === 'flee' || e.mode === 'kneel') continue;
      const d = Math.hypot(e.body.x - b.x, e.body.z - b.z);
      if (d < bd && Math.abs(e.body.y - b.y) < 1.5) { bd = d; best = e; }
    }
    return best;
  }

  /** 世界の向き (wx,wz) へ進む入力（camYaw=0 のとき：wx=-moveX, wz=moveY）。風があれば風上へ向けて打ち消す */
  private steer(inp: InputFrame, wx: number, wz: number): void {
    const l = Math.hypot(wx, wz) || 1;
    let dx = (wx / l) * PLAYER.runSpeed - this.sim.wind.x;
    let dz = (wz / l) * PLAYER.runSpeed - this.sim.wind.z;
    const m = Math.hypot(dx, dz) || 1;
    dx /= m;
    dz /= m;
    inp.moveX = -dx;
    inp.moveY = dz;
  }
}
