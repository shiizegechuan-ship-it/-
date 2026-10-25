import { box, emptyLevel, stairsZ, torii } from './build';
import type { LevelDef } from './types';

/**
 * 四の章「止まり滝」：駆を質に入れると緩の理が働き、鈴のほかの時が半分の速さになる。
 * 水車の羽根（道を払う）と落石（影が予兆）を、駆の無敵で抜けるか、時を緩めて歩いて抜けるか。
 * 途中の鳥居で、おこんが朝の質札の請人を明かす（物語の転換）。
 */
export function ch4(): LevelDef {
  const l = emptyLevel('ch4');
  l.title = '四の章　止まり滝';
  l.subtitle = '急げば、時が縮む';
  l.theme = 'falls';
  l.killY = -4;
  const B = l.boxes;
  const P = l.props;

  // A：川原
  B.push(box(-5, -1, -6, 5, 0, 8, 'gravel'));
  B.push(box(-7, 0, -6, -5, 8, 30, 'rock', 'wall'));
  B.push(box(5, 0, -6, 7, 8, 30, 'rock', 'wall'));
  B.push(box(-5, 0, -7, 5, 6, -6, 'rock', 'wall'));
  torii(B, P, 0, 0, -3.5, 0, 0.95, 0);
  l.shrines.push({ id: 'c4_a', x: 0, y: 0, z: -3.5, yaw: 0, name: '川原の鳥居', shop: true, stall: { x: 3.3, z: -0.8, yaw: -Math.PI / 2 } });
  // B：水車の羽根の道
  B.push(box(-5, -1, 8, 5, 0, 30, 'stone'));
  l.hazards.push({ id: 'c4_w1', kind: 'blade', x: 0, y: 0, z: 12, radius: 2.6, period: 3.2, phase: 0.0, width: 10 });
  l.hazards.push({ id: 'c4_w2', kind: 'blade', x: 0, y: 0, z: 18, radius: 2.6, period: 2.8, phase: 0.3, width: 10, dir: -1 });
  l.hazards.push({ id: 'c4_w3', kind: 'blade', x: 0, y: 0, z: 24, radius: 2.6, period: 2.4, phase: 0.6, width: 10 });
  // C：おこんの鳥居
  torii(B, P, 0, 0, 29, 0, 1.0, 1);
  l.shrines.push({ id: 'c4_b', x: 0, y: 0, z: 29, yaw: 0, name: '滝見の鳥居', shop: true, stall: { x: -3.3, z: 31, yaw: Math.PI / 2 } });
  // D：落石の坂（3m 上る）
  B.push(box(-5, -1, 30, 5, 0, 34, 'stone'));
  stairsZ(B, 0, 10, 34, 0, 12, 0.25, 1.0, 'stair');
  B.push(box(-7, 0, 30, -5, 10, 60, 'rock', 'wall'));
  B.push(box(5, 0, 30, 7, 10, 60, 'rock', 'wall'));
  l.hazards.push({ id: 'c4_r1', kind: 'rock', x: -1.6, y: 0.5, z: 36.5, radius: 1.1, period: 2.6, phase: 0 });
  l.hazards.push({ id: 'c4_r2', kind: 'rock', x: 1.4, y: 1.4, z: 39.5, radius: 1.1, period: 2.9, phase: 0.35 });
  l.hazards.push({ id: 'c4_r3', kind: 'rock', x: -0.6, y: 2.2, z: 42.5, radius: 1.2, period: 2.4, phase: 0.7 });
  l.hazards.push({ id: 'c4_r4', kind: 'rock', x: 1.8, y: 2.9, z: 45.2, radius: 1.1, period: 3.1, phase: 0.15 });
  // E：滝見台（水子提灯）
  B.push(box(-5, -1, 46, 5, 3, 62, 'stone'));
  torii(B, P, 2.8, 3, 57.5, -Math.PI / 2, 0.75, 0);
  l.shrines.push({ id: 'c4_c', x: 2.8, y: 3, z: 57.5, yaw: -Math.PI / 2, name: '滝見台の鳥居', shop: true, stall: { x: 3.3, z: 54, yaw: -Math.PI / 2 } });
  // F：滝壺と、山頂への石段
  B.push(box(-12, -2, 62, 12, -1.6, 74, 'water', 'hazard'));
  B.push(box(-1.5, -1, 62, 1.5, 3, 72, 'stone'));
  B.push(box(-7, 3, 46, -5, 12, 72, 'rock', 'wall'));
  B.push(box(5, 3, 46, 7, 12, 68.5, 'rock', 'wall'));
  // 隠し場所：滝の裏の岩棚。水の幕は緩の理（駆を質に入れる）で止まり、通れる
  B.push(box(1.5, -1, 69, 5, 3, 73.5, 'stone'));
  B.push(box(5, -1, 69, 9, 3, 73.5, 'stone'));
  B.push(box(9, 3, 68, 10, 12, 74, 'rock', 'wall'));
  B.push(box(7, 3, 74, 10, 12, 76, 'rock', 'wall'));
  B.push(box(5, 3, 68, 10, 12, 68.5, 'rock', 'wall'));
  l.gates.push({ id: 'c4_curtain', box: box(5, 3, 69, 5.3, 7, 73.5, 'water'), opensWhen: { law: 'dash' } });
  l.readables.push({ id: 'c4_letter', x: 8, y: 3, z: 71, script: 'c4_letter', label: '油紙の包みを開く' });
  l.pickups.push({ id: 'c4_zs', x: 7.5, y: 3.6, z: 72.5, value: 10 });
  B.push(box(-7, 0, 74, 7, 16, 76, 'rock', 'wall'));
  stairsZ(B, 0, 3, 68, 3, 8, 0.25, 0.5, 'stair');
  l.exit = { box: box(-1.5, 4, 71.5, 1.5, 8, 72), to: 'finale' };
  P.push({ kind: 'waterfall', x: 0, y: -1.6, z: 73.6, scale: 1 });

  // 飾り（水車と落石は仕掛けから描く）
  P.push({ kind: 'lantern', x: -3.6, y: 0, z: 4 });
  P.push({ kind: 'lantern', x: 3.6, y: 0, z: 27 });
  P.push({ kind: 'lantern', x: -3.6, y: 3, z: 61 });
  P.push({ kind: 'cedar', x: -4, y: 3, z: 50, scale: 1.1 });
  P.push({ kind: 'jizo', x: -3.8, y: 0, z: 1, yaw: Math.PI / 2 });
  P.push({ kind: 'stele', x: 3.8, y: 0, z: 6.5, yaw: -Math.PI / 2 });
  l.readables.push({ id: 'c4_stele', x: 3.8, y: 0, z: 6.5, script: 'c4_stele', label: '石碑を読む' });

  // 妖：水子提灯
  l.enemies.push({ id: 'c4_m1', type: 'menyo', x: 0, y: 0, z: 32, yaw: Math.PI });
  l.enemies.push({ id: 'c4_z1', type: 'mizuko', x: -2.5, y: 3, z: 52, yaw: Math.PI });
  l.enemies.push({ id: 'c4_z2', type: 'mizuko', x: 2.2, y: 3, z: 54.5, yaw: Math.PI });
  l.enemies.push({ id: 'c4_z3', type: 'mizuko', x: 0, y: 3, z: 59.5, yaw: Math.PI });

  // 銭
  l.pickups.push({ id: 'c4_z1', x: -3, y: 0.6, z: 6, value: 4 });
  l.pickups.push({ id: 'c4_z2', x: 3, y: 0.6, z: 15, value: 6 });
  l.pickups.push({ id: 'c4_z3', x: -3, y: 0.6, z: 21, value: 6 });
  l.pickups.push({ id: 'c4_z4', x: 0, y: 2.6, z: 41, value: 6 });
  l.pickups.push({ id: 'c4_z5', x: -3, y: 3.6, z: 56, value: 6 });

  // 時間制限：おこんの話の後、止まりかけた滝が戻りはじめる。坂を登りきって滝見台へ 30 秒（緩の理なら刻限も半分の速さ）
  l.timers = [
    {
      id: 'c4_flood',
      label: '滝が戻る前に、滝見台へ',
      startFlag: 'trig:c4_contract',
      startBox: box(-5, -1, 30, 5, 4, 34),
      goal: box(-5, 2.5, 46.5, 5, 7, 62),
      duration: 30,
      slowedBy: 'dash',
      failText: '濁流に、呑まれた。',
    },
  ];
  l.spawn = { x: 0, y: 0, z: -1, yaw: 0 };
  l.establish = { from: [-3.5, 3.5, 2], to: [0, 2.6, 18] };

  l.triggers.push({ id: 'c4_intro', box: box(-5, -1, -6, 5, 3, 2), script: 'c4_intro' });
  l.triggers.push({ id: 'c4_wheels', box: box(-5, -1, 6.5, 5, 3, 8.5), script: 'c4_wheels' });
  l.triggers.push({ id: 'c4_contract', box: box(-5, -1, 27.6, 5, 3, 29.5), script: 'c4_contract' });
  l.triggers.push({ id: 'c4_rocks', box: box(-5, -1, 31.5, 5, 3, 34), script: 'c4_rocks' });
  l.triggers.push({ id: 'c4_mizuko', box: box(-5, 2, 46, 5, 6, 48.5), script: 'c4_mizuko' });
  l.triggers.push({ id: 'c4_end', box: box(-1.5, 2, 63, 1.5, 6, 66), script: 'c4_end' });

  l.hints.push({ box: box(-5, -1, 6.5, 5, 3, 26), text: '羽根が真下に来たとき、道が払われる　駆（無敵）で抜けるか、駆を質に入れて時を緩める', unlessFlag: 'law:dash' });
  l.hints.push({ box: box(-5, -1, 31.5, 5, 6, 46), text: '落ちてくる石は、先に影が地面に広がる' });

  l.goals.push({ unlessFlag: 'trig:c4_contract', text: '水車の道を抜ける' });
  l.goals.push({ unlessFlag: 'trig:c4_mizuko', text: '落石の坂を登る' });
  l.goals.push({ text: '滝の上、山頂への石段へ' });

  l.route = [
    { x: 0, y: 0, z: 1.2, act: 'shop', pawn: ['dash'] },
    { x: 0, y: 0, z: 7.5 },
    { x: 0, y: 0, z: 9, act: 'wait', wait: 0 },
    { x: 0, y: 0, z: 27.8 },
    { x: 0, y: 0, z: 33, act: 'fight' },
    { x: 0, y: 3, z: 47 },
    { x: 0, y: 3, z: 54, act: 'fight' },
    { x: 0, y: 3, z: 64 },
    { x: 0, y: 5, z: 71.8, r: 0.4 },
  ];
  return l;
}
