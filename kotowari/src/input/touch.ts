import type { Action, Input } from './input';

/** タッチで遊ぶための部品：左の仮想スティック、右のボタン、右半分のドラッグで見回す */
export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window || window.matchMedia?.('(pointer: coarse)').matches);

interface Btn {
  el: HTMLElement;
  act: Action;
}

export class TouchControls {
  readonly root: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private btns: Btn[] = [];
  private talk: HTMLElement;
  visible = false;

  constructor(
    private input: Input,
    parent: HTMLElement,
    onPause: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'touch hidden';
    this.stick = document.createElement('div');
    this.stick.className = 'stick';
    this.knob = document.createElement('div');
    this.knob.className = 'knob';
    this.stick.append(this.knob);
    const pad = document.createElement('div');
    pad.className = 'tpad';
    // 右手のボタン（扇形に並べる）
    const defs: [Action, string, string][] = [
      ['jump', '跳', 'b-jump'],
      ['attack', '払', 'b-attack'],
      ['dash', '駆', 'b-dash'],
      ['lantern', '灯', 'b-lantern'],
    ];
    for (const [act, label, cls] of defs) {
      const b = document.createElement('button');
      b.className = 'tbtn ' + cls;
      b.textContent = label;
      b.tabIndex = -1;
      this.bindHold(b, act);
      pad.append(b);
      this.btns.push({ el: b, act });
    }
    this.talk = document.createElement('button');
    this.talk.className = 'tbtn b-talk';
    this.talk.textContent = '話す';
    this.talk.tabIndex = -1;
    this.bindHold(this.talk, 'interact');
    const pause = document.createElement('button');
    pause.className = 'tbtn b-pause';
    pause.textContent = '≡';
    pause.tabIndex = -1;
    pause.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onPause();
    });
    this.root.append(this.stick, pad, this.talk, pause);
    parent.append(this.root);

    // スティックと見回し：画面の左 4 割で触れた所がスティックの中心。右側のドラッグは見回し
    const surface = parent;
    surface.addEventListener('pointerdown', (e) => {
      if (!this.visible || e.pointerType === 'mouse') return;
      if ((e.target as HTMLElement).closest('.tbtn, .btn, .dialog, .panel, .confirm, .title, .gameover, .ending')) return;
      if (e.clientX < window.innerWidth * 0.42 && this.stickId === null) {
        this.stickId = e.pointerId;
        this.stickOrigin = { x: e.clientX, y: e.clientY };
        this.stick.style.left = e.clientX + 'px';
        this.stick.style.top = e.clientY + 'px';
        this.stick.classList.add('on');
        this.setKnob(0, 0);
      } else if (this.lookId === null) {
        this.lookId = e.pointerId;
        this.lookLast = { x: e.clientX, y: e.clientY };
      }
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) {
        const r = this.radius();
        let dx = (e.clientX - this.stickOrigin.x) / r;
        let dy = (e.clientY - this.stickOrigin.y) / r;
        const l = Math.hypot(dx, dy);
        if (l > 1) {
          dx /= l;
          dy /= l;
        }
        this.input.touchMoveX = Math.abs(dx) < 0.12 ? 0 : dx;
        this.input.touchMoveY = Math.abs(dy) < 0.12 ? 0 : -dy;
        this.setKnob(dx, dy);
      } else if (e.pointerId === this.lookId) {
        this.input.touchLook((e.clientX - this.lookLast.x) * 1.6, (e.clientY - this.lookLast.y) * 1.6);
        this.lookLast = { x: e.clientX, y: e.clientY };
      }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) {
        this.stickId = null;
        this.input.touchMoveX = this.input.touchMoveY = 0;
        this.stick.classList.remove('on');
        this.setKnob(0, 0);
      }
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  private radius(): number {
    return Math.max(36, Math.min(window.innerWidth, window.innerHeight) * 0.13);
  }

  private setKnob(dx: number, dy: number): void {
    const r = this.radius();
    this.knob.style.transform = `translate(${dx * r * 0.7}px, ${dy * r * 0.7}px)`;
  }

  private bindHold(b: HTMLElement, act: Action): void {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.setPointerCapture?.(e.pointerId);
      b.classList.add('down');
      this.input.touchPress(act);
    });
    const up = (e: PointerEvent) => {
      e.preventDefault();
      b.classList.remove('down');
      this.input.touchRelease(act);
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', () => {
      b.classList.remove('down');
      this.input.touchRelease(act);
    });
  }

  show(on: boolean): void {
    this.visible = on;
    this.root.classList.toggle('hidden', !on);
    if (!on) {
      this.stickId = this.lookId = null;
      this.input.touchMoveX = this.input.touchMoveY = 0;
    }
  }

  /** 使えない型のボタンを暗く、「話す」は話せるときだけ */
  update(has: (a: Action) => boolean, canTalk: boolean): void {
    for (const b of this.btns) b.el.classList.toggle('off', !has(b.act));
    this.talk.classList.toggle('hidden', !canTalk);
  }
}
