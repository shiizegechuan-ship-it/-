// 調整用の定数はすべてここに集約する。単位は px / 秒。フレーム表記は 60fps 換算。
export const F = 1 / 60; // 1フレーム
export const DT = 1 / 60; // 固定更新幅
export const TILE = 30;
export const VIEW_W = 960;
export const VIEW_H = 540;
export const ZOOM = 1.5; // 世界の表示倍率。640×360 の世界を 320×180 のドット絵に描き、3 倍で表示する

export const PLAYER = {
  w: 16,
  h: 28,
  maxHp: 100,
  runSpeed: 235,
  groundAccel: 3200,
  groundDecel: 3600,
  turnAccel: 5200, // 反転時は強めに効かせてキビキビさせる
  airAccel: 2200,
  airDecel: 1400,
  gravity: 2100,
  fallGravityMul: 1.45,
  jumpVel: 650, // 最大跳躍 ≒ 3.3 タイル
  jumpCutMul: 0.42,
  maxFall: 900,
  coyote: 6 * F,
  jumpBuffer: 8 * F,
  dodgeTime: 18 * F,
  dodgeIframes: 12 * F,
  dodgeSpeed: 430,
  dodgeCooldown: 28 * F,
  perfectWindow: 8 * F, // 被弾直前この時間内に回避するとジャスト回避
  perfectSlowTime: 0.25,
  perfectSlowScale: 0.3,
  hurtIframes: 50 * F,
  hurtStun: 14 * F,
  hurtKnockX: 260,
  hurtKnockY: -280,
  heavyCharge: 24 * F,
  gaugeMax: 100,
  gaugePerHit: 6,
  gaugePerfect: 30,
  skillCost: 50,
  skillRadius: 280,
  skillTime: 2.0,
};

// 攻撃フレームデータ（発生 / 持続 / 硬直, 次段へ移行可能になるまで）
export const ATTACKS = {
  combo1: { startup: 5 * F, active: 3 * F, recovery: 10 * F, cancel: 8 * F, dmg: 10, w: 42, h: 26, ox: 6, oy: -2, knock: 90, stop: 3 * F, lunge: 60, cat: 'combo' },
  combo2: { startup: 5 * F, active: 3 * F, recovery: 10 * F, cancel: 8 * F, dmg: 10, w: 44, h: 26, ox: 6, oy: -2, knock: 100, stop: 3 * F, lunge: 70, cat: 'combo' },
  combo3: { startup: 7 * F, active: 4 * F, recovery: 16 * F, cancel: 14 * F, dmg: 18, w: 52, h: 34, ox: 6, oy: -4, knock: 260, stop: 6 * F, lunge: 110, cat: 'combo', shake: 3 },
  combo4: { startup: 6 * F, active: 6 * F, recovery: 16 * F, cancel: 14 * F, dmg: 26, w: 70, h: 40, ox: -14, oy: -6, knock: 300, stop: 6 * F, lunge: 40, cat: 'combo', shake: 4, spin: true },
  air: { startup: 4 * F, active: 4 * F, recovery: 8 * F, cancel: 8 * F, dmg: 11, w: 44, h: 34, ox: 4, oy: 0, knock: 110, stop: 3 * F, lunge: 0, cat: 'air' },
  heavy: { startup: 6 * F, active: 5 * F, recovery: 20 * F, cancel: 18 * F, dmg: 40, w: 62, h: 40, ox: 4, oy: -6, knock: 380, stop: 7 * F, lunge: 150, cat: 'heavy', shake: 6, breaks: true },
};

export const COLORS = {
  bg0: '#0d0b14',
  bg1: '#17131f',
  stone: '#2b2533',
  stoneHi: '#4a4054',
  platform: '#6b5a44',
  player: '#e8dcc4',
  scarf: '#d24d3a',
  gold: '#f2c14e',
  goldDim: '#8c6d2a',
  haste: '#5fd18b',
  stasis: '#5aa9e6',
  echo: '#b67cf0',
  risk: '#e35d5d',
  danger: '#ff5a3c',
  text: '#efe6d2',
  muted: '#9a8fa6',
  reset: '#8a8a92',
  change: '#b67cf0',
};
