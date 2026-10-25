import type { EnemyType } from '../levels/types';

export interface EnemyDef {
  name: string;
  hp: number;
  halfW: number;
  height: number;
  speed: number;
  aggro: number; // 気づく距離
  range: number; // 攻撃を始める距離
  windup: number; // 予兆（この間に光る）
  active: number; // 攻撃の持続
  recover: number; // 硬直
  lunge: number; // 攻撃中の前進速度
  hitRadius: number; // 攻撃の当たり（前方の円）
  hitReach: number; // 体の中心から当たりの中心まで
  aoe: boolean; // 自分の周り全体
  damage: number;
  knock: number;
  drop: number; // 落とす銭（初回だけ）
  /** 浮石の理で浮く（重い妖） */
  heavy: boolean;
  /** 扇が効かない */
  fanImmune: boolean;
  /** 風の理で流される強さ（0 で流れない） */
  windMul: number;
  /** 灯で退く */
  fearsLight: boolean;
  /** 影の理が無いと扇がすり抜ける */
  needsShadowLaw: boolean;
  staggerTime: number;
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  kamimen: {
    name: '紙の面',
    hp: 1,
    halfW: 0.3,
    height: 1.4,
    speed: 0,
    aggro: 0,
    range: 0,
    windup: 99,
    active: 0,
    recover: 0,
    lunge: 0,
    hitRadius: 0,
    hitReach: 0,
    aoe: false,
    damage: 0,
    knock: 0,
    drop: 3,
    heavy: false,
    fanImmune: false,
    windMul: 0,
    fearsLight: false,
    needsShadowLaw: false,
    staggerTime: 0,
  },
  menyo: {
    name: '面の妖',
    hp: 3,
    halfW: 0.3,
    height: 1.3,
    speed: 2.7,
    aggro: 8.5,
    range: 2.3,
    windup: 0.55,
    active: 0.28,
    recover: 0.75,
    lunge: 8.5,
    hitRadius: 0.65,
    hitReach: 0.55,
    aoe: false,
    damage: 1,
    knock: 6,
    drop: 4,
    heavy: false,
    fanImmune: false,
    windMul: 1,
    fearsLight: false,
    needsShadowLaw: false,
    staggerTime: 0.32,
  },
  ishibozu: {
    name: '石坊主',
    hp: 6,
    halfW: 0.5,
    height: 1.8,
    speed: 1.35,
    aggro: 7,
    range: 2.0,
    windup: 0.95,
    active: 0.14,
    recover: 1.15,
    lunge: 0,
    hitRadius: 2.3,
    hitReach: 0,
    aoe: true,
    damage: 1,
    knock: 9,
    drop: 9,
    heavy: true,
    fanImmune: false,
    windMul: 0.15,
    fearsLight: false,
    needsShadowLaw: false,
    staggerTime: 0.18,
  },
  yoroimen: {
    name: '鎧面',
    hp: 4,
    halfW: 0.38,
    height: 1.6,
    speed: 2.0,
    aggro: 8,
    range: 2.1,
    windup: 0.7,
    active: 0.22,
    recover: 0.9,
    lunge: 6,
    hitRadius: 0.8,
    hitReach: 0.7,
    aoe: false,
    damage: 1,
    knock: 7,
    drop: 7,
    heavy: false,
    fanImmune: true,
    windMul: 2.2,
    fearsLight: false,
    needsShadowLaw: false,
    staggerTime: 0.2,
  },
  kageboshi: {
    name: '影法師',
    hp: 3,
    halfW: 0.3,
    height: 1.5,
    speed: 3.0,
    aggro: 9,
    range: 1.9,
    windup: 0.45,
    active: 0.25,
    recover: 0.6,
    lunge: 7,
    hitRadius: 0.6,
    hitReach: 0.5,
    aoe: false,
    damage: 1,
    knock: 5,
    drop: 6,
    heavy: false,
    fanImmune: false,
    windMul: 0.8,
    fearsLight: true,
    needsShadowLaw: true,
    staggerTime: 0.3,
  },
  mizuko: {
    name: '水子提灯',
    hp: 2,
    halfW: 0.3,
    height: 1.0,
    speed: 2.2,
    aggro: 10,
    range: 5.5,
    windup: 0.7,
    active: 0.55,
    recover: 0.9,
    lunge: 11,
    hitRadius: 0.6,
    hitReach: 0.4,
    aoe: false,
    damage: 1,
    knock: 6,
    drop: 5,
    heavy: false,
    fanImmune: false,
    windMul: 1.2,
    fearsLight: false,
    needsShadowLaw: false,
    staggerTime: 0.3,
  },
  yomori: {
    name: '夜守',
    hp: 40,
    halfW: 0.55,
    height: 2.2,
    speed: 3.2,
    aggro: 30,
    range: 3.0,
    windup: 0.7,
    active: 0.3,
    recover: 0.8,
    lunge: 9,
    hitRadius: 1.2,
    hitReach: 1.0,
    aoe: false,
    damage: 1,
    knock: 8,
    drop: 0,
    heavy: false,
    fanImmune: false,
    windMul: 0.2,
    fearsLight: false,
    needsShadowLaw: false,
    staggerTime: 0.12,
  },
};
