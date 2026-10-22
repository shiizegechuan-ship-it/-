import { ABILITIES, ABILITY_ORDER, type AbilityId } from './data/abilities';
import { ECON } from './data/tuning';

/** 銭と質の状態。Sim の状態の一部（セーブ対象）。 */
export interface Ledger {
  zeni: number;
  debt: number; // つけ（借り）
  pawned: AbilityId[]; // 質に入っている型（＝世界に働いている理）
}

export const newLedger = (): Ledger => ({ zeni: 0, debt: 0, pawned: [] });

export const redeemPrice = (id: AbilityId): number => Math.ceil(ABILITIES[id].price * ECON.redeemMul);

export const isPawned = (l: Ledger, id: AbilityId): boolean => l.pawned.includes(id);

/** 収入。つけがあれば先に返す。返した額を返す。 */
export function earn(l: Ledger, amount: number): number {
  if (amount <= 0) return 0;
  const repay = Math.min(l.debt, amount);
  l.debt -= repay;
  l.zeni += amount - repay;
  return repay;
}

export type TradeResult =
  | { ok: true; zeniDelta: number; repaid: number; credit: number }
  | { ok: false; reason: string };

export function canPawn(l: Ledger, id: AbilityId): TradeResult {
  if (isPawned(l, id)) return { ok: false, reason: 'すでに質に入っています' };
  return { ok: true, zeniDelta: ABILITIES[id].price, repaid: 0, credit: 0 };
}

export function pawn(l: Ledger, id: AbilityId): TradeResult {
  const c = canPawn(l, id);
  if (!c.ok) return c;
  const before = l.zeni;
  const repaid = earn(l, ABILITIES[id].price);
  l.pawned.push(id);
  return { ok: true, zeniDelta: l.zeni - before, repaid, credit: 0 };
}

/** まだ手元にある型をすべて質入れしたら得られる額 */
export const heldValue = (l: Ledger): number =>
  ABILITY_ORDER.filter((id) => !isPawned(l, id)).reduce((s, id) => s + ABILITIES[id].price, 0);

/**
 * つけが使えるのは「手元の銭と、残りの型を全部売った額を足しても請け出せない」ときだけ（本当に詰んだとき）。
 * つけは 1 口まで（返し終わるまで次は借りられない）。
 */
export function creditAvailable(l: Ledger, id: AbilityId): boolean {
  const cost = redeemPrice(id);
  return isPawned(l, id) && l.debt === 0 && l.zeni < cost && l.zeni + heldValue(l) < cost;
}

export function canRedeem(l: Ledger, id: AbilityId): TradeResult {
  if (!isPawned(l, id)) return { ok: false, reason: '質に入っていません' };
  const cost = redeemPrice(id);
  if (l.zeni >= cost) return { ok: true, zeniDelta: -cost, repaid: 0, credit: 0 };
  if (creditAvailable(l, id)) return { ok: true, zeniDelta: -l.zeni, repaid: 0, credit: cost - l.zeni };
  return { ok: false, reason: `銭が ${cost - l.zeni} 足りません` };
}

export function redeem(l: Ledger, id: AbilityId): TradeResult {
  const c = canRedeem(l, id);
  if (!c.ok) return c;
  const cost = redeemPrice(id);
  if (l.zeni >= cost) {
    l.zeni -= cost;
  } else {
    l.debt += cost - l.zeni;
    l.zeni = 0;
  }
  l.pawned = l.pawned.filter((p) => p !== id);
  return c;
}
