import { ABILITIES, ABILITY_ORDER, type AbilityId } from '../core/data/abilities';
import { DASH, PLAYER } from '../core/data/tuning';
import { redeemPrice } from '../core/economy';
import type { Sim } from '../core/sim';
import { SPEAKER_NAME, type Script } from '../core/story';
import type { Settings } from '../settings';
import { NavList, el } from './dom';
import './style.css';

export type NavKey = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel';

/** 画面の文字と枠。ゲームの状態は持たず、Sim と App から呼ばれて描くだけ */
export class UI {
  readonly root: HTMLElement;
  private hud = el('div', 'layer');
  private hpEl = el('div', 'hp');
  private zeniEl = el('div', 'zeni');
  private slots = new Map<AbilityId, HTMLElement>();
  private lawsEl = el('div', 'laws');
  private goalEl = el('div', 'goal');
  private hintEl = el('div', 'hint');
  private promptEl = el('div', 'prompt');
  private toastEl = el('div', 'toast');
  private toastT = 0;
  private overlay = el('div', 'layer');
  private lastHp = -1;
  private lastZeni = '';
  private lastLaws = '';
  // 会話
  private dlg: { script: Script; i: number; shown: number; box: HTMLElement; text: HTMLElement; name: HTMLElement; next: HTMLElement; done: () => void; speed: number } | null = null;
  // 今開いているメニュー
  nav: NavList | null = null;
  private onCancel: (() => void) | null = null;
  private onLeftRight: ((d: number) => void) | null = null;
  textSpeed: Settings['textSpeed'] = 'normal';

  constructor(root: HTMLElement) {
    this.root = root;
    const tl = el('div', 'hud-tl');
    tl.append(this.hpEl, this.zeniEl);
    const tr = el('div', 'hud-tr');
    const slotWrap = el('div', 'slots');
    for (const id of ABILITY_ORDER) {
      const a = ABILITIES[id];
      const s = el('div', 'slot');
      s.title = `${a.name}（${a.reading}）：${a.verb}`;
      s.append(el('span', 'g', a.glyph), el('span', 'k', a.key.split(' ')[0]));
      slotWrap.append(s);
      this.slots.set(id, s);
    }
    tr.append(slotWrap, this.lawsEl);
    this.hud.append(tl, tr, this.goalEl, this.hintEl, this.promptEl, this.toastEl);
    root.append(this.hud, this.overlay);
    this.showHud(false);
  }

  setFontScale(viewH: number, textSize: number): void {
    const base = Math.max(14, Math.round((viewH / 540) * 16));
    document.documentElement.style.setProperty('--fs', Math.round(base * textSize) + 'px');
  }

  showHud(on: boolean): void {
    this.hud.classList.toggle('hidden', !on);
  }

  updateHud(sim: Sim, dt: number): void {
    const p = sim.player;
    if (p.hp !== this.lastHp) {
      this.hpEl.replaceChildren(...Array.from({ length: PLAYER.maxHp }, (_, i) => el('span', 'magatama' + (i < p.hp ? '' : ' empty'))));
      this.hpEl.title = `勾玉 ${p.hp} / ${PLAYER.maxHp}`;
      this.lastHp = p.hp;
    }
    const l = sim.ledger;
    const zk = `${l.zeni}|${l.debt}`;
    if (zk !== this.lastZeni) {
      this.zeniEl.replaceChildren(document.createTextNode(`銭 ${l.zeni}`));
      if (l.debt > 0) this.zeniEl.append(el('span', 'debt', `つけ ${l.debt}`));
      this.lastZeni = zk;
    }
    for (const id of ABILITY_ORDER) {
      const s = this.slots.get(id)!;
      const pawned = !sim.has(id);
      s.classList.toggle('pawned', pawned);
      s.classList.toggle('cool', id === 'dash' && !pawned && p.dashCd > 0 && p.mode !== 'dash');
      if (id === 'lantern') s.querySelector('.g')!.textContent = !pawned && p.lanternOn ? '灯' : ABILITIES.lantern.glyph;
    }
    const lk = l.pawned.join(',');
    if (lk !== this.lastLaws) {
      this.lawsEl.replaceChildren(...l.pawned.map((id) => el('div', 'law', ABILITIES[id].law.name)));
      this.lastLaws = lk;
    }
    const g = sim.currentGoal();
    this.goalEl.textContent = g;
    this.goalEl.classList.toggle('hidden', !g);
    // 操作の案内
    const b = p.body;
    const hint = sim.level.hints.find(
      (h) =>
        b.x >= h.box.min[0] && b.x <= h.box.max[0] && b.y + 0.5 >= h.box.min[1] && b.y + 0.5 <= h.box.max[1] && b.z >= h.box.min[2] && b.z <= h.box.max[2] &&
        (!h.needFlag || sim.flag(h.needFlag)) &&
        (!h.unlessFlag || !sim.flag(h.unlessFlag)),
    );
    this.hintEl.textContent = hint?.text ?? '';
    this.hintEl.classList.toggle('hidden', !hint);
    const it = sim.interactable();
    if (it) {
      this.promptEl.replaceChildren(el('b', '', 'E'), document.createTextNode(it.kind === 'shrine' ? 'おこんと話す（質屋）' : it.label));
    }
    this.promptEl.classList.toggle('hidden', !it);
    this.toastT -= dt;
    this.toastEl.classList.toggle('hidden', this.toastT <= 0);
  }

  toast(text: string, warn = false, time = 1.6): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.toggle('warn', warn);
    this.toastT = time;
    this.toastEl.classList.remove('hidden');
  }

  flashSlot(id: AbilityId): void {
    const s = this.slots.get(id);
    if (!s) return;
    s.classList.remove('flash');
    void s.offsetWidth;
    s.classList.add('flash');
  }

  clearOverlay(): void {
    this.overlay.replaceChildren();
    this.nav = null;
    this.onCancel = null;
    this.onLeftRight = null;
    this.dlg = null;
  }

  get busy(): boolean {
    return this.overlay.childElementCount > 0;
  }

  /** キー入力を今の画面へ渡す */
  navKey(k: NavKey): void {
    if (this.dlg) {
      if (k === 'confirm' || k === 'cancel') this.advanceDialog();
      return;
    }
    if (k === 'cancel') {
      this.onCancel?.();
      return;
    }
    if ((k === 'left' || k === 'right') && this.onLeftRight) {
      this.onLeftRight(k === 'left' ? -1 : 1);
      return;
    }
    if (!this.nav) return;
    if (k === 'up') this.nav.move(-1);
    else if (k === 'down') this.nav.move(1);
    else if (k === 'confirm') this.nav.pick();
  }

  // ───────────── 会話
  openDialog(script: Script, done: () => void): void {
    this.clearOverlay();
    const box = el('div', 'dialog');
    const name = el('div', 'name');
    const text = el('div', 'text');
    const next = el('div', 'next', '▼');
    box.append(name, text, next);
    box.addEventListener('click', () => this.advanceDialog());
    this.overlay.append(box);
    const speed = this.textSpeed === 'instant' ? 9999 : this.textSpeed === 'fast' ? 90 : script.weighty ? 26 : 40;
    this.dlg = { script, i: 0, shown: 0, box, text, name, next, done, speed };
    this.renderLine();
  }

  private renderLine(): void {
    const d = this.dlg!;
    const line = d.script.lines[d.i];
    d.name.textContent = SPEAKER_NAME[line.who];
    d.name.className = 'name ' + line.who;
    d.text.className = 'text' + (line.who === 'note' ? ' note' : '');
    d.shown = 0;
    d.text.textContent = '';
  }

  updateDialog(dt: number): void {
    const d = this.dlg;
    if (!d) return;
    const line = d.script.lines[d.i];
    if (d.shown < line.text.length) {
      d.shown = Math.min(line.text.length, d.shown + d.speed * dt);
      d.text.textContent = line.text.slice(0, Math.floor(d.shown));
    }
    d.next.classList.toggle('hidden', d.shown < line.text.length);
  }

  /** 文字送り中なら全文を出す。出ていれば次の行へ。最後なら閉じる */
  advanceDialog(): void {
    const d = this.dlg;
    if (!d) return;
    const line = d.script.lines[d.i];
    if (d.shown < line.text.length) {
      d.shown = line.text.length;
      d.text.textContent = line.text;
      return;
    }
    d.i++;
    if (d.i >= d.script.lines.length) {
      const done = d.done;
      this.clearOverlay();
      done();
      return;
    }
    this.renderLine();
  }

  get dialogOpen(): boolean {
    return !!this.dlg;
  }

  // ───────────── 質屋
  openShop(sim: Sim, shrineName: string, act: (kind: 'pawn' | 'redeem', id: AbilityId) => void, close: () => void, keepSel = 0): void {
    this.clearOverlay();
    const p = el('div', 'panel shop');
    p.append(el('h2', '', '質屋　おこん'), el('div', 'sub', `${shrineName}　——　質に入れた型は、請け出すまで世の理として働きます`));
    const w = el('div', 'wallet');
    w.append(el('span', 'zeni', `手持ち　銭 ${sim.ledger.zeni}`));
    if (sim.ledger.debt > 0) w.append(el('span', 'zeni', `つけ ${sim.ledger.debt}（拾った銭で先に返します）`));
    p.append(w);
    const rows: HTMLElement[] = [];
    for (const id of ABILITY_ORDER) {
      const a = ABILITIES[id];
      const pawned = !sim.has(id);
      const row = el('div', 'row' + (pawned ? ' pawned' : ''));
      row.dataset.id = id;
      const glyph = el('div', 'glyph', a.glyph);
      const title = el('div', 'rtitle', `${a.name}（${a.reading}）`);
      title.append(el('small', '', pawned ? '質に入っている' : `手元にある・${a.verb}`));
      const actEl = el('div', 'act');
      const btn = el('button', 'btn' + (pawned ? '' : ' danger'));
      const check = pawned ? sim.canRedeem(id) : sim.canPawn(id);
      if (pawned) {
        const credit = check.ok && check.credit > 0;
        btn.textContent = credit ? `つけで請け出す　${redeemPrice(id)} 銭` : `請け出す　${redeemPrice(id)} 銭`;
      } else btn.textContent = `質に入れる　+${a.price} 銭`;
      btn.disabled = !check.ok;
      btn.tabIndex = -1;
      actEl.append(btn);
      if (!check.ok) actEl.append(el('span', 'reason', check.reason));
      const law = el('div', 'law', `${a.law.name}：${a.law.desc}`);
      const detail = el('div', 'detail');
      detail.append(el('span', 'gain', `得：${a.law.gain}`), document.createTextNode('　'), el('span', 'loss', `失：${a.law.loss}`));
      row.append(glyph, title, actEl, law, detail);
      rows.push(row);
    }
    const leave = el('button', 'btn', '店を出る');
    leave.tabIndex = -1;
    const foot = el('div', 'foot');
    foot.append(el('span', '', '請け出しは質入れ値の 1.25 倍。銭が足りず、ほかの型を売っても届かないときだけ「つけ」が使えます。'), leave);
    p.append(...rows, foot);
    this.overlay.append(p);
    const items = [...rows, leave];
    this.nav = new NavList(items, (i) => {
      if (i === rows.length) {
        close();
        return;
      }
      const id = rows[i].dataset.id as AbilityId;
      const pawned = !sim.has(id);
      const check = pawned ? sim.canRedeem(id) : sim.canPawn(id);
      if (!check.ok) return;
      const a = ABILITIES[id];
      const q = pawned
        ? `「${a.name}」を ${redeemPrice(id)} 銭で請け出しますか？\n${a.law.name}は止まります。`
        : `「${a.name}」を質に入れて ${a.price} 銭を受け取りますか？\n${a.verb}ことができなくなり、${a.law.name}が働きます。`;
      this.confirm(q, () => act(pawned ? 'redeem' : 'pawn', id), () => this.openShop(sim, shrineName, act, close, i));
    });
    this.nav.select(keepSel);
    this.onCancel = close;
  }

  confirm(q: string, yes: () => void, no: () => void): void {
    this.clearOverlay();
    const c = el('div', 'confirm');
    const qq = el('div', 'q');
    qq.style.whiteSpace = 'pre-wrap';
    qq.textContent = q;
    const by = el('button', 'btn', 'はい');
    const bn = el('button', 'btn', 'いいえ');
    by.tabIndex = bn.tabIndex = -1;
    const btns = el('div', 'btns');
    btns.append(by, bn);
    c.append(qq, btns);
    this.overlay.append(c);
    this.nav = new NavList([by, bn], (i) => (i === 0 ? yes() : no()));
    this.nav.select(1); // 既定は「いいえ」（誤操作で売らない）
    this.onCancel = no;
    this.onLeftRight = (d) => this.nav?.move(d);
  }

  // ───────────── メニュー
  menu(title: string, items: { label: string; disabled?: boolean; act: () => void }[], onCancel: (() => void) | null, cls = 'panel menu'): void {
    this.clearOverlay();
    const p = el('div', cls);
    if (title) p.append(el('h2', '', title));
    const btns = items.map((it) => {
      const b = el('button', 'btn', it.label);
      b.disabled = !!it.disabled;
      b.tabIndex = -1;
      p.append(b);
      return b;
    });
    this.overlay.append(p);
    this.nav = new NavList(btns, (i) => items[i].act());
    const first = items.findIndex((i) => !i.disabled);
    this.nav.select(Math.max(0, first));
    this.onCancel = onCancel;
  }

  title(items: { label: string; disabled?: boolean; act: () => void }[], version: string): void {
    this.clearOverlay();
    const t = el('div', 'title');
    t.append(el('div', 'logo', 'ことわり質屋'), el('div', 'en', 'KOTOWARI ― THE PAWNSHOP OF LAWS'));
    const m = el('div', 'menu');
    const btns = items.map((it) => {
      const b = el('button', 'btn', it.label);
      b.disabled = !!it.disabled;
      b.tabIndex = -1;
      m.append(b);
      return b;
    });
    t.append(m, el('div', 'ver', 'v' + version), el('div', 'note', '光の点滅を含む演出があります（設定で抑えられます）'));
    this.overlay.append(t);
    this.nav = new NavList(btns, (i) => items[i].act());
    this.nav.select(Math.max(0, items.findIndex((i) => !i.disabled)));
    this.onCancel = null;
  }

  settings(s: Settings, change: (s: Settings) => void, back: () => void, keepSel = 0): void {
    this.clearOverlay();
    const p = el('div', 'panel settings');
    p.append(el('h2', '', '設定'));
    type Opt = { label: string; values: { v: unknown; t: string }[]; key: keyof Settings };
    const vol = (k: keyof Settings, label: string): Opt => ({ label, key: k, values: Array.from({ length: 11 }, (_, i) => ({ v: i, t: String(i) })) });
    const opts: Opt[] = [
      vol('master', '全体の音量'),
      vol('bgm', '音楽'),
      vol('se', '効果音'),
      { label: '画面の揺れ', key: 'shake', values: [{ v: 'on', t: '標準' }, { v: 'weak', t: '弱い' }, { v: 'off', t: 'なし' }] },
      { label: '光の点滅を抑える', key: 'flashReduce', values: [{ v: false, t: 'いいえ' }, { v: true, t: 'はい' }] },
      { label: '特殊効果', key: 'fx', values: [{ v: 'full', t: '標準' }, { v: 'reduced', t: '控えめ' }] },
      { label: '文字の大きさ', key: 'textSize', values: [{ v: 1, t: '標準' }, { v: 1.25, t: '大' }, { v: 1.5, t: '特大' }] },
      { label: '文字送り', key: 'textSpeed', values: [{ v: 'normal', t: '標準' }, { v: 'fast', t: '速い' }, { v: 'instant', t: '一瞬' }] },
      { label: 'ドットの細かさ', key: 'pixel', values: [{ v: 'fine', t: '細かい' }, { v: 'chunky', t: '粗い' }] },
      { label: 'カメラの上下を反転', key: 'invertY', values: [{ v: false, t: 'いいえ' }, { v: true, t: 'はい' }] },
      { label: '当たり判定を表示', key: 'debugBoxes', values: [{ v: false, t: 'いいえ' }, { v: true, t: 'はい' }] },
    ];
    const rows: HTMLElement[] = [];
    const cycle = (o: Opt, d: number) => {
      const cur = o.values.findIndex((x) => x.v === s[o.key]);
      const n = Math.max(0, Math.min(o.values.length - 1, cur + d));
      const ns = { ...s, [o.key]: o.values[n].v } as Settings;
      change(ns);
      this.settings(ns, change, back, rows.indexOf(rows[opts.indexOf(o)]));
    };
    for (const o of opts) {
      const r = el('div', 'setting');
      const cur = o.values.find((x) => x.v === s[o.key]);
      const val = el('div', 'val');
      const l = el('button', 'btn', '◀');
      const rr = el('button', 'btn', '▶');
      l.tabIndex = rr.tabIndex = -1;
      l.addEventListener('click', (e) => {
        e.stopPropagation();
        cycle(o, -1);
      });
      rr.addEventListener('click', (e) => {
        e.stopPropagation();
        cycle(o, 1);
      });
      val.append(l, el('span', '', cur?.t ?? ''), rr);
      r.append(el('span', '', o.label), val);
      rows.push(r);
      p.append(r);
    }
    const bk = el('button', 'btn', 'もどる');
    bk.tabIndex = -1;
    bk.style.marginTop = '0.8em';
    p.append(bk);
    this.overlay.append(p);
    this.nav = new NavList([...rows, bk], (i) => {
      if (i === rows.length) back();
      else cycle(opts[i], 1);
    });
    this.nav.select(keepSel);
    this.onCancel = back;
    this.onLeftRight = (d) => {
      const i = this.nav!.sel;
      if (i < opts.length) cycle(opts[i], d);
    };
  }

  help(back: () => void): void {
    this.clearOverlay();
    const p = el('div', 'panel help');
    p.append(el('h2', '', '操作と遊び方'));
    const t = el('table');
    const rows: [string, string][] = [
      ['WASD・矢印', '歩く（カメラの向きが前）'],
      ['マウス（クリックで固定）・右ドラッグ・Q / R', '見回す'],
      ['Space', '跳（長押しで高く。崖から落ちた直後も少しだけ跳べる）'],
      ['J・左クリック', '払（扇で払う。3 段まで続く）'],
      ['K・Shift', '駆（無敵の駆け抜け。光った妖の一撃の直前なら「見切り」で時が止まり、次の一撃が重くなる）'],
      ['L・F', '灯（灯の輪の中にだけ「幽かな橋」が現れる）'],
      ['E・Enter', '調べる・話す・会話を送る'],
      ['Esc・P', 'ポーズ'],
      ['ゲームパッド', '左スティック：歩く／右：見回す／A：跳／X：払／B・RB：駆／LB：灯／Y：話す／START：ポーズ'],
      ['質屋', '鳥居のおこんに型（能力）を質に入れると銭を得て、その力は「理」として世界に働く。請け出しは 1.25 倍'],
      ['鳥居', '触れると記録し、勾玉が戻る。倒れるとここから。銭は失わない'],
    ];
    for (const [a, b] of rows) {
      const tr = el('tr');
      tr.append(el('td', '', a), el('td', '', b));
      t.append(tr);
    }
    const bk = el('button', 'btn', 'もどる');
    bk.tabIndex = -1;
    bk.style.marginTop = '0.8em';
    p.append(t, bk);
    this.overlay.append(p);
    this.nav = new NavList([bk], () => back());
    this.onCancel = back;
  }

  credits(back: () => void, version: string): void {
    this.clearOverlay();
    const p = el('div', 'panel help');
    p.append(el('h2', '', 'この作品について'));
    const lines = [
      `ことわり質屋　v${version}`,
      '企画・プログラム・ボクセル模型・音楽・効果音・文章：Claude Code（Anthropic の生成 AI）による制作。依頼者の監修のもとで作られています。',
      '画・音はすべてプログラムで生成しています（画像・音声の生成 AI は使っていません）。',
      '文字：DotGothic16（Fontworks、SIL Open Font License 1.1）。許諾書は fonts/OFL-DotGothic16.txt。',
      'この物語はフィクションです。実在の人物・団体・地名・信仰とは関係ありません。',
      '健康のための注意：光の点滅や画面の揺れを含む演出があります。設定の「光の点滅を抑える」「画面の揺れ」「特殊効果」で弱められます。疲れたら休んでください。',
      '記録はこのブラウザの中（localStorage）にだけ保存され、外へ送られません。',
    ];
    for (const l of lines) p.append(el('p', '', l));
    const bk = el('button', 'btn', 'もどる');
    bk.tabIndex = -1;
    p.append(bk);
    this.overlay.append(p);
    this.nav = new NavList([bk], () => back());
    this.onCancel = back;
  }

  chapterCard(title: string, sub: string): HTMLElement {
    this.clearOverlay();
    const c = el('div', 'card');
    c.append(el('div', 't', title), el('div', 'line'), el('div', 's', sub));
    this.overlay.append(c);
    return c;
  }

  ending(title: string, paras: string[], onDone: () => void): void {
    this.clearOverlay();
    const e = el('div', 'ending');
    e.append(el('div', 't', title));
    for (const p of paras) e.append(el('p', '', p));
    const b = el('button', 'btn', 'タイトルへ');
    b.tabIndex = -1;
    e.append(b);
    this.overlay.append(e);
    this.nav = new NavList([b], () => onDone());
    this.onCancel = null;
  }
}

export { DASH };
