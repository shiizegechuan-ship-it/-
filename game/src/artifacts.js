// アーティファクト：特殊効果を持つ品。その夜だけ有効（夜が戻ると失われる）。
// 通常（扉の報酬・ショップ）と黄金（黄金の部屋でのみ手に入る強いもの）がある。
export const ARTIFACTS = {
  whetstone: { rarity: 'normal', name: '鍛冶屋の砥石', desc: 'すべての与ダメージ +15%' },
  guardgear: { rarity: 'normal', name: '守りの歯車', desc: '受けるダメージ -15%' },
  purse: { rarity: 'normal', name: '商人の財布', desc: '敵から得る金貨 +50%' },
  vial: { rarity: 'normal', name: '薬師の小瓶', desc: 'すべての回復量 +40%' },
  springboots: { rarity: 'normal', name: '跳ね靴', desc: '空中ジャンプの回数 +1（3段ジャンプ）' },
  pocketwatch: { rarity: 'normal', name: '錆びた懐中時計', desc: '秒針ゲージのたまり方 +30%' },
  huntereye: { rarity: 'normal', name: '狩人の目', desc: '会心率 +10%' },
  bellshard: { rarity: 'normal', name: '鐘の欠片', desc: '敵のいる部屋に入ると、周囲に鐘の衝撃（40）' },
  kingsword: { rarity: 'gold', name: '王者の剣', desc: 'すべての与ダメージ ×1.4、会心ダメージ +50%' },
  timeheart: { rarity: 'gold', name: '時の心臓', desc: '最大HP +80。毎秒、最大HPの0.5%回復' },
  twinfang: { rarity: 'gold', name: '双牙', desc: '直接攻撃が 30% の確率でもう一度当たる' },
  starmap: { rarity: 'gold', name: '星界の地図', desc: '常時の術のダメージ ×1.5（脅威は増えない）' },
  goldhand: { rarity: 'gold', name: '黄金の秒針', desc: '連撃の速さ +25%' },
  aegis: { rarity: 'gold', name: '不滅の歯車', desc: 'この夜に一度だけ、倒れてもHP100%で立ち上がる' },
  stormcrown: { rarity: 'gold', name: '雷冠', desc: '2.5秒ごとに近くの敵へ雷が落ちる（50）' },
};
export const ARTIFACT_COLOR = { normal: '#7fe0d0', gold: '#ffd84a' };

// まだ持っていないものから n 個（rarity で絞る）
export function rollArtifacts(rng, owned, rarity, n) {
  const ids = Object.keys(ARTIFACTS).filter((id) => ARTIFACTS[id].rarity === rarity && !owned.includes(id));
  return rng.shuffle(ids).slice(0, n);
}

// 強化から計算した能力値に、アーティファクトの効果を重ねる
export function applyArtifacts(s, arts) {
  const has = (id) => arts.includes(id);
  s.artifacts = arts.slice();
  s.dmgTaken = has('guardgear') ? 0.85 : 1;
  s.goldMul = has('purse') ? 1.5 : 1;
  s.healMul = has('vial') ? 1.4 : 1;
  s.extraAirJumps = has('springboots') ? 1 : 0;
  s.bellshard = has('bellshard');
  s.hpAdd = has('timeheart') ? 80 : 0;
  s.regen = has('timeheart') ? 0.005 : 0;
  s.twinfang = has('twinfang') ? 0.3 : 0;
  s.passiveMul = has('starmap') ? 1.5 : 1;
  s.aegis = has('aegis');
  s.stormcrown = has('stormcrown');
  if (has('whetstone')) s.dmgMul *= 1.15;
  if (has('kingsword')) { s.dmgMul *= 1.4; s.critMul += 0.5; }
  if (has('pocketwatch')) s.gaugeMul *= 1.3;
  if (has('huntereye')) s.critChance += 0.1;
  if (has('goldhand')) s.comboSpeed *= 1.25;
  return s;
}
