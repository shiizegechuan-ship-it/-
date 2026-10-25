import { box, emptyLevel, stairsZ, torii } from './build';
import type { LevelDef } from './types';

/**
 * 終章「山頂の神楽殿」：夜守（千鶴）を鎮め、苔の落ちた碑の続きを読み、最後の選択をする。
 * 広場の周りに 4 つの理の仕掛け（浮石・風・影・緩）を置き、真の結末で「世界が舞う」。
 */
export function finale(): LevelDef {
  const l = emptyLevel('finale');
  l.title = '終章　山頂の神楽殿';
  l.subtitle = '納めるのは、何か';
  l.theme = 'summit';
  l.killY = -6;
  l.wind = { x: 0.6, z: -0.8, strength: 1.6 };
  const B = l.boxes;
  const P = l.props;

  // 登り口と、おこんの鳥居
  B.push(box(-4, -1, -8, 4, 0, 6.6, 'stone')); // 木戸の下まで床をつなぐ
  B.push(box(-6, 0, -8, -4, 6, 6, 'rock', 'wall'));
  B.push(box(4, 0, -8, 6, 6, 6, 'rock', 'wall'));
  B.push(box(-4, 0, -9, 4, 6, -8, 'rock', 'wall'));
  torii(B, P, 0, 0, -5, 0, 1.0, 0);
  l.shrines.push({ id: 'fin_a', x: 0, y: 0, z: -5, yaw: 0, name: '山頂の鳥居', shop: true, stall: { x: -2.9, z: -2.2, yaw: Math.PI / 2 } });
  // 戦いの間は閉じる木戸
  l.gates.push({ id: 'fin_gate', box: box(-4, 0, 6, 4, 3.2, 6.5, 'gate'), opensWhen: { notFlag: 'boss_fighting' } });
  // 山頂の広場
  B.push(box(-12, -1, 6.5, 12, 0, 34, 'gravel'));
  B.push(box(-14, 0, 6.5, -12, 8, 40, 'rock', 'wall'));
  B.push(box(12, 0, 6.5, 14, 8, 40, 'rock', 'wall'));
  B.push(box(-14, 0, 40, 14, 8, 42, 'rock', 'wall'));
  B.push(box(-12, 0, 6.5, -4, 6, 7, 'rock', 'wall'));
  B.push(box(4, 0, 6.5, 12, 6, 7, 'rock', 'wall'));
  // 神楽殿（奥・高さ 1）
  B.push(box(-6, -1, 30, 6, 1, 40, 'wood'));
  stairsZ(B, 0, 4, 28, 0, 4, 0.25, 0.5, 'woodstair');
  P.push({ kind: 'kaguraden', x: 0, y: 1, z: 35, scale: 1.2 });
  // 碑（広場の中ほど）
  P.push({ kind: 'stele', x: -5, y: 0, z: 24, yaw: 0.5, scale: 1.5 });
  B.push(box(-5.6, 0, 23.6, -4.4, 2.5, 24.4, 'none', 'wall'));
  l.readables.push({ id: 'fin_stele', x: -5, y: 0, z: 24.2, script: 'fin_stele', label: '碑の足元を見る' });
  // 4 つの理の仕掛け：浮石（四隅）・影（神楽殿の屋根の影）
  for (const [x, z] of [
    [-9, 10],
    [9, 10],
    [-9, 28],
    [9, 28],
  ])
    l.floats.push({ id: `fin_f${x}_${z}`, box: box(x - 1, -0.6, z - 1, x + 1, 0, z + 1, 'floatstone'), lift: 1.4, delay: Math.abs(x + z) * 0.03 });
  l.shadows.push(box(-6, -0.2, 26.5, 6, 0, 29.8));
  // 飾り
  for (const z of [10, 18, 26]) {
    P.push({ kind: 'lantern', x: -10.5, y: 0, z });
    P.push({ kind: 'lantern', x: 10.5, y: 0, z });
  }
  P.push({ kind: 'cedar', x: -10.5, y: 0, z: 36, scale: 1.4 });
  P.push({ kind: 'cedar', x: 10.5, y: 0, z: 36, scale: 1.3 });
  P.push({ kind: 'bell', x: 8.5, y: 0, z: 32 });
  P.push({ kind: 'taiko', x: -3, y: 1, z: 33, yaw: 0.4 });

  // 夜守（千鶴）
  l.enemies.push({ id: 'fin_boss', type: 'yomori', x: 0, y: 0, z: 22, yaw: Math.PI });
  l.arena = { box: box(-12, -1, 7.5, 12, 6, 34), afterFlag: 'trig:fin_meet' };

  l.pickups.push({ id: 'fin_z1', x: 2.5, y: 0.6, z: 1, value: 10 });

  l.spawn = { x: 0, y: 0, z: -2.5, yaw: 0 };
  l.establish = { from: [7, 4.5, 4], to: [0, 3, 30] };

  l.triggers.push({ id: 'fin_intro', box: box(-4, -1, -8, 4, 3, 0), script: 'fin_intro' });
  l.triggers.push({ id: 'fin_meet', box: box(-12, -1, 7.5, 12, 5, 10), script: 'fin_meet' });
  l.triggers.push({ id: 'fin_after', box: box(-20, -10, -10, 20, 20, 50), script: 'fin_after', needFlag: 'boss_done' });

  l.hints.push({ box: box(-4, -1, -8, 4, 3, 6), text: '戦いの前に、おこんの所で型を整えられる', unlessFlag: 'trig:fin_meet' });
  l.hints.push({ box: box(-12, -1, 7.5, 12, 5, 34), text: '赤い帯は突進、赤い円は叩きつけ、赤い線は投げる扇', needFlag: 'boss_fighting' });
  l.hints.push({ box: box(-12, -1, 7.5, 12, 5, 34), text: '碑の足元を見る（E）', needFlag: 'trig:fin_after', unlessFlag: 'read:fin_stele' });

  l.goals.push({ unlessFlag: 'trig:fin_meet', text: '神楽殿へ' });
  l.goals.push({ unlessFlag: 'boss_done', text: '夜守を鎮める' });
  l.goals.push({ unlessFlag: 'read:fin_stele', text: '碑の足元を見る' });
  l.goals.push({ text: '朝を、どうするか' });

  l.route = [
    { x: -1.6, y: 0, z: -2.0, act: 'shop', redeem: ['fan'] },
    { x: -1.5, y: 0, z: -1.8, act: 'shop', redeem: ['dash'] },
    { x: 0, y: 0, z: 4 },
    { x: 0, y: 0, z: 12, act: 'fight' },
    { x: 0, y: 0, z: 18, act: 'fight' },
    { x: -4.2, y: 0, z: 23.2, act: 'read', r: 0.4 },
  ];
  return l;
}
