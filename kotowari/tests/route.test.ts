import { describe, expect, it } from 'vitest';
import { RouteBot } from '../src/core/bot/routeBot';
import { getLevel } from '../src/core/levels';
import type { ChapterId } from '../src/core/levels/types';
import { Sim, newProgress, type Progress } from '../src/core/sim';

export function playChapter(id: ChapterId, progress?: Partial<Progress>, skill = 1, maxSec = 400, seed = 7) {
  const sim = new Sim(getLevel, { ...newProgress(id), ...progress }, seed);
  const bot = new RouteBot(sim, skill);
  let exit: string | null = null;
  const deaths: number[] = [];
  let f = 0;
  for (; f < maxSec * 60 && !exit; f++) {
    sim.step(bot.next());
    for (const e of sim.drain()) {
      if (e.t === 'exit') exit = e.to;
      if (e.t === 'dead') deaths.push(f);
    }
  }
  return { sim, bot, exit, deaths, sec: f / 60 };
}

describe('道しるべボットで章を通す', () => {
  it('序章：鐘・面の妖・おこんの会話を経て、石段へ抜ける', () => {
    const r = playChapter('prologue');
    if (!r.exit) console.log(r.bot.log.join('\n'), r.sim.player.body, r.sim.progress.flags);
    expect(r.exit).toBe('ch1');
    expect(r.sim.flag('trig:pro_okon')).toBe(true);
  });

  it('一の章：跳を質に入れて谷を渡り、請け出して柵を越え、山門へ', () => {
    const r = playChapter('ch1', { ledger: { zeni: 7, debt: 0, pawned: [] } });
    if (!r.exit) console.log(r.bot.log.join('\n'), r.sim.player.body, r.sim.ledger);
    expect(r.exit).toBe('ch2');
    expect(r.sim.flag('law:jump')).toBe(true);
    expect(r.sim.flag('redeemed:jump')).toBe(true);
  });

  it('二の章：払を質に入れて風車門を開け、風の尾根と吊り橋を渡り、宿場口へ', () => {
    const r = playChapter('ch2', { ledger: { zeni: 20, debt: 0, pawned: [] } });
    if (!r.exit) console.log(r.bot.log.join('\n'), r.sim.player.body, r.sim.ledger, r.deaths);
    expect(r.exit).toBe('ch3');
    expect(r.sim.flag('law:fan')).toBe(true);
    expect(r.sim.flag('trig:c2_yasuke')).toBe(true);
  });
});
