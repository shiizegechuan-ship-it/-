import { ABILITY_ORDER, type AbilityId } from './data/abilities';
import type { ChapterId } from './levels/types';
import { newProgress, type Progress } from './sim';

/** セーブの形式。版を上げたら migrate に変換を足す */
export const SAVE_VERSION = 1;
export const SAVE_KEY = 'kotowari.save.v1';
export const SAVE_BAK = 'kotowari.save.v1.bak';

export interface SaveData {
  version: number;
  savedAt: number;
  progress: Progress;
  playTime: number;
  endings: string[];
}

export interface Storage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const CHAPTERS: ChapterId[] = ['prologue', 'ch1', 'ch2', 'ch3', 'ch4', 'finale'];

/** 古い形式・欠けた値を補う。読めない値は既定に戻す */
export function migrate(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const version = typeof r.version === 'number' ? r.version : 0;
  if (version > SAVE_VERSION) return null; // 新しすぎる（未来の版）は読まない
  const pr = (r.progress ?? {}) as Record<string, unknown>;
  const base = newProgress();
  const chapter = CHAPTERS.includes(pr.chapter as ChapterId) ? (pr.chapter as ChapterId) : base.chapter;
  const ledgerRaw = (pr.ledger ?? {}) as Record<string, unknown>;
  const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
  const pawned = Array.isArray(ledgerRaw.pawned) ? (ledgerRaw.pawned.filter((a) => ABILITY_ORDER.includes(a as AbilityId)) as AbilityId[]) : [];
  const flags: Record<string, boolean> = {};
  if (pr.flags && typeof pr.flags === 'object') for (const [k, v] of Object.entries(pr.flags as object)) if (v === true) flags[k] = true;
  const collected = Array.isArray(pr.collected) ? pr.collected.filter((x) => typeof x === 'string') : [];
  return {
    version: SAVE_VERSION,
    savedAt: num(r.savedAt, 0),
    playTime: num(r.playTime, 0),
    endings: Array.isArray(r.endings) ? r.endings.filter((x) => typeof x === 'string') : [],
    progress: {
      chapter,
      shrine: typeof pr.shrine === 'string' ? pr.shrine : null,
      ledger: { zeni: num(ledgerRaw.zeni), debt: num(ledgerRaw.debt), pawned: [...new Set(pawned)] },
      flags,
      collected: [...new Set(collected as string[])],
    },
  };
}

export function serialize(progress: Progress, playTime: number, endings: string[], now = Date.now()): string {
  const d: SaveData = { version: SAVE_VERSION, savedAt: now, progress, playTime: Math.floor(playTime), endings };
  return JSON.stringify(d);
}

/** 保存。前の版を .bak に残す。保存できない環境でも例外を外へ出さない */
export function writeSave(store: Storage | null, progress: Progress, playTime: number, endings: string[]): boolean {
  if (!store) return false;
  try {
    const prev = store.getItem(SAVE_KEY);
    if (prev) store.setItem(SAVE_BAK, prev);
    store.setItem(SAVE_KEY, serialize(progress, playTime, endings));
    return true;
  } catch {
    return false;
  }
}

/** 読み込み。本体が壊れていれば .bak から、どちらも駄目なら null */
export function readSave(store: Storage | null): { data: SaveData; recovered: boolean } | null {
  if (!store) return null;
  const tryKey = (k: string): SaveData | null => {
    try {
      const s = store.getItem(k);
      if (!s) return null;
      return migrate(JSON.parse(s));
    } catch {
      return null;
    }
  };
  const main = tryKey(SAVE_KEY);
  if (main) return { data: main, recovered: false };
  const bak = tryKey(SAVE_BAK);
  if (bak) return { data: bak, recovered: true };
  return null;
}

export function clearSave(store: Storage | null): void {
  try {
    store?.removeItem(SAVE_KEY);
    store?.removeItem(SAVE_BAK);
  } catch {
    /* 無視 */
  }
}

export function safeStorage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    const k = '__kotowari_probe';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}
