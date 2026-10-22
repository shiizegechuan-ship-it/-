export interface V3 {
  x: number;
  y: number;
  z: number;
}
export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** a から b へ最大 d だけ近づける */
export const approach = (a: number, b: number, d: number): number =>
  a < b ? Math.min(a + d, b) : Math.max(a - d, b);
export const len2 = (x: number, z: number): number => Math.hypot(x, z);
/** 角度を -PI..PI に */
export const wrapAngle = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const angleTo = (fromX: number, fromZ: number, toX: number, toZ: number): number =>
  Math.atan2(toX - fromX, toZ - fromZ);
