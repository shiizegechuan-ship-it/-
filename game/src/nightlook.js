// 夜ごとの様相：夜が重なるほど、塔と空の見た目が変わっていく（物語の時間の経過を目で見せる）
//  2〜3夜：冷たい雨。壁にひびが入りはじめる
//  4〜5夜：灰が舞う。月が赤みを帯び、色が赤く沈む
//  6夜〜 ：赤い月。歯車の破片が雪のように降り、遠雷が光る。塔はひび割れだらけ
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
  if (n <= 2) return { n, weather: 'rain', tint: `rgba(50,80,150,${0.12 + 0.04 * n})`, moon: null, cracks: 0.04 * n, note: n === 1 ? '冷たい雨が降り出した。鐘の音が、雨に濁っている。' : '雨はやまない。石壁に、細いひびが走りはじめた。' };
  if (n <= 4) return { n, weather: 'ash', tint: `rgba(150,60,40,${0.16 + 0.04 * (n - 3)})`, moon: '#d88a6a', cracks: 0.1 + 0.04 * (n - 3), note: n === 3 ? '灰が舞っている。どこかで、時が燃えている。' : '月が赤みを帯びてきた。塔のきしむ音が大きくなる。' };
  return { n, weather: 'shards', tint: `rgba(170,20,40,${Math.min(0.3, 0.22 + 0.03 * (n - 5))})`, moon: '#ff5a4a', cracks: Math.min(0.32, 0.2 + 0.04 * (n - 5)), lightning: true, note: n === 5 ? '赤い月が昇った。歯車の破片が、雪のように降っている。' : '塔はひび割れだらけだ。遠くで雷が鳴る――残された夜は少ない。' };
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

// 画面全体の天気と色（ワールドを描いたあと、画面座標で重ねる）
export function drawWeather(b, look, W, H, t) {
  if (look.tint) { b.fillStyle = look.tint; b.fillRect(0, 0, W, H); }
  if (look.weather === 'rain') {
    b.globalAlpha = 0.45;
    for (let i = 0; i < 70; i++) {
      const x = ((i * 37.7 + t * 90) % (W + 20)) - 10, y = ((i * 53.3 + t * 260 + i * i) % (H + 20)) - 10;
      line(b, x, y, x - 2, y + 5, '#9fb4e0');
    }
  } else if (look.weather === 'ash') {
    for (let i = 0; i < 80; i++) {
      const x = ((i * 41.3 + t * 12 + Math.sin(t + i) * 8) % W + W) % W, y = ((i * 29.7 + t * (18 + (i % 5) * 4)) % H + H) % H;
      const ember = i % 4 === 0;
      b.globalAlpha = ember ? 0.55 + 0.35 * Math.sin(t * 6 + i) : 0.6;
      rect(b, Math.floor(x), Math.floor(y), i % 3 ? 1 : 2, i % 3 ? 1 : 2, ember ? '#ff9a4a' : '#e0d0c8');
    }
  } else if (look.weather === 'shards') {
    for (let i = 0; i < 40; i++) {
      const x = ((i * 47.1 + t * 18 + Math.sin(t * 0.7 + i) * 10) % W + W) % W, y = ((i * 31.9 + t * 30) % H + H) % H;
      b.globalAlpha = 0.6; pset(b, x, y, i % 3 ? '#c9a052' : '#ffe14a'); if (i % 5 === 0) pset(b, x + 1, y, '#8a6a34');
    }
    // 遠雷：ときどき空が白く光る
    if (look.lightning && Math.floor(t * 0.5) % 7 === 3 && (t * 0.5) % 1 < 0.06) { b.globalAlpha = 0.18; rect(b, 0, 0, W, H, '#e8e8ff'); }
  } else if (look.weather === 'dawn') {
    b.globalAlpha = 0.12; rect(b, 0, H - 40, W, 40, '#ffd38a');
  }
  b.globalAlpha = 1;
}
