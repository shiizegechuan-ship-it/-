// 周回をまたいで残る状態（保持）と、周回の終わりに起きる変化の計算。DOM に依存しない純粋なモジュール。
import { makeRng } from './util.js';
import { BOONS } from './boons.js';

export const SAVE_VERSION = 1;
export const MAX_SLOTS = 3;
export const GLEN_DEADLINE = 80; // 鍛冶屋が襲われる時刻（夜の経過秒）

export const WEDGE_TARGETS = {
  lira: { name: '少女リラ', kind: '人物', effect: '次の夜も、あなたを覚えている', cost: 'ほかの楔と枠を取り合う' },
  glen: { name: '鍛冶屋グレン', kind: '人物', effect: '生きたまま塔の入口に現れ、強化を鍛えてくれる', cost: '枠を1つ使う' },
  knight: { name: '歯車騎士の残骸', kind: '敵', effect: '騎士は倒れたまま。昇降機で上層へ直行できる', cost: '飛ばした部屋の報酬は得られない' },
  brake: { name: '鐘楼の歯止め', kind: '仕掛け', effect: '刻守は「時止め」を使えない', cost: '刻守が怒り、第2段階が早く・速くなる' },
  boon: { name: '強化', kind: '強化', effect: 'その強化を持ったまま夜が始まる', cost: '枠を1つ使う' },
};

export const KNOWLEDGE = {
  glen_time: { cat: '人物', title: 'グレンの最期', text: (m) => `鍛冶屋グレンは夜の ${fmtClock(GLEN_DEADLINE)} に錆兵に殺される。それより早く鍛冶場に着けば助けられる。` },
  glen_saved: { cat: '人物', title: '鍛冶屋の恩', text: () => '助けたグレンは、強化を1つ鍛え直してくれた。楔を打てば、次の夜も生きているはず。' },
  lira_name: { cat: '人物', title: '少女の名', text: () => '刻守は最後に「リラ」と呟いた。市場で同じ言葉を繰り返す少女の名前かもしれない。' },
  lira_father: { cat: '人物', title: '塔の上の父', text: () => 'リラの父は塔のてっぺんで、ずっと時計を見ている。' },
  lira_message: { cat: '人物', title: 'リラの伝言', text: () => '「リラは覚えてる」――覚えている彼女が、父に伝えてほしいと言った言葉。' },
  code: { cat: '謎', title: '書庫の番号', text: (m) => `師の書斎の走り書き：「書庫の扉 ${m.code.join('-')}」` },
  master_reason: { cat: '謎', title: '師の日誌', text: () => '崩落の朝、師は娘を失った。鐘を鳴らすたび、夜は崩落の前に戻る。師は夜を終わらせる気がない。' },
  knight_lift: { cat: '謎', title: '昇降機', text: () => '歯車騎士は昇降機の動力そのものだった。騎士が倒れたままなら、昇降機は動く。' },
  boss_bell: { cat: '謎', title: '鐘', text: () => '刻守を倒しても、彼が鐘を鳴らせば夜は戻る。力だけでは夜明けは来ない。' },
  tell_soldier: { cat: '敵', title: '錆兵', text: () => '剣を振り上げて光ったら踏み込み斬りが来る。振り上げ中は弱い攻撃では止まらない。振った後は隙だらけ。' },
  tell_bat: { cat: '敵', title: '振り子蝙蝠', text: () => '空中で止まり、赤い線を引いたら急降下。線から外れれば当たらない。壁に当たると目を回す。' },
  tell_turret: { cat: '敵', title: '時計砲台', text: () => '針が12時を指すと撃つ。弾は攻撃で斬り落とせる。' },
  tell_knight: { cat: '敵', title: '歯車騎士', text: () => '正面の盾は通常攻撃を弾く。重撃で崩すか背後を取る。ハンマーを振り上げたら衝撃波が床を走る――跳べ。' },
  tell_boss: { cat: '敵', title: '刻守', text: () => '懐中時計を掲げたら時が止まる。時が戻る瞬間の刃に合わせて回避すれば、刹那が取れる。' },
};

export const COUNTERS = {
  combo: { name: '反撃の足捌き', desc: '連撃を受け続けると、赤く光って後ろへ跳び斬り返す' },
  heavy: { name: '受け流しの構え', desc: '重撃の溜めを見ると、青く光る構えで受け流す（通常攻撃で崩せる）' },
  air: { name: '対空の針', desc: '頭上を取られると、上を指して針を放つ' },
  echo: { name: '残響喰い', desc: '紫の輪をまとう間、残響のダメージを受けない' },
  skill: { name: '時の抵抗', desc: '時歪の効果時間が半分になる' },
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
    slots: 1,
    wedges: [],
    knowledge: {}, // key -> 知った周回
    code: [r.int(1, 9), r.int(1, 9), r.int(1, 9)], // セーブ固定（周回では変わらない）
    unlocked: ['haste', 'echo', 'risk'],
    lastLoop: null,
    flags: { bossBeaten: false, diaryRead: false, archiveOpened: false, ending: false, seenRewind: false },
    stats: { deaths: 0, falseWins: 0, bestFloor: 0 },
  };
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

// 前の周回で最も使った攻撃手段 → 刻守の対策（1つだけ。毎周上書き）
export function bossCounter(lastLoop) {
  if (!lastLoop || !lastLoop.dmgByCat) return null;
  let best = null, bestV = 80; // 一定量以上使ったものだけ
  for (const [k, v] of Object.entries(lastLoop.dmgByCat)) if (v > bestV) { best = k; bestV = v; }
  return best;
}

// 周回の終わり。meta を更新し、巻き戻り画面に出す「保持／リセット／変化」を返す。
// run: { cause:'death'|'bell', floor, boons:[{id,tier}], dmgByCat, newWedges:[], learned:[], clock, hpMax }
export function endLoop(m, run) {
  const prevCounter = bossCounter(m.lastLoop);
  const report = { kept: [], reset: [], changed: [], cause: run.cause, loop: m.loop };
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
  const wedgedBoonIds = new Set(m.wedges.filter((w) => w.target === 'boon').map((w) => w.boon.id));
  const lostBoons = (run.boons || []).filter((b) => !wedgedBoonIds.has(b.id));
  if (lostBoons.length) report.reset.push({ text: `強化 ${lostBoons.length} 個`, sub: lostBoons.map((b) => BOONS[b.id].name).join('・') });
  report.reset.push({ text: 'HP・秒針ゲージ', sub: '' });
  report.reset.push({ text: '部屋の並び・敵・報酬', sub: '夜ごとに揺らぐ' });
  for (const w of run.newWedges || []) {
    const t = WEDGE_TARGETS[w.target];
    report.changed.push({ text: `${wedgeLabel(w)}：${w.target === 'boon' ? t.effect : t.effect}`, tone: 'gold' });
    if (w.target !== 'boon') report.changed.push({ text: `代償：${t.cost}`, tone: 'risk' });
  }
  for (const k of run.learned || []) if (KNOWLEDGE[k] && KNOWLEDGE[k].cat !== '敵') report.changed.push({ text: `知った：${KNOWLEDGE[k].title}`, tone: 'blue' });
  m.lastLoop = { dmgByCat: { ...(run.dmgByCat || {}) }, cause: run.cause, floor: run.floor, boons: (run.boons || []).map((b) => ({ ...b })), loop: m.loop };
  const nextCounter = bossCounter(m.lastLoop);
  if (nextCounter && nextCounter !== prevCounter) report.changed.push({ text: `刻守はあなたの戦い方を覚えた：${COUNTERS[nextCounter].name}`, tone: 'risk' });
  else if (!nextCounter && prevCounter) report.changed.push({ text: '刻守の対策が消えた', tone: 'blue' });
  m.loop++;
  m.flags.seenRewind = true;
  return report;
}

export function serialize(m) { return JSON.stringify(m); }
export function deserialize(s) {
  try {
    const m = JSON.parse(s);
    return validateMeta(m) ? m : null;
  } catch { return null; }
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
