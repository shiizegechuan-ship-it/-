import { AXIS } from './input.js';
// スマホ用のタッチ操作。左に仮想スティック、右に行動ボタン。入力は 'touch' 入力源としてキーボードと合流する。
const CSS = `
#touch { position: fixed; inset: 0; pointer-events: none; z-index: 5; }
#touch > * { pointer-events: auto; }
#touch .t-hint { pointer-events: none; }
#touch { --t-bg: rgba(20,16,28,0.55); --t-line: rgba(242,193,78,0.55); --t-ink: #efe6d2; --t-on: rgba(242,193,78,0.45);
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: none; font-family: 'DotGothic16', 'Hiragino Sans', sans-serif; }
#touch .t-pad { position: absolute; width: 132px; height: 132px; border-radius: 50%; background: var(--t-bg); border: 1.5px solid var(--t-line); touch-action: none; }
#touch .t-radar { position: absolute; left: -12px; top: -12px; width: 156px; height: 156px; pointer-events: none; background: transparent !important; }
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
  // 外縁の円のうち、敵のいる方向だけを赤く灯す（どこに敵がいるかを感覚で分かるように）
  const radar = document.createElement('canvas');
  radar.className = 't-radar';
  const RS = 156, RDPR = Math.min(3, window.devicePixelRatio || 1);
  radar.width = radar.height = Math.round(RS * RDPR);
  pad.appendChild(radar);
  const rctx = radar.getContext('2d');
  let lastKey = '';
  wrap.radar = (bearings) => {
    // 変化が無ければ描き直さない（角度は 3 度刻みで比べる）
    const key = bearings.map((b) => `${Math.round(b.ang * 60)}:${Math.round(b.near * 10)}:${b.big ? 1 : 0}`).join(',');
    if (key === lastKey) return;
    lastKey = key;
    rctx.setTransform(RDPR, 0, 0, RDPR, 0, 0);
    rctx.clearRect(0, 0, RS, RS);
    const c = RS / 2, r = 66 + 1; // 外縁（132px の円の縁）の上に重ねる
    rctx.lineCap = 'round';
    for (const b of bearings) {
      const half = (b.big ? 0.42 : 0.24) + 0.16 * b.near; // 近いほど・大物ほど広く
      rctx.strokeStyle = `rgba(255,${b.big ? 40 : 70},${b.big ? 40 : 60},${(0.35 + 0.6 * b.near).toFixed(2)})`;
      rctx.lineWidth = b.big ? 7 : 3 + 3 * b.near;
      rctx.beginPath(); rctx.arc(c, c, r, b.ang - half, b.ang + half); rctx.stroke();
    }
  };
  let padId = null;
  const setDir = (dx, dy) => {
    const dead = 16;
    // 暗号の入力など（input.vertical）では、上下を広く・左右を狭く受け付ける
    const v = !!input.vertical, ax = Math.abs(dx), ay = Math.abs(dy);
    const side = v ? ax > ay * AXIS.vSide : true, upk = v ? AXIS.vUp : AXIS.side, upDead = v ? 20 : 30;
    input.set('left', dx < -dead && side, 'touch');
    input.set('right', dx > dead && side, 'touch');
    input.set('up', dy < -upDead && ay > ax * upk, 'touch');
    input.set('down', dy > upDead && ay > ax * upk, 'touch');
    const len = Math.hypot(dx, dy), max = 40, k = len > max ? max / len : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  };
  const padMove = (e) => {
    const r = pad.getBoundingClientRect();
    setDir(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  };
  // 2 本目の指がスティックに触れても、最初の指を追い続ける（指が入れ替わると、離した知らせを見失って押されたままになる）
  pad.addEventListener('pointerdown', (e) => { if (padId !== null && padId !== e.pointerId) return; padId = e.pointerId; try { pad.setPointerCapture(e.pointerId); } catch { /* 合成イベントなど */ } pad.classList.add('on'); padMove(e); e.preventDefault(); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === padId) padMove(e); });
  const padEnd = (e) => { if (e.pointerId !== padId) return; padId = null; pad.classList.remove('on'); setDir(0, 0); };
  pad.addEventListener('pointerup', padEnd);
  pad.addEventListener('pointercancel', padEnd);
  pad.addEventListener('lostpointercapture', padEnd);
  // 指がスティックの外で離れたり、OS のジェスチャで知らせが途切れたりしても、方向を押したままにしない
  window.addEventListener('pointerup', padEnd);
  window.addEventListener('pointercancel', padEnd);
  const allUp = (e) => { if (e.touches && e.touches.length === 0) { padId = null; pad.classList.remove('on'); setDir(0, 0); input.releaseSource('touch'); for (const { el } of btnEls) el.classList.remove('on'); } };
  window.addEventListener('touchend', allUp, { passive: true });
  window.addEventListener('touchcancel', allUp, { passive: true });

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
