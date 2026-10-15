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
  pressed(a) { return (this.cur[a] && !this.prev[a]) || !!(this.pressedNow && this.pressedNow[a]); }
  released(a) { return !this.cur[a] && this.prev[a]; }
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

// 標準マッピングのゲームパッド
const PAD = { jump: 0, attack: 2, dodge: 1, skill: 3, interact: 5, pause: 9, journal: 8 };
export function pollGamepad(input) {
  const pads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : [];
  const p = pads && Array.from(pads).find((x) => x);
  if (!p) return false;
  const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
  const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
  input.set('left', b(14) || ax < -0.4, 'pad');
  input.set('right', b(15) || ax > 0.4, 'pad');
  input.set('up', b(12) || ay < -0.5, 'pad');
  input.set('down', b(13) || ay > 0.5, 'pad');
  for (const [a, i] of Object.entries(PAD)) input.set(a, b(i), 'pad');
  input.set('confirm', b(0), 'pad');
  input.set('back', b(1), 'pad');
  return true;
}
