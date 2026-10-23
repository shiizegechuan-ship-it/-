/** 操作感・戦闘の調整値。数値はここに集約する（単位：m・秒）。 */
export const DT = 1 / 60;

export const PLAYER = {
  halfW: 0.24,
  height: 1.45,
  runSpeed: 5.4,
  accelGround: 46,
  decelGround: 58,
  accelAir: 16,
  turnRate: 16, // 向きの追従（rad/s 相当の係数）
  gravity: 27,
  fallGravityMul: 1.35, // 落ちる時は重く（ふわつきを抑える）
  maxFall: 24,
  jumpVel: 9.4,
  jumpCutMul: 0.45, // 早く離すと上昇を切る
  coyote: 0.1,
  jumpBuffer: 0.12,
  stepUp: 0.34, // 自動で上れる段差
  maxHp: 5,
  hurtTime: 0.35,
  invulnAfterHurt: 1.0,
  hurtKnock: 6.5,
  fallDamage: 1,
};

export const DASH = {
  speed: 13.5,
  time: 0.2,
  iframes: 0.2,
  cooldown: 0.42,
  /** 駆け出してからこの時間内に攻撃を受け流すと「見切り」（タイムスライス） */
  perfectWindow: 0.12,
  perfectCooldown: 2.0, // 見切りの演出が続けて起きすぎないように
};

export interface SwingDef {
  startup: number;
  active: number;
  recovery: number;
  range: number;
  arcDeg: number;
  damage: number;
  lunge: number; // 振る間の前進速度
  knock: number;
}
export const ATTACK = {
  buffer: 0.15,
  comboWindow: 0.22, // recovery 中のこの時間に押すと次の段へ
  swings: [
    { startup: 0.05, active: 0.08, recovery: 0.16, range: 1.55, arcDeg: 130, damage: 1, lunge: 2.5, knock: 3.5 },
    { startup: 0.05, active: 0.08, recovery: 0.16, range: 1.55, arcDeg: 130, damage: 1, lunge: 2.5, knock: 3.5 },
    { startup: 0.09, active: 0.1, recovery: 0.3, range: 1.9, arcDeg: 200, damage: 2, lunge: 5, knock: 8 },
  ] as SwingDef[],
  hitstop: 0.055,
  hitstopHeavy: 0.09,
  perfectBonusMul: 2, // 見切りの後の一撃
};

export const LANTERN = {
  radius: 4.6,
  repelRadius: 3.2,
};

export const ECON = {
  /** 請け出し（買い戻し）は質入れ値のこの倍率（切り上げ） */
  redeemMul: 1.25,
};

export const CAMERA = {
  distance: 6.2,
  height: 2.6,
  lookHeight: 1.0,
  fov: 50,
  yawSpeed: 2.6, // キーでの旋回 rad/s
  mouseSens: 0.0042,
  autoReturnDelay: 1.6,
  autoReturnRate: 1.4,
  pitchMin: -0.15,
  pitchMax: 0.9,
  pitchDefault: 0.32,
};

export const WORLD = {
  slowLawTimeScale: 0.5,
  /** 風の中で立ち止まったときに受ける風の割合（踏ん張る） */
  windBrace: 0.25,
  shrineRadius: 2.6, // 妖はこの内側へ入らない（伏線 F7）
  interactRadius: 1.6,
  pickupRadius: 0.9,
};
