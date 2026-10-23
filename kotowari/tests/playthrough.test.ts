import { describe, expect, it } from 'vitest';
import { RouteBot } from '../src/core/bot/routeBot';
import { CHAPTER_ORDER, getLevel } from '../src/core/levels';
import type { ChapterId } from '../src/core/levels/types';
import { Sim, newProgress, type Progress } from '../src/core/sim';

/** 序章から終章の碑まで、進行を持ち越して通す（アプリと同じ持ち越し方） */
export function playthrough(seed: number, skill = 1) {
  let progress: Progress = newProgress('prologue');
  const log: string[] = [];
  let totalSec = 0;
  let deaths = 0;
  for (const ch of CHAPTER_ORDER) {
    progress.chapter = ch as ChapterId;
    progress.shrine = null;
    const sim = new Sim(getLevel, progress, seed);
    const bot = new RouteBot(sim, skill);
    let exit: string | null = null;
    let f = 0;
    for (; f < 600 * 60 && !exit; f++) {
      sim.step(bot.next());
      for (const e of sim.drain()) {
        if (e.t === 'exit') exit = e.to;
        if (e.t === 'dead') deaths++;
      }
      if (ch === 'finale' && sim.flag('read:fin_stele')) break;
      if (sim.ledger.zeni < 0 || sim.ledger.debt < 0) throw new Error('銭が負');
    }
    totalSec += f / 60;
    log.push(`${ch}: ${(f / 60).toFixed(0)}s 銭 ${sim.ledger.zeni} つけ ${sim.ledger.debt} 質 [${sim.ledger.pawned.join(',')}]`);
    if (ch !== 'finale' && !exit) return { ok: false, log, at: ch, totalSec, deaths, sim };
    if (ch === 'finale') return { ok: sim.flag('read:fin_stele'), log, at: ch, totalSec, deaths, sim };
    progress = structuredClone(sim.progress);
  }
  return { ok: false, log, at: 'none', totalSec, deaths, sim: null };
}

describe('通しプレイ（Node）', () => {
  for (const seed of [1, 7, 42]) {
    it(`種 ${seed}：序章から終章の碑まで到達する`, () => {
      const r = playthrough(seed);
      console.log(`種 ${seed}\n` + r.log.join('\n') + `\n合計 ${r.totalSec.toFixed(0)}s 倒れた ${r.deaths}`);
      expect(r.ok).toBe(true);
    });
  }
});
