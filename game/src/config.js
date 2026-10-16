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
  maxHp: 150, // 初期HP（3 倍は緩すぎたので半分に）
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
  airJumps: 1, // 空中ジャンプの回数（2段ジャンプ）
  airJumpVel: 590,
  coyote: 6 * F,
  jumpBuffer: 8 * F,
  dodgeTime: 18 * F,
  dodgeIframes: 12 * F,
  dodgeSpeed: 430,
  dodgeCooldown: 28 * F,
  perfectWindow: 8 * F, // 被弾直前この時間内に回避するとジャスト回避
  parryWindow: 0.3, // 回避が終わってからこの時間内の攻撃はパリィ斬り
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
  skillCost: 75,
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
  // パリィ斬り：回避の直後に攻撃。範囲が広く、当たれば必ず会心
  parry: { startup: 3 * F, active: 6 * F, recovery: 12 * F, cancel: 12 * F, dmg: 16, w: 80, h: 50, ox: -6, oy: -6, knock: 240, stop: 7 * F, lunge: 120, cat: 'combo', shake: 5, parry: true },
  // 方向攻撃（↑＋攻撃／↓＋攻撃）。dir:'up'/'down' は頭上・足元に、体ごと覆う判定を出す
  up: { startup: 4 * F, active: 5 * F, recovery: 11 * F, cancel: 10 * F, dmg: 12, w: 50, h: 46, dir: 'up', knock: 50, lift: 460, stop: 4 * F, lunge: 20, cat: 'combo', shake: 2 },
  upAir: { startup: 4 * F, active: 5 * F, recovery: 9 * F, cancel: 9 * F, dmg: 12, w: 50, h: 46, dir: 'up', knock: 50, lift: 360, stop: 4 * F, lunge: 0, cat: 'air', shake: 2 },
  // 空中の下突き：当たると跳ね上がる（敵を踏み台にできる）
  down: { startup: 3 * F, active: 9 * F, recovery: 8 * F, cancel: 8 * F, dmg: 14, w: 40, h: 40, dir: 'down', knock: 60, stop: 4 * F, lunge: 0, cat: 'air', shake: 3, bounce: 560 },
  // 地上の足払い：低く長い薙ぎ払い
  sweep: { startup: 5 * F, active: 4 * F, recovery: 12 * F, cancel: 11 * F, dmg: 13, w: 54, h: 18, ox: 4, oy: 6, knock: 180, lift: 220, stop: 4 * F, lunge: 90, cat: 'combo', shake: 2 },
  // すり抜け床から降りながらの回転斬り（↓で降りる）：体ごと 2 回転し、周り全部を斬る
  dropSpin: { startup: 2 * F, active: 16 * F, recovery: 6 * F, cancel: 6 * F, dmg: 12, w: 64, h: 46, ox: 0, oy: 0, knock: 150, stop: 3 * F, lunge: 0, cat: 'air', shake: 2, spin: true, multi: 0.13 },
  heavy: { startup: 6 * F, active: 5 * F, recovery: 20 * F, cancel: 18 * F, dmg: 40, w: 62, h: 40, ox: 4, oy: -6, knock: 380, stop: 7 * F, lunge: 150, cat: 'heavy', shake: 6, breaks: true },
};

// 難易度。普通がこれまでの調整。上がるほど敵の行動パターン（段階）・戦略（陣形・対策・回避）・数が増える
export const DIFFICULTY = {
  easy: { id: 'easy', name: '簡単', hp: 0.8, dmg: 0.7, tierAdd: -1, windup: 1.3, speed: 0.92, extra: -1, strategy: false, guards: 1, guardWave: 0, goldMul: 2, color: '#8fe0a0' },
  normal: { id: 'normal', name: '普通', hp: 1, dmg: 1, tierAdd: 0, windup: 1, speed: 1, extra: 0, strategy: true, guards: 2, guardWave: 1, goldMul: 1.25, color: '#efe6d2' },
  hard: { id: 'hard', name: '難しい', hp: 1.15, dmg: 1.15, tierAdd: 1, windup: 0.9, speed: 1.06, extra: 1, strategy: 'always', guards: 3, guardWave: 2, goldMul: 1.25, color: '#ff8a6a' },
};
  // 激ムズ：攻撃までの間隔がさらに短く、雑魚は構えて主人公の攻撃をパリィして跳ね返す（重撃か背後なら通る）。
  // ときどき床全体が震える（赤く光ったら跳べば当たらない）
DIFFICULTY.nightmare = { id: 'nightmare', name: '激ムズ', hp: 1.5, dmg: 1.55, tierAdd: 1, windup: 0.7, speed: 1.15, extra: 2, strategy: 'always', guards: 4, guardWave: 3, parry: true, quake: true, goldMul: 1.25, color: '#ff4a9a' };
// めちゃ簡単：敵はさらに弱く、通常攻撃を押すと主人公が回転しながら近くの敵へ飛び込んでから斬る（通常攻撃は必中）。斬撃波を最初から持つ
DIFFICULTY.veryeasy = { id: 'veryeasy', name: 'めちゃ簡単', hp: 0.6, dmg: 0.5, tierAdd: -1, windup: 1.5, speed: 0.85, extra: -1, strategy: false, guards: 1, guardWave: 0, autoAim: true, startWave: true, carryAll: true, platforms: true, goldMul: 3, color: '#a8f0ff' };
DIFFICULTY.easy.startWave = true; // 簡単も斬撃波を最初から持つ
export const DIFF_ORDER = ['veryeasy', 'easy', 'normal', 'hard', 'nightmare'];

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
