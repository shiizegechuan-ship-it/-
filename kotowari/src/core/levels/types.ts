import type { BoxSpec } from '../physics';

export type ChapterId = 'prologue' | 'ch1' | 'ch2' | 'ch3' | 'ch4' | 'finale';

export type EnemyType = 'kamimen' | 'menyo' | 'ishibozu' | 'yoroimen' | 'kageboshi' | 'mizuko' | 'yomori';

export interface FloatDef {
  id: string;
  box: BoxSpec;
  lift: number; // 浮石の理で上がる高さ
  delay?: number; // 上がり始めるまでの遅れ（順に浮く演出）
}

export interface GateDef {
  id: string;
  box: BoxSpec;
  /** 開く条件：風の理が働いている／旗が立っている */
  opensWhen: { law: 'fan' } | { flag: string };
}

export interface ShrineDef {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  name: string;
  shop: boolean; // おこんがいる
  /** 質屋の台を鳥居のどちら側に置くか（1：鳥居の右手、-1：左手） */
  stallSide?: 1 | -1;
  /** 台の位置と向き（指定すると stallSide より優先。向きは台の正面） */
  stall?: { x: number; z: number; yaw: number };
}

export interface PickupDef {
  id: string;
  x: number;
  y: number;
  z: number;
  value: number;
}

export interface EnemySpawn {
  id: string;
  type: EnemyType;
  x: number;
  y: number;
  z: number;
  yaw?: number;
  /** 旗が立つまで出ない */
  needFlag?: string;
}

export interface ReadableDef {
  id: string;
  x: number;
  y: number;
  z: number;
  script: string;
  label: string;
}

export interface TriggerDef {
  id: string;
  box: BoxSpec;
  script: string;
  needFlag?: string;
  unlessFlag?: string;
}

export interface PropDef {
  kind: string;
  x: number;
  y: number;
  z: number;
  yaw?: number;
  scale?: number;
  variant?: number;
}

export interface HazardDef {
  id: string;
  kind: 'blade' | 'rock';
  x: number;
  y: number;
  z: number;
  radius: number;
  period: number; // 1 周の秒（緩の理で倍）
  phase?: number;
}

export interface LevelDef {
  id: ChapterId;
  title: string;
  subtitle: string;
  theme: string; // 描画の色調
  spawn: { x: number; y: number; z: number; yaw: number };
  killY: number;
  boxes: BoxSpec[];
  floats: FloatDef[];
  ghosts: BoxSpec[]; // 灯で見える幽かな橋
  shadows: BoxSpec[]; // 影の理で踏める影
  gates: GateDef[];
  wind?: { x: number; z: number; strength: number };
  shrines: ShrineDef[];
  pickups: PickupDef[];
  enemies: EnemySpawn[];
  readables: ReadableDef[];
  triggers: TriggerDef[];
  hazards: HazardDef[];
  exit: { box: BoxSpec; to: ChapterId | 'ending' } | null;
  props: PropDef[];
  /** 章題の画面で見せる景色（カメラの位置と注目点） */
  establish?: { from: [number, number, number]; to: [number, number, number] };
  /** ボットと到達可能性テスト用の道しるべ（順に通る点と、そこで要る行動） */
  route: RouteNode[];
  /** 操作の案内（その範囲に入ると出る） */
  hints: { box: BoxSpec; text: string; needFlag?: string; unlessFlag?: string }[];
  /** 目標表示（旗ごと） */
  goals: { unlessFlag?: string; needFlag?: string; text: string }[];
}

export interface RouteNode {
  x: number;
  y: number;
  z: number;
  /** この点へ向かう間に必要な行動 */
  act?: 'jump' | 'shop' | 'read' | 'fight' | 'lantern' | 'wait' | 'talk';
  /** shop のとき：質入れ／請け出しする型 */
  pawn?: string[];
  redeem?: string[];
  /** wait のときの秒 */
  wait?: number;
  /** 到着とみなす半径 */
  r?: number;
}
