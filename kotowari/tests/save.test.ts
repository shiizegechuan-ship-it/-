import { describe, expect, it } from 'vitest';
import { SAVE_BAK, SAVE_KEY, migrate, readSave, writeSave, type Storage } from '../src/core/save';
import { newProgress } from '../src/core/sim';
import { loadSettings, saveSettings, defaultSettings } from '../src/settings';

class Mem implements Storage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
class Broken implements Storage {
  getItem(): string | null {
    throw new Error('denied');
  }
  setItem(): void {
    throw new Error('quota');
  }
  removeItem(): void {
    throw new Error('denied');
  }
}

describe('セーブ', () => {
  it('書いて読める（進行・銭・質・旗）', () => {
    const s = new Mem();
    const p = newProgress('ch1');
    p.shrine = 'c1_b';
    p.ledger = { zeni: 12, debt: 3, pawned: ['jump'], clock: 1, since: { jump: 1 }, charms: 1 };
    p.flags['trig:c1_gap'] = true;
    p.collected.push('p:c1_z1');
    expect(writeSave(s, p, 125.7, ['dawn'])).toBe(true);
    const r = readSave(s)!;
    expect(r.recovered).toBe(false);
    expect(r.data.progress).toEqual(p);
    expect(r.data.playTime).toBe(125);
    expect(r.data.endings).toEqual(['dawn']);
  });

  it('本体が壊れていれば .bak から戻す', () => {
    const s = new Mem();
    writeSave(s, newProgress('ch1'), 1, []);
    writeSave(s, newProgress('prologue'), 2, []);
    s.setItem(SAVE_KEY, '{壊れた');
    const r = readSave(s)!;
    expect(r.recovered).toBe(true);
    expect(r.data.progress.chapter).toBe('ch1');
  });

  it('両方壊れていれば null（新規で始める）', () => {
    const s = new Mem();
    s.setItem(SAVE_KEY, 'x');
    s.setItem(SAVE_BAK, 'y');
    expect(readSave(s)).toBeNull();
  });

  it('保存できない環境でも例外を出さない', () => {
    const b = new Broken();
    expect(writeSave(b, newProgress(), 0, [])).toBe(false);
    expect(readSave(b)).toBeNull();
    expect(() => saveSettings(b, defaultSettings())).not.toThrow();
    expect(loadSettings(b)).toEqual(defaultSettings());
  });

  it('古い形式（版なし・欠けた値・おかしな値）を補う', () => {
    const d = migrate({ progress: { chapter: 'ch9', ledger: { zeni: -5, pawned: ['jump', 'fly', 'jump'] }, flags: { a: true, b: 'yes' } } })!;
    expect(d.version).toBe(1);
    expect(d.progress.chapter).toBe('prologue');
    expect(d.progress.ledger.zeni).toBe(0);
    expect(d.progress.ledger.pawned).toEqual(['jump']);
    expect(d.progress.flags).toEqual({ a: true });
  });

  it('未来の版は読まない', () => {
    expect(migrate({ version: 99, progress: {} })).toBeNull();
  });

  it('設定はおかしな値を既定に戻す', () => {
    const s = new Mem();
    s.setItem('kotowari.settings', JSON.stringify({ master: 99, shake: 'max', textSize: 3, flashReduce: true }));
    const st = loadSettings(s);
    expect(st.master).toBe(defaultSettings().master);
    expect(st.shake).toBe('on');
    expect(st.textSize).toBe(1);
    expect(st.flashReduce).toBe(true);
  });
});
