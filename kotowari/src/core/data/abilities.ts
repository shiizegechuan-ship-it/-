/** 舞の型（能力）と、質入れしたときに働く理（ルール）。価格はここだけで決める。 */
export type AbilityId = 'jump' | 'fan' | 'lantern' | 'dash';

export interface AbilityDef {
  id: AbilityId;
  name: string; // 型の名
  reading: string;
  verb: string; // 操作の説明
  key: string; // 操作キーの表示
  price: number; // 質入れ値（銭）
  law: {
    name: string;
    desc: string;
    gain: string; // 理の利点
    loss: string; // 代償
  };
  glyph: string; // 紋の 1 文字（色だけに頼らない表示）
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  jump: {
    id: 'jump',
    name: '跳',
    reading: 'はね',
    verb: '跳ぶ',
    key: 'Space',
    price: 30,
    glyph: '跳',
    law: {
      name: '浮石の理',
      desc: '円紋の石が宙に浮き、重い妖も浮かぶ。',
      gain: '跳べない谷を、浮いた石で渡れる',
      loss: '跳べない。柵や段を越えられない',
    },
  },
  fan: {
    id: 'fan',
    name: '払',
    reading: 'はらい',
    verb: '扇で払う',
    key: 'J / 左クリック',
    price: 40,
    glyph: '払',
    law: {
      name: '風の理',
      desc: '風が吹き続け、人も妖も押し流す。風車の門が回る。',
      gain: '鎧面を谷へ吹き落とせる。風車門が開く',
      loss: '扇で払えない。足元が流される',
    },
  },
  lantern: {
    id: 'lantern',
    name: '灯',
    reading: 'ともし',
    verb: '灯をともす',
    key: 'L / F',
    price: 50,
    glyph: '灯',
    law: {
      name: '影の理',
      desc: '地の影が固まって踏めるようになり、影法師が形を持つ。',
      gain: '影の橋を渡れる。影法師に扇が届く',
      loss: '幽かな橋が見えない。影法師を退けられない',
    },
  },
  dash: {
    id: 'dash',
    name: '駆',
    reading: 'かけ',
    verb: '駆け抜ける',
    key: 'K / Shift',
    price: 60,
    glyph: '駆',
    law: {
      name: '緩の理',
      desc: '鈴のほかの時が、半分の速さになる。',
      gain: '速い仕掛けや妖の動きが遅くなる',
      loss: '駆け抜け（無敵の回避）ができない',
    },
  },
};

export const ABILITY_ORDER: AbilityId[] = ['jump', 'fan', 'lantern', 'dash'];

/** 朝の請け出し値。4 つの型の質入れ値の合計と同じ（伏線 F6「値は嘘をつかない」） */
export const DAWN_PRICE = ABILITY_ORDER.reduce((s, id) => s + ABILITIES[id].price, 0);
