// 部屋のレイアウトと、周回ごとの塔の構成。
// 揺らぎ（周回シードで変わる）と因果（meta だけで決まる）をこのモジュールで分ける。
import { makeRng } from './util.js';
import { hasWedge } from './meta.js';

// 18行。 '#'壁 '='すり抜け床 P出現 X出口 g地上敵枠 a空中敵枠 t砲台枠
// 因果・固定物：L少女 G鍛冶屋 C番号扉 Y日誌 R歯止め M刻守 K騎士 H回復の泉 U昇降機 O祭壇 Q看板 W書斎メモ
const W = '#';
const SHELL_TOP = '################################';
function frame(inner, width = 32) {
  // inner: 行1〜14 の中身（左右の壁を除く）。足りない行は空で埋める
  const rows = [SHELL_TOP.padEnd(width, '#').slice(0, width)];
  const empty = '.'.repeat(width - 2);
  const pad = 14 - inner.length;
  for (let i = 0; i < pad; i++) rows.push(W + empty + W);
  for (const r of inner) rows.push(W + r.padEnd(width - 2, '.').slice(0, width - 2) + W);
  return rows;
}
const floorRows = (width = 32, gap = null) => {
  const row = (gap ? gap : '#'.repeat(width));
  return [row, row, row];
};

export const LAYOUTS = {
  alley: [...frame([
    '.........=======..............',
    '..............................',
    '..............................',
    '....====..............====....',
    'P.........g...a......g.......X',
  ]), ...floorRows()],
  steps: [...frame([
    '..............a...............',
    '..............................',
    '..............................',
    '...................g.......X..',
    '..........===......###########',
    'P......g..........############',
  ]), ...floorRows()],
  pit: [...frame([
    '......a..........a............',
    '..............................',
    '..............................',
    '............=====.............',
    '..............................',
    '....======.........======.....',
    'P........................g...X',
  ]), ...floorRows(32, '#########..........#############')],
  watch: [...frame([
    '.......................t......',
    '.....................######...',
    '...............====...........',
    '..............................',
    '.........=====................',
    '..............................',
    'P.......g.............g......X',
  ]), ...floorRows()],
  hall: [...frame([
    '..........a.........a...................',
    '........................................',
    '........................................',
    '......=====..............=====..........',
    '........................................',
    '.................=====..................',
    '........................................',
    'P.......g........g.............g.......X',
  ], 42), ...floorRows(42)],
  gears: [...frame([
    '........t..............t......',
    '......#####..........#####....',
    '..............................',
    '.===........======........===.',
    '..............................',
    'P..........g.......g.........X',
  ]), ...floorRows()],
  // 因果部屋・固定部屋
  entry: [...frame([
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    'P.Q......Q.......L...G.......X',
  ]), ...floorRows()],
  forge: [...frame([
    '..............................',
    '..............................',
    '.....=====..........=====.....',
    '..............................',
    'P..........g...G...g.........X',
  ]), ...floorRows()],
  arena: [...frame([
    '..............................',
    '..............................',
    '......=====........=====......',
    '..............................',
    '..............................',
    'P...........K...........U....X',
  ]), ...floorRows()],
  archive: [...frame([
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    'P......H.....C...Y.....O.....X',
  ]), ...floorRows()],
  study: [...frame([
    '..............................',
    '..............................',
    '..........=====...............',
    '..............................',
    'P....W.........H.......R.....X',
  ]), ...floorRows()],
  belfry: [...frame([
    '......====..............====......',
    '..................................',
    '..................................',
    '..................................',
    '..................................',
    'P.......................M.........',
  ], 36), ...floorRows(36)],
};

// 階層ごとの敵の出現テーブル（揺らぎ）
const FLOOR_ENEMIES = [
  { g: ['S'], a: ['B'], t: ['T'], fill: 0.7, min: 2 },
  { g: ['S', 'S'], a: ['B'], t: ['T'], fill: 0.85, min: 3 },
  { g: ['S'], a: ['B'], t: ['T'], fill: 1.0, min: 3 },
];
const COMBAT_POOLS = [
  ['alley', 'steps', 'pit', 'watch', 'hall'],
  ['gears', 'watch', 'hall', 'pit', 'steps'],
  ['gears', 'hall', 'alley'],
];

export const FLOOR_NAMES = ['下層・市場', '中層・歯車回廊', '上層・鐘楼'];

function fillEnemies(layoutName, floor, rng) {
  const t = FLOOR_ENEMIES[floor];
  const rows = LAYOUTS[layoutName];
  const slots = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'g' || c === 'a' || c === 't') slots.push({ c, x, y }); }));
  const chosen = slots.filter(() => rng.next() < t.fill);
  // 最低数を保証
  for (const s of rng.shuffle(slots)) { if (chosen.length >= Math.min(t.min, slots.length)) break; if (!chosen.includes(s)) chosen.push(s); }
  return chosen.map((s) => ({ type: rng.pick(t[s.c]), x: s.x, y: s.y }));
}

function rollReward(rng) {
  const r = rng.next();
  return r < 0.62 ? 'boon' : r < 0.86 ? 'heal' : 'hourglass';
}

// 周回の塔の構成を作る。seed は揺らぎだけに使い、因果は meta から決める。
export function buildPlan(meta, seed) {
  const rng = makeRng(seed);
  const floors = [];
  // 下層
  const p0 = rng.shuffle(COMBAT_POOLS[0]);
  floors.push([
    { type: 'entry', layout: 'entry' },
    combat(p0[0], 0, rng), combat(p0[1], 0, rng),
    { type: 'forge', layout: 'forge' },
    combat(p0[2], 0, rng),
  ]);
  // 中層
  const p1 = rng.shuffle(COMBAT_POOLS[1]);
  floors.push([
    combat(p1[0], 1, rng),
    { type: 'elite', layout: 'arena', knightWedged: hasWedge(meta, 'knight') },
    { type: 'archive', layout: 'archive' },
    combat(p1[1], 1, rng),
  ]);
  // 上層
  const p2 = rng.shuffle(COMBAT_POOLS[2]);
  floors.push([
    combat(p2[0], 2, rng),
    { type: 'study', layout: 'study' },
    { type: 'boss', layout: 'belfry' },
  ]);
  // 各部屋の報酬（入る前に扉で見える）
  for (const f of floors) for (const r of f) {
    if (r.type === 'combat') r.rewardChoices = [rollReward(rng), rollReward(rng)];
    if (r.type === 'combat' && r.rewardChoices[0] !== 'boon' && r.rewardChoices[1] !== 'boon') r.rewardChoices[0] = 'boon';
  }
  return { seed, floors, offerSeed: rng.int(1, 1e9) };
}

function combat(layout, floor, rng) {
  return { type: 'combat', layout, enemies: fillEnemies(layout, floor, rng) };
}
