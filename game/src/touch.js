// スマホ用のタッチ操作。左に仮想スティック、右に行動ボタン。入力は 'touch' 入力源としてキーボードと合流する。
const CSS = `
#touch { position: fixed; inset: 0; pointer-events: none; z-index: 5; }
#touch > * { pointer-events: auto; }
#touch .t-hint { pointer-events: none; }
#touch { --t-bg: rgba(20,16,28,0.55); --t-line: rgba(242,193,78,0.55); --t-ink: #efe6d2; --t-on: rgba(242,193,78,0.45);
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: none; font-family: 'DotGothic16', 'Hiragino Sans', sans-serif; }
#touch .t-pad { position: absolute; width: 132px; height: 132px; border-radius: 50%; background: var(--t-bg); border: 1.5px solid var(--t-line); touch-action: none; }
#touch .t-knob { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%; background: rgba(239,230,210,0.35); pointer-events: none; }
#touch .t-btn { position: absolute; border-radius: 50%; background: var(--t-bg); border: 2px solid var(--t-line); color: var(--t-ink);
  display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; touch-action: none; }
#touch .t-btn.on, #touch .t-pad.on { background: var(--t-on); }
#touch .t-btn small { display: block; font-size: 9px; font-weight: 400; opacity: 0.75; }
#touch .t-btn span { text-align: center; line-height: 1.1; }
#touch .t-top { position: absolute; border-radius: 10px; width: 56px; height: 32px; font-size: 11px; }
#touch .t-hint { position: absolute; left: 0; right: 0; text-align: center; font-size: 11px; color: rgba(239,230,210,0.6); pointer-events: none; }
`;

const BUTTONS = [
  { act: 'attack', label: '攻撃', sub: '長押し 重撃', size: 78, right: 18, bottom: 24 },
  { act: 'jump', alias: 'confirm', label: '跳ぶ', sub: '決定', size: 64, right: 108, bottom: 14 },
  { act: 'dodge', alias: 'back', label: '回避', sub: '戻る', size: 58, right: 112, bottom: 92 },
  { act: 'skill', label: '時歪', size: 50, right: 30, bottom: 116 },
  { act: 'interact', label: '調べる', size: 46, right: 180, bottom: 70 },
];

export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
}

export function setupTouch(input, root) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const wrap = document.createElement('div');
  wrap.id = 'touch';
  root.appendChild(wrap);

  // 仮想スティック（指を滑らせて方向を変えられる）
  const pad = document.createElement('div');
  pad.className = 't-pad';
  const knob = document.createElement('div');
  knob.className = 't-knob';
  pad.appendChild(knob);
  wrap.appendChild(pad);
  let padId = null;
  const setDir = (dx, dy) => {
    const dead = 16;
    input.set('left', dx < -dead, 'touch');
    input.set('right', dx > dead, 'touch');
    input.set('up', dy < -30 && Math.abs(dy) > Math.abs(dx) * 0.7, 'touch');
    input.set('down', dy > 30 && Math.abs(dy) > Math.abs(dx) * 0.7, 'touch');
    const len = Math.hypot(dx, dy), max = 40, k = len > max ? max / len : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  };
  const padMove = (e) => {
    const r = pad.getBoundingClientRect();
    setDir(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  };
  pad.addEventListener('pointerdown', (e) => { padId = e.pointerId; try { pad.setPointerCapture(e.pointerId); } catch { /* 合成イベントなど */ } pad.classList.add('on'); padMove(e); e.preventDefault(); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === padId) padMove(e); });
  const padEnd = (e) => { if (e.pointerId !== padId) return; padId = null; pad.classList.remove('on'); setDir(0, 0); };
  pad.addEventListener('pointerup', padEnd);
  pad.addEventListener('pointercancel', padEnd);
  pad.addEventListener('lostpointercapture', padEnd);

  const btnEls = [];
  const addBtn = (b, cls = 't-btn') => {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = `<span>${b.label}${b.sub ? `<small>${b.sub}</small>` : ''}</span>`;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', b.label);
    const on = (v) => {
      input.set(b.act, v, 'touch');
      if (b.alias) input.set(b.alias, v, 'touch');
      el.classList.toggle('on', v);
    };
    el.addEventListener('pointerdown', (e) => { try { el.setPointerCapture(e.pointerId); } catch { /* 合成イベントなど */ } on(true); e.preventDefault(); if (navigator.vibrate) try { navigator.vibrate(8); } catch { /* 振動は任意 */ } });
    el.addEventListener('pointerup', () => on(false));
    el.addEventListener('pointercancel', () => on(false));
    el.addEventListener('lostpointercapture', () => on(false));
    wrap.appendChild(el);
    btnEls.push({ el, b });
    return el;
  };
  for (const b of BUTTONS) addBtn(b);
  const pauseBtn = addBtn({ act: 'pause', label: '中断' }, 't-btn t-top');
  const journalBtn = addBtn({ act: 'journal', label: '記録帳' }, 't-btn t-top');
  const hint = document.createElement('div');
  hint.className = 't-hint';
  hint.textContent = '横向きにすると画面が大きくなります';
  wrap.appendChild(hint);

  // 縦向き：ゲーム画面の下に操作盤。横向き：画面の左右に重ねる。
  const layout = () => {
    const portrait = window.innerHeight > window.innerWidth;
    document.body.classList.toggle('touch-portrait', portrait);
    document.body.classList.toggle('touch-landscape', !portrait);
    const insetB = 'env(safe-area-inset-bottom, 0px)';
    const sideL = 'max(16px, env(safe-area-inset-left, 0px))', sideR = 'max(16px, env(safe-area-inset-right, 0px))';
    Object.assign(pad.style, { left: sideL, bottom: `calc(${portrait ? 40 : 18}px + ${insetB})` });
    for (const { el, b } of btnEls) {
      if (!b.size) continue;
      Object.assign(el.style, { width: `${b.size}px`, height: `${b.size}px`, right: `calc(${sideR} + ${b.right - 16}px)`, bottom: `calc(${b.bottom + (portrait ? 26 : 4)}px + ${insetB})` });
    }
    const topRow = `calc(${(portrait ? 40 : 18) + 142}px + ${insetB})`;
    Object.assign(pauseBtn.style, { left: sideL, bottom: topRow });
    Object.assign(journalBtn.style, { left: `calc(${sideL} + 64px)`, bottom: topRow });
    hint.style.display = portrait ? 'block' : 'none';
    hint.style.bottom = `calc(8px + ${insetB})`;
    for (const el of wrap.querySelectorAll('.t-btn, .t-pad')) el.style.opacity = portrait ? '1' : '0.8';
  };
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);
  layout();
  return wrap;
}
