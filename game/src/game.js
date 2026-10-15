// ゲーム本体。シミュレーションのみで DOM に触れない（テストからも動かせる）。
import { DT, TILE, VIEW_W, VIEW_H, ZOOM, PLAYER as PC } from './config.js';
import { overlap, cx, cy, clamp, lerp, makeRng, sign } from './util.js';
import { TileMap } from './tilemap.js';
import { Player } from './player.js';
import { makeEnemy, RustSoldier, GearKnight } from './enemies.js';
import { Tokimori, updateHoming } from './boss.js';
import { Fx } from './fx.js';
import { NullSfx } from './audio.js';
import { BOONS, rollOffer } from './boons.js';
import { LAYOUTS, FLOOR_NAMES, buildPlan } from './world.js';
import {
  newMeta, serialize, deserialize, endLoop, learn, knows, hasWedge, addWedge, removeWedge, freeSlots,
  bossCounter, trueEndReady, GLEN_DEADLINE, KNOWLEDGE, COUNTERS, MAX_SLOTS, fmtClock, wedgeLabel,
} from './meta.js';

const BUFFERED = ['attack', 'jump', 'dodge', 'skill'];
const REWARD_LABEL = { boon: '強化', boon2: '強化×2', heal: '回復', hourglass: '砂時計' };

export class Game {
  constructor(opts = {}) {
    this.sfx = opts.sfx || new NullSfx();
    this.storage = opts.storage || null;
    this.fx = new Fx();
    if (opts.deterministicFx) this.fx.rand = makeRng(1).next;
    this.settings = { shake: true, volume: 0.6, ...(opts.settings || {}) };
    this.fx.settings = this.settings;
    this.scene = 'title';
    this.modal = null;
    this.time = 0;
    this.hitstop = 0;
    this.slowT = 0; this.slowScale = 1;
    this.timeStopT = 0;
    this.cam = { x: 0, y: 0 };
    this.titleSel = 0;
    this.meta = null;
    this.loadSave();
    this.log = []; // テスト・デバッグ用のイベント記録
    this.pendingPresses = new Set();
  }

  // ───────── セーブ ─────────
  loadSave() {
    if (!this.storage) return;
    const s = this.storage.load();
    this.meta = s ? deserialize(s) : null;
  }
  save() { if (this.storage && this.meta) this.storage.save(serialize(this.meta)); }

  // ───────── 進行 ─────────
  newGame(seed) {
    this.meta = newMeta(seed);
    this.save();
    this.startLoop();
  }
  continueGame() {
    if (!this.meta) return this.newGame();
    this.startLoop();
  }
  loopSeed() { return (Math.imul(this.meta.seed ^ 0x9e3779b9, 31) + this.meta.loop * 7919) >>> 0; }

  startLoop() {
    const meta = this.meta;
    const plan = buildPlan(meta, this.loopSeed());
    const wedgedBoons = meta.wedges.filter((w) => w.target === 'boon').map((w) => ({ ...w.boon }));
    this.run = {
      plan,
      fi: 0, ri: 0,
      clock: 0,
      offerRng: makeRng(plan.offerSeed),
      bossRng: makeRng(plan.offerSeed ^ 0xb055),
      dmgByCat: { combo: 0, heavy: 0, air: 0, echo: 0, skill: 0 },
      learned: [],
      newWedges: [],
      nextReward: null,
      glen: 'unknown',
      forged: false,
      vaultOpen: false,
      altarUsed: false,
      fountainUsed: {},
      ended: false,
      deathT: 0,
      perfects: 0,
      kills: 0,
    };
    this.player = new Player(0, 0);
    this.player.setBoons(wedgedBoons);
    this.player.hp = this.player.maxHp;
    this.scene = 'play';
    this.modal = null;
    this.fx.clear();
    this.timeStopT = 0; this.slowT = 0; this.hitstop = 0;
    this.enterRoom(0, 0);
    this.fx.setBanner(`第 ${meta.loop} 夜`, FLOOR_NAMES[0], '#f2c14e', 2.2);
    this.save();
    this.emit('loopStart', { loop: meta.loop });
  }

  emit(type, data = {}) { this.log.push({ type, t: this.run ? this.run.clock : 0, ...data }); if (this.log.length > 500) this.log.shift(); }

  roomDesc(fi = this.run.fi, ri = this.run.ri) { return this.run.plan.floors[fi] && this.run.plan.floors[fi][ri]; }

  enterRoom(fi, ri) {
    const run = this.run;
    const prevFloor = run.fi;
    run.fi = fi; run.ri = ri;
    const desc = this.roomDesc();
    this.map = new TileMap(LAYOUTS[desc.layout]);
    this.room = { desc, cleared: false, rewardSpawned: false, enemies: [], projectiles: [], echoes: [], items: [], t: 0, boss: null, glenHp: 0 };
    this.player.vx = 0; this.player.vy = 0; this.player.state = 'normal'; this.player.atk = null;
    const spawn = this.map.markers.find((m) => m.c === 'P') || { x: TILE * 2, y: this.map.pxH - TILE * 4 };
    this.player.x = spawn.x + (TILE - this.player.w) / 2;
    this.player.y = spawn.y + TILE - this.player.h;
    this.player.face = 1;
    this.player.lastSafe = { x: this.player.x, y: this.player.y };
    this.updateCamera(DT, true);
    if (fi !== prevFloor) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 15);
      this.fx.setBanner(FLOOR_NAMES[fi], `夜 ${fmtClock(run.clock)}`, '#efe6d2', 1.8);
    }
    const setup = {
      entry: () => this.setupEntry(),
      combat: () => { for (const e of desc.enemies) this.addEnemy(makeEnemy(e.type, e.x * TILE, e.y * TILE)); },
      forge: () => this.setupForge(),
      elite: () => this.setupElite(),
      archive: () => this.setupArchive(),
      study: () => this.setupStudy(),
      boss: () => this.setupBoss(),
    }[desc.type];
    setup();
    for (const m of this.map.markers) if (m.c === 'Q' && this.meta.loop <= 2) this.addSign(m);
    // 敵のいない部屋はすぐに出口が開く
    if (!this.room.enemies.length && desc.type !== 'boss' && desc.type !== 'forge') this.clearRoom(true);
    this.emit('enterRoom', { fi, ri, type: desc.type, layout: desc.layout });
  }

  addEnemy(e) {
    if (!e) return;
    this.room.enemies.push(e);
    const tellKey = { soldier: 'tell_soldier', bat: 'tell_bat', turret: 'tell_turret', knight: 'tell_knight', boss: 'tell_boss' }[e.kind];
    if (tellKey) e.tellKey = tellKey;
    return e;
  }
  spawnProjectile(p) { this.room.projectiles.push(p); }
  marker(c) { return this.map.markers.find((m) => m.c === c); }
  addItem(it) { this.room.items.push({ w: 24, h: 40, ...it }); return it; }
  addSign(m) {
    const texts = this.touch ? [
      '左のスティックで移動。右のボタンで 跳ぶ・攻撃（長押しで重撃）・回避',
      '時歪は秒針ゲージを消費して周囲を遅くする。光る印の前で「調べる」',
    ] : [
      '←→ 移動　Z ジャンプ　X 攻撃（長押しで重撃）　C 回避',
      'V 時歪（秒針ゲージ消費）　↑/E 調べる　Tab 記録帳　Esc 中断',
    ];
    const i = this.map.markers.filter((x) => x.c === 'Q').indexOf(m);
    this.addItem({ kind: 'sign', x: m.x, y: m.y + TILE - 40, text: texts[i] || texts[0] });
  }

  // ───────── 因果部屋の組み立て（meta の状態だけで決まる） ─────────
  setupEntry() {
    const L = this.marker('L');
    this.addItem({ kind: 'npc', who: 'lira', x: L.x + 3, y: L.y + TILE - 34, w: 18, h: 34, causal: true, wedged: hasWedge(this.meta, 'lira') });
    if (hasWedge(this.meta, 'glen')) {
      const G = this.marker('G');
      this.addItem({ kind: 'npc', who: 'glen', x: G.x, y: G.y + TILE - 40, w: 26, h: 40, causal: true, wedged: true });
      this.run.glen = 'alive';
    }
  }
  setupForge() {
    const G = this.marker('G');
    const run = this.run;
    if (hasWedge(this.meta, 'glen')) {
      this.addItem({ kind: 'sign', x: G.x, y: G.y + TILE - 40, text: '鍛冶場は空っぽだ。グレンは塔の入口にいる。' });
      this.clearRoom(true);
      return;
    }
    if (run.clock > GLEN_DEADLINE) {
      run.glen = 'dead';
      this.addItem({ kind: 'corpse', who: 'glen', x: G.x - 4, y: G.y + TILE - 14, w: 34, h: 14 });
      this.clearRoom(true);
      return;
    }
    run.glen = 'attacked';
    this.room.glenHp = 60;
    this.addItem({ kind: 'npc', who: 'glen', x: G.x, y: G.y + TILE - 40, w: 26, h: 40, causal: true, wedged: false, inDanger: true });
    for (const m of this.map.markers) if (m.c === 'g') {
      const s = this.addEnemy(new RustSoldier(m.x + 5, m.y + TILE));
      s.setState('chase');
    }
    this.fx.setBanner('鍛冶屋が襲われている！', '錆兵を倒せ', '#ff5a3c', 1.6);
  }
  setupElite() {
    const K = this.marker('K');
    const U = this.marker('U');
    if (this.room.desc.knightWedged) {
      this.addItem({ kind: 'wreck', x: K.x - 6, y: K.y + TILE - 24, w: 42, h: 24, causal: true, wedged: true, permanent: true });
      this.addItem({ kind: 'lift', x: U.x - 6, y: U.y + TILE - 50, w: 42, h: 50, causal: true });
      this.learnK('knight_lift');
      return;
    }
    this.addItem({ kind: 'lift', x: U.x - 6, y: U.y + TILE - 50, w: 42, h: 50, dead: true });
    this.addEnemy(new GearKnight(K.x, K.y + TILE));
    this.fx.setBanner('歯車騎士', '盾は重撃で崩せる', '#f2c14e', 1.6);
  }
  setupArchive() {
    const C = this.marker('C'), Y = this.marker('Y'), O = this.marker('O'), H = this.marker('H');
    this.addItem({ kind: 'codedoor', x: C.x - 10, y: C.y + TILE - 60, w: 50, h: 60, causal: true });
    this.addItem({ kind: 'diary', x: Y.x + 3, y: Y.y + TILE - 26, w: 24, h: 26, vault: true });
    this.addItem({ kind: 'altar', x: O.x, y: O.y + TILE - 30, w: 30, h: 30, vault: true });
    this.addItem({ kind: 'fountain', id: 'archive', x: H.x, y: H.y + TILE - 30, w: 30, h: 30 });
  }
  setupStudy() {
    const W2 = this.marker('W'), H = this.marker('H'), R = this.marker('R');
    this.addItem({ kind: 'note', x: W2.x, y: W2.y + TILE - 30, w: 30, h: 30 });
    this.addItem({ kind: 'fountain', id: 'study', x: H.x, y: H.y + TILE - 30, w: 30, h: 30 });
    this.addItem({ kind: 'brake', x: R.x - 5, y: R.y + TILE - 60, w: 40, h: 60, causal: true, wedged: hasWedge(this.meta, 'brake') });
  }
  setupBoss() {
    const M = this.marker('M');
    const counter = bossCounter(this.meta.lastLoop);
    const b = this.addEnemy(new Tokimori(M.x, M.y + TILE, { counter, brake: hasWedge(this.meta, 'brake'), rng: this.run.bossRng }));
    b.face = -1;
    this.room.boss = b;
    const lines = [];
    if (this.meta.flags.bossBeaten) lines.push({ who: '刻守', text: 'また来たか。何度来ても、夜は終わらんよ。' });
    else lines.push({ who: '刻守', text: '……弟子よ。鐘の時刻だ。下がっていろ。' });
    if (counter) lines.push({ who: '刻守', text: `前の夜、お前は${{ combo: '連撃', heavy: '重撃', air: '空中からの攻め', echo: '残響', skill: '時歪' }[counter]}に頼りすぎた。もう通じんぞ。`, note: `刻守の対策：${COUNTERS[counter].name}――${COUNTERS[counter].desc}` });
    if (hasWedge(this.meta, 'brake')) lines.push({ who: '刻守', text: '歯止めを……！ 小癪な。ならば力で止めるまで！', note: '時止め封印／第2段階が早まり、技が速くなる' });
    this.openDialog(lines);
  }

  // ───────── 毎フレーム ─────────
  tick(input) {
    this.time += DT;
    if (this.scene === 'title') this.updateTitle(input);
    else if (this.scene === 'play') this.updatePlay(input);
    else if (this.scene === 'rewind') this.updateRewind(input);
    else if (this.scene === 'ending') this.updateEnding(input);
  }

  updatePlay(input) {
    // 暗転を先に終わらせる（部屋に入った直後の会話が黒い画面の上に出ないように）
    if (this.transition) { this.updateTransition(); this.fx.update(DT); return; }
    if (this.modal) { this.updateModal(input); this.fx.update(DT * 0.5); return; }
    if (input.pressed('pause') && this.player.state !== 'dead') { this.openPause(); return; }
    if (input.pressed('journal')) { this.openJournal(); return; }
    // ヒットストップ中の入力は捨てずに持ち越す（連撃・回避の取りこぼし防止）
    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - DT);
      for (const a of BUFFERED) if (input.pressed(a)) this.pendingPresses.add(a);
      return;
    }
    if (this.pendingPresses.size) {
      input.pressedNow = input.pressedNow || {};
      for (const a of this.pendingPresses) input.pressedNow[a] = true;
      this.pendingPresses.clear();
    }
    let dt = DT;
    if (this.slowT > 0) { this.slowT -= DT; dt *= this.slowScale; }
    const run = this.run, room = this.room, p = this.player;
    run.clock += dt;
    room.t += dt;
    if (this.timeStopT > 0) {
      this.timeStopT -= dt;
      if (this.timeStopT <= 0) { this.sfx.play('timeResume'); this.fx.screenFlash('#ffffff', 0.35); }
    }
    // 時止め中はプレイヤーだけが遅くなる（完全停止はさせない）
    const pdt = this.timeStopT > 0 ? dt * 0.3 : dt;
    p.update(this, input, pdt);
    if (p.afterT > 0) p.afterT -= pdt;

    if (p.state === 'normal' && p.onGround && (input.pressed('interact') || input.pressed('up'))) this.tryInteract();
    this.resolvePlayerAttacks();
    for (const e of room.enemies) {
      const edt = this.timeStopT > 0 && !e.boss ? dt * 0.3 : dt;
      if (e.alive) e.update(this, edt);
    }
    this.resolveEnemyAttacks();
    for (const pr of room.projectiles) { updateHoming(pr, this); pr.update(this, this.timeStopT > 0 && !pr.homing ? dt * 0.3 : dt); }
    this.resolveProjectiles();
    this.updateEchoes(dt);
    this.handleDeaths();
    room.projectiles = room.projectiles.filter((x) => x.alive);
    this.updateItems(dt);
    this.updateRoomLogic(dt);
    this.updateCamera(dt);
    this.fx.update(dt);
    if (p.state === 'dead') this.updateDeath();
  }

  updateCamera(dt, snap = false) {
    const p = this.player;
    const vw = VIEW_W / ZOOM, vh = VIEW_H / ZOOM;
    const tx = clamp(cx(p) - vw / 2 + p.face * 40, 0, Math.max(0, this.map.pxW - vw));
    const ty = clamp(cy(p) - vh * 0.6, 0, Math.max(0, this.map.pxH - vh));
    const k = snap ? 1 : 1 - Math.pow(0.001, dt);
    this.cam.x = lerp(this.cam.x, tx, k);
    this.cam.y = lerp(this.cam.y, ty, snap ? 1 : 1 - Math.pow(0.02, dt));
    if (Math.abs(this.cam.x - tx) < 0.3) this.cam.x = tx;
  }

  // ───────── 戦闘 ─────────
  resolvePlayerAttacks() {
    const p = this.player;
    const hb = p.hitbox();
    if (!hb) return;
    const a = p.atk;
    for (const e of this.room.enemies) {
      if (!e.alive || a.hitIds.has(e.id)) continue;
      if (!overlap(hb, e)) continue;
      a.hitIds.add(e.id);
      const dir = a.def.spin ? sign(cx(e) - cx(p)) || p.face : p.face;
      this.dealDamage(e, { base: a.def.dmg, cat: a.def.cat, knock: a.def.knock, dir, stop: a.def.stop, breaks: !!a.def.breaks, shake: a.def.shake || 0, heavy: a.name === 'heavy' });
    }
    // 弾は斬り落とせる
    for (const pr of this.room.projectiles) {
      if (pr.alive && pr.destroyable && pr.delay <= 0 && overlap(hb, pr)) {
        pr.alive = false;
        this.fx.sparks(pr.x + pr.w / 2, pr.y + pr.h / 2, '#f2c14e', 8);
        this.sfx.play('block');
        this.hitstop = Math.max(this.hitstop, 2 / 60);
        p.gauge = Math.min(PC.gaugeMax, p.gauge + 4);
      }
    }
  }

  dealDamage(e, info) {
    const p = this.player, st = p.stats, run = this.run;
    let dmg = info.base * st.dmgMul;
    let cat = info.cat;
    if (!info.echo) {
      if (p.afterT > 0 && st.afterimageMul > 1) { dmg *= st.afterimageMul; p.afterT = 0; this.fx.text(cx(e), e.y - 18, '残影', '#5fd18b', 12); }
      if (p.empowerNext > 1) { dmg *= p.empowerNext; p.empowerNext = 1; this.fx.text(cx(e), e.y - 30, '×3', '#e35d5d', 14); }
      if (info.heavy && e.slowed && st.shatterMul > 1) {
        dmg *= st.shatterMul; info.breaks = true;
        this.fx.burst(cx(e), cy(e), '#5aa9e6', 22); this.fx.text(cx(e), e.y - 30, '粉砕', '#5aa9e6', 16);
      }
    }
    if (e.warp > 0) cat = 'skill';
    dmg = Math.round(dmg);
    const res = e.takeHit(this, { dmg, dir: info.dir, knock: info.knock, breaks: info.breaks, echo: !!info.echo, cat: info.cat });
    if (res.silent) return res;
    if (res.absorbed) { this.fx.text(cx(e), e.y - 10, '吸収', '#b67cf0', 12); return res; }
    if (res.parried) {
      this.sfx.play('block'); this.fx.sparks(cx(e) - e.face * 16, cy(e), '#5aa9e6', 14, 300);
      this.fx.text(cx(e), e.y - 16, '受け流し', '#5aa9e6', 14);
      this.hitstop = Math.max(this.hitstop, 6 / 60);
      p.vx = -p.face * 260;
      return res;
    }
    if (res.blocked) {
      this.sfx.play('block');
      this.fx.sparks(info.dir > 0 ? e.x : e.x + e.w, cy(e), '#e8e8e8', 7, 240, -info.dir);
      this.hitstop = Math.max(this.hitstop, 2 / 60);
      if (!info.echo) p.vx = -info.dir * 160;
      this.fx.text(cx(e), e.y - 10, '弾かれた', '#9a8fa6', 11);
      this.learnOnce(e);
      return res;
    }
    run.dmgByCat[info.echo ? 'echo' : cat] = (run.dmgByCat[info.echo ? 'echo' : cat] || 0) + dmg;
    if (res.guardBreak) { this.sfx.play('guardBreak'); this.fx.text(cx(e), e.y - 30, '崩し', '#f2c14e', 16); this.fx.shake(5, 0.2); }
    const hx = info.dir > 0 ? e.x + 4 : e.x + e.w - 4;
    this.fx.sparks(hx, cy(e), info.echo ? '#b67cf0' : info.heavy ? '#f2c14e' : '#fff3d6', info.heavy ? 14 : 7, info.heavy ? 380 : 260, info.dir);
    this.fx.text(cx(e) + (Math.random() - 0.5) * 10, e.y - 6, String(dmg), info.echo ? '#c9a0ff' : info.heavy ? '#f2c14e' : '#ffffff', info.heavy ? 18 : 13);
    if (!info.echo) {
      this.hitstop = Math.max(this.hitstop, info.stop || 3 / 60);
      this.sfx.play(info.heavy || (info.shake || 0) >= 3 ? 'heavyHit' : 'hit');
      if (info.shake) this.fx.shake(info.shake);
      p.gauge = Math.min(PC.gaugeMax, p.gauge + PC.gaugePerHit);
      if (st.lagTime) e.lag = Math.max(e.lag, st.lagTime);
      if (st.echoMul) {
        this.room.echoes.push({ t: 0.45, e, dmg: info.base * st.echoMul, dir: info.dir });
        if (st.doubleEchoOnSlow && e.slowed) this.room.echoes.push({ t: 0.7, e, dmg: info.base * st.echoMul, dir: info.dir });
      }
    } else {
      this.sfx.play('hit');
      if (st.resonateGauge && info.cat === 'echo') { p.gauge = Math.min(PC.gaugeMax, p.gauge + st.resonateGauge); p.hp = Math.min(p.maxHp, p.hp + st.resonateHeal); }
    }
    this.learnOnce(e);
    return res;
  }
  learnOnce(e) { if (e.tellKey) this.learnK(e.tellKey, true); }

  updateEchoes(dt) {
    const room = this.room;
    for (const ec of room.echoes) {
      ec.t -= dt;
      if (ec.t <= 0 && ec.e.alive) {
        this.fx.ring(cx(ec.e), cy(ec.e), '#b67cf0', 22, 0.25);
        this.dealDamage(ec.e, { base: ec.dmg, cat: 'echo', knock: 40, dir: ec.dir, echo: true });
      }
    }
    room.echoes = room.echoes.filter((x) => x.t > 0 && x.e.alive);
  }

  resolveEnemyAttacks() {
    const p = this.player;
    for (const e of this.room.enemies) {
      if (!e.alive) continue;
      for (const a of e.attacks) this.hitPlayer(a, a.dmg, cx(e), a.key);
    }
  }
  resolveProjectiles() {
    for (const pr of this.room.projectiles) {
      if (!pr.alive || pr.delay > 0) continue;
      if (this.hitPlayer(pr, pr.dmg, pr.x + pr.w / 2, pr.key) && pr.kind !== 'wave') pr.alive = false;
    }
  }
  // 戻り値: 当たったか
  hitPlayer(box, dmg, fromX, key) {
    const p = this.player;
    if (p.state === 'dead') return false;
    // ジャスト回避：回避を始めた位置か今の位置に、回避直後の攻撃が重なれば成立（少し広めに取る）
    if (p.dodging && !p.perfectUsed) {
      const win = PC.perfectWindow + p.stats.perfectBonus / 60;
      const g = 8, grow = (r) => ({ x: r.x - g, y: r.y - g, w: r.w + g * 2, h: r.h + g * 2 });
      if (p.sinceDodge <= win && (overlap(box, grow(p)) || (p.dodgeFrom && overlap(box, grow(p.dodgeFrom))))) { this.perfectDodge(); return false; }
    }
    if (!overlap(box, p)) return false;
    if (p.invulnerable) return false;
    this.damagePlayer(dmg, { fromX });
    return true;
  }

  perfectDodge() {
    const p = this.player, st = p.stats;
    p.perfectUsed = true;
    this.run.perfects++;
    this.slowT = PC.perfectSlowTime; this.slowScale = PC.perfectSlowScale;
    p.gauge = Math.min(PC.gaugeMax, p.gauge + PC.gaugePerfect);
    p.iframeT = Math.max(p.iframeT, 0.25);
    this.sfx.play('perfect');
    this.fx.ring(cx(p), cy(p), '#ffffff', 46, 0.35);
    this.fx.text(cx(p), p.y - 20, '刹那', '#ffffff', 16);
    if (st.perfectResetsDodge) { p.dodgeCd = 0; p.airDodgeUsed = false; }
    if (st.perfectNextMul > 1) p.empowerNext = st.perfectNextMul;
    if (st.freezeTime) {
      for (const e of this.room.enemies) if (e.alive && Math.hypot(cx(e) - cx(p), cy(e) - cy(p)) < 220) e.lag = Math.max(e.lag, st.freezeTime);
      this.fx.ring(cx(p), cy(p), '#5aa9e6', 220, 0.4);
    }
    this.emit('perfect');
  }

  damagePlayer(dmg, { fromX, pit } = {}) {
    const p = this.player;
    if (p.state === 'dead') return;
    if (!pit && p.invulnerable) return;
    p.hurt(dmg, fromX ?? cx(p));
    this.fx.vignette = 1;
    this.fx.shake(pit ? 3 : 6, 0.22);
    this.fx.text(cx(p), p.y - 10, `-${dmg}`, '#ff5a3c', 16);
    this.sfx.play('hurt');
    this.hitstop = Math.max(this.hitstop, 5 / 60);
    this.emit('playerHurt', { dmg, hp: p.hp });
    if (p.stats.mirrorDmg && p.state !== 'dead') {
      this.fx.afterimage(p);
      for (const e of this.room.enemies) if (e.alive && Math.hypot(cx(e) - cx(p), cy(e) - cy(p)) < 130) {
        this.dealDamage(e, { base: p.stats.mirrorDmg / p.stats.dmgMul, cat: 'echo', knock: 120, dir: sign(cx(e) - cx(p)) || 1, echo: true });
      }
      this.fx.ring(cx(p), cy(p), '#b67cf0', 130, 0.3);
    }
    if (p.state === 'dead') {
      this.run.deathT = 0;
      this.sfx.play('kill');
      this.emit('playerDeath');
    }
  }

  useSkill() {
    const p = this.player;
    const cost = PC.skillCost * p.stats.skillCostMul;
    if (p.gauge < cost) { this.sfx.play('deny'); this.fx.text(cx(p), p.y - 14, 'ゲージ不足', '#9a8fa6', 11); return false; }
    p.gauge -= cost;
    const t = PC.skillTime + p.stats.skillTimeAdd;
    for (const e of this.room.enemies) if (e.alive && Math.hypot(cx(e) - cx(p), cy(e) - cy(p)) < PC.skillRadius) {
      e.warp = e.boss && e.counter === 'skill' ? t / 2 : t;
    }
    for (const pr of this.room.projectiles) if (Math.hypot(pr.x - cx(p), pr.y - cy(p)) < PC.skillRadius) { pr.vx *= 0.35; pr.vy *= 0.35; }
    this.sfx.play('skill');
    this.fx.ring(cx(p), cy(p), '#5aa9e6', PC.skillRadius, 0.5);
    this.fx.screenFlash('#5aa9e6', 0.25);
    this.emit('skill');
    return true;
  }

  handleDeaths() {
    const room = this.room, p = this.player;
    for (const e of room.enemies) {
      if (e.alive || e.handled) continue;
      e.handled = true;
      if (e.boss) continue;
      this.run.kills++;
      this.sfx.play('kill');
      this.fx.burst(cx(e), cy(e), e.elite ? '#f2c14e' : '#e8dcc4', e.elite ? 30 : 16);
      this.hitstop = Math.max(this.hitstop, (e.elite ? 10 : 4) / 60);
      if (e.elite) { this.fx.shake(8, 0.3); this.slowT = 0.5; this.slowScale = 0.35; }
      if (p.stats.reverbDmg) {
        this.fx.ring(cx(e), cy(e), '#b67cf0', 95, 0.3);
        for (const o of room.enemies) if (o.alive && o !== e && Math.hypot(cx(o) - cx(e), cy(o) - cy(e)) < 95) {
          this.dealDamage(o, { base: p.stats.reverbDmg / p.stats.dmgMul, cat: 'echo', knock: 160, dir: sign(cx(o) - cx(e)) || 1, echo: true });
        }
      }
      if (e.kind === 'knight') this.onKnightDown(e);
    }
    room.enemies = room.enemies.filter((e) => e.alive || e.boss);
    const living = room.enemies.filter((e) => e.alive && !e.boss).length;
    const t = room.desc.type;
    if (!room.cleared && living === 0 && (t === 'combat' || t === 'elite' || (t === 'forge' && this.run.glen === 'attacked'))) {
      if (t === 'forge') this.onGlenSaved();
      else this.clearRoom(false);
    }
  }

  // ───────── 部屋のクリア・報酬・扉 ─────────
  clearRoom(quiet) {
    const room = this.room;
    room.cleared = true;
    const t = room.desc.type;
    let reward = null;
    if (t === 'combat') reward = this.run.nextReward || 'boon';
    if (t === 'elite' && !room.desc.knightWedged) reward = 'boon2';
    if (!quiet) {
      this.fx.setBanner('制圧', '', '#f2c14e', 1.0);
      this.sfx.play('confirm');
    }
    if (reward) {
      const gx = this.map.pxW / 2;
      const gy = this.map.groundBelow(gx, this.map.pxH / 2) - 30;
      this.addItem({ kind: 'reward', reward, x: gx - 12, y: Math.min(gy, this.map.pxH - 4 * TILE), w: 24, h: 24, bob: 0 });
    } else this.openDoors();
    this.emit('roomClear', { type: t });
  }

  nextRooms() {
    const { fi, ri, plan } = this.run;
    if (ri + 1 < plan.floors[fi].length) return { fi, ri: ri + 1, desc: plan.floors[fi][ri + 1] };
    if (fi + 1 < plan.floors.length) return { fi: fi + 1, ri: 0, desc: plan.floors[fi + 1][0], stairs: true };
    return null;
  }
  openDoors() {
    if (this.room.doorsOpen) return;
    this.room.doorsOpen = true;
    const next = this.nextRooms();
    const X = this.marker('X');
    if (!next || !X) return;
    const doorY = X.y + TILE - 50;
    if (next.desc.type === 'combat') {
      next.desc.rewardChoices.forEach((rw, i) => this.addItem({ kind: 'door', x: X.x - i * 90 - 6, y: doorY, w: 36, h: 50, to: next, reward: rw }));
    } else {
      this.addItem({ kind: 'door', x: X.x - 6, y: doorY, w: 36, h: 50, to: next, reward: null, label: next.stairs ? '階段' : { forge: '鍛冶場', elite: '強敵', archive: '書庫', study: '書斎', boss: '鐘楼', entry: '' }[next.desc.type], causal: ['forge', 'archive', 'study'].includes(next.desc.type), boss: next.desc.type === 'boss', elite: next.desc.type === 'elite' });
    }
    this.sfx.play('door');
  }

  updateItems(dt) {
    const p = this.player;
    for (const it of this.room.items) {
      if (it.kind === 'reward') {
        it.bob = (it.bob || 0) + dt;
        if (!it.taken && overlap(it, p) && p.state !== 'dead') { it.taken = true; this.takeReward(it.reward); }
      }
      if (it.kind === 'wreck' && !it.permanent && !it.wedged) {
        it.life -= dt;
        if (it.life <= 0) it.gone = true;
      }
    }
    this.room.items = this.room.items.filter((it) => !it.taken && !it.gone);
  }

  takeReward(kind) {
    const p = this.player;
    this.emit('reward', { kind });
    if (kind === 'heal') {
      const amt = 40; p.hp = Math.min(p.maxHp, p.hp + amt);
      this.sfx.play('heal'); this.fx.text(cx(p), p.y - 20, `+${amt}`, '#5fd18b', 16); this.fx.ring(cx(p), cy(p), '#5fd18b', 40);
      this.openDoors();
    } else if (kind === 'hourglass') {
      p.baseMaxHp += 12; p.setBoons(p.boons); p.hp = Math.min(p.maxHp, p.hp + 20);
      this.sfx.play('heal'); this.fx.text(cx(p), p.y - 20, '最大HP+12', '#f2c14e', 15);
      this.openDoors();
    } else {
      this.openBoonPick(kind === 'boon2' ? 2 : 1, null);
    }
  }

  // ───────── 調べる ─────────
  nearestInteractable() {
    const p = this.player;
    const zone = { x: p.x - 14, y: p.y - 10, w: p.w + 28, h: p.h + 20 };
    let best = null, bd = 1e9;
    for (const it of this.room.items) {
      if (['reward'].includes(it.kind)) continue;
      if (it.vault && !this.run.vaultOpen) continue;
      if (!overlap(zone, it)) continue;
      const d = Math.abs(cx(it) - cx(p));
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  interactPrompt(it) {
    switch (it.kind) {
      case 'door': return it.reward ? `進む（${REWARD_LABEL[it.reward]}）` : `進む${it.label ? '：' + it.label : ''}`;
      case 'npc': return '話す';
      case 'sign': return '読む';
      case 'corpse': return '調べる';
      case 'codedoor': return this.run.vaultOpen ? '' : '番号を入れる';
      case 'diary': return '日誌を読む';
      case 'altar': return this.run.altarUsed ? '' : '祭壇に触れる';
      case 'note': return '走り書きを読む';
      case 'fountain': return this.run.fountainUsed[it.id] ? '' : '泉の水を飲む';
      case 'brake': return '歯止めを調べる';
      case 'wreck': return it.wedged ? '' : '楔を打つ';
      case 'lift': return it.dead ? '動かない' : '昇降機に乗る（上層・書斎へ）';
    }
    return '';
  }
  tryInteract() {
    const it = this.nearestInteractable();
    if (!it) return;
    const p = this.player;
    switch (it.kind) {
      case 'door': this.goDoor(it); break;
      case 'sign': this.openDialog([{ who: '', text: it.text }]); break;
      case 'npc': it.who === 'lira' ? this.talkLira(it) : this.talkGlen(it); break;
      case 'corpse':
        this.learnK('glen_time');
        this.openDialog([{ who: '', text: '鍛冶屋グレンは事切れている。血はまだ乾いていない。' }, { who: '', text: `……ほんの少し前だ。夜の ${fmtClock(GLEN_DEADLINE)} 頃か。`, note: '記録帳に追加：グレンの最期' }]);
        break;
      case 'codedoor': if (!this.run.vaultOpen) this.openCode(); break;
      case 'diary': this.readDiary(); break;
      case 'altar':
        if (this.run.altarUsed) break;
        this.run.altarUsed = true;
        if (!this.meta.unlocked.includes('stasis')) {
          this.meta.unlocked.push('stasis'); this.save();
          this.fx.setBanner('「停滞」の系統を解放', 'これ以降の夜でも強化候補に現れる', '#5aa9e6', 2.2);
        }
        this.openBoonPick(1, 'stasis');
        break;
      case 'note':
        this.learnK('code');
        this.openDialog([{ who: '', text: '師の机の走り書き。' }, { who: '', text: `「書庫の扉　${this.meta.code.join(' - ')}」`, note: '記録帳に追加：書庫の番号（次の夜も覚えている）' }]);
        break;
      case 'fountain':
        if (this.run.fountainUsed[it.id]) break;
        this.run.fountainUsed[it.id] = true;
        p.hp = Math.min(p.maxHp, p.hp + 35);
        this.sfx.play('heal'); this.fx.ring(cx(p), cy(p), '#5fd18b', 40); this.fx.text(cx(p), p.y - 20, '+35', '#5fd18b', 16);
        break;
      case 'brake': this.talkBrake(it); break;
      case 'wreck':
        if (it.wedged) break;
        this.openDialog([{ who: '', text: '歯車騎士の残骸。胸の歯車がまだ回っている。' }], [
          { label: '楔を打つ（次の夜も倒れたまま）', fn: () => this.doWedge({ target: 'knight' }, it) },
          { label: 'やめる', fn: () => {} },
        ]);
        break;
      case 'lift':
        if (it.dead) { this.openDialog([{ who: '', text: '昇降機は動かない。動力の歯車がどこかで回っているようだ。' }]); break; }
        this.startTransition({ fi: 2, ri: 1, desc: this.run.plan.floors[2][1], lift: true });
        break;
    }
  }

  goDoor(it) {
    if (it.reward) this.run.nextReward = it.reward;
    this.sfx.play('door');
    this.startTransition(it.to);
  }
  startTransition(to) { this.transition = { to, t: 0, entered: false }; }
  updateTransition() {
    const tr = this.transition;
    tr.t += DT;
    if (!tr.entered && tr.t >= 0.22) { tr.entered = true; this.enterRoom(tr.to.fi, tr.to.ri); if (tr.to.lift) this.fx.setBanner('昇降機', '上層・書斎へ', '#f2c14e', 1.4); }
    if (tr.t >= 0.44) this.transition = null;
  }

  // ───────── 人物 ─────────
  talkLira(it) {
    const m = this.meta;
    const wedged = hasWedge(m, 'lira');
    const lines = [];
    const choices = [];
    if (!wedged) {
      lines.push({ who: '少女', text: '鐘が鳴ったら、お父さんが帰ってくるの。' });
      if (knows(m, 'lira_name')) {
        choices.push({ label: '「リラ？」と呼ぶ', fn: () => this.openDialog([{ who: '少女', text: '……どうして、わたしの名前を？' }, { who: 'リラ', text: 'あなた、前にも会った……？ ううん、そんなはずない。' }, { who: '', text: '次の夜になれば、彼女はまた忘れてしまうだろう。', note: '金の印のついた人物には、楔を打てる' }], this.wedgeChoices('lira', it)) });
      }
      choices.push(...this.wedgeChoices('lira', it));
    } else if (!knows(m, 'lira_name')) {
      lines.push({ who: '少女', text: 'あなたのこと、知ってる気がする。前の夜にも来たよね？' });
      lines.push({ who: '少女', text: 'お父さんはね、塔のてっぺんで、ずっと時計を見てるの。' , note: '記録帳に追加：塔の上の父' });
      this.learnK('lira_father');
    } else {
      lines.push({ who: 'リラ', text: '来てくれた。……ちゃんと覚えてるよ、あなたのこと。' });
      lines.push({ who: 'リラ', text: 'お父さんは、わたしがいなくなった朝を、何度もやり直してる。' });
      lines.push({ who: 'リラ', text: 'お父さんに伝えて。「リラは覚えてる」って。', note: '記録帳に追加：リラの伝言' });
      this.learnK('lira_message');
    }
    this.openDialog(lines, choices.length ? [...choices, { label: '立ち去る', fn: () => {} }] : null);
  }
  wedgeChoices(target, it) {
    if (hasWedge(this.meta, target)) return [];
    return [{ label: `楔を打つ（残り ${freeSlots(this.meta)} 本）`, fn: () => this.doWedge({ target }, it) }];
  }
  talkGlen(it) {
    const run = this.run;
    if (it.inDanger && this.room.desc.type === 'forge' && run.glen === 'attacked') {
      this.openDialog([{ who: 'グレン', text: 'うおっ、来るな！ いや、お前じゃない、あいつらだ！' }]);
      return;
    }
    const lines = [];
    if (hasWedge(this.meta, 'glen') && this.room.desc.type === 'entry') lines.push({ who: 'グレン', text: '妙な夢を見た。お前に助けられた夢だ。……借りは返すぜ。' });
    else lines.push({ who: 'グレン', text: '助かった。命の恩人だ。腕を見せな、一つ鍛えてやる。' });
    const choices = [];
    if (!run.forged) choices.push({ label: '強化を鍛えてもらう（II）', fn: () => this.openForge() });
    else lines.push({ who: 'グレン', text: '今夜の分はもう打った。次の夜にまた来い。' });
    choices.push(...this.wedgeChoices('glen', it));
    choices.push({ label: '立ち去る', fn: () => {} });
    this.openDialog(lines, choices);
  }
  onGlenSaved() {
    const room = this.room;
    room.cleared = true;
    this.run.glen = 'saved';
    const g = room.items.find((x) => x.kind === 'npc' && x.who === 'glen');
    if (g) g.inDanger = false;
    this.learnK('glen_saved');
    this.fx.setBanner('鍛冶屋を救った', '話しかけよう', '#f2c14e', 1.6);
    this.sfx.play('pickup');
    this.openDoors();
  }
  updateRoomLogic(dt) {
    const room = this.room, run = this.run;
    if (room.desc.type === 'forge' && run.glen === 'attacked') {
      const attackers = room.enemies.filter((e) => e.alive && e.nearNpc).length;
      if (attackers && Math.floor(room.t * 3) !== Math.floor((room.t - dt) * 3)) { const g = this.glenItem(); if (g) this.fx.sparks(cx(g), g.y + 12, '#ff8a6a', 3, 120); }
      room.glenHp -= attackers * 4.5 * dt;
      if (room.glenHp <= 0) {
        run.glen = 'dead';
        const g = room.items.find((x) => x.kind === 'npc' && x.who === 'glen');
        if (g) { g.gone = true; this.addItem({ kind: 'corpse', who: 'glen', x: g.x - 4, y: g.y + 26, w: 34, h: 14 }); }
        this.learnK('glen_time');
        this.fx.setBanner('グレンが倒れた', 'もっと早く着いていれば……', '#ff5a3c', 1.8);
        this.sfx.play('hurt');
      }
    }
    if (room.desc.type === 'forge' && run.glen === 'dead' && !room.cleared && room.enemies.every((e) => !e.alive)) this.clearRoom(true);
    if (room.boss && room.boss.defeated && room.bossOutroT != null) {
      room.bossOutroT += dt;
      if (room.bossOutroT > 3.2 && !run.ended) {
        if (room.trueEnd) this.startEnding();
        else this.endRun('bell');
      }
    }
  }

  glenItem() { return this.room.items.find((x) => x.kind === 'npc' && x.who === 'glen'); }
  // 敵の狙い：救出戦で、プレイヤーが離れている間はグレンを襲う
  targetFor(e) {
    const p = this.player;
    if (this.room.desc.type === 'forge' && this.run.glen === 'attacked' && Math.abs(cx(p) - cx(e)) > 150) {
      const g = this.glenItem();
      if (g) return { x: g.x, y: g.y, w: g.w, h: g.h, isNpc: true };
    }
    return p;
  }

  readDiary() {
    const first = !knows(this.meta, 'master_reason');
    this.learnK('master_reason');
    const lines = [
      { who: '日誌', text: '崩落の朝、鐘楼の床が抜けた。リラは市場にいた。' },
      { who: '日誌', text: '鐘には時を戻す力がある。鳴らせば、夜は崩落の前に戻る。' },
      { who: '日誌', text: '何度でも鳴らそう。あの子が笑っている夜を、何度でも。' },
    ];
    if (first && !this.meta.flags.diaryRead) {
      this.meta.flags.diaryRead = true;
      if (this.meta.slots < MAX_SLOTS) { this.meta.slots++; lines.push({ who: '', text: '師の執念が、あなたの楔と共鳴した。', note: '楔の枠が1つ増えた' }); }
      this.save();
    }
    this.openDialog(lines);
  }
  talkBrake(it) {
    if (hasWedge(this.meta, 'brake')) {
      this.openDialog([{ who: '', text: '歯止めには金の楔が打ち込まれている。鐘楼の時止めの機構は動かない。' }]);
      return;
    }
    this.openDialog([{ who: '', text: '鐘楼へ続く歯止め。師の「時止め」は、この機構から力を引いている。' }], [
      { label: '楔を打つ（時止めを封じる。代償：刻守が怒る）', fn: () => this.doWedge({ target: 'brake' }, it) },
      { label: 'やめる', fn: () => {} },
    ]);
  }

  doWedge(w, it) {
    if (freeSlots(this.meta) <= 0) {
      this.openDialog([{ who: '', text: '楔の枠が足りない。', note: '巻き戻りのときに、打った楔を外して枠を空けられる' }]);
      this.sfx.play('deny');
      return;
    }
    this.player.startChannel(0.9, '楔', () => {
      if (!addWedge(this.meta, w)) return;
      this.run.newWedges.push(w);
      if (it) it.wedged = true;
      this.sfx.play('wedge');
      this.fx.burst(it ? cx(it) : cx(this.player), it ? cy(it) : cy(this.player), '#f2c14e', 26);
      this.fx.screenFlash('#f2c14e', 0.3);
      this.fx.setBanner('楔を打った', wedgeLabel(w) + '――次の夜も、このまま', '#f2c14e', 1.8);
      this.hitstop = 6 / 60;
      this.save();
      this.emit('wedge', { target: w.target });
    });
  }

  learnK(key, quiet) {
    if (!learn(this.meta, key)) return false;
    this.run.learned.push(key);
    this.save();
    if (!quiet) this.sfx.play('knowledge');
    this.fx.text(cx(this.player), this.player.y - 40, quiet ? `記録：${KNOWLEDGE[key].title}` : `◆ ${KNOWLEDGE[key].title}`, '#7fb8ff', quiet ? 11 : 13);
    this.emit('learn', { key });
    return true;
  }

  // ───────── 刻守 ─────────
  onBossPhase(b, phase) {
    this.fx.shake(6, 0.4);
    this.sfx.play('bossBell');
    this.room.projectiles = [];
    if (phase === 2) {
      this.fx.setBanner('第二楽章', b.brake ? '怒れる刻守' : '時が軋む', '#f2c14e', 1.5);
    }
    if (phase === 3) {
      this.fx.setBanner('第三楽章', '', '#f2c14e', 1.2);
      this.learnK('lira_name');
      const lines = [{ who: '刻守', text: 'リラ……もう一度だけ、あの朝の前に……！' }];
      if (trueEndReady(this.meta)) {
        b.setState('talk');
        this.openDialog(lines, [
          { label: '「リラは覚えている」と伝える', fn: () => this.beginTrueDuel(b) },
          { label: '黙って斬る', fn: () => { b.setState('idle'); } },
        ]);
      } else this.openDialog(lines);
    }
  }
  beginTrueDuel(b) {
    b.trueDuel = true;
    b.brake = true; // 真の決闘では時止めを使わない
    b.setState('phaseShift');
    this.room.duel = true;
    this.openDialog([
      { who: '刻守', text: '……覚えている、だと？ あの子が、この夜を？' },
      { who: '刻守', text: 'ならば――鐘はもう要らんのか。' },
      { who: '刻守', text: '構えろ、弟子よ。最後は、時の力なしで決めよう。' },
    ]);
    this.fx.setBanner('夜明けの決闘', '', '#ffd38a', 2.0);
  }
  onBossDefeated(b) {
    this.room.projectiles = [];
    this.room.bossOutroT = 0;
    this.slowT = 1.2; this.slowScale = 0.25;
    this.fx.shake(10, 0.6);
    this.fx.burst(cx(b), cy(b), '#f2c14e', 40);
    this.hitstop = 0.2;
    if (b.trueDuel) {
      this.room.trueEnd = true;
      this.fx.setBanner('夜明け', '', '#ffd38a', 3);
    } else {
      this.learnK('boss_bell');
      this.sfx.play('bossBell');
      this.fx.setBanner('鐘が鳴る', '――夜が戻る', '#f2c14e', 3);
    }
    this.emit('bossDefeated', { trueEnd: !!b.trueDuel });
  }
  startTimeStop(t) {
    this.timeStopT = t;
    this.sfx.play('timeStop');
    this.fx.screenFlash('#ffffff', 0.25);
  }

  updateDeath() {
    const run = this.run;
    run.deathT += DT;
    if (run.deathT < 0.05) { this.slowT = 0.8; this.slowScale = 0.3; }
    if (run.deathT > 1.6 && !run.ended) this.endRun('death');
  }

  endRun(cause) {
    const run = this.run, p = this.player;
    if (run.ended) return;
    run.ended = true;
    const report = endLoop(this.meta, {
      cause, floor: run.fi + 1, boons: p.boons, dmgByCat: run.dmgByCat, newWedges: run.newWedges, learned: run.learned, clock: run.clock,
    });
    this.save();
    this.sfx.play('rewind');
    this.scene = 'rewind';
    this.modal = null;
    this.rewind = { report, t: 0, sel: 0, mode: 'view', sub: 0, fast: report.loop >= 2 };
    this.emit('loopEnd', { cause });
  }

  // ───────── 結末 ─────────
  startEnding() {
    this.run.ended = true;
    this.meta.flags.ending = true;
    this.save();
    this.scene = 'ending';
    this.ending = { t: 0, page: 0 };
    this.emit('ending');
  }
  updateEnding(input) {
    const e = this.ending;
    e.t += DT;
    if (e.t > 0.8 && (input.pressed('confirm') || input.pressed('attack') || input.pressed('jump'))) {
      e.page++; e.t = 0;
      this.sfx.play('select');
      if (e.page >= ENDING_PAGES.length) { this.scene = 'title'; this.titleSel = 0; }
    }
  }

  // ───────── 巻き戻り画面 ─────────
  rewindOptions() {
    const m = this.meta;
    const opts = [{ id: 'next', label: '次の夜へ' }];
    const lastBoons = (m.lastLoop && m.lastLoop.boons) || [];
    const wedgedIds = new Set(m.wedges.filter((w) => w.target === 'boon').map((w) => w.boon.id));
    if (freeSlots(m) > 0 && lastBoons.some((b) => !wedgedIds.has(b.id))) opts.push({ id: 'wedgeBoon', label: '最後に掴んだ強化に楔を打つ' });
    if (m.wedges.length) opts.push({ id: 'pull', label: '楔を抜く' });
    opts.push({ id: 'journal', label: '記録帳' });
    return opts;
  }
  updateRewind(input) {
    const r = this.rewind;
    r.t += DT * (r.fast ? 2.5 : 1);
    if (this.modal) { this.updateModal(input); return; }
    const ready = r.t > 3.2;
    if (!ready) { if (input.pressed('confirm') || input.pressed('attack') || input.pressed('jump')) r.t = 3.2; return; }
    if (r.mode === 'view') {
      const opts = this.rewindOptions();
      r.sel = clamp(r.sel, 0, opts.length - 1);
      if (input.pressed('up')) { r.sel = (r.sel + opts.length - 1) % opts.length; this.sfx.play('select'); }
      if (input.pressed('down')) { r.sel = (r.sel + 1) % opts.length; this.sfx.play('select'); }
      if (input.pressed('confirm') || input.pressed('jump')) {
        const o = opts[r.sel];
        this.sfx.play('confirm');
        if (o.id === 'next') this.startLoop();
        else if (o.id === 'wedgeBoon') { r.mode = 'wedgeBoon'; r.sub = 0; }
        else if (o.id === 'pull') { r.mode = 'pull'; r.sub = 0; }
        else if (o.id === 'journal') this.openJournal();
      }
    } else {
      const list = r.mode === 'pull' ? this.meta.wedges : this.wedgeableBoons();
      if (!list.length) { r.mode = 'view'; return; }
      r.sub = clamp(r.sub, 0, list.length - 1);
      if (input.pressed('up')) { r.sub = (r.sub + list.length - 1) % list.length; this.sfx.play('select'); }
      if (input.pressed('down')) { r.sub = (r.sub + 1) % list.length; this.sfx.play('select'); }
      if (input.pressed('back') || input.pressed('dodge')) { r.mode = 'view'; this.sfx.play('select'); return; }
      if (input.pressed('confirm') || input.pressed('jump')) {
        if (r.mode === 'pull') {
          const w = removeWedge(this.meta, r.sub);
          this.sfx.play('door');
          r.report.changed.push({ text: `楔を抜いた：${wedgeLabel(w)}`, tone: 'reset' });
        } else {
          const b = list[r.sub];
          if (addWedge(this.meta, { target: 'boon', boon: { id: b.id, tier: b.tier } })) {
            this.sfx.play('wedge');
            r.report.changed.push({ text: `楔を打った：強化「${BOONS[b.id].name}${b.tier > 1 ? ' II' : ''}」を持ったまま夜が始まる`, tone: 'gold' });
          }
        }
        this.save();
        r.mode = 'view';
      }
    }
  }
  wedgeableBoons() {
    const m = this.meta;
    const wedgedIds = new Set(m.wedges.filter((w) => w.target === 'boon').map((w) => w.boon.id));
    return ((m.lastLoop && m.lastLoop.boons) || []).filter((b) => !wedgedIds.has(b.id));
  }

  // ───────── タイトル ─────────
  titleOptions() {
    const o = [];
    if (this.meta) o.push({ id: 'continue', label: `続きから（第 ${this.meta.loop} 夜）` });
    o.push({ id: 'new', label: this.meta ? 'はじめから（記録を消す）' : 'はじめる' });
    o.push({ id: 'shake', label: `画面揺れ：${this.settings.shake ? 'あり' : 'なし'}` });
    return o;
  }
  updateTitle(input) {
    const opts = this.titleOptions();
    if (this.titleConfirm) {
      if (input.pressed('confirm') || input.pressed('jump')) { this.titleConfirm = false; this.sfx.play('confirm'); this.newGame(); }
      else if (input.pressed('back') || input.pressed('dodge')) { this.titleConfirm = false; this.sfx.play('select'); }
      return;
    }
    if (input.pressed('up')) { this.titleSel = (this.titleSel + opts.length - 1) % opts.length; this.sfx.play('select'); }
    if (input.pressed('down')) { this.titleSel = (this.titleSel + 1) % opts.length; this.sfx.play('select'); }
    this.titleSel = clamp(this.titleSel, 0, opts.length - 1);
    if (input.pressed('confirm') || input.pressed('jump')) {
      const o = opts[this.titleSel];
      this.sfx.play('confirm');
      if (o.id === 'continue') this.continueGame();
      else if (o.id === 'new') { if (this.meta) this.titleConfirm = true; else this.newGame(); }
      else if (o.id === 'shake') this.settings.shake = !this.settings.shake;
    }
  }

  // ───────── タップ（スマホ）：項目を直接選ぶ。true を返すと「決定」を1回押したことになる ─────────
  handleTap(x, y) {
    const row = (y0, step, n, h = 24) => { for (let i = 0; i < n; i++) if (Math.abs(y - (y0 + i * step - 5)) < h / 2) return i; return -1; };
    if (this.scene === 'title') {
      if (this.titleConfirm) return y > 390 && y < 470;
      const i = row(410, 28, this.titleOptions().length, 26);
      if (i < 0 || Math.abs(x - VIEW_W / 2) > 200) return false;
      this.titleSel = i; return true;
    }
    if (this.scene === 'ending') return true;
    if (this.scene === 'rewind') {
      const r = this.rewind;
      if (this.modal && this.modal.type === 'journal') return this.tapJournal(x, y);
      if (r.t < 3.2) return true;
      const by = r.report.tip ? 396 : 380;
      if (r.mode === 'view') { const i = row(by, 26, this.rewindOptions().length); if (i < 0) return false; r.sel = i; return true; }
      const n = r.mode === 'pull' ? this.meta.wedges.length : this.wedgeableBoons().length;
      const i = row(by + 22, 22, n, 22); if (i < 0) return false; r.sub = i; return true;
    }
    const m = this.modal;
    if (!m) return false;
    switch (m.type) {
      case 'dialog': {
        const last = m.idx >= m.lines.length - 1;
        if (last && m.choices) { const n = m.choices.length; const i = row(472 - n * 22, 22, n, 22); if (i < 0) return false; m.sel = i; return true; }
        if (m.t < 0.12) return false;
        this.sfx.play('select');
        if (last) this.modal = null; else { m.idx++; m.t = 0; }
        return false;
      }
      case 'boon': {
        if (m.t < 0.25) return false;
        const cw = 250, gap = 22, total = m.offer.length * cw + (m.offer.length - 1) * gap;
        for (let i = 0; i < m.offer.length; i++) {
          const cx0 = VIEW_W / 2 - total / 2 + i * (cw + gap);
          if (x >= cx0 && x <= cx0 + cw && y >= 130 && y <= 380) {
            if (m.sel === i) return true; // 2回目のタップで決定
            m.sel = i; this.sfx.play('select'); return false;
          }
        }
        return false;
      }
      case 'pause': { const i = row(214, 32, this.pauseOptions().length, 28); if (i < 0) return false; m.sel = i; return true; }
      case 'forge': { const i = row(182, 30, m.list.length, 26); if (i < 0) return false; m.sel = i; return true; }
      case 'journal': return this.tapJournal(x, y);
      case 'code': {
        // 数字の上半分で＋、下半分で−
        for (let i = 0; i < 3; i++) {
          const dx = VIEW_W / 2 - 80 + i * 80;
          if (Math.abs(x - dx) < 34 && y > 200 && y < 300) {
            m.pos = i;
            m.digits[i] = y < 251 ? m.digits[i] % 9 + 1 : (m.digits[i] + 7) % 9 + 1;
            this.sfx.play('tick'); return false;
          }
        }
        return y > 300 && y < 370; // 下の帯をタップで決定
      }
    }
    return false;
  }
  tapJournal(x, y) {
    const m = this.modal;
    for (let i = 0; i < 4; i++) { const tx = 114 + i * 90; if (x >= tx && x <= tx + 80 && y >= 112 && y <= 136) { m.tab = i; this.sfx.play('select'); return false; } }
    if (y > 480 || x < 90 || x > VIEW_W - 90 || y < 50) { this.modal = m.prev && m.prev.type === 'pause' ? m.prev : null; }
    return false;
  }

  // ───────── モーダル ─────────
  openDialog(lines, choices = null) {
    this.modal = { type: 'dialog', lines, idx: 0, choices, sel: 0, t: 0 };
    this.player.vx = 0;
  }
  openBoonPick(count, school) {
    const p = this.player;
    let offer;
    if (school) {
      const ids = Object.keys(BOONS).filter((id) => BOONS[id].school === school && !p.boons.some((b) => b.id === id));
      offer = this.run.offerRng.shuffle(ids).slice(0, 3);
    } else offer = rollOffer(this.run.offerRng, p.boons, this.meta.unlocked, 3);
    if (!offer.length) { p.hp = Math.min(p.maxHp, p.hp + 30); this.openDoors(); return; }
    this.modal = { type: 'boon', offer, sel: 1 % offer.length, count, school, t: 0 };
    this.sfx.play('pickup');
  }
  openForge() {
    const tier1 = this.player.boons.filter((b) => b.tier < 2 && BOONS[b.id].school !== 'risk');
    if (!tier1.length) { this.openDialog([{ who: 'グレン', text: '鍛えるもんが無ぇじゃねえか。強化を手に入れてから来な。' }]); return; }
    this.modal = { type: 'forge', list: tier1, sel: 0, t: 0 };
  }
  openCode() {
    this.modal = { type: 'code', digits: [1, 1, 1], pos: 0, t: 0, wrong: 0 };
  }
  openPause() { this.modal = { type: 'pause', sel: 0, t: 0 }; }
  openJournal() { this.modal = { type: 'journal', tab: 0, t: 0, prev: this.modal }; }

  updateModal(input) {
    const m = this.modal;
    m.t += DT;
    const ok = input.pressed('confirm') || input.pressed('jump') || input.pressed('attack');
    const back = input.pressed('back') || input.pressed('dodge');
    switch (m.type) {
      case 'dialog': {
        if (m.t < 0.12) return;
        const last = m.idx >= m.lines.length - 1;
        if (last && m.choices) {
          if (input.pressed('up')) { m.sel = (m.sel + m.choices.length - 1) % m.choices.length; this.sfx.play('select'); }
          if (input.pressed('down')) { m.sel = (m.sel + 1) % m.choices.length; this.sfx.play('select'); }
          if (input.pressed('confirm') || input.pressed('jump')) {
            const c = m.choices[m.sel];
            this.modal = null; this.sfx.play('confirm');
            input.consume('attack'); input.consume('jump');
            c.fn();
          }
          return;
        }
        if (ok) {
          this.sfx.play('select');
          if (last) { this.modal = null; input.consume('attack'); input.consume('jump'); }
          else { m.idx++; m.t = 0; }
        }
        break;
      }
      case 'boon': {
        if (m.t < 0.25) return; // 誤選択防止
        if (input.pressed('left')) { m.sel = (m.sel + m.offer.length - 1) % m.offer.length; this.sfx.play('select'); }
        if (input.pressed('right')) { m.sel = (m.sel + 1) % m.offer.length; this.sfx.play('select'); }
        if (input.pressed('confirm') || input.pressed('jump')) {
          const id = m.offer[m.sel];
          this.player.setBoons([...this.player.boons, { id, tier: 1 }]);
          this.sfx.play('pickup');
          this.fx.ring(cx(this.player), cy(this.player), BOON_COLORS[BOONS[id].school], 50, 0.4);
          this.fx.setBanner(BOONS[id].name, BOONS[id].desc(1), BOON_COLORS[BOONS[id].school], 1.4);
          this.emit('boon', { id });
          input.consume('jump'); input.consume('attack');
          if (m.count > 1) { this.modal = null; this.openBoonPick(m.count - 1, m.school); }
          else { this.modal = null; this.openDoors(); }
        }
        break;
      }
      case 'forge': {
        if (input.pressed('up')) { m.sel = (m.sel + m.list.length - 1) % m.list.length; this.sfx.play('select'); }
        if (input.pressed('down')) { m.sel = (m.sel + 1) % m.list.length; this.sfx.play('select'); }
        if (back) { this.modal = null; return; }
        if (ok && m.t > 0.15) {
          const b = m.list[m.sel];
          const boons = this.player.boons.map((x) => (x.id === b.id ? { ...x, tier: 2 } : x));
          this.player.setBoons(boons);
          this.run.forged = true;
          this.modal = null;
          this.sfx.play('wedge');
          this.fx.setBanner(`${BOONS[b.id].name} II`, BOONS[b.id].desc(2), '#f2c14e', 1.6);
          input.consume('attack'); input.consume('jump');
        }
        break;
      }
      case 'code': {
        if (input.pressed('left')) { m.pos = (m.pos + 2) % 3; this.sfx.play('select'); }
        if (input.pressed('right')) { m.pos = (m.pos + 1) % 3; this.sfx.play('select'); }
        if (input.pressed('up')) { m.digits[m.pos] = m.digits[m.pos] % 9 + 1; this.sfx.play('tick'); }
        if (input.pressed('down')) { m.digits[m.pos] = (m.digits[m.pos] + 7) % 9 + 1; this.sfx.play('tick'); }
        if (back) { this.modal = null; return; }
        if ((input.pressed('confirm') || input.pressed('jump')) && m.t > 0.15) {
          if (m.digits.join('') === this.meta.code.join('')) {
            this.modal = null;
            this.run.vaultOpen = true;
            this.meta.flags.archiveOpened = true; this.save();
            this.sfx.play('wedge');
            this.fx.setBanner('書庫の扉が開いた', '', '#f2c14e', 1.4);
            this.emit('vaultOpen');
          } else { m.wrong = 0.4; this.sfx.play('deny'); }
        }
        if (m.wrong > 0) m.wrong -= DT;
        break;
      }
      case 'pause': {
        const opts = this.pauseOptions();
        if (input.pressed('up')) { m.sel = (m.sel + opts.length - 1) % opts.length; this.sfx.play('select'); }
        if (input.pressed('down')) { m.sel = (m.sel + 1) % opts.length; this.sfx.play('select'); }
        if (input.pressed('pause') || input.pressed('back')) { this.modal = null; return; }
        if (input.pressed('confirm') || input.pressed('jump')) {
          const o = opts[m.sel];
          if (o.id === 'resume') this.modal = null;
          else if (o.id === 'journal') this.openJournal();
          else if (o.id === 'shake') this.settings.shake = !this.settings.shake;
          else if (o.id === 'vol') { this.settings.volume = (Math.round(this.settings.volume * 10) + 2) % 12 / 10; this.sfx.setVolume(this.settings.volume); }
          else if (o.id === 'giveup') { this.modal = null; this.player.hp = 0; this.player.state = 'dead'; this.run.deathT = 1.6; this.endRun('death'); }
          input.consume('jump'); input.consume('attack');
        }
        break;
      }
      case 'journal': {
        if (input.pressed('left')) { m.tab = (m.tab + 3) % 4; this.sfx.play('select'); }
        if (input.pressed('right')) { m.tab = (m.tab + 1) % 4; this.sfx.play('select'); }
        if (m.t > 0.03 && (back || input.pressed('journal') || input.pressed('pause') || input.pressed('confirm'))) {
          this.modal = m.prev && m.prev.type === 'pause' ? m.prev : null;
          input.consume('pause');
        }
        break;
      }
    }
  }
  pauseOptions() {
    return [
      { id: 'resume', label: '再開' },
      { id: 'journal', label: '記録帳' },
      { id: 'shake', label: `画面揺れ：${this.settings.shake ? 'あり' : 'なし'}` },
      { id: 'vol', label: `音量：${Math.round(this.settings.volume * 10)}` },
      { id: 'giveup', label: 'この夜をあきらめる（巻き戻る）' },
    ];
  }

  onKnightDown(e) {
    this.addItem({ kind: 'wreck', x: e.x - 6, y: e.y + e.h - 24, w: 42, h: 24, causal: true, wedged: false, life: 12 });
    this.fx.setBanner('歯車騎士を倒した', '残骸に楔を打てる（約12秒）', '#f2c14e', 2.0);
  }
}

export const BOON_COLORS = { haste: '#5fd18b', stasis: '#5aa9e6', echo: '#b67cf0', risk: '#e35d5d' };

export const ENDING_PAGES = [
  ['刻守は剣を下ろした。', '鐘楼の窓の外が、白みはじめている。'],
  ['「リラは覚えている、か」', '「ならば、あの子の朝を奪っていたのは、私の方だったのだな」'],
  ['鐘は鳴らなかった。', '夜は戻らず、塔に、はじめての朝が来た。'],
  ['市場で、少女が空を見上げている。', '――おはよう、お父さん。'],
  ['夜明けの楔', '遊んでくれてありがとう。'],
];
