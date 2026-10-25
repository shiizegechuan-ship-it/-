import { box, emptyLevel, torii } from './build';
import type { LevelDef } from './types';

/**
 * 三の章「影灯籠の宿場」：灯（幽かな橋を見せ、影法師を退ける）と、灯を質に入れた「影の理」（影が固まって踏める・影法師に扇が届く）。
 * 堀 1：幽かな橋／影の橋のどちらでも渡れる。灯屋で祖母の日記を読む。
 * 空堀：大提灯の影の橋だけ（灯を質に入れる）。暗い広場の先の最後の堀：幽かな橋だけ（灯を請け出す）。
 */
export function ch3(): LevelDef {
  const l = emptyLevel('ch3');
  l.title = '三の章　影灯籠の宿場';
  l.subtitle = '灯があるから、影ができる';
  l.theme = 'town';
  l.killY = -4;
  const B = l.boxes;
  const P = l.props;
  const street = (z0: number, z1: number) => B.push(box(-4, -1, z0, 4, 0, z1, 'cobble'));
  const houses = (z0: number, z1: number) => {
    B.push(box(-10, 0, z0, -4, 6, z1, 'none', 'wall'));
    B.push(box(4, 0, z0, 10, 6, z1, 'none', 'wall'));
    for (let z = z0; z < z1 - 0.1; z += 4) {
      P.push({ kind: 'machiya', x: -4, y: 0, z: z + 2, yaw: Math.PI / 2, variant: Math.floor(z) % 3 });
      P.push({ kind: 'machiya', x: 4, y: 0, z: z + 2, yaw: -Math.PI / 2, variant: (Math.floor(z) + 1) % 3 });
    }
  };

  // A：宿場の入口
  street(-6, 10);
  houses(-6, 10);
  B.push(box(-4, 0, -7, 4, 6, -6, 'plaster', 'wall'));
  torii(B, P, 0, 0, -3.5, 0, 0.95, 0);
  l.shrines.push({ id: 'c3_a', x: 0, y: 0, z: -3.5, yaw: 0, name: '宿場口の鳥居', shop: true, stall: { x: -2.9, z: -0.6, yaw: Math.PI / 2 } });
  // B：堀 1（幽かな橋 x -1..1／影の橋 x 2.2..3.8）
  B.push(box(-10, -3, 10, 10, -2.6, 18, 'water', 'hazard'));
  B.push(box(-4.2, -2.6, 10, -4, 0, 18, 'stone', 'wall'));
  B.push(box(4, -2.6, 10, 4.2, 0, 18, 'stone', 'wall'));
  l.ghosts.push(box(-1, -0.2, 9.9, 1, 0, 18.1));
  l.shadows.push(box(2.2, -0.25, 9.9, 3.8, 0, 18.1));
  P.push({ kind: 'bigChochin', x: 3, y: 4.2, z: 19.2 });
  P.push({ kind: 'willow', x: -3.2, y: 0, z: 9.2 });
  // C：灯屋の通り
  street(18, 34);
  B.push(box(4, 0, 18, 10, 6, 34, 'none', 'wall'));
  for (let z = 18; z < 34; z += 4) P.push({ kind: 'machiya', x: 4, y: 0, z: z + 2, yaw: -Math.PI / 2, variant: (z / 4) % 3 });
  B.push(box(-12, 0, 18, -4, 7, 34, 'none', 'wall'));
  P.push({ kind: 'inn', x: -4, y: 0, z: 26, yaw: Math.PI / 2 });
  torii(B, P, 2.6, 0, 21, -Math.PI / 2, 0.75, 0);
  l.shrines.push({ id: 'c3_b', x: 2.6, y: 0, z: 21, yaw: -Math.PI / 2, name: '灯屋前の鳥居', shop: true, stall: { x: 3.1, z: 24.6, yaw: -Math.PI / 2 } });
  // D：空堀（大提灯の影だけが橋になる）
  B.push(box(-10, -10, 34, 10, -9.6, 44, 'rock', 'hazard'));
  B.push(box(-4.2, -9.6, 34, -4, 0, 44, 'rock', 'wall'));
  B.push(box(4, -9.6, 34, 4.2, 0, 44, 'rock', 'wall'));
  l.shadows.push(box(-1, -0.25, 33.9, 1, 0, 44.1));
  P.push({ kind: 'bigChochin', x: 0, y: 5.5, z: 31.5, scale: 1.4 });
  // E：暗い広場
  street(44, 56);
  houses(44, 56);
  torii(B, P, 2.7, 0, 52.5, -Math.PI / 2, 0.75, 0);
  l.shrines.push({ id: 'c3_c', x: 2.7, y: 0, z: 52.5, yaw: -Math.PI / 2, name: '堀端の鳥居', shop: true, stall: { x: 3.1, z: 49.2, yaw: -Math.PI / 2 } });
  // F：最後の堀（幽かな橋だけ）
  B.push(box(-10, -3, 56, 10, -2.6, 63, 'water', 'hazard'));
  B.push(box(-4.2, -2.6, 56, -4, 0, 63, 'stone', 'wall'));
  B.push(box(4, -2.6, 56, 4.2, 0, 63, 'stone', 'wall'));
  l.ghosts.push(box(-1, -0.2, 55.9, 1, 0, 63.1));
  // G：出口
  street(63, 70);
  B.push(box(-6, 0, 63, -4, 6, 70, 'rock', 'wall'));
  B.push(box(4, 0, 63, 6, 6, 70, 'rock', 'wall'));
  B.push(box(-6, 0, 70, 6, 6, 71, 'rock', 'wall'));
  torii(B, P, 0, 0, 67.5, 0, 1.1, 1);
  l.shrines.push({ id: 'c3_d', x: 0, y: 0, z: 67.5, yaw: 0, name: '滝道の鳥居', shop: false });
  l.exit = { box: box(-2.5, -1, 69, 2.5, 4, 70), to: 'ch4' };
  l.gates.push({ id: 'c3_exitgate', box: box(-2.5, 0, 68.4, 2.5, 3.2, 68.9, 'gate'), opensWhen: { flag: 'read:c3_diary' } });

  // 飾り
  P.push({ kind: 'well', x: -2.6, y: 0, z: 3 });
  P.push({ kind: 'lantern', x: -3.2, y: 0, z: 46 });
  P.push({ kind: 'willow', x: 3.2, y: 0, z: 55.4 });
  P.push({ kind: 'jizo', x: -3.3, y: 0, z: 64.5, yaw: Math.PI / 2 });
  P.push({ kind: 'signpost', x: -3, y: 0, z: 8.6, yaw: 0.3 });

  l.readables.push({ id: 'c3_diary', x: -3.6, y: 0, z: 28.5, script: 'c3_diary', label: '帳場の日記を読む' });
  l.readables.push({ id: 'c3_sign', x: -3, y: 0, z: 8.6, script: 'c3_sign', label: '立て札を読む' });
  l.readables.push({ id: 'c3_well', x: -2.6, y: 0, z: 3, script: 'c3_well', label: '井戸をのぞく' });

  // 妖：影法師（灯で退く。影の理で実体）
  l.enemies.push({ id: 'c3_k1', type: 'kageboshi', x: 2, y: 0, z: 5, yaw: Math.PI });
  l.enemies.push({ id: 'c3_k2', type: 'kageboshi', x: -2, y: 0, z: 22, yaw: Math.PI });
  l.enemies.push({ id: 'c3_m1', type: 'menyo', x: 1.5, y: 0, z: 30, yaw: Math.PI });
  l.enemies.push({ id: 'c3_k3', type: 'kageboshi', x: -2, y: 0, z: 48, yaw: Math.PI });
  l.enemies.push({ id: 'c3_k4', type: 'kageboshi', x: 1.5, y: 0, z: 50.5, yaw: Math.PI });
  l.enemies.push({ id: 'c3_k5', type: 'kageboshi', x: -1, y: 0, z: 54, yaw: Math.PI });

  // 銭
  l.pickups.push({ id: 'c3_z1', x: 3, y: 0.6, z: 1, value: 5 });
  l.pickups.push({ id: 'c3_z2', x: -2.5, y: 0.6, z: 20, value: 6 });
  l.pickups.push({ id: 'c3_z3', x: 2.5, y: 0.6, z: 32, value: 6 });
  l.pickups.push({ id: 'c3_z4', x: 0, y: 0.6, z: 39, value: 8 });
  l.pickups.push({ id: 'c3_z5', x: -3, y: 0.6, z: 45, value: 6 });
  l.pickups.push({ id: 'c3_z6', x: 3, y: 0.6, z: 64, value: 6 });

  // 時間制限：日記を読むと灯屋の灯が消えはじめ、影が満ちる。空堀の向こうまで 40 秒
  l.timers = [
    {
      id: 'c3_dark',
      label: '影が満ちる前に、空堀を渡れ',
      startFlag: 'read:c3_diary',
      startBox: box(-4, -1, 18, 4, 4, 34),
      goal: box(-4, -1, 44.5, 4, 4, 56),
      duration: 40,
      failText: '影に、呑まれた。',
    },
  ];
  // 刻限の間だけ現れる影法師
  l.enemies.push({ id: 'c3_kx1', type: 'kageboshi', x: -2.5, y: 0, z: 19.5, yaw: 0, needFlag: 'timer_on:c3_dark' });
  l.enemies.push({ id: 'c3_kx2', type: 'kageboshi', x: 2.5, y: 0, z: 30.5, yaw: Math.PI, needFlag: 'timer_on:c3_dark' });
  l.spawn = { x: 0, y: 0, z: -1.5, yaw: 0 };
  l.establish = { from: [2.8, 2.6, -5.2], to: [-1, 2.4, 12] };

  l.triggers.push({ id: 'c3_intro', box: box(-4, -1, -6, 4, 3, 1), script: 'c3_intro' });
  l.triggers.push({ id: 'c3_shade', box: box(-4, -1, 2, 4, 3, 6), script: 'c3_shade' });
  l.triggers.push({ id: 'c3_canal', box: box(-4, -1, 7.5, 4, 3, 9.8), script: 'c3_canal' });
  l.triggers.push({ id: 'c3_inn', box: box(-4, -1, 23, 4, 3, 26), script: 'c3_inn' });
  l.triggers.push({ id: 'c3_moat', box: box(-4, -1, 32, 4, 3, 33.8), script: 'c3_moat', needFlag: 'read:c3_diary' });
  l.triggers.push({ id: 'c3_last', box: box(-4, -1, 53.5, 4, 3, 55.8), script: 'c3_last' });
  l.triggers.push({ id: 'c3_end', box: box(-4, -1, 64, 4, 3, 66), script: 'c3_end' });

  l.hints.push({ box: box(-4, -1, 2, 4, 3, 10), text: '灯（L）の輪の中では影法師は近寄れない　幽かな橋も灯の中だけに現れる', unlessFlag: 'law:lantern' });
  l.hints.push({ box: box(-4, -1, 30, 4, 3, 34), text: '空堀には大提灯の影だけが落ちている　灯を質に入れると「影の理」で影が踏める', unlessFlag: 'law:lantern' });
  l.hints.push({ box: box(-4, -1, 44, 4, 3, 56), text: '影の理の下では、影法師に扇が届く', needFlag: 'law:lantern', unlessFlag: 'redeemed:lantern' });

  l.goals.push({ unlessFlag: 'trig:c3_inn', text: '宿場を進み、灯屋を探す' });
  l.goals.push({ unlessFlag: 'read:c3_diary', text: '灯屋の帳場を調べる' });
  l.goals.push({ unlessFlag: 'trig:c3_last', text: '空堀を渡る' });
  l.goals.push({ text: '最後の堀を渡り、滝道の鳥居へ' });

  l.route = [
    { x: 0, y: 0, z: 4, act: 'lantern' },
    { x: 0, y: 0, z: 9, act: 'lantern', alt: { whenPawned: 'lantern', x: 3, z: 9 } },
    { x: 0, y: 0, z: 19, alt: { whenPawned: 'lantern', x: 3, z: 19 } },
    { x: -2.8, y: 0, z: 28.4, act: 'read', r: 0.4 },
    { x: 2.6, y: 0, z: 24.2, act: 'shop', pawn: ['lantern'] },
    { x: 0, y: 0, z: 33.4, act: 'wait', wait: 0.5 },
    { x: 0, y: 0, z: 45 },
    { x: 0, y: 0, z: 50, act: 'fight' },
    { x: 2.6, y: 0, z: 49.8, act: 'shop', redeem: ['lantern'] },
    { x: 0, y: 0, z: 55.4, act: 'lantern' },
    { x: 0, y: 0, z: 64 },
    { x: 0, y: 0, z: 69.5, r: 0.4 },
  ];
  return l;
}
