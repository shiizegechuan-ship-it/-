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
  // 剣の道：素の攻撃を伸ばす（脅威を増やさない。飛ぶ斬撃は「連撃」扱いで、術の守りに阻まれない）
  swordqi: { school: 'power', max: 5, melee: true, name: '剣気', desc: (t) => `[剣] 地上の連撃を振るたび、剣気の斬撃が飛ぶ（${Math.round(14 * (1 + 0.4 * (t - 1)))}${t >= 3 ? '・2 本' : ''}）` },
  frenzy: { school: 'haste', max: 5, melee: true, name: '乱舞', desc: (t) => `[剣] 連撃が当たるたびに攻撃の速さ +${4 * t}%（最大 5 重・3 秒で切れる）` },
  zanshin: { school: 'power', max: 5, melee: true, name: '残心', desc: (t) => `[剣] 連撃の 3 段目以降が当たると、少し遅れて十字の追撃（${Math.round(34 * (1 + 0.4 * (t - 1)))}）` },
  greatsword: { school: 'power', max: 5, melee: true, name: '剛剣', desc: (t) => `[剣] 攻撃の当たり判定が +${15 * t}% 大きくなり、吹き飛ばしも強くなる` },
  crusher: { school: 'power', max: 5, melee: true, name: '破砕', desc: (t) => `[剣] 重撃が床を走る衝撃波を放つ（${Math.round(40 * (1 + 0.4 * (t - 1)))}）。溜め時間 -${8 * t}%` },
  skyrend: { school: 'power', max: 5, melee: true, name: '天裂', desc: (t) => `[剣] 上攻撃は真上へ、下攻撃は真下へ刃が飛ぶ（${Math.round(34 * (1 + 0.4 * (t - 1)))}）` },
  // 合成でしか得られない上位の強化（素材を両方 Lv2 以上で合成。Lv1 から始まるが素材より強い）
  gearwaltz: { school: 'arts', max: 5, fusion: true, name: '歯車の輪舞', desc: (t) => `[合成・常時] 大きな歯車が${4 + t}つ回り（各${Math.round(20 * (1 + 0.4 * (t - 1)))}）、2 秒ごとに左右へ歯車を投げる` },
  starblade: { school: 'arts', max: 5, fusion: true, name: '星剣の雨', desc: (t) => `[合成・常時] 2.5 秒ごとに星の剣が${4 + t}本、敵へ降り注いで爆ぜる（各${Math.round(60 * (1 + 0.4 * (t - 1)))}）` },
  thundergod: { school: 'arts', max: 5, fusion: true, name: '雷神の雲', desc: (t) => `[合成・常時] 頭上の雷雲が 0.7 秒ごとに雷を落とし、もう 1 体へ連鎖（${Math.round(34 * (1 + 0.4 * (t - 1)))}）` },
  inferno: { school: 'arts', max: 5, fusion: true, name: '劫火', desc: (t) => `[合成・常時] 2.5 秒ごとに炎の大輪が広がり、床を焼く（${Math.round(40 * (1 + 0.4 * (t - 1)))}＋床）` },
  icejail: { school: 'arts', max: 5, fusion: true, name: '氷針の牢', desc: (t) => `[合成・常時] 3 秒ごとに敵${3 + t}体の足元から氷の針。雑魚は凍えて遅くなる（${Math.round(60 * (1 + 0.4 * (t - 1)))}）` },
  earthpulse: { school: 'arts', max: 5, fusion: true, name: '大地の鼓動', desc: (t) => `[合成・常時] 2 秒ごとに大きな衝撃波が床を二度走る（${Math.round(45 * (1 + 0.4 * (t - 1)))}×2）` },
  swordsaint: { school: 'power', max: 5, fusion: true, melee: true, name: '剣聖', desc: (t) => `[合成・剣] 与ダメージ +${70 + 15 * (t - 1)}%、会心率 +${30 + 5 * (t - 1)}%。会心の一撃で斬撃が飛ぶ` },
  judgement: { school: 'power', max: 5, fusion: true, melee: true, name: '断罪', desc: (t) => `[合成・剣] 重撃 ×${(2.5 + 0.5 * (t - 1)).toFixed(1)}。HP25%以下の雑魚は重撃で即断ち、中ボス以上には +100%` },
  thousand: { school: 'power', max: 5, fusion: true, melee: true, name: '千刃', desc: (t) => `[合成・剣] コンボ1ごとの加算 +${2 + t}%。連撃のたびに剣気が 3 本飛ぶ（各${Math.round(16 * (1 + 0.4 * (t - 1)))}）` },
  // 派手な術（V で放つ）
  thunderstorm: { school: 'arts', max: 5, active: true, name: '雷霆', desc: (t) => `[術・全体] 画面じゅうに雷が降り注ぐ（1 本${Math.round(15 * (1 + 0.4 * (t - 1)))}、約${26 + 2 * t}本）ゲージ${55 - 4 * (t - 1)}` },
  heavenblade: { school: 'arts', max: 5, active: true, name: '天剣', desc: (t) => `[術] 手元から伸びる長大な剣が、背中から前へ大きく回って薙ぎ払う（${Math.round(50 * (1 + 0.4 * (t - 1)))}・届く長さ${380 + 20 * t}）ゲージ${45 - 3 * (t - 1)}` },
  prismbeam: { school: 'arts', max: 5, active: true, name: '光芒', desc: (t) => `[術] 前方へ七色の光線を放ち続け、触れた敵を焼き続ける（${Math.round(9 * (1 + 0.4 * (t - 1)))}／0.09秒・約1秒）ゲージ${50 - 3 * (t - 1)}` },
  novaorb: { school: 'arts', max: 5, active: true, name: '星核', desc: (t) => `[術] 大きな光の球をゆっくり放つ。触れた敵を削り、最後に大爆発（${Math.round(8 * (1 + 0.4 * (t - 1)))}／0.15秒＋爆発${Math.round(50 * (1 + 0.4 * (t - 1)))}）ゲージ${45 - 3 * (t - 1)}` },
  // 派手な常時の術
  satellites: { school: 'arts', max: 5, name: '衛星', desc: (t) => `[常時] 光の球が${2 + t}つ、尾を引いて体のまわりを大きく回る（各${Math.round(12 * (1 + 0.4 * (t - 1)))}）` },
  tornado: { school: 'arts', max: 5, name: '時の竜巻', desc: (t) => `[常時] 5 秒ごとに竜巻がゆっくり前へ進み、敵を吸い込んで削る（${Math.round(14 * (1 + 0.4 * (t - 1)))}／0.3秒）` },
  spinblade: { school: 'arts', max: 5, name: '旋剣', desc: (t) => `[常時] 3 秒ごとに、長い光の剣が手元を軸に 2 周する（1 周ごとに${Math.round(26 * (1 + 0.4 * (t - 1)))}・長さ150）` },
  galaxy: { school: 'arts', max: 5, fusion: true, name: '銀河の渦', desc: (t) => `[合成・常時] 大きな星が${5 + t}つ回り（各${Math.round(22 * (1 + 0.4 * (t - 1)))}）、4 秒ごとに足元へ星雲の渦が生まれて敵を吸い込む` },
  clockhand: { school: 'arts', max: 5, fusion: true, name: '時計の長針', desc: (t) => `[合成・常時] 長さ 220 の光の長針が、手元を軸に絶えず回り続ける（${Math.round(26 * (1 + 0.4 * (t - 1)))}）` },
  // 部屋全体を攻める術（威力は低め。合成で強くなる）
  timequake: { school: 'arts', max: 5, active: true, name: '刻震', desc: (t) => `[術・全体] 部屋じゅうの敵を時の震えが打つ（${Math.round(16 * (1 + 0.4 * (t - 1)))}）。雑魚は一瞬怯む ゲージ${60 - 4 * (t - 1)}` },
  tolling: { school: 'arts', max: 5, name: '遠鐘', desc: (t) => `[常時・全体] 6 秒ごとに鐘が遠く鳴り、部屋じゅうの敵に響く（${Math.round(6 * (1 + 0.4 * (t - 1)))}）` },
  starfield: { school: 'arts', max: 5, name: '星屑', desc: (t) => `[常時・全体] 5 秒ごとに、部屋じゅうの敵の頭上へ星屑が落ちる（各${Math.round(8 * (1 + 0.4 * (t - 1)))}）` },
  celestial: { school: 'arts', max: 5, fusion: true, name: '天球の鐘', desc: (t) => `[合成・常時・全体] 3 秒ごとに天の鐘が鳴り、部屋じゅうの敵に星が降る（各${Math.round(28 * (1 + 0.4 * (t - 1)))}）` },
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
  // 床を攻める常時の術
  quakeline: { school: 'arts', max: 5, name: '地走り', desc: (t) => `[常時] 3秒ごとに足元から左右へ衝撃波が床を走る（${Math.round(18 * (1 + 0.4 * (t - 1)))}）` },
  spikes: { school: 'arts', max: 5, name: '時針の剣山', desc: (t) => `[常時] 4秒ごとに近くの敵${2 + t}体の足元から針が突き出す（${Math.round(30 * (1 + 0.4 * (t - 1)))}）` },
  emberfloor: { school: 'arts', max: 5, name: '灼熱の床', desc: (t) => `[常時] 5秒ごとに周りの床が2秒燃え、上の敵を焼き続ける（${Math.round(7 * (1 + 0.4 * (t - 1)))}／0.3秒）` },
  lastlight: { school: 'arts', max: 5, name: '残り火', desc: (t) => `[条件] HP30%以下のとき、命中した敵が炎を噴く（${Math.round(12 * (1 + 0.4 * (t - 1)))}）` },
};
// 常に発動する術の一覧。種類を多く持つほど、すべての常時の術が強くなる（術の共鳴）
export const FUSED_PASSIVES = ['gearwaltz', 'starblade', 'thundergod', 'inferno', 'icejail', 'earthpulse', 'celestial', 'galaxy', 'clockhand'];
export const PASSIVE_IDS = ['orbit', 'aura', 'seeker', 'chainlight', 'meteor', 'frostnova', 'swordrain', 'gearsaw', 'stormcloud', 'wake', 'quakeline', 'spikes', 'emberfloor', 'tolling', 'starfield', 'satellites', 'tornado', 'spinblade', ...FUSED_PASSIVES];
// 合成のレシピ：素材 a と b を両方 Lv2 以上で持つと、上位の強化に合成できる
export const FUSIONS = [
  { a: 'orbit', b: 'gearsaw', to: 'gearwaltz' },
  { a: 'meteor', b: 'swordrain', to: 'starblade' },
  { a: 'stormcloud', b: 'chainlight', to: 'thundergod' },
  { a: 'aura', b: 'emberfloor', to: 'inferno' },
  { a: 'frostnova', b: 'spikes', to: 'icejail' },
  { a: 'quakeline', b: 'wake', to: 'earthpulse' },
  { a: 'edge', b: 'crit', to: 'swordsaint' },
  { a: 'heavyart', b: 'execute', to: 'judgement' },
  { a: 'comboheat', b: 'swordqi', to: 'thousand' },
  { a: 'tolling', b: 'starfield', to: 'celestial' },
  { a: 'satellites', b: 'tornado', to: 'galaxy' },
  { a: 'spinblade', b: 'orbit', to: 'clockhand' },
];
// 脅威の数え方：常時の術と剣の道の Lv の合計。合成したものは Lv +3（素材 2 つぶん）として数える
export const passiveWeight = (b) => (b.tier || 1) + (BOONS[b.id].fusion ? 3 : 0);
export const countsForThreat = (id) => PASSIVE_IDS.includes(id) || !!BOONS[id].melee;
export function readyFusions(boons) {
  const lv = Object.fromEntries(boons.map((b) => [b.id, b.tier || 1]));
  return FUSIONS.filter((f) => (lv[f.a] || 0) >= 2 && (lv[f.b] || 0) >= 2 && !lv[f.to]);
}
export const passiveSynergy = (n) => 1 + 0.15 * Math.max(0, n - 1);
for (const id of PASSIVE_IDS) { const d = BOONS[id].desc; BOONS[id].desc = (t) => d(t) + '（常時の術が多いほど強化）'; }
export const boonMax = (id) => BOONS[id].max || (BOONS[id].school === 'rare' || BOONS[id].school === 'risk' ? 1 : 2);
// 鍛冶で鍛えられるか：上限に達しておらず、鍛えると効果が実際に変わるものだけ
export const canForge = (b) => (b.tier || 1) < boonMax(b.id) && BOONS[b.id].desc(b.tier || 1) !== BOONS[b.id].desc((b.tier || 1) + 1);
// 鍛える前後の違いを「35%→50%」のように数字だけ並べて示す（文の形が違うときは前後の全文）
export function forgeDiff(id, tier) {
  const a = BOONS[id].desc(tier), b = BOONS[id].desc(tier + 1);
  const re = /\d+(?:\.\d+)?/g;
  const sa = a.split(re), sb = b.split(re), na = a.match(re) || [], nb = b.match(re) || [];
  if (sa.length !== sb.length || sa.some((x, i) => x !== sb[i])) return { now: a, next: b, diff: null };
  let out = sa[0];
  for (let i = 0; i < na.length; i++) out += (na[i] === nb[i] ? na[i] : `${na[i]}→${nb[i]}`) + sa[i + 1];
  return { now: a, next: b, diff: out };
}

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
  const c = { haste: 0, stasis: 0, echo: 0, risk: 0, power: 0, arts: 0, rare: 0 };
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
    dmgMul: (t('sandglass') ? 1.4 : 1) * (t('crown') ? 1.5 : 1) * (t('swordsaint') ? 1.7 + 0.15 * (t('swordsaint') - 1) : 1),
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
    // 剣の道
    swordqi: t('swordqi'), frenzy: t('frenzy'), zanshin: t('zanshin'), rangeMul: 1 + 0.15 * t('greatsword'), crusher: t('crusher'), chargeMul: 1 - 0.08 * t('crusher'), skyrend: t('skyrend'),
    swordsaint: t('swordsaint'), judgement: t('judgement'), thousand: t('thousand'),
    slowWindupMul: counts.stasis >= 2 ? 1.3 : 1,
    doubleEchoOnSlow: !!(t('lag') && t('echo')),
    // 火力
    edgeMul: 1 + 0.2 * t('edge'),
    comboPer: (0.01 * (1 + t('comboheat')) + (t('thousand') ? 0.01 * (2 + t('thousand')) : 0)) * (t('eternal') ? 2 : 1),
    // 稀少
    phoenix: !!t('phoenix'), passiveSpeed: t('starheart') ? 1.7 : 1, stormstep: !!t('stormstep'), lifesteal: t('lifesteal') ? 0.03 : 0, eternal: !!t('eternal'), wave: !!t('wave'),
    heavyMul: (1 + 0.4 * t('heavyart')) * (t('judgement') ? 2.5 + 0.5 * (t('judgement') - 1) : 1),
    critChance: 0.1 * t('crit') + (counts.power >= 2 ? 0.05 : 0) + (t('goldeye') ? 0.25 : 0) + (t('swordsaint') ? 0.3 + 0.05 * (t('swordsaint') - 1) : 0),
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
  // 合成でしか得られないもの・合成済みの素材は候補に出ない
  const usedUp = new Set(FUSIONS.filter((f) => f.to in lv).flatMap((f) => [f.a, f.b]));
  const pool = Object.keys(BOONS).filter((id) => !BOONS[id].fusion && !usedUp.has(id) && unlockedSchools.includes(BOONS[id].school) && (!(id in lv) || (BOONS[id].max && lv[id] < BOONS[id].max)));
  // 手持ちの系統を少し出やすくして構築を成立させる
  const counts = schoolCounts(owned);
  const weighted = [];
  for (const id of pool) {
    const sc = BOONS[id].school;
    let w = sc === 'risk' ? 1 : 2 + (counts[sc] || 0) * 2;
    if (sc === 'power' || sc === 'arts') w = id in lv ? 3 : 2;
    // 常時の術は、持つほど出やすい（積み上げる楽しさ）
    if (PASSIVE_IDS.includes(id)) w += Math.min(4, owned.filter((b) => PASSIVE_IDS.includes(b.id)).length);
    // 剣の道も、持つほど出やすい（素の攻撃のビルドを組めるように）
    if (BOONS[id].melee) w += 1 + Math.min(4, owned.filter((b) => BOONS[b.id].melee).length);
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
  for (const f of FUSIONS) {
    const other = f.a === id ? f.b : f.b === id ? f.a : null;
    if (other) hints.push(`合成：${BOONS[other].name}と両方 Lv2 以上で「${BOONS[f.to].name}」`);
  }
  for (const c of CROSS) {
    const other = c.a === id ? c.b : c.b === id ? c.a : null;
    if (other && owned.some((b) => b.id === other)) hints.push(`相乗：${c.text}`);
  }
  return hints;
}
