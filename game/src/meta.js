// 周回をまたいで残る状態（保持）と、周回の終わりに起きる変化の計算。DOM に依存しない純粋なモジュール。
import { makeRng } from './util.js';
import { BOONS } from './boons.js';
import { ARTIFACTS } from './artifacts.js';

export const SAVE_VERSION = 1;
export const MAX_SLOTS = 6; // 楔の枠の上限（強化を持ち越せる数もこの枠で増える）
export const GLEN_DEADLINE = 80; // 鍛冶屋が襲われる時刻（夜の経過秒）

export const WEDGE_TARGETS = {
  lira: { name: 'リラ（師の娘）', kind: '人物', effect: '次の夜も、あなたを覚えている', cost: 'ほかの楔と枠を取り合う' },
  glen: { name: 'グレン（鍛冶屋）', kind: '人物', effect: '生きたまま塔の入口に現れ、強化を鍛えてくれる', cost: '枠を1つ使う' },
  knight: { name: '歯車騎士の残骸', kind: '敵', effect: '騎士は倒れたまま。昇降機で上層へ直行できる', cost: '飛ばした部屋の報酬は得られない' },
  brake: { name: '鐘楼の歯止め', kind: '仕掛け', effect: '刻守は「時止め」を使えない', cost: '刻守が怒り、第2段階が早く・速くなる' },
  boon: { name: '強化', kind: '強化', effect: 'その強化を持ったまま夜が始まる', cost: '枠を1つ使う' },
};

export const KNOWLEDGE = {
  glen_time: { cat: '人物', title: 'グレンの最期', text: (m) => `鍛冶屋グレン（師の古い友）は夜の ${fmtClock(GLEN_DEADLINE)} に、狂った時計人形に殺される。それより早く鍛冶場に着けば助けられる。` },
  glen_saved: { cat: '人物', title: '鍛冶屋の恩', text: () => '助けたグレンは強化を1つ鍛えてくれる。楔を打てば、次の夜も生きて入口で待っている。' },
  lira_name: { cat: '人物', title: '少女の名', text: () => '師は戦いの最後に「リラ」と呼んだ。市場で父を待つ少女の名前かもしれない。' },
  lira_father: { cat: '人物', title: '塔の上の父', text: () => 'リラは師（刻守）の娘。朝の汽車で遠くの療養所へ発つ。父は塔の上から降りてこない。' },
  lira_message: { cat: '人物', title: 'リラの伝言', text: () => '「リラは覚えてる。朝が来ても、ちゃんと治して帰ってくる」――父に伝えてほしい言葉。' },
  code: { cat: '謎', title: '書庫の番号', text: (m) => `師の書斎の走り書き：「書庫の扉 ${m.code.join('-')}」` },
  master_reason: { cat: '謎', title: '師の日誌', text: () => '娘のリラは夜明けの汽車で療養所へ発つ。別れを恐れた師は、禁忌の鐘で夜を戻し続けている。鐘は鳴らすたびに師の命を一夜ぶん削る。' },
  knight_lift: { cat: '謎', title: '昇降機', text: () => '歯車騎士は昇降機の動力そのものだった。騎士が倒れたままなら、昇降機は動く。' },
  boss_bell: { cat: '謎', title: '鐘', text: () => '刻守を倒しても、彼が鐘を鳴らせば夜は戻る。力だけでは夜明けは来ない。' },
  tell_soldier: { cat: '敵', title: '錆兵', text: () => '剣を振り上げて光ったら踏み込み斬りが来る。振り上げ中は弱い攻撃では止まらない。振った後は隙だらけ。' },
  tell_bat: { cat: '敵', title: '振り子蝙蝠', text: () => '空中で止まり、赤い線を引いたら急降下。線から外れれば当たらない。壁に当たると目を回す。' },
  tell_turret: { cat: '敵', title: '時計砲台', text: () => '針が12時を指すと撃つ。弾は攻撃で斬り落とせる。' },
  tell_knight: { cat: '敵', title: '歯車騎士', text: () => '正面の盾は通常攻撃を弾く。重撃で崩すか背後を取る。ハンマーを振り上げたら衝撃波が床を走る――跳べ。頭上にいると大槌を突き上げる。離れると戻ってくる大歯車を投げ、追ってくる火花を放つ。高く跳んだら頂点で光り、そこから急降下してくる――光ったら横へ。' },
  tell_roller: { cat: '敵', title: '歯車転がし', text: () => '火花を散らして回転を速めたら、一直線に転がってくる。壁にぶつかると目を回し、その間は大きな隙（1.5倍）。' },
  tell_archer: { cat: '敵', title: '時計弓兵', text: () => '距離を取って弓を引き絞る。照準線が出たら矢が来る。矢は斬り落とせる。近づけば逃げる。' },
  tell_phantom: { cat: '敵', title: '刻の亡霊', text: () => 'あなたの背後に紫の揺らぎを残し、そこへ跳んで斬る。揺らぎを見たら前へ回避。' },
  tell_bell: { cat: '敵', title: '鐘撞き', text: () => '槌を振り上げたら鐘が鳴り、音の輪が広がる。輪の帯に重なると当たる。回避の無敵か、輪の外へ。' },
  tell_beamer: { cat: '敵', title: '光線砲手', text: () => '遠くから照準線を引き、部屋を貫く光線を撃つ。線は最後の一瞬で固定される――その瞬間に跳ぶか、線の高さから外れる。近づくと下がる。' },
  tell_chain: { cat: '敵', title: '鎖鎌兵', text: () => '少し離れた距離を保ち、鎖を振りかぶってまっすぐ伸ばす（届くのは約 6 歩）。振りかぶりを見たら跳ぶか、鎖の外へ。' },
  tell_rat: { cat: '敵', title: '歯車ネズミ', text: () => 'すばしっこく駆け寄り、身をかがめたら噛みつきの突進。噛んだらすぐ逃げる。体力は低い――逃げる背中を斬れ。' },
  tell_mallet: { cat: '敵', title: '大槌兵', text: () => '大槌を後ろへ大きく振りかぶってから横に薙ぎ、遠くへ吹き飛ばす。壁を背にしていると激突して余計に痛い。振ったあとは長い隙。' },
  tell_hopper: { cat: '敵', title: '跳ね潰し', text: () => '身をかがめると着地点に影が落ち、そこへ跳びかかる。影から離れれば当たらない。着地のあとは隙だらけ。' },
  tell_warden: { cat: '敵', title: '振り子の番人', text: () => '振り子を引いたら前方を大きく薙ぐ（怒ると振り返ってもう一度）。跳び上がったら着地の衝撃波が床を走る――跳べ。鐘を掲げたら音の輪。頭上にいると振り子を真上へ振り上げる。遠くからは回る刃を飛ばし（低い刃は跳ぶ）、追ってくる鐘の音を放つ（斬れば消える）。跳んで空中で振り子を回すこともある。大技のあとの長い隙に重撃を当てると大きく崩れる。' },
  tell_boss: { cat: '敵', title: '刻守', text: () => '懐中時計を掲げたら時が止まる。時が戻る瞬間の刃に合わせて回避すれば、刹那が取れる。' },
};

export const COUNTERS = {
  combo: { name: '歯車の外殻', habit: '連撃', resist: { combo: 0.3 }, desc: '歯車の外殻をまとい、連撃のダメージを 70% 弾く。3発続けて受けると跳び退いて斬り返す', weak: '重撃か術で外殻を割れ（割れると大きくよろめき、しばらく外殻が消える）' },
  heavy: { name: '受け流しの構え', habit: '重撃', resist: { heavy: 0.4 }, desc: '重撃のダメージを 60% 軽減。溜めを見ると青い構えで受け流し、斬り返す', weak: '青い構えに通常攻撃を当てると構えが崩れ、長くよろめく' },
  air: { name: '対空の針', habit: '空中攻撃', resist: { air: 0.35 }, desc: '空中攻撃のダメージを 65% 軽減。頭上を取られるとすぐに針を放つ', weak: '地上で戦え。針を撃った直後は長い隙がある' },
  skill: { name: '術潰し', habit: '術', resist: { skill: 0.2 }, desc: '術のダメージを 80% 軽減し、術で削れる量の上限も半分に。時歪も半分。術を使うと即座に突進してくる', weak: '近接で攻めろ。突進の後は長い隙がある' },
  echo: { name: '残響喰い', habit: '残響', resist: { echo: 0.2 }, desc: '残響のダメージを 80% 軽減。紫の輪の間は残響を吸ってHPを回復する', weak: '輪の間に直接攻撃を3回当てると輪が割れ、よろめく' },
  dodge: { name: '読みのフェイント', habit: '回避', resist: {}, desc: '振りかぶったまま一拍止める。早すぎる回避は空振りになる', weak: '体が白く光った瞬間が本当の攻撃。そこで回避すれば刹那が取れる' },
};


// 雑魚・中ボスの対策（前の夜にいちばん使った手段）
export const MOB_COUNTERS = {
  combo: '連撃のダメージを半減し、連撃では怯まない',
  heavy: '重撃のダメージを半減し、溜めを見ると跳び退く',
  air: '空中攻撃のダメージを半減',
  skill: '術（常時の術を含む）のダメージを半減',
  echo: '残響のダメージを半減',
  dodge: '動きが速い（よく回避するあなたを追う）',
};

export function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function newMeta(seed = (Date.now() & 0x7fffffff)) {
  const r = makeRng(seed ^ 0x5eed);
  return {
    v: SAVE_VERSION,
    seed,
    loop: 1,
    slots: 2,
    wedges: [],
    knowledge: {}, // key -> 知った周回
    code: [r.int(1, 9), r.int(1, 9), r.int(1, 9)], // セーブ固定（周回では変わらない）
    unlocked: ['haste', 'echo', 'risk', 'power', 'arts'],
    shards: 0, // 時の欠片（恒久強化の通貨）
    upgrades: {}, // 刻印（恒久強化）の Lv
    inherit: [], // 次の夜に持ち越す強化（巻き戻り画面で選ぶ）
    lastLoop: null,
    flags: { bossBeaten: false, diaryRead: false, archiveOpened: false, ending: false, seenRewind: false },
    stats: { deaths: 0, falseWins: 0, bestFloor: 0 },
  };
}

// ───────── 恒久強化（刻印）と夜の深さ ─────────
const cost = (base, g) => (lv) => Math.round(base * Math.pow(g, lv));
export const UPGRADES = {
  atk: { name: '刃の刻印', max: 30, desc: (lv) => `基礎攻撃 +${lv * 10}%`, cost: cost(12, 1.22) },
  hp: { name: '命の刻印', max: 20, desc: (lv) => `最大HP +${lv * 15}`, cost: cost(10, 1.22) },
  inherit: { name: '継承の刻印', max: 4, desc: (lv) => `前の夜の強化を ${3 + lv} 個まで持ち越せる`, cost: cost(40, 1.9) },
  crit: { name: '会心の刻印', max: 10, desc: (lv) => `会心率 +${lv * 2}%`, cost: cost(16, 1.3) },
  combo: { name: '連撃の刻印', max: 5, desc: (lv) => `コンボの持続 +${(lv * 0.4).toFixed(1)}秒`, cost: cost(18, 1.4) },
  gauge: { name: '秒針の刻印', max: 5, desc: (lv) => `夜のはじめの秒針ゲージ +${lv * 20}`, cost: cost(14, 1.4) },
  heal: { name: '泉の刻印', max: 5, desc: (lv) => `回復量 +${lv * 20}%`, cost: cost(14, 1.35) },
  choice: { name: '選択の刻印', max: 1, desc: (lv) => `強化の候補が ${3 + lv} 枚になる`, cost: () => 150 },
};
export const upLv = (m, k) => (m.upgrades && m.upgrades[k]) || 0;
export const inheritCount = (m) => 3 + upLv(m, 'inherit'); // 基本 3 個（刻印で +1 ずつ）
export function buyUpgrade(m, k) {
  const u = UPGRADES[k], lv = upLv(m, k);
  if (lv >= u.max) return false;
  const c = u.cost(lv);
  if (m.shards < c) return false;
  m.shards -= c;
  m.upgrades[k] = lv + 1;
  return true;
}
// 夜の深さ：夜を重ねるほど敵が強くなり、攻撃パターンが増える
export const nightLevel = (m) => Math.max(0, m.loop - 1);
export function enemyTier(m) { const n = nightLevel(m); return n >= 5 ? 3 : n >= 2 ? 2 : 1; }
export function enemyScale(m) {
  const n = nightLevel(m);
  return { hp: 1 + 0.35 * n + 0.04 * n * n, dmg: 1 + 0.1 * n, tier: enemyTier(m), level: n };
}
// 巻き戻りのとき、持ち越す強化を自動で選んでおく（Lv の高い順、火力優先）
export function autoInherit(m, boons) {
  const wedged = new Set(m.wedges.filter((w) => w.target === 'boon').map((w) => w.boon.id));
  const cand = boons.filter((b) => !wedged.has(b.id)).slice().sort((a, b) => (b.tier || 1) - (a.tier || 1) || (BOONS[b.id].school === 'power') - (BOONS[a.id].school === 'power'));
  m.inherit = cand.slice(0, inheritCount(m)).map((b) => ({ ...b }));
}

// 古いセーブに新しい項目を足す
function migrate(m) {
  m.shards ??= 0; m.upgrades ??= {}; m.inherit ??= [];
  for (const k of ['power', 'arts']) if (!m.unlocked.includes(k)) m.unlocked.push(k);
  return m;
}

export function validateMeta(m) {
  return m && m.v === SAVE_VERSION && Array.isArray(m.wedges) && typeof m.knowledge === 'object' && Array.isArray(m.code) && m.code.length === 3;
}

export const knows = (m, k) => !!m.knowledge[k];
export function learn(m, k) {
  if (m.knowledge[k]) return false;
  m.knowledge[k] = m.loop;
  return true;
}
export const hasWedge = (m, target) => m.wedges.some((w) => w.target === target);
export const freeSlots = (m) => m.slots - m.wedges.length;

export function addWedge(m, w) {
  if (freeSlots(m) <= 0) return false;
  if (w.target !== 'boon' && hasWedge(m, w.target)) return false;
  if (w.target === 'boon' && m.wedges.some((x) => x.target === 'boon' && x.boon.id === w.boon.id)) return false;
  m.wedges.push({ ...w, loop: m.loop });
  return true;
}
export function removeWedge(m, index) {
  if (index < 0 || index >= m.wedges.length) return null;
  return m.wedges.splice(index, 1)[0];
}
export function wedgeLabel(w) {
  if (w.target === 'boon') return `強化「${BOONS[w.boon.id].name}${w.boon.tier > 1 ? ' II' : ''}」`;
  return WEDGE_TARGETS[w.target].name;
}

// 真の結末の条件：覚えているリラ＋伝言＋師の動機
export function trueEndReady(m) {
  return hasWedge(m, 'lira') && knows(m, 'lira_message') && knows(m, 'master_reason');
}

// 前の周回の戦い方の分析。最も使った手段 → 刻守の対策（1つだけ。毎周上書き）
export function habitAnalysis(lastLoop) {
  if (!lastLoop || !lastLoop.dmgByCat) return null;
  const d = lastLoop.dmgByCat;
  const cats = ['combo', 'heavy', 'air', 'skill', 'echo'];
  const total = cats.reduce((a, k) => a + (d[k] || 0), 0);
  const shares = Object.fromEntries(cats.map((k) => [k, total ? (d[k] || 0) / total : 0]));
  const minutes = Math.max(1, (lastLoop.clock || 60) / 60);
  const dodgeRate = (lastLoop.dodges || 0) / minutes;
  let top = null, best = 0;
  for (const k of cats) if (shares[k] > best) { best = shares[k]; top = k; }
  let counter = total >= 80 ? top : null;
  if (dodgeRate >= 14 && best < 0.55) counter = 'dodge';
  return { shares, dodgeRate, counter, total };
}
export function bossCounter(lastLoop) {
  const a = habitAnalysis(lastLoop);
  return a ? a.counter : null;
}

// 周回の終わり。meta を更新し、巻き戻り画面に出す「保持／リセット／変化」を返す。
// run: { cause:'death'|'bell', floor, boons:[{id,tier}], dmgByCat, newWedges:[], learned:[], clock, hpMax }
export function endLoop(m, run) {
  const prevCounter = bossCounter(m.lastLoop);
  const prevTier = enemyTier(m);
  const report = { kept: [], reset: [], changed: [], cause: run.cause, loop: m.loop, shards: run.shards || 0 };
  m.shards = (m.shards || 0) + (run.shards || 0);
  if (run.cause === 'death') m.stats.deaths++;
  if (run.cause === 'bell') {
    m.stats.falseWins++;
    if (!m.flags.bossBeaten) {
      m.flags.bossBeaten = true;
      if (m.slots < MAX_SLOTS) { m.slots++; report.changed.push({ text: '楔の枠が1つ増えた（刻守に勝った）', tone: 'gold' }); }
    }
  }
  m.stats.bestFloor = Math.max(m.stats.bestFloor, run.floor || 0);
  for (const w of m.wedges) report.kept.push({ text: wedgeLabel(w), sub: w.target === 'boon' ? WEDGE_TARGETS.boon.effect : WEDGE_TARGETS[w.target].effect });
  const nk = Object.keys(m.knowledge).length;
  report.kept.push({ text: `記録帳（${nk}件）`, sub: (run.learned || []).length ? `新たに ${(run.learned || []).length} 件` : '' });
  report.kept.push({ text: `時の欠片 +${run.shards || 0}（所持 ${m.shards}）`, sub: '刻印（恒久強化）に使える' });
  autoInherit(m, run.boons || []);
  if (m.inherit.length) report.kept.push({ text: `継承：${m.inherit.map((b) => BOONS[b.id].name + (b.tier > 1 ? ' Lv' + b.tier : '')).join('・')}`, sub: `最大 ${inheritCount(m)} 個（巻き戻り画面で変更できる）` });
  const inheritedIds = new Set(m.inherit.map((b) => b.id));
  const wedgedBoonIds = new Set(m.wedges.filter((w) => w.target === 'boon').map((w) => w.boon.id));
  const lostBoons = (run.boons || []).filter((b) => !wedgedBoonIds.has(b.id) && !inheritedIds.has(b.id));
  if (lostBoons.length) report.reset.push({ text: `強化 ${lostBoons.length} 個`, sub: lostBoons.map((b) => BOONS[b.id].name).join('・') });
  report.reset.push({ text: 'HP・秒針ゲージ', sub: '' });
  if ((run.artifacts || []).length) report.reset.push({ text: `アーティファクト ${run.artifacts.length} 個`, sub: run.artifacts.map((id) => ARTIFACTS[id].name).join('・') });
  if (run.gold) report.reset.push({ text: `金貨 ${run.gold}`, sub: '金貨はその夜だけ。店で使い切ろう' });
  if ((run.level || 1) > 1) report.reset.push({ text: `レベル（Lv${run.level} → Lv1）`, sub: '経験値とレベルはその夜だけ' });
  report.reset.push({ text: '部屋の並び・敵・報酬', sub: '夜ごとに揺らぐ' });
  for (const w of run.newWedges || []) {
    const t = WEDGE_TARGETS[w.target];
    report.changed.push({ text: `${wedgeLabel(w)}：${w.target === 'boon' ? t.effect : t.effect}`, tone: 'gold' });
    if (w.target !== 'boon') report.changed.push({ text: `代償：${t.cost}`, tone: 'risk' });
  }
  for (const k of run.learned || []) if (KNOWLEDGE[k] && KNOWLEDGE[k].cat !== '敵') report.changed.push({ text: `知った：${KNOWLEDGE[k].title}`, tone: 'blue' });
  if (run.cause === 'bell' && !m.flags.diaryRead) report.tip = '刻守を倒しても、鐘が鳴れば夜は戻る。師が命を削ってまで夜を止める理由を探そう（記録帳「夜明けへの道」）。';
  else if (report.loop === 1) report.tip = '金の時計の印がついたもの（人・残骸・仕掛け）に楔を打つと、次の夜もその状態のまま残る。';
  else report.tip = progressLine(m) || TIPS[(report.loop - 2) % TIPS.length];
  m.lastLoop = { dmgByCat: { ...(run.dmgByCat || {}) }, cause: run.cause, floor: run.floor, boons: (run.boons || []).map((b) => ({ ...b })), loop: m.loop, dodges: run.dodges || 0, clock: run.clock || 0 };
  const nextCounter = bossCounter(m.lastLoop);
  if (nextCounter) {
    const a = habitAnalysis(m.lastLoop), c = COUNTERS[nextCounter];
    const share = nextCounter === 'dodge' ? `毎分 ${Math.round(a.dodgeRate)} 回` : `${Math.round(a.shares[nextCounter] * 100)}%`;
    report.changed.push({ text: `刻守の対策：${c.name}（あなたの${c.habit} ${share}）`, tone: 'risk', sub: `崩し方：${c.weak}` });
    report.changed.push({ text: `塔の番人たちも学んだ：${MOB_COUNTERS[nextCounter]}`, tone: 'risk', sub: '雑魚・中ボスにも効く。戦い方を変えれば次の夜は外れる' });
  }
  else if (!nextCounter && prevCounter) report.changed.push({ text: '刻守の対策が消えた', tone: 'blue' });
  m.loop++;
  m.flags.seenRewind = true;
  // 夜を 3 つ越えるごとに楔の枠 +1
  if ((m.loop - 1) % 3 === 0 && m.slots < MAX_SLOTS) { m.slots++; report.changed.push({ text: `楔の枠が1つ増えた（${m.loop - 1} 夜を越えた）`, tone: 'gold' }); }
  report.story = nightStory(m);
  const sc = enemyScale(m);
  report.changed.push({ text: `夜の深さ Lv${sc.level}：敵のHP ×${sc.hp.toFixed(2)}・攻撃 ×${sc.dmg.toFixed(2)}`, tone: 'risk' });
  if (sc.tier > prevTier) report.changed.push({ text: sc.tier === 2 ? '敵が新しい攻撃を覚えた（二段斬り・連続急降下・3方向弾 ほか）' : '敵がさらに凶暴になった（突き・爆弾・速射・跳躍叩きつけ ほか）', tone: 'risk' });
  return report;
}

export function serialize(m) { return JSON.stringify(m); }
export function deserialize(s) {
  try {
    const m = JSON.parse(s);
    return validateMeta(m) ? migrate(m) : null;
  } catch { return null; }
}

// ───────── 夜ごとの語り ─────────
// 巻き戻りのたびに変わる語り：夜が重なるほど、鐘に命を削られる師の姿が変わっていく
const STORY = [
  '鐘が鳴り終わると、町はまた夕暮れに戻っていた。鐘楼の窓に、師の影が見えた。',
  '三度目の夕暮れ。町の人はまた同じ挨拶をする。鐘楼から、師の咳が聞こえた。',
  '鐘の音が、前より少し掠れている。鳴らすたびに、何かがすり減っていく。',
  '師の髪に白いものが目立ちはじめた。時戻しの鐘は、鳴らした者の命を喰う。',
  '町の時計人形の錆が、また深くなった。止まった夜が、塔そのものを蝕んでいる。',
  '師の手が震えている。それでも夜の終わりには、必ず鐘が鳴る。',
  '市場の灯りが、少しずつ暗くなっていく。同じ夜を生きる人々の顔からも、色が抜けていく。',
  '師の背中は、もう老人のそれだった。残された夜は、きっと多くない。',
];
export function nightStory(m) {
  const n = m.loop;
  if (m.flags.ending) return `第${n}夜。夜明けを知った塔に、それでも夜は来る――終わらない夜。`;
  const line = STORY[Math.min(n - 2, STORY.length - 1)] || STORY[0];
  return n - 2 >= STORY.length ? `第${n}夜。${line}` : line;
}
// 物語の進み具合に応じた一言（あれば巻き戻りの助言の代わりに出す）
function progressLine(m) {
  if (trueEndReady(m)) return 'リラの言葉を、師に届ける時が来た。鐘楼で、第三楽章まで戦い抜け。';
  if (hasWedge(m, 'lira') && !knows(m, 'lira_message')) return 'リラだけが、この夜を覚えている。名前で呼びかけてみよう。';
  if (knows(m, 'master_reason') && !hasWedge(m, 'lira')) return '師は命と引き換えに夜を買っている。止められるのは、師が守ろうとしている娘の言葉だけかもしれない。';
  return null;
}
// 夜ごとに入れ替わる助言（同じ文が続かないように）
const TIPS = [
  '巻き戻りのとき、最後に持っていた強化にも楔を打てる。',
  '時の欠片で刻んだ刻印は、夜が戻っても消えない。',
  '刻守だけでなく、塔の番人たちも前の夜の戦い方を覚えている。戦い方を変えれば対策は外れる。',
  '黄金の鍵は店で買える。黄金の部屋には強いアーティファクトが眠っている。',
  '常時の術や剣の道を積むほど、塔の番人たちも強く・多く・速くなる。',
  '時の祠では、命を捧げて強化を得られる。HP に余裕のあるときに。',
  '中ボスや刻守には、遅くする術が効かない。隙を見て重撃を。',
];

// ───────── 夜明けへの道（最終クリアまでの段階） ─────────
export const DAWN_STEPS = [
  { title: '刻守を倒す', hint: '上層の鐘楼にいる刻守を倒す。……それでも鐘が鳴れば夜は戻る', done: (m) => m.flags.bossBeaten },
  { title: '少女の名前を知る', hint: '刻守を追い詰める（第三楽章）と、師は誰かの名を呼ぶ', done: (m) => knows(m, 'lira_name') },
  { title: '書庫の番号を見つける', hint: '上層の書斎に、師の走り書きがある', done: (m) => knows(m, 'code') },
  { title: '師の日誌を読む', hint: '中層の書庫の扉を番号で開ける', done: (m) => knows(m, 'master_reason') },
  { title: 'リラに楔を打つ', hint: '市場の少女に楔を打てば、次の夜もあなたを覚えている', done: (m) => hasWedge(m, 'lira') },
  { title: 'リラの伝言を聞く', hint: '覚えているリラに、名前で呼びかける（楔を打った次の夜）', done: (m) => knows(m, 'lira_message') },
  { title: '夜明けの決闘に勝つ', hint: '刻守の第三楽章で「リラは覚えている」と伝え、勝つ', done: (m) => !!m.flags.ending },
];
export function dawnProgress(m) {
  const done = DAWN_STEPS.filter((s) => s.done(m)).length;
  const next = DAWN_STEPS.find((s) => !s.done(m)) || null;
  return { done, total: DAWN_STEPS.length, next };
}

// 記録帳の「未解決の問い」。答えではなく、次に試すことの方向だけを示す。
export function openQuestions(m) {
  const q = [];
  if (!knows(m, 'glen_saved')) q.push(knows(m, 'glen_time') ? 'グレンを助けるには、鍛冶場へもっと早く着く必要がある。' : '鍛冶場では何が起きているのか？');
  if (!knows(m, 'lira_name')) q.push('市場の少女はなぜ同じ言葉を繰り返すのか？');
  else if (!hasWedge(m, 'lira')) q.push('名前を呼んでも、少女は次の夜には忘れてしまう。忘れさせない方法は？');
  else if (!knows(m, 'lira_message')) q.push('覚えている少女に、名前で呼びかけたら？');
  if (!knows(m, 'code')) q.push('中層の書庫の扉は番号で閉ざされている。番号はどこに？');
  else if (!knows(m, 'master_reason')) q.push('番号は分かった。書庫の扉を開けよう。');
  if (!m.flags.bossBeaten) q.push('鐘楼の刻守を倒せ。');
  else if (!trueEndReady(m)) q.push('刻守を倒しても夜は戻る。彼が本当に止めたいものは？');
  else q.push('刻守に、リラの言葉を届けよ。');
  return q;
}
