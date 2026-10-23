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
  for (; f < maxSec * 60 && !exit && !(id === 'finale' && sim.flag('read:fin_stele')); f++) {
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

  it('三の章：灯で幽かな橋を渡り、日記を読み、灯を質に入れて影の橋を渡り、請け出して最後の堀へ', () => {
    const r = playChapter('ch3', { ledger: { zeni: 60, debt: 0, pawned: [] } });
    if (!r.exit) console.log(r.bot.log.join('\n'), r.sim.player.body, r.sim.ledger, r.deaths, r.sim.enemies.map((e) => e.id + ':' + e.mode));
    expect(r.exit).toBe('ch4');
    expect(r.sim.flag('read:c3_diary')).toBe(true);
    expect(r.sim.flag('law:lantern')).toBe(true);
    expect(r.sim.flag('redeemed:lantern')).toBe(true);
  });

  it('四の章：駆を質に入れて緩の理で水車と落石を抜け、請人の真相を聞き、山頂の石段へ', () => {
    const r = playChapter('ch4', { ledger: { zeni: 40, debt: 0, pawned: [] } });
    if (!r.exit) console.log(r.bot.log.join('\n'), r.sim.player.body, r.sim.ledger, r.deaths);
    expect(r.exit).toBe('finale');
    expect(r.sim.flag('trig:c4_contract')).toBe(true);
    expect(r.deaths.length).toBe(0);
  });

  it('四の章（駆を手放さない）：時機を見て水車と落石を抜ける', () => {
    const sim = new Sim(getLevel, { ...newProgress('ch4'), ledger: { zeni: 40, debt: 0, pawned: [] } }, 3);
    const bot = new RouteBot(sim, 1, () => ({}));
    let exit: string | null = null;
    let hits = 0;
    for (let f = 0; f < 400 * 60 && !exit; f++) {
      sim.step(bot.next());
      for (const e of sim.drain()) {
        if (e.t === 'exit') exit = e.to;
        if (e.t === 'hazardHit') hits++;
      }
    }
    expect(exit).toBe('finale');
    expect(sim.has('dash')).toBe(true);
    expect(hits).toBeLessThanOrEqual(2);
  });

  it('終章：夜守を鎮め、碑の足元を読む', () => {
    const r = playChapter('finale', { ledger: { zeni: 30, debt: 0, pawned: [] } }, 1, 600);
    console.log('終章', r.sec.toFixed(0), '秒 倒れた回数', r.deaths.length);
    const done = () => r.sim.flag('read:fin_stele');
    if (!done()) console.log(r.bot.log.join('\n'), r.sim.player.body, r.deaths, r.sim.boss?.hp, r.sim.boss?.mode, r.sim.progress.flags);
    expect(r.sim.flag('boss_done')).toBe(true);
    expect(r.sim.flag('read:fin_stele')).toBe(true);
  });
});
