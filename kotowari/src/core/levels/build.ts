import type { BoxSpec } from '../physics';
import type { LevelDef, PropDef } from './types';

/** 章データを書きやすくする補助 */
export const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat = 'stone', tag?: BoxSpec['tag']): BoxSpec => ({
  min: [x0, y0, z0],
  max: [x1, y1, z1],
  mat,
  tag,
});

/** 中心と大きさで */
export const cbox = (cx: number, y0: number, cz: number, w: number, h: number, d: number, mat = 'stone', tag?: BoxSpec['tag']): BoxSpec =>
  box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, mat, tag);

/** z 方向へ上る石段（1 段 rise・run）。戻り値は最後の段の上面の高さ */
export function stairsZ(out: BoxSpec[], cx: number, width: number, z0: number, y0: number, steps: number, rise = 0.25, run = 0.5, mat = 'stair'): number {
  for (let i = 0; i < steps; i++) {
    const top = y0 + rise * (i + 1);
    out.push(box(cx - width / 2, y0 - 2, z0 + run * i, cx + width / 2, top, z0 + run * (i + 1), mat));
  }
  return y0 + rise * steps;
}

/** 鳥居：見た目は prop、柱だけ当たりを持つ */
export function torii(out: BoxSpec[], props: PropDef[], x: number, y: number, z: number, yaw = 0, scale = 1, variant = 0): void {
  props.push({ kind: 'torii', x, y, z, yaw, scale, variant });
  const half = 1.6 * scale;
  const px = Math.cos(yaw) * half;
  const pz = -Math.sin(yaw) * half;
  const r = 0.16 * scale;
  out.push(box(x + px - r, y, z + pz - r, x + px + r, y + 3.4 * scale, z + pz + r, 'none', 'wall'));
  out.push(box(x - px - r, y, z - pz - r, x - px + r, y + 3.4 * scale, z - pz + r, 'none', 'wall'));
}

export function emptyLevel(id: LevelDef['id']): LevelDef {
  return {
    id,
    title: '',
    subtitle: '',
    theme: 'night',
    spawn: { x: 0, y: 0, z: 0, yaw: 0 },
    killY: -12,
    boxes: [],
    floats: [],
    ghosts: [],
    shadows: [],
    gates: [],
    shrines: [],
    pickups: [],
    enemies: [],
    readables: [],
    triggers: [],
    hazards: [],
    exit: null,
    props: [],
    route: [],
    hints: [],
    goals: [],
  };
}
