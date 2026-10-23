import { box, emptyLevel, stairsZ, torii } from './build';
import type { LevelDef } from './types';

/** 序章「神楽殿」：4 つの型を一通り使い、鐘が鳴っても明けない夜に気づく。 */
export function prologue(): LevelDef {
  const l = emptyLevel('prologue');
  l.title = '序　神楽殿';
  l.subtitle = '明けの鐘が鳴る夜';
  l.theme = 'festival';
  l.killY = -2.5;
  const B = l.boxes;
  const P = l.props;

  // 神楽殿の舞台（板張り・高さ 1）
  B.push(box(-5, -1, -3, 5, 1, 5, 'wood'));
  stairsZ(B, 0, 3, 5, 1, 4, -0.25, 0.5, 'woodstair');
  P.push({ kind: 'kaguraden', x: 0, y: 1, z: 1 });
  P.push({ kind: 'taiko', x: -2.6, y: 1, z: -1.2, yaw: 0.5 });
  // 広場（南）と、溝の向こう（北）
  B.push(box(-12, -1, -8, 12, 0, 18, 'gravel'));
  B.push(box(-12, -1, 25, 12, 0, 46, 'gravel'));
  // 溝（底は水）
  B.push(box(-12, -4, 18, 12, -3, 25, 'water', 'hazard'));
  // 周りの塀（瓦の笠つき）
  B.push(box(-13, 0, -8, -12, 3, 46, 'plaster', 'wall'));
  B.push(box(12, 0, -8, 13, 3, 46, 'plaster', 'wall'));
  B.push(box(-13, 0, -9, 13, 3, -8, 'plaster', 'wall'));
  B.push(box(-13.3, 3, -9.3, -11.7, 3.35, 46, 'roof', 'wall'));
  B.push(box(11.7, 3, -9.3, 13.3, 3.35, 46, 'roof', 'wall'));
  B.push(box(-11.7, 3, -9.3, 11.7, 3.35, -7.7, 'roof', 'wall'));
  // 跳の稽古：低い竹垣
  B.push(box(-12, 0, 14, 12, 0.85, 14.3, 'fence', 'fence'));
  // 灯の稽古：幽かな橋
  l.ghosts.push(box(-1, -0.2, 17.9, 1, 0, 25.1, 'ghost'));
  // 鳥居（おこん）
  torii(B, P, 0, 0, 40, 0, 1.15, 1);
  l.shrines.push({ id: 'pro_torii', x: 0, y: 0, z: 40, yaw: 0, name: '神楽殿の鳥居', shop: true });
  // 石段の入口（北の塀の切れ目）
  B.push(box(-13, 0, 46, -3, 4, 47, 'rock', 'wall'));
  B.push(box(3, 0, 46, 13, 4, 47, 'rock', 'wall'));
  B.push(box(-3, -1, 46, 3, 0, 52, 'stair'));
  l.exit = { box: box(-3, -1, 47.5, 3, 4, 52), to: 'ch1' };
  // おこんと話すまでは石段の木戸が閉じている
  l.gates.push({ id: 'pro_gate', box: box(-3, 0, 46, 3, 3.2, 46.6, 'gate'), opensWhen: { flag: 'trig:pro_okon' } });

  // 灯籠・屋台・提灯（飾り）
  for (const z of [8, 16, 28, 36]) {
    P.push({ kind: 'lantern', x: -10, y: 0, z });
    P.push({ kind: 'lantern', x: 10, y: 0, z });
  }
  P.push({ kind: 'stall', x: -8.5, y: 0, z: 4, yaw: Math.PI / 2 });
  P.push({ kind: 'stall', x: 8.5, y: 0, z: 7, yaw: -Math.PI / 2, variant: 1 });
  P.push({ kind: 'stall', x: -8.5, y: 0, z: 31, yaw: Math.PI / 2, variant: 2 });
  P.push({ kind: 'chochinLine', x: 0, y: 3.4, z: 9 });
  P.push({ kind: 'chochinLine', x: 0, y: 3.4, z: 30 });
  P.push({ kind: 'bell', x: 9, y: 0, z: 27 });
  P.push({ kind: 'cedar', x: -10.5, y: 0, z: 43, scale: 1.3 });
  P.push({ kind: 'cedar', x: 10.5, y: 0, z: 43, scale: 1.2 });
  P.push({ kind: 'stele', x: 3.4, y: 0, z: 7.6, yaw: -0.4 });
  P.push({ kind: 'fan', x: 0.6, y: 0, z: 33.2 });

  l.readables.push({ id: 'pro_stele', x: 3.4, y: 0, z: 7.6, script: 'pro_stele', label: '古い碑を読む' });

  // 稽古の的（紙の面）
  l.enemies.push({ id: 'pro_k1', type: 'kamimen', x: -3, y: 0, z: 10.5 });
  l.enemies.push({ id: 'pro_k2', type: 'kamimen', x: 0, y: 0, z: 11.5 });
  l.enemies.push({ id: 'pro_k3', type: 'kamimen', x: 3, y: 0, z: 10.5 });
  // 鐘の後に現れる面の妖
  l.enemies.push({ id: 'pro_m1', type: 'menyo', x: 0, y: 0, z: 33, yaw: Math.PI, needFlag: 'trig:pro_bell' });

  l.pickups.push({ id: 'pro_z1', x: -6, y: 0.6, z: 2, value: 2 });
  l.pickups.push({ id: 'pro_z2', x: 7, y: 0.6, z: 16, value: 2 });
  l.pickups.push({ id: 'pro_z3', x: -7, y: 0.6, z: 29, value: 3 });

  l.spawn = { x: 0, y: 1, z: 1.5, yaw: 0 };
  l.establish = { from: [9, 3.4, 15], to: [0, 2.6, 1] };

  l.triggers.push({ id: 'pro_intro', box: box(-5, 0, -3, 5, 3, 5), script: 'pro_intro' });
  l.triggers.push({ id: 'pro_ditch', box: box(-12, -1, 16, 12, 3, 18), script: 'pro_ditch' });
  l.triggers.push({ id: 'pro_bell', box: box(-12, -1, 25.5, 12, 3, 28), script: 'pro_bell' });
  l.triggers.push({ id: 'pro_fan', box: box(-12, -1, 31, 12, 3, 35), script: 'pro_fan', needFlag: 'down:pro_m1' });
  l.triggers.push({ id: 'pro_okon', box: box(-12, -1, 35, 12, 3, 38), script: 'pro_okon', needFlag: 'trig:pro_fan' });

  l.hints.push({ box: box(-5, 0, -3, 5, 3, 7.5), text: 'WASD：歩く　Q / R・マウス：見回す' });
  l.hints.push({ box: box(-12, -1, 7.5, 12, 3, 13.5), text: 'J・左クリック：扇で払う（3 段まで続く）', unlessFlag: 'down:pro_k2' });
  l.hints.push({ box: box(-12, -1, 12, 12, 3, 14.2), text: 'Space：跳ぶ（長押しで高く）' });
  l.hints.push({ box: box(-12, -1, 14.3, 12, 3, 18), text: 'L・F：灯をともす　灯の輪の中にだけ、幽かな橋が現れる' });
  l.hints.push({
    box: box(-12, -1, 28, 12, 3, 35),
    text: 'K・Shift：駆け抜ける（無敵）　光った妖の一撃の直前なら「見切り」',
    unlessFlag: 'down:pro_m1',
  });

  l.goals.push({ unlessFlag: 'trig:pro_ditch', text: '神楽殿を下りて、ばあちゃんを探す' });
  l.goals.push({ unlessFlag: 'trig:pro_bell', text: '溝の向こう、鐘の方へ' });
  l.goals.push({ unlessFlag: 'down:pro_m1', text: '面の妖を鎮める' });
  l.goals.push({ unlessFlag: 'trig:pro_okon', text: '鳥居の方へ' });
  l.goals.push({ text: '鳥居をくぐり、石段を登る' });

  l.route = [
    { x: 0, y: 0, z: 8 },
    { x: 0, y: 0, z: 10, act: 'fight' },
    { x: 0, y: 0, z: 13 },
    { x: 0, y: 0, z: 15.5, act: 'jump' },
    { x: 0, y: 0, z: 17.2, act: 'lantern' },
    { x: 0, y: 0, z: 26 },
    { x: 0, y: 0, z: 30, act: 'fight' },
    { x: 0, y: 0, z: 37 },
    { x: 0, y: 0, z: 49 },
  ];
  return l;
}
