import { emptyInput, type InputFrame } from '../src/core/input';
import { box, emptyLevel } from '../src/core/levels/build';
import type { LevelDef } from '../src/core/levels/types';
import { Sim, newProgress, type Progress } from '../src/core/sim';

/** 平らな床だけの試験場 */
export function flatLevel(mod?: (l: LevelDef) => void): LevelDef {
  const l = emptyLevel('prologue');
  l.boxes.push(box(-30, -1, -30, 30, 0, 30, 'stone'));
  l.spawn = { x: 0, y: 0, z: 0, yaw: 0 };
  mod?.(l);
  return l;
}

export function simOn(level: LevelDef, progress?: Partial<Progress>, seed = 1): Sim {
  const p = { ...newProgress(level.id), ...progress };
  return new Sim(() => level, p, seed);
}

export function run(sim: Sim, frames: number, inp: Partial<InputFrame> | ((f: number) => Partial<InputFrame>) = {}): void {
  for (let i = 0; i < frames; i++) {
    const part = typeof inp === 'function' ? inp(i) : inp;
    sim.step({ ...emptyInput(0), ...part });
  }
}

export const settle = (sim: Sim) => run(sim, 30);
