// 紹介動画用の「見せる」ボット。tests/bot.mjs（難易度を測るための素朴なボット）とは別物。
// ・敵に寄って止まり、向きを合わせて連撃を途切れさせない（行ったり来たりしない）
// ・高い所の敵には跳んで斬る。構えた敵は回避ですり抜けて背中から斬る
// ・攻撃が当たる瞬間に回避する（reflex。ジャスト回避の受付の中で回避を始めるので、ゲームの判定どおりに「刹那」が出る）
// ・ゲージがたまったら、敵が集まった所で術を使う
import { PLAYER as PC } from '../../src/config.js';
import { ACTIVE_ARTS } from '../../src/arts.js';
import { cx, cy, overlap } from '../../src/util.js';

// 攻撃が当たる瞬間に回避を差し込む（攻撃してきた側へ。敵をすり抜けて背中に回る）
export function installReflex(g) {
  if (g.__reflexInstalled) return;
  g.__reflexInstalled = true;
  const orig = g.hitPlayer.bind(g);
  g.hitPlayer = (box, dmg, fromX, key, knock) => {
    const p = g.player;
    if (g.reflex && p.state !== 'dead' && !p.dodging && !p.invulnerable && overlap(box, p) && p.dodgeCd <= 0 && !(p.airDodgeUsed && !p.onGround)) {
      p.startDodge(g, fromX > cx(p) ? 1 : -1);
    }
    return orig(box, dmg, fromX, key, knock);
  };
}

const artCost = (p) => {
  const art = p.stats.activeArt;
  return art ? ACTIVE_ARTS[art.id].cost(art.tier || 1) : PC.skillCost * p.stats.skillCostMul;
};

// 1 tick ぶんの入力（押している操作の一覧）。st はボットの記憶（呼び出し側で同じものを渡し続ける）
export function showInputs(g, st, opts = {}) {
  const p = g.player, held = [];
  st.f = (st.f || 0) + 1;
  const f = st.f;
  if (!g.room || p.state === 'dead') return held;
  if (opts.walk) { held.push(opts.walk); return held; }
  const foes = g.room.enemies.filter((e) => e.alive && !(e.boss && e.defeated) && !e.hidden);
  if (!foes.length) { if (opts.idleWalk) held.push(opts.idleWalk); return held; }
  // 狙い：同じ高さを優先して近い敵（いったん決めたら、ずっと近い敵が出るまで替えない）
  const score = (e) => Math.abs(cx(e) - cx(p)) + Math.abs(cy(e) - cy(p)) * 2.2;
  let tgt = st.tgt && st.tgt.alive && foes.includes(st.tgt) ? st.tgt : null;
  for (const e of foes) if (!tgt || score(e) < score(tgt) - 40) tgt = e;
  st.tgt = tgt;
  const dx = cx(tgt) - cx(p), dy = cy(tgt) - cy(p), adx = Math.abs(dx), dir = dx > 0 ? 'right' : 'left';
  const near = foes.filter((e) => Math.hypot(cx(e) - cx(p), cy(e) - cy(p)) < 170).length;
  // 術：敵が集まったら（ボスなら近くで）
  const artMin = opts.artMin ?? 2;
  if (opts.art !== false && p.gauge >= artCost(p) && (near >= artMin || (tgt.boss && adx < 120)) && f - (st.lastArt || -999) > 50 && p.state !== 'dodge') {
    st.lastArt = f; held.push('skill'); return held;
  }
  // 構えた敵：回避ですり抜けて背中へ
  if (tgt.guardT > 0 && adx < 70 && Math.abs(dy) < 40 && p.dodgeCd <= 0 && p.onGround && f - (st.lastSlip || -999) > 30) {
    st.lastSlip = f; held.push('dodge', dir); return held;
  }
  const reach = tgt.boss ? 46 : tgt.w > 30 ? 40 : 30;
  // 高い所の敵：近づいてから跳ぶ（上りの間は跳びを押し続ける）
  if (dy < -36 && adx < 110) {
    if (p.onGround && f - (st.lastJump || -999) > 14) { st.lastJump = f; st.jumpHold = 14; }
  }
  if (st.jumpHold > 0) { st.jumpHold--; held.push('jump'); }
  // 移動：離れていたら寄る。寄ったら止まる（行き過ぎない）
  if (st.moving ? adx > reach - 6 : adx > reach + 10) { st.moving = true; held.push(dir); }
  else { st.moving = false; if ((dx > 0) !== (p.face > 0) && adx > 6) held.push(dir); }
  // 連撃：届く範囲なら 3 tick ごとに押し直す（受付に入れておく）
  const inRange = adx < reach + 16 && dy > -60 && dy < 44;
  if (inRange && f % 3 === 0) held.push('attack');
  return held;
}
