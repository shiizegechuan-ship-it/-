/** Sim へ渡す 1 コマ分の入力（入力元に依存しない抽象アクション） */
export interface InputFrame {
  /** -1..1：右が +、前が + （カメラ基準） */
  moveX: number;
  moveY: number;
  /** カメラの向き（rad）。移動をカメラ基準にするため */
  camYaw: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  attackPressed: boolean;
  dashPressed: boolean;
  lanternPressed: boolean;
  interactPressed: boolean;
}

export const emptyInput = (camYaw = 0): InputFrame => ({
  moveX: 0,
  moveY: 0,
  camYaw,
  jumpPressed: false,
  jumpHeld: false,
  attackPressed: false,
  dashPressed: false,
  lanternPressed: false,
  interactPressed: false,
});
