// 入力は「アクション」単位で扱う。キーボード・パッド・テスト用の再生が同じ口から入る。
export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dodge', 'skill', 'interact', 'pause', 'journal', 'confirm', 'back'];

export const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  KeyZ: 'jump', Space: 'jump',
  KeyX: 'attack', KeyJ: 'attack',
  KeyC: 'dodge', ShiftLeft: 'dodge', KeyK: 'dodge',
  KeyV: 'skill', KeyL: 'skill',
  KeyE: 'interact',
  Escape: 'pause', KeyP: 'pause',
  Tab: 'journal',
  Enter: 'confirm',
  Backspace: 'back',
};

export class Input {
  constructor() {
    this.raw = {}; // 現在押されているか（全入力源の論理和）
    this.sources = {}; // 入力源ごとの押下状態（キーボードとパッドが打ち消し合わないように）
    this.cur = {};
    this.prev = {};
    for (const a of ACTIONS) this.raw[a] = this.cur[a] = this.prev[a] = false;
    this.pressBuffer = {}; // 1回の固定更新の間に押されて離された入力を取りこぼさない
  }
  set(action, down, src = 'kb') {
    if (!(action in this.raw)) return;
    const m = (this.sources[src] ||= {});
    m[action] = down;
    let any = false;
    for (const k in this.sources) if (this.sources[k][action]) any = true;
    if (any && !this.raw[action]) this.pressBuffer[action] = true;
    this.raw[action] = any;
  }
  // 固定更新の先頭で1回呼ぶ
  step() {
    for (const a of ACTIONS) {
      this.prev[a] = this.cur[a];
      this.cur[a] = this.raw[a] || !!this.pressBuffer[a];
    }
    this.pressedNow = { ...this.pressBuffer };
    this.pressBuffer = {};
  }
  down(a) { return this.cur[a]; }
  // 左右が同時に押されているときは、後から押した方を優先（十字キーを転がしたときの引っかかり防止）
  dirX() {
    if (this.pressed('left')) this.lastX = -1;
    if (this.pressed('right')) this.lastX = 1;
    const l = this.cur.left, r = this.cur.right;
    if (l && r) return this.lastX || 0;
    return l ? -1 : r ? 1 : 0;
  }
  pressed(a) { return (this.cur[a] && !this.prev[a]) || !!(this.pressedNow && this.pressedNow[a]); }
  // メニュー等が入力を消費したときに使う
  consume(a) { this.prev[a] = this.cur[a]; if (this.pressedNow) this.pressedNow[a] = false; }
  clear() { for (const a of ACTIONS) { this.raw[a] = false; } this.sources = {}; this.pressBuffer = {}; }
}

export function attachKeyboard(input, target) {
  target.addEventListener('keydown', (e) => {
    const a = KEYMAP[e.code];
    if (a) { input.set(a, true); e.preventDefault(); }
    // メニュー操作用の別名
    if (e.code === 'KeyZ' || e.code === 'Enter' || e.code === 'Space') input.set('confirm', true);
    if (e.code === 'Escape' || e.code === 'Backspace') input.set('back', true);
  });
  target.addEventListener('keyup', (e) => {
    const a = KEYMAP[e.code];
    if (a) input.set(a, false);
    if (e.code === 'KeyZ' || e.code === 'Enter' || e.code === 'Space') input.set('confirm', false);
    if (e.code === 'Escape' || e.code === 'Backspace') input.set('back', false);
  });
  target.addEventListener('blur', () => input.clear());
}

// ゲームパッド。接続中のすべてのパッドをまとめて読む（仮想デバイスが先頭にいても動くように）
const PAD = { jump: 0, attack: 2, dodge: 1, skill: 3, interact: 5, pause: 9, journal: 8 };
const ON = 0.15, OFF = 0.1; // スティックの遊び（中心から反応しない範囲）。押す／離す判定に差をつけて境目でぶれないようにする
export function readPads(pads, stickAll) {
  const out = { left: false, right: false, up: false, down: false, confirm: false, back: false };
  for (const k of Object.keys(PAD)) out[k] = false;
  let any = false, best = 0;
  out.ax = 0; out.ay = 0;
  for (const p of pads) {
    if (!p || (!p.connected && p.connected !== undefined)) continue;
    any = true;
    const stick = (stickAll[p.index ?? 0] ||= {}); // スティックの状態はパッドごとに持つ
    const b = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    if (Math.hypot(ax, ay) > best) { best = Math.hypot(ax, ay); out.ax = ax; out.ay = ay; } // メニュー用：いちばん倒れているスティック
    // 標準配置の十字キー
    let dl = b(14), dr = b(15), du = b(12), dd = b(13);
    // 非標準配置：十字キーが軸 6/7 に来る機種
    if (p.mapping !== 'standard' && p.axes.length >= 8) {
      dl ||= p.axes[6] < -0.5; dr ||= p.axes[6] > 0.5; du ||= p.axes[7] < -0.5; dd ||= p.axes[7] > 0.5;
    }
    const hx = (dir, v, was) => (was ? v * dir > OFF : v * dir > ON);
    stick.left = hx(-1, ax, stick.left); stick.right = hx(1, ax, stick.right);
    stick.up = hx(-1, ay, stick.up) && Math.abs(ay) > Math.abs(ax) * 0.7;
    stick.down = hx(1, ay, stick.down) && Math.abs(ay) > Math.abs(ax) * 0.7;
    out.left ||= dl || stick.left; out.right ||= dr || stick.right;
    out.up ||= du || stick.up; out.down ||= dd || stick.down;
    for (const [a, i] of Object.entries(PAD)) out[a] ||= b(i);
    out.confirm ||= b(0); out.back ||= b(1);
  }
  return any ? out : null;
}
export function pollGamepad(input) {
  const pads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? Array.from(navigator.getGamepads() || []) : [];
  input.padStick ||= {};
  const st = readPads(pads, input.padStick);
  if (!st) return false;
  input.padAxis = { x: st.ax, y: st.ay };
  for (const [a, v] of Object.entries(st)) if (a !== 'ax' && a !== 'ay') input.set(a, v, 'pad');
  return true;
}
