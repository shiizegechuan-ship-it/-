import { describe, expect, it } from 'vitest';
import { ATTACK, DASH, PLAYER } from '../src/core/data/tuning';
import { box } from '../src/core/levels/build';
import { flatLevel, run, settle, simOn } from './helpers';

describe('鈴の操作感', () => {
  it('前へ押すとカメラの向きへ走り、最高速に 0.2 秒以内で達する', () => {
    const sim = simOn(flatLevel());
    settle(sim);
    run(sim, 12, { moveY: 1, camYaw: 0 });
    expect(Math.hypot(sim.player.body.vx, sim.player.body.vz)).toBeCloseTo(PLAYER.runSpeed, 1);
    expect(sim.player.body.vz).toBeGreaterThan(5);
    // カメラが右を向けば、前は +x
    const s2 = simOn(flatLevel());
    settle(s2);
    run(s2, 20, { moveY: 1, camYaw: Math.PI / 2 });
    expect(s2.player.body.vx).toBeGreaterThan(5);
  });

  it('右へ押すとカメラから見て右へ動く（yaw=0 で -x）', () => {
    const sim = simOn(flatLevel());
    settle(sim);
    run(sim, 20, { moveX: 1, camYaw: 0 });
    expect(sim.player.body.vx).toBeLessThan(-5);
  });

  it('離すと 0.15 秒以内に止まる', () => {
    const sim = simOn(flatLevel());
    settle(sim);
    run(sim, 30, { moveY: 1 });
    run(sim, 9);
    expect(Math.hypot(sim.player.body.vx, sim.player.body.vz)).toBeLessThan(0.3);
  });

  it('跳：押した瞬間のコマで跳び、長押しで高く、短押しで低い', () => {
    const hi = simOn(flatLevel());
    settle(hi);
    hi.step({ ...emptyIn(), jumpPressed: true, jumpHeld: true });
    expect(hi.player.body.vy).toBeGreaterThan(8);
    const lo = simOn(flatLevel());
    settle(lo);
    let peakLo = 0;
    let peakHi = 0;
    lo.step({ ...emptyIn(), jumpPressed: true, jumpHeld: true });
    run(lo, 60, (f) => {
      peakLo = Math.max(peakLo, lo.player.body.y);
      return { jumpHeld: f < 3 };
    });
    const hi2 = simOn(flatLevel());
    settle(hi2);
    hi2.step({ ...emptyIn(), jumpPressed: true, jumpHeld: true });
    run(hi2, 60, () => {
      peakHi = Math.max(peakHi, hi2.player.body.y);
      return { jumpHeld: true };
    });
    expect(peakHi).toBeGreaterThan(1.4);
    expect(peakLo).toBeLessThan(peakHi * 0.6);
  });

  it('先行入力：着地の直前（0.1 秒前）に押した跳も出る', () => {
    const sim = simOn(flatLevel());
    settle(sim);
    sim.step({ ...emptyIn(), jumpPressed: true, jumpHeld: true });
    // 落ち始めて地面の近くまで待つ
    let f = 0;
    while (!(sim.player.body.vy < 0 && sim.player.body.y < 0.5) && f++ < 200) sim.step({ ...emptyIn(), jumpHeld: true });
    sim.step({ ...emptyIn(), jumpPressed: true, jumpHeld: true });
    let jumped = false;
    for (let i = 0; i < 8; i++) {
      sim.step({ ...emptyIn(), jumpHeld: true });
      if (sim.drain().some((e) => e.t === 'jump')) jumped = true;
    }
    expect(jumped).toBe(true);
  });

  it('コヨーテ時間：崖から落ちて 0.08 秒後でも跳べる。0.2 秒後は跳べない', () => {
    const lvl = flatLevel((l) => {
      l.boxes.length = 0;
      l.boxes.push(box(-5, -1, -5, 5, 0, 1, 'stone'));
    });
    const tryAt = (delayFrames: number) => {
      const sim = simOn(lvl);
      settle(sim);
      // 崖の端まで歩く
      let f = 0;
      while (sim.player.body.onGround && f++ < 200) sim.step({ ...emptyIn(), moveY: 1 });
      for (let i = 0; i < delayFrames; i++) sim.step({ ...emptyIn(), moveY: 1 });
      sim.drain();
      sim.step({ ...emptyIn(), moveY: 1, jumpPressed: true, jumpHeld: true });
      return sim.drain().some((e) => e.t === 'jump');
    };
    expect(tryAt(4)).toBe(true);
    expect(tryAt(12)).toBe(false);
  });

  it('跳が質に入っていると跳べず、理由のイベントが出る', () => {
    const sim = simOn(flatLevel(), { ledger: { zeni: 0, debt: 0, pawned: ['jump'] } });
    settle(sim);
    sim.drain();
    sim.step({ ...emptyIn(), jumpPressed: true, jumpHeld: true });
    const ev = sim.drain();
    expect(ev.some((e) => e.t === 'jumpDenied')).toBe(true);
    expect(ev.some((e) => e.t === 'jump')).toBe(false);
  });

  it('払：3 段まで連携し、各段に開始・持続・硬直がある', () => {
    const sim = simOn(flatLevel());
    settle(sim);
    sim.drain();
    let swings = 0;
    run(sim, 90, (f) => ({ attackPressed: f % 8 === 0 }));
    for (const e of sim.drain()) if (e.t === 'swing') swings++;
    // 連打していても 3 段で止まり、次の 1 段目が来る
    expect(swings).toBeGreaterThanOrEqual(3);
    const total = ATTACK.swings.reduce((s, w) => s + w.startup + w.active + w.recovery, 0);
    expect(total).toBeLessThan(1.2);
  });

  it('駆：押した瞬間に駆け出し、無敵の時間は駆の時間内', () => {
    const sim = simOn(flatLevel());
    settle(sim);
    sim.step({ ...emptyIn(), dashPressed: true });
    expect(sim.player.mode).toBe('dash');
    expect(DASH.iframes).toBeLessThanOrEqual(DASH.time);
  });

  it('入力が無くても駆は向いている方向へ出る', () => {
    const sim = simOn(flatLevel());
    settle(sim);
    sim.step({ ...emptyIn(), dashPressed: true });
    run(sim, 5);
    expect(sim.player.body.z).toBeGreaterThan(0.8);
  });

  it('奈落に落ちると直前の安全な足場へ戻り、勾玉を 1 つ失う', () => {
    const lvl = flatLevel((l) => {
      l.boxes.length = 0;
      l.boxes.push(box(-5, -1, -5, 5, 0, 1, 'stone'));
      l.killY = -6;
    });
    const sim = simOn(lvl);
    settle(sim);
    let fell = false;
    for (let i = 0; i < 300 && !fell; i++) {
      sim.step({ ...emptyIn(), moveY: 1 });
      fell = sim.drain().some((e) => e.t === 'fall');
    }
    expect(fell).toBe(true);
    expect(sim.player.hp).toBe(PLAYER.maxHp - 1);
    expect(sim.player.body.z).toBeLessThan(0.6);
    expect(sim.player.body.y).toBeGreaterThan(-0.5);
  });
});

function emptyIn() {
  return { moveX: 0, moveY: 0, camYaw: 0, jumpPressed: false, jumpHeld: false, attackPressed: false, dashPressed: false, lanternPressed: false, interactPressed: false };
}
