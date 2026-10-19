// 「完璧に動けば当たらないか」を調べる：刻守・白き刻守の技ごとに、走る・跳ぶ・回避（向きと時機）の組み合わせを
// たくさん試し、1 つでも無傷で済む動き方があるかを見る。回避の待ち時間・無敵時間・走る速さは実際のゲームのまま。
// 使い方: node tools/dev/avoid.mjs <難易度> [試す数] [技,技,...]
import { newGame, Driver } from '../../tests/helpers.mjs';
import { makeRng, cx } from '../../src/util.js';
let diff = 'nightmare';
const BASE = ['swing', 'hands', 'leap', 'stop'], FINAL = ['rain', 'rings', 'triple', 'dash', 'nova', 'judge'];
const PAIRS = [['triple', 'dash'], ['nova', 'judge'], ['rain', 'dash'], ['rings', 'triple'], ['judge', 'nova'], ['dash', 'triple'], ['leap', 'swing'], ['swing', 'swing']];
const OFFS = [-300, -170, -70, 70, 170, 300];

function setup(final, brake, offset, seed) {
  // diff はモジュールの変数（canAvoid・コマンドの引数で決める）
  const g = newGame(seed); g.meta.difficulty = diff; g.meta.loop = 3; g.startLoop(); g.modal = null;
  g.enterRoom(2, g.run.plan.floors[2].findIndex((r) => r.type === 'boss')); g.modal = null; g.transition = null;
  const b = g.room.boss;
  b.brake = brake; b.phase = 3;
  if (final) { b.trueDuel = true; b.brake = true; g.beginFinalForm(b); g.modal = null; }
  for (const e of g.room.enemies) if (e !== b) e.alive = false; // 護衛は除いて、刻守の技だけを調べる
  b.x = g.map.pxW / 2 - b.w / 2;
  const p = g.player;
  g.room.quake = null; g.run.diff = { ...g.run.diff, quake: false }; // 床の揺れは別に調べる（赤く光ったら跳べば当たらない）
  p.x = Math.max(20, Math.min(g.map.pxW - 40, cx(b) + offset - p.w / 2)); p.y = b.y + b.h - p.h; p.vx = p.vy = 0;
  const d = new Driver(g);
  d.frame(2); b.setState('idle'); b.cool = 99; g.room.projectiles = [];
  return { g, b, p, d };
}
// 動き方：0.05〜0.45 秒の区切りごとに、左右（または止まる）と、跳ぶ・回避をランダムに選ぶ
function program(rng) {
  const segs = []; let t = 0;
  while (t < 7) { const len = 3 + Math.floor(rng.next() * 25); segs.push({ len, dir: ['left', 'right', null][Math.floor(rng.next() * 3)], jump: rng.next() < 0.3, dodge: rng.next() < 0.35, down: rng.next() < 0.1 }); t += len / 60; }
  return segs;
}
function trial(moves, final, brake, offset, seed, rng) {
  const { g, b, p, d } = setup(final, brake, offset, seed);
  const segs = program(rng);
  let si = 0, sf = 0, mi = 0, f = 0, doneT = -1;
  // 技は順に出す。次の技までの休みは実際のゲームどおり（技の後の隙＋待ち時間）で、乱数はいつも「いちばん短い・いちばん厳しい」側
  b.rng.pick = () => moves[Math.min(mi++, moves.length - 1)];
  b.rng.next = () => 0;
  b.cool = 0; b.chooseMove(g, Math.abs(cx(p) - cx(b)));
  while (f < 60 * 9) {
    const s = segs[Math.min(si, segs.length - 1)], held = [];
    if (s.dir) held.push(s.dir);
    if (sf === 0 && s.jump) held.push('jump');
    if (sf === 0 && s.dodge) held.push('dodge');
    if (s.down) held.push('down');
    if (g.modal) g.modal = null;
    p.hp = p.maxHp; const hp0 = p.hp;
    d.frame(1, held); f++;
    if (++sf >= s.len) { sf = 0; si++; }
    if (p.hp < hp0) return false;
    if (mi >= moves.length && (b.state === 'idle' || b.state === 'recover')) { b.cool = 99; if (b.state === 'recover') b.recT = 99; if (doneT < 0) doneT = f; }
    if (doneT >= 0 && !g.room.projectiles.length && f - doneT > 60) return true;
  }
  return true;
}
// その技（の並び）に、無傷で済む動き方が見つかったら、何回目の試行かを返す（見つからなければ -1）
export function canAvoid(moves, { final = false, brake = true, offset = 100, tries = 300, difficulty = 'nightmare', seed = 12345 } = {}) {
  diff = difficulty;
  const rng = makeRng(seed);
  for (let i = 0; i < tries; i++) if (trial(moves, final, brake, offset, 777 + i % 5, rng)) return i + 1;
  return -1;
}
export { BASE, FINAL, PAIRS, OFFS };

if (process.argv[1] && process.argv[1].endsWith('avoid.mjs')) {
  const [d = 'nightmare', triesArg = '300', only] = process.argv.slice(2);
  const cases = [];
  for (const m of BASE) cases.push({ moves: [m], final: false, brake: m !== 'stop' });
  for (const m of FINAL) cases.push({ moves: [m], final: true, brake: true });
  for (const pr of PAIRS) cases.push({ moves: pr, final: FINAL.includes(pr[0]) || FINAL.includes(pr[1]), brake: true });
  for (const c of cases) {
    if (only && !c.moves.some((m) => only.split(',').includes(m))) continue;
    const res = OFFS.map((off) => { const n = canAvoid(c.moves, { final: c.final, brake: c.brake, offset: off, tries: +triesArg, difficulty: d }); return n > 0 ? `${off}:○(${n})` : `${off}:×`; });
    console.log(`${c.moves.join('→').padEnd(14)} ${res.join(' ')}`);
  }
}
