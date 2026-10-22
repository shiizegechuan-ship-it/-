import { describe, expect, it } from 'vitest';
import { ABILITIES, ABILITY_ORDER, DAWN_PRICE } from '../src/core/data/abilities';
import { canRedeem, creditAvailable, earn, newLedger, pawn, redeem, redeemPrice } from '../src/core/economy';

describe('質入れ・請け出し（経済）', () => {
  it('請け出し値は質入れ値より高い（1.25 倍・切り上げ）', () => {
    for (const id of ABILITY_ORDER) {
      expect(redeemPrice(id)).toBeGreaterThan(ABILITIES[id].price);
      expect(redeemPrice(id)).toBe(Math.ceil(ABILITIES[id].price * 1.25));
    }
  });

  it('売って買い戻すと必ず損をする（何度くり返しても銭は増えない）', () => {
    for (const id of ABILITY_ORDER) {
      const l = newLedger();
      l.zeni = 1000;
      let prev = l.zeni;
      for (let i = 0; i < 50; i++) {
        expect(pawn(l, id).ok).toBe(true);
        expect(redeem(l, id).ok).toBe(true);
        expect(l.zeni).toBeLessThan(prev);
        prev = l.zeni;
      }
    }
  });

  it('同じ型を二度質入れできない・質に無い型は請け出せない（誤課金しない）', () => {
    const l = newLedger();
    expect(pawn(l, 'jump').ok).toBe(true);
    const z = l.zeni;
    expect(pawn(l, 'jump').ok).toBe(false);
    expect(l.zeni).toBe(z);
    expect(redeem(l, 'fan').ok).toBe(false);
    expect(l.zeni).toBe(z);
  });

  it('銭が足りなければ請け出せず、銭も減らない', () => {
    const l = newLedger();
    pawn(l, 'jump'); // 30
    l.zeni = 10;
    const r = canRedeem(l, 'jump');
    expect(r.ok).toBe(false);
    expect(redeem(l, 'jump').ok).toBe(false);
    expect(l.zeni).toBe(10);
    expect(l.pawned).toContain('jump');
  });

  it('つけ：本当に詰んだとき（残りの型を全部売っても足りない）だけ借りられ、収入で先に返す', () => {
    const l = newLedger();
    for (const id of ABILITY_ORDER) pawn(l, id);
    l.zeni = 5;
    expect(creditAvailable(l, 'dash')).toBe(true);
    const r = redeem(l, 'dash');
    expect(r.ok).toBe(true);
    expect(l.debt).toBe(redeemPrice('dash') - 5);
    expect(l.zeni).toBe(0);
    // 2 口目は借りられない
    expect(creditAvailable(l, 'jump')).toBe(false);
    // 収入はつけへ
    const repaid = earn(l, 20);
    expect(repaid).toBe(20);
    expect(l.zeni).toBe(0);
  });

  it('つけは、ほかの型を売れば足りるときは使えない', () => {
    const l = newLedger();
    pawn(l, 'jump');
    l.zeni = 0;
    // 手元に fan/lantern/dash があり、どれか売れば 38 に届く
    expect(creditAvailable(l, 'jump')).toBe(false);
  });

  it('つけで借りてすぐ売っても、銭は増えない（つけが残る）', () => {
    const l = newLedger();
    for (const id of ABILITY_ORDER) pawn(l, id);
    l.zeni = 0;
    redeem(l, 'dash'); // つけ 75
    pawn(l, 'dash'); // 60 はつけへ
    expect(l.zeni).toBe(0);
    expect(l.debt).toBe(15);
  });

  it('朝の請け出し値は 4 つの型の質入れ値の合計（伏線「値は嘘をつかない」）', () => {
    expect(DAWN_PRICE).toBe(ABILITY_ORDER.reduce((s, id) => s + ABILITIES[id].price, 0));
  });
});
