// アーティファクト：特殊効果を持つ品。一度手に入れると夜が戻っても失われない（そのぶん出にくい）。
// 通常（扉の報酬・ショップ）と黄金（黄金の部屋でのみ手に入る強いもの）、伝説（結末で得る「記憶の固執」）がある。
import { tr } from './i18n.js';
export const ARTIFACTS = {
  whetstone: { rarity: 'normal', name: tr('鍛冶屋の砥石'), desc: tr('すべての与ダメージ +15%') },
  guardgear: { rarity: 'normal', name: tr('守りの歯車'), desc: tr('受けるダメージ -15%') },
  purse: { rarity: 'normal', name: tr('商人の財布'), desc: tr('敵から得る金貨 +50%') },
  vial: { rarity: 'normal', name: tr('薬師の小瓶'), desc: tr('すべての回復量 +40%') },
  springboots: { rarity: 'normal', name: tr('跳ね靴'), desc: tr('空中ジャンプの回数 +1（3段ジャンプ）') },
  pocketwatch: { rarity: 'normal', name: tr('錆びた懐中時計'), desc: tr('秒針ゲージのたまり方 +30%') },
  huntereye: { rarity: 'normal', name: tr('狩人の目'), desc: tr('会心率 +10%') },
  bellshard: { rarity: 'normal', name: tr('鐘の欠片'), desc: tr('敵のいる部屋に入ると、周囲に鐘の衝撃（40）') },
  kingsword: { rarity: 'gold', name: tr('王者の剣'), desc: tr('すべての与ダメージ ×1.4、会心ダメージ +50%') },
  timeheart: { rarity: 'gold', name: tr('時の心臓'), desc: tr('最大HP +40。毎秒、最大HPの0.5%回復') },
  twinfang: { rarity: 'gold', name: tr('双牙'), desc: tr('直接攻撃が 30% の確率でもう一度当たる') },
  starmap: { rarity: 'gold', name: tr('星界の地図'), desc: tr('常時の術のダメージ ×1.5（脅威は増えない）') },
  goldhand: { rarity: 'gold', name: tr('黄金の秒針'), desc: tr('連撃の速さ +25%') },
  aegis: { rarity: 'gold', name: tr('不滅の歯車'), desc: tr('この夜に一度だけ、倒れてもHP100%で立ち上がる') },
  stormcrown: { rarity: 'gold', name: tr('雷冠'), desc: tr('2.5秒ごとに近くの敵へ雷が落ちる（50）') },
  // 伝説：真の結末「夜明けの楔」を見ると得る（扉・店・黄金の部屋には出ない）
  persistence: { rarity: 'legend', name: tr('記憶の固執'), desc: tr('結末のあとの夜でも、強化・Lv・金貨を持ったまま次の夜へ。継承の刻印の上限が無くなる') },
};
export const ARTIFACT_COLOR = { normal: '#7fe0d0', gold: '#ffd84a', legend: '#ff9ad8' };

// まだ持っていないものから n 個（rarity で絞る）
export function rollArtifacts(rng, owned, rarity, n) {
  const ids = Object.keys(ARTIFACTS).filter((id) => ARTIFACTS[id].rarity === rarity && !owned.includes(id));
  return rng.shuffle(ids).slice(0, n);
}

// 強化から計算した能力値に、アーティファクトの効果を重ねる
export function applyArtifacts(s, arts) {
  const has = (id) => arts.includes(id);
  s.artifacts = arts.slice();
  s.dmgTaken = (s.dmgTaken || 1) * (has('guardgear') ? 0.85 : 1);
  s.goldMul = (s.goldMul || 1) * (has('purse') ? 1.5 : 1);
  s.healMul = has('vial') ? 1.4 : 1;
  s.extraAirJumps = has('springboots') ? 1 : 0;
  s.bellshard = has('bellshard');
  s.hpAdd = has('timeheart') ? 40 : 0;
  s.regen = has('timeheart') ? 0.005 : 0;
  s.twinfang = has('twinfang') ? 0.3 : 0;
  s.passiveMul = (s.passiveMul || 1) * (has('starmap') ? 1.5 : 1);
  s.aegis = has('aegis');
  s.stormcrown = has('stormcrown');
  if (has('whetstone')) s.dmgMul *= 1.15;
  if (has('kingsword')) { s.dmgMul *= 1.4; s.critMul += 0.5; }
  if (has('pocketwatch')) s.gaugeMul *= 1.3;
  if (has('huntereye')) s.critChance += 0.1;
  if (has('goldhand')) s.comboSpeed *= 1.25;
  return s;
}
