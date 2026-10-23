import { ch1 } from './ch1';
import { ch2 } from './ch2';
import { ch3 } from './ch3';
import { ch4 } from './ch4';
import { finale } from './finale';
import { prologue } from './prologue';
import type { ChapterId, LevelDef } from './types';

const builders: Partial<Record<ChapterId, () => LevelDef>> = { prologue, ch1, ch2, ch3, ch4, finale };
const cache = new Map<ChapterId, LevelDef>();

export const CHAPTER_ORDER: ChapterId[] = ['prologue', 'ch1', 'ch2', 'ch3', 'ch4', 'finale'];

export function hasLevel(id: ChapterId): boolean {
  return !!builders[id];
}

export function getLevel(id: ChapterId): LevelDef {
  let l = cache.get(id);
  if (!l) {
    const b = builders[id];
    if (!b) throw new Error('未実装の章: ' + id);
    l = b();
    cache.set(id, l);
  }
  return l;
}
