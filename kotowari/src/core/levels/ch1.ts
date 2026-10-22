import { box, emptyLevel, stairsZ, torii } from './build';
import type { LevelDef } from './types';

/**
 * 一の章「千段石段」：跳を質に入れると浮石の理が働き、谷の底の円紋の石が浮いて橋になる。
 * 柵の前で「跳を請け出して柵を越える」か「質に入れたまま崖沿いの回り道（浮石の第 2 の谷）」かを選ぶ。
 */
export function ch1(): LevelDef {
  const l = emptyLevel('ch1');
  l.title = '一の章　千段石段';
  l.subtitle = '軽さは、石に移る';
  l.theme = 'cedar';
  l.killY = -4;
  const B = l.boxes;
  const P = l.props;

  // A：麓の広場
  B.push(box(-6, -1, -6, 6, 0, 4, 'gravel'));
  torii(B, P, 0, 0, -3, 0, 1, 0);
  l.shrines.push({ id: 'c1_a', x: 0, y: 0, z: -3, yaw: 0, name: '麓の鳥居', shop: true });
  // 石段 1（4m）
  stairsZ(B, 0, 5, 4, 0, 16, 0.25, 0.5, 'stair');
  // 踊り場 1
  B.push(box(-6, -1, 12, 6, 4, 20, 'stone'));
  torii(B, P, -4.2, 4, 18.2, 0, 0.8, 0);
  l.shrines.push({ id: 'c1_b', x: -4.2, y: 4, z: 18.2, yaw: 0, name: '谷の鳥居', shop: true });
  // 谷（10m）。底に円紋の石
  const stones: [number, number, number][] = [
    [20.05, 22.5, 4.0],
    [22.6, 25.0, 4.0],
    [25.1, 27.5, 4.25],
    [27.6, 29.95, 4.25],
  ];
  stones.forEach(([z0, z1, top], i) => {
    const h = 0.7;
    const baseTop = -3.2 - i * 0.15;
    l.floats.push({ id: 'c1_f' + i, box: box(-1.3, baseTop - h, z0, 1.3, baseTop, z1, 'floatstone'), lift: top - baseTop, delay: i * 0.35 });
  });
  B.push(box(-7, -6, 20, 7, -5, 30, 'water', 'hazard'));
  // 踊り場 2
  B.push(box(-7, -1, 30, 7, 4.5, 42, 'stone'));
  // 柵（跳でしか越えられない）
  B.push(box(-7, 4.5, 42, 7, 5.6, 42.35, 'fence', 'fence'));
  torii(B, P, 5, 4.5, 39.6, -Math.PI / 2, 0.8, 0);
  l.shrines.push({ id: 'c1_c', x: 5, y: 4.5, z: 39.6, yaw: -Math.PI / 2, name: '柵の鳥居', shop: true });
  // 柵の先：石段 2（2m）→ 上の広場
  B.push(box(-7, -1, 42.35, 7, 4.5, 44, 'stone'));
  stairsZ(B, 0, 5, 44, 4.5, 8, 0.25, 1.0, 'stair');
  B.push(box(-6, -1, 52, 8, 6.5, 66, 'stone'));
  // 回り道：踊り場 2 の西 → 第 2 の谷（浮石）→ 西の段 → 上の広場
  B.push(box(-15, -1, 33, -7, 4.5, 38, 'stone'));
  const stones2: [number, number, number][] = [
    [38.05, 40.5, 4.5],
    [40.6, 43.0, 4.75],
    [43.1, 45.5, 5.0],
    [45.6, 47.95, 5.25],
  ];
  stones2.forEach(([z0, z1, top], i) => {
    const baseTop = -3.4 - i * 0.12;
    l.floats.push({ id: 'c1_g' + i, box: box(-14.3, baseTop - 0.7, z0, -11.7, baseTop, z1, 'floatstone'), lift: top - baseTop, delay: i * 0.35 });
  });
  B.push(box(-15, -6, 38, -8, -5, 48, 'water', 'hazard'));
  B.push(box(-15, -1, 48, -6, 5.25, 54, 'stone'));
  stairsZ(B, -10.5, 3, 54, 5.25, 5, 0.25, 0.5, 'stair');
  B.push(box(-15, -1, 56.5, -6, 6.5, 60, 'stone'));

  // 崖（見えない壁ではなく、岩の壁）
  B.push(box(-8, 0, -6, -6, 9, 12, 'rock', 'wall'));
  B.push(box(6, 0, -6, 8, 9, 12, 'rock', 'wall'));
  B.push(box(-6, 0, -7, 6, 6, -6, 'rock', 'wall'));
  B.push(box(-8, 4, 12, -6, 12, 20, 'rock', 'wall'));
  B.push(box(6, 4, 12, 8, 12, 20, 'rock', 'wall'));
  B.push(box(7, 4.5, 30, 9, 12, 52, 'rock', 'wall'));
  B.push(box(-9, 4.5, 38, -7, 12, 42.35, 'rock', 'wall')); // 回り道と柵の先を分ける
  B.push(box(-9, 4.5, 42.35, -7, 12, 52, 'rock', 'wall'));
  B.push(box(-17, 4.5, 30, -15, 12, 60, 'rock', 'wall'));
  B.push(box(-15, 4.5, 30, -7, 12, 33, 'rock', 'wall'));
  B.push(box(8, 6.5, 52, 10, 14, 66, 'rock', 'wall'));
  B.push(box(-8, 6.5, 60, -6, 14, 66, 'rock', 'wall'));
  B.push(box(-17, 6.5, 60, -6, 14, 62, 'rock', 'wall'));
  B.push(box(-8, 6.5, 66, 10, 14, 68, 'rock', 'wall'));

  // 上の広場：大石灯籠と、おこんの鳥居（質帳）
  P.push({ kind: 'bigLantern', x: 4.5, y: 6.5, z: 57 });
  torii(B, P, 0, 6.5, 62.5, 0, 1.25, 1);
  l.shrines.push({ id: 'c1_d', x: 0, y: 6.5, z: 62.5, yaw: 0, name: '山門の鳥居', shop: true });
  l.exit = { box: box(-3, 6, 64.5, 3, 10, 66), to: 'ch2' };
  l.gates.push({ id: 'c1_gate', box: box(-3, 6.5, 64, 3, 9.5, 64.5, 'gate'), opensWhen: { flag: 'trig:c1_ledger' } });

  // 飾り
  for (let z = 5; z <= 11; z += 2) {
    P.push({ kind: 'cedar', x: -4.8, y: 0, z, scale: 1.1 + (z % 3) * 0.1 });
    P.push({ kind: 'cedar', x: 4.8, y: 0, z: z + 1, scale: 1.0 + (z % 4) * 0.1 });
  }
  P.push({ kind: 'lantern', x: -4.5, y: 0, z: 2 });
  P.push({ kind: 'lantern', x: 4.5, y: 0, z: 2 });
  P.push({ kind: 'lantern', x: 4.6, y: 4, z: 14 });
  P.push({ kind: 'brokenBridge', x: 0, y: 4, z: 20 });
  P.push({ kind: 'brokenBridge', x: 0, y: 4.5, z: 30, yaw: Math.PI });
  P.push({ kind: 'signpost', x: 2.6, y: 4, z: 19.2 });
  P.push({ kind: 'cedar', x: 5.2, y: 4.5, z: 33, scale: 1.4 });
  P.push({ kind: 'cedar', x: -5.5, y: 4.5, z: 40.5, scale: 1.2 });
  P.push({ kind: 'jizo', x: -13.5, y: 4.5, z: 34.2, yaw: Math.PI / 2 });
  P.push({ kind: 'jizo', x: -12.5, y: 6.5, z: 59, yaw: Math.PI });
  P.push({ kind: 'cedar', x: -3.5, y: 6.5, z: 55, scale: 1.5 });
  P.push({ kind: 'cedar', x: 6.5, y: 6.5, z: 63, scale: 1.3 });
  P.push({ kind: 'lantern', x: -3, y: 6.5, z: 61 });
  P.push({ kind: 'lantern', x: 3, y: 6.5, z: 61 });

  l.readables.push({ id: 'c1_sign', x: 2.6, y: 4, z: 19.2, script: 'c1_sign', label: '立て札を読む' });
  l.readables.push({ id: 'c1_jizo', x: -13.5, y: 4.5, z: 34.2, script: 'c1_jizo', label: 'お地蔵さまを見る' });

  // 妖
  l.enemies.push({ id: 'c1_m1', type: 'menyo', x: -2, y: 4, z: 15.5, yaw: Math.PI });
  l.enemies.push({ id: 'c1_m2', type: 'menyo', x: 2.5, y: 4, z: 17, yaw: Math.PI });
  l.enemies.push({ id: 'c1_b1', type: 'ishibozu', x: -1, y: 4.5, z: 36, yaw: Math.PI });
  l.enemies.push({ id: 'c1_m3', type: 'menyo', x: 3.5, y: 4.5, z: 37.5, yaw: Math.PI });
  l.enemies.push({ id: 'c1_m4', type: 'menyo', x: -12, y: 4.5, z: 35.5, yaw: 0 });
  l.enemies.push({ id: 'c1_b2', type: 'ishibozu', x: -10.5, y: 5.25, z: 51, yaw: 0 });
  l.enemies.push({ id: 'c1_m5', type: 'menyo', x: 1, y: 6.5, z: 55, yaw: Math.PI });
  l.enemies.push({ id: 'c1_m6', type: 'menyo', x: -2.5, y: 6.5, z: 57, yaw: Math.PI });

  // 銭
  l.pickups.push({ id: 'c1_z1', x: 4, y: 0.6, z: 0, value: 3 });
  l.pickups.push({ id: 'c1_z2', x: 0, y: 4.6, z: 13.2, value: 4 });
  l.pickups.push({ id: 'c1_z3', x: 5, y: 4.6, z: 13, value: 4 });
  l.pickups.push({ id: 'c1_z4', x: 0, y: 5.6, z: 26, value: 5 });
  l.pickups.push({ id: 'c1_z5', x: -6, y: 5.1, z: 41, value: 5 });
  l.pickups.push({ id: 'c1_z6', x: 6, y: 5.1, z: 31, value: 4 });
  l.pickups.push({ id: 'c1_z7', x: -14, y: 5.1, z: 36.5, value: 6 });
  l.pickups.push({ id: 'c1_z8', x: -13, y: 5.8, z: 44, value: 5 });
  l.pickups.push({ id: 'c1_z9', x: 6, y: 7.1, z: 54, value: 5 });

  l.spawn = { x: 0, y: 0, z: -0.5, yaw: 0 };

  l.triggers.push({ id: 'c1_intro', box: box(-6, -1, -6, 6, 3, 4), script: 'c1_intro' });
  l.triggers.push({ id: 'c1_gap', box: box(-6, 3.5, 18.8, 6, 7, 20), script: 'c1_gap' });
  l.triggers.push({ id: 'c1_cross', box: box(-7, 4, 30.5, 7, 8, 32), script: 'c1_cross', needFlag: 'law:jump' });
  l.triggers.push({ id: 'c1_mask', box: box(-20, -10, -10, 20, 20, 70), script: 'c1_mask', needFlag: 'down:c1_m1' });
  l.triggers.push({ id: 'c1_fence', box: box(-7, 4, 40.5, 7, 8, 42), script: 'c1_fence' });
  l.triggers.push({ id: 'c1_ledger', box: box(-6, 6, 59, 8, 10, 63.5), script: 'c1_ledger' });

  l.hints.push({ box: box(-6, 3.5, 18, 6, 7, 20), text: 'E：鳥居のおこんと話す　型を質に入れると、その力は世の理になる', unlessFlag: 'law:jump' });
  l.hints.push({
    box: box(-7, 4, 38.5, 7, 8, 42),
    text: '跳を請け出せば柵を越えられる（38 銭）　質に入れたままなら、西の崖沿いの道へ',
    unlessFlag: 'trig:c1_ledger',
  });

  l.goals.push({ unlessFlag: 'trig:c1_gap', text: '石段を登る' });
  l.goals.push({ unlessFlag: 'trig:c1_cross', text: '谷を渡る（おこんに相談する）' });
  l.goals.push({ unlessFlag: 'trig:c1_ledger', text: '柵の向こう、山門の鳥居へ' });
  l.goals.push({ text: '山門をくぐり、さらに上へ' });

  l.route = [
    { x: 0, y: 0, z: 3 },
    { x: 0, y: 4, z: 13 },
    { x: 0, y: 4, z: 16, act: 'fight' },
    { x: -3.3, y: 4, z: 17.4, act: 'shop', pawn: ['jump'] },
    { x: 0, y: 4, z: 19.5, act: 'wait', wait: 2.5 },
    { x: 0, y: 4.25, z: 29 },
    { x: 0, y: 4.5, z: 34, act: 'fight' },
    { x: 4.2, y: 4.5, z: 39.6, act: 'shop', redeem: ['jump'] },
    { x: 0, y: 4.5, z: 41.5 },
    { x: 0, y: 4.5, z: 43, act: 'jump' },
    { x: 0, y: 6.5, z: 52.5 },
    { x: 0, y: 6.5, z: 56, act: 'fight' },
    { x: 0, y: 6.5, z: 61 },
    { x: 0, y: 7, z: 65.2 },
  ];
  return l;
}
