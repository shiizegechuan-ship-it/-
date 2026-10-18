// 選択画面の配置（描画とタップ判定で同じ値を使う）
import { VIEW_W, VIEW_H } from './config.js';
import { clamp } from './util.js';

// 中断メニューとタイトルの項目の位置（1 行目の文字の下端と行の間隔）
export const PAUSE = { y: 184, step: 30 };
export const TITLE_MENU = { y: 384, step: 24 };
export const LB = { x: 100, y: 40, w: VIEW_W - 200, h: VIEW_H - 80, top: 120, rowH: 38, rows: 8 };
// 表示の先頭行。選んでいる行が枠から出たときだけ送る（st.scroll に覚える）
export function lbStart(n, sel, st) {
  let s = st && st.scroll != null ? st.scroll : 0;
  if (sel < s) s = sel;
  if (sel >= s + LB.rows) s = sel - LB.rows + 1;
  s = clamp(s, 0, Math.max(0, n - LB.rows));
  if (st) st.scroll = s;
  return s;
}
// タップ位置の行（無ければ -1、枠の外なら -2）
export function lbRowAt(n, sel, x, y, st) {
  if (x < LB.x || x > LB.x + LB.w || y < LB.y || y > LB.y + LB.h) return -2;
  const start = lbStart(n, sel, st);
  const i = Math.floor((y - (LB.top - 26)) / LB.rowH);
  if (i < 0 || i >= Math.min(LB.rows, n - start)) return -1;
  return start + i;
}
// 巻き戻り画面の選択肢（2 列）の位置
export function rewindGrid(n) {
  const cw = 330, gap = 24, rowH = 38;
  const rows = Math.ceil(n / 2);
  return { x: VIEW_W / 2 - cw - gap / 2 + 12, y: VIEW_H - 30 - rows * rowH + 18, cw, gap, rowH };
}
// 強化・アーティファクトのカードの位置（横 1 列。候補は最大 4 枚：選択の刻印で 4 枚）
export function cardRects(n) {
  const cw = n > 3 ? 214 : 250, gap = 18, total = n * cw + (n - 1) * gap;
  return { cols: n, rects: Array.from({ length: n }, (_, i) => ({ x: VIEW_W / 2 - total / 2 + i * (cw + gap), y: 140, w: cw, h: 270 })) };
}
