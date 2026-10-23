/** 会話の台本。説明は物（碑・質帳・立て札）に任せ、人物ごとに語り口を変える（STORY_BIBLE.md 6 章）。 */
export type Speaker = 'suzu' | 'okon' | 'chizuru' | 'yasuke' | 'note' | 'mask';

export const SPEAKER_NAME: Record<Speaker, string> = {
  suzu: '鈴',
  okon: 'おこん',
  chizuru: '千鶴',
  yasuke: '弥助',
  note: '',
  mask: '面',
};

export interface Line {
  who: Speaker;
  text: string;
}

export type ScriptFx = 'dollyOkon' | 'dollyFloat' | 'sortLedger' | 'bell' | 'none';

export interface Script {
  lines: Line[];
  /** 会話の始まりに起こす演出 */
  fx?: ScriptFx;
  /** 終わったら立てる旗 */
  setFlags?: string[];
  /** 重要な場面（文字送りを遅く、間を取る） */
  weighty?: boolean;
}

const s = (who: Speaker, text: string): Line => ({ who, text });

export const SCRIPTS: Record<string, Script> = {
  // ───────── 序章
  pro_intro: {
    lines: [
      s('suzu', '……よし。三つ目の拍、今度は遅れなかった。'),
      s('suzu', 'ばあちゃん、見てた？　——ばあちゃん？'),
      s('suzu', '灯籠しか点いてない。祭りの夜なのに、誰の声もしない。'),
    ],
  },
  pro_stele: {
    lines: [
      s('note', '苔むした古い碑。「理替えの暁、舞手を山に納めよ。さすれば世は新たに巡る」'),
      s('note', '続きがあるらしいが、足元は苔に埋もれて読めない。'),
      s('suzu', '舞手……今年の舞手は私だ。納めるって、奉納の舞のこと？'),
    ],
  },
  pro_ditch: {
    lines: [
      s('suzu', '橋がない……。ここ、昼間は板が渡してあったのに。'),
      s('suzu', '「迷ったら足元を見な」——ばあちゃんなら、そう言う。'),
    ],
  },
  pro_bell: {
    fx: 'bell',
    weighty: true,
    lines: [
      s('note', '——ごぉん。山の上で、明けの鐘が鳴った。'),
      s('suzu', '明けの鐘……？　空、ちっとも白まない。'),
      s('suzu', '鐘が鳴ったら朝が来る。毎年、毎朝、そうだったのに。'),
    ],
  },
  pro_fan: {
    lines: [
      s('suzu', 'これ……ばあちゃんの扇。どうしてこんな所に。'),
      s('suzu', '山の方を向いて落ちてる。ばあちゃん、上の神楽殿にいるの？'),
    ],
  },
  pro_okon: {
    fx: 'dollyOkon',
    weighty: true,
    lines: [
      s('okon', 'おや、おや。こんな夜更けに舞の装束とは。山へお登りで？'),
      s('suzu', '狐が……しゃべった。'),
      s('okon', '狐ではございません。質屋でございます。神さまと人のあいだで、質をお預かりする商い。'),
      s('okon', 'そのお舞、いい値がつきますよ。お預かりしたお品は、請け出されるまで世のものになる。それが質の決まり。'),
      s('suzu', '売らないよ。ばあちゃんに習った舞だもの。'),
      s('okon', 'ええ、ええ。今はそれで結構。値は嘘をつきませんからね。——山の上で、また。'),
    ],
  },

  // ───────── 一の章
  c1_intro: {
    lines: [
      s('suzu', '千段石段。ばあちゃんと毎朝のぼった道だ。'),
      s('suzu', '面の妖が、まだ上にもいる。……あの面、祭りの夜店で売ってたのと同じ柄。'),
    ],
  },
  c1_mask: {
    lines: [
      s('note', '割れた面の裏に、墨で名が書いてある。「おたけ」'),
      s('suzu', '豆腐屋のおたけさんと、同じ名前……？　まさかね。'),
    ],
  },
  c1_gap: {
    lines: [
      s('suzu', '橋が……落ちてる。跳んでも、とても届かない。'),
      s('suzu', '谷の底に、丸い紋の彫られた石が沈んでる。'),
    ],
  },
  c1_sign: {
    lines: [s('note', '立て札。「この先、谷。橋は秋の大水で流る。渡りたき者は質屋に相談のこと」'), s('suzu', '質屋に、相談……。')],
  },
  c1_jizo: {
    lines: [s('note', '赤い前掛けのお地蔵さま。前掛けには「鈴」と小さく縫い取りがある。'), s('suzu', '私の名前……。ばあちゃんが縫ったのかな。')],
  },
  okon_first_shop: {
    fx: 'dollyOkon',
    lines: [
      s('okon', 'お困りのようで。谷の底をご覧なさい。円紋の石が眠っておりましょう。'),
      s('okon', 'お嬢さんの「跳」をお預かりすれば、その軽さは石に移ります。石が跳ねる——浮くのでございます。'),
      s('suzu', '跳べなくなるの？'),
      s('okon', 'お預かりの間は。請け出しはいつでも。お代は、少しばかり高くつきますがね。'),
      s('suzu', '……少しばかり、ね。'),
    ],
  },
  c1_firstpawn: {
    fx: 'dollyFloat',
    weighty: true,
    lines: [s('suzu', '足が、重い。地面に縫い止められたみたい。'), s('suzu', '——石が、浮いてく！'), s('okon', '軽さは、世に移りました。それが浮石の理でございます。')],
  },
  c1_cross: {
    lines: [s('suzu', '石坊主まで、ぷかぷか浮いてる。'), s('suzu', '私の軽さ、本当に世界のほうに移ったんだ。')],
  },
  c1_fence: {
    lines: [
      s('suzu', '柵……。跳べれば、ひと息で越えられるのに。'),
      s('suzu', '西の崖沿いにも道がある。浮いた石が続いてるみたい。'),
    ],
  },
  c1_ledger: {
    fx: 'sortLedger',
    weighty: true,
    lines: [
      s('okon', 'ここまでお登りとは。お嬢さんには、ひとつ帳面をお見せしましょう。'),
      s('note', '質帳。「朝　一つ。質入人　千鶴。請人　——」請人の名は、狐の指で隠されている。'),
      s('suzu', '千鶴……ばあちゃんの名前！　朝を、質に？'),
      s('suzu', '請人のところ、なんて書いてあるの。見せて。'),
      s('okon', '請人様でなければ、お見せできません。それが質の決まりでございます。'),
      s('suzu', 'ばあちゃんが朝を売った……。だから夜が明けないんだ。'),
      s('suzu', '上へ行く。ばあちゃんに会って、確かめる。'),
    ],
    setFlags: ['c1_ledger_read'],
  },
};
