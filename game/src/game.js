// ゲーム本体。シミュレーションのみで DOM に触れない（テストからも動かせる）。
import { DT, TILE, VIEW_W, VIEW_H, ZOOM, PLAYER as PC } from './config.js';
import { overlap, cx, cy, clamp, lerp, makeRng, sign } from './util.js';
import { TileMap } from './tilemap.js';
import { Player } from './player.js';
import { makeEnemy, RustSoldier, GearKnight, Warden } from './enemies.js';
import { Tokimori, updateHoming } from './boss.js';
import { castArt, updateSpells, updatePassives, PROCS, ACTIVE_ARTS, spawnWave, Spell, MELEE } from './arts.js';
import { ARTIFACTS, rollArtifacts } from './artifacts.js';
import { Fx } from './fx.js';
import { NullSfx } from './audio.js';
import { BOONS, rollOffer, rollRare, boonMax, PASSIVE_IDS, passiveWeight, readyFusions, countsForThreat } from './boons.js';
import { expToNext, expFor, levelBonus, LEVEL } from './level.js';
import { rewindGrid, lbRowAt } from './layout.js';
import { LAYOUTS, FLOOR_NAMES, buildPlan, layoutRows, extraEnemyTypes } from './world.js';
import {
  newMeta, serialize, deserialize, endLoop, learn, knows, hasWedge, addWedge, removeWedge, freeSlots,
  bossCounter, trueEndReady, GLEN_DEADLINE, KNOWLEDGE, COUNTERS, MAX_SLOTS, fmtClock, wedgeLabel,
  upLv, enemyScale, UPGRADES, buyUpgrade, inheritCount, habitAnalysis, dawnProgress, MOB_COUNTERS,
} from './meta.js';

const BUFFERED = ['attack', 'jump', 'dodge', 'skill'];
// 脅威 1 段あたりの上がり幅（常時の術 3 つごとに 1 段）
export const THREAT = { free: 3, per: 3, hp: 0.7, dmg: 0.15, bossHp: 0.55, extraCap: 4 }; // 最初の 3 つ（Lv の合計）は数えない
const REWARD_LABEL = { boon: '強化', boon2: '強化×2', heal: '回復', hourglass: '砂時計', gold: '金貨', artifact: 'アーティファクト' };
// 敵ごとの金貨（夜が深いほど多い）
const GOLD = { soldier: 6, bat: 5, turret: 4, roller: 7, archer: 6, phantom: 8, bell: 9, knight: 50 };

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
    // 継承した強化（楔の強化と重なる場合は Lv の高い方）
    for (const b of meta.inherit || []) {
      const w = wedgedBoons.find((x) => x.id === b.id);
      if (w) w.tier = Math.max(w.tier, b.tier); else wedgedBoons.push({ ...b });
    }
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
      shards: 0,
      killStacks: 0,
      maxCombo: 0,
      critRng: makeRng(plan.offerSeed ^ 0xc817),
      rareRng: makeRng(plan.offerSeed ^ 0x7a2e),
      level: 1, exp: 0, pendingRare: 0, phoenixUsed: false,
      gold: 0, keys: 0, shops: {}, firstDoorDone: false, aegisUsed: false,
      mobCounter: bossCounter(meta.lastLoop), // 雑魚・中ボスも前の夜の戦い方を覚えている
      scale: enemyScale(meta),
    };
    // 発動する術は 1 つだけ（楔と継承で重なったら Lv の高い方）
    const actives = wedgedBoons.filter((b) => BOONS[b.id].active).sort((a, b) => b.tier - a.tier);
    for (const extra of actives.slice(1)) wedgedBoons.splice(wedgedBoons.indexOf(extra), 1);
    this.player = new Player(0, 0);
    this.player.baseMaxHp = PC.maxHp + 30 * upLv(meta, 'hp');
    this.player.metaAtk = 1 + 0.1 * upLv(meta, 'atk');
    this.player.setBoons(wedgedBoons);
    this.player.hp = this.player.maxHp;
    this.player.gauge = Math.min(PC.gaugeMax, 20 * upLv(meta, 'gauge'));
    this.combo = { n: 0, t: 0, max: 0, pop: 0 };
    this.scene = 'play';
    this.modal = null;
    this.fx.clear();
    this.timeStopT = 0; this.slowT = 0; this.hitstop = 0;
    this.enterRoom(0, 0);
    const pr = dawnProgress(meta);
    this.fx.setBanner(`第 ${meta.loop} 夜`, pr.next ? `夜明けへの道 ${pr.done}/${pr.total}　次：${pr.next.title}` : `終わらない夜　深さLv${this.run.scale.level}`, '#f2c14e', 2.6);
    if (meta.loop === 1 && !meta.flags.ending) this.openDialog([
      { who: '', text: 'あなたは時計塔の主「刻守」の弟子。この町は、同じ夜を繰り返している。' },
      { who: '', text: '夜の終わりに師が鐘を鳴らすと、時は夜のはじめに戻る。それを覚えていられるのは、師から「時の楔」を習ったあなただけ。' },
      { who: '', text: '時戻しの鐘は禁忌の技。鳴らすたびに、鳴らした者の命を一夜ぶん削る。このままでは、師は朝を待たずに尽きてしまう。' },
      { who: '', text: '目的は「夜明けを迎える」こと。師を倒して鐘を止めても、夜は戻る。師が命を削ってまで夜を止める理由を探そう。', note: '進み具合は 記録帳（Tab）の「夜明け」で確認できる' },
      { who: '', text: '攻撃を当てると秒針ゲージがたまる。V（術ボタン）でゲージを消費して、装着した術を放つ。術がまだなければ「時歪」――周りの時を遅くする。', note: '術は強化の「術」系統で手に入る' },
      { who: '', text: '倒れても、知ったことと、楔を打ったものは次の夜に残る。' },
    ]);
    this.save();
    this.emit('loopStart', { loop: meta.loop });
  }

  emit(type, data = {}) { this.log.push({ type, t: this.run ? this.run.clock : 0, ...data }); if (this.log.length > 500) this.log.shift(); }

  roomDesc(fi = this.run.fi, ri = this.run.ri) { return this.run.plan.floors[fi] && this.run.plan.floors[fi][ri]; }

  // override：計画にない特別な部屋（黄金の部屋）。fi/ri はそのままなので、出口は元の次の部屋へ続く
  enterRoom(fi, ri, override = null) {
    const run = this.run;
    const prevFloor = run.fi;
    run.fi = fi; run.ri = ri;
    const desc = override || this.roomDesc();
    if (this.room) this.flushPickups(); // 拾い残しは部屋を出るときに受け取る
    this.map = new TileMap(layoutRows(desc));
    this.room = { desc, cleared: false, rewardSpawned: false, enemies: [], projectiles: [], echoes: [], items: [], spells: [], pickups: [], t: 0, boss: null, glenHp: 0 };
    this.player.vx = 0; this.player.vy = 0; this.player.state = 'normal'; this.player.atk = null;
    const spawn = this.map.markers.find((m) => m.c === 'P') || { x: TILE * 2, y: this.map.pxH - TILE * 4 };
    this.player.x = spawn.x + (TILE - this.player.w) / 2;
    this.player.y = spawn.y + TILE - this.player.h;
    this.player.face = 1;
    this.player.lastSafe = { x: this.player.x, y: this.player.y };
    this.updateCamera(DT, true);
    if (fi !== prevFloor) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 45);
      this.fx.setBanner(FLOOR_NAMES[fi], `夜 ${fmtClock(run.clock)}`, '#efe6d2', 1.8);
    }
    const setup = {
      entry: () => this.setupEntry(),
      combat: () => { for (const e of desc.enemies) this.addEnemy(makeEnemy(e.type, e.x * TILE, e.y * TILE)); this.spawnThreatExtras(desc); },
      forge: () => this.setupForge(),
      elite: () => this.setupElite(),
      archive: () => this.setupArchive(),
      study: () => this.setupStudy(),
      boss: () => this.setupBoss(),
      shop: () => this.setupShop(),
      shrine: () => this.setupShrine(),
      elite2: () => this.setupWarden(),
      trial: () => { room0.wave = 0; for (const e of desc.waves[0]) this.addEnemy(makeEnemy(e.type, e.x * TILE, e.y * TILE)); this.fx.setBanner('試練の間', '2 波を退けると、アーティファクトと金貨', '#ff9a7a', 1.8); },
      golden: () => this.setupGolden(),
    }[desc.type];
    const room0 = this.room;
    setup();
    // 番人たちの対策を、その夜の最初の戦いで知らせる
    if (this.run.mobCounter && !this.run.counterShown && this.room.enemies.some((e) => e.counter)) {
      this.run.counterShown = true;
      this.fx.setBanner('番人たちも学んだ', `あなたの${COUNTERS[this.run.mobCounter].habit}：${MOB_COUNTERS[this.run.mobCounter]}`, '#ff7a5a', 2.4);
    }
    // 鐘の欠片：敵のいる部屋に入ると衝撃
    if (this.player.stats.bellshard && this.room.enemies.some((e) => !e.boss)) this.room.spells.push(new Spell('toll', cx(this.player), cy(this.player), { r: 0, maxR: 220, dmg: 40 }));
    for (const m of this.map.markers) if (m.c === 'Q' && this.meta.loop <= 2) this.addSign(m);
    // 敵のいない部屋はすぐに出口が開く
    if (!this.room.enemies.length && desc.type !== 'boss' && desc.type !== 'forge') this.clearRoom(true);
    this.emit('enterRoom', { fi, ri, type: desc.type, layout: desc.layout });
  }

  // 脅威：常時の術や剣の道を 3 つ積むごとに 1 段。敵の HP と攻撃が上がり、弓兵以外の敵が増える
  threatStep() {
    const n = this.player.boons.filter((b) => countsForThreat(b.id)).reduce((a, b) => a + passiveWeight(b), 0);
    return Math.floor(Math.max(0, n - THREAT.free) / THREAT.per);
  }
  // 脅威で敵の動きも速くなる（積み上がる術の速さに追いつくように）。回避への対策をした雑魚はさらに速い
  enemyHaste(e) {
    const s = this.threatStep();
    const h = e.boss ? Math.min(1.25, 1 + 0.03 * s) : Math.min(1.4, 1 + 0.05 * s);
    return h * (e.counter === 'dodge' && !e.boss ? 1.15 : 1);
  }
  // 中ボス・刻守は、術で一度に削れる量に上限がある（1 秒あたり最大HPの数%。超えた分はごくわずかしか通らない）
  spellGuard(e, dmg) {
    const now = this.run.clock;
    let cap = e.maxHp * (e.boss ? 0.03 : 0.09);
    if (e.counter === 'skill') cap *= 0.5;
    const g = (e.sg ||= { b: cap, t: now });
    g.b = Math.min(cap * 1.5, g.b + (now - g.t) * cap); g.t = now;
    if (g.b >= dmg) { g.b -= dmg; return dmg; }
    const ok = Math.max(0, g.b); g.b = 0;
    if (!e.sgText || now - e.sgText > 0.8) { e.sgText = now; this.fx.text(cx(e), e.y - 22, '術の守り', '#9fd0ff', 12); }
    return ok + Math.min((dmg - ok) * 0.03, e.maxHp * (e.boss ? 0.001 : 0.002)); // 上限を超えた分はごくわずか
  }
  threatHp() { return 1 + THREAT.hp * this.threatStep(); }
  enemyDmgMul() { return this.run.scale.dmg * (1 + THREAT.dmg * this.threatStep()); }
  spawnThreatExtras(desc) {
    const n = Math.min(THREAT.extraCap, this.threatStep());
    if (!n) return;
    const rng = makeRng((this.run.plan.offerSeed ^ (this.run.fi * 97 + this.run.ri * 13)) >>> 0);
    const types = extraEnemyTypes(this.run.fi, this.run.scale.level);
    const P = this.marker('P');
    const used = new Set(desc.enemies.map((e) => e.x + ',' + e.y));
    const slots = this.map.markers.filter((m) => (m.c === 'g' || m.c === 'a') && Math.abs(m.tx - P.tx) > 5);
    const free = rng.shuffle(slots.filter((m) => !used.has(m.tx + ',' + m.ty)));
    const pool = free.length ? free : rng.shuffle(slots);
    for (let i = 0; i < n && pool.length; i++) {
      const m = pool[i % pool.length];
      const e = this.addEnemy(makeEnemy(rng.pick(types[m.c]), m.x + (i >= pool.length ? 20 : 0), m.y));
      if (e) e.extra = true;
    }
  }
  addEnemy(e) {
    if (!e) return;
    // 夜の深さで強くなる（HP・攻撃・攻撃パターンの段階）＋脅威
    const sc = this.run.scale;
    e.maxHp = e.hp = Math.round(e.maxHp * sc.hp * (e.boss ? 1 + THREAT.bossHp * this.threatStep() : this.threatHp()));
    e.tier = sc.tier;
    if (!e.boss && this.run.mobCounter) e.counter = this.run.mobCounter;
    this.room.enemies.push(e);
    const tellKey = { warden: 'tell_warden', soldier: 'tell_soldier', bat: 'tell_bat', turret: 'tell_turret', knight: 'tell_knight', boss: 'tell_boss', roller: 'tell_roller', archer: 'tell_archer', phantom: 'tell_phantom', bell: 'tell_bell' }[e.kind];
    if (tellKey) e.tellKey = tellKey;
    return e;
  }
  spawnProjectile(p) { p.dmg = Math.round(p.dmg * this.enemyDmgMul()); this.room.projectiles.push(p); }
  marker(c) { return this.map.markers.find((m) => m.c === c); }
  addItem(it) { this.room.items.push({ w: 24, h: 40, ...it }); return it; }
  addSign(m) {
    const texts = this.touch ? [
      '左のスティックで移動。右のボタンで 跳ぶ・攻撃（長押しで重撃）・回避。上下＋攻撃で上攻撃・下攻撃',
      '術ボタン：攻撃でたまる秒針ゲージを消費して、装着した術を放つ（術がなければ時歪＝周りを遅くする）。光る印の前で「調べる」',
    ] : [
      '←→ 移動　Z ジャンプ（空中でもう一度）　X 攻撃（長押しで重撃、↑↓＋Xで上・下攻撃）　C 回避',
      'V 術：攻撃でたまる秒針ゲージを消費して、装着した術を放つ（術がなければ時歪＝周りを遅くする）　↑/E 調べる　Tab 記録帳',
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
    if (this.meta.flags.bossBeaten) lines.push({ who: '刻守（師）', text: 'また来たか、弟子よ。この命が尽きるまで、鐘は鳴らす。朝は来させん。' });
    else lines.push({ who: '刻守（師）', text: '弟子よ、時戻しは禁忌だ。代償は私の命で払っている。お前が背負うものではない……下がっていろ。' });
    if (counter) lines.push({ who: '刻守（師）', text: `前の夜、お前は${COUNTERS[counter].habit}に頼りすぎた。もう通じんぞ。` });
    if (hasWedge(this.meta, 'brake')) lines.push({ who: '刻守（師）', text: '歯止めに楔を……！ 私の教えた技で、私を止めるか。ならば力で応えよう！', note: '時止め封印／第2段階が早まり、技が速くなる' });
    // 前の夜の戦い方の分析を先に見せる
    if (counter) this.modal = { type: 'analysis', a: habitAnalysis(this.meta.lastLoop), counter, next: lines, t: 0 };
    else this.openDialog(lines);
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
    if (this.run.pendingRare > 0 && this.player.state === 'normal') { this.openRarePick(); return; }
    // 合成できる組み合わせがあれば知らせる（「今はしない」を選んだものは、次に強化を得るまで聞かない）
    if (this.player.state === 'normal' && !this.transition) {
      const f = readyFusions(this.player.boons).find((x) => !(this.run.fusionDeclined || []).includes(x.to));
      if (f) { this.modal = { type: 'fusion', recipe: f, sel: 0, t: 0 }; this.sfx.play('charged'); return; }
    }
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
    if (this.combo.n > 0 && !this.player.stats.eternal) { this.combo.t -= dt; if (this.combo.t <= 0) this.combo.n = 0; }
    if (p.stats.regen && p.state !== 'dead') p.hp = Math.min(p.maxHp, p.hp + p.maxHp * p.stats.regen * dt);
    if (this.combo.pop > 0) this.combo.pop = Math.max(0, this.combo.pop - dt * 6);
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
      const edt = (this.timeStopT > 0 && !e.boss ? dt * 0.3 : dt) * this.enemyHaste(e);
      if (e.alive) e.update(this, edt);
    }
    this.resolveEnemyAttacks();
    for (const pr of room.projectiles) { updateHoming(pr, this); pr.update(this, this.timeStopT > 0 && !pr.homing ? dt * 0.3 : dt); }
    this.resolveProjectiles();
    updatePassives(this, dt);
    updateSpells(this, dt);
    if (p.onGround) p.airHits = 0;
    this.updateEchoes(dt);
    this.handleDeaths();
    this.updatePickups(dt);
    if (this.hudPop) { this.hudPop.gold = Math.max(0, this.hudPop.gold - dt * 4); this.hudPop.exp = Math.max(0, this.hudPop.exp - dt * 4); }
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
    // 刻守の撃破演出の間は、カメラが刻守の方へ寄る
    const b = this.room && this.room.boss && this.room.bossOutroT != null ? this.room.boss : null;
    const fx0 = b ? lerp(cx(p), cx(b), 0.75) : cx(p) + p.face * 40;
    const tx = clamp(fx0 - vw / 2, 0, Math.max(0, this.map.pxW - vw));
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
      const dir = a.def.spin || a.def.dir ? sign(cx(e) - cx(p)) || p.face : p.face;
      const info = { base: a.def.dmg, cat: a.def.cat, knock: a.def.knock * p.stats.rangeMul, dir, stop: a.def.stop, breaks: !!a.def.breaks, shake: a.def.shake || 0, heavy: a.name === 'heavy', parry: !!a.def.parry, lift: a.def.lift || 0 };
      this.dealDamage(e, info);
      // 残心：連撃の 3 段目以降の命中に、遅れて十字の追撃
      if (p.stats.zanshin && (a.name === 'combo3' || a.name === 'combo4')) MELEE.cross(this, e, p.stats.zanshin);
      // 双牙：もう一度当たる
      if (p.stats.twinfang && e.alive && this.run.critRng.next() < p.stats.twinfang) { this.dealDamage(e, { ...info, parry: false }); this.fx.text(cx(e), e.y - 46, '双牙', '#ffd84a', 12); }
      // 下突き：当たったら跳ね上がる（2段ジャンプと空中回避も回復）
      if (a.def.bounce && !p.onGround && !a.bounced) {
        a.bounced = true;
        p.vy = -a.def.bounce; p.airJumpsLeft = p.airJumpMax; p.airDodgeUsed = false;
        this.fx.ring(cx(p), p.y + p.h, '#9fe3ff', 26, 0.25);
        this.fx.sparks(cx(p), p.y + p.h, '#ffffff', 8, 240);
      }
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
    let dmg = info.base * st.dmgMul * st.edgeMul * (p.metaAtk || 1) * (1 + run.killStacks) * levelBonus(run.level || 1).atk;
    // コンボ加算：つないだ数だけ与ダメージが増える
    dmg *= 1 + this.combo.n * st.comboPer;
    if (info.heavy) dmg *= st.heavyMul;
    if (info.cat === 'air') dmg *= st.airMul;
    if (e.hp <= e.maxHp * 0.35) dmg *= st.executeMul;
    let crit = false;
    let cat = info.cat;
    const direct = !info.echo && !info.spell && !info.proj;
    // 断罪：重撃で弱った雑魚を断つ。中ボス以上には大きく効く
    if (info.heavy && st.judgement) {
      if (!e.boss && !e.elite && e.hp <= e.maxHp * 0.25) { dmg = Math.max(dmg, e.hp + 1); this.fx.text(cx(e), e.y - 40, '断罪', '#ff4a2a', 18); }
      else if ((e.boss || e.elite) && e.hp <= e.maxHp * 0.35) dmg *= 2;
    }
    if (!info.echo) {
      if (e.hp >= e.maxHp && st.openerMul > 1) dmg *= st.openerMul;
      if (p.onGround && Math.abs(p.vx) > 150 && st.momentumMul > 1) dmg *= st.momentumMul;
      // パリィ斬りは必ず会心
      if (info.parry || run.critRng.next() < st.critChance + 0.02 * upLv(this.meta, 'crit') + levelBonus(run.level || 1).crit) { crit = true; dmg *= st.critMul; }
      if (info.parry) this.fx.text(cx(e), e.y - 34, 'パリィ', '#ffe14a', 16);
      if (direct && p.afterT > 0 && st.afterimageMul > 1) { dmg *= st.afterimageMul; p.afterT = 0; this.fx.text(cx(e), e.y - 18, '残影', '#5fd18b', 12); }
      if (direct && p.empowerNext > 1) { dmg *= p.empowerNext; p.empowerNext = 1; this.fx.text(cx(e), e.y - 30, '×3', '#e35d5d', 14); }
      if (info.heavy && e.slowed && st.shatterMul > 1) {
        dmg *= st.shatterMul; info.breaks = true;
        this.fx.burst(cx(e), cy(e), '#5aa9e6', 22); this.fx.text(cx(e), e.y - 30, '粉砕', '#5aa9e6', 16);
      }
    }
    if (e.warp > 0) cat = 'skill';
    // 雑魚・中ボスの対策：前の夜にいちばん使った手段が効きにくい
    let countered = false;
    if (!e.boss && e.counter && (info.echo ? 'echo' : info.cat) === e.counter) { dmg *= e.elite ? 0.55 : 0.75; countered = true; }
    // 刻守は術そのものに強い。中ボス・刻守は術で削れる量に上限
    if (info.spell && e.boss) dmg *= 0.6;
    // 剣の道の飛ぶ斬撃は、中ボス・刻守には浅くしか入らない（本体の剣で斬るのが本命）
    if (info.proj && (e.boss || e.elite)) dmg *= e.boss ? 0.5 : 0.7;
    if (info.spell && (e.boss || e.elite)) dmg = this.spellGuard(e, dmg);
    dmg = Math.round(dmg);
    const res = e.takeHit(this, { dmg, dir: info.dir, knock: info.knock, breaks: info.breaks, echo: !!info.echo, cat: info.cat, lift: info.lift || 0, passive: !!info.passive || (!!info.proj && !!e.boss) });
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
    if (res.dmg != null) dmg = res.dmg;
    // 吸命の刃：直接攻撃で回復
    if (st.lifesteal && direct && !info.spell && p.state !== 'dead') p.hp = Math.min(p.maxHp, p.hp + Math.min(dmg * st.lifesteal, p.maxHp * 0.02));
    run.dmgByCat[info.echo ? 'echo' : cat] = (run.dmgByCat[info.echo ? 'echo' : cat] || 0) + dmg;
    this.addCombo();
    if (res.guardBreak) { this.sfx.play('guardBreak'); this.fx.text(cx(e), e.y - 30, '崩し', '#f2c14e', 16); this.fx.shake(5, 0.2); }
    const hx = info.dir > 0 ? e.x + 4 : e.x + e.w - 4;
    if (!info.echo) this.fx.impact(hx, cy(e), crit ? '#ffe14a' : info.heavy ? '#f2c14e' : info.spell ? '#9fe3ff' : '#ffffff', crit ? 10 : info.heavy ? 9 : 6);
    if (info.heavy || crit) for (let i = 0; i < 4; i++) this.fx.parts.push({ x: hx, y: cy(e), vx: (Math.random() - 0.5) * 300, vy: -100 - Math.random() * 200, life: 0.5, t: 0, color: '#c9a052', size: 3, g: 900 }); // 歯車の破片
    this.fx.sparks(hx, cy(e), info.echo ? '#b67cf0' : info.heavy ? '#f2c14e' : '#fff3d6', info.heavy ? 14 : 7, info.heavy ? 380 : 260, info.dir);
    const num = fmtNum(dmg) + (crit ? '!' : '');
    if (countered) res.resisted = true;
    if (res.resisted) { this.fx.text(cx(e) + 14, e.y - 22, '耐性', '#8a8a92', 11); this.fx.text(cx(e) + (Math.random() - 0.5) * 10, e.y - 6, num, '#8a8a92', 12); this.addCombo(); this.learnOnce(e); return res; }
    this.fx.text(cx(e) + (Math.random() - 0.5) * 10, e.y - 6, num, crit ? '#ffe14a' : info.echo ? '#c9a0ff' : info.heavy ? '#f2c14e' : '#ffffff', crit ? 20 : info.heavy ? 18 : 13);
    if (info.spell || info.proj) {
      this.sfx.play(crit ? 'heavyHit' : 'hit');
      this.hitstop = Math.max(this.hitstop, crit ? 2 / 60 : 1 / 60);
      this.fx.shake(crit ? 3 * 1.5 : 1.5, 0.06); // 会心はさらに 1.5 倍
    } else if (!info.echo) {
      this.hitstop = Math.max(this.hitstop, (info.stop || 3 / 60) + (crit ? 2 / 60 : 0));
      this.sfx.play(info.heavy || crit || (info.shake || 0) >= 3 ? 'heavyHit' : 'hit');
      // 命中で画面を小さく揺らす（重い一撃・会心ほど大きく）
      this.fx.shake(Math.max(info.shake || 0, crit ? 4 : info.heavy ? 5 : 2) * (crit ? 1.5 : 1), crit || info.heavy ? 0.14 : 0.07); // 会心はさらに 1.5 倍
      if (crit) this.fx.ring(cx(e), cy(e), '#ffe14a', 28, 0.2);
      p.gauge = Math.min(PC.gaugeMax, p.gauge + PC.gaugePerHit * st.gaugeMul);
      if (st.lagTime && !e.boss && !e.elite) e.lag = Math.max(e.lag, st.lagTime); // 中ボス・刻守には効かない
      // 乱舞：連撃が当たるほど速くなる
      if (st.frenzy && info.cat === 'combo') { p.frenzyN = Math.min(5, (p.frenzyN || 0) + 1); p.frenzyT = 3; }
      // 剣聖：会心の一撃で斬撃が飛ぶ
      if (crit && st.swordsaint && !(p.saintT > 0)) { p.saintT = 0.2; MELEE.saint(this, p, st.swordsaint); }
      // 発動条件つきの術
      if (info.heavy && st.procs.thunderbell && e.alive) PROCS.thunderbell(this, st.procs.thunderbell, e);
      if (info.cat === 'air' && st.procs.plunge && !p.onGround) { p.airHits = (p.airHits || 0) + 1; if (p.airHits >= 3 && !p.plunging) { p.airHits = 0; PROCS.plunge(this, st.procs.plunge); } }
      if (st.procs.lastlight && p.hp < p.maxHp * 0.3) PROCS.lastlight(this, st.procs.lastlight, e);
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
  addCombo() {
    const c = this.combo;
    c.n++; c.t = 2.2 + 0.4 * upLv(this.meta, 'combo'); c.pop = 1;
    c.max = Math.max(c.max, c.n);
    this.run.maxCombo = Math.max(this.run.maxCombo || 0, c.n);
    if (c.n % 10 === 0 && this.player.stats.procs.secondhand) PROCS.secondhand(this, this.player.stats.procs.secondhand);
    if (c.n % 25 === 0) { this.fx.setBanner(`${c.n} HIT`, `与ダメージ +${Math.round(c.n * this.player.stats.comboPer * 100)}%`, '#ff9a3c', 0.9); this.sfx.play('charged'); }
  }
  // ───────── 拾い物：経験値の粒（自動で主人公へ集まる）と金貨（触れて拾う） ─────────
  dropExp(n, x, y) {
    if (n <= 0) return;
    const rnd = this.fx.rand, k = Math.min(6, Math.max(2, Math.ceil(n / 6)));
    for (let i = 0; i < k; i++) {
      const v = Math.floor(n / k) + (i < n % k ? 1 : 0);
      if (v <= 0) continue;
      const a = rnd() * Math.PI * 2, s = 120 + rnd() * 140;
      this.room.pickups.push({ type: 'exp', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 90, v, t: 0 });
    }
    this.fx.text(x, y - 30, `+${n} EXP`, '#a8f07a', 10);
  }
  dropGold(n, x, y, burst = 1) {
    if (n <= 0) return;
    const rnd = this.fx.rand, k = Math.min(10, Math.max(1, Math.ceil(n / 4)));
    for (let i = 0; i < k; i++) {
      const v = Math.floor(n / k) + (i < n % k ? 1 : 0);
      if (v <= 0) continue;
      this.room.pickups.push({ type: 'coin', x: x + (rnd() - 0.5) * 8, y, vx: (rnd() - 0.5) * 220 * burst, vy: -200 - rnd() * 180, v, t: 0, phase: rnd() * 8 });
    }
  }
  collectPickup(k) {
    const p = this.player;
    k.got = true;
    this.hudPop ||= { gold: 0, exp: 0 };
    if (k.type === 'exp') {
      this.gainExp(k.v);
      this.hudPop.exp = 1;
      this.fx.sparks(cx(p), cy(p), '#c8ff9a', 3, 110);
      this.sfx.play('exp');
    } else {
      this.addGold(k.v);
      this.hudPop.gold = 1;
      this.fx.sparks(k.x, k.y, '#fff2a0', 5, 150);
      this.fx.text(k.x, k.y - 12, `+${k.v}`, '#ffd84a', 10);
      this.sfx.play('coin');
    }
  }
  updatePickups(dt) {
    const p = this.player, room = this.room, map = this.map;
    if (p.state === 'dead') return;
    const px = cx(p), py = cy(p);
    for (const k of room.pickups) {
      k.t += dt;
      const dx = px - k.x, dy = py - k.y, d = Math.hypot(dx, dy) || 1;
      const home = (sp, turn) => { k.vx += (dx / d * sp - k.vx) * Math.min(1, dt * turn); k.vy += (dy / d * sp - k.vy) * Math.min(1, dt * turn); k.x += k.vx * dt; k.y += k.vy * dt; };
      if (k.type === 'exp') {
        // 弾けて広がったあと、主人公へ吸い寄せられる
        if (k.t < 0.35) { k.vx *= 0.9; k.vy *= 0.9; k.x += k.vx * dt; k.y += k.vy * dt; }
        else home(320 + (k.t - 0.35) * 900, 10);
        if (k.t > 0.35 && d < 14) this.collectPickup(k);
        continue;
      }
      // 金貨：跳ねて床に落ちる。近づくと吸い寄せられる。部屋を制圧すると少しして集まってくる
      if (!k.magnet && ((k.t > 0.35 && d < 56) || (room.cleared && k.t > 1.2))) k.magnet = true;
      if (k.magnet) home(380 + k.t * 160, 12);
      else {
        k.vy = Math.min(k.vy + 1400 * dt, 700);
        const nx = k.x + k.vx * dt;
        if (map.solidAt(nx, k.y)) k.vx = -k.vx * 0.5; else k.x = nx;
        const gy = map.groundBelow(k.x, k.y - 4);
        k.y += k.vy * dt;
        if (gy >= map.pxH) { if (k.y > map.pxH - 10) k.magnet = true; } // 穴に落ちた金貨は主人公のもとへ
        else if (k.y >= gy - 3 && k.vy > 0) { k.y = gy - 3; k.vy = k.vy > 140 ? -k.vy * 0.45 : 0; k.vx *= 0.7; }
      }
      if (k.t > 0.25 && d < 18) this.collectPickup(k);
    }
    room.pickups = room.pickups.filter((k) => !k.got);
  }
  flushPickups() {
    for (const k of this.room.pickups || []) { if (k.type === 'exp') this.gainExp(k.v); else this.addGold(k.v); }
    this.room.pickups = [];
  }

  // ───────── 金貨・店・アーティファクト ─────────
  addGold(n, x, y) {
    if (n <= 0) return;
    this.run.gold += n;
    if (x != null) this.fx.text(x, y, `+${n}G`, '#ffd84a', 11);
    this.emit('gold', { n });
  }
  setupShrine() {
    const N = this.marker('N');
    this.addItem({ kind: 'shrine', x: N.x - 6, y: N.y + TILE - 44, w: 42, h: 44, used: false });
  }
  setupWarden() {
    const Z = this.marker('Z');
    this.addEnemy(new Warden(Z.x, Z.y + TILE));
    this.fx.setBanner('振り子の番人', '大技のあとに長い隙。そこへ重撃を', '#f2c14e', 1.8);
  }
  useShrine(it) {
    const p = this.player;
    if (it.used) return;
    const cost = Math.round(p.maxHp * 0.2);
    this.openDialog([{ who: '', text: '時の祠。古い文字が刻まれている――「時を欲する者は、命で払え」' }], [
      { label: `命を捧げる（HP -${cost}）：強化を 1 つ得る`, fn: () => { it.used = true; p.hp = Math.max(1, p.hp - cost); this.fx.text(cx(p), p.y - 20, `-${cost}`, '#ff5a3c', 16); this.fx.burst(cx(it), cy(it), '#e35d5d', 20); this.sfx.play('hurt'); this.openBoonPick(1, null, true); } },
      { label: '祈る：HP を最大の 25% 回復', fn: () => { it.used = true; const a = Math.round(p.maxHp * 0.25 * p.stats.healMul); p.hp = Math.min(p.maxHp, p.hp + a); this.fx.text(cx(p), p.y - 20, `+${a}`, '#5fd18b', 16); this.fx.ring(cx(p), cy(p), '#5fd18b', 40); this.sfx.play('heal'); } },
      { label: '立ち去る', fn: () => {} },
    ]);
  }
  setupShop() {
    const V = this.marker('V');
    this.addItem({ kind: 'merchant', x: V.x - 20, y: V.y + TILE - 46, w: 70, h: 46 });
    // 敵のいない部屋なので、出口は enterRoom の最後で開く
  }
  setupGolden() {
    const J = this.marker('J');
    this.addItem({ kind: 'goldchest', x: J.x - 4, y: J.y + TILE - 26, w: 38, h: 26, opened: false });
    this.fx.setBanner('黄金の部屋', '宝箱から、強いアーティファクトを 1 つ選べる', '#ffd84a', 1.8);
  }
  // 店の品ぞろえ（その店に最初に入ったときに決まる）
  shopStock() {
    const run = this.run, key = run.fi;
    if (run.shops[key]) return run.shops[key];
    const rng = makeRng((run.plan.offerSeed ^ (0x5b0b + key * 131)) >>> 0);
    const k = 1 + 0.25 * run.scale.level, f = run.fi;
    const price = (n) => Math.round(n * k);
    const stock = [];
    for (const id of rollOffer(rng, this.player.boons, this.meta.unlocked, 2)) stock.push({ kind: 'boon', id, price: price(60 + 20 * f) });
    stock.push({ kind: 'potion', size: 0.3, price: price(25) });
    stock.push({ kind: 'potion', size: 0.7, price: price(50) });
    const art = rollArtifacts(rng, this.player.artifacts, 'normal', 1)[0];
    if (art) stock.push({ kind: 'artifact', id: art, price: price(110 + 30 * f) });
    stock.push({ kind: 'key', price: price(130 + 20 * f) });
    run.shops[key] = stock;
    return stock;
  }
  shopLabel(s) {
    if (s.kind === 'boon') { const d = BOONS[s.id], own = this.player.boons.find((b) => b.id === s.id); return { name: `強化：${d.name}` + (own && d.max ? ` Lv${own.tier}→${own.tier + 1}` : ''), desc: d.desc(own ? own.tier + 1 : 1) }; }
    if (s.kind === 'potion') return { name: s.size > 0.5 ? '大きな回復薬' : '小さな回復薬', desc: `HP を最大HPの ${Math.round(s.size * 100)}% 回復する` };
    if (s.kind === 'artifact') return { name: `遺物：${ARTIFACTS[s.id].name}`, desc: 'アーティファクト：' + ARTIFACTS[s.id].desc };
    return { name: '黄金の鍵', desc: '次の扉の選択に「黄金の部屋」が加わる。強いアーティファクトを 1 つ選べる' };
  }
  openShop() {
    this.modal = { type: 'shop', stock: this.shopStock(), sel: 0, t: 0, scroll: 0 };
    if (!this.run.shopGreeted) { this.run.shopGreeted = true; this.fx.text(cx(this.player), this.player.y - 40, '行商人「夜が明けねえもんで、商売あがったりさ」', '#ffd84a', 12); }
    this.sfx.play('select');
  }
  buyShop(m) {
    const s = m.stock[m.sel], p = this.player, run = this.run;
    if (!s || s.sold) { this.sfx.play('deny'); return; }
    if (run.gold < s.price) { this.sfx.play('deny'); this.fx.text(cx(p), p.y - 30, '金貨が足りない', '#9a8fa6', 12); return; }
    if (s.kind === 'artifact' && p.artifacts.includes(s.id)) { this.sfx.play('deny'); return; }
    run.gold -= s.price;
    s.sold = true;
    if (s.kind === 'boon') this.grantBoon(s.id);
    else if (s.kind === 'potion') { const amt = Math.round(p.maxHp * s.size * p.stats.healMul); p.hp = Math.min(p.maxHp, p.hp + amt); this.fx.text(cx(p), p.y - 20, `+${amt}`, '#5fd18b', 16); this.fx.ring(cx(p), cy(p), '#5fd18b', 40); }
    else if (s.kind === 'artifact') { p.addArtifact(s.id); this.fx.setBanner(ARTIFACTS[s.id].name, ARTIFACTS[s.id].desc, '#7fe0d0', 1.4); }
    else if (s.kind === 'key') { run.keys++; this.fx.setBanner('黄金の鍵', '次の扉の選択に「黄金の部屋」が加わる', '#ffd84a', 1.4); }
    this.sfx.play('pickup');
    this.emit('buy', { kind: s.kind });
    // 鍵を買った直後なら、この部屋の出口にも黄金の扉を足す
    if (s.kind === 'key' && this.room.doorsOpen) { this.room.doorsOpen = false; this.room.items = this.room.items.filter((it) => it.kind !== 'door'); this.openDoors(); }
  }
  openArtifactPick(rarity, n, thenDoors) {
    const offer = rollArtifacts(this.run.rareRng, this.player.artifacts, rarity, n);
    if (!offer.length) { this.dropGold(80, cx(this.player), this.player.y - 10, 1.6); if (thenDoors) this.openDoors(); return; }
    this.modal = { type: 'artifact', offer, sel: 0, rarity, thenDoors, t: 0 };
    this.sfx.play('pickup');
  }
  // 合成：素材 2 つを消し、上位の強化を Lv1 で得る
  fuse(recipe) {
    const p = this.player;
    const { a, b, to } = recipe;
    if (!p.boons.some((x) => x.id === a) || !p.boons.some((x) => x.id === b)) return false;
    p.setBoons([...p.boons.filter((x) => x.id !== a && x.id !== b), { id: to, tier: 1 }]);
    const col = BOON_COLORS[BOONS[to].school];
    this.fx.burst(cx(p), cy(p), '#ffd84a', 40); this.fx.ring(cx(p), cy(p), '#ffffff', 90, 0.5); this.fx.ring(cx(p), cy(p), col, 60, 0.4);
    this.fx.screenFlash('#ffd84a', 0.35); this.fx.shake(6, 0.25);
    this.fx.setBanner(`合成：${BOONS[to].name}`, BOONS[to].desc(1), '#ffd84a', 2.2);
    this.sfx.play('perfect'); this.sfx.play('guardBreak');
    this.emit('fusion', { to });
    return true;
  }
  // 強化を 1 つ得る（Lv アップ・発動する術の持ち替えを含む）
  grantBoon(id) {
    const p = this.player;
    this.run.fusionDeclined = [];
    const own = p.boons.find((b) => b.id === id);
    if (own) p.setBoons(p.boons.map((b) => (b.id === id ? { ...b, tier: Math.min(boonMax(id), b.tier + 1) } : b)));
    else if (BOONS[id].active) p.setBoons([...p.boons.filter((b) => !BOONS[b.id].active), { id, tier: 1 }]);
    else p.setBoons([...p.boons, { id, tier: 1 }]);
    const nowTier = p.boons.find((b) => b.id === id).tier;
    this.fx.ring(cx(p), cy(p), BOON_COLORS[BOONS[id].school], 50, 0.4);
    this.fx.setBanner(BOONS[id].name + (BOONS[id].max ? ` Lv${nowTier}` : ''), BOONS[id].desc(nowTier), BOON_COLORS[BOONS[id].school], 1.4);
    this.emit('boon', { id });
  }

  // ───────── 経験値とレベル ─────────
  gainExp(n, x, y) {
    const run = this.run, p = this.player;
    if (!n || p.state === 'dead') return;
    run.exp += n;
    if (x != null) this.fx.text(x, y, `+${n} EXP`, '#a8f07a', 10);
    while (run.exp >= expToNext(run.level)) {
      run.exp -= expToNext(run.level);
      run.level++;
      this.onLevelUp();
    }
  }
  onLevelUp() {
    const run = this.run, p = this.player;
    // 最大HPを伸ばし、少し回復
    p.baseMaxHp += LEVEL.hpPer;
    p.setBoons(p.boons);
    p.hp = Math.min(p.maxHp, p.hp + Math.round((LEVEL.hpPer + p.maxHp * LEVEL.healOnUp) * p.stats.healMul));
    const rare = run.level % LEVEL.rareEvery === 0;
    if (rare) run.pendingRare++;
    this.fx.ring(cx(p), cy(p), '#a8f07a', 60, 0.5);
    this.fx.sparks(cx(p), cy(p), '#d8ffb0', 16, 260);
    this.fx.text(cx(p), p.y - 30, `Lv ${run.level}！`, '#a8f07a', 20);
    this.fx.setBanner(`レベル ${run.level}`, `最大HP +${LEVEL.hpPer}・攻撃 +${Math.round(LEVEL.atkPer * 100)}%・会心 +${LEVEL.critPer * 100}%` + (rare ? '　稀少の強化を選べる！' : ''), '#a8f07a', 1.4);
    this.sfx.play('charged');
    this.emit('levelUp', { level: run.level });
  }
  openRarePick() {
    const run = this.run, p = this.player;
    run.pendingRare--;
    const offer = rollRare(run.rareRng, p.boons);
    if (!offer.length) { p.hp = p.maxHp; this.fx.text(cx(p), p.y - 30, '全回復', '#5fd18b', 16); return; }
    this.modal = { type: 'boon', offer, sel: 1 % offer.length, count: 1, rare: true, t: 0 };
    this.sfx.play('perfect');
  }
  onDodge() {
    const p = this.player;
    if (!p.stats.stormstep) return;
    const e = this.room.enemies.filter((o) => o.alive && !(o.boss && o.defeated) && Math.hypot(cx(o) - cx(p), cy(o) - cy(p)) < 230).sort((a, b) => Math.hypot(cx(a) - cx(p), cy(a) - cy(p)) - Math.hypot(cx(b) - cx(p), cy(b) - cy(p)))[0];
    if (e) PROCS.thunderbell(this, 1, e, 60 / 45);
  }
  addShards(n, x, y) {
    if (n <= 0) return;
    this.run.shards += n;
    if (x != null) this.fx.text(x, y, `+${n} 欠片`, '#9fd0ff', 11);
  }

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
      for (const a of e.attacks) this.hitPlayer(a, Math.round(a.dmg * this.enemyDmgMul()), cx(e), a.key);
    }
  }
  resolveProjectiles() {
    const p = this.player;
    for (const pr of this.room.projectiles) {
      if (!pr.alive || pr.delay > 0) continue;
      if (pr.kind === 'ring') {
        // 広がる音の輪：輪の帯に体が重なったときだけ当たる
        const d = Math.hypot(cx(p) - pr.x, cy(p) - pr.y);
        if (!pr.hitDone && d <= pr.r + 10 && d >= pr.r - pr.band - 10) { if (this.hitPlayer(p, pr.dmg, pr.x, pr.key)) pr.hitDone = true; }
        continue;
      }
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
    if (st.procs.riposte) PROCS.riposte(this, st.procs.riposte);
    if (st.perfectNextMul > 1) p.empowerNext = st.perfectNextMul;
    if (st.freezeTime) {
      for (const e of this.room.enemies) if (e.alive && !e.boss && !e.elite && Math.hypot(cx(e) - cx(p), cy(e) - cy(p)) < 220) e.lag = Math.max(e.lag, st.freezeTime);
      this.fx.ring(cx(p), cy(p), '#5aa9e6', 220, 0.4);
    }
    this.emit('perfect');
  }

  damagePlayer(dmg, { fromX, pit } = {}) {
    const p = this.player;
    if (p.state === 'dead') return;
    if (!pit && p.invulnerable) return;
    if (!pit) dmg = Math.max(1, Math.round(dmg * (p.stats.dmgTaken || 1))); // 守りの歯車
    p.hurt(dmg, fromX ?? cx(p));
    // 落下からの復帰では吹き飛ばさない（同じ穴へ落ち続けないように）
    if (pit && p.state !== 'dead') { p.vx = 0; p.vy = 0; }
    if (this.combo.n >= 10) this.fx.text(cx(p), p.y - 26, `${this.combo.n} HIT 途切れた`, '#9a8fa6', 11);
    this.combo.n = 0;
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
    // 不死鳥の砂時計：一度だけ立ち上がる
    if (p.state === 'dead' && p.stats.phoenix && !this.run.phoenixUsed) {
      this.run.phoenixUsed = true;
      p.hp = Math.round(p.maxHp * 0.5); p.state = 'normal'; p.stateT = 0; p.iframeT = 2; p.vx = 0;
      this.fx.burst(cx(p), cy(p), '#ffd84a', 34); this.fx.screenFlash('#ffd84a', 0.4);
      this.fx.setBanner('不死鳥の砂時計', '砂が逆さに落ちる――立ち上がった', '#ffd84a', 1.6);
      this.sfx.play('perfect'); this.slowT = 0.6; this.slowScale = 0.3;
    }
    // 不滅の歯車：一度だけ HP100% で立ち上がる
    if (p.state === 'dead' && p.stats.aegis && !this.run.aegisUsed) {
      this.run.aegisUsed = true;
      p.hp = p.maxHp; p.state = 'normal'; p.stateT = 0; p.iframeT = 2; p.vx = 0;
      this.fx.burst(cx(p), cy(p), '#ffd84a', 40); this.fx.screenFlash('#ffd84a', 0.45);
      this.fx.setBanner('不滅の歯車', '歯車が回り直す――立ち上がった', '#ffd84a', 1.6);
      this.sfx.play('perfect'); this.slowT = 0.6; this.slowScale = 0.3;
    }
    if (p.state === 'dead') {
      this.run.deathT = 0;
      this.sfx.play('kill');
      this.emit('playerDeath');
    }
  }

  useSkill() {
    const p = this.player;
    const art = p.stats.activeArt;
    if (art) {
      const c = ACTIVE_ARTS[art.id].cost(art.tier || 1);
      if (p.gauge < c) { this.sfx.play('deny'); this.fx.text(cx(p), p.y - 14, 'ゲージ不足', '#9a8fa6', 11); return false; }
      p.gauge -= c;
      castArt(this, art);
      if (this.room.boss) this.room.boss.onPlayerCast(this);
      return true;
    }
    const cost = PC.skillCost * p.stats.skillCostMul;
    if (p.gauge < cost) { this.sfx.play('deny'); this.fx.text(cx(p), p.y - 14, 'ゲージ不足', '#9a8fa6', 11); return false; }
    p.gauge -= cost;
    const t = PC.skillTime + p.stats.skillTimeAdd;
    for (const e of this.room.enemies) if (e.alive && Math.hypot(cx(e) - cx(p), cy(e) - cy(p)) < PC.skillRadius) {
      e.warp = e.boss && e.counter === 'skill' ? t / 2 : t;
    }
    for (const pr of this.room.projectiles) if (Math.hypot(pr.x - cx(p), pr.y - cy(p)) < PC.skillRadius) { pr.vx *= 0.35; pr.vy *= 0.35; }
    if (this.room.boss) this.room.boss.onPlayerCast(this);
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
      this.run.killStacks += p.stats.killStack;
      this.addShards((e.elite ? 12 : 2) + Math.floor(this.run.scale.level / 2), cx(e), e.y - 20);
      this.dropExp(expFor(e, this.run.scale), cx(e), cy(e));
      this.dropGold(Math.round((GOLD[e.kind] || 5) * (1 + 0.25 * this.run.scale.level) * p.stats.goldMul), cx(e), cy(e));
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
    // 試練の間：1 波目を倒すと 2 波目
    if (t === 'trial' && !room.cleared && living === 0 && room.wave === 0) {
      room.wave = 1;
      for (const e of room.desc.waves[1]) this.addEnemy(makeEnemy(e.type, e.x * TILE, e.y * TILE));
      this.fx.setBanner('第二波', '', '#ff9a7a', 1.0); this.sfx.play('tellBig');
      return;
    }
    if (!room.cleared && living === 0 && (t === 'combat' || t === 'elite' || t === 'elite2' || t === 'trial' || (t === 'forge' && this.run.glen === 'attacked'))) {
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
    if (t === 'elite2') reward = 'boon2';
    if (t === 'trial') { reward = 'artifact'; this.dropGold(Math.round(60 * (1 + 0.25 * this.run.scale.level)), cx(this.player), this.player.y - 10, 1.4); }
    if (!quiet) {
      this.addShards(3 + this.run.scale.level);
      this.fx.setBanner('制圧', '', '#f2c14e', 1.0);
      this.sfx.play('confirm');
    }
    if (reward) {
      // 報酬はプレイヤーの近くの足場に出す（部屋の形に左右されない）
      const p = this.player, base = p.onGround ? p : { x: p.lastSafe.x, y: p.lastSafe.y, w: p.w, h: p.h };
      let gx = clamp(cx(base) + p.face * 60, 60, this.map.pxW - 60);
      let gy = this.map.groundBelow(gx, base.y + 2);
      if (gy >= this.map.pxH || gy - (base.y + base.h) > 90) { gx = cx(base); gy = base.y + base.h; }
      this.addItem({ kind: 'reward', reward, x: gx - 12, y: gy - 30, w: 24, h: 24, bob: 0 });
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
    const dir = X.x > this.map.pxW / 2 ? -1 : 1; // 2枚目以降の扉は部屋の内側へ
    let n = 0;
    if (next.desc.type === 'combat') {
      // 夜の最初の扉と、HP が満タンのときは「回復」を出さない（アーティファクトか金貨に替える）
      const p = this.player, noHeal = !this.run.firstDoorDone || p.hp >= p.maxHp;
      const choices = [];
      for (const rw of next.desc.rewardChoices) choices.push(rw === 'heal' && noHeal ? (choices.includes('artifact') || next.desc.rewardChoices.includes('artifact') ? 'gold' : 'artifact') : rw);
      choices.forEach((rw) => this.addItem({ kind: 'door', x: X.x + dir * (n++) * 90 - 6, y: doorY, w: 36, h: 50, to: next, reward: rw }));
    } else {
      n++;
      this.addItem({ kind: 'door', x: X.x - 6, y: doorY, w: 36, h: 50, to: next, reward: null, label: next.stairs ? '階段' : { forge: '鍛冶場', elite: '強敵', elite2: '強敵', archive: '書庫', study: '書斎', boss: '鐘楼', shop: '店', shrine: '時の祠', trial: '試練の間', entry: '' }[next.desc.type], causal: ['forge', 'archive', 'study'].includes(next.desc.type), boss: next.desc.type === 'boss', elite: next.desc.type === 'elite' || next.desc.type === 'elite2' || next.desc.type === 'trial' });
    }
    this.run.firstDoorDone = true;
    // 黄金の鍵があれば、黄金の部屋への扉が増える（鐘楼の前は除く）
    if (this.run.keys > 0 && next.desc.type !== 'boss' && this.room.desc.type !== 'golden') {
      this.addItem({ kind: 'door', golden: true, x: X.x + dir * n * 90 - 6, y: doorY, w: 36, h: 50, to: { fi: this.run.fi, ri: this.run.ri, override: { type: 'golden', layout: 'vault' } }, reward: null, label: '黄金の部屋' });
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
      const amt = Math.round(120 * (1 + 0.2 * upLv(this.meta, 'heal')) * p.stats.healMul); p.hp = Math.min(p.maxHp, p.hp + amt);
      this.sfx.play('heal'); this.fx.text(cx(p), p.y - 20, `+${amt}`, '#5fd18b', 16); this.fx.ring(cx(p), cy(p), '#5fd18b', 40);
      this.openDoors();
    } else if (kind === 'gold') {
      this.dropGold(Math.round((40 + 15 * this.run.fi) * (1 + 0.25 * this.run.scale.level)), cx(p), p.y - 10, 1.6);
      this.fx.sparks(cx(p), cy(p), '#ffd84a', 18, 260);
      this.openDoors();
    } else if (kind === 'artifact') {
      this.openArtifactPick('normal', 2, true);
    } else if (kind === 'hourglass') {
      p.baseMaxHp += 36; p.setBoons(p.boons); p.hp = Math.min(p.maxHp, p.hp + 60);
      this.sfx.play('heal'); this.fx.text(cx(p), p.y - 20, '最大HP+36', '#f2c14e', 15);
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
      case 'door': return it.golden ? '黄金の部屋へ（鍵を使う）' : it.reward ? `進む（${REWARD_LABEL[it.reward]}）` : `進む${it.label ? '：' + it.label : ''}`;
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
      case 'merchant': return '店を見る';
      case 'shrine': return it.used ? '' : '祠に触れる';
      case 'goldchest': return it.opened ? '' : '黄金の宝箱を開ける';
    }
    return '';
  }
  tryInteract() {
    const it = this.nearestInteractable();
    if (!it) return;
    const p = this.player;
    switch (it.kind) {
      case 'door': this.goDoor(it); break;
      case 'merchant': this.openShop(); break;
      case 'shrine': this.useShrine(it); break;
      case 'goldchest':
        if (it.opened) break;
        it.opened = true;
        this.sfx.play('perfect'); this.fx.burst(cx(it), cy(it), '#ffd84a', 30); this.fx.screenFlash('#ffd84a', 0.3);
        this.openArtifactPick('gold', 3, false);
        break;
      case 'sign': this.openDialog([{ who: '', text: it.text }]); break;
      case 'npc': it.who === 'lira' ? this.talkLira(it) : this.talkGlen(it); break;
      case 'corpse':
        this.learnK('glen_time');
        this.openDialog([{ who: '', text: '鍛冶屋グレン――師の古い友で、塔の歯車を共に作った男が事切れている。' }, { who: '', text: `狂った時計人形にやられたのだ。ほんの少し前、夜の ${fmtClock(GLEN_DEADLINE)} 頃か。`, note: '記録帳に追加：グレンの最期' }]);
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
        this.openDialog([{ who: '', text: '師の机の走り書き。日誌は書庫にしまってあるらしい。' }, { who: '', text: `「書庫の扉　${this.meta.code.join(' - ')}」`, note: '記録帳に追加：書庫の番号（次の夜も覚えている）' }]);
        break;
      case 'fountain':
        if (this.run.fountainUsed[it.id]) break;
        this.run.fountainUsed[it.id] = true;
        const fh = Math.round(105 * p.stats.healMul);
        p.hp = Math.min(p.maxHp, p.hp + fh);
        this.sfx.play('heal'); this.fx.ring(cx(p), cy(p), '#5fd18b', 40); this.fx.text(cx(p), p.y - 20, `+${fh}`, '#5fd18b', 16);
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
    if (it.golden) {
      if (this.run.keys <= 0) return;
      this.run.keys--;
      this.fx.setBanner('黄金の鍵を使った', '', '#ffd84a', 1.0);
    }
    if (it.reward) this.run.nextReward = it.reward;
    this.sfx.play('door');
    this.startTransition(it.to);
  }
  startTransition(to) { this.transition = { to, t: 0, entered: false }; }
  updateTransition() {
    const tr = this.transition;
    tr.t += DT;
    if (!tr.entered && tr.t >= 0.22) { tr.entered = true; this.enterRoom(tr.to.fi, tr.to.ri, tr.to.override || null); if (tr.to.lift) this.fx.setBanner('昇降機', '上層・書斎へ', '#f2c14e', 1.4); }
    if (tr.t >= 0.44) this.transition = null;
  }

  // ───────── 人物 ─────────
  talkLira(it) {
    const m = this.meta;
    const wedged = hasWedge(m, 'lira');
    const lines = [];
    const choices = [];
    if (!wedged) {
      lines.push({ who: '市場の少女', text: '朝になったら、一番の汽車で遠くの療養所へ行くの。お父さん、見送りに来てくれるかな。' });
      if (knows(m, 'lira_name')) {
        choices.push({ label: '「リラ？」と呼ぶ', fn: () => this.openDialog([{ who: '市場の少女', text: '……どうして、わたしの名前を？' }, { who: 'リラ', text: 'あなた、お父さんのお弟子さん……？ 前にも会った気がする。' }, { who: '', text: '刻守の娘、リラ。次の夜になれば、彼女はまた忘れてしまうだろう。', note: '金の印のついた人物には、楔を打てる' }], this.wedgeChoices('lira', it)) });
      }
      choices.push(...this.wedgeChoices('lira', it));
    } else if (!knows(m, 'lira_name')) {
      lines.push({ who: '市場の少女', text: 'あなたのこと、覚えてる。前の夜にも来たよね？ ……ずっと同じ夜なの？' });
      lines.push({ who: '市場の少女', text: 'お父さんは時計塔のてっぺん。わたしが汽車に乗る朝が、こわいのかな。', note: '記録帳に追加：塔の上の父' });
      this.learnK('lira_father');
    } else {
      lines.push({ who: 'リラ', text: '来てくれた。……ちゃんと覚えてるよ、何度も同じ夜だったこと。' });
      lines.push({ who: 'リラ', text: 'お父さんは、わたしを見送る朝が来ないように、鐘で夜を戻してるんだね。……夜が戻るたび、お父さんのしわが増えていくの。' });
      lines.push({ who: 'リラ', text: 'お父さんに伝えて。「リラは覚えてる。朝が来ても、ちゃんと治して帰ってくる」って。', note: '記録帳に追加：リラの伝言' });
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
      this.openDialog([{ who: 'グレン', text: 'うおっ、来るな！ いや、お前じゃない、時計人形どもだ！' }]);
      return;
    }
    const lines = [];
    if (hasWedge(this.meta, 'glen') && this.room.desc.type === 'entry') {
      lines.push({ who: 'グレン', text: '妙な夢を見た。お前に助けられた夢だ。……借りは返すぜ、刻守の弟子。' });
      lines.push({ who: 'グレン', text: 'あの鐘は人の命を喰う禁忌の道具だ。あいつ、もう何百夜ぶん削ってると思う？' });
      lines.push({ who: 'グレン', text: '娘を見送るのが怖ぇのさ。このままじゃ朝より先に、あいつが尽きる。止めてやれるのはお前だけだ。' });
    } else {
      lines.push({ who: 'グレン', text: '助かった、刻守の弟子か。あの人形どもは塔の番人だ。夜が止まってから狂っちまった。' });
      lines.push({ who: 'グレン', text: '礼だ。腕を見せな、一つ鍛えてやる。' });
    }
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
      const b = room.boss, t0 = room.bossOutroT;
      room.bossOutroT += dt;
      const t1 = room.bossOutroT;
      // 撃破の演出：体のあちこちで連鎖する爆発 → 光の柱とともに消滅（大きな揺れと白い閃光）
      if (t1 < 1.7 && Math.floor(t1 / 0.13) !== Math.floor(t0 / 0.13)) {
        const ex = b.x + this.fx.rand() * b.w, ey = b.y + this.fx.rand() * b.h;
        this.fx.burst(ex, ey, this.fx.rand() < 0.5 ? '#f2c14e' : '#ffffff', 14);
        this.fx.impact(ex, ey, '#ffe14a', 10);
        this.fx.shake(3 + t1 * 3, 0.12);
        b.hitFlash = 0.08;
        this.sfx.play('heavyHit');
      }
      if (t1 >= 1.7 && !room.bossVanished) {
        room.bossVanished = true;
        b.vanished = true;
        this.fx.shake(18, 0.9);
        this.fx.screenFlash('#ffffff', 0.9);
        this.fx.pillar(cx(b), b.y + b.h, room.trueEnd ? '#ffd38a' : '#f2c14e');
        for (const r of [60, 120, 200, 300]) this.fx.ring(cx(b), cy(b), r === 300 ? '#ffffff' : '#f2c14e', r, 0.5 + r / 600);
        this.fx.sparks(cx(b), cy(b), '#ffe14a', 50, 520);
        this.fx.sparks(cx(b), cy(b), '#ffffff', 30, 380);
        for (let i = 0; i < 16; i++) this.fx.parts.push({ x: cx(b), y: cy(b), vx: (this.fx.rand() - 0.5) * 700, vy: -200 - this.fx.rand() * 500, life: 1.4, t: 0, color: '#c9a052', size: 4, g: 900 }); // 歯車の破片
        this.sfx.play('bossBell'); this.sfx.play('guardBreak');
        this.slowT = 0.5; this.slowScale = 0.35;
      }
      if (room.bossOutroT > 4.4 && !run.ended) {
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
      { who: '師の日誌', text: '明日の朝、リラは一番の汽車で療養所へ発つ。治るかどうかは、わからない。' },
      { who: '師の日誌', text: '鐘には時を戻す力がある。鳴らせば、夜は今夜のはじめに戻る。' },
      { who: '師の日誌', text: '鐘は禁忌。鳴らすたび、私の胸の時計が一夜ぶん進む。構わない。残りの命で、あの子が家にいる夜を買えるなら。' },
      { who: '師の日誌', text: '朝など、来なくていい。' },
    ];
    if (first && !this.meta.flags.diaryRead) {
      this.meta.flags.diaryRead = true;
      if (this.meta.slots < MAX_SLOTS) { this.meta.slots++; lines.push({ who: '', text: '師の想いを知り、あなたの楔が強くなった。', note: '楔の枠が1つ増えた' }); }
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
      const lines = [{ who: '刻守（師）', text: 'リラ……もう一度だけ、あの子が家にいる夜を……！' }];
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
      { who: '刻守（師）', text: '……覚えている、だと？ あの子が、この夜を何度も？' },
      { who: '刻守（師）', text: '「朝が来ても、帰ってくる」……あの子は、朝を待っていたのか。' },
      { who: '刻守（師）', text: 'ならば鐘はもう要らん。構えろ、弟子よ。最後は時の力なしで、お前の朝を見せてみろ。' },
    ]);
    this.fx.setBanner('夜明けの決闘', '', '#ffd38a', 2.0);
  }
  onBossDefeated(b) {
    this.addShards(40 + 10 * this.run.scale.level, cx(b), b.y - 30);
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
    if (this.room) this.flushPickups();
    run.ended = true;
    const report = endLoop(this.meta, {
      cause, floor: run.fi + 1, boons: p.boons, dmgByCat: run.dmgByCat, newWedges: run.newWedges, learned: run.learned, clock: run.clock, shards: run.shards, dodges: p.dodgeCount || 0, level: run.level || 1, gold: run.gold || 0, artifacts: p.artifacts || [],
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
      if (e.page >= ENDING_PAGES.length) { this.scene = 'title'; this.titleSel = 0; this.save(); }
    }
  }

  // ───────── 巻き戻り画面 ─────────
  rewindOptions() {
    const m = this.meta;
    const opts = [{ id: 'next', label: '次の夜へ' }];
    opts.push({ id: 'upgrade', label: `刻印を刻む（時の欠片 ${m.shards}）` });
    if (((m.lastLoop && m.lastLoop.boons) || []).length) opts.push({ id: 'inherit', label: `継承する強化を選ぶ（${(m.inherit || []).length}/${inheritCount(m)}）` });
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
      // 2 列のボタン：↑↓ は行、←→ は列
      const mv = (d) => { const n = r.sel + d; if (n >= 0 && n < opts.length) { r.sel = n; this.sfx.play('select'); } };
      if (input.pressed('up')) mv(-2);
      if (input.pressed('down')) mv(2);
      if (input.pressed('left') && r.sel % 2 === 1) mv(-1);
      if (input.pressed('right') && r.sel % 2 === 0) mv(1);
      if (input.pressed('confirm') || input.pressed('jump')) {
        const o = opts[r.sel];
        this.sfx.play('confirm');
        if (o.id === 'next') this.startLoop();
        else if (o.id === 'wedgeBoon') { r.mode = 'wedgeBoon'; r.sub = 0; r.scroll = 0; }
        else if (o.id === 'pull') { r.mode = 'pull'; r.sub = 0; r.scroll = 0; }
        else if (o.id === 'upgrade') { r.mode = 'upgrade'; r.sub = 0; r.scroll = 0; }
        else if (o.id === 'inherit') { r.mode = 'inherit'; r.sub = 0; r.scroll = 0; }
        else if (o.id === 'journal') this.openJournal();
      }
    } else {
      if (r.mode === 'upgrade' || r.mode === 'inherit') { this.updateRewindShop(input, r); return; }
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
  // 刻印（恒久強化）と継承の選択
  inheritCandidates() {
    const m = this.meta;
    const wedgedIds = new Set(m.wedges.filter((w) => w.target === 'boon').map((w) => w.boon.id));
    return ((m.lastLoop && m.lastLoop.boons) || []).filter((b) => !wedgedIds.has(b.id));
  }
  updateRewindShop(input, r) {
    const m = this.meta;
    const list = r.mode === 'upgrade' ? Object.keys(UPGRADES) : this.inheritCandidates();
    if (!list.length) { r.mode = 'view'; return; }
    r.sub = clamp(r.sub, 0, list.length - 1);
    if (input.pressed('up')) { r.sub = (r.sub + list.length - 1) % list.length; this.sfx.play('select'); }
    if (input.pressed('down')) { r.sub = (r.sub + 1) % list.length; this.sfx.play('select'); }
    if (input.pressed('back') || input.pressed('dodge')) { r.mode = 'view'; this.sfx.play('select'); return; }
    if (!(input.pressed('confirm') || input.pressed('jump'))) return;
    if (r.mode === 'upgrade') {
      const k = list[r.sub];
      if (buyUpgrade(m, k)) {
        this.sfx.play('wedge'); r.flash = 0.3;
        r.report.changed.push({ text: `刻印：${UPGRADES[k].name} Lv${upLv(m, k)}（${UPGRADES[k].desc(upLv(m, k))}）`, tone: 'gold' });
        if (k === 'inherit') { const prev = m.inherit.slice(); m.inherit = prev; }
      } else this.sfx.play('deny');
    } else {
      const b = list[r.sub];
      const i = m.inherit.findIndex((x) => x.id === b.id);
      if (i >= 0) { m.inherit.splice(i, 1); this.sfx.play('door'); }
      else if (m.inherit.length < inheritCount(m)) { m.inherit.push({ ...b }); this.sfx.play('confirm'); }
      else this.sfx.play('deny');
    }
    this.save();
  }
  wedgeableBoons() {
    const m = this.meta;
    const wedgedIds = new Set(m.wedges.filter((w) => w.target === 'boon').map((w) => w.boon.id));
    return ((m.lastLoop && m.lastLoop.boons) || []).filter((b) => !wedgedIds.has(b.id));
  }

  // ───────── タイトル ─────────
  titleOptions() {
    const o = [];
    if (this.meta) o.push({ id: 'continue', label: this.meta.flags.ending ? `終わらない夜へ（第 ${this.meta.loop} 夜）` : `続きから（第 ${this.meta.loop} 夜）` });
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
      if (r.mode === 'view') {
        const n = this.rewindOptions().length, g = rewindGrid(n);
        for (let i = 0; i < n; i++) {
          const bx = g.x + (i % 2) * (g.cw + g.gap), by = g.y + Math.floor(i / 2) * g.rowH;
          if (x >= bx - 6 && x <= bx - 6 + g.cw && y >= by - 24 && y <= by - 24 + g.rowH - 6) { r.sel = i; return true; }
        }
        return false;
      }
      // 楔・刻印・継承：ライトボックス。1 回目のタップで選び、同じ行をもう一度で決定
      const n = r.mode === 'upgrade' ? Object.keys(UPGRADES).length : r.mode === 'inherit' ? this.inheritCandidates().length : r.mode === 'pull' ? this.meta.wedges.length : this.wedgeableBoons().length;
      const i = lbRowAt(n, r.sub, x, y, r);
      if (i === -2) { r.mode = 'view'; this.sfx.play('select'); return false; }
      if (i < 0) return false;
      if (i === r.sub) return true;
      r.sub = i; this.sfx.play('select'); return false;
    }
    const m = this.modal;
    if (!m) return false;
    switch (m.type) {
      case 'analysis': if (m.t > 0.4) this.openDialog(m.next); return false;
      case 'dialog': {
        const last = m.idx >= m.lines.length - 1;
        if (last && m.choices) { const n = m.choices.length; const i = row(472 - n * 28, 28, n, 26); if (i < 0) return false; m.sel = i; return true; }
        if (m.t < 0.12) return false;
        this.sfx.play('select');
        if (last) this.modal = null; else { m.idx++; m.t = 0; }
        return false;
      }
      case 'fusion': {
        if (m.t < 0.3) return false;
        if (y > 400 && y < 450) { const i = x < VIEW_W / 2 ? 0 : 1; if (m.sel === i) return true; m.sel = i; this.sfx.play('select'); }
        return false;
      }
      case 'shop': {
        const i = lbRowAt(m.stock.length, m.sel, x, y, m);
        if (i === -2) { this.modal = null; return false; }
        if (i < 0) return false;
        if (i === m.sel) { this.buyShop(m); return false; }
        m.sel = i; this.sfx.play('select'); return false;
      }
      case 'artifact':
      case 'boon': {
        if (m.t < 0.25) return false;
        const cw = m.offer.length > 3 ? 214 : 250, gap = 18, total = m.offer.length * cw + (m.offer.length - 1) * gap;
        for (let i = 0; i < m.offer.length; i++) {
          const cx0 = VIEW_W / 2 - total / 2 + i * (cw + gap);
          if (x >= cx0 && x <= cx0 + cw && y >= 130 && y <= 390) {
            if (m.sel === i) return true; // 2回目のタップで決定
            m.sel = i; this.sfx.play('select'); return false;
          }
        }
        return false;
      }
      case 'pause': { const i = row(214, 32, this.pauseOptions().length, 28); if (i < 0) return false; m.sel = i; return true; }
      case 'forge': {
        const i = lbRowAt(m.list.length, m.sel, x, y, m);
        if (i === -2) { this.modal = null; return false; }
        if (i < 0) return false;
        if (i === m.sel) return true;
        m.sel = i; this.sfx.play('select'); return false;
      }
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
  openBoonPick(count, school, noDoors = false) {
    const p = this.player;
    let offer;
    if (school) {
      const ids = Object.keys(BOONS).filter((id) => BOONS[id].school === school && !p.boons.some((b) => b.id === id));
      offer = this.run.offerRng.shuffle(ids).slice(0, 3);
    } else offer = rollOffer(this.run.offerRng, p.boons, this.meta.unlocked, 3 + upLv(this.meta, 'choice'));
    if (!offer.length) { p.hp = Math.min(p.maxHp, p.hp + 90); this.openDoors(); return; }
    this.modal = { type: 'boon', offer, sel: 1 % offer.length, count, school, noDoors, t: 0 };
    this.sfx.play('pickup');
  }
  openForge() {
    const tier1 = this.player.boons.filter((b) => b.tier < boonMax(b.id) && BOONS[b.id].school !== 'risk');
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
      case 'analysis':
        if (m.t > 0.4 && ok) { this.sfx.play('confirm'); input.consume('attack'); input.consume('jump'); this.openDialog(m.next); }
        break;
      case 'boon': {
        if (m.t < 0.25) return; // 誤選択防止
        if (input.pressed('left')) { m.sel = (m.sel + m.offer.length - 1) % m.offer.length; this.sfx.play('select'); }
        if (input.pressed('right')) { m.sel = (m.sel + 1) % m.offer.length; this.sfx.play('select'); }
        if (input.pressed('confirm') || input.pressed('jump')) {
          const id = m.offer[m.sel];
          const threat0 = this.threatStep();
          this.grantBoon(id); // 発動する術は 1 つだけ：別の術なら持ち替える
          this.sfx.play('pickup');
          const threat1 = this.threatStep();
          if (threat1 > threat0) this.fx.text(cx(this.player), this.player.y - 48, `脅威 ${threat1}：敵が強く・多くなる`, '#ff7a5a', 14);
          input.consume('jump'); input.consume('attack');
          if (m.rare || m.noDoors) { this.modal = null; }
          else if (m.count > 1) { this.modal = null; this.openBoonPick(m.count - 1, m.school); }
          else { this.modal = null; this.openDoors(); }
        }
        break;
      }
      case 'shop': {
        const n = m.stock.length;
        if (input.pressed('up')) { m.sel = (m.sel + n - 1) % n; this.sfx.play('select'); }
        if (input.pressed('down')) { m.sel = (m.sel + 1) % n; this.sfx.play('select'); }
        if (back) { this.modal = null; return; }
        if ((input.pressed('confirm') || input.pressed('jump')) && m.t > 0.15) this.buyShop(m);
        break;
      }
      case 'fusion': {
        if (m.t < 0.3) return;
        if (input.pressed('left') || input.pressed('up')) { m.sel = 0; this.sfx.play('select'); }
        if (input.pressed('right') || input.pressed('down')) { m.sel = 1; this.sfx.play('select'); }
        if (back) { m.sel = 1; }
        if (input.pressed('confirm') || input.pressed('jump') || back) {
          input.consume('jump'); input.consume('attack');
          this.modal = null;
          if (m.sel === 0) this.fuse(m.recipe);
          else { (this.run.fusionDeclined ||= []).push(m.recipe.to); this.sfx.play('select'); }
        }
        break;
      }
      case 'artifact': {
        if (m.t < 0.25) return;
        if (input.pressed('left')) { m.sel = (m.sel + m.offer.length - 1) % m.offer.length; this.sfx.play('select'); }
        if (input.pressed('right')) { m.sel = (m.sel + 1) % m.offer.length; this.sfx.play('select'); }
        if (input.pressed('confirm') || input.pressed('jump')) {
          const id = m.offer[m.sel];
          this.player.addArtifact(id);
          const a = ARTIFACTS[id];
          this.fx.setBanner(a.name, a.desc, a.rarity === 'gold' ? '#ffd84a' : '#7fe0d0', 1.6);
          this.fx.ring(cx(this.player), cy(this.player), a.rarity === 'gold' ? '#ffd84a' : '#7fe0d0', 60, 0.5);
          this.sfx.play('pickup');
          this.emit('artifact', { id });
          input.consume('jump'); input.consume('attack');
          this.modal = null;
          if (m.thenDoors) this.openDoors();
        }
        break;
      }
      case 'forge': {
        if (input.pressed('up')) { m.sel = (m.sel + m.list.length - 1) % m.list.length; this.sfx.play('select'); }
        if (input.pressed('down')) { m.sel = (m.sel + 1) % m.list.length; this.sfx.play('select'); }
        if (back) { this.modal = null; return; }
        if (ok && m.t > 0.15) {
          const b = m.list[m.sel];
          const boons = this.player.boons.map((x) => (x.id === b.id ? { ...x, tier: Math.min(boonMax(x.id), x.tier + 1) } : x));
          this.player.setBoons(boons);
          this.run.forged = true;
          this.modal = null;
          this.sfx.play('wedge');
          const nt = Math.min(boonMax(b.id), b.tier + 1);
          this.fx.setBanner(`${BOONS[b.id].name} ${BOONS[b.id].max ? 'Lv' + nt : 'II'}`, BOONS[b.id].desc(nt), '#f2c14e', 1.6);
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

export const BOON_COLORS = { haste: '#5fd18b', stasis: '#5aa9e6', echo: '#b67cf0', risk: '#e35d5d', power: '#ff9a3c', arts: '#ff6ad5', rare: '#ffd84a' };
// 大きな数字を読みやすく（1,234 / 12.3万）
export function fmtNum(n) {
  n = Math.round(n);
  if (n >= 100000) return (n / 10000).toFixed(n >= 1000000 ? 0 : 1) + '万';
  return n.toLocaleString('en-US');
}

export const ENDING_PAGES = [
  ['刻守――師は、剣を下ろした。', '鐘楼の窓の外が、白みはじめている。'],
  ['師の髪は、すっかり白くなっていた。', 'それでも胸の時計は、まだ静かに動いている。'],
  ['「リラは覚えている、か」', '「怖かったのは朝ではない。あの子を見送ることだったのだな」'],
  ['鐘は鳴らなかった。', '夜は戻らず、塔に、はじめての朝が来た。'],
  ['駅のホームで、少女が手を振っている。見送るのは、父だ。', '――いってきます、お父さん。'],
  ['夜明けの楔', '遊んでくれてありがとう。'],
  ['クリア', 'ここで物語は完結です。', '続けて遊ぶと「終わらない夜」――敵がさらに強くなる挑戦です。'],
];
