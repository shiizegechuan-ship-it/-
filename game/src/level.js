// 経験値とレベル。レベルはその夜だけのもの（夜が戻ると Lv1 から）。
// 敵を倒すと経験値。レベルが上がるたびに HP・攻撃・会心が少しずつ伸び、5 レベルごとに稀少の強化を選べる。
export const LEVEL = {
  hpPer: 6, // 最大HP +6 / Lv
  atkPer: 0.05, // 与ダメージ +5% / Lv
  critPer: 0.005, // 会心率 +0.5% / Lv
  healOnUp: 0.2, // レベルアップで最大HPの 20% 回復
  rareEvery: 5,
};
// 次のレベルまでに必要な経験値
export const expToNext = (lv) => Math.round(16 + 8 * lv + 0.5 * lv * lv);
const BASE_EXP = { squire: 3, mallet: 10, beamer: 9, chain: 9, rat: 6, hopper: 10, soldier: 8, bat: 7, turret: 6, roller: 9, archer: 8, phantom: 11, bell: 12, knight: 70 };
// 倒した敵の経験値（夜が深いほど多い）
export function expFor(e, scale) {
  return Math.round((BASE_EXP[e.kind] || 8) * (e.elite ? 2 : 1) * (1 + 0.25 * (scale ? scale.level : 0)));
}
// レベルによる上乗せ
export function levelBonus(lv) {
  const n = Math.max(0, lv - 1);
  return { hp: LEVEL.hpPer * n, atk: 1 + LEVEL.atkPer * n, crit: LEVEL.critPer * n };
}
