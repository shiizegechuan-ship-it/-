// 実際の入力だけで戦う簡易ボット（難易度の目安を測るため。上手なプレイヤーではない）
import { cx, cy } from '../src/util.js';

export function botInputs(g, frame, skill = 'mid') {
  const p = g.player;
  const held = [];
  const enemies = g.room.enemies.filter((e) => e.alive && !(e.boss && e.defeated));
  if (!enemies.length || p.state === 'dead') return held;
  let tgt = enemies[0], bd = 1e9;
  for (const e of enemies) { const d = Math.abs(cx(e) - cx(p)) + Math.abs(cy(e) - cy(p)) * 0.5; if (d < bd) { bd = d; tgt = e; } }
  const dx = cx(tgt) - cx(p), dy = cy(tgt) - cy(p);
  // 危険の察知：予備動作が高まっている近い敵、飛んでくる弾
  const react = skill === 'good' ? 0.75 : skill === 'mid' ? 0.85 : 2;
  const danger = enemies.some((e) => e.tell > react && Math.abs(cx(e) - cx(p)) < (e.boss ? 150 : 90) && e.tellKind !== 'clock')
    || g.room.projectiles.some((pr) => pr.delay <= 0 && Math.hypot(pr.x - cx(p), pr.y - cy(p)) < 50);
  if (danger && p.dodgeCd <= 0 && frame % 2 === 0) { held.push('dodge'); held.push(dx > 0 ? 'left' : 'right'); return held; }
  const reach = 34;
  if (Math.abs(dx) > reach) held.push(dx > 0 ? 'right' : 'left');
  else if ((dx > 0) !== (p.face > 0)) held.push(dx > 0 ? 'right' : 'left');
  if (dy < -50 && p.onGround && frame % 20 === 0) held.push('jump');
  if (dy < -50 && !p.onGround) held.push('jump');
  if (Math.abs(dx) < reach + 20 && Math.abs(dy) < 60 && frame % 7 === 0) held.push('attack');
  if (p.gauge >= 50 && frame % 30 === 0 && Math.abs(dx) < 150) held.push('skill');
  return held;
}
