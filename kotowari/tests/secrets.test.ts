import { describe, expect, it } from 'vitest';
import type { AbilityId } from '../src/core/data/abilities';
import { emptyInput } from '../src/core/input';
import { getLevel } from '../src/core/levels';
import type { ChapterId } from '../src/core/levels/types';
import { Sim, newProgress } from '../src/core/sim';

/** 指定の点から点へ歩いて（灯をともして）、着いた所を返す */
function walk(ch: ChapterId, pawned: AbilityId[], from: [number, number, number], path: [number, number][], lantern = false) {
  const sim = new Sim(getLevel, { ...newProgress(ch), ledger: { zeni: 0, debt: 0, pawned } }, 1);
  for (const t of sim.level.triggers) sim.setFlag('trig:' + t.id);
  sim.enemies = [];
  const b = sim.player.body;
  [b.x, b.y, b.z] = from;
  if (lantern) sim.player.lanternOn = true;
  for (let i = 0; i < 120; i++) sim.step(emptyInput(0));
  for (const [x, z] of path) {
    for (let f = 0; f < 240; f++) {
      const dx = x - b.x;
      const dz = z - b.z;
      if (Math.hypot(dx, dz) < 0.2) break;
      const l = Math.hypot(dx, dz);
      sim.step({ ...emptyInput(0), moveX: -dx / l, moveY: dz / l });
      sim.enemies = [];
    }
  }
  return sim;
}

describe('隠し場所（前の章の理でだけ入れる）', () => {
  const ch2path: [number, number][] = [[-5.1, 42.6], [-5.1, 48.2], [-6, 50.5]];
  it('二の章：浮石の理なら段が現れて岩棚へ登れる。跳だけでは届かない', () => {
    expect(walk('ch2', ['jump'], [-5.1, 0, 41.5], ch2path).player.body.y).toBeGreaterThan(2.9);
    expect(walk('ch2', [], [-5.1, 0, 41.5], ch2path).player.body.y).toBeLessThan(1);
  });
  it('三の章：灯をかざせば幽かな橋で面屋へ。灯が無ければ堀に落ちる', () => {
    const p: [number, number][] = [[0, 14], [-9, 14]];
    expect(walk('ch3', [], [0, 0, 9.5], p, true).player.body.x).toBeLessThan(-8.5);
    const s = walk('ch3', [], [0, 0, 9.5], p, false);
    expect(s.player.body.x).toBeGreaterThan(-8.5);
  });
  it('四の章：緩の理なら滝の幕が止まり、裏の岩棚へ入れる', () => {
    const p: [number, number][] = [[3, 71], [8, 71]];
    expect(walk('ch4', ['dash'], [0, 3, 70], p).player.body.x).toBeGreaterThan(7.5);
    expect(walk('ch4', [], [0, 3, 70], p).player.body.x).toBeLessThan(5.2);
  });
});
