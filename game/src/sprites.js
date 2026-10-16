// ドット絵スプライト（手描き）。右向きで描き、左向きは反転する。
// 形の約束：味方は丸い輪郭、敵は角とトゲと赤い目。
import { sprite } from './pix.js';

// 行の長さを揃える（右側を透明で埋める）
const pad = (rows) => { const w = Math.max(...rows.map((r) => r.length)); return rows.map((r) => r.padEnd(w, '.')); };
// 指定した行を左右にずらす（走り・のけぞりの派生フレーム用）
const shift = (rows, from, to, dx) => rows.map((r, i) => (i >= from && i <= to ? (dx > 0 ? '.'.repeat(dx) + r.slice(0, r.length - dx) : r.slice(-dx) + '.'.repeat(-dx)) : r));
const replace = (rows, i, row) => rows.map((r, j) => (j === i ? row.padEnd(r.length, '.') : r));

export const PAL_ALLY = {
  k: '#1c1424', w: '#efe4cc', s: '#c3b08c', d: '#8f7d62', f: '#2a2230', e: '#fff3d6', b: '#3a3040',
  l: '#c9b8d8', L: '#9a86b0', h: '#5a4060', S: '#f3dcc0', r: '#d24d3a', c: '#5a3a2a', B: '#ddd6c8', a: '#b39a74', o: '#7a5a44', g: '#cfd6e0',
};
export const PAL_FOE = {
  k: '#120c14', m: '#3a3242', M: '#5c5068', h: '#8a7a92', u: '#8a4a2e', U: '#d0703f', x: '#ff3b2f', W: '#d8ccb4', g: '#a08a60', y: '#b9a58a',
};

// ───────── 主人公（鐘の形の外套と丸い頭巾） ─────────
const HERO = pad([
  '....kkkk....',
  '...kwwwwk...',
  '..kwwwwwwk..',
  '.kwwwwwfffk.',
  '.kwwwwwfefk.',
  '.kswwwwfffk.',
  '..kswwwwkk..',
  '..kswwwwwk..',
  '.kswwwwwwk..',
  '.kswwwwwwwk.',
  '.kswwwwwwwk.',
  'kssswwwwwwwk',
  'kssswwwwwwwk',
  'kdddssssssdk',
  '.kkkkkkkkkk.',
  '..bb...bb...',
]);
const HERO_DEAD = pad([
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....kkkkkk.....',
  '..kkkwwwwwwkk...',
  '.kwwwwwwwwwwwk..',
  'kssswwwwwfffwk..',
  'kdddsssssfefwk..',
  '.kkkkkkkkkkkkk..',
]);
export const HERO_FRAMES = {
  idle0: HERO,
  idle1: replace(shift(HERO, 11, 13, 0), 13, 'kddssssssssk'),
  run0: replace(shift(HERO, 11, 14, -1), 15, '.bb.....bb..'),
  run1: replace(shift(shift(HERO, 0, 10, 0), 11, 14, -1), 15, '...bbbb.....'),
  run2: replace(shift(HERO, 11, 14, -1), 15, '..bb...bb...'),
  run3: replace(shift(HERO, 11, 14, -1), 15, '....bbb.....'),
  up: replace(shift(HERO, 11, 14, -1), 15, '...bbbb.....'),
  down: replace(replace(HERO, 13, 'kdssssssssdk'), 15, '..b.....b...'),
  dodge: replace(shift(shift(HERO, 0, 8, 1), 11, 14, -2), 15, '..bbbb......'),
  attack: replace(shift(HERO, 0, 8, 1), 15, '.bb....bb...'),
  hurt: replace(shift(HERO, 0, 7, -1), 15, '...bb.bb....'),
  charge: replace(shift(HERO, 0, 9, -1), 15, '.bb.....bb..'),
  dead: HERO_DEAD,
};

// ───────── 少女リラ・鍛冶屋グレン（正面向き・丸い） ─────────
export const LIRA = pad([
  '.r.....r.',
  'hhkkkkkhh',
  'hhkhhhkhh',
  '.khSSShk.',
  '.kSfSfSk.',
  '.kSSSSSk.',
  '..kkkkk..',
  '..klllk..',
  '.kllLllk.',
  '.kllLllk.',
  'kllLLLllk',
  'kllLLLllk',
  '.kkkkkkk.',
  '..k...k..',
]);
export const GLEN = pad([
  '....kkkkk....',
  '...kccccck...',
  '..kccccccck..',
  '..kSSSSSSSk..',
  '..kSfSSSfSk..',
  '..kBSSSSSBk..',
  '.kkBBBBBBBkk.',
  'kooBBBBBBBook',
  'kooaBBBBBaook',
  'kooaaaaaaaook',
  'kooaaaaaaaook',
  'kooaaaaaaaook',
  '.kkaaaaaaakk.',
  '..koooooook..',
  '..kbbk.kbbk..',
  '..kkkk.kkkk..',
]);

// ───────── 錆兵（前かがみ・背中のトゲ・前へ突き出たとさか） ─────────
const SOLDIER = pad([
  '..........U.....',
  '.........kUk....',
  '.......kkMMkk...',
  '......kMMMMxxk..',
  'U....kMMMMMMk...',
  'Uuk.kmMMMMMk....',
  '.Uukmmmmmmk.....',
  '..ukmmmmmmMk....',
  'Uukmmmmmmmmk....',
  '.Uukmmmmmmmk....',
  '..kmmhmmmmmk....',
  '...kmmmmmmk.....',
  '...kkmmmmkk.....',
  '...kmk..kmk.....',
  '..kmk....kmk....',
  '..kk......kk....',
]);
export const SOLDIER_FRAMES = {
  stand: SOLDIER,
  walk0: replace(replace(replace(SOLDIER, 13, '...kmkkmk.......'), 14, '..kmk..kmk......'), 15, '..kk....kk......'),
  walk1: replace(replace(replace(SOLDIER, 13, '....kmkmk.......'), 14, '...kmk.kmk......'), 15, '...kk...kk......'),
  crouch: shift(SOLDIER, 0, 11, -1),
};

// ───────── 振り子蝙蝠（ギザギザの翼） ─────────
export const BAT_FRAMES = {
  up: pad([
    'k...............k',
    'mk.....kuk.....km',
    'kmk...kuuuk...kmk',
    '.kmmkkuxuxukkmmk.',
    '...kkmuuuuumkk...',
    '......kuuuk......',
    '.......kuk.......',
    '........k........',
    '........k........',
  ]),
  mid: pad([
    '.................',
    'kk.....kuk.....kk',
    'kmk...kuuuk...kmk',
    '.kmmkkuxuxukkmmk.',
    '..kmmmuuuuummmk..',
    '...kkmkuuukmkk...',
    '.......kuk.......',
    '........k........',
    '........k........',
  ]),
  down: pad([
    '.................',
    '.......kuk.......',
    '......kuuuk......',
    '...kkkuxuxukkk...',
    '..kmmmuuuuummmk..',
    '.kmmkkkuuukkkmmk.',
    'kmk....kuk....kmk',
    'kk......k......kk',
    '........k........',
  ]),
};

// ───────── 歯車騎士（二本角・肩のトゲ・胸の歯車） ─────────
const KNIGHT = pad([
  '.U.......U....',
  '.Uk.....kU....',
  '..UkkkkkU.....',
  '..kMMMMMk.....',
  '..kMMMMxxk....',
  '..kMMMMMk.....',
  'UkkkkkkkkkkU..',
  'UukMMMMMMMkuU.',
  '.ukMhMMMMMMku.',
  '..kMMMgMMMMk..',
  '..kMMgggMMMk..',
  '..kMMMgMMMMk..',
  '..kmMMMMMMmk..',
  '...kmmmmmmk...',
  '...kmmmmmmk...',
  '...kmkkkkmk...',
  '...kmk..kmk...',
  '..kmmk..kmmk..',
  '..kkkk..kkkk..',
]);
export const KNIGHT_FRAMES = {
  stand: KNIGHT,
  walk0: replace(replace(KNIGHT, 16, '...kmk.kmk....'), 17, '..kmmk.kmmk...'),
  walk1: replace(replace(KNIGHT, 16, '....kmkkmk....'), 17, '...kmmkmmk....'),
  stagger: shift(KNIGHT, 0, 8, -1),
};

// ───────── 刻守（尖った肩・ギザギザの裾・角ばった仮面） ─────────
const BOSS = pad([
  '.........kkkk.........',
  '........kWWWWk........',
  '........kWWWxk........',
  '........kWWWWk........',
  '.........kWWk.........',
  '.U......kkkkkk......U.',
  '.UUk..kkmmmmmmkk..kUU.',
  '..UUkkmmmmmmmmmmkkUU..',
  '...kmmmmmmMMmmmmmmk...',
  '...kmmmmmMMMMmmmmmk...',
  '...kmmmmmmMMmmmmmmk...',
  '...kmmmmmmmmmmmmmmk...',
  '...kmmmmmmmmmmmmmmk...',
  '...kmmmmmmmmmmmmmmk...',
  '..kmmmmmmmmmmmmmmmmk..',
  '..kmmmmmmmmmmmmmmmmk..',
  '..kmmmMmmmmmmmMmmmmk..',
  '..kmmmMmmmmmmmMmmmmk..',
  '.kmmmmMmmmmmmmMmmmmmk.',
  '.kmmmmMmmmmmmmMmmmmmk.',
  '.kmmmmMmmmmmmmMmmmmmk.',
  'kmmmmmMmmmmmmmMmmmmmmk',
  'kmmmmmmmmmmmmmmmmmmmmk',
  'kmmmmmmmmmmmmmmmmmmmmk',
  'kmmk.kmmk.kmmk.kmmk.kk',
  '.kk...kk...kk...kk....',
]);
export const BOSS_FRAMES = {
  stand: BOSS,
  wind: shift(BOSS, 0, 10, -1),
  lunge: shift(BOSS, 0, 12, 1),
  kneel: pad([...Array(8).fill('......................'), ...BOSS.slice(0, 4).map((r) => '..' + r.slice(0, 20)), ...BOSS.slice(8, 22)]),
};


// ───────── 時計弓兵（とがったフード・赤い目。弓は描画で足す） ─────────
const ARCHER = pad([
  '.....U......',
  '....kUk.....',
  '...kMMMk....',
  '..kMMMxxk...',
  '..kMMMMMk...',
  '.UkmmmMk....',
  'UukmmmmMk...',
  '.ukmmmmmk...',
  '..kmmhmmk...',
  '..kmmmmmk...',
  '..kmmmmk....',
  '...kmmk.....',
  '...kmkmk....',
  '..kmk.kmk...',
  '..kk...kk...',
]);
export const ARCHER_FRAMES = { stand: ARCHER, draw: shift(ARCHER, 0, 9, -1) };

// ───────── 刻の亡霊（ギザギザの裾・浮遊） ─────────
const PHANTOM = pad([
  '..U.......U...',
  '..kUkkkkkUk...',
  '..kmmmmmmmk...',
  '..kmxmmmxmk...',
  '..kmmmmmmmk...',
  '.kmmmmmmmmmk..',
  'UkmmmhmmmmmkU.',
  'kmmmmmmmmmmmk.',
  'kmmmmmmmmmmmk.',
  '.kmmmmmmmmmk..',
  '.kmmkmmmkmmk..',
  '.km..kmk..kmk.',
  '.k....k....k..',
]);
export const PHANTOM_FRAMES = { a: PHANTOM, b: shift(PHANTOM, 9, 12, 1) };
export const PAL_PHANTOM = { k: '#120c1c', m: '#4a3a6a', h: '#8a74b8', x: '#ff3b2f', U: '#b67cf0' };

// ───────── 鐘撞き（鐘の胴・トゲの冠） ─────────
const BELL = pad([
  '...U.U.U.....',
  '...kkkkk.....',
  '..kMMMxxk....',
  '..kMMMMMk....',
  '.kkkkkkkkk...',
  '.kgggggGgk...',
  'kgggggggGgk..',
  'kgggggggGgk..',
  'kggggggggGgk.',
  'kggggggggGgk.',
  'kkkkkkkkkkkk.',
  '..kmk..kmk...',
  '.kmmk..kmmk..',
  '.kkkk..kkkk..',
]);
export const BELL_FRAMES = { stand: BELL, ring: shift(BELL, 0, 3, -1) };
export const PAL_BELL = { ...PAL_FOE, g: '#7a5a2a', G: '#c9a052' };

// スプライトの実体（キャッシュされる）
export function heroSprite(name) { return sprite('hero:' + name, HERO_FRAMES[name], PAL_ALLY); }
export function liraSprite() { return sprite('lira', LIRA, PAL_ALLY); }
export function glenSprite() { return sprite('glen', GLEN, PAL_ALLY); }
export function soldierSprite(name) { return sprite('soldier:' + name, SOLDIER_FRAMES[name], PAL_FOE); }
export function batSprite(name) { return sprite('bat:' + name, BAT_FRAMES[name], PAL_FOE); }
export function knightSprite(name) { return sprite('knight:' + name, KNIGHT_FRAMES[name], PAL_FOE); }
export function bossSprite(name, duel) {
  const pal = duel ? { ...PAL_FOE, m: '#4a4058', M: '#6e6280' } : PAL_FOE;
  return sprite('boss:' + name + (duel ? ':d' : ''), BOSS_FRAMES[name], pal);
}

export const ALL_FRAMES = { HERO_FRAMES, SOLDIER_FRAMES, BAT_FRAMES, KNIGHT_FRAMES, BOSS_FRAMES, ARCHER_FRAMES, PHANTOM_FRAMES, BELL_FRAMES, LIRA: { a: LIRA }, GLEN: { a: GLEN } };

// 色違い（白＝被弾の光、赤＝予備動作の縁取り、青＝遅延、亡霊＝回避の残像）
const MONO = { white: '#ffffff', red: '#ff4a2a', blue: '#5aa9e6', ghost: '#9fe3ff', gold: '#f2c14e' };
const GROUPS = { archer: [ARCHER_FRAMES, PAL_FOE], phantom: [PHANTOM_FRAMES, PAL_PHANTOM], bell: [BELL_FRAMES, PAL_BELL], hero: [HERO_FRAMES, PAL_ALLY], soldier: [SOLDIER_FRAMES, PAL_FOE], bat: [BAT_FRAMES, PAL_FOE], knight: [KNIGHT_FRAMES, PAL_FOE], boss: [BOSS_FRAMES, PAL_FOE], lira: [{ a: LIRA }, PAL_ALLY], glen: [{ a: GLEN }, PAL_ALLY] };
// 白き刻守（最終夜の第 2 形態）の色
const PAL_WHITE = { k: '#4a4a60', m: '#dcdcec', M: '#ffffff', h: '#bfc8ec', u: '#9fb8ff', U: '#e0ecff', x: '#ffd38a', W: '#ffffff', g: '#e8dcb0', y: '#f4f0e0' };
export function spr(group, frame, variant = null, duel = false) {
  const [frames, basePal] = GROUPS[group];
  let pal = duel === 'final' ? { ...basePal, ...PAL_WHITE } : duel ? { ...basePal, m: '#4a4058', M: '#6e6280' } : basePal;
  if (variant) { const c = MONO[variant]; pal = Object.fromEntries(Object.keys(basePal).map((k) => [k, c])); }
  return sprite(`${group}:${frame}:${variant || ''}:${duel === 'final' ? 'f' : duel ? 'd' : ''}`, frames[frame], pal);
}
