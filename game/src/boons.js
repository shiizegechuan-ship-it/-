// 強化（祝福）。3系統 + 危険。数を絞り、組み合わせで戦い方が変わることを優先する。
export const SCHOOLS = {
  haste: { name: '加速', color: '#5fd18b' },
  stasis: { name: '停滞', color: '#5aa9e6' },
  echo: { name: '残響', color: '#b67cf0' },
  risk: { name: '危険', color: '#e35d5d' },
};

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
};

// 共鳴（同系統2つ）
export const RESONANCE = {
  haste: '移動 +10%、連撃の速さ +15%',
  stasis: '遅い敵の予備動作が 30% 長くなる',
  echo: '残響の威力 +25%',
};
// 系統をまたぐ相乗効果（説明用。効果自体は個別の強化の組み合わせで自然に起きるものも含む）
export const CROSS = [
  { a: 'lag', b: 'echo', text: '遅い敵には残響が2回当たる' },
  { a: 'afterimage', b: 'echo', text: '残影の一撃の残響も強化される' },
  { a: 'freeze', b: 'shatter', text: 'ジャスト回避 → 即粉砕の流れ' },
  { a: 'keeneye', b: 'inverted', text: 'ジャスト回避が狙いやすくなる' },
];

export function schoolCounts(boons) {
  const c = { haste: 0, stasis: 0, echo: 0, risk: 0 };
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
    dmgMul: t('sandglass') ? 1.4 : 1,
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
  };
  return s;
}

// 強化候補の抽出。乱数は周回ごとのもの（揺らぎ）。解放されていない系統は出ない。
export function rollOffer(rng, owned, unlockedSchools, n = 3) {
  const ownedIds = new Set(owned.map((b) => b.id));
  const pool = Object.keys(BOONS).filter((id) => !ownedIds.has(id) && unlockedSchools.includes(BOONS[id].school));
  // 手持ちの系統を少し出やすくして構築を成立させる
  const counts = schoolCounts(owned);
  const weighted = [];
  for (const id of pool) {
    const sc = BOONS[id].school;
    const w = sc === 'risk' ? 1 : 2 + (counts[sc] || 0) * 2;
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

// 選択肢カードに添える相乗効果のヒント
export function synergyHints(id, owned) {
  const hints = [];
  const sc = BOONS[id].school;
  const counts = schoolCounts(owned);
  if (sc !== 'risk' && counts[sc] === 1) hints.push(`共鳴成立：${RESONANCE[sc]}`);
  for (const c of CROSS) {
    const other = c.a === id ? c.b : c.b === id ? c.a : null;
    if (other && owned.some((b) => b.id === other)) hints.push(`相乗：${c.text}`);
  }
  return hints;
}
