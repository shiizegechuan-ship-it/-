import * as THREE from 'three';
import { AudioEngine, type Sfx } from './audio/engine';
import { ABILITIES, type AbilityId } from './core/data/abilities';
import { DT } from './core/data/tuning';
import type { SimEvent } from './core/events';
import { emptyInput, type InputFrame } from './core/input';
import { getLevel, hasLevel } from './core/levels';
import type { ChapterId } from './core/levels/types';
import { clearSave, readSave, safeStorage, writeSave } from './core/save';
import { Sim, newProgress, type Progress } from './core/sim';
import { RouteBot } from './core/bot/routeBot';
import { SCRIPTS, type Script } from './core/story';
import { Input, type Action } from './input/input';
import { FollowCamera } from './render/camera';
import { ScreenFx } from './render/fx';
import { PixelPipeline } from './render/pipeline';
import { GameView } from './render/view';
import { loadSettings, saveSettings, type Settings } from './settings';
import { UI, type NavKey } from './ui/ui';

export const VERSION = '0.2.0';

type State = 'title' | 'play' | 'dialog' | 'shop' | 'menu' | 'card' | 'slice' | 'cine' | 'end' | 'ending';

interface Beat {
  dur: number;
  t?: number;
  on?: () => void;
  tick?: (u: number, dt: number) => void;
}

const SONG_FOR: Record<string, string> = { prologue: 'festival', ch1: 'cedar', ch2: 'bamboo', ch3: 'town', ch4: 'falls', finale: 'summit' };
/** 章で初めて質屋を開いたときのおこんの話 */
const FIRST_SHOP: Partial<Record<ChapterId, string>> = { ch1: 'okon_first_shop', ch2: 'okon_ch2_first', ch3: 'okon_ch3_first', ch4: 'okon_ch4_first' };

export class App {
  readonly pipe: PixelPipeline;
  readonly view = new GameView();
  readonly cam: FollowCamera;
  readonly fx: ScreenFx;
  readonly audio = new AudioEngine();
  readonly ui: UI;
  readonly input: Input;
  readonly store = safeStorage();
  settings: Settings;
  sim: Sim;
  state: State = 'title';
  private acc = 0;
  private last = 0;
  private stateT = 0;
  private playTime = 0;
  private endings: string[] = [];
  private queue: (() => void)[] = [];
  private shopShrine = '';
  private cineDone: (() => void) | null = null;
  private cineDur = 0;
  /** 手動でコマを進める（自動検査用） */
  manual = false;
  private titleOrbit = 0;
  frames = 0;
  /** 結末の演出の段取り */
  private beats: Beat[] = [];
  private endOrbit = 0;
  /** 自動プレイ（検査用）。道しるべをたどり、会話は送り、店は閉じる */
  private auto: { bot: RouteBot; sim: Sim; skill: number; t: number; ending: 'dawn' | 'night' } | null = null;
  autoLog: string[] = [];

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.settings = loadSettings(this.store);
    this.pipe = new PixelPipeline(canvas);
    this.cam = new FollowCamera(this.pipe.width / this.pipe.height);
    this.fx = new ScreenFx(this.pipe);
    this.ui = new UI(uiRoot);
    this.input = new Input(canvas);
    this.sim = new Sim(getLevel, newProgress('prologue'));
    this.applySettings();
    this.view.setLevel(this.sim);
    this.cam.reset(this.sim);
    this.view.onRockLand = (x, z) => {
      const b = this.sim.player.body;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < 14) {
        this.sfx('slam');
        this.cam.shake(0.12 * Math.max(0, 1 - d / 14), 0.15);
      }
    };
    window.addEventListener('resize', () => this.onResize());
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    canvas.addEventListener('click', () => {
      if (this.state === 'play') this.input.requestLock();
    });
    this.onResize();
    this.toTitle();
  }

  private onResize(): void {
    this.applyPixel();
    this.ui.setFontScale(window.innerHeight, this.settings.textSize);
  }

  private applyPixel(): void {
    const base = this.settings.pixel === 'chunky' ? 1 : 1.25;
    const w = window.innerWidth;
    const h = window.innerHeight;
    // 細かい：基準 480×270、粗い：384×216
    const s = Math.max(1, Math.floor(Math.min(w / (384 * base), h / (216 * base))));
    this.pipe.resizeWithScale(w, h, s);
    this.cam.cam.aspect = this.pipe.width / this.pipe.height;
    this.cam.cam.updateProjectionMatrix();
  }

  applySettings(): void {
    const s = this.settings;
    this.audio.setVolumes(s.master, s.bgm, s.se);
    this.cam.shakeScale = s.shake === 'on' ? 1 : s.shake === 'weak' ? 0.4 : 0;
    this.fx.reduced = s.fx === 'reduced';
    this.fx.flashReduce = s.flashReduce;
    this.ui.textSpeed = s.textSpeed;
    this.ui.setFontScale(window.innerHeight, s.textSize);
    if (this.view.debugBoxes !== s.debugBoxes) this.view.setDebug(s.debugBoxes, this.sim);
    this.applyPixel();
  }

  // ───────────────────────── 画面の遷移
  toTitle(): void {
    this.state = 'title';
    this.input.exitLock();
    this.sim = new Sim(getLevel, newProgress('prologue'));
    this.view.setLevel(this.sim);
    this.cam.reset(this.sim);
    this.ui.showHud(false);
    this.audio.playSong('title');
    const save = readSave(this.store);
    this.ui.title(
      [
        { label: 'はじめから', act: () => this.newGame() },
        { label: 'つづきから', disabled: !save, act: () => this.continueGame() },
        { label: '操作と遊び方', act: () => this.ui.help(() => this.toTitle()) },
        { label: '設定', act: () => this.openSettings(() => this.toTitle()) },
        { label: 'この作品について', act: () => this.ui.credits(() => this.toTitle(), VERSION) },
      ],
      VERSION,
    );
  }

  newGame(): void {
    this.sfx('ui');
    clearSave(this.store);
    this.endings = [];
    this.playTime = 0;
    this.startChapter(newProgress('prologue'));
  }

  continueGame(): void {
    const r = readSave(this.store);
    if (!r) return this.newGame();
    this.sfx('ui');
    this.endings = r.data.endings;
    this.playTime = r.data.playTime;
    this.startChapter(r.data.progress, r.recovered ? '記録が壊れていたため、ひとつ前の記録から再開しました' : undefined);
  }

  private startChapter(progress: Progress, note?: string): void {
    if (!hasLevel(progress.chapter)) return this.toBeContinued();
    this.sim = new Sim(getLevel, progress, (Date.now() & 0xffff) | 1);
    this.view.setLevel(this.sim);
    this.cam.reset(this.sim);
    this.ui.showHud(true);
    this.audio.playSong(SONG_FOR[progress.chapter] ?? 'cedar');
    this.save();
    this.showCard(note);
  }

  /** 章題：止まった景色の中で、灯の火だけが揺れる（シネマグラフ） */
  private showCard(note?: string): void {
    const def = this.sim.level;
    this.state = 'card';
    this.stateT = 0;
    this.ui.showHud(false);
    this.ui.chapterCard(def.title, def.subtitle);
    // 章の景色を 1 コマ描いてから止める
    const est = def.establish;
    if (est) {
      this.cam.cam.position.set(...est.from);
      this.cam.cam.lookAt(...est.to);
    }
    this.renderFrame(0);
    this.pipe.snapshot();
    this.fx.cinema = true;
    if (note) this.ui.toast(note, true, 4);
  }

  private endCard(): void {
    this.fx.cinema = false;
    this.ui.clearOverlay();
    this.ui.showHud(true);
    this.state = 'play';
    this.acc = 0;
  }

  private toBeContinued(): void {
    this.state = 'end';
    this.input.exitLock();
    this.ui.showHud(false);
    this.audio.playSong('still');
    this.fx.fadeTo(0.6, 1.5);
    this.ui.ending(
      'つづく',
      [
        '山門の先には、風の鳴る竹林が待っている。',
        `ここまでの手持ち：銭 ${this.sim.ledger.zeni}${this.sim.ledger.debt ? `（つけ ${this.sim.ledger.debt}）` : ''}　質に入っている型：${this.sim.ledger.pawned.map((id) => ABILITIES[id].name).join('・') || 'なし'}`,
        'この版は序章と一の章までです。記録は山門の前に残っています。',
      ],
      () => {
        this.fx.fadeTo(0, 0.4);
        this.toTitle();
      },
    );
  }

  private openPause(): void {
    this.state = 'menu';
    this.input.clearPressed();
    this.input.exitLock();
    this.audio.duck(true);
    const resume = () => {
      this.ui.clearOverlay();
      this.audio.duck(false);
      this.state = 'play';
      this.acc = 0;
    };
    this.ui.menu(
      'ひと休み',
      [
        { label: 'つづける', act: resume },
        { label: '操作と遊び方', act: () => this.ui.help(() => this.openPause()) },
        { label: '設定', act: () => this.openSettings(() => this.openPause()) },
        { label: '鳥居からやり直す', act: () => { resume(); this.sim.respawn(); this.fx.lumaKey(0.8); } },
        { label: 'タイトルへ（鳥居の記録は残ります）', act: () => { this.audio.duck(false); this.toTitle(); } },
      ],
      resume,
    );
  }

  private openSettings(back: () => void): void {
    const prev = this.state;
    this.state = prev === 'title' ? 'title' : 'menu';
    this.ui.settings(
      this.settings,
      (s) => {
        this.settings = s;
        saveSettings(this.store, s);
        this.applySettings();
        this.sfx('uiMove');
      },
      back,
    );
  }

  // ───────────────────────── 会話・質屋
  private say(id: string, then?: () => void): void {
    const script = SCRIPTS[id];
    if (!script) {
      then?.();
      return;
    }
    this.playScript(script, () => {
      for (const f of script.setFlags ?? []) this.sim.setFlag(f);
      if (id === 'fin_stele') {
        this.say('fin_okon', () => this.finalChoice());
        return;
      }
      then?.();
    });
  }

  private playScript(script: Script, done: () => void): void {
    this.state = 'dialog';
    this.input.clearPressed();
    this.input.exitLock();
    this.audio.duck(true);
    this.scriptFx(script);
    this.ui.openDialog(script, () => {
      this.audio.duck(false);
      this.fx.cinema = false;
      if (script.fx === 'splatOkon') this.view.splatOkon(false, this.sim, 0);
      this.cam.focus = null;
      this.state = 'play';
      this.acc = 0;
      done();
      this.flushQueue();
    });
  }

  private scriptFx(script: Script): void {
    switch (script.fx) {
      case 'dollyOkon': {
        const s = this.nearestShop();
        const pos = s ? this.view.okonPosition(s, this.sim) : null;
        if (pos) {
          this.cam.dollyZoom(pos, 24, 1.8);
          this.cam.focus = pos;
        }
        break;
      }
      case 'dollyFloat': {
        const c = this.view.floatCenter();
        if (c) this.cam.dollyZoom(c, 26, 2.0);
        break;
      }
      case 'dollyGate': {
        const g = this.sim.world.gates[0]?.solid;
        if (g) this.cam.dollyZoom(new THREE.Vector3((g.minX + g.maxX) / 2, g.minY + 1.5, (g.minZ + g.maxZ) / 2), 24, 2.0);
        break;
      }
      case 'dollyShadow': {
        const sh = this.sim.world.shadows;
        const b = this.sim.player.body;
        const near = [...sh].sort((p, q) => Math.hypot(p.minX - b.x, p.minZ - b.z) - Math.hypot(q.minX - b.x, q.minZ - b.z))[0];
        if (near) this.cam.dollyZoom(new THREE.Vector3((near.minX + near.maxX) / 2, near.maxY, (near.minZ + near.maxZ) / 2), 26, 2.0);
        break;
      }
      case 'dollyFalls': {
        const wf = this.sim.level.props.find((p) => p.kind === 'waterfall');
        if (wf) this.cam.dollyZoom(new THREE.Vector3(wf.x, wf.y + 6, wf.z), 22, 2.2);
        break;
      }
      case 'splatOkon':
        this.view.splatOkon(true, this.sim, this.pipe.height);
        this.sfx('perfect');
        break;
      case 'morphMask': {
        this.view.morphBossMask();
        const bs = this.sim.boss;
        if (bs) this.cam.focus = new THREE.Vector3(bs.body.x, bs.body.y + 2.4, bs.body.z);
        this.sfx('perfect');
        break;
      }
      case 'cinemaDiary':
        // 日記を読む間は、景色を止めて灯の火だけを揺らす（シネマグラフ）
        this.pipe.snapshot();
        this.fx.cinema = true;
        break;
      case 'sortLedger':
        this.fx.pixelSort(1.6, 1);
        this.sfx('pawn');
        break;
      case 'bell':
        this.sfx('bell');
        this.cam.shake(0.25, 0.8);
        break;
    }
  }

  private nearestShop(): string | null {
    const b = this.sim.player.body;
    let best: string | null = null;
    let bd = Infinity;
    for (const s of this.sim.level.shrines)
      if (s.shop) {
        const d = Math.hypot(s.x - b.x, s.z - b.z);
        if (d < bd) {
          bd = d;
          best = s.id;
        }
      }
    return best;
  }

  private openShop(shrineId: string, sel = 0): void {
    const def = this.sim.level.shrines.find((s) => s.id === shrineId);
    if (!def) return;
    // 章で初めて店を開くときは、おこんの説明から
    const first = FIRST_SHOP[this.sim.progress.chapter];
    const ch = this.sim.progress.chapter;
    if (first && !this.sim.flag('met_shop_' + ch)) {
      this.sim.setFlag('met_shop_' + ch);
      this.say(first, () => this.openShop(shrineId));
      return;
    }
    this.shopShrine = shrineId;
    this.state = 'shop';
    this.input.clearPressed();
    this.input.exitLock();
    this.audio.playSong('okon');
    this.sfx('ui');
    this.fx.pixelSort(0.45, 0.6); // 暖簾をくぐる
    this.ui.openShop(this.sim, def.name, (kind, id) => this.trade(kind, id), () => this.closeShop(), sel);
  }

  private closeShop(): void {
    this.ui.clearOverlay();
    this.audio.playSong(SONG_FOR[this.sim.progress.chapter] ?? 'cedar');
    this.state = 'play';
    this.acc = 0;
    this.flushQueue();
  }

  private trade(kind: 'pawn' | 'redeem', id: AbilityId): void {
    const r = kind === 'pawn' ? this.sim.doPawn(id) : this.sim.doRedeem(id);
    if (!r.ok) {
      this.sfx('deny');
      this.ui.toast(r.reason, true);
      this.openShop(this.shopShrine);
      return;
    }
    this.save();
    // 店を一度閉じて、理が書き換わる瞬間を見せる（データモッシュ）
    this.ui.clearOverlay();
    this.sfx(kind === 'pawn' ? 'pawn' : 'redeem');
    this.fx.datamosh(kind === 'pawn' ? 1.3 : 0.9, 1);
    this.view.lawFx(this.sim);
    this.ui.flashSlot(id);
    const a = ABILITIES[id];
    this.ui.toast(kind === 'pawn' ? `「${a.name}」を質に入れた　${a.law.name}が働く` : `「${a.name}」を請け出した`, false, 2.2);
    const firstScript =
      kind === 'pawn' && id === 'jump' && !this.sim.flag('seen_firstpawn') && this.sim.world.floats.length > 0
        ? 'c1_firstpawn'
        : kind === 'pawn' && id === 'fan' && !this.sim.flag('seen_firstwind') && !!this.sim.level.wind
          ? 'c2_firstwind'
          : kind === 'pawn' && id === 'lantern' && !this.sim.flag('seen_firstshadow') && this.sim.world.shadows.length > 0
            ? 'c3_firstshadow'
            : kind === 'pawn' && id === 'dash' && !this.sim.flag('seen_firstslow') && this.sim.level.hazards.length > 0
              ? 'c4_firstslow'
              : null;
    const firstFloat = !!firstScript;
    if (kind === 'pawn' && id === 'jump') {
      this.sfx('float');
      this.view.floatFx();
      const c = this.view.floatCenter();
      if (c && !firstFloat) this.cam.dollyZoom(c, 30, 1.4);
    }
    const reopen = () => this.openShop(this.shopShrine, ['jump', 'fan', 'lantern', 'dash'].indexOf(id));
    this.cine(firstFloat ? 0.6 : 1.4, () => {
      if (firstScript) {
        this.sim.setFlag(
          { c1_firstpawn: 'seen_firstpawn', c2_firstwind: 'seen_firstwind', c3_firstshadow: 'seen_firstshadow', c4_firstslow: 'seen_firstslow' }[firstScript] ?? 'seen_' + firstScript,
        );
        this.say(firstScript, reopen);
      } else reopen();
    });
  }

  // ───────────────────────── 最後の選択と結末
  private preEnding: Progress | null = null;
  private finalChoice(): void {
    this.preEnding = structuredClone(this.sim.progress);
    this.state = 'menu';
    this.input.exitLock();
    this.input.clearPressed();
    const confirm = (q: string, go: () => void) =>
      this.ui.confirm(q, go, () => this.finalChoice());
    this.ui.menu(
      '朝を、どうする',
      [
        { label: 'すべての舞を納める（朝を請け出す）', act: () => confirm('跳・払・灯・駆を、すべて質に入れます。\nもう戻れません。よろしいですか？', () => this.endingDawn()) },
        { label: '舞を手放さない（夜に残る）', act: () => confirm('舞を手放さず、夜に残ります。\nよろしいですか？', () => this.endingNight()) },
      ],
      null,
    );
  }

  private runBeats(beats: Beat[]): void {
    this.beats = beats;
    this.state = 'ending';
    this.ui.clearOverlay();
    this.ui.showHud(false);
  }

  private endingDawn(): void {
    this.say('end_dawn', () => {
      const held = (['jump', 'fan', 'lantern', 'dash'] as AbilityId[]).filter((id) => this.sim.has(id));
      const beats: Beat[] = [];
      for (const id of held)
        beats.push({
          dur: 0.75,
          on: () => {
            this.sim.doPawn(id);
            this.sfx('pawn');
            this.fx.datamosh(0.7, 0.8);
            this.view.lawFx(this.sim);
            this.ui.toast(`${ABILITIES[id].name}を納めた　${ABILITIES[id].law.name}`, false, 1.2);
          },
        });
      beats.push({
        dur: 4.5,
        on: () => {
          this.audio.playSong('dawn');
          this.view.floatFx();
          this.endOrbit = this.cam.yaw;
        },
        tick: (u) => this.orbitCam(u, 6.5, 2.2),
      });
      beats.push({
        dur: 5.0,
        on: () => this.sfx('bell'),
        tick: (u) => {
          this.orbitCam(1 + u * 0.4, 6.5 + u * 2, 2.2 + u * 1.5);
          this.view.setBend(Math.min(1, u * 1.15), this.sim, this.cam.cam);
          if (u > 0.55) {
            this.pipe.params.fadeColor.set('#fff6e0');
            this.pipe.params.fade = (u - 0.55) / 0.45;
          }
        },
      });
      beats.push({
        dur: 0.1,
        on: () => {
          this.view.setBend(0, this.sim, this.cam.cam);
          this.recordEnding('dawn');
          this.ui.ending(
            '明けの舞',
            [
              '夜が、明けた。四つの理が重なって世が舞い終えたとき、朧山の稜線から、久しく見なかった朝日が差した。',
              '里の人々は面を外し、寝ぼけ眼で互いの顔を見て笑った。千鶴は神楽殿の欄干にもたれて、声を上げずに泣いた。',
              '鈴は、もう跳べない。扇も振れない。けれど朝の光の中で、里の子らが見よう見まねで舞う神楽を、いちばん前で見ていた。',
              'ひと月後。狐の質屋の店先で、鈴は帳面をつけている。「跳」の請け出しまで、あと十二銭。',
              '「請け出しは、少しばかり高くつきますよ」「知ってる。だから、働いてるの」',
            ],
            () => this.afterEnding(),
          );
          this.state = 'end';
        },
      });
      this.runBeats(beats);
    });
  }

  private endingNight(): void {
    this.say('end_night', () => {
      this.audio.playSong('still');
      this.runBeats([
        {
          dur: 6,
          on: () => (this.endOrbit = this.cam.yaw),
          tick: (u) => {
            this.orbitCam(u * 0.6, 5.5, 2.0);
            this.fx.acid = Math.min(1, u * 1.3);
            this.pipe.params.fadeColor.set('#0d0c18');
            if (u > 0.7) this.pipe.params.fade = (u - 0.7) / 0.3;
          },
        },
        {
          dur: 0.1,
          on: () => {
            this.fx.acid = 0;
            this.recordEnding('night');
            this.ui.ending(
              '常夜',
              [
                '夜は明けなかった。朧山の神楽殿では、面をかぶった二人の舞手が、終わらない夜の神楽を舞い続けている。',
                '里の人々は面をかぶったまま、灯を絶やさずに暮らしている。誰も失われない。誰も、先へ進まない。',
                '質屋の帳面には、請け出されない朝が、今も一つ預かってある。',
                '（つづきから選ぶと、山頂の碑の前からもう一度選び直せます）',
              ],
              () => this.afterEnding(),
            );
            this.state = 'end';
          },
        },
      ]);
    });
  }

  private orbitCam(u: number, dist: number, h: number): void {
    const b = this.sim.player.body;
    const a = this.endOrbit + Math.PI + u * Math.PI * 0.8;
    const c = this.cam.cam;
    c.position.set(b.x + Math.sin(a) * dist, b.y + h, b.z + Math.cos(a) * dist);
    c.lookAt(b.x, b.y + 1.2, b.z);
  }

  private recordEnding(id: string): void {
    if (!this.endings.includes(id)) this.endings.push(id);
    // 碑の前から選び直せるように、選ぶ前の状態で残す
    const p = this.preEnding ?? structuredClone(this.sim.progress);
    writeSave(this.store, p, this.playTime, this.endings);
  }

  private afterEnding(): void {
    this.pipe.params.fade = 0;
    this.fx.acid = 0;
    this.ui.credits(() => this.toTitle(), VERSION);
    this.state = 'end';
  }

  /** 操作を止めて演出を見せる（Sim は空の入力で進める） */
  private cine(dur: number, done: () => void): void {
    this.state = 'cine';
    this.stateT = 0;
    this.cineDur = dur;
    this.cineDone = done;
  }

  private flushQueue(): void {
    while (this.queue.length && this.state === 'play') this.queue.shift()!();
  }

  private save(): void {
    writeSave(this.store, this.sim.progress, this.playTime, this.endings);
  }

  private sfx(n: Sfx, pitch?: number): void {
    this.audio.sfx(n, pitch ? { pitch } : {});
  }

  // ───────────────────────── 1 コマ
  frame(now: number): void {
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 1 / 60);
    this.last = now;
    if (!this.manual) this.tick(dt);
  }

  private prevState: State = 'title';

  tick(dt: number): void {
    this.frames++;
    this.autoStep();
    this.input.pollPad();
    // 画面が切り替わったら、前の画面で押した入力を持ち越さない
    if (this.state !== this.prevState) {
      this.input.clearPressed();
      this.prevState = this.state;
    }
    if (this.input.take('debug')) {
      this.settings = { ...this.settings, debugBoxes: !this.settings.debugBoxes };
      this.applySettings();
    }
    this.stateT += dt;
    let frozen = true;
    const navKeys: [Action, NavKey][] = [
      ['up', 'up'],
      ['down', 'down'],
      ['left', 'left'],
      ['right', 'right'],
      ['confirm', 'confirm'],
      ['cancel', 'cancel'],
    ];
    const nav = () => {
      for (const [a, k] of navKeys)
        if (this.input.take(a)) {
          if (k === 'up' || k === 'down') this.sfx('uiMove');
          this.ui.navKey(k);
          if (this.state === 'play') break;
        }
    };
    switch (this.state) {
      case 'title': {
        nav();
        this.titleOrbit += dt * 0.08;
        const c = this.cam.cam;
        const a = 0.55 + Math.sin(this.titleOrbit) * 0.35;
        c.position.set(Math.sin(a) * 15, 3.2, 1.5 + Math.cos(a) * 15);
        c.lookAt(0, 3.4, 1.5);
        break;
      }
      case 'play': {
        if (this.input.take('pause')) {
          this.openPause();
          break;
        }
        frozen = false;
        this.playTime += dt;
        this.acc += dt;
        let steps = 0;
        while (this.acc >= DT && steps < 5 && this.state === 'play') {
          this.sim.step(this.makeInput());
          this.handleEvents(this.sim.drain());
          this.acc -= DT;
          steps++;
        }
        if (steps >= 5) this.acc = 0;
        // Sim が受け取らなかった入力（メニュー用の決定・上下など）は捨てる
        if (steps > 0 && this.state === 'play') this.input.clearPressed();
        const m = this.input.takeMouse();
        const pad = this.input.padCamX * 14;
        this.cam.update(this.sim, dt, {
          dx: m.dx + pad,
          dy: (m.dy + this.input.padCamY * 8) * (this.settings.invertY ? -1 : 1),
          keyYaw: (this.input.isHeld('camL') ? 1 : 0) - (this.input.isHeld('camR') ? 1 : 0),
        });
        break;
      }
      case 'dialog':
        nav();
        this.ui.updateDialog(dt);
        this.cam.update(this.sim, dt, { dx: 0, dy: 0, keyYaw: 0 });
        break;
      case 'shop':
      case 'menu':
        nav();
        this.input.takeMouse();
        break;
      case 'card':
        if (this.stateT > 2.6 || (this.stateT > 0.6 && (this.input.take('confirm') || this.input.take('attack')))) this.endCard();
        this.input.clearPressed();
        break;
      case 'slice':
        this.cam.update(this.sim, dt, { dx: 0, dy: 0, keyYaw: 0 });
        if (!this.cam.sliceActive) {
          this.state = 'play';
          this.acc = 0;
        }
        break;
      case 'cine':
        frozen = false;
        this.acc += dt;
        while (this.acc >= DT) {
          this.sim.step(emptyInput(this.cam.yaw));
          this.sim.drain();
          this.acc -= DT;
        }
        this.cam.update(this.sim, dt, { dx: 0, dy: 0, keyYaw: 0 });
        if (this.stateT >= this.cineDur && !this.cam.dollyActive) {
          const d = this.cineDone;
          this.cineDone = null;
          this.state = 'play';
          d?.();
        }
        this.input.clearPressed();
        break;
      case 'ending': {
        frozen = false;
        // 世界は空の入力で進む（理が働く様子を見せる）
        this.acc += dt;
        while (this.acc >= DT) {
          this.sim.step(emptyInput(this.cam.yaw));
          this.sim.drain();
          this.acc -= DT;
        }
        const bt = this.beats[0];
        if (!bt) break;
        if (bt.t === undefined) {
          bt.t = 0;
          bt.on?.();
        }
        bt.t += dt;
        bt.tick?.(Math.min(1, bt.t / bt.dur), dt);
        if (bt.t >= bt.dur) this.beats.shift();
        this.input.clearPressed();
        break;
      }
      case 'end':
        nav();
        break;
    }
    this.renderFrame(dt, frozen);
  }

  private renderFrame(dt: number, frozen = true): void {
    this.fx.update(dt);
    this.view.setCameraPos(this.cam.cam.position, this.sim);
    this.view.update(this.sim, dt, frozen && this.state !== 'title');
    if (this.state === 'play' || this.state === 'cine') this.ui.updateHud(this.sim, dt);
    this.pipe.render(this.view.scene, this.cam.cam, performance.now() / 1000);
  }

  startAuto(skill = 1, ending: 'dawn' | 'night' = 'dawn'): void {
    this.auto = { bot: this.newBot(skill), sim: this.sim, skill, t: 0, ending };
  }

  private newBot(skill: number): RouteBot {
    return new RouteBot(this.sim, skill, undefined, (kind, id) => {
      this.autoLog.push(`${this.sim.progress.chapter} ${kind} ${id}`);
      this.trade(kind, id);
    });
  }

  /** 自動プレイの 1 フレーム：状態ごとに人の代わりに操作する */
  private autoStep(): void {
    const a = this.auto;
    if (!a) return;
    if (a.sim !== this.sim) {
      a.sim = this.sim;
      a.bot = this.newBot(a.skill);
      this.autoLog.push('chapter ' + this.sim.progress.chapter);
    }
    a.t++;
    if (this.state === 'dialog' && a.t % 4 === 0) this.ui.advanceDialog();
    if (this.state === 'card' && this.stateT > 0.3) this.endCard();
    if (this.state === 'shop' && a.t % 3 === 0) this.closeShop();
    if (this.state === 'menu' && this.preEnding && a.t % 5 === 0) {
      this.autoLog.push('choice ' + a.ending);
      if (a.ending === 'dawn') this.endingDawn();
      else this.endingNight();
    }
  }

  private makeInput(): InputFrame {
    if (this.auto && this.auto.sim === this.sim) return this.auto.bot.next();
    const mv = this.input.moveVector();
    return {
      moveX: mv.x,
      moveY: mv.y,
      camYaw: this.cam.yaw,
      jumpPressed: this.input.take('jump'),
      jumpHeld: this.input.isHeld('jump'),
      attackPressed: this.input.take('attack'),
      dashPressed: this.input.take('dash'),
      lanternPressed: this.input.take('lantern'),
      interactPressed: this.input.take('interact'),
    };
  }

  private handleEvents(evs: SimEvent[]): void {
    for (const e of evs) {
      switch (e.t) {
        case 'jump':
          this.sfx('jump');
          break;
        case 'land':
          if (e.speed > 6) {
            this.sfx('land');
            this.view.sparks.burst(6, this.sim.player.body.x, this.sim.player.body.y + 0.05, this.sim.player.body.z, 1.5, '#cdb88d', { life: 0.3, grav: 4 });
          }
          break;
        case 'swing':
          this.sfx(e.combo === 2 ? 'swing3' : 'swing', 1 + e.combo * 0.08);
          break;
        case 'hit':
          this.sfx(e.immune ? 'immune' : e.heavy ? 'hitHeavy' : 'hit');
          this.view.hitFx(e.x, e.y, e.z, e.heavy, e.immune);
          this.cam.shake(e.heavy ? 0.12 : 0.06, 0.12);
          if (e.immune) this.ui.toast('扇が効かない……', true, 1);
          break;
        case 'enemyDown':
          this.sfx('enemyDown');
          break;
        case 'telegraph': {
          this.sfx('telegraph');
          const en = this.sim.enemies.find((x) => x.id === e.enemy);
          if (en) this.view.telegraphFx(en);
          break;
        }
        case 'enemyAttack':
          if (e.type === 'ishibozu') {
            this.sfx('slam');
            this.cam.shake(0.18, 0.25);
          }
          break;
        case 'hurt':
          this.sfx('hurt');
          this.cam.shake(0.2, 0.2);
          this.fx.textureFlash(0.12);
          break;
        case 'dead':
          this.sfx('dead');
          this.fx.fadeTo(0.85, 1.3);
          break;
        case 'respawn':
          this.fx.fadeTo(0, 0.5);
          this.fx.lumaKey(0.9);
          this.cam.reset(this.sim);
          this.ui.toast('鳥居から、もう一度', false, 1.6);
          break;
        case 'fall':
          this.sfx('fall');
          this.cam.reset(this.sim);
          break;
        case 'dash':
          this.sfx('dash');
          break;
        case 'perfect':
          this.sfx('perfect');
          this.view.sparks.burst(30, e.x, e.y + 0.9, e.z, 5, '#ffffff', { life: 0.6, grav: 0 });
          this.cam.timeSlice(new THREE.Vector3(e.x, e.y, e.z), this.settings.fx === 'reduced' ? 0.45 : 0.7);
          this.state = 'slice';
          this.ui.toast('見切り！　次の一撃が重くなる', false, 1.4);
          return;
        case 'jumpDenied':
        case 'attackDenied':
        case 'dashDenied':
        case 'lanternDenied':
          this.sfx('deny');
          this.ui.toast(e.reason, true, 1.1);
          if (e.t === 'jumpDenied') this.ui.flashSlot('jump');
          if (e.t === 'attackDenied') this.ui.flashSlot('fan');
          if (e.t === 'dashDenied') this.ui.flashSlot('dash');
          if (e.t === 'lanternDenied') this.ui.flashSlot('lantern');
          break;
        case 'pickup':
          this.sfx('pickup', 1 + Math.min(0.3, e.value * 0.02));
          if (e.repaid > 0) this.ui.toast(`銭 +${e.value}（つけに ${e.repaid} 返した）`, false, 1.2);
          break;
        case 'lantern':
          this.sfx('lantern');
          break;
        case 'checkpoint':
          this.sfx('checkpoint');
          this.save();
          this.ui.toast('鳥居に触れた　記録した', false, 1.6);
          break;
        case 'dialog':
          if (this.state !== 'play') {
            this.queue.push(() => this.say(e.script));
            break;
          }
          this.say(e.script);
          if (e.script === 'pro_okon' || e.script === 'c1_ledger') this.sfx('gate');
          return;
        case 'shop':
          this.openShop(e.shrine);
          return;
        case 'exit':
          this.goChapter(e.to);
          return;
        case 'windBlown':
          break;
        case 'bossStart':
          this.audio.playSong('summit');
          this.ui.toast('夜守　千鶴', true, 2);
          this.cam.shake(0.2, 0.4);
          break;
        case 'bossPhase':
          this.fx.textureFlash(0.35);
          this.fx.datamosh(0.5, 0.6);
          this.cam.shake(0.3, 0.5);
          this.sfx('bell');
          this.queue.push(() => this.say(e.phase === 2 ? 'fin_phase2' : 'fin_phase3'));
          break;
        case 'bossDown':
          this.audio.playSong('still');
          this.fx.textureFlash(0.2);
          this.sfx('dead');
          this.cam.shake(0.3, 0.6);
          break;
        case 'hazardHit':
          this.sfx(e.kind === 'rock' ? 'slam' : 'hurt');
          this.cam.shake(0.25, 0.25);
          break;
      }
    }
  }

  private goChapter(to: ChapterId | 'ending'): void {
    this.input.exitLock();
    const p = structuredClone(this.sim.progress);
    if (to === 'ending' || !hasLevel(to)) {
      if (to !== 'ending') {
        p.chapter = to;
        p.shrine = null;
        writeSave(this.store, p, this.playTime, this.endings);
      }
      this.fx.lumaKey(1.4);
      this.toBeContinued();
      return;
    }
    p.chapter = to;
    p.shrine = null;
    this.fx.lumaKey(1.4);
    this.fx.datamosh(0.8, 0.7);
    this.startChapter(p);
  }

  /** 自動検査用 */
  debugApi() {
    return {
      app: this,
      state: () => this.state,
      sim: () => this.sim,
      step: (n = 1) => {
        for (let i = 0; i < n; i++) this.tick(1 / 60);
      },
      frameMs: () => [...this.pipe.frameMs],
      startAt: (chapter: ChapterId, progress?: Partial<Progress>) => this.startChapter({ ...newProgress(chapter), ...progress }),
      auto: (skill = 1, ending: 'dawn' | 'night' = 'dawn') => this.startAuto(skill, ending),
      endings: () => [...this.endings],
      autoLog: () => [...this.autoLog],
      skipCard: () => this.state === 'card' && this.endCard(),
    };
  }
}
