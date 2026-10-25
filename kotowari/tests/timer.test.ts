import { describe, expect, it } from 'vitest';
import { emptyInput } from '../src/core/input';
import { getLevel } from '../src/core/levels';
import { Sim, newProgress } from '../src/core/sim';
import { playChapter } from './route.test';

describe('時間制限のイベントとゲームオーバー', () => {
  it('三の章：ボットは影が満ちる前に空堀を渡り切る', () => {
    const r = playChapter('ch3', { ledger: { zeni: 60, debt: 0, pawned: [] } });
    expect(r.sim.flag('timer:c3_dark')).toBe(true);
  });

  it('立ち止まっていると刻限が尽き、ゲームオーバー（自動検査では鳥居から）', () => {
    const sim = new Sim(getLevel, { ...newProgress('ch3'), flags: { 'read:c3_diary': true } }, 1);
    sim.player.body.x = 0;
    sim.player.body.z = 26;
    const evs: string[] = [];
    for (let f = 0; f < 60 * 45; f++) {
      sim.step(emptyInput(0));
      for (const e of sim.drain()) evs.push(e.t);
      // 襲ってくる影法師に倒されないよう、勾玉を保つ（刻限だけを見る）
      if (sim.player.mode !== 'dead') sim.player.hp = 5;
    }
    expect(evs).toContain('timerStart');
    expect(evs).toContain('timeUp');
    expect(evs).toContain('gameover');
    // 区域の中の鳥居から再開した場合は、刻限が最初からやり直しになる
    expect(sim.timer === null || sim.timer.left > 30).toBe(true);
  });

  it('アプリでは倒れても自動で戻らず、respawn を呼ぶまで待つ', () => {
    const sim = new Sim(getLevel, newProgress('ch1'), 1);
    sim.autoRespawn = false;
    sim.damagePlayer(99, 0, 0, true);
    const evs: string[] = [];
    for (let f = 0; f < 300; f++) {
      sim.step(emptyInput(0));
      for (const e of sim.drain()) evs.push(e.t);
    }
    expect(evs.filter((e) => e === 'gameover').length).toBe(1);
    expect(sim.player.mode).toBe('dead');
    sim.respawn();
    expect(sim.player.mode).toBe('normal');
  });

  it('四の章：緩の理（駆を質に入れている）なら刻限は半分の速さで迫る', () => {
    const left = (pawned: ('dash')[]) => {
      const sim = new Sim(getLevel, { ...newProgress('ch4'), flags: { 'trig:c4_contract': true }, ledger: { zeni: 0, debt: 0, pawned } }, 1);
      sim.player.body.x = 0;
      sim.player.body.z = 31;
      for (let f = 0; f < 60 * 5; f++) {
        sim.step(emptyInput(0));
        sim.player.hp = 5;
      }
      return sim.timer?.left ?? -1;
    };
    const normal = left([]);
    const slow = left(['dash']);
    expect(normal).toBeGreaterThan(24);
    expect(normal).toBeLessThan(25.5);
    expect(slow).toBeGreaterThan(27);
  });
});
