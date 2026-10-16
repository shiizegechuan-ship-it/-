// 夜ごとの様相：夜が重なるほど、塔と空の見た目が変わっていく（物語の時間の経過を目で見せる）
//  2〜3夜：青く沈む。壁にひびが入りはじめる
//  4〜5夜：月が赤みを帯び、色が赤茶に沈む
//  6夜〜 ：大きな赤い月。塔はひび割れだらけ
//  夜明け後：白みはじめた空（青みがかった色）
import { rect, pset, disc, line } from './pix.js';
import { hash2 } from './pix.js';

export function nightStage(meta) {
  if (!meta) return 0;
  return Math.min(7, Math.max(0, meta.loop - 1));
}
export function nightLook(meta) {
  const n = nightStage(meta);
  if (meta && meta.flags && meta.flags.ending) return { n, weather: 'dawn', tint: 'rgba(120,150,210,0.10)', moon: null, cracks: 0.04, note: '夜明けを知った塔。空の端が、かすかに白い。' };
  if (n === 0) return { n, weather: null, tint: null, moon: null, cracks: 0, note: '' };
  if (n <= 2) return { n, weather: 'rain', tint: `rgba(50,80,150,${0.06 + 0.02 * n})`, moon: null, cracks: 0.04 * n, note: n === 1 ? '空が青く沈んでいる。鐘の音が、どこか濁っている。' : '石壁に、細いひびが走りはじめた。' };
  if (n <= 4) return { n, weather: 'ash', tint: `rgba(150,60,40,${0.1 + 0.02 * (n - 3)})`, moon: '#d88a6a', cracks: 0.1 + 0.04 * (n - 3), note: n === 3 ? '空気が焦げくさい。どこかで、時が燃えている。' : '月が赤みを帯びてきた。塔のきしむ音が大きくなる。' };
  return { n, weather: 'shards', tint: `rgba(170,20,40,${Math.min(0.18, 0.13 + 0.02 * (n - 5))})`, moon: '#ff5a4a', cracks: Math.min(0.32, 0.2 + 0.04 * (n - 5)), lightning: true, note: n === 5 ? '赤い月が昇った。塔の歯車が、きしみをあげている。' : '塔はひび割れだらけだ。残された夜は少ない。' };
}

// 空の上に重ねる：赤い月（背景の後、タイルの前に描く）
export function drawSkyLook(b, look, W, H, t) {
  if (!look.moon) return;
  const x = W - 54, y = 28, r = look.n >= 5 ? 13 : 10;
  b.globalAlpha = 0.25; disc(b, x, y, r + 5, look.moon); b.globalAlpha = 0.9;
  disc(b, x, y, r, look.moon); disc(b, x - 3, y - 2, 3, 'rgba(0,0,0,0.25)'); disc(b, x + 4, y + 3, 2, 'rgba(0,0,0,0.2)');
  b.globalAlpha = 1;
}

// タイルのひび（決定的な位置。夜が進むほど増える）
export function crackAt(tx, ty, look) {
  return look.cracks > 0 && hash2(tx, ty, 77) < look.cracks;
}
export function drawCrack(b, x, y, ts, tx, ty) {
  const h = hash2(tx, ty, 91);
  const sx = x + 2 + Math.floor(h * (ts - 6)), sy = y + 2 + Math.floor(hash2(tx, ty, 13) * (ts - 6));
  pset(b, sx, sy, '#0a0610'); pset(b, sx + 1, sy + 1, '#0a0610'); pset(b, sx + 1, sy + 2, '#0a0610'); pset(b, sx + 2, sy + 2, '#0a0610');
  if (h > 0.5) { pset(b, sx - 1, sy + 3, '#0a0610'); pset(b, sx + 3, sy + 1, '#0a0610'); }
}

// 画面全体の色味（ワールドを描いたあと、画面座標で重ねる）。
// 雨・灰・破片などの降り物は画面が見えにくくなるだけなので描かない。夜ごとの変化は色味・月・壁のひびで見せる
export function drawWeather(b, look, W, H, t) {
  if (look.tint) { b.fillStyle = look.tint; b.fillRect(0, 0, W, H); }
}
