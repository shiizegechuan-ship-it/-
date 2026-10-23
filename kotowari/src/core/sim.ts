import { ABILITIES, type AbilityId } from './data/abilities';
import { ENEMIES, type EnemyDef } from './data/enemies';
import { ATTACK, BOSS, DASH, DT, LANTERN, PLAYER, WORLD } from './data/tuning';
import { canPawn, canRedeem, earn, isPawned, newLedger, pawn, redeem, type Ledger, type TradeResult } from './economy';
import type { SimEvent } from './events';
import type { InputFrame } from './input';
import type { ChapterId, EnemySpawn, HazardDef, LevelDef, PickupDef, ShrineDef } from './levels/types';
import { approach, wrapAngle } from './math';
import { newBody, type Body } from './physics';
import { Rng } from './rng';
import { LevelWorld } from './world';

export type PlayerMode = 'normal' | 'attack' | 'dash' | 'hurt' | 'dead';
export type SwingPhase = 'startup' | 'active' | 'recovery';

export interface PlayerState {
  body: Body;
  yaw: number;
  hp: number;
  mode: PlayerMode;
  modeT: number;
  coyoteT: number;
  jumpBufT: number;
  attackBufT: number;
  jumping: boolean;
  combo: number;
  phase: SwingPhase;
  swingHits: Set<string>;
  dashCd: number;
  airDashUsed: boolean;
  dashDirX: number;
  dashDirZ: number;
  perfectCd: number;
  perfectBonus: boolean;
  invulnT: number;
  lanternOn: boolean;
  safe: { x: number; y: number; z: number };
  safeT: number;
  airT: number;
  /** 描画用：直近の走りの速さ 0..1 */
  runAmt: number;
}

export type EnemyMode = 'idle' | 'chase' | 'windup' | 'attack' | 'recover' | 'stagger' | 'float' | 'flee' | 'dead' | 'kneel' | 'transition';

export interface Projectile {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  radius: number;
  spin: number;
}

export type BossMove = 'lunge' | 'slam' | 'fans';

export interface EnemyState {
  spawn: EnemySpawn;
  id: string;
  def: EnemyDef;
  body: Body;
  yaw: number;
  hp: number;
  mode: EnemyMode;
  t: number;
  kx: number;
  kz: number;
  attackHit: boolean;
  flash: number;
  floatOff: number;
  deadT: number;
  /** 描画用 */
  anim: number;
  /** ボスだけ：今の技と段階 */
  move?: BossMove;
  phase?: number;
  moveCount?: number;
}

export interface Progress {
  chapter: ChapterId;
  shrine: string | null;
  ledger: Ledger;
  flags: Record<string, boolean>;
  collected: string[];
}

export const newProgress = (chapter: ChapterId = 'prologue'): Progress => ({
  chapter,
  shrine: null,
  ledger: newLedger(),
  flags: {},
  collected: [],
});

export type Interactable = { kind: 'shrine'; def: ShrineDef } | { kind: 'read'; id: string; script: string; label: string };

export type LevelLookup = (id: ChapterId) => LevelDef;

export class Sim {
  progress: Progress;
  world!: LevelWorld;
  player!: PlayerState;
  enemies: EnemyState[] = [];
  pickups: { def: PickupDef; taken: boolean }[] = [];
  projectiles: Projectile[] = [];
  events: SimEvent[] = [];
  time = 0;
  frame = 0;
  hitstop = 0;
  rng: Rng;
  exiting = false;
  /** Sim の外（描画）から読む：今のコマで風が吹いている */
  wind = { x: 0, z: 0 };
  /** 仕掛けの時計（緩の理で半分の速さで進む） */
  hazardClock = 0;
  private collectedSet = new Set<string>();

  constructor(
    private levels: LevelLookup,
    progress?: Progress,
    seed = 1,
  ) {
    this.rng = new Rng(seed);
    this.progress = progress ? structuredClone(progress) : newProgress();
    this.collectedSet = new Set(this.progress.collected);
    this.loadChapter(this.progress.chapter, this.progress.shrine);
  }

  get level(): LevelDef {
    return this.world.def;
  }
  get ledger(): Ledger {
    return this.progress.ledger;
  }
  has(id: AbilityId): boolean {
    return !isPawned(this.progress.ledger, id);
  }
  flag(k: string): boolean {
    return !!this.progress.flags[k];
  }
  setFlag(k: string, v = true): void {
    this.progress.flags[k] = v;
  }
  emit(e: SimEvent): void {
    this.events.push(e);
  }
  drain(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
  private collect(key: string): boolean {
    if (this.collectedSet.has(key)) return false;
    this.collectedSet.add(key);
    this.progress.collected.push(key);
    return true;
  }
  isCollected(key: string): boolean {
    return this.collectedSet.has(key);
  }

  loadChapter(id: ChapterId, shrineId: string | null = null): void {
    const def = this.levels(id);
    this.progress.chapter = id;
    this.world = new LevelWorld(def);
    const shrine = shrineId ? def.shrines.find((s) => s.id === shrineId) : undefined;
    this.progress.shrine = shrine ? shrine.id : null;
    this.pickups = def.pickups.map((p) => ({ def: p, taken: this.collectedSet.has('p:' + p.id) }));
    this.exiting = false;
    this.spawnPlayer();
    this.resetEnemies();
    // 理を即座に反映（浮石は浮いた状態から）
    for (const f of this.world.floats) f.wait = 0;
    for (let i = 0; i < 240; i++) this.world.applyLaws(this.ledger.pawned, this.progress.flags, this.lanternInfo(), DT, this.bodies());
  }

  private spawnPoint(): { x: number; y: number; z: number; yaw: number } {
    const def = this.level;
    const s = this.progress.shrine ? def.shrines.find((d) => d.id === this.progress.shrine) : undefined;
    if (s) return { x: s.x + Math.sin(s.yaw) * 1.4, y: s.y + 0.05, z: s.z + Math.cos(s.yaw) * 1.4, yaw: s.yaw };
    return def.spawn;
  }

  private spawnPlayer(): void {
    const sp = this.spawnPoint();
    const keepLantern = this.player?.lanternOn ?? false;
    this.player = {
      body: newBody(sp.x, sp.y, sp.z, PLAYER.halfW, PLAYER.height),
      yaw: sp.yaw,
      hp: PLAYER.maxHp,
      mode: 'normal',
      modeT: 0,
      coyoteT: 0,
      jumpBufT: 0,
      attackBufT: 0,
      jumping: false,
      combo: 0,
      phase: 'startup',
      swingHits: new Set(),
      dashCd: 0,
      airDashUsed: false,
      dashDirX: 0,
      dashDirZ: 1,
      perfectCd: 0,
      perfectBonus: false,
      invulnT: 0,
      lanternOn: keepLantern && this.has('lantern'),
      safe: { x: sp.x, y: sp.y, z: sp.z },
      safeT: 0,
      airT: 0,
      runAmt: 0,
    };
  }

  resetEnemies(): void {
    this.enemies = [];
    this.projectiles = [];
    for (const s of this.level.enemies) if (!s.needFlag || this.flag(s.needFlag)) this.addEnemy(s);
  }

  private addEnemy(s: EnemySpawn): void {
    const def = ENEMIES[s.type];
    const isBoss = s.type === 'yomori';
    this.enemies.push({
      spawn: s,
      id: s.id,
      def,
      body: newBody(s.x, s.y, s.z, def.halfW, def.height),
      yaw: s.yaw ?? 0,
      hp: isBoss ? BOSS.hp : def.hp,
      mode: 'idle',
      t: 0,
      kx: 0,
      kz: 0,
      attackHit: false,
      flash: 0,
      floatOff: 0,
      deadT: 0,
      anim: 0,
      phase: isBoss ? 1 : undefined,
      moveCount: 0,
    });
  }

  bodies(): Body[] {
    const b = this.player ? [this.player.body] : [];
    for (const e of this.enemies) if (e.mode !== 'dead') b.push(e.body);
    return b;
  }

  lanternInfo() {
    const p = this.player;
    return { on: !!p && p.lanternOn && this.has('lantern'), x: p?.body.x ?? 0, z: p?.body.z ?? 0, radius: LANTERN.radius };
  }

  /** 経済の操作（質屋 UI から） */
  doPawn(id: AbilityId): TradeResult {
    const r = pawn(this.ledger, id);
    if (r.ok) {
      this.setFlag('law:' + id);
      if (id === 'lantern') this.player.lanternOn = false;
      this.emit({ t: 'lawChanged', ability: id, pawned: true });
      if (id === 'jump') this.emit({ t: 'floatRise' });
    }
    return r;
  }
  doRedeem(id: AbilityId): TradeResult {
    const r = redeem(this.ledger, id);
    if (r.ok) this.setFlag('redeemed:' + id);
    if (r.ok) this.emit({ t: 'lawChanged', ability: id, pawned: false });
    return r;
  }
  canPawn(id: AbilityId): TradeResult {
    return canPawn(this.ledger, id);
  }
  canRedeem(id: AbilityId): TradeResult {
    return canRedeem(this.ledger, id);
  }

  /** 近くで「調べる」ことができる物 */
  interactable(): Interactable | null {
    const b = this.player.body;
    let best: Interactable | null = null;
    let bd = WORLD.interactRadius;
    for (const s of this.level.shrines) {
      if (!s.shop) continue;
      // 鳥居の中心か、質屋の台（おこん）の前
      let d = Math.hypot(s.x - b.x, s.z - b.z);
      if (s.stall) d = Math.min(d, Math.hypot(s.stall.x - b.x, s.stall.z - b.z) - 0.6);
      if (d < bd + 0.6 && Math.abs(s.y - b.y) < 2) {
        bd = d;
        best = { kind: 'shrine', def: s };
      }
    }
    for (const r of this.level.readables) {
      const d = Math.hypot(r.x - b.x, r.z - b.z);
      if (d < bd && Math.abs(r.y - b.y) < 2) {
        bd = d;
        best = { kind: 'read', id: r.id, script: r.script, label: r.label };
      }
    }
    return best;
  }

  currentGoal(): string {
    for (const g of this.level.goals) {
      if (g.needFlag && !this.flag(g.needFlag)) continue;
      if (g.unlessFlag && this.flag(g.unlessFlag)) continue;
      return g.text;
    }
    return '';
  }

  // ───────────────────────── 1 コマ
  step(input: InputFrame): void {
    this.frame++;
    const dt = DT;
    this.time += dt;
    // 旗で現れる妖
    for (const s of this.level.enemies)
      if (s.needFlag && this.flag(s.needFlag) && !this.enemies.some((e) => e.id === s.id) && !this.flag('spawned:' + s.id)) {
        this.setFlag('spawned:' + s.id);
        this.addEnemy(s);
      }

    if (this.hitstop > 0) {
      this.hitstop -= dt;
      // 止まっている間も押した入力は先行入力として残す
      if (input.attackPressed) this.player.attackBufT = ATTACK.buffer;
      if (input.jumpPressed) this.player.jumpBufT = PLAYER.jumpBuffer;
      return;
    }

    this.wind = this.world.windAt(this.ledger.pawned);
    this.world.applyLaws(this.ledger.pawned, this.progress.flags, this.lanternInfo(), dt, this.bodies());
    this.updatePlayer(input, dt);
    const edt = this.ledger.pawned.includes('dash') ? dt * WORLD.slowLawTimeScale : dt;
    this.hazardClock += edt;
    this.updateHazards();
    for (const e of this.enemies) {
      if (e.spawn.type === 'yomori') this.updateBoss(e, edt);
      else this.updateEnemy(e, edt);
    }
    this.updateProjectiles(edt);
    this.enemies = this.enemies.filter((e) => !(e.mode === 'dead' && e.deadT > 1.2));
    this.updatePickups();
    this.updateTriggers();
  }

  // ───────────────────────── 鈴
  private updatePlayer(inp: InputFrame, dt: number): void {
    const p = this.player;
    const b = p.body;
    const phys = this.world.phys;
    p.modeT += dt;
    p.invulnT = Math.max(0, p.invulnT - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.perfectCd = Math.max(0, p.perfectCd - dt);
    p.jumpBufT = Math.max(0, p.jumpBufT - dt);
    p.attackBufT = Math.max(0, p.attackBufT - dt);

    if (p.mode === 'dead') {
      if (p.modeT > 1.6) this.respawn();
      return;
    }

    if (inp.jumpPressed) {
      if (this.has('jump')) p.jumpBufT = PLAYER.jumpBuffer;
      else this.emit({ t: 'jumpDenied', reason: '跳は質に入っている' });
    }
    if (inp.attackPressed) {
      if (this.has('fan')) p.attackBufT = ATTACK.buffer;
      else this.emit({ t: 'attackDenied', reason: '払は質に入っている' });
    }
    if (inp.lanternPressed) {
      if (this.has('lantern')) {
        p.lanternOn = !p.lanternOn;
        this.emit({ t: 'lantern', on: p.lanternOn });
      } else this.emit({ t: 'lanternDenied', reason: '灯は質に入っている' });
    }
    if (inp.interactPressed) {
      const it = this.interactable();
      if (it?.kind === 'shrine') this.emit({ t: 'shop', shrine: it.def.id });
      else if (it?.kind === 'read') {
        this.setFlag('read:' + it.id);
        this.emit({ t: 'dialog', script: it.script });
      }
    }

    // 入力の向き（カメラ基準 → 世界）
    let mx = inp.moveX;
    let my = inp.moveY;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    const fy = inp.camYaw;
    const wx = Math.sin(fy) * my - Math.cos(fy) * mx;
    const wz = Math.cos(fy) * my + Math.sin(fy) * mx;
    const wl = Math.hypot(wx, wz);

    // 駆
    if (inp.dashPressed) {
      if (!this.has('dash')) this.emit({ t: 'dashDenied', reason: '駆は質に入っている' });
      else if (p.dashCd > 0 || (p.airDashUsed && !b.onGround)) this.emit({ t: 'dashDenied', reason: '息を整えている' });
      else if (p.mode === 'normal' || (p.mode === 'attack' && p.phase === 'recovery')) {
        p.mode = 'dash';
        p.modeT = 0;
        if (wl > 0.15) { p.dashDirX = wx / wl; p.dashDirZ = wz / wl; }
        else { p.dashDirX = Math.sin(p.yaw); p.dashDirZ = Math.cos(p.yaw); }
        p.yaw = Math.atan2(p.dashDirX, p.dashDirZ);
        if (!b.onGround) p.airDashUsed = true;
        p.dashCd = DASH.cooldown;
        this.emit({ t: 'dash' });
      }
    }

    // 払の開始・連携
    if (p.attackBufT > 0 && this.has('fan')) {
      if (p.mode === 'normal') this.startSwing(0, wx, wz, wl);
      else if (p.mode === 'attack' && p.phase === 'recovery' && p.combo < 2 && p.modeT <= ATTACK.comboWindow)
        this.startSwing(p.combo + 1, wx, wz, wl);
    }

    // 速度
    let targetX = 0;
    let targetZ = 0;
    let accel = b.onGround ? PLAYER.accelGround : PLAYER.accelAir;
    if (p.mode === 'normal') {
      targetX = wx * PLAYER.runSpeed;
      targetZ = wz * PLAYER.runSpeed;
      if (wl < 0.05 && b.onGround) accel = PLAYER.decelGround;
      if (wl > 0.05) {
        const want = Math.atan2(wx, wz);
        p.yaw += wrapAngle(want - p.yaw) * Math.min(1, PLAYER.turnRate * dt);
      }
    } else if (p.mode === 'attack') {
      const sw = ATTACK.swings[p.combo];
      const lunge = p.phase === 'recovery' ? 0 : sw.lunge;
      targetX = Math.sin(p.yaw) * lunge;
      targetZ = Math.cos(p.yaw) * lunge;
      accel = 60;
    } else if (p.mode === 'dash') {
      targetX = p.dashDirX * DASH.speed;
      targetZ = p.dashDirZ * DASH.speed;
      accel = 400;
    } else if (p.mode === 'hurt') {
      accel = 12;
    }
    b.vx = approach(b.vx, targetX, accel * dt);
    b.vz = approach(b.vz, targetZ, accel * dt);

    // 跳
    if (b.onGround) {
      p.coyoteT = PLAYER.coyote;
      p.airDashUsed = false;
    } else p.coyoteT = Math.max(0, p.coyoteT - dt);
    if (p.jumpBufT > 0 && p.coyoteT > 0 && this.has('jump') && (p.mode === 'normal' || (p.mode === 'attack' && p.phase === 'recovery'))) {
      if (p.mode === 'attack') p.mode = 'normal';
      b.vy = PLAYER.jumpVel;
      p.jumping = true;
      p.jumpBufT = 0;
      p.coyoteT = 0;
      b.onGround = false;
      b.ground = null;
      this.emit({ t: 'jump' });
    }
    if (p.jumping && !inp.jumpHeld && b.vy > 0) {
      b.vy *= PLAYER.jumpCutMul;
      p.jumping = false;
    }
    if (b.vy <= 0) p.jumping = false;

    // 重力（駆の間は止める）
    if (p.mode === 'dash') b.vy = Math.max(b.vy, 0) * 0;
    else {
      const g = PLAYER.gravity * (b.vy < 0 ? PLAYER.fallGravityMul : 1);
      b.vy = Math.max(-PLAYER.maxFall, b.vy - g * dt);
    }

    // 移動（風は外から押す。地面に立って入力が無いときは踏ん張る）
    const vyBefore = b.vy;
    const wasGround = b.onGround;
    const brace = b.onGround && wl < 0.05 && p.mode === 'normal' ? WORLD.windBrace : 1;
    phys.moveBody(b, (b.vx + this.wind.x * brace) * dt, b.vy * dt, (b.vz + this.wind.z * brace) * dt, PLAYER.stepUp);
    if (b.onGround && !wasGround) {
      this.emit({ t: 'land', speed: -vyBefore });
      p.airT = 0;
    }
    if (!b.onGround) p.airT += dt;
    p.runAmt = Math.min(1, Math.hypot(b.vx, b.vz) / PLAYER.runSpeed);

    // 状態の時間切れ
    if (p.mode === 'dash' && p.modeT >= DASH.time) {
      p.mode = 'normal';
      p.modeT = 0;
      b.vx *= 0.45;
      b.vz *= 0.45;
    } else if (p.mode === 'hurt' && p.modeT >= PLAYER.hurtTime) {
      p.mode = 'normal';
      p.modeT = 0;
    } else if (p.mode === 'attack') this.updateSwing();

    // 安全な足場の記録（静的な地面に 0.25 秒立っていたら）
    const g = b.ground;
    const m = 0.45; // 縁から離れた所だけを安全とみなす
    if (b.onGround && g && !g.dynamic && g.tag === 'ground' && b.x - m >= g.minX && b.x + m <= g.maxX && b.z - m >= g.minZ && b.z + m <= g.maxZ) {
      p.safeT += dt;
      if (p.safeT > 0.25) p.safe = { x: b.x, y: b.y, z: b.z };
    } else p.safeT = 0;

    // 落下
    if (b.y < this.level.killY) {
      this.emit({ t: 'fall' });
      b.x = p.safe.x;
      b.y = p.safe.y + 0.05;
      b.z = p.safe.z;
      b.vx = b.vy = b.vz = 0;
      p.mode = 'normal';
      this.damagePlayer(PLAYER.fallDamage, 0, 0, true);
    }

    // 鳥居（チェックポイント・回復）
    for (const s of this.level.shrines) {
      if (Math.hypot(s.x - b.x, s.z - b.z) < 1.9 && Math.abs(s.y - b.y) < 2) {
        if (this.progress.shrine !== s.id) {
          this.progress.shrine = s.id;
          p.hp = PLAYER.maxHp;
          this.emit({ t: 'checkpoint', shrine: s.id });
        } else if (p.hp < PLAYER.maxHp && this.frame % 30 === 0) p.hp++;
      }
    }

    // 出口
    const ex = this.level.exit;
    if (ex && !this.exiting && inBox(b.x, b.y + 0.5, b.z, ex.box)) {
      this.exiting = true;
      this.emit({ t: 'exit', to: ex.to });
    }
  }

  private startSwing(combo: number, wx: number, wz: number, wl: number): void {
    const p = this.player;
    p.mode = 'attack';
    p.modeT = 0;
    p.combo = combo;
    p.phase = 'startup';
    p.swingHits.clear();
    p.attackBufT = 0;
    // 入力があればその方向へ、無ければ近い妖へ向き直す（狙いの補助）
    if (wl > 0.2) p.yaw = Math.atan2(wx, wz);
    const target = this.nearestEnemy(3.2, Math.PI * 0.6);
    if (target) p.yaw = Math.atan2(target.body.x - p.body.x, target.body.z - p.body.z);
    this.emit({ t: 'swing', combo });
  }

  private nearestEnemy(range: number, halfArc: number): EnemyState | null {
    const p = this.player;
    let best: EnemyState | null = null;
    let bd = range;
    for (const e of this.enemies) {
      if (e.mode === 'dead' || e.mode === 'kneel') continue;
      const dx = e.body.x - p.body.x;
      const dz = e.body.z - p.body.z;
      const d = Math.hypot(dx, dz);
      if (d > bd || Math.abs(e.body.y - p.body.y) > 1.6) continue;
      if (Math.abs(wrapAngle(Math.atan2(dx, dz) - p.yaw)) > halfArc) continue;
      bd = d;
      best = e;
    }
    return best;
  }

  private updateSwing(): void {
    const p = this.player;
    const sw = ATTACK.swings[p.combo];
    if (p.phase === 'startup' && p.modeT >= sw.startup) {
      p.phase = 'active';
      p.modeT = 0;
    }
    if (p.phase === 'active') {
      this.swingHitTest(sw.range, (sw.arcDeg * Math.PI) / 360, sw.damage, sw.knock, p.combo === 2);
      if (p.modeT >= sw.active) {
        p.phase = 'recovery';
        p.modeT = 0;
      }
    }
    if (p.phase === 'recovery' && p.modeT >= sw.recovery) {
      p.mode = 'normal';
      p.modeT = 0;
      p.combo = 0;
    }
  }

  private swingHitTest(range: number, halfArc: number, damage: number, knock: number, heavy: boolean): void {
    const p = this.player;
    const shadowLaw = this.ledger.pawned.includes('lantern');
    for (const e of this.enemies) {
      if (e.mode === 'dead' || e.mode === 'kneel' || p.swingHits.has(e.id)) continue;
      const dx = e.body.x - p.body.x;
      const dz = e.body.z - p.body.z;
      const d = Math.hypot(dx, dz);
      if (d > range + e.def.halfW) continue;
      if (e.body.y > p.body.y + p.body.h + 0.3 || e.body.y + e.body.h < p.body.y - 0.3) continue;
      if (d > 0.3 && Math.abs(wrapAngle(Math.atan2(dx, dz) - p.yaw)) > halfArc) continue;
      p.swingHits.add(e.id);
      const immune = e.def.fanImmune || (e.def.needsShadowLaw && !shadowLaw) || e.mode === 'transition' || (e.spawn.type === 'yomori' && e.mode === 'idle');
      const nx = d > 0.01 ? dx / d : Math.sin(p.yaw);
      const nz = d > 0.01 ? dz / d : Math.cos(p.yaw);
      if (immune) {
        e.kx += nx * 1.5;
        e.kz += nz * 1.5;
        this.emit({ t: 'hit', enemy: e.id, type: e.spawn.type, x: e.body.x, y: e.body.y + e.body.h * 0.6, z: e.body.z, heavy: false, immune: true });
        this.hitstop = ATTACK.hitstop * 0.6;
        continue;
      }
      let dmg = damage;
      if (p.perfectBonus) {
        dmg *= ATTACK.perfectBonusMul;
        p.perfectBonus = false;
      }
      e.hp -= dmg;
      e.flash = 0.12;
      if (e.spawn.type === 'yomori') {
        this.bossDamaged(e);
        this.hitstop = heavy ? ATTACK.hitstopHeavy : ATTACK.hitstop;
        this.emit({ t: 'hit', enemy: e.id, type: e.spawn.type, x: e.body.x, y: e.body.y + e.body.h * 0.6, z: e.body.z, heavy, immune: false });
        continue;
      }
      const km = e.mode === 'float' ? 0.3 : 1 - Math.min(0.8, e.def.hp / 60);
      e.kx += nx * knock * km;
      e.kz += nz * knock * km;
      if (e.mode !== 'float' && e.def.staggerTime > 0 && e.mode !== 'attack') {
        e.mode = 'stagger';
        e.t = 0;
      }
      this.hitstop = heavy ? ATTACK.hitstopHeavy : ATTACK.hitstop;
      this.emit({ t: 'hit', enemy: e.id, type: e.spawn.type, x: e.body.x, y: e.body.y + e.body.h * 0.6, z: e.body.z, heavy, immune: false });
      if (e.hp <= 0) this.killEnemy(e);
    }
  }

  private killEnemy(e: EnemyState): void {
    e.mode = 'dead';
    e.deadT = 0;
    this.emit({ t: 'enemyDown', enemy: e.id, type: e.spawn.type, x: e.body.x, y: e.body.y, z: e.body.z });
    this.setFlag('down:' + e.id);
    if (e.def.drop > 0 && this.collect('e:' + e.id)) {
      const repaid = earn(this.ledger, e.def.drop);
      this.emit({ t: 'pickup', value: e.def.drop, repaid });
    }
  }

  damagePlayer(amount: number, fromX: number, fromZ: number, ignoreInvuln = false): boolean {
    const p = this.player;
    if (p.mode === 'dead') return false;
    if (!ignoreInvuln && p.invulnT > 0) return false;
    p.hp -= amount;
    p.invulnT = PLAYER.invulnAfterHurt;
    if (p.hp <= 0) {
      p.hp = 0;
      p.mode = 'dead';
      p.modeT = 0;
      this.emit({ t: 'dead' });
      return true;
    }
    if (fromX !== 0 || fromZ !== 0) {
      const dx = p.body.x - fromX;
      const dz = p.body.z - fromZ;
      const d = Math.hypot(dx, dz) || 1;
      p.body.vx = (dx / d) * PLAYER.hurtKnock;
      p.body.vz = (dz / d) * PLAYER.hurtKnock;
      p.body.vy = Math.max(p.body.vy, 3);
      p.mode = 'hurt';
      p.modeT = 0;
    }
    this.emit({ t: 'hurt', hp: p.hp });
    return true;
  }

  respawn(): void {
    this.spawnPlayer();
    if (!this.flag('boss_done')) this.setFlag('boss_fighting', false);
    this.resetEnemies();
    this.emit({ t: 'respawn' });
  }

  // ───────────────────────── 妖
  private nearShrine(x: number, z: number, pad = 0): boolean {
    for (const s of this.level.shrines) if (Math.hypot(s.x - x, s.z - z) < WORLD.shrineRadius + pad) return true;
    return false;
  }

  private updateEnemy(e: EnemyState, dt: number): void {
    const b = e.body;
    const p = this.player;
    const pb = p.body;
    const def = e.def;
    e.t += dt;
    e.anim += dt;
    e.flash = Math.max(0, e.flash - dt);
    if (e.mode === 'dead') {
      e.deadT += dt;
      return;
    }
    const dx = pb.x - b.x;
    const dz = pb.z - b.z;
    const dist = Math.hypot(dx, dz);
    const dy = pb.y - b.y;
    const playerSafe = this.nearShrine(pb.x, pb.z) || p.mode === 'dead';
    const lantern = this.lanternInfo();
    const scared = def.fearsLight && lantern.on && dist < LANTERN.repelRadius && !this.ledger.pawned.includes('lantern');
    const floatLaw = def.heavy && this.ledger.pawned.includes('jump');

    let moveX = 0;
    let moveZ = 0;
    let gravity = true;

    if (floatLaw && e.mode !== 'float') {
      e.mode = 'float';
      e.t = 0;
    }
    if (e.mode === 'float') {
      gravity = false;
      if (!floatLaw) {
        e.mode = 'idle';
        e.t = 0;
      } else {
        const targetOff = 1.05 + Math.sin(e.anim * 1.6) * 0.12;
        const up = Math.min(1.8 * dt, targetOff - e.floatOff);
        e.floatOff += up;
        b.vy = up / dt;
        e.yaw += dt * 0.7;
      }
    } else {
      if (e.floatOff > 0) e.floatOff = Math.max(0, e.floatOff - dt * 3);
      switch (e.mode) {
        case 'idle':
          // 気づくまでの反応に少し揺らぎ（種で変わる）
          if (dist < def.aggro && Math.abs(dy) < 3 && !playerSafe) {
            e.mode = 'chase';
            e.t = -this.rng.range(0, 0.3);
          }
          break;
        case 'flee':
        case 'chase': {
          if (scared) {
            e.mode = 'flee';
            moveX = -dx / (dist || 1);
            moveZ = -dz / (dist || 1);
            e.yaw = Math.atan2(dx, dz);
            break;
          }
          if (e.mode === 'flee') e.mode = 'chase';
          if (dist > def.aggro * 1.6 || playerSafe) {
            e.mode = 'idle';
            break;
          }
          e.yaw += wrapAngle(Math.atan2(dx, dz) - e.yaw) * Math.min(1, 8 * dt);
          if (dist <= def.range && Math.abs(dy) < 1.5 && e.t >= 0) {
            e.mode = 'windup';
            e.t = -this.rng.range(0, 0.12);
            this.emit({ t: 'telegraph', enemy: e.id, type: e.spawn.type });
          } else {
            moveX = dx / (dist || 1);
            moveZ = dz / (dist || 1);
          }
          break;
        }
        case 'windup':
          if (!def.aoe) e.yaw += wrapAngle(Math.atan2(dx, dz) - e.yaw) * Math.min(1, 5 * dt);
          if (scared) {
            e.mode = 'flee';
            break;
          }
          if (e.t >= def.windup) {
            e.mode = 'attack';
            e.t = 0;
            e.attackHit = false;
            this.emit({ t: 'enemyAttack', enemy: e.id, type: e.spawn.type });
          }
          break;
        case 'attack': {
          if (def.lunge > 0) {
            b.vx = Math.sin(e.yaw) * def.lunge;
            b.vz = Math.cos(e.yaw) * def.lunge;
          }
          if (!e.attackHit) this.enemyHitTest(e);
          if (e.t >= def.active) {
            e.mode = 'recover';
            e.t = 0;
          }
          break;
        }
        case 'recover':
          if (e.t >= def.recover) {
            e.mode = 'chase';
            e.t = -this.rng.range(0, 0.25);
          }
          break;
        case 'stagger':
          if (e.t >= def.staggerTime) { e.mode = 'chase'; e.t = 0; }
          break;
      }
    }

    // 移動
    const sp = def.speed * (e.mode === 'flee' ? 1.2 : 1);
    if (e.mode !== 'attack') {
      b.vx = approach(b.vx, moveX * sp, 20 * dt);
      b.vz = approach(b.vz, moveZ * sp, 20 * dt);
    }
    if (gravity) b.vy = Math.max(-PLAYER.maxFall, b.vy - PLAYER.gravity * dt);
    let mvx = (b.vx + e.kx) * dt;
    let mvz = (b.vz + e.kz) * dt;
    e.kx = approach(e.kx, 0, 30 * dt);
    e.kz = approach(e.kz, 0, 30 * dt);
    // 風（気づいて動き出した妖だけが流される。じっとしている妖は根を張っている）
    if (def.windMul > 0 && (this.wind.x || this.wind.z) && e.mode !== 'idle') {
      const m = def.windMul * (e.mode === 'float' ? 1.5 : 1);
      mvx += this.wind.x * m * dt;
      mvz += this.wind.z * m * dt;
    }
    // 鳥居の内へは入らない（伏線 F7）
    if (this.nearShrine(b.x + mvx, b.z + mvz) && !this.nearShrine(b.x, b.z)) {
      mvx = 0;
      mvz = 0;
    }
    // 自分から崖へは歩かない（風・押し戻しは別）
    if (gravity && b.onGround && (moveX || moveZ) && !this.groundAhead(b, b.x + mvx * 6, b.z + mvz * 6)) {
      const selfX = moveX * sp * dt;
      const selfZ = moveZ * sp * dt;
      mvx -= selfX;
      mvz -= selfZ;
    }
    this.world.phys.moveBody(b, mvx, b.vy * dt, mvz, 0.3);
    if (b.y < this.level.killY) {
      this.emit({ t: 'windBlown', enemy: e.id });
      this.killEnemy(e);
    }
  }

  private groundAhead(b: Body, x: number, z: number): boolean {
    const hits = this.world.phys.query(x - 0.1, b.y - 1.2, z - 0.1, x + 0.1, b.y + 0.2, z + 0.1);
    return hits.length > 0;
  }

  private enemyHitTest(e: EnemyState): void {
    const p = this.player;
    const pb = p.body;
    const def = e.def;
    const cx = e.body.x + Math.sin(e.yaw) * def.hitReach;
    const cz = e.body.z + Math.cos(e.yaw) * def.hitReach;
    const d = Math.hypot(pb.x - cx, pb.z - cz);
    if (d > def.hitRadius + pb.hw) return;
    if (pb.y > e.body.y + e.body.h + 0.2 || pb.y + pb.h < e.body.y - 0.2) return;
    if (p.mode === 'dead') return;
    // 駆の無敵
    if (p.mode === 'dash' && p.modeT <= DASH.iframes) {
      e.attackHit = true;
      if (p.modeT <= DASH.perfectWindow && p.perfectCd <= 0) {
        p.perfectCd = DASH.perfectCooldown;
        p.perfectBonus = true;
        this.emit({ t: 'perfect', x: pb.x, y: pb.y, z: pb.z });
      }
      return;
    }
    if (p.invulnT > 0) return;
    e.attackHit = true;
    this.damagePlayer(def.damage, e.body.x, e.body.z);
  }

  // ───────────────────────── 夜守（ボス）
  get boss(): EnemyState | undefined {
    return this.enemies.find((e) => e.spawn.type === 'yomori');
  }

  private bossDamaged(e: EnemyState): void {
    const frac = e.hp / BOSS.hp;
    if (e.hp <= 0) {
      e.hp = 0;
      e.mode = 'kneel';
      e.t = 0;
      this.projectiles = [];
      // 呼んだ面の妖も眠る
      for (const o of this.enemies) if (o !== e && o.mode !== 'dead') this.killEnemy(o);
      this.setFlag('boss_done');
      this.setFlag('boss_fighting', false);
      this.emit({ t: 'bossDown' });
      return;
    }
    const want = frac <= BOSS.phase3 ? 3 : frac <= BOSS.phase2 ? 2 : 1;
    if (want > (e.phase ?? 1)) {
      e.phase = want;
      e.mode = 'transition';
      e.t = 0;
      this.projectiles = [];
      this.emit({ t: 'bossPhase', phase: want });
      if (want === 2) {
        // 面を呼ぶ（里の人が、千鶴を守りに来る）
        for (const [i, dx] of [-3, 3].entries()) {
          const id = 'fin_call' + i + '_' + this.frame;
          this.addEnemy({ id, type: 'menyo', x: e.body.x + dx, y: e.body.y, z: e.body.z - 2, yaw: Math.PI });
          const ne = this.enemies[this.enemies.length - 1];
          ne.mode = 'chase';
        }
      }
    } else if (e.mode !== 'attack' && e.mode !== 'transition') {
      e.mode = 'stagger';
      e.t = 0;
    }
  }

  private updateBoss(e: EnemyState, dt: number): void {
    const b = e.body;
    const pb = this.player.body;
    e.t += dt;
    e.anim += dt;
    e.flash = Math.max(0, e.flash - dt);
    const fighting = this.flag('boss_fighting');
    const ph = e.phase ?? 1;
    const spd = ph >= 3 ? BOSS.phase3SpeedMul : 1;
    const dx = pb.x - b.x;
    const dz = pb.z - b.z;
    const dist = Math.hypot(dx, dz);
    let mvx = 0;
    let mvz = 0;
    const face = (k: number) => {
      e.yaw += wrapAngle(Math.atan2(dx, dz) - e.yaw) * Math.min(1, k * dt);
    };
    switch (e.mode) {
      case 'kneel':
      case 'dead':
        return;
      case 'idle':
        if (fighting) {
          e.mode = 'chase';
          e.t = 0;
        }
        break;
      case 'transition':
        if (e.t > BOSS.transitionTime) {
          e.mode = 'chase';
          e.t = 0;
        }
        break;
      case 'stagger':
        if (e.t > 0.18) {
          e.mode = 'chase';
          e.t = 0;
        }
        break;
      case 'chase': {
        if (!fighting || this.player.mode === 'dead') break;
        face(6);
        // 技を選ぶ（同じ技を 3 回続けない）
        const mc = e.moveCount ?? 0;
        let next: BossMove;
        if (ph >= 2 && (mc % 3 === 2 || this.rng.next() < 0.15)) next = 'fans';
        else if (dist < 3.2) next = this.rng.next() < 0.8 ? 'slam' : 'lunge';
        else next = 'lunge';
        if (dist > 7 && next !== 'fans') {
          mvx = (dx / dist) * BOSS.speed * spd;
          mvz = (dz / dist) * BOSS.speed * spd;
          if (e.t > 2.2 && ph >= 2) next = 'fans';
          else break;
        }
        if (e.t < 0.35 / spd) break;
        e.move = next;
        e.moveCount = mc + 1;
        e.mode = 'windup';
        e.t = 0;
        this.emit({ t: 'telegraph', enemy: e.id, type: 'yomori' });
        break;
      }
      case 'windup': {
        const mv = BOSS[e.move ?? 'lunge'];
        if (e.move !== 'slam') face(e.move === 'fans' ? 4 : 3);
        if (e.t >= mv.windup / spd) {
          e.mode = 'attack';
          e.t = 0;
          e.attackHit = false;
          this.emit({ t: 'enemyAttack', enemy: e.id, type: 'yomori' });
          if (e.move === 'fans') {
            const f = BOSS.fans;
            const n = ph >= 3 ? f.count + 2 : f.count;
            for (let i = 0; i < n; i++) {
              const a = e.yaw + (i - (n - 1) / 2) * f.spread;
              this.projectiles.push({ x: b.x + Math.sin(a) * 0.8, y: b.y + 1.2, z: b.z + Math.cos(a) * 0.8, vx: Math.sin(a) * f.speed * spd, vz: Math.cos(a) * f.speed * spd, life: f.life, radius: f.radius, spin: 0 });
            }
          }
        }
        break;
      }
      case 'attack': {
        const mv = e.move ?? 'lunge';
        if (mv === 'lunge') {
          const l = BOSS.lunge;
          mvx = Math.sin(e.yaw) * l.speed * spd;
          mvz = Math.cos(e.yaw) * l.speed * spd;
          if (!e.attackHit) this.bossHit(e, b.x + Math.sin(e.yaw) * l.reach, b.z + Math.cos(e.yaw) * l.reach, l.radius);
          if (e.t >= l.active) {
            e.mode = 'recover';
            e.t = 0;
          }
        } else if (mv === 'slam') {
          if (!e.attackHit) this.bossHit(e, b.x, b.z, BOSS.slam.radius);
          if (e.t >= BOSS.slam.active) {
            e.mode = 'recover';
            e.t = 0;
          }
        } else {
          e.mode = 'recover';
          e.t = 0;
        }
        break;
      }
      case 'recover': {
        const mv = BOSS[e.move ?? 'lunge'];
        if (e.t >= mv.recover / spd) {
          e.mode = 'chase';
          e.t = 0;
        }
        break;
      }
    }
    b.vy = Math.max(-PLAYER.maxFall, b.vy - PLAYER.gravity * dt);
    this.world.phys.moveBody(b, (mvx + e.kx * 0.3) * dt, b.vy * dt, (mvz + e.kz * 0.3) * dt, 0.3);
    e.kx = approach(e.kx, 0, 30 * dt);
    e.kz = approach(e.kz, 0, 30 * dt);
  }

  private bossHit(e: EnemyState, cx: number, cz: number, r: number): void {
    const p = this.player;
    const pb = p.body;
    if (p.mode === 'dead') return;
    if (Math.hypot(pb.x - cx, pb.z - cz) > r + pb.hw) return;
    if (pb.y > e.body.y + 2.2) return;
    e.attackHit = true;
    if (p.mode === 'dash' && p.modeT <= DASH.iframes) {
      if (p.modeT <= DASH.perfectWindow && p.perfectCd <= 0) {
        p.perfectCd = DASH.perfectCooldown;
        p.perfectBonus = true;
        this.emit({ t: 'perfect', x: pb.x, y: pb.y, z: pb.z });
      }
      return;
    }
    if (p.invulnT > 0) return;
    this.damagePlayer(1, e.body.x, e.body.z);
  }

  private updateProjectiles(dt: number): void {
    const p = this.player;
    const pb = p.body;
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dt;
      pr.z += pr.vz * dt;
      pr.life -= dt;
      pr.spin += dt * 14;
      if (p.mode === 'dead') continue;
      if (Math.hypot(pb.x - pr.x, pb.z - pr.z) < pr.radius + pb.hw && pr.y > pb.y - 0.2 && pr.y < pb.y + pb.h + 0.3) {
        if (p.mode === 'dash' && p.modeT <= DASH.iframes) {
          if (p.modeT <= DASH.perfectWindow && p.perfectCd <= 0) {
            p.perfectCd = DASH.perfectCooldown;
            p.perfectBonus = true;
            this.emit({ t: 'perfect', x: pb.x, y: pb.y, z: pb.z });
          }
          continue;
        }
        if (p.invulnT <= 0 && this.damagePlayer(1, pr.x - pr.vx, pr.z - pr.vz)) pr.life = 0;
      }
    }
    this.projectiles = this.projectiles.filter((q) => q.life > 0);
  }

  // ───────────────────────── 仕掛け
  /** blade の腕の角度（rad） */
  bladeAngle(h: HazardDef): number {
    return (this.hazardClock / h.period + (h.phase ?? 0)) * Math.PI * 2 * (h.dir ?? 1);
  }
  /** rock の 1 回の落下の進み（0..1、1 で着地） */
  rockPhase(h: HazardDef): number {
    const u = this.hazardClock / h.period + (h.phase ?? 0);
    return u - Math.floor(u);
  }
  /** 石が落ちる高さ（描画用） */
  static readonly ROCK_FALL = 0.72; // この進みで着地。その前が影の予兆
  /** 水車の羽根が道に触れる角度（真下から ±） */
  static readonly BLADE_ARC = 0.44;

  private updateHazards(): void {
    const p = this.player;
    const b = p.body;
    if (p.mode === 'dead') return;
    for (const h of this.level.hazards) {
      if (b.y > h.y + 1.6 || b.y + b.h < h.y - 0.2) continue;
      let hit = false;
      if (h.kind === 'blade') {
        // 2 枚の羽根。真下 ±25° に来た羽根の先が、道を z 方向に払っていく
        if (Math.abs(b.x - h.x) > (h.width ?? 4) / 2 + b.hw) continue;
        for (let k = 0; k < 2; k++) {
          const d = wrapAngle(this.bladeAngle(h) + k * Math.PI);
          if (Math.abs(d) > Sim.BLADE_ARC) continue;
          const tipZ = h.z + Math.sin(d) * h.radius;
          if (Math.abs(b.z - tipZ) < 0.35 + b.hw) hit = true;
        }
      } else {
        const u = this.rockPhase(h);
        const landed = u >= Sim.ROCK_FALL && u < Sim.ROCK_FALL + 0.06;
        hit = landed && Math.hypot(b.x - h.x, b.z - h.z) < h.radius + b.hw;
      }
      if (!hit) continue;
      if (p.mode === 'dash' && p.modeT <= DASH.iframes) continue;
      if (this.damagePlayer(1, h.x, h.z)) this.emit({ t: 'hazardHit', id: h.id, kind: h.kind });
    }
  }

  // ───────────────────────── 拾い物・きっかけ
  private updatePickups(): void {
    const b = this.player.body;
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      if (Math.hypot(pk.def.x - b.x, pk.def.z - b.z) < WORLD.pickupRadius && Math.abs(pk.def.y - (b.y + 0.6)) < 1.4) {
        pk.taken = true;
        this.collect('p:' + pk.def.id);
        const repaid = earn(this.ledger, pk.def.value);
        this.emit({ t: 'pickup', value: pk.def.value, repaid });
      }
    }
  }

  private updateTriggers(): void {
    const b = this.player.body;
    const ar = this.level.arena;
    if (ar && !this.flag('boss_done') && !this.flag('boss_fighting') && this.flag(ar.afterFlag) && inBox(b.x, b.y + 0.5, b.z, ar.box)) {
      this.setFlag('boss_fighting');
      this.emit({ t: 'bossStart' });
    }
    for (const t of this.level.triggers) {
      const key = 'trig:' + t.id;
      if (this.flag(key)) continue;
      if (t.needFlag && !this.flag(t.needFlag)) continue;
      if (t.unlessFlag && this.flag(t.unlessFlag)) continue;
      if (inBox(b.x, b.y + 0.5, b.z, t.box)) {
        this.setFlag(key);
        this.emit({ t: 'dialog', script: t.script });
      }
    }
  }
}

export function inBox(x: number, y: number, z: number, box: { min: [number, number, number]; max: [number, number, number] }): boolean {
  return (
    x >= Math.min(box.min[0], box.max[0]) &&
    x <= Math.max(box.min[0], box.max[0]) &&
    y >= Math.min(box.min[1], box.max[1]) &&
    y <= Math.max(box.min[1], box.max[1]) &&
    z >= Math.min(box.min[2], box.max[2]) &&
    z <= Math.max(box.min[2], box.max[2])
  );
}

export { ABILITIES };
