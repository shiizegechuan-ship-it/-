/** キーボード・マウス・ゲームパッドを抽象アクションにまとめる。押した瞬間はイベントの時点で記録して取りこぼさない。 */
export type Action = 'up' | 'down' | 'left' | 'right' | 'jump' | 'attack' | 'dash' | 'lantern' | 'interact' | 'camL' | 'camR' | 'pause' | 'confirm' | 'cancel' | 'debug';

const KEYMAP: Record<string, Action[]> = {
  KeyW: ['up'],
  ArrowUp: ['up'],
  KeyS: ['down'],
  ArrowDown: ['down'],
  KeyA: ['left'],
  ArrowLeft: ['left'],
  KeyD: ['right'],
  ArrowRight: ['right'],
  Space: ['jump', 'confirm'],
  KeyJ: ['attack'],
  KeyK: ['dash'],
  ShiftLeft: ['dash'],
  ShiftRight: ['dash'],
  KeyL: ['lantern'],
  KeyF: ['lantern'],
  KeyE: ['interact', 'confirm'],
  Enter: ['confirm', 'interact'],
  KeyZ: ['confirm'],
  KeyQ: ['camL'],
  KeyR: ['camR'],
  Escape: ['pause', 'cancel'],
  KeyP: ['pause'],
  KeyX: ['cancel'],
  Backspace: ['cancel'],
  F2: ['debug'],
};

export class Input {
  private held = new Set<Action>();
  private pressed = new Set<Action>();
  private keyHeld = new Map<string, Action[]>();
  mouseDX = 0;
  mouseDY = 0;
  private dragging = false;
  pointerLocked = false;
  /** 直近に使った入力元（表示の切り替え用） */
  lastDevice: 'keyboard' | 'pad' = 'keyboard';
  private padPrev = new Map<number, boolean>();
  padMoveX = 0;
  padMoveY = 0;
  padCamX = 0;
  padCamY = 0;

  constructor(private target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      const acts = KEYMAP[e.code];
      if (!acts) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Backspace' || e.code === 'F2') e.preventDefault();
      if (e.repeat) return;
      this.lastDevice = 'keyboard';
      this.keyHeld.set(e.code, acts);
      for (const a of acts) {
        this.held.add(a);
        this.pressed.add(a);
      }
    });
    window.addEventListener('keyup', (e) => {
      const acts = this.keyHeld.get(e.code);
      if (!acts) return;
      this.keyHeld.delete(e.code);
      this.recomputeHeld();
    });
    const release = () => this.releaseAll();
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) release();
    });
    target.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.pressed.add('attack');
        this.held.add('attack');
        this.lastDevice = 'keyboard';
      }
      if (e.button === 2 || e.button === 1) this.dragging = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.recomputeHeld();
      if (e.button === 2 || e.button === 1) this.dragging = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked || this.dragging) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === target;
    });
  }

  private recomputeHeld(): void {
    this.held.clear();
    for (const acts of this.keyHeld.values()) for (const a of acts) this.held.add(a);
  }

  releaseAll(): void {
    this.keyHeld.clear();
    this.held.clear();
    this.dragging = false;
    this.mouseDX = this.mouseDY = 0;
  }

  requestLock(): void {
    try {
      const r = this.target.requestPointerLock?.() as unknown;
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
    } catch {
      /* 使えない環境 */
    }
  }
  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** ゲームパッド（標準配列）を読む。毎フレーム 1 回 */
  pollPad(): void {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = Array.from(pads).find((p) => p && p.connected);
    this.padMoveX = this.padMoveY = this.padCamX = this.padCamY = 0;
    if (!pad) return;
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    this.padMoveX = dz(pad.axes[0] ?? 0);
    this.padMoveY = -dz(pad.axes[1] ?? 0);
    this.padCamX = dz(pad.axes[2] ?? 0);
    this.padCamY = dz(pad.axes[3] ?? 0);
    const map: [number, Action[]][] = [
      [0, ['jump', 'confirm']],
      [2, ['attack']],
      [1, ['dash', 'cancel']],
      [5, ['dash']],
      [3, ['interact']],
      [4, ['lantern']],
      [9, ['pause']],
      [12, ['up']],
      [13, ['down']],
      [14, ['left']],
      [15, ['right']],
    ];
    let any = Math.abs(this.padMoveX) + Math.abs(this.padMoveY) > 0;
    for (const [i, acts] of map) {
      const down = !!pad.buttons[i]?.pressed;
      const prev = this.padPrev.get(i) ?? false;
      if (down && !prev) for (const a of acts) this.pressed.add(a);
      if (down) {
        any = true;
        for (const a of acts) this.held.add(a);
      } else if (prev) this.recomputeHeld();
      this.padPrev.set(i, down);
    }
    if (any) this.lastDevice = 'pad';
  }

  isHeld(a: Action): boolean {
    return this.held.has(a);
  }
  /** 押された瞬間（1 度だけ取り出す） */
  take(a: Action): boolean {
    if (this.pressed.has(a)) {
      this.pressed.delete(a);
      return true;
    }
    return false;
  }
  peek(a: Action): boolean {
    return this.pressed.has(a);
  }
  clearPressed(): void {
    this.pressed.clear();
  }
  moveVector(): { x: number; y: number } {
    let x = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
    let y = (this.held.has('up') ? 1 : 0) - (this.held.has('down') ? 1 : 0);
    if (Math.abs(this.padMoveX) + Math.abs(this.padMoveY) > 0) {
      x = this.padMoveX;
      y = this.padMoveY;
    }
    return { x, y };
  }
  takeMouse(): { dx: number; dy: number } {
    const r = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = this.mouseDY = 0;
    return r;
  }
}
