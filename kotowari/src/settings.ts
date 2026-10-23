import type { Storage } from './core/save';

export interface Settings {
  master: number; // 0..10
  bgm: number;
  se: number;
  shake: 'on' | 'weak' | 'off';
  flashReduce: boolean;
  fx: 'full' | 'reduced';
  textSize: 1 | 1.25 | 1.5;
  textSpeed: 'normal' | 'fast' | 'instant';
  pixel: 'fine' | 'chunky';
  invertY: boolean;
  debugBoxes: boolean;
}

export const SETTINGS_KEY = 'kotowari.settings';

export const defaultSettings = (): Settings => ({
  master: 8,
  bgm: 7,
  se: 8,
  shake: 'on',
  flashReduce: false,
  fx: 'full',
  textSize: 1,
  textSpeed: 'normal',
  pixel: 'fine',
  invertY: false,
  debugBoxes: false,
});

export function loadSettings(store: Storage | null): Settings {
  const d = defaultSettings();
  try {
    const raw = store?.getItem(SETTINGS_KEY);
    if (!raw) return d;
    const o = JSON.parse(raw) as Partial<Settings>;
    const inRange = (v: unknown, def: number) => (typeof v === 'number' && v >= 0 && v <= 10 ? Math.round(v) : def);
    return {
      master: inRange(o.master, d.master),
      bgm: inRange(o.bgm, d.bgm),
      se: inRange(o.se, d.se),
      shake: o.shake === 'weak' || o.shake === 'off' ? o.shake : 'on',
      flashReduce: o.flashReduce === true,
      fx: o.fx === 'reduced' ? 'reduced' : 'full',
      textSize: o.textSize === 1.25 || o.textSize === 1.5 ? o.textSize : 1,
      textSpeed: o.textSpeed === 'fast' || o.textSpeed === 'instant' ? o.textSpeed : 'normal',
      pixel: o.pixel === 'chunky' ? 'chunky' : 'fine',
      invertY: o.invertY === true,
      debugBoxes: o.debugBoxes === true,
    };
  } catch {
    return d;
  }
}

export function saveSettings(store: Storage | null, s: Settings): void {
  try {
    store?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 保存できなくても続ける */
  }
}
