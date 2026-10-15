// 強化（祝福）。3系統 + 危険。数を絞り、組み合わせで戦い方が変わることを優先する。
export const SCHOOLS = {
  haste: { name: '加速', color: '#5fd18b' },
  stasis: { name: '停滞', color: '#5aa9e6' },
  echo: { name: '残響', color: '#b67cf0' },
  risk: { name: '危険', color: '#e35d5d' },
  power: { name: '火力', color: '#ff9a3c' },
  arts: { name: '術', color: '#ff6ad5' },
  rare: { name: '稀少', color: '#ffd84a' },
};
const pc = (n) => `${Math.round(n)}%`;

export const BOONS = {
  afterimage: { school: 'haste', name: '残影の一撃', desc: (t) => `回避後${t > 1 ? 0.8 : 0.6}秒以内の初撃が +${t > 1 ? 100 : 60}%` },
  gale: { school: 'haste', name: '疾風', desc: (t) => `回避の距離 +${t > 1 ? 50 : 35}%、再使用 -${t > 1 ? 45 : 30}%` },
  fourth: { school: 'haste', name: '四の型', desc: (t) => `連撃に4段目（回転斬り ${t > 1 ? 38 : 26}）が加わる` },
  keeneye: { school: 'haste', name: '刹那の眼', desc: (t) => `ジャスト回避の受付 +${t > 1 ? 8 : 5}F、成功時に回避が即再使用可` },
  lag: { school: 'stasis', name: '遅延の刃', desc: (t) => `攻撃が敵を ${t > 1 ? 2.2 : 1.5}秒 遅くする（速度-40%）` },
  shatter: { school: 'stasis', name: '粉砕', desc: (t) => `遅い敵への重撃が ×${t > 1 ? 2.6 : 2}、盾も砕く` },
  longsec: { school: 'stasis', name: '長い一秒', desc: (t) => `時歪の持続 +${t > 1 ? 1.5 : 1}秒、消費 -${t > 1 ? 40 : 25}%` },
  freeze: { school: 'stasis', name: '凍刻', desc: (t) => `ジャスト回避で周囲の敵を ${t > 1 ? 3 : 2}秒 遅くする` },
  echo: { school: 'echo', name: '残響', desc: (t) => `命中した攻撃が0.45秒後に ${t > 1 ? 70 : 50}% で再命中` },
  mirror: { school: 'echo', name: '鏡像', desc: (t) => `被弾時、残像が周囲に ${t > 1 ? 45 : 30} の反撃` },
  reverb: { school: 'echo', name: '余韻', desc: (t) => `撃破時に残響が弾け、周囲に ${t > 1 ? 40 : 25}` },
  resonate: { school: 'echo', name: '共振', desc: (t) => `残響の命中で秒針ゲージ +${t > 1 ? 10 : 6}、HP +${t > 1 ? 2 : 1}` },
  sandglass: { school: 'risk', name: '砕けた砂時計', desc: () => '与ダメージ +40%。最大HP -30%' },
  inverted: { school: 'risk', name: '逆さ時計', desc: () => '通常回避の無敵が4Fに。ジャスト回避の受付+6F、成功後の一撃 ×3' },
  // 火力：取るたびに Lv が上がり、数字が伸びる（最大 Lv5）
  edge: { school: 'power', max: 5, name: '研ぎ澄まし', desc: (t) => `すべての与ダメージ +${pc(20 * t)}` },
  comboheat: { school: 'power', max: 5, name: '連撃の熱', desc: (t) => `コンボ1ごとの加算 +${t}%（基本 1% に上乗せ）` },
  heavyart: { school: 'power', max: 5, name: '重撃の極意', desc: (t) => `重撃のダメージ +${pc(40 * t)}` },
  crit: { school: 'power', max: 5, name: '会心', desc: (t) => `会心率 +${10 * t}%（会心は ×2）` },
  critdmg: { school: 'power', max: 5, name: '痛撃', desc: (t) => `会心ダメージ +${pc(50 * t)}` },
  execute: { school: 'power', max: 5, name: '処刑', desc: (t) => `HP35%以下の敵に +${pc(30 * t)}` },
  aerial: { school: 'power', max: 5, name: '空舞', desc: (t) => `空中攻撃 +${pc(35 * t)}` },
  bloodclock: { school: 'power', max: 5, name: '血の秒針', desc: (t) => `撃破ごとに この夜の与ダメージ +${2 * t}%（累積）` },
  opener: { school: 'power', max: 5, name: '先手', desc: (t) => `無傷の敵への一撃 +${pc(60 * t)}` },
  momentum: { school: 'power', max: 5, name: '勢い', desc: (t) => `走りながらの攻撃 +${pc(25 * t)}` },
  // 術：発動する術（V で放つ。装着は 1 つ、取り直すと Lv アップ）
  flamering: { school: 'arts', max: 5, active: true, name: '刻炎陣', desc: (t) => `[術] 周囲に炎の輪を3度広げる（${Math.round(22 * (1 + 0.4 * (t - 1)))}×3）ゲージ${40 - 3 * (t - 1)}` },
  starfall: { school: 'arts', max: 5, active: true, name: '星落とし', desc: (t) => `[術] 近くの敵に星を${4 + t}つ降らせる（各${Math.round(30 * (1 + 0.4 * (t - 1)))}）ゲージ${55 - 4 * (t - 1)}` },
  rewindblade: { school: 'arts', max: 5, active: true, name: '逆行の刃', desc: (t) => `[術] 前方へ飛ぶ巨大な斬撃。貫通（${Math.round(42 * (1 + 0.4 * (t - 1)))}）ゲージ${35 - 3 * (t - 1)}` },
  belltoll: { school: 'arts', max: 5, active: true, name: '鐘鳴', desc: (t) => `[術] 広がる鐘の衝撃で吹き飛ばし怯ませる（${Math.round(34 * (1 + 0.4 * (t - 1)))}）ゲージ${45 - 3 * (t - 1)}` },
  // 術：発動条件つき（自動で出る）
  secondhand: { school: 'arts', max: 5, name: '秒針の連斬', desc: (t) => `[条件] 10コンボごとに追尾する秒針を3本（各${Math.round(18 * (1 + 0.4 * (t - 1)))}）` },
  riposte: { school: 'arts', max: 5, name: '刹那返し', desc: (t) => `[条件] ジャスト回避で近くの敵を斬り抜ける（${Math.round(60 * (1 + 0.4 * (t - 1)))}）` },
  thunderbell: { school: 'arts', max: 5, name: '落雷の鐘', desc: (t) => `[条件] 重撃の命中に雷が落ち、もう1体へ連鎖（${Math.round(45 * (1 + 0.4 * (t - 1)))}）` },
  plunge: { school: 'arts', max: 5, name: '落下斬り', desc: (t) => `[条件] 空中で3回当てると急降下し、着地の衝撃波（${Math.round(32 * (1 + 0.4 * (t - 1)))}）` },
  // 術：常に発動（パッシブ）
  orbit: { school: 'arts', max: 5, name: '守りの秒針', desc: (t) => `[常時] 体のまわりを秒針が${1 + t}本回り、触れた敵を斬る（各${Math.round(8 * (1 + 0.4 * (t - 1)))}）` },
  aura: { school: 'arts', max: 5, name: '刻の灯火', desc: (t) => `[常時] 3秒ごとに周囲へ炎の波動（${Math.round(15 * (1 + 0.4 * (t - 1)))}）` },
  seeker: { school: 'arts', max: 5, name: '追尾星', desc: (t) => `[常時] 2.4秒ごとに追尾する秒針を放つ（${Math.round(20 * (1 + 0.4 * (t - 1)))}）` },
  chainlight: { school: 'arts', max: 5, name: '雷鎖', desc: (t) => `[常時] 4秒ごとに近くの敵へ雷が落ち、連鎖する（${Math.round(45 * (1 + 0.4 * (t - 1)))}）` },
  meteor: { school: 'arts', max: 5, name: '流星群', desc: (t) => `[常時] 3.5秒ごとに敵へ流星が${1 + t}つ降る（各${Math.round(24 * (1 + 0.4 * (t - 1)))}）` },
  frostnova: { school: 'arts', max: 5, name: '凍てつく刻', desc: (t) => `[常時] 5秒ごとに氷の波動。周囲を遅くする（${Math.round(20 * (1 + 0.4 * (t - 1)))}・${(1.2 + 0.3 * t).toFixed(1)}秒）` },
  swordrain: { school: 'arts', max: 5, name: '剣の雨', desc: (t) => `[常時] 4秒ごとに光の剣が${2 + t}本降り注ぐ（各${Math.round(22 * (1 + 0.4 * (t - 1)))}）` },
  gearsaw: { school: 'arts', max: 5, name: '歯車の鋸', desc: (t) => `[常時] 2.8秒ごとに回る歯車を投げる。行きと帰りに貫通（${Math.round(14 * (1 + 0.4 * (t - 1)))}×2）` },
  stormcloud: { school: 'arts', max: 5, name: '雷雲', desc: (t) => `[常時] 頭上の雷雲が${(1.6 - 0.15 * t).toFixed(2)}秒ごとに敵を撃つ（${Math.round(16 * (1 + 0.4 * (t - 1)))}）` },
  wake: { school: 'arts', max: 5, name: '残光の轍', desc: (t) => `[常時] 走った跡に炎が残り、触れた敵を焼く（${Math.round(7 * (1 + 0.4 * (t - 1)))}／0.4秒）` },
  // 稀少：レベル 5 ごとに選べる特別な強化。通常の候補には出ない
  crown: { school: 'rare', name: '時の王冠', desc: () => 'すべての与ダメージ ×1.5' },
  goldeye: { school: 'rare', name: '黄金の眼', desc: () => '会心率 +25%、会心ダメージ +100%' },
  phoenix: { school: 'rare', name: '不死鳥の砂時計', desc: () => 'この夜に一度だけ、倒れてもHP50%で立ち上がる' },
  starheart: { school: 'rare', name: '星の心臓', desc: () => '常時の術がすべて 1.7 倍の速さで発動する' },
  stormstep: { school: 'rare', name: '雷の歩法', desc: () => '回避するたび、近くの敵に雷が落ちる（60）' },
  lifesteal: { school: 'rare', name: '吸命の刃', desc: () => '直接攻撃の命中で、与えたダメージの3%だけHPが回復（1回につき最大HPの2%まで）' },
  eternal: { school: 'rare', name: '永劫の連撃', desc: () => 'コンボが時間で途切れなくなり、コンボ加算が2倍（被弾では途切れる）' },
  wave: { school: 'rare', name: '斬撃波', desc: () => '地上の攻撃のたびに、前へ飛ぶ斬撃波が出る（30・貫通）' },
  lastlight: { school: 'arts', max: 5, name: '残り火', desc: (t) => `[条件] HP30%以下のとき、命中した敵が炎を噴く（${Math.round(12 * (1 + 0.4 * (t - 1)))}）` },
};
// 常に発動する術の一覧。種類を多く持つほど、すべての常時の術が強くなる（術の共鳴）
export const PASSIVE_IDS = ['orbit', 'aura', 'seeker', 'chainlight', 'meteor', 'frostnova', 'swordrain', 'gearsaw', 'stormcloud', 'wake'];
export const passiveSynergy = (n) => 1 + 0.15 * Math.max(0, n - 1);
for (const id of PASSIVE_IDS) { const d = BOONS[id].desc; BOONS[id].desc = (t) => d(t) + '（常時の術が多いほど強化）'; }
export const boonMax = (id) => BOONS[id].max || 2;

// 共鳴（同系統2つ）
export const RESONANCE = {
  haste: '移動 +10%、連撃の速さ +15%',
  stasis: '遅い敵の予備動作が 30% 長くなる',
  echo: '残響の威力 +25%',
  power: '会心率 +5%',
  arts: '命中時の秒針ゲージ +50%',
};
// 系統をまたぐ相乗効果（説明用。効果自体は個別の強化の組み合わせで自然に起きるものも含む）
export const CROSS = [
  { a: 'lag', b: 'echo', text: '遅い敵には残響が2回当たる' },
  { a: 'afterimage', b: 'echo', text: '残影の一撃の残響も強化される' },
  { a: 'freeze', b: 'shatter', text: 'ジャスト回避 → 即粉砕の流れ' },
  { a: 'keeneye', b: 'inverted', text: 'ジャスト回避が狙いやすくなる' },
];

export function schoolCounts(boons) {
  const c = { haste: 0, stasis: 0, echo: 0, risk: 0, power: 0, arts: 0 };
  for (const b of boons) c[BOONS[b.id].school]++;
  return c;
}

// 手持ち強化から戦闘用の数値をまとめる
export function computeStats(boons) {
  const has = {};
  for (const b of boons) has[b.id] = b.tier || 1;
  const counts = schoolCounts(boons);
  const t = (id) => has[id] || 0;
  const s = {
    has,
    counts,
    dmgMul: (t('sandglass') ? 1.4 : 1) * (t('crown') ? 1.5 : 1),
    maxHpMul: t('sandglass') ? 0.7 : 1,
    afterimageTime: t('afterimage') ? (t('afterimage') > 1 ? 0.8 : 0.6) : 0,
    afterimageMul: t('afterimage') ? (t('afterimage') > 1 ? 2.0 : 1.6) : 1,
    dodgeDistMul: t('gale') ? (t('gale') > 1 ? 1.5 : 1.35) : 1,
    dodgeCdMul: t('gale') ? (t('gale') > 1 ? 0.55 : 0.7) : 1,
    fourth: t('fourth'),
    fourthDmg: t('fourth') > 1 ? 38 : 26,
    perfectBonus: (t('keeneye') ? (t('keeneye') > 1 ? 8 : 5) : 0) + (t('inverted') ? 6 : 0),
    perfectResetsDodge: !!t('keeneye'),
    dodgeIframes: t('inverted') ? 4 / 60 : null,
    perfectNextMul: t('inverted') ? 3 : 1,
    lagTime: t('lag') ? (t('lag') > 1 ? 2.2 : 1.5) : 0,
    shatterMul: t('shatter') ? (t('shatter') > 1 ? 2.6 : 2) : 1,
    skillTimeAdd: t('longsec') ? (t('longsec') > 1 ? 1.5 : 1) : 0,
    skillCostMul: t('longsec') ? (t('longsec') > 1 ? 0.6 : 0.75) : 1,
    freezeTime: t('freeze') ? (t('freeze') > 1 ? 3 : 2) : 0,
    echoMul: t('echo') ? (t('echo') > 1 ? 0.7 : 0.5) * (counts.echo >= 2 ? 1.25 : 1) : 0,
    mirrorDmg: t('mirror') ? (t('mirror') > 1 ? 45 : 30) : 0,
    reverbDmg: t('reverb') ? (t('reverb') > 1 ? 40 : 25) : 0,
    resonateGauge: t('resonate') ? (t('resonate') > 1 ? 10 : 6) : 0,
    resonateHeal: t('resonate') ? (t('resonate') > 1 ? 2 : 1) : 0,
    moveMul: counts.haste >= 2 ? 1.1 : 1,
    comboSpeed: counts.haste >= 2 ? 1.15 : 1,
    slowWindupMul: counts.stasis >= 2 ? 1.3 : 1,
    doubleEchoOnSlow: !!(t('lag') && t('echo')),
    // 火力
    edgeMul: 1 + 0.2 * t('edge'),
    comboPer: 0.01 * (1 + t('comboheat')) * (t('eternal') ? 2 : 1),
    // 稀少
    phoenix: !!t('phoenix'), passiveSpeed: t('starheart') ? 1.7 : 1, stormstep: !!t('stormstep'), lifesteal: t('lifesteal') ? 0.03 : 0, eternal: !!t('eternal'), wave: !!t('wave'),
    heavyMul: 1 + 0.4 * t('heavyart'),
    critChance: 0.1 * t('crit') + (counts.power >= 2 ? 0.05 : 0) + (t('goldeye') ? 0.25 : 0),
    critMul: 2 + 0.5 * t('critdmg') + (t('goldeye') ? 1 : 0),
    executeMul: 1 + 0.3 * t('execute'),
    airMul: 1 + 0.35 * t('aerial'),
    killStack: 0.02 * t('bloodclock'),
    openerMul: 1 + 0.6 * t('opener'),
    momentumMul: 1 + 0.25 * t('momentum'),
    // 術
    activeArt: boons.find((b) => BOONS[b.id].active) || null,
    procs: { secondhand: t('secondhand'), riposte: t('riposte'), thunderbell: t('thunderbell'), plunge: t('plunge'), lastlight: t('lastlight') },
    gaugeMul: counts.arts >= 2 ? 1.5 : 1,
    passives: Object.fromEntries(PASSIVE_IDS.map((id) => [id, t(id)])),
  };
  return s;
}

// 強化候補の抽出。乱数は周回ごとのもの（揺らぎ）。解放されていない系統は出ない。
// 強化候補の抽出。乱数は周回ごとのもの（揺らぎ）。解放されていない系統は出ない。
// 火力系統は手持ちでも Lv が上限未満なら「Lv アップ」として候補に出る。
export function rollOffer(rng, owned, unlockedSchools, n = 3) {
  const lv = Object.fromEntries(owned.map((b) => [b.id, b.tier || 1]));
  const pool = Object.keys(BOONS).filter((id) => unlockedSchools.includes(BOONS[id].school) && (!(id in lv) || (BOONS[id].max && lv[id] < BOONS[id].max)));
  // 手持ちの系統を少し出やすくして構築を成立させる
  const counts = schoolCounts(owned);
  const weighted = [];
  for (const id of pool) {
    const sc = BOONS[id].school;
    let w = sc === 'risk' ? 1 : 2 + (counts[sc] || 0) * 2;
    if (sc === 'power' || sc === 'arts') w = id in lv ? 3 : 2;
    // 常時の術は、持つほど出やすい（積み上げる楽しさ）
    if (PASSIVE_IDS.includes(id)) w += Math.min(4, owned.filter((b) => PASSIVE_IDS.includes(b.id)).length);
    for (let i = 0; i < w; i++) weighted.push(id);
  }
  const out = [];
  while (out.length < n && weighted.length) {
    const id = rng.pick(weighted);
    if (!out.includes(id)) out.push(id);
    for (let i = weighted.length - 1; i >= 0; i--) if (weighted[i] === id) weighted.splice(i, 1);
  }
  return out;
}

// 稀少の候補（まだ持っていないものから 3 つ）
export const RARE_IDS = Object.keys(BOONS).filter((id) => BOONS[id].school === 'rare');
export function rollRare(rng, owned, n = 3) {
  return rng.shuffle(RARE_IDS.filter((id) => !owned.some((b) => b.id === id))).slice(0, n);
}

// 選択肢カードに添える相乗効果のヒント
export function synergyHints(id, owned) {
  const hints = [];
  const sc = BOONS[id].school;
  const counts = schoolCounts(owned);
  const owns = owned.some((b) => b.id === id);
  if (sc !== 'risk' && RESONANCE[sc] && counts[sc] === 1 && !owns) hints.push(`共鳴成立：${RESONANCE[sc]}`);
  for (const c of CROSS) {
    const other = c.a === id ? c.b : c.b === id ? c.a : null;
    if (other && owned.some((b) => b.id === other)) hints.push(`相乗：${c.text}`);
  }
  return hints;
}
