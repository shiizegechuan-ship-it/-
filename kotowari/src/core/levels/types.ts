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
  opensWhen: { law: 'fan' } | { flag: string } | { notFlag: string };
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
  /** blade：道の上で回る水車の羽根（x 軸まわり。真下に来た羽根が道を帯状に払う）。rock：上から落ちる石（影で予兆） */
  kind: 'blade' | 'rock';
  x: number;
  y: number;
  z: number;
  /** blade：腕の長さ。rock：当たる半径 */
  radius: number;
  /** 1 周（rock は 1 回の落下）の秒。緩の理で倍になる */
  period: number;
  /** 0..1 のずれ */
  phase?: number;
  /** blade の回る向き（1 / -1） */
  dir?: number;
  /** blade の幅（x 方向） */
  width?: number;
}

/** 時間制限のイベント：startFlag が立った後に startBox に入ると始まり、goal に着けば成功、間に合わなければゲームオーバー */
export interface TimerDef {
  id: string;
  label: string;
  startFlag: string;
  startBox: BoxSpec;
  goal: BoxSpec;
  duration: number;
  /** この型を質に入れている（その理が働いている）と、刻限の進みが半分 */
  slowedBy?: 'dash';
  /** 間に合わなかったときの文 */
  failText: string;
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
  timers?: TimerDef[];
  /** ボスと戦う場所（入ると戦いが始まる。きっかけの会話の後） */
  arena?: { box: BoxSpec; afterFlag: string };
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
  /** この型が質に入っているときは、こちらの点を通る（別の道） */
  alt?: { whenPawned: string; x: number; z: number };
}
