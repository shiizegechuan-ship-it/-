import { describe, expect, it } from 'vitest';
import { ABILITY_ORDER, type AbilityId } from '../src/core/data/abilities';
import { RouteBot } from '../src/core/bot/routeBot';
import { getLevel } from '../src/core/levels';
import type { ChapterId } from '../src/core/levels/types';
import { Sim, newProgress } from '../src/core/sim';

/**
 * 到達可能性：どの型を質に入れた状態・銭 0 で章に入っても、出口（終章は碑）まで行けるか。
 * 店では道しるべの売買をまねる。請け出しの銭が足りなければ、この先で要らない型を売り、それでも駄目ならつけ。
 */
function tryChapter(ch: ChapterId, pawned: AbilityId[]) {
  const sim = new Sim(getLevel, { ...newProgress(ch), ledger: { zeni: 0, debt: 0, pawned: [...pawned] } }, 5);
  // 道しるべで手元に置きたい型（請け出す予定の型）で、もう手元にある物は売らない
  // 請け出す順（先の物ほど大事）。ある型を請け出すとき、それより後の順の型は売ってよい
  const order = getLevel(ch).route.flatMap((n) => (n.redeem ?? []) as AbilityId[]);
  const kept = new Set<AbilityId>();
  const trade = (kind: 'pawn' | 'redeem', id: AbilityId) => {
    if (kind === 'pawn') {
      sim.doPawn(id);
      return;
    }
    let r = sim.doRedeem(id);
    // 足りなければ、ほかの型（この後の道しるべで請け出す予定のない物）を安い順に売る
    const later = new Set(sim.level.route.flatMap((n) => (n.redeem ?? []) as AbilityId[]));
    for (const other of [...ABILITY_ORDER].sort((a, b) => a.localeCompare(b))) {
      if (r.ok) break;
      if (other === id || !sim.has(other) || later.has(other) || kept.has(other)) continue;
      sim.doPawn(other);
      r = sim.doRedeem(id);
    }
    // それでも足りなければ、後で請け出す予定の型も売る（人ならそうする）
    for (const other of ABILITY_ORDER) {
      if (r.ok) break;
      if (other === id || !sim.has(other) || kept.has(other)) continue;
      if (order.includes(other) && order.indexOf(other) < order.indexOf(id)) continue;
      sim.doPawn(other);
      r = sim.doRedeem(id);
    }
    if (r.ok) kept.add(id);
  };
  const bot = new RouteBot(sim, 1, undefined, trade);
  let exit: string | null = null;
  for (let f = 0; f < 400 * 60 && !exit; f++) {
    sim.step(bot.next());
    for (const e of sim.drain()) if (e.t === 'exit') exit = e.to;
    if (ch === 'finale' && sim.flag('read:fin_stele')) exit = 'stele';
  }
  return { exit, sim, bot };
}

const subsets: AbilityId[][] = [];
for (let m = 0; m < 16; m++) subsets.push(ABILITY_ORDER.filter((_, i) => m & (1 << i)));

describe('到達可能性（16 通りの質の状態 × 銭 0）', () => {
  for (const ch of ['ch1', 'ch2', 'ch3', 'ch4', 'finale'] as ChapterId[]) {
    it(`${ch}：どの状態で入っても出口まで行ける`, () => {
      const fails: string[] = [];
      for (const s of subsets) {
        const r = tryChapter(ch, s);
        if (!r.exit) fails.push(`[${s.join(',')}] → z=${r.sim.player.body.z.toFixed(1)} 銭 ${r.sim.ledger.zeni} つけ ${r.sim.ledger.debt} 質 [${r.sim.ledger.pawned.join(',')}] node ${r.bot.idx}`);
      }
      expect(fails, fails.join('\n')).toEqual([]);
    });
  }
});
