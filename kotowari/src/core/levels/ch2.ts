import { box, emptyLevel, torii } from './build';
import type { LevelDef } from './types';

/**
 * 二の章「風鳴りの竹林」：払を質に入れると風の理が働く（東へ吹く）。
 * 風車門は風で開く。扇の効かない鎧面は、風で谷へ吹き落とせる。
 * 吊り橋では風に流されないよう斜めに歩く。出口の広場は「扇で戦う」か「風で落とす」か。
 */
export function ch2(): LevelDef {
  const l = emptyLevel('ch2');
  l.title = '二の章　風鳴りの竹林';
  l.subtitle = '払えば、風が吹く';
  l.theme = 'bamboo';
  l.killY = -5;
  l.wind = { x: 1, z: 0, strength: 2.4 };
  const B = l.boxes;
  const P = l.props;

  // A：入口
  B.push(box(-6, -1, -4, 6, 0, 22.6, 'moss')); // 門の下まで床をつなぐ（跳べなくても溝にはまらない）
  torii(B, P, 0, 0, -2, 0, 1, 0);
  l.shrines.push({ id: 'c2_a', x: 0, y: 0, z: -2, yaw: 0, name: '竹林の鳥居', shop: true });
  // 竹の壁（両側）
  B.push(box(-8, 0, -4, -6, 7, 22, 'bamboowall', 'wall'));
  B.push(box(6, 0, -4, 8, 7, 22, 'bamboowall', 'wall'));
  B.push(box(-8, 0, -6, 8, 7, -4, 'bamboowall', 'wall'));
  // C：風車門
  B.push(box(-8, 0, 22, -2.5, 7, 22.6, 'bamboowall', 'wall'));
  B.push(box(2.5, 0, 22, 8, 7, 22.6, 'bamboowall', 'wall'));
  l.gates.push({ id: 'c2_gate', box: box(-2.5, 0, 22, 2.5, 3.6, 22.6, 'gate'), opensWhen: { law: 'fan' } });
  P.push({ kind: 'kazaguruma', x: 4.2, y: 0, z: 21, yaw: Math.PI });
  torii(B, P, -3.6, 0, 18.5, 0, 0.8, 0);
  l.shrines.push({ id: 'c2_b', x: -3.6, y: 0, z: 18.5, yaw: 0, name: '風車の鳥居', shop: true, stall: { x: -4.75, z: 14.8, yaw: Math.PI / 2 } });

  // D：風の尾根（東は谷）
  B.push(box(-2.5, -1, 22.6, 2.2, 0, 40, 'moss'));
  B.push(box(-5, 0, 22.6, -2.5, 7, 40, 'bamboowall', 'wall'));
  for (const [z0, z1] of [
    [24, 27],
    [30, 33],
    [36.5, 39.5],
  ])
    B.push(box(2.0, 0, z0, 2.25, 0.9, z1, 'fence', 'fence'));
  B.push(box(2.2, -7, 22.6, 12, -6, 40, 'water', 'hazard'));
  // E：弥助の空き地
  B.push(box(-7, -1, 40, 7, 0, 52, 'moss'));
  B.push(box(-9, 0, 40, -7, 7, 52, 'bamboowall', 'wall'));
  B.push(box(7, 0, 40, 9, 7, 46, 'bamboowall', 'wall'));
  torii(B, P, 4.6, 0, 49, -Math.PI / 2, 0.85, 0);
  l.shrines.push({ id: 'c2_c', x: 4.6, y: 0, z: 49, yaw: -Math.PI / 2, name: '空き地の鳥居', shop: true, stall: { x: 5.8, z: 45.6, yaw: -Math.PI / 2 } });
  P.push({ kind: 'yasuke', x: -3.5, y: 0, z: 47.5, yaw: Math.PI / 2 + 0.4 });
  B.push(box(-3.8, 0, 47.2, -3.2, 1.2, 47.8, 'none', 'wall'));
  // 隠し場所：岩棚（高さ 3m。跳では届かない。浮石の理なら、地面から石がせり上がって段になる）
  B.push(box(-7, -1, 48, -4.5, 3, 52, 'rock'));
  for (let i = 1; i <= 10; i++) {
    const top = i * 0.3;
    const z0 = 43 + (i - 1) * 0.5;
    l.floats.push({ id: 'c2_s' + i, box: box(-5.6, -1.1, z0, -4.6, -0.1, z0 + 0.5, 'floatstone'), lift: top + 0.1, delay: i * 0.1 });
  }
  l.readables.push({ id: 'c2_cache', x: -6, y: 3, z: 50.5, script: 'c2_cache', label: '竹の筒をのぞく' });
  l.pickups.push({ id: 'c2_zs', x: -5.2, y: 3.6, z: 51.2, value: 8 });
  P.push({ kind: 'bamboo', x: -6.4, y: 3, z: 51.4, variant: 0 });
  // F：吊り橋（手すりは杭だけ）
  B.push(box(-1.2, -0.3, 52, 1.2, 0, 64, 'bridge'));
  for (let z = 52; z <= 64; z += 2) {
    B.push(box(-1.35, 0, z, -1.15, 1.0, z + 0.2, 'bridgepost', 'wall'));
    B.push(box(1.15, 0, z, 1.35, 1.0, z + 0.2, 'bridgepost', 'wall'));
  }
  B.push(box(-12, -8, 52, 12, -7, 64, 'water', 'hazard'));
  // G：出口の広場（東の縁は開いている）
  B.push(box(-7, -1, 64, 6, 0, 78, 'moss'));
  B.push(box(-9, 0, 64, -7, 7, 80, 'bamboowall', 'wall'));
  B.push(box(-9, 0, 78, 9, 7, 80, 'bamboowall', 'wall'));
  B.push(box(6, -8, 64, 14, -7, 78, 'water', 'hazard'));
  for (const [z0, z1] of [
    [64.5, 68],
    [71, 73],
    [76, 78],
  ])
    B.push(box(5.75, 0, z0, 6.0, 0.9, z1, 'fence', 'fence'));
  torii(B, P, 0, 0, 75.5, 0, 1.2, 1);
  l.shrines.push({ id: 'c2_d', x: 0, y: 0, z: 75.5, yaw: 0, name: '宿場口の鳥居', shop: true, stall: { x: -4.6, z: 73.2, yaw: Math.PI / 2 } });
  l.exit = { box: box(-2.5, -1, 77.2, 2.5, 4, 78), to: 'ch3' };
  l.gates.push({ id: 'c2_exitgate', box: box(-2.5, 0, 76.6, 2.5, 3.2, 77.1, 'gate'), opensWhen: { flag: 'trig:c2_yasuke' } });

  // 竹（飾り）
  const groves: [number, number][] = [
    [-5, 2], [5, 4], [-5.2, 9], [5.1, 11], [-5, 15], [5.3, 17], [-4, 26], [-4.2, 32], [-4, 37], [-8, 44], [8, 41], [-6.5, 50], [-8, 67], [-8, 72], [7.5, 79], [-8.5, 58], [8.5, 58],
  ];
  groves.forEach(([x, z], i) => P.push({ kind: 'bamboo', x, y: 0, z, variant: i % 3 }));
  P.push({ kind: 'kazaguruma', x: -5.2, y: 0, z: 70, yaw: Math.PI / 2 });
  P.push({ kind: 'lantern', x: -2.5, y: 0, z: 4 });
  P.push({ kind: 'lantern', x: 2.5, y: 0, z: 4 });
  P.push({ kind: 'lantern', x: -2.5, y: 0, z: 63.5 });
  P.push({ kind: 'lantern', x: 2.5, y: 0, z: 63.5 });
  P.push({ kind: 'jizo', x: -6, y: 0, z: 42, yaw: Math.PI / 2 });
  P.push({ kind: 'signpost', x: 2, y: 0, z: 20.6, yaw: 0 });

  l.readables.push({ id: 'c2_sign', x: 2, y: 0, z: 20.6, script: 'c2_sign', label: '立て札を読む' });
  l.readables.push({ id: 'c2_jizo', x: -6, y: 0, z: 42, script: 'c2_jizo', label: 'お地蔵さまを見る' });

  // 妖
  l.enemies.push({ id: 'c2_m1', type: 'menyo', x: -2, y: 0, z: 11, yaw: Math.PI });
  l.enemies.push({ id: 'c2_m2', type: 'menyo', x: 2.5, y: 0, z: 14, yaw: Math.PI });
  l.enemies.push({ id: 'c2_y1', type: 'yoroimen', x: 0, y: 0, z: 25.5, yaw: Math.PI });
  l.enemies.push({ id: 'c2_y2', type: 'yoroimen', x: 0, y: 0, z: 31.5, yaw: Math.PI });
  l.enemies.push({ id: 'c2_m3', type: 'menyo', x: -2, y: 0, z: 69, yaw: Math.PI });
  l.enemies.push({ id: 'c2_m4', type: 'menyo', x: 2.5, y: 0, z: 70.5, yaw: Math.PI });
  l.enemies.push({ id: 'c2_y3', type: 'yoroimen', x: 0, y: 0, z: 72, yaw: Math.PI });

  // 銭
  l.pickups.push({ id: 'c2_z1', x: -3.5, y: 0.6, z: 6, value: 3 });
  l.pickups.push({ id: 'c2_z2', x: 3.5, y: 0.6, z: 9, value: 3 });
  l.pickups.push({ id: 'c2_z3', x: 1.2, y: 0.6, z: 31.5, value: 4 });
  l.pickups.push({ id: 'c2_z4', x: -1.5, y: 0.6, z: 38, value: 4 });
  l.pickups.push({ id: 'c2_z5', x: 5, y: 0.6, z: 42, value: 4 });
  l.pickups.push({ id: 'c2_z6', x: 0, y: 0.6, z: 58, value: 4 });
  l.pickups.push({ id: 'c2_z7', x: -5, y: 0.6, z: 66, value: 4 });

  l.spawn = { x: 0, y: 0, z: 0.5, yaw: 0 };
  l.establish = { from: [-4.5, 2.6, -3], to: [1, 3.2, 14] };

  l.triggers.push({ id: 'c2_intro', box: box(-6, -1, -4, 6, 3, 3), script: 'c2_intro' });
  l.triggers.push({ id: 'c2_gate', box: box(-6, -1, 19.5, 6, 3, 22), script: 'c2_gate' });
  l.triggers.push({ id: 'c2_ridge', box: box(-2.5, -1, 23, 2.2, 3, 25), script: 'c2_ridge' });
  l.triggers.push({ id: 'c2_armor', box: box(-20, -20, -10, 20, 20, 90), script: 'c2_armor', needFlag: 'down:c2_y1' });
  l.triggers.push({ id: 'c2_yasuke', box: box(-7, -1, 43, 2, 3, 50), script: 'c2_yasuke' });
  l.triggers.push({ id: 'c2_bridge', box: box(-2, -1, 51, 2, 3, 53), script: 'c2_bridge' });
  l.triggers.push({ id: 'c2_end', box: box(-7, -1, 66, 6, 3, 68), script: 'c2_end' });

  l.hints.push({ box: box(-6, -1, 16, 6, 3, 22), text: '風車門は風が吹かないと開かない　払を質に入れると「風の理」が働く', unlessFlag: 'law:fan' });
  l.hints.push({ box: box(-2.5, -1, 23, 2.2, 3, 40), text: '風は東（谷の方）へ吹いている　鎧面は風で谷へ落ちる' });
  l.hints.push({ box: box(-2, -1, 51, 2, 3, 64), text: '風に流されないよう、少し西（左）へ向かって歩く' });

  l.goals.push({ unlessFlag: 'trig:c2_gate', text: '竹林を抜ける' });
  l.goals.push({ unlessFlag: 'law:fan', text: '風車門を開ける（おこんに相談する）' });
  l.goals.push({ unlessFlag: 'trig:c2_yasuke', text: '風の尾根を渡る' });
  l.goals.push({ text: '吊り橋を渡り、宿場口の鳥居へ' });

  l.route = [
    { x: 0, y: 0, z: 6 },
    { x: 0, y: 0, z: 12, act: 'fight' },
    { x: -3.8, y: 0, z: 15.5, act: 'shop', pawn: ['fan'] },
    { x: 0, y: 0, z: 21, act: 'wait', wait: 2.0 },
    { x: -1.2, y: 0, z: 26 },
    { x: -1.4, y: 0, z: 34 },
    { x: -1.2, y: 0, z: 41 },
    { x: 0, y: 0, z: 47 },
    { x: -0.4, y: 0, z: 53, r: 0.6 },
    { x: -0.6, y: 0, z: 63, r: 0.7 },
    { x: -1, y: 0, z: 68 },
    { x: 0, y: 0, z: 74, act: 'wait', wait: 3 },
    { x: 0, y: 0, z: 77.8, r: 0.4 },
  ];
  return l;
}
